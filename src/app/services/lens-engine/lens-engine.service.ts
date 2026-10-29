import { Inject, Injectable } from '@angular/core';
import { PermissionState, PluginListenerHandle } from '@capacitor/core';
import { Observable, Subject } from 'rxjs';
import {
    CameraDevice
,   CameraListResponse
,   CameraPermissionStatus
,   DownloadedModelsResponse
,   EngineCapabilities
,   EngineErrorEvent
,   EngineStatusEvent
,   IdentifyLanguageResponse
,   LanguagePair
,   LensEnginePlugin
,   RecognitionEvent
,   ScreenRect
,   TranslateResponse
} from 'src/app/shared/models';
import { CAMERA_PREVIEW_HOST_ID, GeometryUtils, PREVIEW_VIEWPORT_TOLERANCE } from 'src/app/shared/utils';
import { LoggerService } from '../logger/logger.service';
import { LENS_ENGINE_PLUGIN } from './lens-engine.plugin';

@Injectable({
    providedIn: 'root'
})
export class LensEngineService {
    private _capabilities: Promise<EngineCapabilities> | null = null;
    private _errors$: Subject<EngineErrorEvent> = new Subject<EngineErrorEvent>();
    private _listenerHandles: Promise<PluginListenerHandle[]> | null = null;
    private _previewViewport: ScreenRect | null = null;
    private _previewViewportSent: boolean = false;
    private _recognition$: Subject<RecognitionEvent> = new Subject<RecognitionEvent>();
    private _statuses$: Subject<EngineStatusEvent> = new Subject<EngineStatusEvent>();

    constructor(
        @Inject(LENS_ENGINE_PLUGIN) private lensEnginePlugin: LensEnginePlugin,
        private loggerService: LoggerService,
    ) {}

    get previewViewport(): ScreenRect | null {
        return this._previewViewport;
    }

    checkPermission(): Promise<PermissionState> {
        return this.lensEnginePlugin.checkPermissions().then((status: CameraPermissionStatus) => status.camera);
    }

    deleteModel(language: string): Promise<void> {
        return this.lensEnginePlugin.deleteModel({ language: language });
    }

    downloadModel(language: string, requireWifi: boolean, targetLanguage: string): Promise<void> {
        return this.lensEnginePlugin.downloadModel({ language: language, requireWifi: requireWifi, targetLanguage: targetLanguage });
    }

    errors(): Observable<EngineErrorEvent> {
        return this._errors$.asObservable();
    }

    freezeFrame(): Promise<void> {
        return this.lensEnginePlugin.freezeFrame();
    }

    getCapabilities(): Promise<EngineCapabilities> {
        if (this._capabilities) {
            return this._capabilities;
        }

        const capabilities: Promise<EngineCapabilities> = this.lensEnginePlugin.getCapabilities();

        this._capabilities = capabilities;
        capabilities.catch((): void => {
            if (this._capabilities === capabilities) {
                this._capabilities = null;
            }
        });

        return capabilities;
    }

    getDownloadedModels(targetLanguage: string): Promise<string[]> {
        return this.lensEnginePlugin.getDownloadedModels({ targetLanguage: targetLanguage }).then((response: DownloadedModelsResponse) => response.languages);
    }

    identifyLanguage(text: string): Promise<IdentifyLanguageResponse> {
        return this.lensEnginePlugin.identifyLanguage({ text: text });
    }

    listCameras(): Promise<CameraDevice[]> {
        return this.lensEnginePlugin.listCameras().then((response: CameraListResponse) => response.cameras);
    }

    openAppSettings(): Promise<void> {
        return this.lensEnginePlugin.openAppSettings();
    }

    pauseAnalysis(): Promise<void> {
        return this.lensEnginePlugin.pauseAnalysis();
    }

    recognition(): Observable<RecognitionEvent> {
        return this._recognition$.asObservable();
    }

    requestPermission(): Promise<PermissionState> {
        return this.lensEnginePlugin.requestPermissions().then((status: CameraPermissionStatus) => status.camera);
    }

    resumeAnalysis(): Promise<void> {
        return this.lensEnginePlugin.resumeAnalysis();
    }

    selectCamera(cameraId: string): Promise<void> {
        return this.lensEnginePlugin.selectCamera({ cameraId: cameraId });
    }

    setAnalysisRate(analysesPerSecond: number): Promise<void> {
        return this.lensEnginePlugin.setAnalysisRate({ analysesPerSecond: analysesPerSecond });
    }

    async setPreviewViewport(viewport: ScreenRect | null): Promise<void> {
        const previewViewport: ScreenRect | null = GeometryUtils.normalizeScreenRect(viewport);

        if (this._previewViewportSent && GeometryUtils.sameScreenRect(this._previewViewport, previewViewport, PREVIEW_VIEWPORT_TOLERANCE)) {
            return;
        }

        this._previewViewport = previewViewport;
        this._previewViewportSent = true;

        try {
            await this.lensEnginePlugin.setPreviewViewport({ viewport: previewViewport });
        } catch (error: unknown) {
            if (this._previewViewport === previewViewport) {
                this._previewViewportSent = false;
            }

            this.loggerService.error('preview-viewport-failed', error);
        }
    }

    async startCamera(analysesPerSecond: number, recognitionLanguages: string[]): Promise<void> {
        await this.attachListeners();

        const previewViewport: ScreenRect | null = this._previewViewport;

        await this.lensEnginePlugin.startCamera({
            analysesPerSecond: analysesPerSecond,
            previewHostId: CAMERA_PREVIEW_HOST_ID,
            recognitionLanguages: recognitionLanguages,
            viewport: previewViewport,
        });

        if (this._previewViewport === previewViewport) {
            this._previewViewportSent = true;
        }
    }

    statuses(): Observable<EngineStatusEvent> {
        return this._statuses$.asObservable();
    }

    async stopCamera(): Promise<void> {
        const listenerHandles: Promise<PluginListenerHandle[]> | null = this._listenerHandles;
        this._listenerHandles = null;

        try {
            await this.lensEnginePlugin.stopCamera();
        } finally {
            await this.detachListeners(listenerHandles);
        }
    }

    translate(text: string, languagePair: LanguagePair): Promise<string> {
        return this.lensEnginePlugin
            .translate({ sourceLanguage: languagePair.sourceLanguage, targetLanguage: languagePair.targetLanguage, text: text })
            .then((response: TranslateResponse) => response.translatedText);
    }

    unfreezeFrame(): Promise<void> {
        return this.lensEnginePlugin.unfreezeFrame();
    }

    private async addListeners(): Promise<PluginListenerHandle[]> {
        const results: PromiseSettledResult<PluginListenerHandle>[] = await Promise.allSettled([
            this.lensEnginePlugin.addListener('textRecognized', (event: RecognitionEvent) => this._recognition$.next(event)),
            this.lensEnginePlugin.addListener('engineError', (event: EngineErrorEvent) => this._errors$.next(event)),
            this.lensEnginePlugin.addListener('engineStatus', (event: EngineStatusEvent) => this._statuses$.next(event)),
        ]);
        const handles: PluginListenerHandle[] = results
            .filter((result: PromiseSettledResult<PluginListenerHandle>): result is PromiseFulfilledResult<PluginListenerHandle> => result.status === 'fulfilled')
            .map((result: PromiseFulfilledResult<PluginListenerHandle>) => result.value);
        const failure: PromiseRejectedResult | undefined = results.find(
            (result: PromiseSettledResult<PluginListenerHandle>): result is PromiseRejectedResult => result.status === 'rejected',
        );

        if (failure) {
            await this.removeHandles(handles);
            throw failure.reason;
        }

        return handles;
    }

    private attachListeners(): Promise<PluginListenerHandle[]> {
        if (this._listenerHandles) {
            return this._listenerHandles;
        }

        const attaching: Promise<PluginListenerHandle[]> = this.addListeners();
        this._listenerHandles = attaching;
        attaching.catch(() => {
            if (this._listenerHandles === attaching) {
                this._listenerHandles = null;
            }
        });

        return attaching;
    }

    private async detachListeners(listenerHandles: Promise<PluginListenerHandle[]> | null): Promise<void> {
        if (!listenerHandles) {
            return;
        }

        const handles: PluginListenerHandle[] = await listenerHandles.catch((): PluginListenerHandle[] => []);

        await this.removeHandles(handles);
    }

    private async removeHandles(handles: PluginListenerHandle[]): Promise<void> {
        await Promise.allSettled(handles.map((handle: PluginListenerHandle) => handle.remove()));
    }
}
