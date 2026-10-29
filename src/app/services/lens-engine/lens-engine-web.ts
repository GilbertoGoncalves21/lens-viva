import { PermissionState, WebPlugin } from '@capacitor/core';
import {
    AnalysisRateOptions
,   BrowserAiAvailability
,   BrowserAiGlobal
,   BrowserLanguageDetectionResult
,   BrowserLanguageDetector
,   BrowserLanguageDetectorFactory
,   BrowserTranslator
,   BrowserTranslatorFactory
,   CameraDevice
,   CameraListResponse
,   CameraPermissionStatus
,   DownloadedModelsOptions
,   DownloadedModelsResponse
,   DownloadModelOptions
,   EngineCapabilities
,   EngineErrorEvent
,   EngineStatusCode
,   EngineStatusEvent
,   FrameMetadata
,   IdentifyLanguageOptions
,   IdentifyLanguageResponse
,   LanguagePair
,   LensEnginePlugin
,   PixelRect
,   RecognitionEvent
,   RecognizedBlock
,   RecognizedLine
,   SelectCameraOptions
,   StartCameraOptions
,   TranslateOptions
,   TranslateResponse
} from 'src/app/shared/models';
import {
    BUILT_IN_MODEL_LANGUAGE
,   DEFAULT_ANALYSES_PER_SECOND
,   EMPTY
,   GeometryUtils
,   LanguageUtils
,   MAX_ANALYSES_PER_SECOND
,   MIN_ANALYSES_PER_SECOND
,   TESSERACT_LANGUAGE_CODES
,   TRANSLATION_LANGUAGES
,   UNDETERMINED_LANGUAGE
,   WEB_ENGINE_CONFIG
} from 'src/app/shared/utils';
import { LensEngineErrorCode, LensEngineWebError } from './lens-engine-error';
import { OcrBlock, OcrBoundingBox, OcrLine, OcrPage, OcrParagraph, OcrWorker, TesseractModule, TesseractOcrWorker } from './tesseract-ocr-worker';

export type WebCameraStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

export type WebMediaDevices = Pick<MediaDevices, 'enumerateDevices' | 'getUserMedia'>;

export interface LensEngineWebDependencies {
    browserAi: BrowserAiGlobal;
    createOcrWorker: (languages: string) => Promise<OcrWorker>;
    document: Document;
    mediaDevices: WebMediaDevices | null;
    now: () => number;
    permissions: Pick<Permissions, 'query'> | null;
    prefersRearCamera: () => boolean;
    storage: WebCameraStorage | null;
    window: EventTarget;
}

interface AvailabilityEntry {
    availability: Promise<BrowserAiAvailability>;
    expiresAt: number;
}

interface CameraSession {
    abortController: AbortController;
    analysisCanvas: HTMLCanvasElement | null;
    analysisRunning: boolean;
    analysisTimer: ReturnType<typeof setTimeout> | null;
    blackFrameSamples: number;
    blackFramesReported: boolean;
    cameraErrorReported: boolean;
    frameCheckCanvas: HTMLCanvasElement | null;
    frameCheckTimer: ReturnType<typeof setTimeout> | null;
    freezeCanvas: HTMLCanvasElement | null;
    freezeGeneration: number;
    frozen: boolean;
    frozenRecognitionPending: boolean;
    lastAnalysisStartedAt: number;
    ocrFailureReported: boolean;
    paused: boolean;
    ready: boolean;
    starting: Promise<void>;
    stream: MediaStream | null;
    streamListeners: AbortController;
    video: HTMLVideoElement | null;
}

interface CapturedFrame {
    canvas: HTMLCanvasElement;
    frame: FrameMetadata;
}

interface FrameLuminance {
    deviation: number;
    mean: number;
}

interface PendingStream {
    expiryTimer: ReturnType<typeof setTimeout>;
    stream: MediaStream;
}

const ACTIVATION_EVENTS: string[] = ['keydown', 'pointerup'];

const AVAILABILITY_CACHE_MILLISECONDS: number = 5000;

const AVAILABILITY_CONCURRENCY: number = 4;

const BLACK_FRAME_MAX_DEVIATION: number = 2;

const BLACK_FRAME_MAX_LUMINANCE: number = 8;

const BLACK_FRAME_SAMPLES_REQUIRED: number = 3;

const CAMERA_ENDED_MESSAGE: string = 'The camera stream ended';

const CAMERA_IDEAL_HEIGHT: number = 960;

const CAMERA_IDEAL_WIDTH: number = 1280;

const CAMERA_REOPEN_FAILED_MESSAGE: string = 'The camera could not be reopened';

const CAMERA_STORAGE_KEY: string = 'lens-viva.web-camera';

const COARSE_POINTER_QUERY: string = '(pointer: coarse)';

const DEVICE_LOST_ERROR_NAMES: string[] = ['NotFoundError', 'OverconstrainedError'];

const ENDED_TRACK_STATE: MediaStreamTrackState = 'ended';

const FRAME_CHECK_CONTEXT_SETTINGS: CanvasRenderingContext2DSettings = { willReadFrequently: true };

const FRAME_CHECK_HEIGHT: number = 24;

const FRAME_CHECK_INTERVAL_MILLISECONDS: number = 1000;

const FRAME_CHECK_WIDTH: number = 32;

const FRAME_TIMESTAMP_STEP: number = 0.001;

const HAVE_CURRENT_DATA: number = 2;

const HIDDEN_PAGE_SELECTOR: string = '.ion-page-hidden';

const ID_SELECTOR_SPECIAL_CHARACTERS: RegExp = /["\\]/g;

const LANGUAGE_DETECTOR_RETRY_MILLISECONDS: number = 10000;

const LANGUAGE_PAIR_SEPARATOR: string = '>';

const LINE_SEPARATOR: string = '\n';

const LUMINANCE_BLUE_WEIGHT: number = 0.114;

const LUMINANCE_GREEN_WEIGHT: number = 0.587;

const LUMINANCE_RED_WEIGHT: number = 0.299;

const MILLISECONDS_PER_SECOND: number = 1000;

const NOT_ALLOWED_ERROR: string = 'NotAllowedError';

const OCR_BASE_LANGUAGE: string = TESSERACT_LANGUAGE_CODES[BUILT_IN_MODEL_LANGUAGE];

const OCR_CONFIDENCE_SCALE: number = 100;

const OCR_LANGUAGE_SEPARATOR: string = '+';

const PERMISSION_ERROR_NAMES: string[] = [NOT_ALLOWED_ERROR, 'SecurityError'];

const PERMISSION_STREAM_HOLD_MILLISECONDS: number = 15000;

const PIXEL_STRIDE: number = 4;

const REAR_FACING_MODE: string = 'environment';

const VIDEO_INPUT_KIND: MediaDeviceKind = 'videoinput';

function createDefaultDependencies(): LensEngineWebDependencies {
    return {
        browserAi: globalThis as unknown as BrowserAiGlobal,
        createOcrWorker: (languages: string): Promise<OcrWorker> =>
            import('tesseract.js').then((tesseract: TesseractModule) => TesseractOcrWorker.create(tesseract, languages)),
        document: document,
        mediaDevices: navigator.mediaDevices ?? null,
        now: (): number => performance.now(),
        permissions: navigator.permissions ?? null,
        prefersRearCamera: hasCoarsePointer,
        storage: defaultStorage(),
        window: window,
    };
}

function defaultStorage(): WebCameraStorage | null {
    try {
        return window.localStorage ?? null;
    } catch {
        return null;
    }
}

function hasCoarsePointer(): boolean {
    try {
        return typeof window.matchMedia === 'function' && window.matchMedia(COARSE_POINTER_QUERY).matches;
    } catch {
        return false;
    }
}

export class LensEngineWeb extends WebPlugin implements LensEnginePlugin {
    private _activationWatcher: AbortController | null = null;
    private _analysesPerSecond: number = DEFAULT_ANALYSES_PER_SECOND;
    private _cameraSwitch: Promise<void> = Promise.resolve();
    private _dependencies: LensEngineWebDependencies;
    private _languageDetector: Promise<BrowserLanguageDetector | null> | null = null;
    private _languageDetectorRetryAt: number = Number.NEGATIVE_INFINITY;
    private _lastFrameTimestamp: number = Number.NEGATIVE_INFINITY;
    private _ocrBlocked: boolean = false;
    private _ocrGeneration: number = 0;
    private _ocrLanguages: string = OCR_BASE_LANGUAGE;
    private _ocrWorker: Promise<OcrWorker> | null = null;
    private _ocrWorkerLanguages: string = EMPTY;
    private _ocrWorkerReady: boolean = false;
    private _pendingStream: PendingStream | null = null;
    private _session: CameraSession | null = null;
    private _translationAvailability: Map<string, AvailabilityEntry> = new Map<string, AvailabilityEntry>();
    private _translators: Map<string, Promise<BrowserTranslator>> = new Map<string, Promise<BrowserTranslator>>();

    constructor(dependencies: Partial<LensEngineWebDependencies> = {}) {
        super();
        this._dependencies = { ...createDefaultDependencies(), ...dependencies };
        this._dependencies.window.addEventListener('pagehide', (): void => {
            this.releasePendingStream();
            this.terminateOcrWorker();
        });
        this._dependencies.window.addEventListener('online', (): void => {
            this._ocrBlocked = false;
        });
    }

    async checkPermissions(): Promise<CameraPermissionStatus> {
        return { camera: await this.queryCameraPermission() };
    }

    async deleteModel(): Promise<void> {
        throw new LensEngineWebError(LensEngineErrorCode.MODEL_DELETE_UNSUPPORTED, 'Translation models are managed by the browser');
    }

    async downloadModel(options: DownloadModelOptions): Promise<void> {
        const factory: BrowserTranslatorFactory = this.translatorFactory();
        const pair: LanguagePair | null = this.modelPair(options.language, options.targetLanguage);

        if (!pair) {
            return;
        }

        this._translationAvailability.delete(this.pairKey(pair));

        const availability: BrowserAiAvailability = await this.translationAvailability(factory, pair);

        if (availability === 'available') {
            return;
        }

        if (availability === 'unavailable') {
            throw new LensEngineWebError(LensEngineErrorCode.UNSUPPORTED_LANGUAGE, 'The browser cannot translate this language pair');
        }

        let translator: BrowserTranslator;

        try {
            translator = await factory.create({ sourceLanguage: pair.sourceLanguage, targetLanguage: pair.targetLanguage });
        } catch (error: unknown) {
            throw this.errorName(error) === NOT_ALLOWED_ERROR
                ? new LensEngineWebError(LensEngineErrorCode.USER_ACTIVATION_REQUIRED, 'Downloading a translation model requires a user action')
                : new LensEngineWebError(LensEngineErrorCode.MODEL_DOWNLOAD_FAILED, 'The translation model could not be downloaded');
        } finally {
            this._translationAvailability.clear();
        }

        this.cacheTranslator(pair, translator);
    }

    async freezeFrame(): Promise<void> {
        await this._cameraSwitch;

        const session: CameraSession | null = this._session;
        const video: HTMLVideoElement | null = session?.video ?? null;

        if (!session || !session.ready || !video) {
            throw new LensEngineWebError(LensEngineErrorCode.CAMERA_NOT_STARTED, 'The camera is not running');
        }

        if (session.frozen) {
            return;
        }

        const freezeCanvas: HTMLCanvasElement = this.createFreezeCanvas(video);

        video.after(freezeCanvas);
        video.pause();
        session.freezeCanvas = freezeCanvas;
        session.freezeGeneration++;
        session.frozen = true;
        session.frozenRecognitionPending = true;
        this.scheduleAnalysis(session, 0);
    }

    async getCapabilities(): Promise<EngineCapabilities> {
        const browserAi: BrowserAiGlobal = this._dependencies.browserAi;

        return {
            cameraSelection: this.canEnumerateCameras(this._dependencies.mediaDevices),
            languageIdentification: Boolean(browserAi.LanguageDetector),
            modelRemoval: false,
            openAppSettings: false,
            translation: Boolean(browserAi.Translator),
        };
    }

    async getDownloadedModels(options: DownloadedModelsOptions): Promise<DownloadedModelsResponse> {
        const factory: BrowserTranslatorFactory | undefined = this._dependencies.browserAi.Translator;

        if (!factory) {
            return { languages: [] };
        }

        const availabilities: BrowserAiAvailability[] = await this.mapWithConcurrency(
            TRANSLATION_LANGUAGES,
            (language: string): Promise<BrowserAiAvailability> => {
                const pair: LanguagePair | null = this.modelPair(language, options.targetLanguage);

                return pair ? this.translationAvailability(factory, pair) : Promise.resolve<BrowserAiAvailability>('available');
            },
        );

        return { languages: TRANSLATION_LANGUAGES.filter((language: string, index: number) => availabilities[index] === 'available') };
    }

    async identifyLanguage(options: IdentifyLanguageOptions): Promise<IdentifyLanguageResponse> {
        const detector: BrowserLanguageDetector | null = await this.languageDetector(false);

        if (!detector) {
            return { confidence: 0, language: UNDETERMINED_LANGUAGE };
        }

        let results: BrowserLanguageDetectionResult[];

        try {
            results = await detector.detect(options.text);
        } catch {
            this._languageDetector = null;
            throw new LensEngineWebError(LensEngineErrorCode.LANGUAGE_IDENTIFICATION_FAILED, 'The language could not be identified');
        }

        const best: BrowserLanguageDetectionResult | null = results.reduce(
            (current: BrowserLanguageDetectionResult | null, result: BrowserLanguageDetectionResult) =>
                current === null || result.confidence > current.confidence ? result : current,
            null,
        );

        return best ? { confidence: best.confidence, language: best.detectedLanguage } : { confidence: 0, language: UNDETERMINED_LANGUAGE };
    }

    async listCameras(): Promise<CameraListResponse> {
        const cameras: MediaDeviceInfo[] = (await this.videoInputs()).filter((camera: MediaDeviceInfo) => camera.deviceId !== EMPTY);
        const activeCameraId: string | null = this.trackCameraId(this._session?.stream ?? null) ?? this.readRememberedCameraId();

        return {
            cameras: cameras.map((camera: MediaDeviceInfo): CameraDevice => ({
                active: camera.deviceId === activeCameraId,
                cameraId: camera.deviceId,
                label: camera.label.trim(),
            })),
        };
    }

    async openAppSettings(): Promise<void> {
        throw new LensEngineWebError(LensEngineErrorCode.SETTINGS_UNAVAILABLE, 'Site permissions are managed by the browser');
    }

    async pauseAnalysis(): Promise<void> {
        if (this._session) {
            this._session.paused = true;
        }
    }

    async requestPermissions(): Promise<CameraPermissionStatus> {
        const mediaDevices: WebMediaDevices | null = this._dependencies.mediaDevices;

        if (!this.canOpenCamera(mediaDevices) || this._session || this._pendingStream) {
            return { camera: 'granted' };
        }

        try {
            this.holdPendingStream(await this.openStartupStream(mediaDevices));

            return { camera: 'granted' };
        } catch (error: unknown) {
            const errorName: string = this.errorName(error);

            if (!PERMISSION_ERROR_NAMES.includes(errorName)) {
                return { camera: 'granted' };
            }

            const permission: PermissionState = await this.queryCameraPermission();

            if (this.isSystemCameraBlock(errorName, permission)) {
                return { camera: 'granted' };
            }

            return { camera: permission === 'prompt' ? 'prompt' : 'denied' };
        }
    }

    async resumeAnalysis(): Promise<void> {
        const session: CameraSession | null = this._session;

        if (!session) {
            return;
        }

        session.paused = false;

        if (session.ready && !session.frozen && session.video) {
            this.playVideo(session.video);
        }

        this.scheduleAnalysis(session, this.nextAnalysisDelay(session));
    }

    selectCamera(options: SelectCameraOptions): Promise<void> {
        const switching: Promise<void> = this._cameraSwitch.then((): Promise<void> => this.switchCamera(options.cameraId));

        this._cameraSwitch = switching.catch((): void => undefined);

        return switching;
    }

    async setAnalysisRate(options: AnalysisRateOptions): Promise<void> {
        this._analysesPerSecond = this.normalizeRate(options.analysesPerSecond);

        if (this._session) {
            this.scheduleAnalysis(this._session, this.nextAnalysisDelay(this._session));
        }
    }

    setPreviewViewport(): Promise<void> {
        return Promise.resolve();
    }

    async startCamera(options: StartCameraOptions): Promise<void> {
        const host: HTMLElement = this.previewHost(options.previewHostId);

        this._analysesPerSecond = this.normalizeRate(options.analysesPerSecond);
        this._ocrLanguages = this.toOcrLanguages(options.recognitionLanguages);

        const session: CameraSession = this._session ?? this.openSession(host);

        await session.starting;

        if (this._session !== session) {
            return;
        }

        this.attachPreview(session, host);
        this.scheduleAnalysis(session, this.nextAnalysisDelay(session));
        this.scheduleFrameCheck(session);
        this.announceRecognitionStatus();
    }

    async stopCamera(): Promise<void> {
        const session: CameraSession | null = this._session;

        this._session = null;
        this._ocrBlocked = false;
        this.releasePendingStream();

        if (session) {
            this.releaseSession(session);
        }
    }

    async translate(options: TranslateOptions): Promise<TranslateResponse> {
        if (options.sourceLanguage === options.targetLanguage) {
            return { translatedText: options.text };
        }

        const factory: BrowserTranslatorFactory = this.translatorFactory();
        const pair: LanguagePair = { sourceLanguage: options.sourceLanguage, targetLanguage: options.targetLanguage };
        const creating: Promise<BrowserTranslator> = this.translatorFor(factory, pair);
        const translator: BrowserTranslator = await creating;

        try {
            return { translatedText: await translator.translate(options.text) };
        } catch {
            this.discardTranslator(pair, creating, translator);
            throw new LensEngineWebError(LensEngineErrorCode.TRANSLATION_FAILED, 'The translation failed');
        }
    }

    async unfreezeFrame(): Promise<void> {
        const session: CameraSession | null = this._session;

        if (!session || !session.frozen) {
            return;
        }

        session.freezeCanvas?.remove();
        session.freezeCanvas = null;
        session.freezeGeneration++;
        session.frozen = false;
        session.frozenRecognitionPending = false;

        if (session.video) {
            this.playVideo(session.video);
        }

        this.scheduleAnalysis(session, this.nextAnalysisDelay(session));
    }

    private analysisInterval(): number {
        return MILLISECONDS_PER_SECOND / Math.min(this._analysesPerSecond, WEB_ENGINE_CONFIG.maxAnalysesPerSecond);
    }

    private async analyze(session: CameraSession): Promise<boolean> {
        if (!this.canAnalyze(session)) {
            return false;
        }

        const worker: OcrWorker | null = await this.readyOcrWorker(session);

        if (!worker || !this.canAnalyze(session)) {
            return false;
        }

        const freezeGeneration: number = session.freezeGeneration;
        const ocrGeneration: number = this._ocrGeneration;
        let event: RecognitionEvent | null = null;

        session.frozenRecognitionPending = false;
        session.lastAnalysisStartedAt = this._dependencies.now();

        try {
            const captured: CapturedFrame = this.captureFrame(session);
            const page: OcrPage = await worker.recognize(captured.canvas);

            event = { blocks: this.toRecognizedBlocks(page), frame: captured.frame };
        } catch {
            if (ocrGeneration === this._ocrGeneration) {
                this.reportOcrFailure(session);
            }
        }

        if (event && this._session === session && session.freezeGeneration === freezeGeneration && !session.paused) {
            session.ocrFailureReported = false;
            this.notifyListeners('textRecognized', event);
        }

        return true;
    }

    private announceRecognitionStatus(): void {
        if (!this._ocrWorker || this._ocrWorkerLanguages !== this._ocrLanguages) {
            return;
        }

        this.notifyStatus(this._ocrWorkerReady ? EngineStatusCode.RECOGNITION_READY : EngineStatusCode.RECOGNITION_LOADING);
    }

    private applyLayerStyle(element: HTMLElement): void {
        element.setAttribute('aria-hidden', 'true');
        element.style.display = 'block';
        element.style.height = '100%';
        element.style.left = '0';
        element.style.objectFit = 'cover';
        element.style.pointerEvents = 'none';
        element.style.position = 'absolute';
        element.style.top = '0';
        element.style.width = '100%';
    }

    private attachPreview(session: CameraSession, host: HTMLElement): void {
        const video: HTMLVideoElement | null = session.video;

        if (!video) {
            return;
        }

        if (video.parentNode !== host) {
            host.insertBefore(video, host.firstChild);

            if (!session.frozen) {
                this.playVideo(video);
            }
        }

        if (session.freezeCanvas && session.freezeCanvas.previousSibling !== video) {
            video.after(session.freezeCanvas);
        }
    }

    private attachStream(session: CameraSession, stream: MediaStream, video: HTMLVideoElement): void {
        const streamListeners: AbortController = new AbortController();

        session.streamListeners.abort();
        session.streamListeners = streamListeners;
        session.stream = stream;
        stream.getTracks().forEach((track: MediaStreamTrack) =>
            track.addEventListener('ended', (): void => this.reportCameraError(session, CAMERA_ENDED_MESSAGE), { signal: streamListeners.signal }),
        );
        video.srcObject = stream;
    }

    private awaitUserActivation(): void {
        if (this._activationWatcher) {
            return;
        }

        const watcher: AbortController = new AbortController();
        const activate: () => void = (): void => {
            watcher.abort();
            this._activationWatcher = null;
            void this.languageDetector(true);
        };

        ACTIVATION_EVENTS.forEach((eventName: string) =>
            this._dependencies.window.addEventListener(eventName, activate, { capture: true, signal: watcher.signal }),
        );
        this._activationWatcher = watcher;
    }

    private cacheTranslator(pair: LanguagePair, translator: BrowserTranslator): void {
        const key: string = this.pairKey(pair);

        if (this._translators.has(key)) {
            this.destroyTranslator(translator);
            return;
        }

        this._translators.set(key, Promise.resolve(translator));
    }

    private cameraConstraints(cameraId: string | null): MediaStreamConstraints {
        const video: MediaTrackConstraints = { height: { ideal: CAMERA_IDEAL_HEIGHT }, width: { ideal: CAMERA_IDEAL_WIDTH } };

        if (cameraId !== null) {
            video.deviceId = { exact: cameraId };
        } else if (this._dependencies.prefersRearCamera()) {
            video.facingMode = { ideal: REAR_FACING_MODE };
        }

        return { audio: false, video: video };
    }

    private async cameraOpenError(error: unknown): Promise<LensEngineWebError> {
        const errorName: string = this.errorName(error);

        if (!PERMISSION_ERROR_NAMES.includes(errorName)) {
            return new LensEngineWebError(LensEngineErrorCode.CAMERA_UNAVAILABLE, 'The camera could not be opened');
        }

        return this.isSystemCameraBlock(errorName, await this.queryCameraPermission())
            ? new LensEngineWebError(LensEngineErrorCode.CAMERA_BLOCKED_BY_SYSTEM, 'Camera access is blocked by the operating system')
            : new LensEngineWebError(LensEngineErrorCode.PERMISSION_DENIED, 'Camera access was denied');
    }

    private canAnalyze(session: CameraSession): boolean {
        if (this._session !== session || !session.ready || session.paused || this._dependencies.document.visibilityState === 'hidden') {
            return false;
        }

        if (session.frozen) {
            const freezeCanvas: HTMLCanvasElement | null = session.freezeCanvas;

            return session.frozenRecognitionPending && freezeCanvas !== null && freezeCanvas.width > 0 && freezeCanvas.height > 0;
        }

        const video: HTMLVideoElement | null = session.video;

        return video !== null && video.readyState >= HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0;
    }

    private canEnumerateCameras(mediaDevices: WebMediaDevices | null): mediaDevices is WebMediaDevices {
        return mediaDevices !== null && typeof mediaDevices.enumerateDevices === 'function';
    }

    private canOpenCamera(mediaDevices: WebMediaDevices | null): mediaDevices is WebMediaDevices {
        return mediaDevices !== null && typeof mediaDevices.getUserMedia === 'function';
    }

    private canSampleFrame(session: CameraSession): boolean {
        const video: HTMLVideoElement | null = session.video;

        return this._session === session
            && session.ready
            && !session.paused
            && !session.frozen
            && this._dependencies.document.visibilityState !== 'hidden'
            && video !== null
            && video.readyState >= HAVE_CURRENT_DATA
            && video.videoWidth > 0
            && video.videoHeight > 0;
    }

    private captureFrame(session: CameraSession): CapturedFrame {
        const video: HTMLVideoElement | null = session.video;
        const freezeCanvas: HTMLCanvasElement | null = session.frozen ? session.freezeCanvas : null;

        if (!video) {
            throw new LensEngineWebError(LensEngineErrorCode.OCR_FAILED, 'No camera frame is available');
        }

        const sourceWidth: number = freezeCanvas ? freezeCanvas.width : video.videoWidth;
        const sourceHeight: number = freezeCanvas ? freezeCanvas.height : video.videoHeight;
        const scale: number = Math.min(1, WEB_ENGINE_CONFIG.maxFrameDimension / Math.max(sourceWidth, sourceHeight));
        const canvas: HTMLCanvasElement = session.analysisCanvas ?? this._dependencies.document.createElement('canvas');

        session.analysisCanvas = canvas;
        canvas.width = Math.max(1, Math.round(sourceWidth * scale));
        canvas.height = Math.max(1, Math.round(sourceHeight * scale));

        const context: CanvasRenderingContext2D | null = canvas.getContext('2d');

        if (!context) {
            throw new LensEngineWebError(LensEngineErrorCode.OCR_FAILED, 'The camera frame could not be captured');
        }

        context.drawImage(freezeCanvas ?? video, 0, 0, canvas.width, canvas.height);

        return {
            canvas: canvas,
            frame: {
                frameTimestamp: this.nextFrameTimestamp(),
                frozen: freezeCanvas !== null,
                imageHeight: canvas.height,
                imageWidth: canvas.width,
                mirrored: false,
                rotationDegrees: 0,
                viewHeight: video.clientHeight,
                viewWidth: video.clientWidth,
            },
        };
    }

    private checkFrame(session: CameraSession): void {
        if (!this.canSampleFrame(session)) {
            return;
        }

        const luminance: FrameLuminance | null = this.measureLuminance(session);

        if (!luminance) {
            return;
        }

        if (luminance.mean < BLACK_FRAME_MAX_LUMINANCE && luminance.deviation < BLACK_FRAME_MAX_DEVIATION) {
            session.blackFrameSamples++;

            if (session.blackFrameSamples === BLACK_FRAME_SAMPLES_REQUIRED) {
                session.blackFramesReported = true;
                this.notifyStatus(EngineStatusCode.CAMERA_BLACK_FRAMES);
            }

            return;
        }

        session.blackFrameSamples = 0;

        if (session.blackFramesReported) {
            session.blackFramesReported = false;
            this.notifyStatus(EngineStatusCode.CAMERA_FRAMES_RECOVERED);
        }
    }

    private createFrameCheckCanvas(): HTMLCanvasElement {
        const canvas: HTMLCanvasElement = this._dependencies.document.createElement('canvas');

        canvas.width = FRAME_CHECK_WIDTH;
        canvas.height = FRAME_CHECK_HEIGHT;

        return canvas;
    }

    private createFreezeCanvas(video: HTMLVideoElement): HTMLCanvasElement {
        const canvas: HTMLCanvasElement = this._dependencies.document.createElement('canvas');

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
        this.applyLayerStyle(canvas);

        return canvas;
    }

    private async createLanguageDetector(factory: BrowserLanguageDetectorFactory): Promise<BrowserLanguageDetector | null> {
        let availability: BrowserAiAvailability;

        try {
            availability = await factory.availability();
        } catch {
            return null;
        }

        if (availability === 'unavailable') {
            return null;
        }

        try {
            return await factory.create();
        } catch (error: unknown) {
            if (this.errorName(error) === NOT_ALLOWED_ERROR) {
                this.awaitUserActivation();
            }

            return null;
        }
    }

    private createPreviewVideo(): HTMLVideoElement {
        const video: HTMLVideoElement = this._dependencies.document.createElement('video');

        video.autoplay = true;
        video.disablePictureInPicture = true;
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('autoplay', EMPTY);
        video.setAttribute('disablepictureinpicture', EMPTY);
        video.setAttribute('muted', EMPTY);
        video.setAttribute('playsinline', EMPTY);
        this.applyLayerStyle(video);

        return video;
    }

    private async createTranslator(factory: BrowserTranslatorFactory, pair: LanguagePair): Promise<BrowserTranslator> {
        const availability: BrowserAiAvailability = await this.translationAvailability(factory, pair);

        if (availability === 'unavailable') {
            throw new LensEngineWebError(LensEngineErrorCode.UNSUPPORTED_LANGUAGE, 'The browser cannot translate this language pair');
        }

        if (availability !== 'available') {
            throw new LensEngineWebError(LensEngineErrorCode.MODEL_MISSING, 'The translation model is not downloaded');
        }

        try {
            return await factory.create({ sourceLanguage: pair.sourceLanguage, targetLanguage: pair.targetLanguage });
        } catch {
            throw new LensEngineWebError(LensEngineErrorCode.TRANSLATION_FAILED, 'The translator could not be started');
        }
    }

    private destroyTranslator(translator: BrowserTranslator): void {
        try {
            translator.destroy();
        } catch {
            return;
        }
    }

    private discardTranslator(pair: LanguagePair, creating: Promise<BrowserTranslator>, translator: BrowserTranslator): void {
        const key: string = this.pairKey(pair);

        if (this._translators.get(key) === creating) {
            this._translators.delete(key);
        }

        this.destroyTranslator(translator);
    }

    private errorName(error: unknown): string {
        if (typeof error !== 'object' || error === null || !('name' in error)) {
            return EMPTY;
        }

        const name: unknown = (error as { name: unknown }).name;

        return typeof name === 'string' ? name : EMPTY;
    }

    private forgetCameraId(): void {
        try {
            this._dependencies.storage?.removeItem(CAMERA_STORAGE_KEY);
        } catch {
            return;
        }
    }

    private holdPendingStream(stream: MediaStream): void {
        this.releasePendingStream();
        this._pendingStream = {
            expiryTimer: setTimeout((): void => this.releasePendingStream(), PERMISSION_STREAM_HOLD_MILLISECONDS),
            stream: stream,
        };
    }

    private async identifiedCameraIds(): Promise<string[]> {
        return (await this.videoInputs()).map((camera: MediaDeviceInfo) => camera.deviceId).filter((cameraId: string) => cameraId !== EMPTY);
    }

    private idSelector(elementId: string): string {
        return `[id="${elementId.replace(ID_SELECTOR_SPECIAL_CHARACTERS, '\\$&')}"]`;
    }

    private isSystemCameraBlock(errorName: string, permission: PermissionState): boolean {
        return errorName === NOT_ALLOWED_ERROR && permission === 'granted';
    }

    private languageDetector(retryNow: boolean): Promise<BrowserLanguageDetector | null> {
        const factory: BrowserLanguageDetectorFactory | undefined = this._dependencies.browserAi.LanguageDetector;

        if (!factory) {
            return Promise.resolve(null);
        }

        if (this._languageDetector) {
            return this._languageDetector;
        }

        if (!retryNow && this._dependencies.now() < this._languageDetectorRetryAt) {
            return Promise.resolve(null);
        }

        const creating: Promise<BrowserLanguageDetector | null> = this.createLanguageDetector(factory);

        this._languageDetector = creating;
        creating.then((detector: BrowserLanguageDetector | null): void => {
            if (!detector && this._languageDetector === creating) {
                this._languageDetector = null;
                this._languageDetectorRetryAt = this._dependencies.now() + LANGUAGE_DETECTOR_RETRY_MILLISECONDS;
            }
        });

        return creating;
    }

    private luminanceOf(pixels: Uint8ClampedArray): FrameLuminance | null {
        const pixelCount: number = Math.floor(pixels.length / PIXEL_STRIDE);

        if (pixelCount === 0) {
            return null;
        }

        let sum: number = 0;
        let sumOfSquares: number = 0;

        for (let offset: number = 0; offset < pixelCount * PIXEL_STRIDE; offset += PIXEL_STRIDE) {
            const luminance: number =
                LUMINANCE_RED_WEIGHT * pixels[offset] + LUMINANCE_GREEN_WEIGHT * pixels[offset + 1] + LUMINANCE_BLUE_WEIGHT * pixels[offset + 2];

            sum += luminance;
            sumOfSquares += luminance * luminance;
        }

        const mean: number = sum / pixelCount;

        return { deviation: Math.sqrt(Math.max(0, sumOfSquares / pixelCount - mean * mean)), mean: mean };
    }

    private async mapWithConcurrency<T, R>(items: T[], mapper: (item: T) => Promise<R>): Promise<R[]> {
        const results: R[] = new Array<R>(items.length);
        let nextIndex: number = 0;
        const drain: () => Promise<void> = async (): Promise<void> => {
            while (nextIndex < items.length) {
                const index: number = nextIndex++;

                results[index] = await mapper(items[index]);
            }
        };

        await Promise.all(Array.from({ length: Math.min(AVAILABILITY_CONCURRENCY, items.length) }, drain));

        return results;
    }

    private measureLuminance(session: CameraSession): FrameLuminance | null {
        const video: HTMLVideoElement | null = session.video;

        if (!video) {
            return null;
        }

        const canvas: HTMLCanvasElement = session.frameCheckCanvas ?? this.createFrameCheckCanvas();

        session.frameCheckCanvas = canvas;

        try {
            const context: CanvasRenderingContext2D | null = canvas.getContext('2d', FRAME_CHECK_CONTEXT_SETTINGS);

            if (!context) {
                return null;
            }

            context.drawImage(video, 0, 0, canvas.width, canvas.height);

            return this.luminanceOf(context.getImageData(0, 0, canvas.width, canvas.height).data);
        } catch {
            return null;
        }
    }

    private modelPair(language: string, targetLanguage: string): LanguagePair | null {
        if (language !== targetLanguage) {
            return { sourceLanguage: language, targetLanguage: targetLanguage };
        }

        return targetLanguage === BUILT_IN_MODEL_LANGUAGE ? null : { sourceLanguage: BUILT_IN_MODEL_LANGUAGE, targetLanguage: targetLanguage };
    }

    private nextAnalysisDelay(session: CameraSession): number {
        return Math.max(0, this.analysisInterval() - (this._dependencies.now() - session.lastAnalysisStartedAt));
    }

    private nextFrameTimestamp(): number {
        const now: number = this._dependencies.now();

        this._lastFrameTimestamp = now > this._lastFrameTimestamp ? now : this._lastFrameTimestamp + FRAME_TIMESTAMP_STEP;

        return this._lastFrameTimestamp;
    }

    private normalizeRate(analysesPerSecond: number): number {
        return Number.isFinite(analysesPerSecond)
            ? GeometryUtils.clamp(analysesPerSecond, MIN_ANALYSES_PER_SECOND, MAX_ANALYSES_PER_SECOND)
            : DEFAULT_ANALYSES_PER_SECOND;
    }

    private notifyStatus(code: EngineStatusCode): void {
        const event: EngineStatusEvent = { code: code };

        this.notifyListeners('engineStatus', event);
    }

    private ocrWorkerFor(languages: string): Promise<OcrWorker> {
        const current: Promise<OcrWorker> | null = this._ocrWorker;

        if (current && this._ocrWorkerLanguages === languages) {
            return current;
        }

        const task: Promise<OcrWorker> = current ? this.reinitializeOcrWorker(current, languages) : this._dependencies.createOcrWorker(languages);

        this._ocrWorker = task;
        this._ocrWorkerLanguages = languages;
        this._ocrWorkerReady = false;
        this.notifyStatus(EngineStatusCode.RECOGNITION_LOADING);
        task.then(
            (): void => {
                if (this._ocrWorker === task) {
                    this._ocrWorkerReady = true;
                    this.notifyStatus(EngineStatusCode.RECOGNITION_READY);
                }
            },
            (): void => {
                if (this._ocrWorker === task) {
                    this._ocrWorker = null;
                    this._ocrWorkerLanguages = EMPTY;
                }
            },
        );

        return task;
    }

    private async openCamera(session: CameraSession, host: HTMLElement): Promise<void> {
        try {
            const stream: MediaStream = await this.requestCameraStream();

            if (this._session !== session) {
                this.stopStream(stream);
                return;
            }

            const video: HTMLVideoElement = this.createPreviewVideo();

            session.video = video;
            host.insertBefore(video, host.firstChild);
            this.attachStream(session, stream, video);

            await this.waitForFirstFrame(video, session.abortController.signal);

            if (this._session === session) {
                session.ready = true;
            }
        } catch (error: unknown) {
            if (this._session !== session) {
                return;
            }

            const failedCameraId: string | null = this.trackCameraId(session.stream);

            if (failedCameraId !== null && !session.abortController.signal.aborted && failedCameraId === this.readRememberedCameraId()) {
                this.forgetCameraId();
            }

            this._session = null;
            this.releaseSession(session);
            throw error;
        }
    }

    private openSession(host: HTMLElement): CameraSession {
        const session: CameraSession = {
            abortController: new AbortController(),
            analysisCanvas: null,
            analysisRunning: false,
            analysisTimer: null,
            blackFrameSamples: 0,
            blackFramesReported: false,
            cameraErrorReported: false,
            frameCheckCanvas: null,
            frameCheckTimer: null,
            freezeCanvas: null,
            freezeGeneration: 0,
            frozen: false,
            frozenRecognitionPending: false,
            lastAnalysisStartedAt: Number.NEGATIVE_INFINITY,
            ocrFailureReported: false,
            paused: false,
            ready: false,
            starting: Promise.resolve(),
            stream: null,
            streamListeners: new AbortController(),
            video: null,
        };

        this._session = session;
        session.starting = this.openCamera(session, host);

        return session;
    }

    private async openStartupStream(mediaDevices: WebMediaDevices): Promise<MediaStream> {
        const rememberedCameraId: string | null = await this.startupCameraId();
        const candidates: (string | null)[] = rememberedCameraId === null ? [null] : [rememberedCameraId, null];
        let failure: unknown = null;

        for (let index: number = 0; index < candidates.length; index++) {
            const cameraId: string | null = candidates[index];

            try {
                return await mediaDevices.getUserMedia(this.cameraConstraints(cameraId));
            } catch (error: unknown) {
                const errorName: string = this.errorName(error);

                if (PERMISSION_ERROR_NAMES.includes(errorName)) {
                    throw error;
                }

                if (cameraId !== null && cameraId === rememberedCameraId && DEVICE_LOST_ERROR_NAMES.includes(errorName)) {
                    this.forgetCameraId();
                }

                failure = error;
            }

            if (cameraId === null) {
                const otherCameraIds: string[] = (await this.identifiedCameraIds()).filter((otherCameraId: string) => !candidates.includes(otherCameraId));

                candidates.push(...otherCameraIds);
            }
        }

        throw failure;
    }

    private pairKey(pair: LanguagePair): string {
        return `${pair.sourceLanguage}${LANGUAGE_PAIR_SEPARATOR}${pair.targetLanguage}`;
    }

    private playVideo(video: HTMLVideoElement): void {
        video.play().catch((): void => undefined);
    }

    private previewHost(previewHostId: string): HTMLElement {
        const candidates: HTMLElement[] = Array.from(this._dependencies.document.querySelectorAll<HTMLElement>(this.idSelector(previewHostId)));
        const shownCandidates: HTMLElement[] = candidates.filter(
            (candidate: HTMLElement) => candidate.isConnected && candidate.closest(HIDDEN_PAGE_SELECTOR) === null,
        );
        const host: HTMLElement | undefined =
            shownCandidates.find((candidate: HTMLElement) => candidate.getClientRects().length > 0) ?? shownCandidates.at(-1) ?? candidates.at(-1);

        if (!host) {
            throw new LensEngineWebError(LensEngineErrorCode.CAMERA_UNAVAILABLE, 'The camera preview area is not available');
        }

        return host;
    }

    private async queryCameraPermission(): Promise<PermissionState> {
        const permissions: Pick<Permissions, 'query'> | null = this._dependencies.permissions;

        if (!permissions || typeof permissions.query !== 'function') {
            return 'prompt';
        }

        try {
            const status: PermissionStatus = await permissions.query({ name: 'camera' });

            return status.state === 'granted' || status.state === 'denied' ? status.state : 'prompt';
        } catch {
            return 'prompt';
        }
    }

    private readRememberedCameraId(): string | null {
        try {
            const cameraId: string | null = this._dependencies.storage?.getItem(CAMERA_STORAGE_KEY) ?? null;

            return cameraId !== null && cameraId !== EMPTY ? cameraId : null;
        } catch {
            return null;
        }
    }

    private async readyOcrWorker(session: CameraSession): Promise<OcrWorker | null> {
        if (this._ocrBlocked) {
            return null;
        }

        const generation: number = this._ocrGeneration;

        try {
            const worker: OcrWorker = await this.ocrWorkerFor(this._ocrLanguages);

            return generation === this._ocrGeneration ? worker : null;
        } catch {
            if (generation === this._ocrGeneration && this._session === session) {
                this._ocrBlocked = true;
                session.ocrFailureReported = false;
                this.reportOcrFailure(session);
            }

            return null;
        }
    }

    private async recoverStream(session: CameraSession, cameraId: string | null): Promise<void> {
        try {
            await this.replaceStream(session, cameraId);
        } catch {
            this.reportCameraError(session, CAMERA_REOPEN_FAILED_MESSAGE);
        }
    }

    private async reinitializeOcrWorker(previous: Promise<OcrWorker>, languages: string): Promise<OcrWorker> {
        const worker: OcrWorker | null = await previous.catch((): null => null);

        if (!worker) {
            return this._dependencies.createOcrWorker(languages);
        }

        try {
            await worker.reinitialize(languages);
        } catch (error: unknown) {
            worker.terminate().catch((): void => undefined);
            throw error;
        }

        return worker;
    }

    private releasePendingStream(): void {
        const pending: PendingStream | null = this._pendingStream;

        this._pendingStream = null;

        if (!pending) {
            return;
        }

        clearTimeout(pending.expiryTimer);
        this.stopStream(pending.stream);
    }

    private releaseSession(session: CameraSession): void {
        session.abortController.abort();
        session.streamListeners.abort();
        session.ready = false;

        if (session.analysisTimer !== null) {
            clearTimeout(session.analysisTimer);
            session.analysisTimer = null;
        }

        if (session.frameCheckTimer !== null) {
            clearTimeout(session.frameCheckTimer);
            session.frameCheckTimer = null;
        }

        this.stopStream(session.stream);
        session.stream = null;

        if (session.video) {
            session.video.pause();
            session.video.srcObject = null;
            session.video.remove();
            session.video = null;
        }

        session.freezeCanvas?.remove();
        session.freezeCanvas = null;
    }

    private rememberCameraId(cameraId: string): void {
        try {
            this._dependencies.storage?.setItem(CAMERA_STORAGE_KEY, cameraId);
        } catch {
            return;
        }
    }

    private async replaceStream(session: CameraSession, cameraId: string | null): Promise<void> {
        const mediaDevices: WebMediaDevices | null = this._dependencies.mediaDevices;
        const video: HTMLVideoElement | null = session.video;

        if (!this.canOpenCamera(mediaDevices) || !video) {
            throw new LensEngineWebError(LensEngineErrorCode.CAMERA_UNAVAILABLE, 'Camera access is not available in this browser');
        }

        session.ready = false;
        session.blackFrameSamples = 0;
        session.streamListeners.abort();
        this.stopStream(session.stream);
        session.stream = null;

        const stream: MediaStream = await mediaDevices.getUserMedia(this.cameraConstraints(cameraId));

        if (this._session !== session) {
            this.stopStream(stream);
            return;
        }

        this.attachStream(session, stream, video);
        await this.waitForFirstFrame(video, session.abortController.signal);

        if (this._session !== session) {
            return;
        }

        session.ready = true;

        if (session.frozen) {
            video.pause();
        }

        this.scheduleAnalysis(session, this.nextAnalysisDelay(session));
    }

    private reportCameraError(session: CameraSession, message: string): void {
        if (this._session !== session || session.cameraErrorReported) {
            return;
        }

        const engineError: EngineErrorEvent = { code: LensEngineErrorCode.CAMERA_ERROR, message: message };

        session.cameraErrorReported = true;
        this.notifyListeners('engineError', engineError);
    }

    private reportOcrFailure(session: CameraSession): void {
        if (this._session !== session || session.ocrFailureReported) {
            return;
        }

        const engineError: EngineErrorEvent = { code: LensEngineErrorCode.OCR_FAILED, message: 'Text recognition failed' };

        session.ocrFailureReported = true;
        this.notifyListeners('engineError', engineError);
    }

    private async requestCameraStream(): Promise<MediaStream> {
        const pendingStream: MediaStream | null = this.takePendingStream();

        if (pendingStream) {
            return pendingStream;
        }

        const mediaDevices: WebMediaDevices | null = this._dependencies.mediaDevices;

        if (!this.canOpenCamera(mediaDevices)) {
            throw new LensEngineWebError(LensEngineErrorCode.CAMERA_UNAVAILABLE, 'Camera access is not available in this browser');
        }

        try {
            return await this.openStartupStream(mediaDevices);
        } catch (error: unknown) {
            throw await this.cameraOpenError(error);
        }
    }

    private restoreCameraId(cameraId: string | null): void {
        if (cameraId === null) {
            this.forgetCameraId();
            return;
        }

        this.rememberCameraId(cameraId);
    }

    private async runAnalysisCycle(session: CameraSession): Promise<void> {
        let analyzed: boolean = false;

        session.analysisTimer = null;
        session.analysisRunning = true;

        try {
            analyzed = await this.analyze(session);
        } finally {
            session.analysisRunning = false;
            this.scheduleAnalysis(session, analyzed ? this.nextAnalysisDelay(session) : this.analysisInterval());
        }
    }

    private scheduleAnalysis(session: CameraSession, delayMilliseconds: number): void {
        if (this._session !== session || !session.ready || session.analysisRunning) {
            return;
        }

        if (session.analysisTimer !== null) {
            clearTimeout(session.analysisTimer);
        }

        session.analysisTimer = setTimeout((): void => {
            this.runAnalysisCycle(session).catch((): void => undefined);
        }, delayMilliseconds);
    }

    private scheduleFrameCheck(session: CameraSession): void {
        if (this._session !== session || session.frameCheckTimer !== null) {
            return;
        }

        session.frameCheckTimer = setTimeout((): void => {
            session.frameCheckTimer = null;
            this.checkFrame(session);
            this.scheduleFrameCheck(session);
        }, FRAME_CHECK_INTERVAL_MILLISECONDS);
    }

    private async startupCameraId(): Promise<string | null> {
        const rememberedCameraId: string | null = this.readRememberedCameraId();

        if (rememberedCameraId === null) {
            return null;
        }

        const identifiedCameraIds: string[] = await this.identifiedCameraIds();

        return identifiedCameraIds.length === 0 || identifiedCameraIds.includes(rememberedCameraId) ? rememberedCameraId : null;
    }

    private stopStream(stream: MediaStream | null): void {
        stream?.getTracks().forEach((track: MediaStreamTrack) => track.stop());
    }

    private async switchCamera(cameraId: string): Promise<void> {
        const previousCameraId: string | null = this.readRememberedCameraId();
        const session: CameraSession | null = this._session;

        this.rememberCameraId(cameraId);

        if (!session) {
            return;
        }

        await session.starting.catch((): void => undefined);

        const activeCameraId: string | null = this.trackCameraId(session.stream);

        if (this._session !== session || !session.ready || activeCameraId === cameraId) {
            return;
        }

        try {
            await this.replaceStream(session, cameraId);
        } catch {
            this.restoreCameraId(previousCameraId);

            if (this._session !== session) {
                return;
            }

            await this.recoverStream(session, activeCameraId);

            throw new LensEngineWebError(LensEngineErrorCode.CAMERA_UNAVAILABLE, 'The selected camera could not be opened');
        }

        if (this._session !== session) {
            this.restoreCameraId(previousCameraId);
        }
    }

    private takePendingStream(): MediaStream | null {
        const pending: PendingStream | null = this._pendingStream;

        if (!pending) {
            return null;
        }

        clearTimeout(pending.expiryTimer);
        this._pendingStream = null;

        const tracks: MediaStreamTrack[] = pending.stream.getTracks();

        if (tracks.length > 0 && tracks.every((track: MediaStreamTrack) => track.readyState !== ENDED_TRACK_STATE)) {
            return pending.stream;
        }

        this.stopStream(pending.stream);

        return null;
    }

    private terminateOcrWorker(): void {
        const current: Promise<OcrWorker> | null = this._ocrWorker;

        this._ocrWorker = null;
        this._ocrWorkerLanguages = EMPTY;
        this._ocrWorkerReady = false;
        this._ocrGeneration++;

        current?.then((worker: OcrWorker) => worker.terminate()).catch((): void => undefined);
    }

    private toOcrLanguages(recognitionLanguages: string[]): string {
        const codes: string[] = recognitionLanguages
            .map((language: string) => LanguageUtils.primarySubtag(language))
            .filter((language: string) => Object.hasOwn(TESSERACT_LANGUAGE_CODES, language))
            .map((language: string) => TESSERACT_LANGUAGE_CODES[language]);

        return [...new Set<string>([OCR_BASE_LANGUAGE, ...codes])].join(OCR_LANGUAGE_SEPARATOR);
    }

    private toPixelRect(boundingBox: OcrBoundingBox): PixelRect {
        return { bottom: boundingBox.y1, left: boundingBox.x0, right: boundingBox.x1, top: boundingBox.y0 };
    }

    private toRecognizedBlock(block: OcrBlock): RecognizedBlock | null {
        const lines: RecognizedLine[] = block.paragraphs
            .flatMap((paragraph: OcrParagraph) => paragraph.lines)
            .filter((line: OcrLine) => line.text.trim() !== EMPTY && line.confidence / OCR_CONFIDENCE_SCALE >= WEB_ENGINE_CONFIG.minRecognitionConfidence)
            .map((line: OcrLine) => this.toRecognizedLine(line));

        if (lines.length === 0) {
            return null;
        }

        const boundingBox: PixelRect = this.unionOf(lines.map((line: RecognizedLine) => line.boundingBox));

        return {
            boundingBox: boundingBox,
            lines: lines,
            orientedHeight: boundingBox.bottom - boundingBox.top,
            orientedWidth: boundingBox.right - boundingBox.left,
            recognizedLanguage: null,
            text: lines.map((line: RecognizedLine) => line.text).join(LINE_SEPARATOR),
        };
    }

    private toRecognizedBlocks(page: OcrPage): RecognizedBlock[] {
        return (page.blocks ?? [])
            .map((block: OcrBlock) => this.toRecognizedBlock(block))
            .filter((block: RecognizedBlock | null): block is RecognizedBlock => block !== null);
    }

    private toRecognizedLine(line: OcrLine): RecognizedLine {
        const boundingBox: PixelRect = this.toPixelRect(line.bbox);

        return {
            angle: 0,
            boundingBox: boundingBox,
            confidence: GeometryUtils.clamp(line.confidence / OCR_CONFIDENCE_SCALE, 0, 1),
            orientedHeight: boundingBox.bottom - boundingBox.top,
            orientedWidth: boundingBox.right - boundingBox.left,
            recognizedLanguage: null,
            text: line.text.trim(),
        };
    }

    private trackCameraId(stream: MediaStream | null): string | null {
        if (!stream) {
            return null;
        }

        const cameraId: string | undefined = stream
            .getTracks()
            .map((track: MediaStreamTrack): string | undefined => (typeof track.getSettings === 'function' ? track.getSettings().deviceId : undefined))
            .find((deviceId: string | undefined): boolean => typeof deviceId === 'string' && deviceId !== EMPTY);

        return cameraId ?? null;
    }

    private translationAvailability(factory: BrowserTranslatorFactory, pair: LanguagePair): Promise<BrowserAiAvailability> {
        const key: string = this.pairKey(pair);
        const now: number = this._dependencies.now();
        const cached: AvailabilityEntry | undefined = this._translationAvailability.get(key);

        if (cached && cached.expiresAt > now) {
            return cached.availability;
        }

        const availability: Promise<BrowserAiAvailability> = Promise.resolve()
            .then(() => factory.availability({ sourceLanguage: pair.sourceLanguage, targetLanguage: pair.targetLanguage }))
            .catch((): BrowserAiAvailability => 'unavailable');

        this._translationAvailability.set(key, { availability: availability, expiresAt: now + AVAILABILITY_CACHE_MILLISECONDS });

        return availability;
    }

    private translatorFactory(): BrowserTranslatorFactory {
        const factory: BrowserTranslatorFactory | undefined = this._dependencies.browserAi.Translator;

        if (!factory) {
            throw new LensEngineWebError(LensEngineErrorCode.TRANSLATION_UNSUPPORTED, 'This browser has no on-device translator');
        }

        return factory;
    }

    private translatorFor(factory: BrowserTranslatorFactory, pair: LanguagePair): Promise<BrowserTranslator> {
        const key: string = this.pairKey(pair);
        const cached: Promise<BrowserTranslator> | undefined = this._translators.get(key);

        if (cached) {
            return cached;
        }

        const creating: Promise<BrowserTranslator> = this.createTranslator(factory, pair);

        this._translators.set(key, creating);
        creating.catch((): void => {
            if (this._translators.get(key) === creating) {
                this._translators.delete(key);
            }
        });

        return creating;
    }

    private unionOf(rects: PixelRect[]): PixelRect {
        return {
            bottom: Math.max(...rects.map((rect: PixelRect) => rect.bottom)),
            left: Math.min(...rects.map((rect: PixelRect) => rect.left)),
            right: Math.max(...rects.map((rect: PixelRect) => rect.right)),
            top: Math.min(...rects.map((rect: PixelRect) => rect.top)),
        };
    }

    private async videoInputs(): Promise<MediaDeviceInfo[]> {
        const mediaDevices: WebMediaDevices | null = this._dependencies.mediaDevices;

        if (!this.canEnumerateCameras(mediaDevices)) {
            return [];
        }

        try {
            const devices: MediaDeviceInfo[] = await mediaDevices.enumerateDevices();

            return devices.filter((device: MediaDeviceInfo) => device.kind === VIDEO_INPUT_KIND);
        } catch {
            return [];
        }
    }

    private waitForFirstFrame(video: HTMLVideoElement, signal: AbortSignal): Promise<void> {
        return new Promise<void>((resolve: () => void, reject: (reason: LensEngineWebError) => void): void => {
            const listeners: AbortController = new AbortController();
            const finish: (error: LensEngineWebError | null) => void = (error: LensEngineWebError | null): void => {
                listeners.abort();
                clearTimeout(timeout);

                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            };
            const unavailable: () => void = (): void =>
                finish(new LensEngineWebError(LensEngineErrorCode.CAMERA_UNAVAILABLE, 'The camera did not deliver an image'));
            const checkReady: () => void = (): void => {
                if (video.readyState >= HAVE_CURRENT_DATA) {
                    finish(null);
                }
            };
            const timeout: ReturnType<typeof setTimeout> = setTimeout(unavailable, WEB_ENGINE_CONFIG.cameraReadyTimeoutMilliseconds);

            video.addEventListener('loadeddata', checkReady, { signal: listeners.signal });
            video.addEventListener('error', unavailable, { signal: listeners.signal });
            signal.addEventListener(
                'abort',
                (): void => finish(new LensEngineWebError(LensEngineErrorCode.CAMERA_UNAVAILABLE, 'The camera was stopped')),
                { signal: listeners.signal },
            );
            video.play().catch(unavailable);
            checkReady();
        });
    }
}
