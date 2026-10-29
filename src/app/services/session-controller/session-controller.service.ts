import { Inject, Injectable } from '@angular/core';
import { AppPlugin, AppState } from '@capacitor/app';
import { PermissionState, PluginListenerHandle } from '@capacitor/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
    AppSettings
,   EngineCapabilities
,   EngineErrorEvent
,   LanguagePair
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

const ACTIVE_STATUSES: SessionStatus[] = [SessionStatus.FROZEN, SessionStatus.PAUSED, SessionStatus.RUNNING, SessionStatus.STARTING];

const CAMERA_BLOCKED_ERROR: string = 'CAMERA_BLOCKED_BY_SYSTEM';

const CRITICAL_ENGINE_ERRORS: string[] = ['CAMERA_ERROR', 'CAMERA_UNAVAILABLE'];

const PERMISSION_DENIED_ERROR: string = 'PERMISSION_DENIED';

const REQUESTABLE_PERMISSIONS: PermissionState[] = ['prompt', 'prompt-with-rationale'];

@Injectable({
    providedIn: 'root'
})
export class SessionControllerService {
    private _appStateHandle: Promise<PluginListenerHandle> | null = null;
    private _resumeOnForeground: boolean = false;
    private _startToken: number = 0;
    private _state$: BehaviorSubject<SessionState>;
    private _transition: Promise<void> = Promise.resolve();

    constructor(
        @Inject(APP_PLUGIN) private appPlugin: AppPlugin,
        private historyService: HistoryService,
        private languageModelService: LanguageModelService,
        private lensEngineService: LensEngineService,
        private loggerService: LoggerService,
        private preferencesService: PreferencesService,
        private recognitionCoordinatorService: RecognitionCoordinatorService,
    ) {
        this._state$ = new BehaviorSubject<SessionState>({
            languagePair: this.currentLanguagePair(),
            missingLanguages: [],
            status: SessionStatus.IDLE,
        });
        this.lensEngineService.errors().subscribe((event: EngineErrorEvent) => {
            this.handleEngineError(event).catch((error: unknown) => this.loggerService.error('engine-error-handling-failed', error));
        });
    }

    get state(): SessionState {
        return this._state$.value;
    }

    changes(): Observable<SessionState> {
        return this._state$.asObservable();
    }

    freeze(): Promise<void> {
        return this.scheduleTransition((): Promise<void> => this.applyFreeze());
    }

    getCapabilities(): Promise<EngineCapabilities> {
        return this.lensEngineService.getCapabilities();
    }

    openAppSettings(): Promise<void> {
        return this.lensEngineService.openAppSettings();
    }

    setManualSourceLanguage(language: string): void {
        this.recognitionCoordinatorService.setManualSourceLanguage(language);
    }

    setPreviewViewport(viewport: ScreenRect | null): Promise<void> {
        return this.lensEngineService.setPreviewViewport(viewport);
    }

    async start(): Promise<SessionStatus> {
        const token: number = ++this._startToken;
        const settings: AppSettings = this.preferencesService.settings;
        const languagePair: LanguagePair = this.currentLanguagePair();

        this._state$.next({ languagePair: languagePair, missingLanguages: [], status: SessionStatus.STARTING });

        try {
            const permission: PermissionState = await this.ensurePermission(token);

            if (token !== this._startToken) {
                return this.state.status;
            }

            if (permission !== 'granted') {
                return await this.applyPermissionState(token, permission);
            }

            const missingLanguages: string[] = await this.languageModelService.missingLanguages(languagePair);

            if (token !== this._startToken) {
                return this.state.status;
            }

            if (missingLanguages.length > 0) {
                await this.stopCameraSafely();

                if (token !== this._startToken) {
                    return this.state.status;
                }

                this._state$.next({ languagePair: languagePair, missingLanguages: missingLanguages, status: SessionStatus.MODEL_MISSING });
                return SessionStatus.MODEL_MISSING;
            }

            this.recognitionCoordinatorService.start(languagePair);
            await this.lensEngineService.startCamera(settings.analysesPerSecond, this.recognitionLanguages(languagePair));

            if (token !== this._startToken) {
                return this.state.status;
            }

            await this.registerLifecycle();

            if (token !== this._startToken) {
                return this.state.status;
            }

            return this.setStatus(SessionStatus.RUNNING);
        } catch (error: unknown) {
            return this.handleStartFailure(token, error);
        }
    }

    async stop(): Promise<void> {
        this._startToken++;
        this._resumeOnForeground = false;
        this.recognitionCoordinatorService.stop();
        this._state$.next({ languagePair: this.currentLanguagePair(), missingLanguages: [], status: SessionStatus.IDLE });

        await Promise.all([this.historyService.flush(), this.unregisterLifecycle(), this.stopCameraSafely()]);
    }

    toggleFreeze(): Promise<void> {
        return this.scheduleTransition((): Promise<void> =>
            this.state.status === SessionStatus.FROZEN ? this.applyUnfreeze() : this.applyFreeze(),
        );
    }

    unfreeze(): Promise<void> {
        return this.scheduleTransition((): Promise<void> => this.applyUnfreeze());
    }

    async updateAnalysisRate(analysesPerSecond: number): Promise<void> {
        if (this.state.status === SessionStatus.RUNNING || this.state.status === SessionStatus.FROZEN) {
            await this.lensEngineService.setAnalysisRate(analysesPerSecond);
        }
    }

    private async applyFreeze(): Promise<void> {
        if (this.state.status !== SessionStatus.RUNNING) {
            return;
        }

        const token: number = this._startToken;

        this.recognitionCoordinatorService.setSuspended(true);

        try {
            await this.lensEngineService.freezeFrame();
        } catch (error: unknown) {
            if (this.isCurrent(token, SessionStatus.RUNNING)) {
                this.recognitionCoordinatorService.setSuspended(false);
            }

            throw error;
        }

        if (this.isCurrent(token, SessionStatus.RUNNING)) {
            this.setStatus(SessionStatus.FROZEN);
        }
    }

    private async applyPermissionRejection(token: number): Promise<SessionStatus> {
        try {
            const permission: PermissionState = await this.lensEngineService.checkPermission();

            if (token !== this._startToken) {
                return this.state.status;
            }

            return await this.applyPermissionState(token, permission);
        } catch (error: unknown) {
            this.loggerService.error('session-permission-check-failed', error);

            return token === this._startToken ? this.setStatus(SessionStatus.ERROR) : this.state.status;
        }
    }

    private async applyPermissionState(token: number, permission: PermissionState): Promise<SessionStatus> {
        if (REQUESTABLE_PERMISSIONS.includes(permission)) {
            return this.setStatus(SessionStatus.PERMISSION_DENIED);
        }

        await this.registerLifecycle();

        return token === this._startToken ? this.setStatus(SessionStatus.PERMISSION_BLOCKED) : this.state.status;
    }

    private async applyUnfreeze(): Promise<void> {
        if (this.state.status !== SessionStatus.FROZEN) {
            return;
        }

        const token: number = this._startToken;

        await this.lensEngineService.unfreezeFrame();

        if (this.isCurrent(token, SessionStatus.FROZEN)) {
            this.recognitionCoordinatorService.setSuspended(false);
            this.setStatus(SessionStatus.RUNNING);
        }
    }

    private currentLanguagePair(): LanguagePair {
        const settings: AppSettings = this.preferencesService.settings;

        return { sourceLanguage: settings.sourceLanguage, targetLanguage: settings.targetLanguage };
    }

    private async ensurePermission(token: number): Promise<PermissionState> {
        const permission: PermissionState = await this.lensEngineService.checkPermission();

        if (permission === 'granted' || token !== this._startToken) {
            return permission;
        }

        return this.lensEngineService.requestPermission();
    }

    private errorCode(error: unknown): string | null {
        if (typeof error !== 'object' || error === null || !('code' in error)) {
            return null;
        }

        const code: unknown = error.code;

        return typeof code === 'string' ? code : null;
    }

    private async handleAppStateChange(state: AppState): Promise<void> {
        if (!state.isActive) {
            void this.historyService.flush();
        }

        if (!state.isActive && this.state.status === SessionStatus.RUNNING) {
            this._resumeOnForeground = true;
            this.recognitionCoordinatorService.setSuspended(true);
            this.setStatus(SessionStatus.PAUSED);
            await this.lensEngineService.pauseAnalysis();
            return;
        }

        if (state.isActive && this._resumeOnForeground && this.state.status === SessionStatus.PAUSED) {
            this._resumeOnForeground = false;
            this.recognitionCoordinatorService.setSuspended(false);
            this.setStatus(SessionStatus.RUNNING);
            await this.lensEngineService.resumeAnalysis();
            return;
        }

        if (state.isActive && this.state.status === SessionStatus.PERMISSION_BLOCKED) {
            await this.recheckPermission();
        }
    }

    private async handleEngineError(event: EngineErrorEvent): Promise<void> {
        this.loggerService.warn('engine-error', { code: event.code });

        if (!CRITICAL_ENGINE_ERRORS.includes(event.code) || !ACTIVE_STATUSES.includes(this.state.status)) {
            return;
        }

        this._startToken++;
        this._resumeOnForeground = false;
        this.recognitionCoordinatorService.stop();
        this.setStatus(SessionStatus.ERROR);

        await Promise.all([this.unregisterLifecycle(), this.stopCameraSafely()]);
    }

    private async handleStartFailure(token: number, error: unknown): Promise<SessionStatus> {
        const errorCode: string | null = this.errorCode(error);
        const cameraBlocked: boolean = errorCode === CAMERA_BLOCKED_ERROR;
        const permissionRejected: boolean = errorCode === PERMISSION_DENIED_ERROR;

        if (permissionRejected) {
            this.loggerService.warn('session-start-permission-rejected', { code: PERMISSION_DENIED_ERROR });
        } else if (cameraBlocked) {
            this.loggerService.warn('session-start-camera-blocked', { code: CAMERA_BLOCKED_ERROR });
        } else {
            this.loggerService.error('session-start-failed', error);
        }

        if (token !== this._startToken) {
            return this.state.status;
        }

        this.recognitionCoordinatorService.stop();
        await this.stopCameraSafely();

        if (token !== this._startToken) {
            return this.state.status;
        }

        if (permissionRejected) {
            return this.applyPermissionRejection(token);
        }

        return this.setStatus(cameraBlocked ? SessionStatus.CAMERA_BLOCKED : SessionStatus.ERROR);
    }

    private isCurrent(token: number, status: SessionStatus): boolean {
        return token === this._startToken && this.state.status === status;
    }

    private async recheckPermission(): Promise<void> {
        const token: number = this._startToken;
        const permission: PermissionState = await this.lensEngineService.checkPermission();

        if (permission === 'granted' && this.isCurrent(token, SessionStatus.PERMISSION_BLOCKED)) {
            await this.start();
        }
    }

    private recognitionLanguages(languagePair: LanguagePair): string[] {
        return [languagePair.targetLanguage, languagePair.sourceLanguage]
            .filter((language: string, index: number, languages: string[]) => language !== AUTO_LANGUAGE && languages.indexOf(language) === index);
    }

    private async registerLifecycle(): Promise<void> {
        if (!this._appStateHandle) {
            const registering: Promise<PluginListenerHandle> = this.appPlugin.addListener('appStateChange', (state: AppState) => {
                this.handleAppStateChange(state).catch((error: unknown) => this.loggerService.error('lifecycle-change-failed', error));
            });

            this._appStateHandle = registering;
            registering.catch(() => {
                if (this._appStateHandle === registering) {
                    this._appStateHandle = null;
                }
            });
        }

        await this._appStateHandle;
    }

    private scheduleTransition(transition: () => Promise<void>): Promise<void> {
        const result: Promise<void> = this._transition.then(transition);

        this._transition = result.catch((): void => undefined);

        return result;
    }

    private setStatus(status: SessionStatus): SessionStatus {
        this._state$.next({ ...this._state$.value, status: status });

        return status;
    }

    private async stopCameraSafely(): Promise<void> {
        try {
            await this.lensEngineService.stopCamera();
        } catch (error: unknown) {
            this.loggerService.error('session-stop-failed', error);
        }
    }

    private async unregisterLifecycle(): Promise<void> {
        const handle: Promise<PluginListenerHandle> | null = this._appStateHandle;
        this._appStateHandle = null;

        if (!handle) {
            return;
        }

        try {
            const listenerHandle: PluginListenerHandle = await handle;

            await listenerHandle.remove();
        } catch (error: unknown) {
            this.loggerService.error('lifecycle-unregister-failed', error);
        }
    }
}
