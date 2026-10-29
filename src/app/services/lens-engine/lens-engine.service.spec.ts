import { TestBed } from '@angular/core/testing';
import { PermissionState, PluginListenerHandle } from '@capacitor/core';
import { Subscription } from 'rxjs';
import type { Mock } from 'vitest';
import {
    AnalysisRateOptions
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
,   IdentifyLanguageOptions
,   IdentifyLanguageResponse
,   LanguageOptions
,   LensEnginePlugin
,   PreviewViewportOptions
,   RecognitionEvent
,   ScreenRect
,   SelectCameraOptions
,   StartCameraOptions
,   TranslateOptions
,   TranslateResponse
} from 'src/app/shared/models';
import { CAMERA_PREVIEW_HOST_ID } from 'src/app/shared/utils';
import { LoggerService } from '../logger/logger.service';
import { LENS_ENGINE_PLUGIN } from './lens-engine.plugin';
import { LensEngineService } from './lens-engine.service';

type EngineListener = (event: EngineErrorEvent | EngineStatusEvent | RecognitionEvent) => void;

interface Deferred<T> {
    promise: Promise<T>;
    reject: (reason: unknown) => void;
    resolve: (value: T) => void;
}

interface LoggerServiceStub {
    error: Mock<(event: string, error: unknown) => void>;
}

interface RegisteredListener {
    eventName: string;
    handle: ListenerHandleStub;
    listener: EngineListener;
}

interface ListenerHandleStub extends PluginListenerHandle {
    remove: Mock<() => Promise<void>>;
}

interface LensEnginePluginStub {
    addListener: Mock<(eventName: string, listener: EngineListener) => Promise<PluginListenerHandle>>;
    checkPermissions: Mock<() => Promise<CameraPermissionStatus>>;
    deleteModel: Mock<(options: LanguageOptions) => Promise<void>>;
    downloadModel: Mock<(options: DownloadModelOptions) => Promise<void>>;
    freezeFrame: Mock<() => Promise<void>>;
    getCapabilities: Mock<() => Promise<EngineCapabilities>>;
    getDownloadedModels: Mock<(options: DownloadedModelsOptions) => Promise<DownloadedModelsResponse>>;
    identifyLanguage: Mock<(options: IdentifyLanguageOptions) => Promise<IdentifyLanguageResponse>>;
    listCameras: Mock<() => Promise<CameraListResponse>>;
    openAppSettings: Mock<() => Promise<void>>;
    pauseAnalysis: Mock<() => Promise<void>>;
    requestPermissions: Mock<() => Promise<CameraPermissionStatus>>;
    resumeAnalysis: Mock<() => Promise<void>>;
    selectCamera: Mock<(options: SelectCameraOptions) => Promise<void>>;
    setAnalysisRate: Mock<(options: AnalysisRateOptions) => Promise<void>>;
    setPreviewViewport: Mock<(options: PreviewViewportOptions) => Promise<void>>;
    startCamera: Mock<(options: StartCameraOptions) => Promise<void>>;
    stopCamera: Mock<() => Promise<void>>;
    translate: Mock<(options: TranslateOptions) => Promise<TranslateResponse>>;
    unfreezeFrame: Mock<() => Promise<void>>;
}

const CAMERAS: CameraDevice[] = [
    { active: true, cameraId: 'camera-a', label: 'Integrated Webcam' },
    { active: false, cameraId: 'camera-b', label: 'Camera 2' },
];

const CAPABILITIES: EngineCapabilities = { cameraSelection: true, languageIdentification: true, modelRemoval: false, openAppSettings: false, translation: true };

const RECOGNITION_LANGUAGES: string[] = ['pt', 'es'];

const RECOGNITION_EVENT: RecognitionEvent = {
    blocks: [],
    frame: {
        frameTimestamp: 10,
        imageHeight: 480,
        imageWidth: 640,
        mirrored: false,
        rotationDegrees: 0,
        viewHeight: 480,
        viewWidth: 640,
    },
};

const VIEWPORT: ScreenRect = { height: 487.5, width: 390, x: 0, y: 56 };

function createDeferred<T>(): Deferred<T> {
    let resolve: (value: T) => void = (): void => undefined;
    let reject: (reason: unknown) => void = (): void => undefined;
    const promise: Promise<T> = new Promise<T>((resolvePromise: (value: T) => void, rejectPromise: (reason: unknown) => void) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return { promise: promise, reject: reject, resolve: resolve };
}

describe('LensEngineService', () => {
    let loggerServiceStub: LoggerServiceStub;
    let pluginStub: LensEnginePluginStub;
    let registeredListeners: RegisteredListener[];
    let service: LensEngineService;

    beforeEach(() => {
        registeredListeners = [];
        pluginStub = {
            addListener: vi.fn(async (eventName: string, listener: EngineListener): Promise<PluginListenerHandle> => {
                const handle: ListenerHandleStub = { remove: vi.fn(async (): Promise<void> => undefined) };
                registeredListeners.push({ eventName: eventName, handle: handle, listener: listener });

                return handle;
            }),
            checkPermissions: vi.fn(async (): Promise<CameraPermissionStatus> => ({ camera: 'prompt' })),
            deleteModel: vi.fn(async (): Promise<void> => undefined),
            downloadModel: vi.fn(async (): Promise<void> => undefined),
            freezeFrame: vi.fn(async (): Promise<void> => undefined),
            getCapabilities: vi.fn(async (): Promise<EngineCapabilities> => CAPABILITIES),
            getDownloadedModels: vi.fn(async (): Promise<DownloadedModelsResponse> => ({ languages: ['en', 'pt'] })),
            identifyLanguage: vi.fn(async (): Promise<IdentifyLanguageResponse> => ({ confidence: 0.9, language: 'es' })),
            listCameras: vi.fn(async (): Promise<CameraListResponse> => ({ cameras: CAMERAS })),
            openAppSettings: vi.fn(async (): Promise<void> => undefined),
            pauseAnalysis: vi.fn(async (): Promise<void> => undefined),
            requestPermissions: vi.fn(async (): Promise<CameraPermissionStatus> => ({ camera: 'granted' })),
            resumeAnalysis: vi.fn(async (): Promise<void> => undefined),
            selectCamera: vi.fn(async (): Promise<void> => undefined),
            setAnalysisRate: vi.fn(async (): Promise<void> => undefined),
            setPreviewViewport: vi.fn(async (): Promise<void> => undefined),
            startCamera: vi.fn(async (): Promise<void> => undefined),
            stopCamera: vi.fn(async (): Promise<void> => undefined),
            translate: vi.fn(async (): Promise<TranslateResponse> => ({ translatedText: 'Pratos do dia' })),
            unfreezeFrame: vi.fn(async (): Promise<void> => undefined),
        };

        loggerServiceStub = { error: vi.fn() };

        TestBed.configureTestingModule({
            providers: [
                { provide: LENS_ENGINE_PLUGIN, useValue: pluginStub as unknown as LensEnginePlugin },
                { provide: LoggerService, useValue: loggerServiceStub },
            ],
        });
        service = TestBed.inject(LensEngineService);
    });

    function listenerFor(eventName: string): RegisteredListener {
        const registered: RegisteredListener | undefined = registeredListeners.find((item: RegisteredListener) => item.eventName === eventName);

        if (!registered) {
            throw new Error(`No listener registered for ${eventName}`);
        }

        return registered;
    }

    it('should be created', () => {
        expect(service).toBeTruthy();
    });

    describe('permissions', () => {
        it('should map the checked camera permission', async () => {
            const permission: PermissionState = await service.checkPermission();

            expect(permission).toBe('prompt');
        });

        it('should map the requested camera permission', async () => {
            const permission: PermissionState = await service.requestPermission();

            expect(permission).toBe('granted');
            expect(pluginStub.requestPermissions).toHaveBeenCalled();
        });

        it('should open the app settings', async () => {
            await service.openAppSettings();

            expect(pluginStub.openAppSettings).toHaveBeenCalledTimes(1);
        });
    });

    describe('language models', () => {
        it('should return the languages downloaded for the target language', async () => {
            await expect(service.getDownloadedModels('pt')).resolves.toEqual(['en', 'pt']);

            expect(pluginStub.getDownloadedModels).toHaveBeenCalledWith({ targetLanguage: 'pt' });
        });

        it('should download a model for the target language with the Wi-Fi requirement', async () => {
            await service.downloadModel('fr', true, 'pt');

            expect(pluginStub.downloadModel).toHaveBeenCalledWith({ language: 'fr', requireWifi: true, targetLanguage: 'pt' });
        });

        it('should delete a model', async () => {
            await service.deleteModel('fr');

            expect(pluginStub.deleteModel).toHaveBeenCalledWith({ language: 'fr' });
        });
    });

    describe('capabilities', () => {
        it('should ask the engine for its capabilities only once', async () => {
            await expect(service.getCapabilities()).resolves.toEqual(CAPABILITIES);
            await expect(service.getCapabilities()).resolves.toEqual(CAPABILITIES);

            expect(pluginStub.getCapabilities).toHaveBeenCalledTimes(1);
        });

        it('should ask the engine again after a failed request', async () => {
            pluginStub.getCapabilities.mockRejectedValueOnce(new Error('bridge unavailable'));

            await expect(service.getCapabilities()).rejects.toThrow('bridge unavailable');
            await expect(service.getCapabilities()).resolves.toEqual(CAPABILITIES);

            expect(pluginStub.getCapabilities).toHaveBeenCalledTimes(2);
        });
    });

    describe('analysis control', () => {
        it('should delegate freeze and unfreeze', async () => {
            await service.freezeFrame();
            await service.unfreezeFrame();

            expect(pluginStub.freezeFrame).toHaveBeenCalledTimes(1);
            expect(pluginStub.unfreezeFrame).toHaveBeenCalledTimes(1);
        });

        it('should delegate pause and resume', async () => {
            await service.pauseAnalysis();
            await service.resumeAnalysis();

            expect(pluginStub.pauseAnalysis).toHaveBeenCalledTimes(1);
            expect(pluginStub.resumeAnalysis).toHaveBeenCalledTimes(1);
        });

        it('should send the analysis rate', async () => {
            await service.setAnalysisRate(4);

            expect(pluginStub.setAnalysisRate).toHaveBeenCalledWith({ analysesPerSecond: 4 });
        });
    });

    describe('identifyLanguage', () => {
        it('should send the text and return the engine response unchanged', async () => {
            const response: IdentifyLanguageResponse = await service.identifyLanguage('Menú del día');

            expect(response).toEqual({ confidence: 0.9, language: 'es' });
            expect(pluginStub.identifyLanguage).toHaveBeenCalledWith({ text: 'Menú del día' });
        });

        it('should pass the undetermined answer through', async () => {
            pluginStub.identifyLanguage.mockResolvedValueOnce({ confidence: 0, language: 'und' });

            await expect(service.identifyLanguage('Qwrtzp')).resolves.toEqual({ confidence: 0, language: 'und' });
        });

        it('should propagate engine failures', async () => {
            pluginStub.identifyLanguage.mockRejectedValueOnce(new Error('identifier unavailable'));

            await expect(service.identifyLanguage('Menú del día')).rejects.toThrow('identifier unavailable');
        });
    });

    describe('translate', () => {
        it('should send the language pair and map the response', async () => {
            const translatedText: string = await service.translate('Daily Specials', { sourceLanguage: 'en', targetLanguage: 'pt' });

            expect(translatedText).toBe('Pratos do dia');
            expect(pluginStub.translate).toHaveBeenCalledWith({ sourceLanguage: 'en', targetLanguage: 'pt', text: 'Daily Specials' });
        });

        it('should propagate engine failures', async () => {
            pluginStub.translate.mockRejectedValueOnce(new Error('model missing'));

            await expect(service.translate('Daily Specials', { sourceLanguage: 'en', targetLanguage: 'pt' })).rejects.toThrow('model missing');
        });
    });

    describe('camera and listeners', () => {
        it('should attach every listener before starting the camera', async () => {
            await service.startCamera(3, RECOGNITION_LANGUAGES);

            expect(registeredListeners.map((item: RegisteredListener) => item.eventName)).toEqual(['textRecognized', 'engineError', 'engineStatus']);
            expect(pluginStub.startCamera).toHaveBeenCalledWith({ analysesPerSecond: 3, previewHostId: CAMERA_PREVIEW_HOST_ID, recognitionLanguages: RECOGNITION_LANGUAGES, viewport: null });
            expect(pluginStub.addListener.mock.invocationCallOrder[2]).toBeLessThan(pluginStub.startCamera.mock.invocationCallOrder[0]);
        });

        it('should attach the listeners only once across restarts without stop', async () => {
            await service.startCamera(3, RECOGNITION_LANGUAGES);
            await service.startCamera(5, RECOGNITION_LANGUAGES);

            expect(pluginStub.addListener).toHaveBeenCalledTimes(3);
            expect(pluginStub.startCamera).toHaveBeenCalledTimes(2);
        });

        it('should attach the listeners only once for concurrent starts', async () => {
            await Promise.all([service.startCamera(3, RECOGNITION_LANGUAGES), service.startCamera(3, RECOGNITION_LANGUAGES)]);

            expect(pluginStub.addListener).toHaveBeenCalledTimes(3);
        });

        it('should forward engine statuses', async () => {
            const received: EngineStatusEvent[] = [];
            const subscription: Subscription = service.statuses().subscribe((event: EngineStatusEvent) => received.push(event));
            const blackFrames: EngineStatusEvent = { code: EngineStatusCode.CAMERA_BLACK_FRAMES };
            const recognitionReady: EngineStatusEvent = { code: EngineStatusCode.RECOGNITION_READY };

            await service.startCamera(3, RECOGNITION_LANGUAGES);
            listenerFor('engineStatus').listener(blackFrames);
            listenerFor('engineStatus').listener(recognitionReady);

            expect(received).toEqual([blackFrames, recognitionReady]);
            subscription.unsubscribe();
        });

        it('should forward recognition events', async () => {
            const received: RecognitionEvent[] = [];
            const subscription: Subscription = service.recognition().subscribe((event: RecognitionEvent) => received.push(event));

            await service.startCamera(3, RECOGNITION_LANGUAGES);
            listenerFor('textRecognized').listener(RECOGNITION_EVENT);

            expect(received).toEqual([RECOGNITION_EVENT]);
            subscription.unsubscribe();
        });

        it('should forward engine errors', async () => {
            const received: EngineErrorEvent[] = [];
            const subscription: Subscription = service.errors().subscribe((event: EngineErrorEvent) => received.push(event));
            const engineError: EngineErrorEvent = { code: 'CAMERA_UNAVAILABLE', message: 'Camera in use' };

            await service.startCamera(3, RECOGNITION_LANGUAGES);
            listenerFor('engineError').listener(engineError);

            expect(received).toEqual([engineError]);
            subscription.unsubscribe();
        });

        it('should remove the listeners when the camera stops', async () => {
            await service.startCamera(3, RECOGNITION_LANGUAGES);
            await service.stopCamera();

            expect(pluginStub.stopCamera).toHaveBeenCalledTimes(1);
            registeredListeners.forEach((item: RegisteredListener) => expect(item.handle.remove).toHaveBeenCalledTimes(1));
        });

        it('should attach new listeners when the camera starts again', async () => {
            await service.startCamera(3, RECOGNITION_LANGUAGES);
            await service.stopCamera();
            await service.startCamera(3, RECOGNITION_LANGUAGES);

            expect(pluginStub.addListener).toHaveBeenCalledTimes(6);
            registeredListeners.slice(3).forEach((item: RegisteredListener) => expect(item.handle.remove).not.toHaveBeenCalled());
        });

        it('should keep the listeners of a start that overlaps a stop', async () => {
            await service.startCamera(3, RECOGNITION_LANGUAGES);
            await Promise.all([service.stopCamera(), service.startCamera(3, RECOGNITION_LANGUAGES)]);

            expect(registeredListeners.length).toBe(6);
            registeredListeners.slice(0, 3).forEach((item: RegisteredListener) => expect(item.handle.remove).toHaveBeenCalled());
            registeredListeners.slice(3).forEach((item: RegisteredListener) => expect(item.handle.remove).not.toHaveBeenCalled());
        });

        it('should remove the listeners even when stopping the camera fails', async () => {
            pluginStub.stopCamera.mockRejectedValueOnce(new Error('camera busy'));

            await service.startCamera(3, RECOGNITION_LANGUAGES);
            await expect(service.stopCamera()).rejects.toThrow('camera busy');

            registeredListeners.forEach((item: RegisteredListener) => expect(item.handle.remove).toHaveBeenCalledTimes(1));
        });

        it('should stop the camera when no listener is attached', async () => {
            await service.stopCamera();

            expect(pluginStub.stopCamera).toHaveBeenCalledTimes(1);
        });

        it('should not start the camera and should release attached listeners when a listener fails to attach', async () => {
            pluginStub.addListener.mockImplementationOnce(async (eventName: string, listener: EngineListener): Promise<PluginListenerHandle> => {
                const handle: ListenerHandleStub = { remove: vi.fn(async (): Promise<void> => undefined) };
                registeredListeners.push({ eventName: eventName, handle: handle, listener: listener });

                return handle;
            });
            pluginStub.addListener.mockImplementationOnce(async (): Promise<PluginListenerHandle> => {
                throw new Error('bridge unavailable');
            });

            await expect(service.startCamera(3, RECOGNITION_LANGUAGES)).rejects.toThrow('bridge unavailable');

            expect(pluginStub.startCamera).not.toHaveBeenCalled();
            registeredListeners.forEach((item: RegisteredListener) => expect(item.handle.remove).toHaveBeenCalledTimes(1));
        });

        it('should retry attaching listeners after a failed attempt', async () => {
            pluginStub.addListener.mockRejectedValueOnce(new Error('bridge unavailable'));

            await expect(service.startCamera(3, RECOGNITION_LANGUAGES)).rejects.toThrow('bridge unavailable');
            await service.startCamera(3, RECOGNITION_LANGUAGES);

            expect(pluginStub.addListener).toHaveBeenCalledTimes(6);
            expect(pluginStub.startCamera).toHaveBeenCalledTimes(1);
        });
    });

    describe('cameras', () => {
        it('should return the cameras listed by the engine', async () => {
            await expect(service.listCameras()).resolves.toEqual(CAMERAS);

            expect(pluginStub.listCameras).toHaveBeenCalledTimes(1);
        });

        it('should propagate a failure to list the cameras', async () => {
            pluginStub.listCameras.mockRejectedValueOnce(new Error('bridge unavailable'));

            await expect(service.listCameras()).rejects.toThrow('bridge unavailable');
        });

        it('should send the selected camera to the engine', async () => {
            await service.selectCamera('camera-b');

            expect(pluginStub.selectCamera).toHaveBeenCalledWith({ cameraId: 'camera-b' });
        });

        it('should propagate a camera that cannot be selected', async () => {
            const failure: Error = Object.assign(new Error('The selected camera could not be opened'), { code: 'CAMERA_UNAVAILABLE' });
            pluginStub.selectCamera.mockRejectedValueOnce(failure);

            await expect(service.selectCamera('camera-z')).rejects.toBe(failure);
        });
    });

    describe('preview viewport', () => {
        it('should start without a viewport', async () => {
            await service.startCamera(3, RECOGNITION_LANGUAGES);

            expect(service.previewViewport).toBeNull();
            expect(pluginStub.startCamera).toHaveBeenCalledWith({ analysesPerSecond: 3, previewHostId: CAMERA_PREVIEW_HOST_ID, recognitionLanguages: RECOGNITION_LANGUAGES, viewport: null });
        });

        it('should send the viewport to the engine and keep it', async () => {
            await service.setPreviewViewport(VIEWPORT);

            expect(pluginStub.setPreviewViewport).toHaveBeenCalledWith({ viewport: VIEWPORT });
            expect(service.previewViewport).toEqual(VIEWPORT);
        });

        it('should pass the latest viewport when the camera starts', async () => {
            await service.setPreviewViewport({ height: 100, width: 100, x: 0, y: 0 });
            await service.setPreviewViewport(VIEWPORT);
            await service.startCamera(4, RECOGNITION_LANGUAGES);

            expect(pluginStub.startCamera).toHaveBeenCalledWith({ analysesPerSecond: 4, previewHostId: CAMERA_PREVIEW_HOST_ID, recognitionLanguages: RECOGNITION_LANGUAGES, viewport: VIEWPORT });
        });

        it('should send a plain copy of the rect', async () => {
            const domRectLike: ScreenRect & { bottom: number; right: number } = { ...VIEWPORT, bottom: 543.5, right: 390 };

            await service.setPreviewViewport(domRectLike);

            const sent: PreviewViewportOptions = pluginStub.setPreviewViewport.mock.calls[0][0];

            expect(sent).toEqual({ viewport: VIEWPORT });
            expect(sent.viewport).not.toBe(domRectLike);
        });

        it('should treat an invalid rect as the whole screen', async () => {
            await service.setPreviewViewport({ ...VIEWPORT, width: Number.NaN });

            expect(pluginStub.setPreviewViewport).toHaveBeenCalledWith({ viewport: null });
            expect(service.previewViewport).toBeNull();
        });

        it('should not send the same viewport twice', async () => {
            await service.setPreviewViewport(VIEWPORT);
            await service.setPreviewViewport({ ...VIEWPORT });
            await service.setPreviewViewport({ ...VIEWPORT, height: VIEWPORT.height + 0.4, y: VIEWPORT.y - 0.3 });

            expect(pluginStub.setPreviewViewport).toHaveBeenCalledTimes(1);
            expect(service.previewViewport).toEqual(VIEWPORT);
        });

        it('should not send the same viewport twice while the first request is pending', async () => {
            const sending: Deferred<void> = createDeferred<void>();
            pluginStub.setPreviewViewport.mockReturnValueOnce(sending.promise);

            const first: Promise<void> = service.setPreviewViewport(VIEWPORT);
            const second: Promise<void> = service.setPreviewViewport({ ...VIEWPORT });
            sending.resolve();
            await Promise.all([first, second]);

            expect(pluginStub.setPreviewViewport).toHaveBeenCalledTimes(1);
        });

        it('should send a viewport that moved beyond the tolerance', async () => {
            await service.setPreviewViewport(VIEWPORT);
            await service.setPreviewViewport({ ...VIEWPORT, y: VIEWPORT.y + 1 });

            expect(pluginStub.setPreviewViewport).toHaveBeenCalledTimes(2);
            expect(pluginStub.setPreviewViewport).toHaveBeenLastCalledWith({ viewport: { ...VIEWPORT, y: VIEWPORT.y + 1 } });
        });

        it('should send the whole screen once when the viewport is cleared', async () => {
            await service.setPreviewViewport(VIEWPORT);
            await service.setPreviewViewport(null);
            await service.setPreviewViewport(null);

            expect(pluginStub.setPreviewViewport).toHaveBeenCalledTimes(2);
            expect(pluginStub.setPreviewViewport).toHaveBeenLastCalledWith({ viewport: null });
        });

        it('should send the whole screen the first time even though it is the initial value', async () => {
            await service.setPreviewViewport(null);

            expect(pluginStub.setPreviewViewport).toHaveBeenCalledWith({ viewport: null });
        });

        it('should not resend the viewport the camera was started with', async () => {
            pluginStub.setPreviewViewport.mockRejectedValueOnce(new Error('bridge unavailable'));

            await service.setPreviewViewport(VIEWPORT);
            await service.startCamera(3, RECOGNITION_LANGUAGES);
            await service.setPreviewViewport(VIEWPORT);

            expect(pluginStub.startCamera).toHaveBeenCalledWith({ analysesPerSecond: 3, previewHostId: CAMERA_PREVIEW_HOST_ID, recognitionLanguages: RECOGNITION_LANGUAGES, viewport: VIEWPORT });
            expect(pluginStub.setPreviewViewport).toHaveBeenCalledTimes(1);
        });

        it('should resolve and log when the engine rejects the viewport', async () => {
            const failure: Error = new Error('bridge unavailable');
            pluginStub.setPreviewViewport.mockRejectedValueOnce(failure);

            await expect(service.setPreviewViewport(VIEWPORT)).resolves.toBeUndefined();

            expect(loggerServiceStub.error).toHaveBeenCalledWith('preview-viewport-failed', failure);
            expect(service.previewViewport).toEqual(VIEWPORT);
        });

        it('should send the same viewport again after a rejection', async () => {
            pluginStub.setPreviewViewport.mockRejectedValueOnce(new Error('bridge unavailable'));

            await service.setPreviewViewport(VIEWPORT);
            await service.setPreviewViewport(VIEWPORT);
            await service.setPreviewViewport(VIEWPORT);

            expect(pluginStub.setPreviewViewport).toHaveBeenCalledTimes(2);
        });

        it('should still start the camera with the rejected viewport', async () => {
            pluginStub.setPreviewViewport.mockRejectedValueOnce(new Error('bridge unavailable'));

            await service.setPreviewViewport(VIEWPORT);
            await service.startCamera(3, RECOGNITION_LANGUAGES);

            expect(pluginStub.startCamera).toHaveBeenCalledWith({ analysesPerSecond: 3, previewHostId: CAMERA_PREVIEW_HOST_ID, recognitionLanguages: RECOGNITION_LANGUAGES, viewport: VIEWPORT });
        });

        it('should keep a newer viewport when an older request fails afterwards', async () => {
            const olderRequest: Deferred<void> = createDeferred<void>();
            const newerViewport: ScreenRect = { height: 600, width: 480, x: 0, y: 80 };
            pluginStub.setPreviewViewport.mockReturnValueOnce(olderRequest.promise);

            const older: Promise<void> = service.setPreviewViewport(VIEWPORT);
            await service.setPreviewViewport(newerViewport);
            olderRequest.reject(new Error('bridge unavailable'));
            await older;
            await service.setPreviewViewport(newerViewport);
            await service.startCamera(3, RECOGNITION_LANGUAGES);

            expect(service.previewViewport).toEqual(newerViewport);
            expect(pluginStub.setPreviewViewport).toHaveBeenCalledTimes(2);
            expect(pluginStub.startCamera).toHaveBeenCalledWith({ analysesPerSecond: 3, previewHostId: CAMERA_PREVIEW_HOST_ID, recognitionLanguages: RECOGNITION_LANGUAGES, viewport: newerViewport });
        });

        it('should send the viewport again when it changed while the camera was starting', async () => {
            const starting: Deferred<void> = createDeferred<void>();
            const newerViewport: ScreenRect = { height: 600, width: 480, x: 0, y: 80 };
            pluginStub.startCamera.mockReturnValueOnce(starting.promise);
            pluginStub.setPreviewViewport.mockRejectedValueOnce(new Error('bridge unavailable'));

            const cameraStart: Promise<void> = service.startCamera(3, RECOGNITION_LANGUAGES);
            await vi.waitFor((): void => expect(pluginStub.startCamera).toHaveBeenCalled());
            await service.setPreviewViewport(newerViewport);
            starting.resolve();
            await cameraStart;
            await service.setPreviewViewport(newerViewport);

            expect(pluginStub.setPreviewViewport).toHaveBeenCalledTimes(2);
        });

        it('should start the camera again with the stored viewport after a stop', async () => {
            await service.setPreviewViewport(VIEWPORT);
            await service.startCamera(3, RECOGNITION_LANGUAGES);
            await service.stopCamera();
            await service.startCamera(2, RECOGNITION_LANGUAGES);

            expect(pluginStub.startCamera).toHaveBeenLastCalledWith({ analysesPerSecond: 2, previewHostId: CAMERA_PREVIEW_HOST_ID, recognitionLanguages: RECOGNITION_LANGUAGES, viewport: VIEWPORT });
        });
    });
});
