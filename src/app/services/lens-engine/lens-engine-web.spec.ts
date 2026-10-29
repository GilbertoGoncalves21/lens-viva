import type { Mock, MockInstance } from 'vitest';
import {
    BrowserAiAvailability
,   BrowserAiGlobal
,   BrowserLanguageDetectionResult
,   BrowserLanguageDetector
,   BrowserLanguageDetectorFactory
,   BrowserTranslator
,   BrowserTranslatorFactory
,   BrowserTranslatorOptions
,   CameraDevice
,   CameraPermissionStatus
,   EngineCapabilities
,   EngineErrorEvent
,   EngineStatusCode
,   EngineStatusEvent
,   IdentifyLanguageResponse
,   LanguagePair
,   RecognitionEvent
,   RecognizedBlock
,   StartCameraOptions
} from 'src/app/shared/models';
import { CAMERA_PREVIEW_HOST_ID, EMPTY, TRANSLATION_LANGUAGES, WEB_ENGINE_CONFIG } from 'src/app/shared/utils';
import { LensEngineErrorCode, LensEngineWebError } from './lens-engine-error';
import { LensEngineWeb, WebCameraStorage } from './lens-engine-web';
import { OcrBoundingBox, OcrLine, OcrPage, OcrWorker } from './tesseract-ocr-worker';

type GetContextFunction = (contextId: string) => RenderingContext | null;

interface CameraTrackStub extends EventTarget {
    getSettings: () => MediaTrackSettings;
    kind: string;
    readyState: MediaStreamTrackState;
    stop: Mock<() => void>;
}

interface CameraStreamStub {
    stream: MediaStream;
    tracks: CameraTrackStub[];
}

interface CanvasContextStub {
    drawImage: Mock<(image: CanvasImageSource, x: number, y: number, width: number, height: number) => void>;
    getImageData: Mock<(x: number, y: number, width: number, height: number) => ImageData>;
}

interface Deferred<T> {
    promise: Promise<T>;
    reject: (reason: unknown) => void;
    resolve: (value: T) => void;
}

interface LanguageDetectorFactoryStub {
    availability: Mock<() => Promise<BrowserAiAvailability>>;
    create: Mock<() => Promise<BrowserLanguageDetector>>;
}

interface LanguageDetectorStub {
    destroy: Mock<() => void>;
    detect: Mock<(input: string) => Promise<BrowserLanguageDetectionResult[]>>;
}

interface MediaDevicesStub {
    enumerateDevices: Mock<() => Promise<MediaDeviceInfo[]>>;
    getUserMedia: Mock<(constraints: MediaStreamConstraints) => Promise<MediaStream>>;
}

interface OcrWorkerStub {
    recognize: Mock<(image: HTMLCanvasElement) => Promise<OcrPage>>;
    reinitialize: Mock<(languages: string) => Promise<void>>;
    terminate: Mock<() => Promise<void>>;
}

interface PermissionsStub {
    query: Mock<(descriptor: PermissionDescriptor) => Promise<PermissionStatus>>;
}

interface StorageStub {
    getItem: Mock<(key: string) => string | null>;
    removeItem: Mock<(key: string) => void>;
    setItem: Mock<(key: string, value: string) => void>;
}

interface TranslatorFactoryStub {
    availability: Mock<(options: LanguagePair) => Promise<BrowserAiAvailability>>;
    create: Mock<(options: BrowserTranslatorOptions) => Promise<BrowserTranslator>>;
}

interface TranslatorStub {
    destroy: Mock<() => void>;
    translate: Mock<(input: string) => Promise<string>>;
}

const BLACK_PIXELS: Uint8ClampedArray = framePixels((): number => 0);

const BRIGHT_PIXELS: Uint8ClampedArray = framePixels((index: number): number => (index * 37) % 256);

const CAMERA_STATUSES: EngineStatusCode[] = [EngineStatusCode.CAMERA_BLACK_FRAMES, EngineStatusCode.CAMERA_FRAMES_RECOVERED];

const CAMERA_STORAGE_KEY: string = 'lens-viva.web-camera';

const DARK_DETAILED_PIXELS: Uint8ClampedArray = framePixels((index: number): number => (index % 2 === 0 ? 0 : 15));

const DEFAULT_CAMERA_ID: string = 'camera-a';

const DESKTOP_CONSTRAINTS: MediaStreamConstraints = { audio: false, video: { height: { ideal: 960 }, width: { ideal: 1280 } } };

const PERMISSION_STREAM_HOLD_MILLISECONDS: number = 15000;

const REAR_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
    audio: false,
    video: { facingMode: { ideal: 'environment' }, height: { ideal: 960 }, width: { ideal: 1280 } },
};

const RECOGNITION_STATUSES: EngineStatusCode[] = [EngineStatusCode.RECOGNITION_LOADING, EngineStatusCode.RECOGNITION_READY];

const CAMERA_ERRORS: [string, LensEngineErrorCode][] = [
    ['NotAllowedError', LensEngineErrorCode.PERMISSION_DENIED],
    ['SecurityError', LensEngineErrorCode.PERMISSION_DENIED],
    ['NotFoundError', LensEngineErrorCode.CAMERA_UNAVAILABLE],
    ['OverconstrainedError', LensEngineErrorCode.CAMERA_UNAVAILABLE],
    ['NotReadableError', LensEngineErrorCode.CAMERA_UNAVAILABLE],
    ['AbortError', LensEngineErrorCode.CAMERA_UNAVAILABLE],
];

const EMPTY_PAGE: OcrPage = { blocks: [] };

const MISSING_TRANSLATIONS: [BrowserAiAvailability, LensEngineErrorCode][] = [
    ['unavailable', LensEngineErrorCode.UNSUPPORTED_LANGUAGE],
    ['downloadable', LensEngineErrorCode.MODEL_MISSING],
    ['downloading', LensEngineErrorCode.MODEL_MISSING],
];

const NOT_A_LENS_ENGINE_ERROR: string = 'NOT_A_LENS_ENGINE_ERROR';

const PERMISSION_STATES: [PermissionState, PermissionState][] = [
    ['granted', 'granted'],
    ['denied', 'denied'],
    ['prompt', 'prompt'],
];

const RESOLVED: string = 'RESOLVED';

function box(left: number, top: number, right: number, bottom: number): OcrBoundingBox {
    return { x0: left, x1: right, y0: top, y1: bottom };
}

function createDeferred<T>(): Deferred<T> {
    let resolve: (value: T) => void = (): void => undefined;
    let reject: (reason: unknown) => void = (): void => undefined;
    const promise: Promise<T> = new Promise<T>((resolvePromise: (value: T) => void, rejectPromise: (reason: unknown) => void) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return { promise: promise, reject: reject, resolve: resolve };
}

function cameraConstraints(cameraId: string): MediaStreamConstraints {
    return { audio: false, video: { deviceId: { exact: cameraId }, height: { ideal: 960 }, width: { ideal: 1280 } } };
}

function createStream(deviceId: string = DEFAULT_CAMERA_ID): CameraStreamStub {
    const track: CameraTrackStub = Object.assign(new EventTarget(), {
        getSettings: (): MediaTrackSettings => ({ deviceId: deviceId }),
        kind: 'video',
        readyState: 'live' as MediaStreamTrackState,
        stop: vi.fn<() => void>(),
    });
    const tracks: CameraTrackStub[] = [track];
    const stream: MediaStream = { getTracks: (): MediaStreamTrack[] => tracks as unknown as MediaStreamTrack[] } as unknown as MediaStream;

    track.stop.mockImplementation((): void => {
        track.readyState = 'ended';
    });

    return { stream: stream, tracks: tracks };
}

function deviceInfo(deviceId: string, label: string, kind: MediaDeviceKind = 'videoinput'): MediaDeviceInfo {
    return { deviceId: deviceId, groupId: deviceId, kind: kind, label: label, toJSON: (): object => ({}) } as MediaDeviceInfo;
}

function framePixels(luminanceAt: (index: number) => number): Uint8ClampedArray {
    const pixels: Uint8ClampedArray = new Uint8ClampedArray(32 * 24 * 4);

    for (let index: number = 0; index < 32 * 24; index++) {
        const value: number = luminanceAt(index);

        pixels.set([value, value, value, 255], index * 4);
    }

    return pixels;
}

function requestedCameraId(constraints: MediaStreamConstraints): string {
    const video: boolean | MediaTrackConstraints | undefined = constraints.video;
    const deviceId: ConstrainDOMString | undefined = typeof video === 'object' ? video.deviceId : undefined;

    return typeof deviceId === 'object' && !Array.isArray(deviceId) && typeof deviceId.exact === 'string' ? deviceId.exact : DEFAULT_CAMERA_ID;
}

function createTranslatorStub(translatedText: string = 'Sopa do dia'): TranslatorStub {
    return { destroy: vi.fn(), translate: vi.fn(async (): Promise<string> => translatedText) };
}

function domError(name: string): DOMException {
    return new DOMException('failure', name);
}

function line(text: string, confidence: number, boundingBox: OcrBoundingBox): OcrLine {
    return { bbox: boundingBox, confidence: confidence, text: text };
}

function pageWithText(text: string): OcrPage {
    return { blocks: [{ bbox: box(10, 10, 200, 50), paragraphs: [{ lines: [line(text, 90, box(10, 10, 200, 50))] }] }] };
}

function permissionStatus(state: PermissionState): PermissionStatus {
    return { state: state } as PermissionStatus;
}

function defineValue(target: object, property: string, value: unknown): void {
    Object.defineProperty(target, property, { configurable: true, value: value });
}

async function flushPromises(): Promise<void> {
    for (let index: number = 0; index < 50; index++) {
        await Promise.resolve();
    }
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
    try {
        await promise;

        return RESOLVED;
    } catch (error: unknown) {
        return error instanceof LensEngineWebError ? error.code : NOT_A_LENS_ENGINE_ERROR;
    }
}

describe('LensEngineWeb', () => {
    let browserAi: BrowserAiGlobal;
    let contextStub: CanvasContextStub;
    let createOcrWorker: Mock<(languages: string) => Promise<OcrWorker>>;
    let devices: MediaDeviceInfo[];
    let engineErrors: EngineErrorEvent[];
    let engineStatuses: EngineStatusCode[];
    let extraElements: HTMLElement[];
    let getContextSpy: MockInstance<GetContextFunction>;
    let host: HTMLElement;
    let mediaDevicesStub: MediaDevicesStub;
    let ocrWorkerStub: OcrWorkerStub;
    let pauseSpy: MockInstance<() => void>;
    let permissionsStub: PermissionsStub;
    let pixels: Uint8ClampedArray;
    let playSpy: MockInstance<() => Promise<void>>;
    let plugin: LensEngineWeb;
    let rearCameraPreferred: boolean;
    let recognitions: RecognitionEvent[];
    let storageStub: StorageStub;
    let storedValues: Map<string, string>;
    let streams: CameraStreamStub[];
    let windowTarget: EventTarget;

    beforeEach(async () => {
        vi.useFakeTimers();
        streams = [];
        recognitions = [];
        engineErrors = [];
        engineStatuses = [];
        extraElements = [];
        browserAi = {};
        rearCameraPreferred = false;
        pixels = BRIGHT_PIXELS;
        storedValues = new Map<string, string>();
        devices = [deviceInfo('camera-a', 'Integrated Webcam'), deviceInfo('camera-b', EMPTY), deviceInfo('microphone-a', 'Microphone', 'audioinput')];
        windowTarget = new EventTarget();
        host = document.createElement('section');
        host.id = CAMERA_PREVIEW_HOST_ID;
        document.body.appendChild(host);

        contextStub = {
            drawImage: vi.fn(),
            getImageData: vi.fn((): ImageData => ({ data: pixels }) as ImageData),
        };
        getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext') as unknown as MockInstance<GetContextFunction>;
        getContextSpy.mockReturnValue(contextStub as unknown as CanvasRenderingContext2D);
        playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
        pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation((): void => undefined);

        mediaDevicesStub = {
            enumerateDevices: vi.fn(async (): Promise<MediaDeviceInfo[]> => devices),
            getUserMedia: vi.fn(openStream),
        };
        storageStub = {
            getItem: vi.fn((key: string): string | null => storedValues.get(key) ?? null),
            removeItem: vi.fn((key: string): void => {
                storedValues.delete(key);
            }),
            setItem: vi.fn((key: string, value: string): void => {
                storedValues.set(key, value);
            }),
        };
        permissionsStub = { query: vi.fn(async (): Promise<PermissionStatus> => permissionStatus('prompt')) };
        ocrWorkerStub = {
            recognize: vi.fn(async (): Promise<OcrPage> => EMPTY_PAGE),
            reinitialize: vi.fn(async (): Promise<void> => undefined),
            terminate: vi.fn(async (): Promise<void> => undefined),
        };
        createOcrWorker = vi.fn(async (): Promise<OcrWorker> => ocrWorkerStub);

        plugin = new LensEngineWeb({
            browserAi: browserAi,
            createOcrWorker: createOcrWorker,
            document: document,
            mediaDevices: mediaDevicesStub,
            now: (): number => Date.now(),
            permissions: permissionsStub,
            prefersRearCamera: (): boolean => rearCameraPreferred,
            storage: storageStub as WebCameraStorage,
            window: windowTarget,
        });

        await plugin.addListener('textRecognized', (event: RecognitionEvent) => recognitions.push(event));
        await plugin.addListener('engineError', (event: EngineErrorEvent) => engineErrors.push(event));
        await plugin.addListener('engineStatus', (event: EngineStatusEvent) => engineStatuses.push(event.code));
    });

    afterEach(async () => {
        await plugin.stopCamera();
        await plugin.removeAllListeners();
        host.remove();
        extraElements.forEach((element: HTMLElement) => element.remove());
        Reflect.deleteProperty(document, 'visibilityState');
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    function cameraOptions(overrides: Partial<StartCameraOptions> = {}): StartCameraOptions {
        return { analysesPerSecond: 3, previewHostId: CAMERA_PREVIEW_HOST_ID, recognitionLanguages: ['pt'], viewport: null, ...overrides };
    }

    function cameraStatuses(): EngineStatusCode[] {
        return engineStatuses.filter((code: EngineStatusCode) => CAMERA_STATUSES.includes(code));
    }

    function createPreviewHost(hiddenPage: boolean): HTMLElement {
        const page: HTMLElement = document.createElement('section');
        const previewHost: HTMLElement = document.createElement('section');

        page.classList.add('ion-page');
        page.classList.toggle('ion-page-hidden', hiddenPage);
        previewHost.id = CAMERA_PREVIEW_HOST_ID;
        page.appendChild(previewHost);
        extraElements.push(page);

        return previewHost;
    }

    function markVisible(element: HTMLElement): void {
        vi.spyOn(element, 'getClientRects').mockReturnValue([{ height: 500, width: 400, x: 0, y: 0 }] as unknown as DOMRectList);
    }

    async function openStream(constraints: MediaStreamConstraints): Promise<MediaStream> {
        const created: CameraStreamStub = createStream(requestedCameraId(constraints));

        streams.push(created);

        return created.stream;
    }

    function recognitionStatuses(): EngineStatusCode[] {
        return engineStatuses.filter((code: EngineStatusCode) => RECOGNITION_STATUSES.includes(code));
    }

    async function startCameraIn(target: HTMLElement): Promise<HTMLVideoElement> {
        const starting: Promise<void> = plugin.startCamera(cameraOptions());

        await flushPromises();

        const video: HTMLVideoElement = previewVideo(target);

        makeVideoReady(video);
        await starting;

        return video;
    }

    function makeVideoReady(video: HTMLVideoElement, width: number = 1600, height: number = 1200): void {
        defineValue(video, 'readyState', 2);
        defineValue(video, 'videoWidth', width);
        defineValue(video, 'videoHeight', height);
        defineValue(video, 'clientWidth', 400);
        defineValue(video, 'clientHeight', 500);
        video.dispatchEvent(new Event('loadeddata'));
    }

    function previewVideo(target: HTMLElement = host): HTMLVideoElement {
        const video: HTMLVideoElement | null = target.querySelector('video');

        if (!video) {
            throw new Error('The preview video was not created');
        }

        return video;
    }

    async function runTimers(milliseconds: number = 0): Promise<void> {
        await vi.advanceTimersByTimeAsync(milliseconds);
        await flushPromises();
    }

    async function startCamera(options: StartCameraOptions = cameraOptions()): Promise<HTMLVideoElement> {
        const starting: Promise<void> = plugin.startCamera(options);

        await flushPromises();

        const target: HTMLElement | null = document.getElementById(options.previewHostId);
        const video: HTMLVideoElement = previewVideo(target ?? host);

        makeVideoReady(video);
        await starting;

        return video;
    }

    function enableTranslator(availability: (options: LanguagePair) => Promise<BrowserAiAvailability>): TranslatorFactoryStub {
        const factory: TranslatorFactoryStub = {
            availability: vi.fn(availability),
            create: vi.fn(async (): Promise<BrowserTranslator> => createTranslatorStub()),
        };

        browserAi.Translator = factory as unknown as BrowserTranslatorFactory;

        return factory;
    }

    function enableLanguageDetector(availability: BrowserAiAvailability, detector: LanguageDetectorStub): LanguageDetectorFactoryStub {
        const factory: LanguageDetectorFactoryStub = {
            availability: vi.fn(async (): Promise<BrowserAiAvailability> => availability),
            create: vi.fn(async (): Promise<BrowserLanguageDetector> => detector),
        };

        browserAi.LanguageDetector = factory as unknown as BrowserLanguageDetectorFactory;

        return factory;
    }

    function availableOnly(pairs: string[], otherwise: BrowserAiAvailability = 'downloadable'): (options: LanguagePair) => Promise<BrowserAiAvailability> {
        return async (options: LanguagePair): Promise<BrowserAiAvailability> =>
            pairs.includes(`${options.sourceLanguage}>${options.targetLanguage}`) ? 'available' : otherwise;
    }

    describe('camera', () => {
        it('should reject when the preview host is missing without opening the camera', async () => {
            await expect(codeOf(plugin.startCamera(cameraOptions({ previewHostId: 'missing-host' })))).resolves.toBe(LensEngineErrorCode.CAMERA_UNAVAILABLE);

            expect(mediaDevicesStub.getUserMedia).not.toHaveBeenCalled();
        });

        it('should open the default camera of a desktop without a facing mode and without audio', async () => {
            await startCamera();

            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledTimes(1);
            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledWith(DESKTOP_CONSTRAINTS);
        });

        it('should prefer the rear camera on touch devices', async () => {
            rearCameraPreferred = true;

            await startCamera();

            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledWith(REAR_CAMERA_CONSTRAINTS);
        });

        it('should place a muted inline video filling the preview host as its first child', async () => {
            const existingChild: HTMLElement = document.createElement('span');
            host.appendChild(existingChild);

            const video: HTMLVideoElement = await startCamera();

            expect(host.firstElementChild).toBe(video);
            expect(video.muted).toBe(true);
            expect(video.autoplay).toBe(true);
            expect(video.playsInline).toBe(true);
            expect(video.hasAttribute('muted')).toBe(true);
            expect(video.hasAttribute('playsinline')).toBe(true);
            expect(video.getAttribute('aria-hidden')).toBe('true');
            expect(video.style.position).toBe('absolute');
            expect(video.style.top).toBe('0px');
            expect(video.style.left).toBe('0px');
            expect(video.style.width).toBe('100%');
            expect(video.style.height).toBe('100%');
            expect(video.srcObject).toBe(streams[0].stream);
            expect(playSpy).toHaveBeenCalled();
        });

        it('should resolve only once the first frame is decoded', async () => {
            let settled: boolean = false;
            const starting: Promise<void> = plugin.startCamera(cameraOptions()).then((): void => {
                settled = true;
            });

            await flushPromises();

            expect(settled).toBe(false);

            makeVideoReady(previewVideo());
            await starting;

            expect(settled).toBe(true);
        });

        it.each(CAMERA_ERRORS)('should map a %s from the camera to %s', async (errorName: string, code: LensEngineErrorCode) => {
            mediaDevicesStub.getUserMedia.mockRejectedValue(domError(errorName));

            await expect(codeOf(plugin.startCamera(cameraOptions()))).resolves.toBe(code);

            expect(host.querySelector('video')).toBeNull();
        });

        it('should report a camera blocked by the operating system while the site is allowed', async () => {
            mediaDevicesStub.getUserMedia.mockRejectedValue(domError('NotAllowedError'));
            permissionsStub.query.mockResolvedValue(permissionStatus('granted'));

            await expect(codeOf(plugin.startCamera(cameraOptions()))).resolves.toBe(LensEngineErrorCode.CAMERA_BLOCKED_BY_SYSTEM);

            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledTimes(1);
            expect(host.querySelector('video')).toBeNull();
        });

        it('should report a denied camera when the site permission is not granted', async () => {
            mediaDevicesStub.getUserMedia.mockRejectedValue(domError('NotAllowedError'));
            permissionsStub.query.mockResolvedValue(permissionStatus('denied'));

            await expect(codeOf(plugin.startCamera(cameraOptions()))).resolves.toBe(LensEngineErrorCode.PERMISSION_DENIED);
        });

        it('should report a security policy block as a denied camera even while the site is allowed', async () => {
            mediaDevicesStub.getUserMedia.mockRejectedValue(domError('SecurityError'));
            permissionsStub.query.mockResolvedValue(permissionStatus('granted'));

            await expect(codeOf(plugin.startCamera(cameraOptions()))).resolves.toBe(LensEngineErrorCode.PERMISSION_DENIED);
        });

        it('should reject when the browser has no camera access', async () => {
            const withoutCamera: LensEngineWeb = new LensEngineWeb({ createOcrWorker: createOcrWorker, document: document, mediaDevices: null, window: windowTarget });

            await expect(codeOf(withoutCamera.startCamera(cameraOptions()))).resolves.toBe(LensEngineErrorCode.CAMERA_UNAVAILABLE);
        });

        it('should release the camera and reject when no frame arrives in time', async () => {
            const result: Promise<string> = codeOf(plugin.startCamera(cameraOptions()));

            await flushPromises();
            await vi.advanceTimersByTimeAsync(WEB_ENGINE_CONFIG.cameraReadyTimeoutMilliseconds - 1);

            expect(host.querySelector('video')).not.toBeNull();

            await vi.advanceTimersByTimeAsync(1);

            await expect(result).resolves.toBe(LensEngineErrorCode.CAMERA_UNAVAILABLE);
            expect(streams[0].tracks[0].stop).toHaveBeenCalled();
            expect(host.querySelector('video')).toBeNull();
        });

        it('should release the camera and reject when the video cannot play', async () => {
            playSpy.mockRejectedValueOnce(domError('NotAllowedError'));

            await expect(codeOf(plugin.startCamera(cameraOptions()))).resolves.toBe(LensEngineErrorCode.CAMERA_UNAVAILABLE);

            expect(streams[0].tracks[0].stop).toHaveBeenCalled();
            expect(host.querySelector('video')).toBeNull();
        });

        it('should release the camera and reject when the video reports an error', async () => {
            const result: Promise<string> = codeOf(plugin.startCamera(cameraOptions()));

            await flushPromises();
            previewVideo().dispatchEvent(new Event('error'));

            await expect(result).resolves.toBe(LensEngineErrorCode.CAMERA_UNAVAILABLE);
            expect(streams[0].tracks[0].stop).toHaveBeenCalled();
        });

        it('should open the camera only once when started again', async () => {
            const video: HTMLVideoElement = await startCamera();

            await plugin.startCamera(cameraOptions({ analysesPerSecond: 5 }));

            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledTimes(1);
            expect(previewVideo()).toBe(video);
        });

        it('should share one camera opening between concurrent starts', async () => {
            const first: Promise<void> = plugin.startCamera(cameraOptions());
            const second: Promise<void> = plugin.startCamera(cameraOptions());

            await flushPromises();
            makeVideoReady(previewVideo());

            await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledTimes(1);
        });

        it('should move the video into a new preview host on a later start', async () => {
            const video: HTMLVideoElement = await startCamera();
            const newHost: HTMLElement = document.createElement('section');
            newHost.id = 'lens-camera-preview-next';
            document.body.appendChild(newHost);
            host.remove();
            playSpy.mockClear();

            await plugin.startCamera(cameraOptions({ previewHostId: newHost.id }));

            expect(newHost.firstElementChild).toBe(video);
            expect(playSpy).toHaveBeenCalled();
            newHost.remove();
        });

        it('should stop every track and remove the video when stopped', async () => {
            await startCamera();

            await plugin.stopCamera();

            expect(streams[0].tracks[0].stop).toHaveBeenCalledTimes(1);
            expect(host.querySelector('video')).toBeNull();
        });

        it('should stop safely when the camera was never started', async () => {
            await expect(plugin.stopCamera()).resolves.toBeUndefined();
        });

        it('should release a camera granted after the session was stopped', async () => {
            const granting: Deferred<MediaStream> = createDeferred<MediaStream>();
            const lateStream: CameraStreamStub = createStream();
            mediaDevicesStub.getUserMedia.mockReturnValueOnce(granting.promise);

            const starting: Promise<void> = plugin.startCamera(cameraOptions());
            await flushPromises();
            await plugin.stopCamera();
            granting.resolve(lateStream.stream);

            await expect(starting).resolves.toBeUndefined();
            expect(lateStream.tracks[0].stop).toHaveBeenCalled();
            expect(host.querySelector('video')).toBeNull();
        });

        it('should resolve a start that was stopped while waiting for the first frame', async () => {
            const starting: Promise<void> = plugin.startCamera(cameraOptions());

            await flushPromises();
            await plugin.stopCamera();

            await expect(starting).resolves.toBeUndefined();
            expect(streams[0].tracks[0].stop).toHaveBeenCalled();
            expect(host.querySelector('video')).toBeNull();
        });

        it('should report a camera error once when the stream ends', async () => {
            await startCamera();

            streams[0].tracks[0].dispatchEvent(new Event('ended'));
            streams[0].tracks[0].dispatchEvent(new Event('ended'));

            expect(engineErrors).toEqual([{ code: LensEngineErrorCode.CAMERA_ERROR, message: 'The camera stream ended' }]);
        });

        it('should ignore the end of a stream that was already stopped', async () => {
            await startCamera();
            await plugin.stopCamera();

            streams[0].tracks[0].dispatchEvent(new Event('ended'));

            expect(engineErrors).toEqual([]);
        });

        it('should accept the preview viewport without touching the page', async () => {
            await expect(plugin.setPreviewViewport()).resolves.toBeUndefined();

            expect(host.childElementCount).toBe(0);
        });
    });

    describe('permissions', () => {
        it.each(PERMISSION_STATES)('should report a %s camera permission as %s', async (state: PermissionState, expected: PermissionState) => {
            permissionsStub.query.mockResolvedValueOnce(permissionStatus(state));

            const status: CameraPermissionStatus = await plugin.checkPermissions();

            expect(status).toEqual({ camera: expected });
            expect(permissionsStub.query).toHaveBeenCalledWith({ name: 'camera' });
        });

        it('should report prompt when the browser cannot query the camera permission', async () => {
            permissionsStub.query.mockRejectedValueOnce(new TypeError('camera is not a valid permission name'));

            await expect(plugin.checkPermissions()).resolves.toEqual({ camera: 'prompt' });
        });

        it('should report prompt when the browser has no permissions API', async () => {
            const withoutPermissions: LensEngineWeb = new LensEngineWeb({ createOcrWorker: createOcrWorker, permissions: null, window: windowTarget });

            await expect(withoutPermissions.checkPermissions()).resolves.toEqual({ camera: 'prompt' });
        });

        it('should hand the camera granted by the permission request to the next start without opening it again', async () => {
            await expect(plugin.requestPermissions()).resolves.toEqual({ camera: 'granted' });

            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledWith(DESKTOP_CONSTRAINTS);
            expect(streams[0].tracks[0].stop).not.toHaveBeenCalled();

            const video: HTMLVideoElement = await startCamera();
            await runTimers(PERMISSION_STREAM_HOLD_MILLISECONDS);

            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledTimes(1);
            expect(video.srcObject).toBe(streams[0].stream);
            expect(streams[0].tracks[0].stop).not.toHaveBeenCalled();
        });

        it('should release the granted camera when no start follows within fifteen seconds', async () => {
            await plugin.requestPermissions();
            await runTimers(PERMISSION_STREAM_HOLD_MILLISECONDS - 1);

            expect(streams[0].tracks[0].stop).not.toHaveBeenCalled();

            await runTimers(1);

            expect(streams[0].tracks[0].stop).toHaveBeenCalledTimes(1);

            const video: HTMLVideoElement = await startCamera();

            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledTimes(2);
            expect(video.srcObject).toBe(streams[1].stream);
        });

        it('should open the camera again when the granted camera ended before the start', async () => {
            await plugin.requestPermissions();
            streams[0].tracks[0].readyState = 'ended';

            const video: HTMLVideoElement = await startCamera();

            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledTimes(2);
            expect(streams[0].tracks[0].stop).toHaveBeenCalled();
            expect(video.srcObject).toBe(streams[1].stream);
        });

        it('should release the granted camera when the camera is stopped', async () => {
            await plugin.requestPermissions();
            await plugin.stopCamera();

            expect(streams[0].tracks[0].stop).toHaveBeenCalledTimes(1);
        });

        it('should release the granted camera when the page is left for good', async () => {
            await plugin.requestPermissions();
            windowTarget.dispatchEvent(new Event('pagehide'));

            expect(streams[0].tracks[0].stop).toHaveBeenCalledTimes(1);
        });

        it('should not open another camera while one is granted or running', async () => {
            await plugin.requestPermissions();
            await plugin.requestPermissions();

            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledTimes(1);

            await startCamera();
            await expect(plugin.requestPermissions()).resolves.toEqual({ camera: 'granted' });

            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledTimes(1);
        });

        it('should ask for the remembered camera when requesting the permission', async () => {
            storedValues.set(CAMERA_STORAGE_KEY, 'camera-b');

            await plugin.requestPermissions();

            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledWith(cameraConstraints('camera-b'));
        });

        it('should report denied when the user blocked the camera', async () => {
            mediaDevicesStub.getUserMedia.mockRejectedValueOnce(domError('NotAllowedError'));
            permissionsStub.query.mockResolvedValueOnce(permissionStatus('denied'));

            await expect(plugin.requestPermissions()).resolves.toEqual({ camera: 'denied' });
        });

        it('should report prompt when the user dismissed the camera request', async () => {
            mediaDevicesStub.getUserMedia.mockRejectedValueOnce(domError('NotAllowedError'));
            permissionsStub.query.mockResolvedValueOnce(permissionStatus('prompt'));

            await expect(plugin.requestPermissions()).resolves.toEqual({ camera: 'prompt' });
        });

        it('should report denied when the camera is blocked by a security policy', async () => {
            mediaDevicesStub.getUserMedia.mockRejectedValueOnce(domError('SecurityError'));
            permissionsStub.query.mockResolvedValueOnce(permissionStatus('granted'));

            await expect(plugin.requestPermissions()).resolves.toEqual({ camera: 'denied' });
        });

        it('should report granted when the camera fails for a reason other than permission', async () => {
            mediaDevicesStub.getUserMedia.mockRejectedValue(domError('NotFoundError'));

            await expect(plugin.requestPermissions()).resolves.toEqual({ camera: 'granted' });
        });

        it('should report granted when the operating system blocks a camera the site may use so starting reports the block', async () => {
            mediaDevicesStub.getUserMedia.mockRejectedValue(domError('NotAllowedError'));
            permissionsStub.query.mockResolvedValue(permissionStatus('granted'));

            await expect(plugin.requestPermissions()).resolves.toEqual({ camera: 'granted' });
            await expect(codeOf(plugin.startCamera(cameraOptions()))).resolves.toBe(LensEngineErrorCode.CAMERA_BLOCKED_BY_SYSTEM);
        });

        it('should report granted when the browser has no camera access so starting reports it', async () => {
            const withoutCamera: LensEngineWeb = new LensEngineWeb({ createOcrWorker: createOcrWorker, mediaDevices: null, window: windowTarget });

            await expect(withoutCamera.requestPermissions()).resolves.toEqual({ camera: 'granted' });
        });

        it('should refuse to open the app settings', async () => {
            await expect(codeOf(plugin.openAppSettings())).resolves.toBe(LensEngineErrorCode.SETTINGS_UNAVAILABLE);
        });
    });

    describe('text recognition', () => {
        it('should start the camera without waiting for the recognition engine', async () => {
            createOcrWorker.mockReturnValueOnce(createDeferred<OcrWorker>().promise);

            await startCamera();
            await runTimers();

            expect(createOcrWorker).toHaveBeenCalledTimes(1);
            expect(ocrWorkerStub.recognize).not.toHaveBeenCalled();
        });

        it('should load English plus the mapped recognition languages once', async () => {
            await startCamera(cameraOptions({ recognitionLanguages: ['pt', 'es', 'en', 'ja', 'pt'] }));
            await runTimers();

            expect(createOcrWorker).toHaveBeenCalledWith('eng+por+spa+jpn');
        });

        it('should not create the recognition engine before the camera is running', async () => {
            const starting: Promise<void> = plugin.startCamera(cameraOptions());

            await flushPromises();
            await vi.advanceTimersByTimeAsync(1000);

            expect(createOcrWorker).not.toHaveBeenCalled();

            makeVideoReady(previewVideo());
            await starting;
        });

        it('should send a scaled copy of the current frame to the recognition engine', async () => {
            const video: HTMLVideoElement = await startCamera();
            await runTimers();

            const canvas: HTMLCanvasElement = ocrWorkerStub.recognize.mock.calls[0][0];

            expect(canvas.width).toBe(1280);
            expect(canvas.height).toBe(960);
            expect(contextStub.drawImage).toHaveBeenCalledWith(video, 0, 0, 1280, 960);
        });

        it('should keep frames smaller than the maximum dimension at their size', async () => {
            const starting: Promise<void> = plugin.startCamera(cameraOptions());
            await flushPromises();
            makeVideoReady(previewVideo(), 640, 480);
            await starting;
            await runTimers();

            const canvas: HTMLCanvasElement = ocrWorkerStub.recognize.mock.calls[0][0];

            expect([canvas.width, canvas.height]).toEqual([640, 480]);
        });

        it('should map recognized blocks and drop empty or unreliable lines', async () => {
            ocrWorkerStub.recognize.mockResolvedValueOnce({
                blocks: [
                    {
                        bbox: box(0, 0, 1280, 960),
                        paragraphs: [
                            { lines: [line('  Daily menu \n', 92, box(100, 40, 500, 90)), line('   \n', 95, box(0, 0, 10, 10)), line('~~ ;', 20, box(900, 900, 990, 950))] },
                            { lines: [line('Soup\n', 88, box(120, 100, 300, 140))] },
                        ],
                    },
                    { bbox: box(10, 10, 20, 20), paragraphs: [{ lines: [line(' ', 90, box(10, 10, 20, 20))] }] },
                    { bbox: box(10, 10, 20, 20), paragraphs: [] },
                ],
            });

            await startCamera();
            await runTimers();

            const blocks: RecognizedBlock[] = recognitions[0].blocks;

            expect(blocks).toEqual([
                {
                    boundingBox: { bottom: 140, left: 100, right: 500, top: 40 },
                    lines: [
                        {
                            angle: 0,
                            boundingBox: { bottom: 90, left: 100, right: 500, top: 40 },
                            confidence: 0.92,
                            orientedHeight: 50,
                            orientedWidth: 400,
                            recognizedLanguage: null,
                            text: 'Daily menu',
                        },
                        {
                            angle: 0,
                            boundingBox: { bottom: 140, left: 120, right: 300, top: 100 },
                            confidence: 0.88,
                            orientedHeight: 40,
                            orientedWidth: 180,
                            recognizedLanguage: null,
                            text: 'Soup',
                        },
                    ],
                    orientedHeight: 100,
                    orientedWidth: 400,
                    recognizedLanguage: null,
                    text: 'Daily menu\nSoup',
                },
            ]);
        });

        it('should describe the analyzed frame with the preview size', async () => {
            await startCamera();
            await runTimers();

            expect(recognitions[0].frame).toEqual({
                frameTimestamp: expect.any(Number),
                frozen: false,
                imageHeight: 960,
                imageWidth: 1280,
                mirrored: false,
                rotationDegrees: 0,
                viewHeight: 500,
                viewWidth: 400,
            });
        });

        it('should emit frames without text so expired balloons disappear', async () => {
            ocrWorkerStub.recognize.mockResolvedValueOnce({ blocks: null });

            await startCamera();
            await runTimers();

            expect(recognitions.length).toBe(1);
            expect(recognitions[0].blocks).toEqual([]);
        });

        it('should analyze at most once per second even when a faster rate is requested', async () => {
            await startCamera(cameraOptions({ analysesPerSecond: 5 }));
            await runTimers();

            expect(ocrWorkerStub.recognize).toHaveBeenCalledTimes(1);

            await runTimers(999);

            expect(ocrWorkerStub.recognize).toHaveBeenCalledTimes(1);

            await runTimers(1);

            expect(ocrWorkerStub.recognize).toHaveBeenCalledTimes(2);

            await plugin.setAnalysisRate({ analysesPerSecond: 5 });
            await runTimers(500);

            expect(ocrWorkerStub.recognize).toHaveBeenCalledTimes(2);
        });

        it('should never start an analysis while the previous one is running', async () => {
            const recognizing: Deferred<OcrPage> = createDeferred<OcrPage>();
            ocrWorkerStub.recognize.mockReturnValueOnce(recognizing.promise);

            await startCamera();
            await runTimers();
            await runTimers(5000);

            expect(ocrWorkerStub.recognize).toHaveBeenCalledTimes(1);

            recognizing.resolve(EMPTY_PAGE);
            await runTimers();

            expect(ocrWorkerStub.recognize).toHaveBeenCalledTimes(2);
        });

        it('should give every frame a strictly increasing timestamp', async () => {
            await startCamera();
            await runTimers();
            await runTimers(1000);
            await runTimers(1000);

            const timestamps: number[] = recognitions.map((event: RecognitionEvent) => event.frame.frameTimestamp);

            expect(timestamps.length).toBe(3);
            expect(timestamps[1]).toBeGreaterThan(timestamps[0]);
            expect(timestamps[2]).toBeGreaterThan(timestamps[1]);
        });

        it('should skip analyses while paused and drop a result that arrives after pausing', async () => {
            const recognizing: Deferred<OcrPage> = createDeferred<OcrPage>();
            ocrWorkerStub.recognize.mockReturnValueOnce(recognizing.promise);

            await startCamera();
            await runTimers();
            await plugin.pauseAnalysis();
            recognizing.resolve(pageWithText('Exit'));
            await runTimers(3000);

            expect(recognitions).toEqual([]);
            expect(ocrWorkerStub.recognize).toHaveBeenCalledTimes(1);

            await plugin.resumeAnalysis();
            await runTimers();

            expect(ocrWorkerStub.recognize).toHaveBeenCalledTimes(2);
            expect(recognitions.length).toBe(1);
        });

        it('should resume the video playback with the analysis unless the frame is frozen', async () => {
            await startCamera();
            await plugin.pauseAnalysis();
            playSpy.mockClear();

            await plugin.resumeAnalysis();

            expect(playSpy).toHaveBeenCalledTimes(1);

            await plugin.freezeFrame();
            await plugin.pauseAnalysis();
            playSpy.mockClear();
            await plugin.resumeAnalysis();

            expect(playSpy).not.toHaveBeenCalled();
        });

        it('should skip analyses while the page is hidden', async () => {
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: (): DocumentVisibilityState => 'hidden' });

            await startCamera();
            await runTimers(3000);

            expect(ocrWorkerStub.recognize).not.toHaveBeenCalled();

            Reflect.deleteProperty(document, 'visibilityState');
            await runTimers(1000);

            expect(ocrWorkerStub.recognize).toHaveBeenCalledTimes(1);
        });

        it('should stop analyzing when the camera stops', async () => {
            await startCamera();
            await runTimers();
            await plugin.stopCamera();
            await runTimers(5000);

            expect(ocrWorkerStub.recognize).toHaveBeenCalledTimes(1);
        });

        it('should report a recognition failure once without the recognized text and keep analyzing', async () => {
            ocrWorkerStub.recognize.mockRejectedValueOnce(new Error('engine crashed')).mockRejectedValueOnce(new Error('engine crashed'));

            await startCamera();
            await runTimers();
            await runTimers(1000);

            expect(engineErrors).toEqual([{ code: LensEngineErrorCode.OCR_FAILED, message: 'Text recognition failed' }]);

            await runTimers(1000);

            expect(ocrWorkerStub.recognize).toHaveBeenCalledTimes(3);
            expect(recognitions.length).toBe(1);

            ocrWorkerStub.recognize.mockRejectedValueOnce(new Error('engine crashed'));
            await runTimers(1000);

            expect(engineErrors.length).toBe(2);
        });

        it('should report a recognition engine that cannot start and retry it in the next session', async () => {
            createOcrWorker.mockRejectedValueOnce(new Error('language data download failed'));

            await startCamera();
            await runTimers();
            await runTimers(5000);

            expect(engineErrors).toEqual([{ code: LensEngineErrorCode.OCR_FAILED, message: 'Text recognition failed' }]);
            expect(createOcrWorker).toHaveBeenCalledTimes(1);

            await plugin.stopCamera();
            await startCamera();
            await runTimers();

            expect(createOcrWorker).toHaveBeenCalledTimes(2);
            expect(ocrWorkerStub.recognize).toHaveBeenCalledTimes(1);
        });

        it('should retry a recognition engine that could not start once the device is back online', async () => {
            createOcrWorker.mockRejectedValueOnce(new Error('language data download failed'));

            await startCamera();
            await runTimers();
            windowTarget.dispatchEvent(new Event('online'));
            await runTimers(1000);

            expect(createOcrWorker).toHaveBeenCalledTimes(2);
            expect(ocrWorkerStub.recognize).toHaveBeenCalledTimes(1);
        });

        it('should reuse the recognition engine across sessions with the same languages', async () => {
            await startCamera();
            await runTimers();
            await plugin.stopCamera();
            await startCamera();
            await runTimers();

            expect(createOcrWorker).toHaveBeenCalledTimes(1);
            expect(ocrWorkerStub.reinitialize).not.toHaveBeenCalled();
            expect(ocrWorkerStub.recognize).toHaveBeenCalledTimes(2);
        });

        it('should reload the recognition engine when the languages change', async () => {
            await startCamera();
            await runTimers();
            await plugin.stopCamera();
            await startCamera(cameraOptions({ recognitionLanguages: ['fr'] }));
            await runTimers();

            expect(createOcrWorker).toHaveBeenCalledTimes(1);
            expect(ocrWorkerStub.reinitialize).toHaveBeenCalledWith('eng+fra');
            expect(ocrWorkerStub.reinitialize.mock.invocationCallOrder[0]).toBeLessThan(ocrWorkerStub.recognize.mock.invocationCallOrder[1]);
        });

        it('should replace an engine that failed to reload its languages', async () => {
            await startCamera();
            await runTimers();
            ocrWorkerStub.reinitialize.mockRejectedValueOnce(new Error('language data download failed'));
            await plugin.stopCamera();
            await startCamera(cameraOptions({ recognitionLanguages: ['fr'] }));
            await runTimers();

            expect(ocrWorkerStub.terminate).toHaveBeenCalledTimes(1);
            expect(engineErrors.map((event: EngineErrorEvent) => event.code)).toEqual([LensEngineErrorCode.OCR_FAILED]);

            await plugin.stopCamera();
            await startCamera(cameraOptions({ recognitionLanguages: ['fr'] }));
            await runTimers();

            expect(createOcrWorker).toHaveBeenLastCalledWith('eng+fra');
            expect(createOcrWorker).toHaveBeenCalledTimes(2);
        });

        it('should terminate the recognition engine when the page is hidden for good and recreate it when needed', async () => {
            await startCamera();
            await runTimers();

            windowTarget.dispatchEvent(new Event('pagehide'));
            await flushPromises();

            expect(ocrWorkerStub.terminate).toHaveBeenCalledTimes(1);

            await runTimers(1000);

            expect(createOcrWorker).toHaveBeenCalledTimes(2);
            expect(ocrWorkerStub.recognize).toHaveBeenCalledTimes(2);
        });

        it('should not report a failure for an analysis interrupted by the engine termination', async () => {
            const recognizing: Deferred<OcrPage> = createDeferred<OcrPage>();
            ocrWorkerStub.recognize.mockReturnValueOnce(recognizing.promise);
            ocrWorkerStub.terminate.mockImplementationOnce(async (): Promise<void> => recognizing.reject(new Error('stopped')));

            await startCamera();
            await runTimers();
            windowTarget.dispatchEvent(new Event('pagehide'));
            await runTimers();

            expect(engineErrors).toEqual([]);

            await runTimers(1000);

            expect(ocrWorkerStub.recognize).toHaveBeenCalledTimes(2);
        });
    });

    describe('freeze', () => {
        it('should refuse to freeze when the camera is not running', async () => {
            await expect(codeOf(plugin.freezeFrame())).resolves.toBe(LensEngineErrorCode.CAMERA_NOT_STARTED);
        });

        it('should show the frozen frame over the paused video and recognize it once', async () => {
            const video: HTMLVideoElement = await startCamera();
            await runTimers();
            ocrWorkerStub.recognize.mockResolvedValueOnce(pageWithText('Exit'));

            await plugin.freezeFrame();

            const freezeCanvas: HTMLCanvasElement | null = host.querySelector('canvas');

            expect(freezeCanvas).not.toBeNull();
            expect(video.nextElementSibling).toBe(freezeCanvas);
            expect(freezeCanvas?.width).toBe(1600);
            expect(freezeCanvas?.height).toBe(1200);
            expect(freezeCanvas?.style.position).toBe('absolute');
            expect(contextStub.drawImage).toHaveBeenCalledWith(video, 0, 0, 1600, 1200);
            expect(pauseSpy).toHaveBeenCalled();

            await runTimers();

            expect(ocrWorkerStub.recognize).toHaveBeenCalledTimes(2);
            expect(contextStub.drawImage).toHaveBeenLastCalledWith(freezeCanvas, 0, 0, 1280, 960);
            expect(recognitions[1].frame.frozen).toBe(true);
            expect(recognitions[1].blocks[0].text).toBe('Exit');

            await runTimers(5000);

            expect(ocrWorkerStub.recognize).toHaveBeenCalledTimes(2);
        });

        it('should freeze only once', async () => {
            await startCamera();
            await plugin.freezeFrame();
            await plugin.freezeFrame();

            expect(host.querySelectorAll('canvas').length).toBe(1);
        });

        it('should drop a live result that arrives after freezing and then recognize the frozen frame', async () => {
            const recognizing: Deferred<OcrPage> = createDeferred<OcrPage>();
            ocrWorkerStub.recognize.mockReturnValueOnce(recognizing.promise);

            await startCamera();
            await runTimers();
            await plugin.freezeFrame();
            recognizing.resolve(pageWithText('Exit'));
            await runTimers(1000);

            expect(recognitions.map((event: RecognitionEvent) => event.frame.frozen)).toEqual([true]);
        });

        it('should drop a frozen result that arrives after unfreezing', async () => {
            await startCamera();
            await runTimers();
            const recognizing: Deferred<OcrPage> = createDeferred<OcrPage>();
            ocrWorkerStub.recognize.mockReturnValueOnce(recognizing.promise);
            await plugin.freezeFrame();
            await runTimers();
            await plugin.unfreezeFrame();
            recognizing.resolve(pageWithText('Exit'));
            await flushPromises();

            expect(recognitions.map((event: RecognitionEvent) => event.frame.frozen)).toEqual([false]);
        });

        it('should remove the frozen frame, play the video and resume live analysis when unfrozen', async () => {
            await startCamera();
            await runTimers();
            await plugin.freezeFrame();
            await runTimers();
            playSpy.mockClear();

            await plugin.unfreezeFrame();
            await runTimers(1000);

            expect(host.querySelector('canvas')).toBeNull();
            expect(playSpy).toHaveBeenCalled();
            expect(recognitions.map((event: RecognitionEvent) => event.frame.frozen)).toEqual([false, true, false]);
        });

        it('should remove the frozen frame when the camera stops', async () => {
            await startCamera();
            await plugin.freezeFrame();
            await plugin.stopCamera();

            expect(host.querySelector('canvas')).toBeNull();
        });

        it('should ignore an unfreeze when nothing is frozen', async () => {
            await expect(plugin.unfreezeFrame()).resolves.toBeUndefined();
        });
    });

    describe('language identification', () => {
        let detectorStub: LanguageDetectorStub;

        beforeEach(() => {
            detectorStub = {
                destroy: vi.fn(),
                detect: vi.fn(async (): Promise<BrowserLanguageDetectionResult[]> => [
                    { confidence: 0.2, detectedLanguage: 'it' },
                    { confidence: 0.75, detectedLanguage: 'es' },
                ]),
            };
        });

        it('should report an undetermined language when the browser has no detector', async () => {
            await expect(plugin.identifyLanguage({ text: 'Menú del día' })).resolves.toEqual({ confidence: 0, language: 'und' });
        });

        it('should create the detector once and return the most confident language', async () => {
            const factory: LanguageDetectorFactoryStub = enableLanguageDetector('available', detectorStub);

            const first: IdentifyLanguageResponse = await plugin.identifyLanguage({ text: 'Menú del día' });
            await plugin.identifyLanguage({ text: 'Sopa de tomate' });

            expect(first).toEqual({ confidence: 0.75, language: 'es' });
            expect(factory.create).toHaveBeenCalledTimes(1);
            expect(detectorStub.detect).toHaveBeenCalledWith('Menú del día');
        });

        it('should report an undetermined language when nothing is detected', async () => {
            enableLanguageDetector('available', detectorStub);
            detectorStub.detect.mockResolvedValueOnce([]);

            await expect(plugin.identifyLanguage({ text: '1234' })).resolves.toEqual({ confidence: 0, language: 'und' });
        });

        it('should not create a detector that is unavailable', async () => {
            const factory: LanguageDetectorFactoryStub = enableLanguageDetector('unavailable', detectorStub);

            await expect(plugin.identifyLanguage({ text: 'Menú del día' })).resolves.toEqual({ confidence: 0, language: 'und' });
            expect(factory.create).not.toHaveBeenCalled();
        });

        it('should report an undetermined language while the detector model needs a user action and retry later', async () => {
            const factory: LanguageDetectorFactoryStub = enableLanguageDetector('downloadable', detectorStub);
            factory.create.mockRejectedValueOnce(domError('NotAllowedError'));

            await expect(plugin.identifyLanguage({ text: 'Menú del día' })).resolves.toEqual({ confidence: 0, language: 'und' });
            await expect(plugin.identifyLanguage({ text: 'Menú del día' })).resolves.toEqual({ confidence: 0, language: 'und' });

            expect(factory.create).toHaveBeenCalledTimes(1);

            await vi.advanceTimersByTimeAsync(10000);

            await expect(plugin.identifyLanguage({ text: 'Menú del día' })).resolves.toEqual({ confidence: 0.75, language: 'es' });
            expect(factory.create).toHaveBeenCalledTimes(2);
        });

        it('should download the detector model on the next user interaction', async () => {
            const factory: LanguageDetectorFactoryStub = enableLanguageDetector('downloadable', detectorStub);
            factory.create.mockRejectedValueOnce(domError('NotAllowedError'));

            await plugin.identifyLanguage({ text: 'Menú del día' });
            windowTarget.dispatchEvent(new Event('pointerup'));
            await flushPromises();

            expect(factory.create).toHaveBeenCalledTimes(2);
            await expect(plugin.identifyLanguage({ text: 'Menú del día' })).resolves.toEqual({ confidence: 0.75, language: 'es' });

            windowTarget.dispatchEvent(new Event('keydown'));
            await flushPromises();

            expect(factory.create).toHaveBeenCalledTimes(2);
        });

        it('should report an undetermined language when the detector cannot be created', async () => {
            const factory: LanguageDetectorFactoryStub = enableLanguageDetector('available', detectorStub);
            factory.create.mockRejectedValueOnce(new Error('model corrupted'));

            await expect(plugin.identifyLanguage({ text: 'Menú del día' })).resolves.toEqual({ confidence: 0, language: 'und' });
        });

        it('should reject a failed detection and recreate the detector next time', async () => {
            const factory: LanguageDetectorFactoryStub = enableLanguageDetector('available', detectorStub);
            detectorStub.detect.mockRejectedValueOnce(new Error('detector destroyed'));

            await expect(codeOf(plugin.identifyLanguage({ text: 'Menú del día' }))).resolves.toBe(LensEngineErrorCode.LANGUAGE_IDENTIFICATION_FAILED);
            await expect(plugin.identifyLanguage({ text: 'Menú del día' })).resolves.toEqual({ confidence: 0.75, language: 'es' });
            expect(factory.create).toHaveBeenCalledTimes(2);
        });
    });

    describe('translation', () => {
        it('should return the text unchanged when both languages are the same', async () => {
            await expect(plugin.translate({ sourceLanguage: 'pt', targetLanguage: 'pt', text: 'Saída' })).resolves.toEqual({ translatedText: 'Saída' });
        });

        it('should reject when the browser has no translator', async () => {
            await expect(codeOf(plugin.translate({ sourceLanguage: 'es', targetLanguage: 'pt', text: 'Salida' }))).resolves.toBe(
                LensEngineErrorCode.TRANSLATION_UNSUPPORTED,
            );
        });

        it.each(MISSING_TRANSLATIONS)('should reject a %s language pair with %s', async (availability: BrowserAiAvailability, code: LensEngineErrorCode) => {
            const factory: TranslatorFactoryStub = enableTranslator(async (): Promise<BrowserAiAvailability> => availability);

            await expect(codeOf(plugin.translate({ sourceLanguage: 'es', targetLanguage: 'pt', text: 'Salida' }))).resolves.toBe(code);
            expect(factory.create).not.toHaveBeenCalled();
        });

        it('should translate with one translator per language pair', async () => {
            const factory: TranslatorFactoryStub = enableTranslator(availableOnly(['es>pt', 'fr>pt']));
            const spanish: TranslatorStub = createTranslatorStub('Sopa do dia');
            const french: TranslatorStub = createTranslatorStub('Saída');
            factory.create.mockResolvedValueOnce(spanish as unknown as BrowserTranslator).mockResolvedValueOnce(french as unknown as BrowserTranslator);

            const first: string = (await plugin.translate({ sourceLanguage: 'es', targetLanguage: 'pt', text: 'Sopa del día' })).translatedText;
            await plugin.translate({ sourceLanguage: 'es', targetLanguage: 'pt', text: 'Salida' });
            const second: string = (await plugin.translate({ sourceLanguage: 'fr', targetLanguage: 'pt', text: 'Sortie' })).translatedText;

            expect(first).toBe('Sopa do dia');
            expect(second).toBe('Saída');
            expect(factory.create).toHaveBeenCalledTimes(2);
            expect(factory.create).toHaveBeenNthCalledWith(1, { sourceLanguage: 'es', targetLanguage: 'pt' });
            expect(spanish.translate).toHaveBeenCalledTimes(2);
            expect(spanish.translate).toHaveBeenLastCalledWith('Salida');
        });

        it('should share one translator between concurrent translations', async () => {
            const factory: TranslatorFactoryStub = enableTranslator(availableOnly(['es>pt']));

            await Promise.all([
                plugin.translate({ sourceLanguage: 'es', targetLanguage: 'pt', text: 'Salida' }),
                plugin.translate({ sourceLanguage: 'es', targetLanguage: 'pt', text: 'Entrada' }),
            ]);

            expect(factory.create).toHaveBeenCalledTimes(1);
        });

        it('should reject a failed translation and replace the translator', async () => {
            const factory: TranslatorFactoryStub = enableTranslator(availableOnly(['es>pt']));
            const failing: TranslatorStub = createTranslatorStub();
            failing.translate.mockRejectedValueOnce(new Error('translator destroyed'));
            factory.create.mockResolvedValueOnce(failing as unknown as BrowserTranslator);

            await expect(codeOf(plugin.translate({ sourceLanguage: 'es', targetLanguage: 'pt', text: 'Salida' }))).resolves.toBe(
                LensEngineErrorCode.TRANSLATION_FAILED,
            );
            await expect(plugin.translate({ sourceLanguage: 'es', targetLanguage: 'pt', text: 'Salida' })).resolves.toEqual({ translatedText: 'Sopa do dia' });

            expect(failing.destroy).toHaveBeenCalledTimes(1);
            expect(factory.create).toHaveBeenCalledTimes(2);
        });

        it('should reject when the translator cannot be created and try again next time', async () => {
            const factory: TranslatorFactoryStub = enableTranslator(availableOnly(['es>pt']));
            factory.create.mockRejectedValueOnce(new Error('out of memory'));

            await expect(codeOf(plugin.translate({ sourceLanguage: 'es', targetLanguage: 'pt', text: 'Salida' }))).resolves.toBe(
                LensEngineErrorCode.TRANSLATION_FAILED,
            );
            await expect(plugin.translate({ sourceLanguage: 'es', targetLanguage: 'pt', text: 'Salida' })).resolves.toEqual({ translatedText: 'Sopa do dia' });
        });

        it('should never put the text in the error message', async () => {
            const factory: TranslatorFactoryStub = enableTranslator(availableOnly(['es>pt']));
            const failing: TranslatorStub = createTranslatorStub();
            failing.translate.mockRejectedValueOnce(new Error('Salida secreta'));
            factory.create.mockResolvedValueOnce(failing as unknown as BrowserTranslator);

            await expect(plugin.translate({ sourceLanguage: 'es', targetLanguage: 'pt', text: 'Salida secreta' })).rejects.not.toThrow('Salida');
        });
    });

    describe('translation models', () => {
        it('should report no downloaded models when the browser has no translator', async () => {
            await expect(plugin.getDownloadedModels({ targetLanguage: 'pt' })).resolves.toEqual({ languages: [] });
        });

        it('should report English and every language that can be translated into English', async () => {
            const factory: TranslatorFactoryStub = enableTranslator(availableOnly(['es>en', 'fr>en']));

            await expect(plugin.getDownloadedModels({ targetLanguage: 'en' })).resolves.toEqual({ languages: ['en', 'es', 'fr'] });
            expect(factory.availability).toHaveBeenCalledTimes(TRANSLATION_LANGUAGES.length - 1);
            expect(factory.availability).not.toHaveBeenCalledWith({ sourceLanguage: 'en', targetLanguage: 'en' });
        });

        it('should report the target language when English can be translated into it', async () => {
            enableTranslator(availableOnly(['en>pt', 'es>pt']));

            await expect(plugin.getDownloadedModels({ targetLanguage: 'pt' })).resolves.toEqual({ languages: ['en', 'es', 'pt'] });
        });

        it('should not report the target language when its model is missing', async () => {
            enableTranslator(availableOnly(['es>pt']));

            await expect(plugin.getDownloadedModels({ targetLanguage: 'pt' })).resolves.toEqual({ languages: ['es'] });
        });

        it('should treat a failing availability check as unavailable', async () => {
            const factory: TranslatorFactoryStub = enableTranslator(availableOnly(['es>en']));
            factory.availability.mockImplementation(async (options: LanguagePair): Promise<BrowserAiAvailability> => {
                if (options.sourceLanguage === 'fr') {
                    throw new TypeError('invalid language tag');
                }

                return options.sourceLanguage === 'es' ? 'available' : 'downloadable';
            });

            await expect(plugin.getDownloadedModels({ targetLanguage: 'en' })).resolves.toEqual({ languages: ['en', 'es'] });
        });

        it('should reuse availability answers for a few seconds', async () => {
            const factory: TranslatorFactoryStub = enableTranslator(availableOnly(['es>en']));

            await plugin.getDownloadedModels({ targetLanguage: 'en' });
            await plugin.getDownloadedModels({ targetLanguage: 'en' });

            expect(factory.availability).toHaveBeenCalledTimes(TRANSLATION_LANGUAGES.length - 1);

            await vi.advanceTimersByTimeAsync(5001);
            await plugin.getDownloadedModels({ targetLanguage: 'en' });

            expect(factory.availability).toHaveBeenCalledTimes(2 * (TRANSLATION_LANGUAGES.length - 1));
        });

        it('should check availability with limited concurrency', async () => {
            let inFlight: number = 0;
            let maximumInFlight: number = 0;

            enableTranslator(async (): Promise<BrowserAiAvailability> => {
                inFlight++;
                maximumInFlight = Math.max(maximumInFlight, inFlight);
                await Promise.resolve();
                await Promise.resolve();
                inFlight--;

                return 'downloadable';
            });

            await plugin.getDownloadedModels({ targetLanguage: 'en' });

            expect(maximumInFlight).toBeGreaterThan(1);
            expect(maximumInFlight).toBeLessThanOrEqual(4);
        });

        it('should reject a download when the browser has no translator', async () => {
            await expect(codeOf(plugin.downloadModel({ language: 'es', requireWifi: true, targetLanguage: 'pt' }))).resolves.toBe(
                LensEngineErrorCode.TRANSLATION_UNSUPPORTED,
            );
        });

        it('should resolve a download that is already available without creating a translator', async () => {
            const factory: TranslatorFactoryStub = enableTranslator(availableOnly(['es>pt']));

            await expect(codeOf(plugin.downloadModel({ language: 'es', requireWifi: false, targetLanguage: 'pt' }))).resolves.toBe(RESOLVED);
            expect(factory.create).not.toHaveBeenCalled();
        });

        it('should reject the download of an unsupported language pair', async () => {
            enableTranslator(async (): Promise<BrowserAiAvailability> => 'unavailable');

            await expect(codeOf(plugin.downloadModel({ language: 'eo', requireWifi: false, targetLanguage: 'pt' }))).resolves.toBe(
                LensEngineErrorCode.UNSUPPORTED_LANGUAGE,
            );
        });

        it('should download the model of the language pair into the target language', async () => {
            const factory: TranslatorFactoryStub = enableTranslator(availableOnly([]));

            await plugin.downloadModel({ language: 'es', requireWifi: true, targetLanguage: 'pt' });

            expect(factory.create).toHaveBeenCalledWith({ sourceLanguage: 'es', targetLanguage: 'pt' });
        });

        it('should download the English pair for the target language model', async () => {
            const factory: TranslatorFactoryStub = enableTranslator(availableOnly([]));

            await plugin.downloadModel({ language: 'pt', requireWifi: false, targetLanguage: 'pt' });

            expect(factory.create).toHaveBeenCalledWith({ sourceLanguage: 'en', targetLanguage: 'pt' });
        });

        it('should resolve the English model for an English target without checking anything', async () => {
            const factory: TranslatorFactoryStub = enableTranslator(availableOnly([]));

            await plugin.downloadModel({ language: 'en', requireWifi: false, targetLanguage: 'en' });

            expect(factory.availability).not.toHaveBeenCalled();
            expect(factory.create).not.toHaveBeenCalled();
        });

        it('should ask for a user action when the browser requires one to download', async () => {
            const factory: TranslatorFactoryStub = enableTranslator(availableOnly([]));
            factory.create.mockRejectedValueOnce(domError('NotAllowedError'));

            await expect(codeOf(plugin.downloadModel({ language: 'es', requireWifi: false, targetLanguage: 'pt' }))).resolves.toBe(
                LensEngineErrorCode.USER_ACTIVATION_REQUIRED,
            );
        });

        it('should report a failed download', async () => {
            const factory: TranslatorFactoryStub = enableTranslator(availableOnly([]));
            factory.create.mockRejectedValueOnce(domError('NetworkError'));

            await expect(codeOf(plugin.downloadModel({ language: 'es', requireWifi: false, targetLanguage: 'pt' }))).resolves.toBe(
                LensEngineErrorCode.MODEL_DOWNLOAD_FAILED,
            );
        });

        it('should check availability again after a download and reuse the downloaded translator', async () => {
            let downloaded: boolean = false;
            const factory: TranslatorFactoryStub = enableTranslator(async (options: LanguagePair): Promise<BrowserAiAvailability> =>
                downloaded && options.sourceLanguage === 'es' ? 'available' : 'downloadable',
            );
            factory.create.mockImplementationOnce(async (): Promise<BrowserTranslator> => {
                downloaded = true;

                return createTranslatorStub('Saída') as unknown as BrowserTranslator;
            });

            await expect(plugin.getDownloadedModels({ targetLanguage: 'pt' })).resolves.toEqual({ languages: [] });
            await plugin.downloadModel({ language: 'es', requireWifi: false, targetLanguage: 'pt' });

            await expect(plugin.getDownloadedModels({ targetLanguage: 'pt' })).resolves.toEqual({ languages: ['es'] });
            await expect(plugin.translate({ sourceLanguage: 'es', targetLanguage: 'pt', text: 'Salida' })).resolves.toEqual({ translatedText: 'Saída' });
            expect(factory.create).toHaveBeenCalledTimes(1);
        });

        it('should refuse to delete models managed by the browser', async () => {
            await expect(codeOf(plugin.deleteModel())).resolves.toBe(LensEngineErrorCode.MODEL_DELETE_UNSUPPORTED);
        });
    });

    describe('capabilities', () => {
        it('should report only camera selection when the browser has no on-device AI', async () => {
            const capabilities: EngineCapabilities = await plugin.getCapabilities();

            expect(capabilities).toEqual({ cameraSelection: true, languageIdentification: false, modelRemoval: false, openAppSettings: false, translation: false });
        });

        it('should report translation and language identification when the browser provides them', async () => {
            enableTranslator(availableOnly([]));
            enableLanguageDetector('available', { destroy: vi.fn<() => void>(), detect: vi.fn(async (): Promise<BrowserLanguageDetectionResult[]> => []) });

            const capabilities: EngineCapabilities = await plugin.getCapabilities();

            expect(capabilities).toEqual({ cameraSelection: true, languageIdentification: true, modelRemoval: false, openAppSettings: false, translation: true });
        });

        it('should not report camera selection when the browser cannot list cameras', async () => {
            const withoutCamera: LensEngineWeb = new LensEngineWeb({ browserAi: browserAi, createOcrWorker: createOcrWorker, mediaDevices: null, window: windowTarget });

            await expect(withoutCamera.getCapabilities()).resolves.toEqual(expect.objectContaining({ cameraSelection: false }));
        });
    });

    describe('camera choice at startup', () => {
        it('should open the remembered camera when it is still connected', async () => {
            storedValues.set(CAMERA_STORAGE_KEY, 'camera-b');

            await startCamera();

            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledTimes(1);
            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledWith(cameraConstraints('camera-b'));
        });

        it('should open the remembered camera instead of the rear camera on touch devices', async () => {
            rearCameraPreferred = true;
            storedValues.set(CAMERA_STORAGE_KEY, 'camera-b');

            await startCamera();

            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledWith(cameraConstraints('camera-b'));
        });

        it('should open the default camera when the remembered one is no longer connected and keep remembering it', async () => {
            storedValues.set(CAMERA_STORAGE_KEY, 'camera-z');

            await startCamera();

            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledTimes(1);
            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledWith(DESKTOP_CONSTRAINTS);
            expect(storedValues.get(CAMERA_STORAGE_KEY)).toBe('camera-z');
        });

        it('should try the remembered camera while the browser hides device ids and forget it when it is gone', async () => {
            devices = [deviceInfo(EMPTY, EMPTY)];
            storedValues.set(CAMERA_STORAGE_KEY, 'camera-z');
            mediaDevicesStub.getUserMedia.mockRejectedValueOnce(domError('OverconstrainedError'));

            const video: HTMLVideoElement = await startCamera();

            expect(mediaDevicesStub.getUserMedia).toHaveBeenNthCalledWith(1, cameraConstraints('camera-z'));
            expect(mediaDevicesStub.getUserMedia).toHaveBeenNthCalledWith(2, DESKTOP_CONSTRAINTS);
            expect(video.srcObject).toBe(streams[0].stream);
            expect(storedValues.has(CAMERA_STORAGE_KEY)).toBe(false);
        });

        it('should open the default camera once when the remembered camera is busy and keep remembering it', async () => {
            storedValues.set(CAMERA_STORAGE_KEY, 'camera-b');
            mediaDevicesStub.getUserMedia.mockRejectedValueOnce(domError('NotReadableError'));

            await startCamera();

            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledTimes(2);
            expect(mediaDevicesStub.getUserMedia).toHaveBeenLastCalledWith(DESKTOP_CONSTRAINTS);
            expect(storedValues.get(CAMERA_STORAGE_KEY)).toBe('camera-b');
        });

        it('should reject without another attempt when the remembered camera is denied', async () => {
            storedValues.set(CAMERA_STORAGE_KEY, 'camera-b');
            mediaDevicesStub.getUserMedia.mockRejectedValueOnce(domError('NotAllowedError'));

            await expect(codeOf(plugin.startCamera(cameraOptions()))).resolves.toBe(LensEngineErrorCode.PERMISSION_DENIED);

            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledTimes(1);
        });

        it('should open the default camera when the browser storage is unavailable', async () => {
            storageStub.getItem.mockImplementation((): string | null => {
                throw domError('SecurityError');
            });

            await startCamera();

            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledWith(DESKTOP_CONSTRAINTS);
        });

        it('should open the remembered camera when the browser cannot list cameras', async () => {
            storedValues.set(CAMERA_STORAGE_KEY, 'camera-b');
            mediaDevicesStub.enumerateDevices.mockRejectedValueOnce(domError('NotSupportedError'));

            await startCamera();

            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledWith(cameraConstraints('camera-b'));
        });

        it('should try every other connected camera when the default camera cannot be opened', async () => {
            mediaDevicesStub.getUserMedia.mockRejectedValueOnce(domError('NotReadableError')).mockRejectedValueOnce(domError('AbortError'));

            const video: HTMLVideoElement = await startCamera();

            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledTimes(3);
            expect(mediaDevicesStub.getUserMedia).toHaveBeenNthCalledWith(1, DESKTOP_CONSTRAINTS);
            expect(mediaDevicesStub.getUserMedia).toHaveBeenNthCalledWith(2, cameraConstraints('camera-a'));
            expect(mediaDevicesStub.getUserMedia).toHaveBeenNthCalledWith(3, cameraConstraints('camera-b'));
            expect(video.srcObject).toBe(streams[0].stream);
            expect(storedValues.has(CAMERA_STORAGE_KEY)).toBe(false);
        });

        it('should list the cameras again after the default camera failed so ids revealed by the permission are tried', async () => {
            devices = [deviceInfo(EMPTY, EMPTY)];
            mediaDevicesStub.getUserMedia.mockImplementationOnce(async (): Promise<MediaStream> => {
                devices = [deviceInfo('camera-a', 'Integrated Webcam'), deviceInfo('camera-b', 'USB Camera')];

                throw domError('NotReadableError');
            });

            await startCamera();

            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledTimes(2);
            expect(mediaDevicesStub.getUserMedia).toHaveBeenLastCalledWith(cameraConstraints('camera-a'));
        });

        it('should try the remembered camera, then the default one, then the others without trying any camera twice', async () => {
            storedValues.set(CAMERA_STORAGE_KEY, 'camera-b');
            mediaDevicesStub.getUserMedia.mockRejectedValueOnce(domError('NotReadableError')).mockRejectedValueOnce(domError('NotReadableError'));

            await startCamera();

            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledTimes(3);
            expect(mediaDevicesStub.getUserMedia).toHaveBeenNthCalledWith(1, cameraConstraints('camera-b'));
            expect(mediaDevicesStub.getUserMedia).toHaveBeenNthCalledWith(2, DESKTOP_CONSTRAINTS);
            expect(mediaDevicesStub.getUserMedia).toHaveBeenNthCalledWith(3, cameraConstraints('camera-a'));
            expect(storedValues.get(CAMERA_STORAGE_KEY)).toBe('camera-b');
        });

        it('should reject with the last failure once every camera failed', async () => {
            mediaDevicesStub.getUserMedia
                .mockRejectedValueOnce(domError('NotReadableError'))
                .mockRejectedValueOnce(domError('NotReadableError'))
                .mockRejectedValueOnce(domError('AbortError'));

            await expect(codeOf(plugin.startCamera(cameraOptions()))).resolves.toBe(LensEngineErrorCode.CAMERA_UNAVAILABLE);

            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledTimes(3);
            expect(host.querySelector('video')).toBeNull();
        });

        it('should stop trying other cameras as soon as one is denied', async () => {
            mediaDevicesStub.getUserMedia.mockRejectedValueOnce(domError('NotReadableError')).mockRejectedValueOnce(domError('NotAllowedError'));

            await expect(codeOf(plugin.startCamera(cameraOptions()))).resolves.toBe(LensEngineErrorCode.PERMISSION_DENIED);

            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledTimes(2);
        });

        it('should forget the remembered camera when it never delivers an image so the next start opens the default camera', async () => {
            storedValues.set(CAMERA_STORAGE_KEY, 'camera-b');

            const result: Promise<string> = codeOf(plugin.startCamera(cameraOptions()));
            await flushPromises();
            await vi.advanceTimersByTimeAsync(WEB_ENGINE_CONFIG.cameraReadyTimeoutMilliseconds);

            await expect(result).resolves.toBe(LensEngineErrorCode.CAMERA_UNAVAILABLE);
            expect(storedValues.has(CAMERA_STORAGE_KEY)).toBe(false);

            await startCamera();

            expect(mediaDevicesStub.getUserMedia).toHaveBeenLastCalledWith(DESKTOP_CONSTRAINTS);
        });

        it('should keep remembering the selected camera when another camera opened in its place never delivers an image', async () => {
            storedValues.set(CAMERA_STORAGE_KEY, 'camera-b');
            mediaDevicesStub.getUserMedia.mockRejectedValueOnce(domError('NotReadableError'));

            const result: Promise<string> = codeOf(plugin.startCamera(cameraOptions()));
            await flushPromises();
            await vi.advanceTimersByTimeAsync(WEB_ENGINE_CONFIG.cameraReadyTimeoutMilliseconds);

            await expect(result).resolves.toBe(LensEngineErrorCode.CAMERA_UNAVAILABLE);
            expect(storedValues.get(CAMERA_STORAGE_KEY)).toBe('camera-b');
        });

        it('should keep remembering the camera when the start is stopped before its first image', async () => {
            storedValues.set(CAMERA_STORAGE_KEY, 'camera-b');

            const starting: Promise<void> = plugin.startCamera(cameraOptions());
            await flushPromises();
            await plugin.stopCamera();

            await expect(starting).resolves.toBeUndefined();
            expect(storedValues.get(CAMERA_STORAGE_KEY)).toBe('camera-b');
        });
    });

    describe('camera list', () => {
        it('should list the identified cameras with their labels, leave unnamed ones empty for the page to name and mark the running one', async () => {
            await startCamera();

            const cameras: CameraDevice[] = (await plugin.listCameras()).cameras;

            expect(cameras).toEqual([
                { active: true, cameraId: 'camera-a', label: 'Integrated Webcam' },
                { active: false, cameraId: 'camera-b', label: EMPTY },
            ]);
        });

        it('should mark the remembered camera while the camera is not running', async () => {
            storedValues.set(CAMERA_STORAGE_KEY, 'camera-b');

            const cameras: CameraDevice[] = (await plugin.listCameras()).cameras;

            expect(cameras.map((camera: CameraDevice) => camera.active)).toEqual([false, true]);
            expect(mediaDevicesStub.getUserMedia).not.toHaveBeenCalled();
        });

        it('should list no camera while the browser hides the device ids', async () => {
            devices = [deviceInfo(EMPTY, EMPTY), deviceInfo(EMPTY, EMPTY, 'audioinput')];

            await expect(plugin.listCameras()).resolves.toEqual({ cameras: [] });
        });

        it('should list no camera when the cameras cannot be listed', async () => {
            const withoutCamera: LensEngineWeb = new LensEngineWeb({ createOcrWorker: createOcrWorker, mediaDevices: null, window: windowTarget });
            mediaDevicesStub.enumerateDevices.mockRejectedValueOnce(domError('NotSupportedError'));

            await expect(withoutCamera.listCameras()).resolves.toEqual({ cameras: [] });
            await expect(plugin.listCameras()).resolves.toEqual({ cameras: [] });
        });
    });

    describe('camera selection', () => {
        it('should remember the selected camera without opening it while the camera is not running', async () => {
            await plugin.selectCamera({ cameraId: 'camera-b' });

            expect(storedValues.get(CAMERA_STORAGE_KEY)).toBe('camera-b');
            expect(mediaDevicesStub.getUserMedia).not.toHaveBeenCalled();
        });

        it('should select a camera even when the browser storage is unavailable', async () => {
            storageStub.setItem.mockImplementation((): void => {
                throw domError('QuotaExceededError');
            });

            await expect(plugin.selectCamera({ cameraId: 'camera-b' })).resolves.toBeUndefined();
        });

        it('should switch the running camera to the selected device keeping the session', async () => {
            const video: HTMLVideoElement = await startCamera();
            await runTimers();

            await plugin.selectCamera({ cameraId: 'camera-b' });

            expect(streams[0].tracks[0].stop).toHaveBeenCalledTimes(1);
            expect(streams[0].tracks[0].stop.mock.invocationCallOrder[0]).toBeLessThan(mediaDevicesStub.getUserMedia.mock.invocationCallOrder[1]);
            expect(mediaDevicesStub.getUserMedia).toHaveBeenLastCalledWith(cameraConstraints('camera-b'));
            expect(previewVideo()).toBe(video);
            expect(host.querySelectorAll('video').length).toBe(1);
            expect(video.srcObject).toBe(streams[1].stream);
            expect(storedValues.get(CAMERA_STORAGE_KEY)).toBe('camera-b');

            await runTimers(1000);

            expect(ocrWorkerStub.recognize).toHaveBeenCalledTimes(2);
            expect((await plugin.listCameras()).cameras.map((camera: CameraDevice) => camera.active)).toEqual([false, true]);
        });

        it('should not reopen the camera that is already running', async () => {
            await startCamera();

            await plugin.selectCamera({ cameraId: DEFAULT_CAMERA_ID });

            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledTimes(1);
            expect(streams[0].tracks[0].stop).not.toHaveBeenCalled();
            expect(storedValues.get(CAMERA_STORAGE_KEY)).toBe(DEFAULT_CAMERA_ID);
        });

        it('should switch a camera that is still starting once its first frame arrives', async () => {
            const starting: Promise<void> = plugin.startCamera(cameraOptions());
            await flushPromises();

            const switching: Promise<void> = plugin.selectCamera({ cameraId: 'camera-b' });
            makeVideoReady(previewVideo());
            await starting;
            await switching;

            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledTimes(2);
            expect(previewVideo().srcObject).toBe(streams[1].stream);
        });

        it('should apply concurrent selections in order', async () => {
            await startCamera();

            await Promise.all([plugin.selectCamera({ cameraId: 'camera-b' }), plugin.selectCamera({ cameraId: 'camera-c' })]);

            expect(mediaDevicesStub.getUserMedia).toHaveBeenNthCalledWith(2, cameraConstraints('camera-b'));
            expect(mediaDevicesStub.getUserMedia).toHaveBeenNthCalledWith(3, cameraConstraints('camera-c'));
            expect(previewVideo().srcObject).toBe(streams[2].stream);
            expect(storedValues.get(CAMERA_STORAGE_KEY)).toBe('camera-c');
        });

        it('should go back to the previous camera and reject when the selected camera cannot be opened', async () => {
            storedValues.set(CAMERA_STORAGE_KEY, DEFAULT_CAMERA_ID);
            const video: HTMLVideoElement = await startCamera();
            mediaDevicesStub.getUserMedia.mockRejectedValueOnce(domError('NotReadableError'));

            await expect(codeOf(plugin.selectCamera({ cameraId: 'camera-b' }))).resolves.toBe(LensEngineErrorCode.CAMERA_UNAVAILABLE);

            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledTimes(3);
            expect(mediaDevicesStub.getUserMedia).toHaveBeenLastCalledWith(cameraConstraints(DEFAULT_CAMERA_ID));
            expect(video.srcObject).toBe(streams[1].stream);
            expect(storedValues.get(CAMERA_STORAGE_KEY)).toBe(DEFAULT_CAMERA_ID);
            expect(engineErrors).toEqual([]);

            await runTimers(1000);

            expect(ocrWorkerStub.recognize).toHaveBeenCalled();
        });

        it('should forget a failed selection when no camera was remembered before', async () => {
            await startCamera();
            mediaDevicesStub.getUserMedia.mockRejectedValueOnce(domError('OverconstrainedError'));

            await expect(codeOf(plugin.selectCamera({ cameraId: 'camera-z' }))).resolves.toBe(LensEngineErrorCode.CAMERA_UNAVAILABLE);

            expect(storedValues.has(CAMERA_STORAGE_KEY)).toBe(false);
        });

        it('should go back to the previous camera when the selected camera never delivers an image', async () => {
            const video: HTMLVideoElement = await startCamera();
            defineValue(video, 'readyState', 0);
            mediaDevicesStub.getUserMedia.mockImplementationOnce(openStream).mockImplementationOnce(async (constraints: MediaStreamConstraints): Promise<MediaStream> => {
                defineValue(video, 'readyState', 2);

                return openStream(constraints);
            });

            const result: Promise<string> = codeOf(plugin.selectCamera({ cameraId: 'camera-b' }));
            await flushPromises();
            await vi.advanceTimersByTimeAsync(WEB_ENGINE_CONFIG.cameraReadyTimeoutMilliseconds);

            await expect(result).resolves.toBe(LensEngineErrorCode.CAMERA_UNAVAILABLE);
            expect(streams[1].tracks[0].stop).toHaveBeenCalled();
            expect(mediaDevicesStub.getUserMedia).toHaveBeenLastCalledWith(cameraConstraints(DEFAULT_CAMERA_ID));
            expect(video.srcObject).toBe(streams[2].stream);
            expect(engineErrors).toEqual([]);
        });

        it('should report a camera error once when neither camera can be reopened', async () => {
            await startCamera();
            mediaDevicesStub.getUserMedia.mockRejectedValueOnce(domError('NotReadableError')).mockRejectedValueOnce(domError('NotReadableError'));

            await expect(codeOf(plugin.selectCamera({ cameraId: 'camera-b' }))).resolves.toBe(LensEngineErrorCode.CAMERA_UNAVAILABLE);

            expect(engineErrors).toEqual([{ code: LensEngineErrorCode.CAMERA_ERROR, message: 'The camera could not be reopened' }]);
        });

        it('should resolve a switch interrupted by stopping the camera and release the late camera', async () => {
            await startCamera();
            const granting: Deferred<MediaStream> = createDeferred<MediaStream>();
            const lateStream: CameraStreamStub = createStream('camera-b');
            mediaDevicesStub.getUserMedia.mockReturnValueOnce(granting.promise);

            const switching: Promise<void> = plugin.selectCamera({ cameraId: 'camera-b' });
            await flushPromises();
            await plugin.stopCamera();
            granting.resolve(lateStream.stream);

            await expect(switching).resolves.toBeUndefined();
            expect(lateStream.tracks[0].stop).toHaveBeenCalled();
            expect(host.querySelector('video')).toBeNull();
            expect(engineErrors).toEqual([]);
        });

        it('should go back to the previous remembered camera when the camera stops before the selected one opens', async () => {
            storedValues.set(CAMERA_STORAGE_KEY, DEFAULT_CAMERA_ID);
            await startCamera();
            const granting: Deferred<MediaStream> = createDeferred<MediaStream>();
            mediaDevicesStub.getUserMedia.mockReturnValueOnce(granting.promise);

            const switching: Promise<void> = plugin.selectCamera({ cameraId: 'camera-b' });
            await flushPromises();

            expect(storedValues.get(CAMERA_STORAGE_KEY)).toBe('camera-b');

            await plugin.stopCamera();
            granting.resolve(createStream('camera-b').stream);
            await switching;

            expect(storedValues.get(CAMERA_STORAGE_KEY)).toBe(DEFAULT_CAMERA_ID);
        });

        it('should forget an unverified selection when the camera stops before the selected one shows an image', async () => {
            const video: HTMLVideoElement = await startCamera();
            defineValue(video, 'readyState', 0);

            const switching: Promise<void> = plugin.selectCamera({ cameraId: 'camera-b' });
            await flushPromises();
            await plugin.stopCamera();

            await expect(switching).resolves.toBeUndefined();
            expect(storedValues.has(CAMERA_STORAGE_KEY)).toBe(false);
            expect(mediaDevicesStub.getUserMedia).toHaveBeenCalledTimes(2);
        });

        it('should report the end of the new camera stream but not of the replaced one', async () => {
            await startCamera();
            await plugin.selectCamera({ cameraId: 'camera-b' });

            streams[0].tracks[0].dispatchEvent(new Event('ended'));

            expect(engineErrors).toEqual([]);

            streams[1].tracks[0].dispatchEvent(new Event('ended'));

            expect(engineErrors).toEqual([{ code: LensEngineErrorCode.CAMERA_ERROR, message: 'The camera stream ended' }]);
        });

        it('should keep the frozen frame on screen while switching cameras', async () => {
            const video: HTMLVideoElement = await startCamera();
            await plugin.freezeFrame();
            pauseSpy.mockClear();

            await plugin.selectCamera({ cameraId: 'camera-b' });

            const freezeCanvas: HTMLCanvasElement | null = host.querySelector('canvas');

            expect(freezeCanvas).not.toBeNull();
            expect(video.nextElementSibling).toBe(freezeCanvas);
            expect(pauseSpy).toHaveBeenCalled();
        });

        it('should wait for a camera switch before freezing the frame', async () => {
            await startCamera();
            const granting: Deferred<MediaStream> = createDeferred<MediaStream>();
            const nextStream: CameraStreamStub = createStream('camera-b');
            mediaDevicesStub.getUserMedia.mockReturnValueOnce(granting.promise);

            const switching: Promise<void> = plugin.selectCamera({ cameraId: 'camera-b' });
            const freezing: Promise<string> = codeOf(plugin.freezeFrame());
            await flushPromises();
            granting.resolve(nextStream.stream);
            await switching;

            await expect(freezing).resolves.toBe(RESOLVED);
            expect(host.querySelector('canvas')).not.toBeNull();
        });
    });

    describe('preview host', () => {
        it('should place the video in the visible preview host instead of a duplicate in a hidden page', async () => {
            const hiddenHost: HTMLElement = createPreviewHost(true);
            document.body.insertBefore(hiddenHost.parentElement as HTMLElement, host);
            markVisible(host);

            const video: HTMLVideoElement = await startCameraIn(host);

            expect(host.firstElementChild).toBe(video);
            expect(hiddenHost.childElementCount).toBe(0);
        });

        it('should skip a duplicate inside a hidden page even without layout information', async () => {
            const hiddenHost: HTMLElement = createPreviewHost(true);
            document.body.appendChild(hiddenHost.parentElement as HTMLElement);

            const video: HTMLVideoElement = await startCameraIn(host);

            expect(host.firstElementChild).toBe(video);
            expect(hiddenHost.childElementCount).toBe(0);
        });

        it('should prefer the preview host that is laid out on screen', async () => {
            const laidOutHost: HTMLElement = createPreviewHost(false);
            document.body.insertBefore(laidOutHost.parentElement as HTMLElement, host);
            markVisible(laidOutHost);

            const video: HTMLVideoElement = await startCameraIn(laidOutHost);

            expect(laidOutHost.firstElementChild).toBe(video);
            expect(host.childElementCount).toBe(0);
        });

        it('should fall back to the last preview host when every host is hidden', async () => {
            const firstHiddenHost: HTMLElement = createPreviewHost(true);
            const lastHiddenHost: HTMLElement = createPreviewHost(true);
            host.remove();
            document.body.appendChild(firstHiddenHost.parentElement as HTMLElement);
            document.body.appendChild(lastHiddenHost.parentElement as HTMLElement);

            const video: HTMLVideoElement = await startCameraIn(lastHiddenHost);

            expect(lastHiddenHost.firstElementChild).toBe(video);
            expect(firstHiddenHost.childElementCount).toBe(0);
        });
    });

    describe('black frames', () => {
        it('should sample a small copy of the live frame every second', async () => {
            const video: HTMLVideoElement = await startCamera();
            contextStub.drawImage.mockClear();

            await runTimers(1000);

            expect(contextStub.drawImage).toHaveBeenCalledWith(video, 0, 0, 32, 24);
            expect(contextStub.getImageData).toHaveBeenCalledWith(0, 0, 32, 24);
        });

        it('should report black frames once after three black seconds and report the recovery', async () => {
            pixels = BLACK_PIXELS;

            await startCamera();
            await runTimers(2000);

            expect(cameraStatuses()).toEqual([]);

            await runTimers(1000);

            expect(cameraStatuses()).toEqual([EngineStatusCode.CAMERA_BLACK_FRAMES]);

            await runTimers(5000);

            expect(cameraStatuses()).toEqual([EngineStatusCode.CAMERA_BLACK_FRAMES]);

            pixels = BRIGHT_PIXELS;
            await runTimers(1000);

            expect(cameraStatuses()).toEqual([EngineStatusCode.CAMERA_BLACK_FRAMES, EngineStatusCode.CAMERA_FRAMES_RECOVERED]);

            await runTimers(3000);

            expect(cameraStatuses().length).toBe(2);
        });

        it('should restart counting when a single frame shows an image', async () => {
            pixels = BLACK_PIXELS;

            await startCamera();
            await runTimers(2000);
            pixels = BRIGHT_PIXELS;
            await runTimers(1000);
            pixels = BLACK_PIXELS;
            await runTimers(2000);

            expect(cameraStatuses()).toEqual([]);

            await runTimers(1000);

            expect(cameraStatuses()).toEqual([EngineStatusCode.CAMERA_BLACK_FRAMES]);
        });

        it('should not report a dark frame that still shows detail', async () => {
            pixels = DARK_DETAILED_PIXELS;

            await startCamera();
            await runTimers(5000);

            expect(cameraStatuses()).toEqual([]);
        });

        it('should not sample frames while frozen, paused or hidden', async () => {
            pixels = BLACK_PIXELS;

            await startCamera();
            await plugin.freezeFrame();
            await runTimers(5000);
            await plugin.unfreezeFrame();
            await plugin.pauseAnalysis();
            await runTimers(5000);
            await plugin.resumeAnalysis();
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: (): DocumentVisibilityState => 'hidden' });
            await runTimers(5000);

            expect(cameraStatuses()).toEqual([]);

            Reflect.deleteProperty(document, 'visibilityState');
            await runTimers(3000);

            expect(cameraStatuses()).toEqual([EngineStatusCode.CAMERA_BLACK_FRAMES]);
        });

        it('should report black frames again for a newly selected camera that is also black', async () => {
            pixels = BLACK_PIXELS;

            await startCamera();
            await runTimers(3000);
            await plugin.selectCamera({ cameraId: 'camera-b' });
            await runTimers(2000);

            expect(cameraStatuses()).toEqual([EngineStatusCode.CAMERA_BLACK_FRAMES]);

            await runTimers(1000);

            expect(cameraStatuses()).toEqual([EngineStatusCode.CAMERA_BLACK_FRAMES, EngineStatusCode.CAMERA_BLACK_FRAMES]);
        });

        it('should report the recovery as soon as a newly selected camera shows an image', async () => {
            pixels = BLACK_PIXELS;

            await startCamera();
            await runTimers(3000);
            await plugin.selectCamera({ cameraId: 'camera-b' });
            pixels = BRIGHT_PIXELS;
            await runTimers(1000);

            expect(cameraStatuses()).toEqual([EngineStatusCode.CAMERA_BLACK_FRAMES, EngineStatusCode.CAMERA_FRAMES_RECOVERED]);
        });

        it('should ignore frames that cannot be read and keep recognizing text', async () => {
            pixels = BLACK_PIXELS;
            contextStub.getImageData.mockImplementation((): ImageData => {
                throw domError('SecurityError');
            });

            await startCamera();
            await runTimers(5000);

            expect(cameraStatuses()).toEqual([]);
            expect(ocrWorkerStub.recognize).toHaveBeenCalled();
        });

        it('should stop sampling when the camera stops', async () => {
            await startCamera();
            await plugin.stopCamera();
            contextStub.drawImage.mockClear();

            await runTimers(5000);

            expect(contextStub.drawImage).not.toHaveBeenCalled();
        });

        it('should start a new session without a previous black frame report', async () => {
            pixels = BLACK_PIXELS;

            await startCamera();
            await runTimers(3000);
            await plugin.stopCamera();
            pixels = BRIGHT_PIXELS;
            await startCamera();
            await runTimers(3000);

            expect(cameraStatuses()).toEqual([EngineStatusCode.CAMERA_BLACK_FRAMES]);
        });
    });

    describe('recognition status', () => {
        it('should report the recognition engine loading and then ready before the first analysis', async () => {
            const creating: Deferred<OcrWorker> = createDeferred<OcrWorker>();
            createOcrWorker.mockReturnValueOnce(creating.promise);

            await startCamera();
            await runTimers();

            expect(recognitionStatuses()).toEqual([EngineStatusCode.RECOGNITION_LOADING]);

            creating.resolve(ocrWorkerStub);
            await runTimers();

            expect(recognitionStatuses()).toEqual([EngineStatusCode.RECOGNITION_LOADING, EngineStatusCode.RECOGNITION_READY]);
            expect(ocrWorkerStub.recognize).toHaveBeenCalledTimes(1);
        });

        it('should report ready as soon as a new session starts with a ready engine', async () => {
            await startCamera();
            await runTimers();
            await plugin.stopCamera();
            engineStatuses.length = 0;

            await startCamera();

            expect(recognitionStatuses()).toEqual([EngineStatusCode.RECOGNITION_READY]);
            expect(createOcrWorker).toHaveBeenCalledTimes(1);
        });

        it('should report loading as soon as a new session starts while the engine is still loading', async () => {
            const creating: Deferred<OcrWorker> = createDeferred<OcrWorker>();
            createOcrWorker.mockReturnValueOnce(creating.promise);

            await startCamera();
            await runTimers();
            await plugin.stopCamera();
            engineStatuses.length = 0;

            await startCamera();

            expect(recognitionStatuses()).toEqual([EngineStatusCode.RECOGNITION_LOADING]);

            creating.resolve(ocrWorkerStub);
            await runTimers();

            expect(recognitionStatuses()).toEqual([EngineStatusCode.RECOGNITION_LOADING, EngineStatusCode.RECOGNITION_READY]);
        });

        it('should report loading and ready again while the engine loads other languages', async () => {
            await startCamera();
            await runTimers();
            await plugin.stopCamera();
            engineStatuses.length = 0;

            await startCamera(cameraOptions({ recognitionLanguages: ['fr'] }));

            expect(recognitionStatuses()).toEqual([]);

            await runTimers();

            expect(recognitionStatuses()).toEqual([EngineStatusCode.RECOGNITION_LOADING, EngineStatusCode.RECOGNITION_READY]);
        });

        it('should not report ready when the recognition engine cannot start', async () => {
            createOcrWorker.mockRejectedValueOnce(new Error('language data download failed'));

            await startCamera();
            await runTimers(3000);

            expect(recognitionStatuses()).toEqual([EngineStatusCode.RECOGNITION_LOADING]);
        });

        it('should report a failure after every loading report that ends without a recognition engine', async () => {
            createOcrWorker.mockRejectedValueOnce(new Error('language data download failed')).mockRejectedValueOnce(new Error('language data download failed'));

            await startCamera();
            await runTimers();

            expect(recognitionStatuses()).toEqual([EngineStatusCode.RECOGNITION_LOADING]);
            expect(engineErrors.map((event: EngineErrorEvent) => event.code)).toEqual([LensEngineErrorCode.OCR_FAILED]);

            windowTarget.dispatchEvent(new Event('online'));
            await runTimers(1000);

            expect(recognitionStatuses()).toEqual([EngineStatusCode.RECOGNITION_LOADING, EngineStatusCode.RECOGNITION_LOADING]);
            expect(engineErrors.map((event: EngineErrorEvent) => event.code)).toEqual([LensEngineErrorCode.OCR_FAILED, LensEngineErrorCode.OCR_FAILED]);
        });

        it('should report a recognition engine that cannot load new languages after a recognition failure in the same session', async () => {
            ocrWorkerStub.recognize.mockRejectedValueOnce(new Error('engine crashed'));

            await startCamera();
            await runTimers();

            expect(engineErrors.length).toBe(1);

            ocrWorkerStub.reinitialize.mockRejectedValueOnce(new Error('language data download failed'));
            await plugin.startCamera(cameraOptions({ recognitionLanguages: ['fr'] }));
            await runTimers(1000);

            expect(recognitionStatuses()).toEqual([EngineStatusCode.RECOGNITION_LOADING, EngineStatusCode.RECOGNITION_READY, EngineStatusCode.RECOGNITION_LOADING]);
            expect(engineErrors.map((event: EngineErrorEvent) => event.code)).toEqual([LensEngineErrorCode.OCR_FAILED, LensEngineErrorCode.OCR_FAILED]);
        });
    });
});
