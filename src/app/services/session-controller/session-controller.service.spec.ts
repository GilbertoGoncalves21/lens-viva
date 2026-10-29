import { TestBed } from '@angular/core/testing';
import { AppPlugin, AppState } from '@capacitor/app';
import { PermissionState, PluginListenerHandle } from '@capacitor/core';
import { Observable, Subject, Subscription } from 'rxjs';
import type { Mock } from 'vitest';
import {
    AppSettings
,   EngineCapabilities
,   EngineErrorEvent
,   LanguagePair
,   RegionGranularity
,   ScreenRect
,   SessionState
,   SessionStatus
} from 'src/app/shared/models';
import { AUTO_LANGUAGE } from 'src/app/shared/utils';
import { APP_PLUGIN } from '../capacitor/capacitor-plugins';
import { HistoryService } from '../history/history.service';
import { LanguageModelService } from '../language-model/language-model.service';
import { LensEngineService } from '../lens-engine/lens-engine.service';
import { LoggerService } from '../logger/logger.service';
import { PreferencesService } from '../preferences/preferences.service';
import { RecognitionCoordinatorService } from '../recognition-coordinator/recognition-coordinator.service';
import { SessionControllerService } from './session-controller.service';

type AppStateListener = (state: AppState) => void;

interface AppPluginStub {
    addListener: Mock<(eventName: string, listener: AppStateListener) => Promise<PluginListenerHandle>>;
}

interface Deferred<T> {
    promise: Promise<T>;
    reject: (reason: unknown) => void;
    resolve: (value: T) => void;
}

interface HistoryServiceStub {
    flush: Mock<() => Promise<void>>;
}

interface LanguageModelServiceStub {
    missingLanguages: Mock<(languagePair: LanguagePair) => Promise<string[]>>;
}

interface LensEngineServiceStub {
    checkPermission: Mock<() => Promise<PermissionState>>;
    errors: () => Observable<EngineErrorEvent>;
    freezeFrame: Mock<() => Promise<void>>;
    getCapabilities: Mock<() => Promise<EngineCapabilities>>;
    openAppSettings: Mock<() => Promise<void>>;
    pauseAnalysis: Mock<() => Promise<void>>;
    requestPermission: Mock<() => Promise<PermissionState>>;
    resumeAnalysis: Mock<() => Promise<void>>;
    setAnalysisRate: Mock<(analysesPerSecond: number) => Promise<void>>;
    setPreviewViewport: Mock<(viewport: ScreenRect | null) => Promise<void>>;
    startCamera: Mock<(analysesPerSecond: number, recognitionLanguages: string[]) => Promise<void>>;
    stopCamera: Mock<() => Promise<void>>;
    unfreezeFrame: Mock<() => Promise<void>>;
}

interface ListenerHandleStub extends PluginListenerHandle {
    remove: Mock<() => Promise<void>>;
}

interface LoggerServiceStub {
    error: Mock<(event: string, error: unknown) => void>;
    warn: Mock<(event: string, details: Record<string, string>) => void>;
}

interface PreferencesServiceStub {
    settings: AppSettings;
}

interface RecognitionCoordinatorServiceStub {
    retryFailedTranslations: Mock<() => void>;
    setManualSourceLanguage: Mock<(language: string) => void>;
    setSuspended: Mock<(suspended: boolean) => void>;
    start: Mock<(languagePair: LanguagePair) => void>;
    stop: Mock<() => void>;
}

const LANGUAGE_PAIR: LanguagePair = { sourceLanguage: 'en', targetLanguage: 'pt' };

const ON_DEVICE_CAPABILITIES: EngineCapabilities = { cameraSelection: false, languageIdentification: true, modelRemoval: true, openAppSettings: true, translation: true };

function createDeferred<T>(): Deferred<T> {
    let resolve: (value: T) => void = (): void => undefined;
    let reject: (reason: unknown) => void = (): void => undefined;
    const promise: Promise<T> = new Promise<T>((resolvePromise: (value: T) => void, rejectPromise: (reason: unknown) => void) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return { promise: promise, reject: reject, resolve: resolve };
}

function createPermissionError(): Error {
    return Object.assign(new Error('Camera permission has not been granted'), { code: 'PERMISSION_DENIED' });
}

function createSettings(): AppSettings {
    return {
        analysesPerSecond: 4,
        appLanguage: 'auto',
        balloonFontScale: 1,
        historyEnabled: false,
        languageConfirmedFor: 'pt',
        regionGranularity: RegionGranularity.BLOCK,
        requireWifiForDownloads: false,
        showDebugRegions: false,
        sourceLanguage: LANGUAGE_PAIR.sourceLanguage,
        targetLanguage: LANGUAGE_PAIR.targetLanguage,
    };
}

function flushPromises(): Promise<void> {
    return new Promise<void>((resolve: () => void) => setTimeout(resolve, 0));
}

describe('SessionControllerService', () => {
    let appPluginStub: AppPluginStub;
    let appStateListeners: AppStateListener[];
    let engineErrors$: Subject<EngineErrorEvent>;
    let historyServiceStub: HistoryServiceStub;
    let languageModelServiceStub: LanguageModelServiceStub;
    let lensEngineServiceStub: LensEngineServiceStub;
    let listenerHandles: ListenerHandleStub[];
    let loggerServiceStub: LoggerServiceStub;
    let preferencesServiceStub: PreferencesServiceStub;
    let recognitionCoordinatorServiceStub: RecognitionCoordinatorServiceStub;
    let service: SessionControllerService;

    beforeEach(() => {
        appStateListeners = [];
        engineErrors$ = new Subject<EngineErrorEvent>();
        listenerHandles = [];
        appPluginStub = {
            addListener: vi.fn(async (eventName: string, listener: AppStateListener): Promise<PluginListenerHandle> => {
                const handle: ListenerHandleStub = { remove: vi.fn(async (): Promise<void> => undefined) };
                appStateListeners.push(listener);
                listenerHandles.push(handle);

                return handle;
            }),
        };
        historyServiceStub = { flush: vi.fn(async (): Promise<void> => undefined) };
        languageModelServiceStub = { missingLanguages: vi.fn(async (): Promise<string[]> => []) };
        lensEngineServiceStub = {
            checkPermission: vi.fn(async (): Promise<PermissionState> => 'granted'),
            errors: (): Observable<EngineErrorEvent> => engineErrors$.asObservable(),
            freezeFrame: vi.fn(async (): Promise<void> => undefined),
            getCapabilities: vi.fn(async (): Promise<EngineCapabilities> => ON_DEVICE_CAPABILITIES),
            openAppSettings: vi.fn(async (): Promise<void> => undefined),
            pauseAnalysis: vi.fn(async (): Promise<void> => undefined),
            requestPermission: vi.fn(async (): Promise<PermissionState> => 'granted'),
            resumeAnalysis: vi.fn(async (): Promise<void> => undefined),
            setAnalysisRate: vi.fn(async (): Promise<void> => undefined),
            setPreviewViewport: vi.fn(async (): Promise<void> => undefined),
            startCamera: vi.fn(async (): Promise<void> => undefined),
            stopCamera: vi.fn(async (): Promise<void> => undefined),
            unfreezeFrame: vi.fn(async (): Promise<void> => undefined),
        };
        loggerServiceStub = { error: vi.fn(), warn: vi.fn() };
        preferencesServiceStub = { settings: createSettings() };
        recognitionCoordinatorServiceStub = { retryFailedTranslations: vi.fn(), setManualSourceLanguage: vi.fn(), setSuspended: vi.fn(), start: vi.fn(), stop: vi.fn() };

        TestBed.configureTestingModule({
            providers: [
                { provide: APP_PLUGIN, useValue: appPluginStub as unknown as AppPlugin },
                { provide: HistoryService, useValue: historyServiceStub },
                { provide: LanguageModelService, useValue: languageModelServiceStub },
                { provide: LensEngineService, useValue: lensEngineServiceStub },
                { provide: LoggerService, useValue: loggerServiceStub },
                { provide: PreferencesService, useValue: preferencesServiceStub },
                { provide: RecognitionCoordinatorService, useValue: recognitionCoordinatorServiceStub },
            ],
        });
        service = TestBed.inject(SessionControllerService);
    });

    async function changeAppState(isActive: boolean): Promise<void> {
        appStateListeners.forEach((listener: AppStateListener) => listener({ isActive: isActive }));
        await flushPromises();
    }

    async function startRunning(): Promise<void> {
        await expect(service.start()).resolves.toBe(SessionStatus.RUNNING);
    }

    it('should accept translation recovery only in an active capture and preserve a frozen state', async () => {
        service.retryFailedTranslations();
        expect(recognitionCoordinatorServiceStub.retryFailedTranslations).not.toHaveBeenCalled();
        await startRunning();
        await service.freeze();
        service.retryFailedTranslations();
        expect(recognitionCoordinatorServiceStub.retryFailedTranslations).toHaveBeenCalledTimes(1);
        expect(service.state.status).toBe(SessionStatus.FROZEN);
    });

    it('should start idle with the configured language pair', () => {
        expect(service.state).toEqual({ languagePair: LANGUAGE_PAIR, missingLanguages: [], status: SessionStatus.IDLE });
    });

    describe('start', () => {
        it('should start the coordinator, then the camera, then report RUNNING', async () => {
            const statuses: SessionStatus[] = [];
            const subscription: Subscription = service.changes().subscribe((state: SessionState) => statuses.push(state.status));

            await startRunning();

            expect(recognitionCoordinatorServiceStub.start).toHaveBeenCalledWith(LANGUAGE_PAIR);
            expect(lensEngineServiceStub.startCamera).toHaveBeenCalledWith(4, ['pt', 'en']);
            expect(recognitionCoordinatorServiceStub.start.mock.invocationCallOrder[0])
                .toBeLessThan(lensEngineServiceStub.startCamera.mock.invocationCallOrder[0]);
            expect(statuses).toEqual([SessionStatus.IDLE, SessionStatus.STARTING, SessionStatus.RUNNING]);
            expect(service.state).toEqual({ languagePair: LANGUAGE_PAIR, missingLanguages: [], status: SessionStatus.RUNNING });
            subscription.unsubscribe();
        });

        it('should use the language pair of the current settings', async () => {
            preferencesServiceStub.settings = { ...createSettings(), sourceLanguage: 'de', targetLanguage: 'it' };

            await startRunning();

            expect(languageModelServiceStub.missingLanguages).toHaveBeenCalledWith({ sourceLanguage: 'de', targetLanguage: 'it' });
            expect(service.state.languagePair).toEqual({ sourceLanguage: 'de', targetLanguage: 'it' });
        });

        it('should not request the permission when it is already granted', async () => {
            await startRunning();

            expect(lensEngineServiceStub.requestPermission).not.toHaveBeenCalled();
        });

        it('should request the permission when it is not granted yet', async () => {
            lensEngineServiceStub.checkPermission.mockResolvedValueOnce('prompt');

            await startRunning();

            expect(lensEngineServiceStub.requestPermission).toHaveBeenCalledTimes(1);
        });

        it('should report PERMISSION_DENIED when the permission is refused but can still be asked again', async () => {
            lensEngineServiceStub.checkPermission.mockResolvedValueOnce('prompt-with-rationale');
            lensEngineServiceStub.requestPermission.mockResolvedValueOnce('prompt-with-rationale');

            await expect(service.start()).resolves.toBe(SessionStatus.PERMISSION_DENIED);

            expect(service.state.status).toBe(SessionStatus.PERMISSION_DENIED);
            expect(languageModelServiceStub.missingLanguages).not.toHaveBeenCalled();
            expect(recognitionCoordinatorServiceStub.start).not.toHaveBeenCalled();
            expect(lensEngineServiceStub.startCamera).not.toHaveBeenCalled();
            expect(appPluginStub.addListener).not.toHaveBeenCalled();
        });

        it('should still ask once and report PERMISSION_BLOCKED when the permission stays denied', async () => {
            lensEngineServiceStub.checkPermission.mockResolvedValueOnce('denied');
            lensEngineServiceStub.requestPermission.mockResolvedValueOnce('denied');

            await expect(service.start()).resolves.toBe(SessionStatus.PERMISSION_BLOCKED);

            expect(lensEngineServiceStub.requestPermission).toHaveBeenCalledTimes(1);
            expect(service.state.status).toBe(SessionStatus.PERMISSION_BLOCKED);
            expect(languageModelServiceStub.missingLanguages).not.toHaveBeenCalled();
            expect(lensEngineServiceStub.startCamera).not.toHaveBeenCalled();
            expect(appPluginStub.addListener).toHaveBeenCalledWith('appStateChange', expect.any(Function));
        });

        it('should start normally when a dismissed dialog left the permission denied and the new request is granted', async () => {
            lensEngineServiceStub.checkPermission.mockResolvedValueOnce('denied');

            await startRunning();

            expect(lensEngineServiceStub.requestPermission).toHaveBeenCalledTimes(1);
        });

        it('should report MODEL_MISSING with the missing languages', async () => {
            languageModelServiceStub.missingLanguages.mockResolvedValueOnce(['pt']);

            await expect(service.start()).resolves.toBe(SessionStatus.MODEL_MISSING);

            expect(service.state).toEqual({ languagePair: LANGUAGE_PAIR, missingLanguages: ['pt'], status: SessionStatus.MODEL_MISSING });
            expect(recognitionCoordinatorServiceStub.start).not.toHaveBeenCalled();
            expect(lensEngineServiceStub.startCamera).not.toHaveBeenCalled();
        });

        it('should release the camera kept by the permission request before reporting MODEL_MISSING', async () => {
            const statusesWhenReleased: SessionStatus[] = [];

            lensEngineServiceStub.checkPermission.mockResolvedValueOnce('prompt');
            languageModelServiceStub.missingLanguages.mockResolvedValueOnce(['pt']);
            lensEngineServiceStub.stopCamera.mockImplementationOnce(async (): Promise<void> => {
                statusesWhenReleased.push(service.state.status);
            });

            await expect(service.start()).resolves.toBe(SessionStatus.MODEL_MISSING);

            expect(lensEngineServiceStub.requestPermission).toHaveBeenCalledTimes(1);
            expect(lensEngineServiceStub.stopCamera).toHaveBeenCalledTimes(1);
            expect(statusesWhenReleased).toEqual([SessionStatus.STARTING]);
            expect(lensEngineServiceStub.startCamera).not.toHaveBeenCalled();
        });

        it('should not report MODEL_MISSING over a newer session when releasing the camera finishes late', async () => {
            const cameraRelease: Deferred<void> = createDeferred<void>();

            languageModelServiceStub.missingLanguages.mockResolvedValueOnce(['pt']);
            lensEngineServiceStub.stopCamera.mockReturnValueOnce(cameraRelease.promise);

            const failing: Promise<SessionStatus> = service.start();
            await flushPromises();
            await startRunning();
            cameraRelease.resolve();

            await expect(failing).resolves.toBe(SessionStatus.RUNNING);

            expect(service.state).toEqual({ languagePair: LANGUAGE_PAIR, missingLanguages: [], status: SessionStatus.RUNNING });
        });

        it('should clear the missing languages when a new start begins', async () => {
            languageModelServiceStub.missingLanguages.mockResolvedValueOnce(['pt']);
            await service.start();

            await startRunning();

            expect(service.state.missingLanguages).toEqual([]);
        });

        it('should report ERROR, stop the coordinator and release the camera when the camera fails', async () => {
            const failure: Error = new Error('camera unavailable');
            lensEngineServiceStub.startCamera.mockRejectedValueOnce(failure);

            await expect(service.start()).resolves.toBe(SessionStatus.ERROR);

            expect(service.state.status).toBe(SessionStatus.ERROR);
            expect(recognitionCoordinatorServiceStub.stop).toHaveBeenCalledTimes(1);
            expect(lensEngineServiceStub.stopCamera).toHaveBeenCalledTimes(1);
            expect(loggerServiceStub.error).toHaveBeenCalledWith('session-start-failed', failure);
            expect(appPluginStub.addListener).not.toHaveBeenCalled();
        });

        it('should report ERROR and release the camera kept by the permission request when the model check fails', async () => {
            languageModelServiceStub.missingLanguages.mockRejectedValueOnce(new Error('query failed'));

            await expect(service.start()).resolves.toBe(SessionStatus.ERROR);

            expect(recognitionCoordinatorServiceStub.stop).toHaveBeenCalledTimes(1);
            expect(lensEngineServiceStub.startCamera).not.toHaveBeenCalled();
            expect(lensEngineServiceStub.stopCamera).toHaveBeenCalledTimes(1);
        });

        it('should report CAMERA_BLOCKED, log a warning and release the camera when the operating system blocks it', async () => {
            lensEngineServiceStub.startCamera.mockRejectedValueOnce(
                Object.assign(new Error('Camera access is blocked by the operating system'), { code: 'CAMERA_BLOCKED_BY_SYSTEM' }),
            );

            await expect(service.start()).resolves.toBe(SessionStatus.CAMERA_BLOCKED);

            expect(service.state.status).toBe(SessionStatus.CAMERA_BLOCKED);
            expect(recognitionCoordinatorServiceStub.stop).toHaveBeenCalledTimes(1);
            expect(lensEngineServiceStub.stopCamera).toHaveBeenCalledTimes(1);
            expect(loggerServiceStub.warn).toHaveBeenCalledWith('session-start-camera-blocked', { code: 'CAMERA_BLOCKED_BY_SYSTEM' });
            expect(loggerServiceStub.error).not.toHaveBeenCalled();
            expect(lensEngineServiceStub.checkPermission).toHaveBeenCalledTimes(1);
            expect(appPluginStub.addListener).not.toHaveBeenCalled();
        });

        it('should report ERROR when releasing the camera after a failure fails too', async () => {
            lensEngineServiceStub.startCamera.mockRejectedValueOnce(new Error('camera unavailable'));
            lensEngineServiceStub.stopCamera.mockRejectedValueOnce(new Error('camera busy'));

            await expect(service.start()).resolves.toBe(SessionStatus.ERROR);

            expect(loggerServiceStub.error).toHaveBeenCalledWith('session-stop-failed', expect.any(Error));
        });

        it('should not report ERROR over a newer session when releasing the camera of a failed start finishes late', async () => {
            const cameraRelease: Deferred<void> = createDeferred<void>();
            lensEngineServiceStub.startCamera.mockRejectedValueOnce(new Error('camera unavailable'));
            lensEngineServiceStub.stopCamera.mockReturnValueOnce(cameraRelease.promise);

            const failing: Promise<SessionStatus> = service.start();
            await flushPromises();
            await startRunning();
            cameraRelease.resolve();

            await expect(failing).resolves.toBe(SessionStatus.RUNNING);

            expect(service.state.status).toBe(SessionStatus.RUNNING);
        });

        it('should register the app lifecycle listener only once', async () => {
            await startRunning();
            await startRunning();

            expect(appPluginStub.addListener).toHaveBeenCalledTimes(1);
            expect(appPluginStub.addListener).toHaveBeenCalledWith('appStateChange', expect.any(Function));
        });

        it('should register the app lifecycle listener only once for overlapping starts', async () => {
            await Promise.all([service.start(), service.start()]);

            expect(appPluginStub.addListener).toHaveBeenCalledTimes(1);
            expect(service.state.status).toBe(SessionStatus.RUNNING);
        });

        it('should report ERROR when the lifecycle listener cannot be registered and retry on the next start', async () => {
            appPluginStub.addListener.mockRejectedValueOnce(new Error('bridge unavailable'));

            await expect(service.start()).resolves.toBe(SessionStatus.ERROR);
            await startRunning();

            expect(appPluginStub.addListener).toHaveBeenCalledTimes(2);
        });
    });

    describe('automatic source language', () => {
        const AUTO_PAIR: LanguagePair = { sourceLanguage: AUTO_LANGUAGE, targetLanguage: 'pt' };

        beforeEach(() => {
            preferencesServiceStub.settings = { ...createSettings(), sourceLanguage: AUTO_LANGUAGE };
        });

        it('should check the models of the automatic pair and start the coordinator with it', async () => {
            await startRunning();

            expect(languageModelServiceStub.missingLanguages).toHaveBeenCalledWith(AUTO_PAIR);
            expect(recognitionCoordinatorServiceStub.start).toHaveBeenCalledWith(AUTO_PAIR);
            expect(service.state).toEqual({ languagePair: AUTO_PAIR, missingLanguages: [], status: SessionStatus.RUNNING });
        });

        it('should report MODEL_MISSING with only the target language when its model is missing', async () => {
            languageModelServiceStub.missingLanguages.mockResolvedValueOnce(['pt']);

            await expect(service.start()).resolves.toBe(SessionStatus.MODEL_MISSING);

            expect(service.state).toEqual({ languagePair: AUTO_PAIR, missingLanguages: ['pt'], status: SessionStatus.MODEL_MISSING });
            expect(recognitionCoordinatorServiceStub.start).not.toHaveBeenCalled();
        });
    });

    describe('recognition languages', () => {
        it('should only ask the camera to read the target language when the source language is detected automatically', async () => {
            preferencesServiceStub.settings = { ...createSettings(), sourceLanguage: AUTO_LANGUAGE };

            await startRunning();

            expect(lensEngineServiceStub.startCamera).toHaveBeenCalledWith(4, ['pt']);
        });

        it('should ask the camera to read the target and the fixed source language', async () => {
            preferencesServiceStub.settings = { ...createSettings(), sourceLanguage: 'es', targetLanguage: 'de' };

            await startRunning();

            expect(lensEngineServiceStub.startCamera).toHaveBeenCalledWith(4, ['de', 'es']);
        });

        it('should list a language once when the source and the target are the same', async () => {
            preferencesServiceStub.settings = { ...createSettings(), sourceLanguage: 'fr', targetLanguage: 'fr' };

            await startRunning();

            expect(lensEngineServiceStub.startCamera).toHaveBeenCalledWith(4, ['fr']);
        });

        it('should use the new target language when the session is started again after the app language changed', async () => {
            await startRunning();
            await service.stop();
            preferencesServiceStub.settings = { ...createSettings(), targetLanguage: 'it' };

            await startRunning();

            expect(lensEngineServiceStub.startCamera).toHaveBeenLastCalledWith(4, ['it', 'en']);
            expect(languageModelServiceStub.missingLanguages).toHaveBeenLastCalledWith({ sourceLanguage: 'en', targetLanguage: 'it' });
            expect(recognitionCoordinatorServiceStub.start).toHaveBeenLastCalledWith({ sourceLanguage: 'en', targetLanguage: 'it' });
            expect(service.state.languagePair).toEqual({ sourceLanguage: 'en', targetLanguage: 'it' });
        });

        it('should use the current languages when a blocked session starts again from the background', async () => {
            lensEngineServiceStub.checkPermission.mockResolvedValueOnce('denied');
            lensEngineServiceStub.requestPermission.mockResolvedValueOnce('denied');
            await expect(service.start()).resolves.toBe(SessionStatus.PERMISSION_BLOCKED);
            preferencesServiceStub.settings = { ...createSettings(), sourceLanguage: AUTO_LANGUAGE, targetLanguage: 'es' };

            await changeAppState(true);

            expect(service.state.status).toBe(SessionStatus.RUNNING);
            expect(lensEngineServiceStub.startCamera).toHaveBeenCalledWith(4, ['es']);
            expect(service.state.languagePair).toEqual({ sourceLanguage: AUTO_LANGUAGE, targetLanguage: 'es' });
        });
    });

    describe('getCapabilities', () => {
        it('should expose the capabilities of the engine', async () => {
            await expect(service.getCapabilities()).resolves.toEqual(ON_DEVICE_CAPABILITIES);

            expect(lensEngineServiceStub.getCapabilities).toHaveBeenCalledTimes(1);
        });
    });

    describe('setManualSourceLanguage', () => {
        it('should hand the chosen language to the coordinator', async () => {
            await startRunning();

            service.setManualSourceLanguage('de');

            expect(recognitionCoordinatorServiceStub.setManualSourceLanguage).toHaveBeenCalledWith('de');
        });
    });

    describe('setPreviewViewport', () => {
        const viewport: ScreenRect = { height: 487.5, width: 390, x: 0, y: 56 };

        it('should hand the camera frame to the engine', async () => {
            await service.setPreviewViewport(viewport);

            expect(lensEngineServiceStub.setPreviewViewport).toHaveBeenCalledWith(viewport);
        });

        it('should hand the whole screen to the engine', async () => {
            await service.setPreviewViewport(null);

            expect(lensEngineServiceStub.setPreviewViewport).toHaveBeenCalledWith(null);
        });

        it('should not change the session state', async () => {
            await startRunning();

            await service.setPreviewViewport(viewport);

            expect(service.state.status).toBe(SessionStatus.RUNNING);
            expect(lensEngineServiceStub.startCamera).toHaveBeenCalledTimes(1);
        });
    });

    describe('superseded starts', () => {
        it('should not report RUNNING when stopped while the camera was starting', async () => {
            const cameraStart: Deferred<void> = createDeferred<void>();
            lensEngineServiceStub.startCamera.mockReturnValueOnce(cameraStart.promise);

            const starting: Promise<SessionStatus> = service.start();
            await flushPromises();
            await service.stop();
            cameraStart.resolve();

            await expect(starting).resolves.toBe(SessionStatus.IDLE);

            expect(service.state.status).toBe(SessionStatus.IDLE);
            expect(appPluginStub.addListener).not.toHaveBeenCalled();
        });

        it('should not report a result when stopped while checking the permission', async () => {
            const permission: Deferred<PermissionState> = createDeferred<PermissionState>();
            lensEngineServiceStub.checkPermission.mockReturnValueOnce(permission.promise);

            const starting: Promise<SessionStatus> = service.start();
            await service.stop();
            permission.resolve('denied');

            await expect(starting).resolves.toBe(SessionStatus.IDLE);

            expect(lensEngineServiceStub.requestPermission).not.toHaveBeenCalled();
            expect(service.state.status).toBe(SessionStatus.IDLE);
        });

        it('should not report a result when stopped while checking the models', async () => {
            const missing: Deferred<string[]> = createDeferred<string[]>();
            languageModelServiceStub.missingLanguages.mockReturnValueOnce(missing.promise);

            const starting: Promise<SessionStatus> = service.start();
            await flushPromises();
            await service.stop();
            missing.resolve(['pt']);

            await expect(starting).resolves.toBe(SessionStatus.IDLE);

            expect(recognitionCoordinatorServiceStub.start).not.toHaveBeenCalled();
        });

        it('should not let an older failing start break a newer session', async () => {
            const firstCameraStart: Deferred<void> = createDeferred<void>();
            lensEngineServiceStub.startCamera.mockReturnValueOnce(firstCameraStart.promise);

            const first: Promise<SessionStatus> = service.start();
            await flushPromises();
            await startRunning();

            firstCameraStart.reject(new Error('camera restarted'));

            await expect(first).resolves.toBe(SessionStatus.RUNNING);

            expect(service.state.status).toBe(SessionStatus.RUNNING);
            expect(recognitionCoordinatorServiceStub.stop).not.toHaveBeenCalled();
            expect(lensEngineServiceStub.stopCamera).not.toHaveBeenCalled();
        });
    });

    describe('stop', () => {
        it('should stop the coordinator and the camera and report IDLE', async () => {
            await startRunning();

            await service.stop();

            expect(recognitionCoordinatorServiceStub.stop).toHaveBeenCalledTimes(1);
            expect(lensEngineServiceStub.stopCamera).toHaveBeenCalledTimes(1);
            expect(listenerHandles[0].remove).toHaveBeenCalledTimes(1);
            expect(service.state).toEqual({ languagePair: LANGUAGE_PAIR, missingLanguages: [], status: SessionStatus.IDLE });
        });

        it('should save pending history entries', async () => {
            await startRunning();

            await service.stop();

            expect(historyServiceStub.flush).toHaveBeenCalledTimes(1);
        });

        it('should refresh the language pair from the settings', async () => {
            await startRunning();
            preferencesServiceStub.settings = { ...createSettings(), targetLanguage: 'fr' };

            await service.stop();

            expect(service.state.languagePair).toEqual({ sourceLanguage: 'en', targetLanguage: 'fr' });
        });

        it('should stop the camera before awaiting the lifecycle cleanup', async () => {
            const removal: Deferred<void> = createDeferred<void>();

            await startRunning();
            listenerHandles[0].remove.mockReturnValueOnce(removal.promise);

            const stopping: Promise<void> = service.stop();

            expect(lensEngineServiceStub.stopCamera).toHaveBeenCalledTimes(1);
            expect(service.state.status).toBe(SessionStatus.IDLE);

            removal.resolve();
            await stopping;
        });

        it('should log and resolve when the camera fails to stop', async () => {
            await startRunning();
            lensEngineServiceStub.stopCamera.mockRejectedValueOnce(new Error('camera busy'));

            await expect(service.stop()).resolves.toBeUndefined();

            expect(loggerServiceStub.error).toHaveBeenCalledWith('session-stop-failed', expect.any(Error));
            expect(service.state.status).toBe(SessionStatus.IDLE);
        });

        it('should still stop the camera when the lifecycle listener fails to unregister', async () => {
            await startRunning();
            listenerHandles[0].remove.mockRejectedValueOnce(new Error('bridge unavailable'));

            await service.stop();

            expect(lensEngineServiceStub.stopCamera).toHaveBeenCalledTimes(1);
            expect(loggerServiceStub.error).toHaveBeenCalledWith('lifecycle-unregister-failed', expect.any(Error));
        });

        it('should register a new lifecycle listener on the next start', async () => {
            await startRunning();
            await service.stop();
            await startRunning();

            expect(appPluginStub.addListener).toHaveBeenCalledTimes(2);
        });
    });

    describe('freeze', () => {
        it('should suspend the coordinator, freeze the frame and report FROZEN', async () => {
            await startRunning();

            await service.freeze();

            expect(recognitionCoordinatorServiceStub.setSuspended).toHaveBeenCalledWith(true);
            expect(lensEngineServiceStub.freezeFrame).toHaveBeenCalledTimes(1);
            expect(service.state.status).toBe(SessionStatus.FROZEN);
        });

        it('should do nothing when the session is not running', async () => {
            await service.freeze();

            expect(lensEngineServiceStub.freezeFrame).not.toHaveBeenCalled();
            expect(service.state.status).toBe(SessionStatus.IDLE);
        });

        it('should resume the coordinator and keep RUNNING when freezing fails', async () => {
            await startRunning();
            lensEngineServiceStub.freezeFrame.mockRejectedValueOnce(new Error('freeze failed'));

            await expect(service.freeze()).rejects.toThrow('freeze failed');

            expect(recognitionCoordinatorServiceStub.setSuspended).toHaveBeenLastCalledWith(false);
            expect(service.state.status).toBe(SessionStatus.RUNNING);
        });

        it('should stay IDLE when stopped while the frame was freezing', async () => {
            const freezing: Deferred<void> = createDeferred<void>();

            await startRunning();
            lensEngineServiceStub.freezeFrame.mockReturnValueOnce(freezing.promise);

            const freeze: Promise<void> = service.freeze();
            await flushPromises();
            await service.stop();
            freezing.resolve();
            await freeze;

            expect(service.state.status).toBe(SessionStatus.IDLE);
        });

        it('should allow freezing again after a failed attempt', async () => {
            await startRunning();
            lensEngineServiceStub.freezeFrame.mockRejectedValueOnce(new Error('freeze failed'));

            await expect(service.freeze()).rejects.toThrow('freeze failed');
            await service.freeze();

            expect(service.state.status).toBe(SessionStatus.FROZEN);
        });
    });

    describe('unfreeze', () => {
        it('should unfreeze the frame, resume the coordinator and report RUNNING', async () => {
            await startRunning();
            await service.freeze();

            await service.unfreeze();

            expect(lensEngineServiceStub.unfreezeFrame).toHaveBeenCalledTimes(1);
            expect(recognitionCoordinatorServiceStub.setSuspended).toHaveBeenLastCalledWith(false);
            expect(service.state.status).toBe(SessionStatus.RUNNING);
        });

        it('should do nothing when the session is not frozen', async () => {
            await startRunning();

            await service.unfreeze();

            expect(lensEngineServiceStub.unfreezeFrame).not.toHaveBeenCalled();
            expect(service.state.status).toBe(SessionStatus.RUNNING);
        });

        it('should stay FROZEN and rethrow when unfreezing fails', async () => {
            await startRunning();
            await service.freeze();
            lensEngineServiceStub.unfreezeFrame.mockRejectedValueOnce(new Error('unfreeze failed'));

            await expect(service.unfreeze()).rejects.toThrow('unfreeze failed');

            expect(service.state.status).toBe(SessionStatus.FROZEN);
        });
    });

    describe('toggleFreeze', () => {
        it('should alternate between FROZEN and RUNNING', async () => {
            await startRunning();

            await service.toggleFreeze();

            expect(service.state.status).toBe(SessionStatus.FROZEN);

            await service.toggleFreeze();

            expect(service.state.status).toBe(SessionStatus.RUNNING);
        });

        it('should apply quick consecutive toggles in order', async () => {
            await startRunning();

            await Promise.all([service.toggleFreeze(), service.toggleFreeze()]);

            expect(lensEngineServiceStub.freezeFrame).toHaveBeenCalledTimes(1);
            expect(lensEngineServiceStub.unfreezeFrame).toHaveBeenCalledTimes(1);
            expect(service.state.status).toBe(SessionStatus.RUNNING);
        });
    });

    describe('app lifecycle', () => {
        it('should save pending history entries when the app goes to the background', async () => {
            await startRunning();

            await changeAppState(false);

            expect(historyServiceStub.flush).toHaveBeenCalledTimes(1);

            await changeAppState(true);

            expect(historyServiceStub.flush).toHaveBeenCalledTimes(1);
        });

        it('should pause when the app goes to the background and resume in the foreground', async () => {
            await startRunning();

            await changeAppState(false);

            expect(service.state.status).toBe(SessionStatus.PAUSED);
            expect(recognitionCoordinatorServiceStub.setSuspended).toHaveBeenLastCalledWith(true);
            expect(lensEngineServiceStub.pauseAnalysis).toHaveBeenCalledTimes(1);

            await changeAppState(true);

            expect(service.state.status).toBe(SessionStatus.RUNNING);
            expect(recognitionCoordinatorServiceStub.setSuspended).toHaveBeenLastCalledWith(false);
            expect(lensEngineServiceStub.resumeAnalysis).toHaveBeenCalledTimes(1);
        });

        it('should resume after a quick background and foreground switch', async () => {
            const pausing: Deferred<void> = createDeferred<void>();

            await startRunning();
            lensEngineServiceStub.pauseAnalysis.mockReturnValueOnce(pausing.promise);

            appStateListeners[0]({ isActive: false });
            appStateListeners[0]({ isActive: true });
            pausing.resolve();
            await flushPromises();

            expect(service.state.status).toBe(SessionStatus.RUNNING);
            expect(lensEngineServiceStub.resumeAnalysis).toHaveBeenCalledTimes(1);
        });

        it('should ignore the foreground event when the session was not paused by the app', async () => {
            await startRunning();

            await changeAppState(true);

            expect(lensEngineServiceStub.resumeAnalysis).not.toHaveBeenCalled();
            expect(service.state.status).toBe(SessionStatus.RUNNING);
        });

        it('should keep a frozen session frozen in the background', async () => {
            await startRunning();
            await service.freeze();

            await changeAppState(false);
            await changeAppState(true);

            expect(lensEngineServiceStub.pauseAnalysis).not.toHaveBeenCalled();
            expect(service.state.status).toBe(SessionStatus.FROZEN);
        });

        it('should not resume a session that was stopped in the background', async () => {
            await startRunning();
            await changeAppState(false);
            const listener: AppStateListener = appStateListeners[0];

            await service.stop();
            listener({ isActive: true });
            await flushPromises();

            expect(lensEngineServiceStub.resumeAnalysis).not.toHaveBeenCalled();
            expect(service.state.status).toBe(SessionStatus.IDLE);
        });

        it('should log lifecycle failures', async () => {
            await startRunning();
            lensEngineServiceStub.pauseAnalysis.mockRejectedValueOnce(new Error('pause failed'));

            await changeAppState(false);

            expect(loggerServiceStub.error).toHaveBeenCalledWith('lifecycle-change-failed', expect.any(Error));
            expect(service.state.status).toBe(SessionStatus.PAUSED);
        });
    });

    describe('blocked camera permission', () => {
        async function startBlocked(): Promise<void> {
            lensEngineServiceStub.checkPermission.mockResolvedValueOnce('denied');
            lensEngineServiceStub.requestPermission.mockResolvedValueOnce('denied');

            await expect(service.start()).resolves.toBe(SessionStatus.PERMISSION_BLOCKED);
        }

        it('should open the app settings through the engine', async () => {
            await service.openAppSettings();

            expect(lensEngineServiceStub.openAppSettings).toHaveBeenCalledTimes(1);
        });

        it('should start once the permission was granted in the settings and the app comes back', async () => {
            await startBlocked();
            lensEngineServiceStub.requestPermission.mockClear();

            await changeAppState(false);
            await changeAppState(true);

            expect(lensEngineServiceStub.requestPermission).not.toHaveBeenCalled();
            expect(lensEngineServiceStub.startCamera).toHaveBeenCalledTimes(1);
            expect(service.state.status).toBe(SessionStatus.RUNNING);
            expect(appPluginStub.addListener).toHaveBeenCalledTimes(1);
        });

        it('should only check, never request, the permission when the app comes back still blocked', async () => {
            await startBlocked();
            lensEngineServiceStub.requestPermission.mockClear();
            lensEngineServiceStub.checkPermission.mockResolvedValue('denied');

            await changeAppState(true);
            await changeAppState(true);

            expect(lensEngineServiceStub.checkPermission).toHaveBeenCalledTimes(3);
            expect(lensEngineServiceStub.requestPermission).not.toHaveBeenCalled();
            expect(lensEngineServiceStub.startCamera).not.toHaveBeenCalled();
            expect(service.state.status).toBe(SessionStatus.PERMISSION_BLOCKED);
        });

        it('should stop listening to the app lifecycle when the blocked session is stopped', async () => {
            await startBlocked();

            await service.stop();

            expect(listenerHandles[0].remove).toHaveBeenCalledTimes(1);
            expect(service.state.status).toBe(SessionStatus.IDLE);
        });
    });

    describe('camera permission rejected by the engine', () => {
        beforeEach(() => {
            lensEngineServiceStub.startCamera.mockRejectedValueOnce(createPermissionError());
        });

        it('should report PERMISSION_BLOCKED, release the camera and watch the app lifecycle when the permission is denied', async () => {
            lensEngineServiceStub.checkPermission.mockResolvedValueOnce('granted').mockResolvedValueOnce('denied');

            await expect(service.start()).resolves.toBe(SessionStatus.PERMISSION_BLOCKED);

            expect(service.state.status).toBe(SessionStatus.PERMISSION_BLOCKED);
            expect(recognitionCoordinatorServiceStub.stop).toHaveBeenCalledTimes(1);
            expect(lensEngineServiceStub.stopCamera).toHaveBeenCalledTimes(1);
            expect(appPluginStub.addListener).toHaveBeenCalledWith('appStateChange', expect.any(Function));
            expect(loggerServiceStub.warn).toHaveBeenCalledWith('session-start-permission-rejected', { code: 'PERMISSION_DENIED' });
            expect(loggerServiceStub.error).not.toHaveBeenCalled();
        });

        it('should report PERMISSION_DENIED when the permission can still be asked again', async () => {
            lensEngineServiceStub.checkPermission.mockResolvedValueOnce('granted').mockResolvedValueOnce('prompt');

            await expect(service.start()).resolves.toBe(SessionStatus.PERMISSION_DENIED);

            expect(service.state.status).toBe(SessionStatus.PERMISSION_DENIED);
            expect(lensEngineServiceStub.stopCamera).toHaveBeenCalledTimes(1);
            expect(appPluginStub.addListener).not.toHaveBeenCalled();
        });

        it('should report PERMISSION_DENIED when the system asks for a rationale before asking again', async () => {
            lensEngineServiceStub.checkPermission.mockResolvedValueOnce('granted').mockResolvedValueOnce('prompt-with-rationale');

            await expect(service.start()).resolves.toBe(SessionStatus.PERMISSION_DENIED);
        });

        it('should report PERMISSION_BLOCKED when the camera is refused although the permission reads as granted', async () => {
            await expect(service.start()).resolves.toBe(SessionStatus.PERMISSION_BLOCKED);

            expect(lensEngineServiceStub.checkPermission).toHaveBeenCalledTimes(2);
            expect(lensEngineServiceStub.requestPermission).not.toHaveBeenCalled();
        });

        it('should report ERROR when the permission cannot be checked after the rejection', async () => {
            lensEngineServiceStub.checkPermission.mockResolvedValueOnce('granted').mockRejectedValueOnce(new Error('bridge unavailable'));

            await expect(service.start()).resolves.toBe(SessionStatus.ERROR);

            expect(loggerServiceStub.error).toHaveBeenCalledWith('session-permission-check-failed', expect.any(Error));
        });

        it('should report ERROR when the lifecycle listener cannot be registered for the blocked permission', async () => {
            lensEngineServiceStub.checkPermission.mockResolvedValueOnce('granted').mockResolvedValueOnce('denied');
            appPluginStub.addListener.mockRejectedValueOnce(new Error('bridge unavailable'));

            await expect(service.start()).resolves.toBe(SessionStatus.ERROR);
        });

        it('should not report a result when stopped while the permission is checked again', async () => {
            const permission: Deferred<PermissionState> = createDeferred<PermissionState>();
            lensEngineServiceStub.checkPermission.mockResolvedValueOnce('granted').mockReturnValueOnce(permission.promise);

            const starting: Promise<SessionStatus> = service.start();
            await flushPromises();
            await service.stop();
            permission.resolve('denied');

            await expect(starting).resolves.toBe(SessionStatus.IDLE);

            expect(service.state.status).toBe(SessionStatus.IDLE);
            expect(appPluginStub.addListener).not.toHaveBeenCalled();
        });

        it('should start once the permission was granted and the app comes back', async () => {
            lensEngineServiceStub.checkPermission.mockResolvedValueOnce('granted').mockResolvedValueOnce('denied');
            await expect(service.start()).resolves.toBe(SessionStatus.PERMISSION_BLOCKED);

            await changeAppState(true);

            expect(lensEngineServiceStub.startCamera).toHaveBeenCalledTimes(2);
            expect(service.state.status).toBe(SessionStatus.RUNNING);
        });
    });

    describe('engine errors', () => {
        it('should report ERROR and release the camera on a critical camera error', async () => {
            await startRunning();

            engineErrors$.next({ code: 'CAMERA_ERROR', message: 'The camera reported a critical error' });
            await flushPromises();

            expect(service.state.status).toBe(SessionStatus.ERROR);
            expect(recognitionCoordinatorServiceStub.stop).toHaveBeenCalledTimes(1);
            expect(lensEngineServiceStub.stopCamera).toHaveBeenCalledTimes(1);
            expect(listenerHandles[0].remove).toHaveBeenCalledTimes(1);
            expect(loggerServiceStub.warn).toHaveBeenCalledWith('engine-error', { code: 'CAMERA_ERROR' });
        });

        it('should only log transient recognition errors', async () => {
            await startRunning();

            engineErrors$.next({ code: 'OCR_FAILED', message: 'Text recognition failed' });
            await flushPromises();

            expect(service.state.status).toBe(SessionStatus.RUNNING);
            expect(lensEngineServiceStub.stopCamera).not.toHaveBeenCalled();
            expect(loggerServiceStub.warn).toHaveBeenCalledWith('engine-error', { code: 'OCR_FAILED' });
        });

        it('should ignore critical errors while idle', async () => {
            engineErrors$.next({ code: 'CAMERA_ERROR', message: 'The camera reported a critical error' });
            await flushPromises();

            expect(service.state.status).toBe(SessionStatus.IDLE);
            expect(lensEngineServiceStub.stopCamera).not.toHaveBeenCalled();
        });

        it('should supersede a start that is still in progress', async () => {
            const cameraStart: Deferred<void> = createDeferred<void>();
            lensEngineServiceStub.startCamera.mockReturnValueOnce(cameraStart.promise);

            const starting: Promise<SessionStatus> = service.start();
            await flushPromises();
            engineErrors$.next({ code: 'CAMERA_UNAVAILABLE', message: 'Camera in use' });
            await flushPromises();
            cameraStart.resolve();

            await expect(starting).resolves.toBe(SessionStatus.ERROR);

            expect(service.state.status).toBe(SessionStatus.ERROR);
        });

        it('should allow a retry after a critical error', async () => {
            await startRunning();
            engineErrors$.next({ code: 'CAMERA_ERROR', message: 'The camera reported a critical error' });
            await flushPromises();

            await startRunning();

            expect(service.state.status).toBe(SessionStatus.RUNNING);
        });
    });

    describe('updateAnalysisRate', () => {
        it('should update the rate while running', async () => {
            await startRunning();

            await service.updateAnalysisRate(2);

            expect(lensEngineServiceStub.setAnalysisRate).toHaveBeenCalledWith(2);
        });

        it('should update the rate while frozen', async () => {
            await startRunning();
            await service.freeze();

            await service.updateAnalysisRate(5);

            expect(lensEngineServiceStub.setAnalysisRate).toHaveBeenCalledWith(5);
        });

        it('should ignore the rate while idle', async () => {
            await service.updateAnalysisRate(2);

            expect(lensEngineServiceStub.setAnalysisRate).not.toHaveBeenCalled();
        });

        it('should ignore the rate while paused', async () => {
            await startRunning();
            await changeAppState(false);

            await service.updateAnalysisRate(2);

            expect(lensEngineServiceStub.setAnalysisRate).not.toHaveBeenCalled();
        });
    });
});
