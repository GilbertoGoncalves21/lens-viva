import { OnlineTranslationService } from 'src/app/services/online-translation/online-translation.service';
import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Inject, OnDestroy, Renderer2, ViewChild } from '@angular/core';
import { FormBuilder, FormControl } from '@angular/forms';
import { Router } from '@angular/router';
import { AppPlugin } from '@capacitor/app';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { IonSelect, ViewDidEnter, ViewWillLeave } from '@ionic/angular';
import { arrowForwardOutline, cameraReverseOutline, chevronForwardOutline, cloudOfflineOutline, videocamOffOutline } from 'ionicons/icons';
import { Subscription, animationFrameScheduler, auditTime, fromEvent, merge } from 'rxjs';
import { AppLanguageService } from 'src/app/services/app-language/app-language.service';
import { APP_PLUGIN } from 'src/app/services/capacitor/capacitor-plugins';
import { LanguageConfirmationService } from 'src/app/services/language-confirmation/language-confirmation.service';
import { LanguageModelService } from 'src/app/services/language-model/language-model.service';
import { LensEngineService } from 'src/app/services/lens-engine/lens-engine.service';
import { LoggerService } from 'src/app/services/logger/logger.service';
import { OverlayStoreService } from 'src/app/services/overlay-store/overlay-store.service';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { SceneLanguageService } from 'src/app/services/scene-language/scene-language.service';
import { SessionControllerService } from 'src/app/services/session-controller/session-controller.service';
import { SplashService } from 'src/app/services/splash/splash.service';
import {
    AppSettings
,   CameraDevice
,   EngineCapabilities
,   EngineErrorEvent
,   EngineStatusCode
,   EngineStatusEvent
,   ModelInventory
,   OverlayItem
,   OverlayStatus
,   RegionGranularity
,   SceneLanguageState
,   SceneLanguageStatus
,   ScreenRect
,   SessionState
,   SessionStatus
} from 'src/app/shared/models';
import {
    AUTO_LANGUAGE
,   CAMERA_PREVIEW_HOST_ID
,   EMPTY
,   GeometryUtils
,   LATIN_SOURCE_LANGUAGES
,   RECOGNITION_SOURCE_LANGUAGES
,   LanguageUtils
,   PREVIEW_VIEWPORT_TOLERANCE
,   SwalUtils
,   UNDETERMINED_LANGUAGE
} from 'src/app/shared/utils';
import { environment } from 'src/environments/environment';

enum StatusLine {
    HINT                    = 'HINT',
    IDENTIFYING             = 'IDENTIFYING',
    LANGUAGE_PAIR           = 'LANGUAGE_PAIR',
    MISSING_PACK            = 'MISSING_PACK',
    NONE                    = 'NONE',
    RECOGNITION_LOADING     = 'RECOGNITION_LOADING',
    RECOGNITION_UNAVAILABLE = 'RECOGNITION_UNAVAILABLE',
    UNDETERMINED            = 'UNDETERMINED',
}

enum StatusPanel {
    BLACK_FRAMES            = 'BLACK_FRAMES',
    CAMERA_BLOCKED          = 'CAMERA_BLOCKED',
    ERROR                   = 'ERROR',
    MODEL_MISSING           = 'MODEL_MISSING',
    NONE                    = 'NONE',
    PAUSED                  = 'PAUSED',
    PERMISSION_BLOCKED      = 'PERMISSION_BLOCKED',
    PERMISSION_DENIED       = 'PERMISSION_DENIED',
    STARTING                = 'STARTING',
    TRANSLATION_UNSUPPORTED = 'TRANSLATION_UNSUPPORTED',
}

const ACTIVATION_REQUIRED_CODE: string = 'USER_ACTIVATION_REQUIRED';

const ANNOUNCEMENT_ID: string = 'camera-announcement';

const BLACK_FRAMES_NOTICE_ID: string = 'camera-black-frames-notice';

const BLOCKING_STATUS_PANELS: StatusPanel[] = [
    StatusPanel.CAMERA_BLOCKED
,   StatusPanel.ERROR
,   StatusPanel.MODEL_MISSING
,   StatusPanel.PERMISSION_BLOCKED
,   StatusPanel.PERMISSION_DENIED
];

const CAMERA_ACTIVE_CLASS: string = 'lens-camera-active';

const CAMERA_FALLBACK_LABEL_KEY: string = 'camera.cameraFallbackLabel';

const CAMERA_PICKER_MINIMUM: number = 3;

const DEFAULT_ENGINE_CAPABILITIES: EngineCapabilities = {
    cameraSelection: false,
    languageIdentification: true,
    modelRemoval: true,
    openAppSettings: true,
    translation: true,
};

const DOWNLOAD_ERROR_KEY: string = 'camera.downloadDetectedError';

const ENGINE_NOTICE_STATUSES: SessionStatus[] = [SessionStatus.FROZEN, SessionStatus.PAUSED, SessionStatus.RUNNING];

const FREEZE_BUTTON_ID: string = 'camera-freeze-button';

const FROZEN_NOTICE_ID: string = 'camera-frozen-notice';

const HINT_DELAY_MILLISECONDS: number = 2000;

const KNOWN_LANGUAGE_STATUSES: SceneLanguageStatus[] = [SceneLanguageStatus.FIXED, SceneLanguageStatus.IDENTIFIED, SceneLanguageStatus.MANUAL];

const LANGUAGE_STATUS_BUTTON_ID: string = 'camera-language-status';

const LIST_SEPARATOR: string = ', ';

const LIVE_STATUSES: SessionStatus[] = [SessionStatus.FROZEN, SessionStatus.RUNNING];

const NATIVE_BUTTON_SELECTOR: string = 'button';

const OCR_FAILED_CODE: string = 'OCR_FAILED';

const RESTARTABLE_SCENE_STATUSES: SceneLanguageStatus[] = [SceneLanguageStatus.IDENTIFIED, SceneLanguageStatus.MANUAL, SceneLanguageStatus.UNDETERMINED];

const SENTENCE_SEPARATOR: string = ' ';

const SETTINGS_BUTTON_ID: string = 'camera-settings-button';

const SETTINGS_ROUTE: string = '/settings';

const STATUS_AREA_ID: string = 'camera-status-area';

const STATUS_LINE_ID: string = 'camera-status-line';

const SWITCH_CAMERA_BUTTON_ID: string = 'camera-switch-button';

const FOCUS_FALLBACK_IDS: string[] = [LANGUAGE_STATUS_BUTTON_ID, FREEZE_BUTTON_ID, SWITCH_CAMERA_BUTTON_ID, SETTINGS_BUTTON_ID];

const TRANSLATION_UNSUPPORTED_CODE: string = 'TRANSLATION_UNSUPPORTED';

const DOWNLOAD_FAILURE_KEYS: Map<string, string> = new Map<string, string>([
    [ACTIVATION_REQUIRED_CODE, 'camera.downloadActivationRequired']
,   [TRANSLATION_UNSUPPORTED_CODE, 'camera.downloadUnsupportedError']
]);

const STATUS_PANELS: Map<SessionStatus, StatusPanel> = new Map<SessionStatus, StatusPanel>([
    [SessionStatus.CAMERA_BLOCKED, StatusPanel.CAMERA_BLOCKED]
,   [SessionStatus.ERROR, StatusPanel.ERROR]
,   [SessionStatus.PAUSED, StatusPanel.PAUSED]
,   [SessionStatus.PERMISSION_BLOCKED, StatusPanel.PERMISSION_BLOCKED]
,   [SessionStatus.PERMISSION_DENIED, StatusPanel.PERMISSION_DENIED]
,   [SessionStatus.STARTING, StatusPanel.STARTING]
]);

@Component({
    selector: 'app-camera',
    templateUrl: './camera.component.html',
    styleUrls: ['./camera.component.scss', './camera-surfaces.scss', './camera-delivery.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false,
})
export class CameraComponent implements OnDestroy, ViewDidEnter, ViewWillLeave {
    private _activation: number = 0;
    private _active: boolean = false;
    private _announcement: string = EMPTY;
    private _blackFrames: boolean = false;
    private _cameraControl: FormControl<string | null>;
    private _cameraRequest: number = 0;
    private _cameras: CameraDevice[] = [];
    private _capabilities: EngineCapabilities = DEFAULT_ENGINE_CAPABILITIES;
    private _currentLanguage: string;
    private _destroyed: boolean = false;
    private _downloadingLanguage: string | null = null;
    private _downloadingMissing: boolean = false;
    private _downloadRequiresWifi: boolean = false;
    @ViewChild('cameraFrame', { static: true }) private _frame: ElementRef<HTMLElement> | null = null;
    private _frameSubscription: Subscription | null = null;
    private _freezePending: boolean = false;
    private _hintDue: boolean = false;
    private _hintTimer: ReturnType<typeof setTimeout> | null = null;
    private _inventory: ModelInventory;
    private _items: OverlayItem[] = [];
    private _missingDownloadRequiresWifi: boolean = false;
    private _missingLanguagesText: string = EMPTY;
    private _nativePlatform: boolean;
    private _online: boolean;
    private _recognitionLoading: boolean = false;
    private _recognitionUnavailable: boolean = false;
    private _resizeObserver: ResizeObserver | null = null;
    private _resumeListener: Promise<PluginListenerHandle | null> | null = null;
    private _sceneLanguage: SceneLanguageState;
    private _settings: AppSettings;
    private _sourceLanguageControl: FormControl<string | null>;
    private _sourceLanguageOptions: string[];
    @ViewChild('cameraStage', { static: true }) private _stage: ElementRef<HTMLElement> | null = null;
    private _state: SessionState;
    private _statusLineKind: typeof StatusLine = StatusLine;
    private _statusPanelKind: typeof StatusPanel = StatusPanel;
    private _subscriptions: Subscription[] = [];
    private _switchingCamera: boolean = false;
    private _viewport: ScreenRect | null = null;
    private _viewportRequest: number | null = null;

    constructor(
        private appLanguageService: AppLanguageService,
        @Inject(APP_PLUGIN) private appPlugin: AppPlugin,
        private changeDetectorRef: ChangeDetectorRef,
        @Inject(DOCUMENT) private document: Document,
        private formBuilder: FormBuilder,
        private languageConfirmationService: LanguageConfirmationService,
        private languageModelService: LanguageModelService,
        private lensEngineService: LensEngineService,
        private loggerService: LoggerService,
        private overlayStoreService: OverlayStoreService,
        private preferencesService: PreferencesService,
        private renderer: Renderer2,
        private router: Router,
        private sceneLanguageService: SceneLanguageService,
        private sessionControllerService: SessionControllerService,
        private splashService: SplashService,
        private onlineTranslationService: OnlineTranslationService,
    ) {
        this._cameraControl = this.formBuilder.control<string | null>(null);
        this._currentLanguage = this.appLanguageService.currentLanguage;
        this._inventory = this.languageModelService.inventory;
        this._nativePlatform = Capacitor.isNativePlatform();
        this._online = this.document.defaultView?.navigator.onLine ?? true;
        this._sceneLanguage = this.sceneLanguageService.state;
        this._settings = this.preferencesService.settings;
        this._sourceLanguageControl = this.formBuilder.control<string | null>(null);
        this._sourceLanguageOptions = LanguageUtils.sortByDisplayName(RECOGNITION_SOURCE_LANGUAGES, this._currentLanguage);
        this._state = this.sessionControllerService.state;
    }

    get active(): boolean {
        return this._active;
    }

    get announcement(): string {
        return this._announcement;
    }

    get announcementId(): string {
        return ANNOUNCEMENT_ID;
    }

    get appVersion(): string {
        return environment.appVersion;
    }

    get automaticLanguage(): string {
        return AUTO_LANGUAGE;
    }

    get blackFramesIcon(): string {
        return videocamOffOutline;
    }

    get blackFramesNoticeId(): string {
        return BLACK_FRAMES_NOTICE_ID;
    }

    get blockingPanel(): boolean {
        return BLOCKING_STATUS_PANELS.includes(this.statusPanel);
    }

    get cameraBlockedIcon(): string {
        return videocamOffOutline;
    }

    get cameraControl(): FormControl<string | null> {
        return this._cameraControl;
    }

    get cameraPickerAvailable(): boolean {
        return this.canSwitchCamera && this._cameras.length >= CAMERA_PICKER_MINIMUM;
    }

    get cameras(): CameraDevice[] {
        return this._cameras;
    }

    get cameraVisible(): boolean {
        return LIVE_STATUSES.includes(this._state.status);
    }

    get canOpenAppSettings(): boolean {
        return this._capabilities.openAppSettings;
    }

    get canSwitchCamera(): boolean {
        return this._capabilities.cameraSelection && this._cameras.length > 1;
    }

    get currentLanguage(): string {
        return this._currentLanguage;
    }

    get downloadingMissing(): boolean {
        return this._downloadingMissing;
    }

    get downloadingSceneLanguage(): boolean {
        const language: string | null = this.sceneLanguage;

        return this._downloadingLanguage !== null || (language !== null && this._inventory.downloading.includes(language));
    }

    get downloadStatusKey(): string {
        return this._online ? 'languages.downloading' : 'languages.waitingForConnection';
    }

    get fontScale(): number {
        return this._settings.balloonFontScale;
    }

    get freezeButtonId(): string {
        return FREEZE_BUTTON_ID;
    }

    get frozen(): boolean {
        return this._state.status === SessionStatus.FROZEN;
    }

    get freezePending(): boolean {
        return this._freezePending;
    }

    get translatedCount(): number {
        return this._items.filter((item: OverlayItem) => item.status === OverlayStatus.TRANSLATED && item.sourceLanguage !== this.targetLanguage).length;
    }

    get textAlreadyInTargetLanguage(): boolean {
        return this._items.some((item: OverlayItem) => item.status === OverlayStatus.TRANSLATED && item.sourceLanguage === this.targetLanguage);
    }

    get translating(): boolean {
        return this._items.some((item: OverlayItem) => item.status === OverlayStatus.TRANSLATING);
    }

    get failedTranslations(): boolean {
        return this._items.some((item: OverlayItem) => item.status === OverlayStatus.ERROR);
    }

    get processingModeKey(): string {
        return this.onlineTranslationAvailable ? 'camera.modeOnline' : this._online ? 'camera.modeOnDevice' : 'camera.modeOffline';
    }

    get frozenNoticeId(): string {
        return FROZEN_NOTICE_ID;
    }

    get granularity(): RegionGranularity {
        return this._settings.regionGranularity;
    }

    get hasText(): boolean {
        return this._items.some((item: OverlayItem) => item.status !== OverlayStatus.EXPIRING);
    }

    get items(): OverlayItem[] {
        return this._items;
    }

    get languagePairOpensPicker(): boolean {
        return this._sceneLanguage.status !== SceneLanguageStatus.FIXED;
    }

    get languageStatusButtonId(): string {
        return LANGUAGE_STATUS_BUTTON_ID;
    }

    get missingLanguagesText(): string {
        return this._missingLanguagesText;
    }

    get missingWifiOnlyDownload(): boolean {
        return this._downloadingMissing && this._missingDownloadRequiresWifi;
    }

    get nativePlatform(): boolean {
        return this._nativePlatform;
    }

    get pairArrowIcon(): string {
        return arrowForwardOutline;
    }

    get editLanguagesIcon(): string {
        return chevronForwardOutline;
    }

    get previewHostId(): string {
        return CAMERA_PREVIEW_HOST_ID;
    }

    get recognitionUnavailableIcon(): string {
        return cloudOfflineOutline;
    }

    get scanning(): boolean {
        return this._state.status === SessionStatus.RUNNING;
    }

    get sceneLanguage(): string | null {
        const language: string | null = this._sceneLanguage.language;

        return KNOWN_LANGUAGE_STATUSES.includes(this._sceneLanguage.status) && language !== null && language !== UNDETERMINED_LANGUAGE
            ? language
            : null;
    }

    get settingsButtonId(): string {
        return SETTINGS_BUTTON_ID;
    }

    get showDebug(): boolean {
        return this._settings.showDebugRegions;
    }

    get showErrorSwitchCamera(): boolean {
        return this.canSwitchCamera && this._state.status === SessionStatus.ERROR;
    }

    get showFreezeButton(): boolean {
        return this.cameraVisible;
    }

    get showHint(): boolean {
        return this._hintDue && this.wantsHint();
    }

    get showSwitchCamera(): boolean {
        return this.canSwitchCamera && this._state.status === SessionStatus.RUNNING;
    }

    get sourceLanguage(): string {
        return this._settings.sourceLanguage;
    }

    get sourceLanguageControl(): FormControl<string | null> {
        return this._sourceLanguageControl;
    }

    get sourceLanguageOptions(): string[] {
        return this._sourceLanguageOptions;
    }

    get status(): SessionStatus {
        return this._state.status;
    }

    get statusAreaId(): string {
        return STATUS_AREA_ID;
    }

    get statusLine(): StatusLine {
        if (!this.cameraVisible) {
            return StatusLine.NONE;
        }

        if (this._state.status === SessionStatus.RUNNING && this._recognitionLoading) {
            return StatusLine.RECOGNITION_LOADING;
        }

        if (this._state.status === SessionStatus.RUNNING && this._recognitionUnavailable) {
            return StatusLine.RECOGNITION_UNAVAILABLE;
        }

        if (this.showHint) {
            return StatusLine.HINT;
        }

        return this.translationSupported ? this.languageStatusLine() : StatusLine.NONE;
    }

    get statusLineId(): string {
        return STATUS_LINE_ID;
    }

    get statusLineKind(): typeof StatusLine {
        return this._statusLineKind;
    }

    get statusPanel(): StatusPanel {
        switch (this._state.status) {
            case SessionStatus.FROZEN:
            case SessionStatus.RUNNING:
                return this.livePanel();
            case SessionStatus.MODEL_MISSING:
                return this.translationSupported ? StatusPanel.MODEL_MISSING : StatusPanel.TRANSLATION_UNSUPPORTED;
            default:
                return STATUS_PANELS.get(this._state.status) ?? StatusPanel.NONE;
        }
    }

    get statusPanelKind(): typeof StatusPanel {
        return this._statusPanelKind;
    }

    get switchCameraButtonId(): string {
        return SWITCH_CAMERA_BUTTON_ID;
    }

    get switchCameraIcon(): string {
        return cameraReverseOutline;
    }

    get switchingCamera(): boolean {
        return this._switchingCamera;
    }

    get targetLanguage(): string {
        return this._settings.targetLanguage;
    }

    get onlineTranslationAvailable(): boolean { return this.onlineTranslationService.available; }

    get onlineNoticeKey(): string | null {
        if (!this.onlineTranslationAvailable) {
            return null;
        }
        const notice = this.onlineTranslationService.notice();
        return notice === null ? null : notice === 'uncertain' ? 'camera.onlineUncertain' : 'camera.onlineUnavailable';
    }

    get translationSupported(): boolean {
        return this.onlineTranslationAvailable || this._capabilities.translation;
    }

    get wifiOnlyDownload(): boolean {
        return this._downloadingLanguage !== null && this._downloadRequiresWifi;
    }

    ionViewDidEnter(): void {
        if (this._active) {
            return;
        }

        this._active = true;

        if (this._nativePlatform) {
            this.renderer.addClass(this.document.body, CAMERA_ACTIVE_CLASS);
        }

        this.subscribeToChanges();
        this.listenForResume();
        this.refresh();
        this.activate(++this._activation);
    }

    ionViewWillLeave(): void {
        this.deactivate();
    }

    ngOnDestroy(): void {
        this._destroyed = true;
        this.deactivate();
    }

    cameraName(camera: CameraDevice): string {
        const label: string = camera.label.trim();

        if (label !== EMPTY) {
            return label;
        }

        return this.appLanguageService.instant(CAMERA_FALLBACK_LABEL_KEY, { number: String(this._cameras.indexOf(camera) + 1) });
    }

    downloadMissingLanguages(): void {
        const languages: string[] = [...this._state.missingLanguages];

        if (this._downloadingMissing || languages.length === 0 || !this.translationSupported) {
            return;
        }

        const requireWifi: boolean = this.preferencesService.settings.requireWifiForDownloads;

        this._downloadingMissing = true;
        this._missingDownloadRequiresWifi = requireWifi;
        this.refresh();

        Promise.allSettled(languages.map((language: string) => this.languageModelService.download(language, requireWifi)))
            .then((results: PromiseSettledResult<void>[]) => {
                const failedLanguages: string[] = languages.filter((language: string, index: number) => results[index].status === 'rejected');

                if (failedLanguages.length > 0) {
                    this.loggerService.warn('camera-missing-download-failed', { failed: failedLanguages.length, requested: languages.length });
                    this.reportDownloadFailures(languages, results);
                }

                if (this._active && failedLanguages.length < languages.length) {
                    this.startSession();
                }
            })
            .finally(() => {
                this._downloadingMissing = false;
                this._missingDownloadRequiresWifi = false;
                this.refresh();
            });
    }

    downloadSceneLanguage(): void {
        const language: string | null = this.sceneLanguage;

        if (this.downloadingSceneLanguage || language === null || !this.translationSupported) {
            return;
        }

        const requireWifi: boolean = this.preferencesService.settings.requireWifiForDownloads;

        this._downloadingLanguage = language;
        this._downloadRequiresWifi = requireWifi;
        this._announcement = this.downloadStatusMessage();
        this.refresh();

        Promise.allSettled([this.languageModelService.download(language, requireWifi)])
            .then((results: PromiseSettledResult<void>[]) => {
                if (results[0].status === 'fulfilled') {
                    this._announcement = this.appLanguageService.instant(
                        'camera.downloadDetectedSuccess',
                        { languages: this.formatLanguageList([language]) },
                    );
                    return;
                }

                this.loggerService.warn('camera-detected-download-failed', { failed: 1, requested: 1 });
                this.reportDownloadFailures([language], results);
            })
            .finally(() => {
                this._downloadingLanguage = null;
                this._downloadRequiresWifi = false;
                this.refresh();
            });
    }

    handleCameraPickerDismissed(): void {
        this._cameraControl.setValue(null, { emitEvent: false });
        this.refresh();
        this.document.defaultView?.requestAnimationFrame(() => this.restoreLostFocus());
    }

    handlePickerDismissed(): void {
        this._sourceLanguageControl.setValue(null, { emitEvent: false });
        this.refresh();
        this.document.defaultView?.requestAnimationFrame(() => this.restoreLostFocus());
    }

    openAppSettings(): void {
        this.sessionControllerService.openAppSettings().catch((error: unknown) => {
            this.loggerService.error('camera-open-settings-failed', error);
            this.refresh();
        });
    }

    openSettings(): void {
        this.router.navigateByUrl(SETTINGS_ROUTE).catch((error: unknown) => this.loggerService.error('camera-navigation-failed', error));
    }

    openSourceLanguagePicker(picker: IonSelect): void {
        const language: string | null = this.sceneLanguage;

        this._sourceLanguageControl.setValue(language !== null && this._sourceLanguageOptions.includes(language) ? language : null, { emitEvent: false });
        picker.open().catch((error: unknown) => this.loggerService.error('camera-source-picker-failed', error));
    }

    retry(): void {
        this.startSession();
    }

    switchCamera(picker: IonSelect): void {
        if (this._switchingCamera || !this.canSwitchCamera) {
            return;
        }

        if (this.cameraPickerAvailable) {
            const activeCamera: CameraDevice | undefined = this._cameras.find((camera: CameraDevice) => camera.active);

            this._cameraControl.setValue(activeCamera?.cameraId ?? null, { emitEvent: false });
            picker.open().catch((error: unknown) => this.loggerService.error('camera-picker-failed', error));
            return;
        }

        const nextCamera: CameraDevice | undefined = this._cameras.find((camera: CameraDevice) => !camera.active);

        if (nextCamera) {
            this.selectCamera(nextCamera);
        }
    }

    toggleFreeze(): void {
        if (this._freezePending) {
            return;
        }

        this._freezePending = true;

        this.sessionControllerService.toggleFreeze()
            .catch((error: unknown) => {
                this.loggerService.error('camera-freeze-toggle-failed', error);
                SwalUtils.showErrorMessage(this.appLanguageService.instant('camera.freezeError'));
            })
            .finally(() => {
                this._freezePending = false;
                this.refresh();
            });
    }

    retryTranslations(): void {
        if (!this.failedTranslations) {
            return;
        }

        this.onlineTranslationService.clearNotice();
        this.sessionControllerService.retryFailedTranslations();
        this.refresh();
    }

    toggleOriginal(regionId: string): void {
        this.overlayStoreService.toggleOriginal(regionId);
    }

    trackByCameraId(index: number, camera: CameraDevice): string {
        return camera.cameraId;
    }

    trackByLanguage(index: number, language: string): string {
        return language;
    }

    private async activate(activation: number): Promise<void> {
        const capabilities: Promise<EngineCapabilities> = this.loadCapabilities();

        await this.splashService.whenFinished();

        if (activation !== this._activation) {
            return;
        }

        try {
            await this.languageConfirmationService.confirmIfNeeded();
        } catch (error: unknown) {
            this.loggerService.error('camera-language-confirmation-failed', error);
        }

        const engineCapabilities: EngineCapabilities = await capabilities;

        if (activation !== this._activation) {
            return;
        }

        this._capabilities = engineCapabilities;
        this.observeFrame();
        await this.applyViewport(this.measureViewport());

        if (activation !== this._activation) {
            return;
        }

        this.startSession();
    }

    private applyConnectivity(online: boolean): void {
        this._online = online;

        if (online && this.onlineTranslationAvailable && this._state.status === SessionStatus.MODEL_MISSING) {
            this.startSession();
        }

        if (this._downloadingLanguage !== null) {
            this._announcement = this.downloadStatusMessage();
        }

        this.refresh();
    }

    private applyEngineError(event: EngineErrorEvent): void {
        if (event.code !== OCR_FAILED_CODE || !this._recognitionLoading) {
            return;
        }

        this._recognitionLoading = false;
        this._recognitionUnavailable = true;
        this.refresh();
    }

    private applyEngineStatus(event: EngineStatusEvent): void {
        switch (event.code) {
            case EngineStatusCode.CAMERA_BLACK_FRAMES:
                this._blackFrames = true;
                this.loadCameras();
                break;
            case EngineStatusCode.CAMERA_FRAMES_RECOVERED:
                this._blackFrames = false;
                break;
            case EngineStatusCode.RECOGNITION_LOADING:
                this._recognitionLoading = true;
                this._recognitionUnavailable = false;
                break;
            case EngineStatusCode.RECOGNITION_READY:
                this._recognitionLoading = false;
                this._recognitionUnavailable = false;
                break;
            default:
                return;
        }

        this.refresh();
    }

    private applyState(state: SessionState): void {
        const previousStatus: SessionStatus = this._state.status;

        this._state = state;
        this._missingLanguagesText = this.formatLanguageList(state.missingLanguages);

        if (state.status !== previousStatus && !ENGINE_NOTICE_STATUSES.includes(state.status)) {
            this._blackFrames = false;
            this._recognitionLoading = false;
            this._recognitionUnavailable = false;
        }

        if (this.entersCameraListStatus(state.status, previousStatus)) {
            this.loadCameras();
        }

        this.refresh();
    }

    private applyViewport(viewport: ScreenRect | null): Promise<void> {
        this._viewport = viewport;

        return this.sessionControllerService.setPreviewViewport(viewport)
            .catch((error: unknown) => this.loggerService.error('camera-viewport-failed', error));
    }

    private chooseCamera(cameraId: string | null): void {
        const camera: CameraDevice | undefined = this._cameras.find((candidate: CameraDevice) => candidate.cameraId === cameraId);

        if (!camera || camera.active) {
            return;
        }

        this.selectCamera(camera);
    }

    private chooseSourceLanguage(language: string | null): void {
        if (!language) {
            return;
        }

        this._sourceLanguageControl.setValue(null, { emitEvent: false });

        if (language === AUTO_LANGUAGE) {
            this.restartAutomaticSourceLanguage();
        } else if (!LATIN_SOURCE_LANGUAGES.includes(language)) {
            // A different writing system needs a fresh OCR session, including on Android.
            this.changeRecognitionLanguage(language);
        } else {
            this._announcement = this.appLanguageService.instant(
                'camera.sourceLanguageSelected',
                { language: LanguageUtils.displayName(language, this._currentLanguage) },
            );
            this.sessionControllerService.setManualSourceLanguage(language);
        }

        this.refresh();
    }

    private async changeRecognitionLanguage(language: string): Promise<void> {
        try {
            await this.preferencesService.update({ sourceLanguage: language });
            await this.sessionControllerService.stop();
            if (this._active) {
                this.startSession();
            }
        } catch (error: unknown) {
            this.loggerService.error('camera-recognition-language-failed', error);
            SwalUtils.showErrorMessage(this.appLanguageService.instant('languages.saveError'));
        }
    }

    private clearHintTimer(): void {
        if (this._hintTimer !== null) {
            clearTimeout(this._hintTimer);
            this._hintTimer = null;
        }
    }

    private deactivate(): void {
        this._activation++;
        this._subscriptions.forEach((subscription: Subscription) => subscription.unsubscribe());
        this._subscriptions = [];
        this.stopObservingFrame();
        this.stopListeningForResume();
        this.clearHintTimer();
        this._hintDue = false;
        this.renderer.removeClass(this.document.body, CAMERA_ACTIVE_CLASS);

        if (!this._active) {
            return;
        }

        this._active = false;
        this._announcement = EMPTY;
        this._blackFrames = false;
        this._cameraRequest++;
        this._cameras = [];
        this._freezePending = false;
        this._recognitionLoading = false;
        this._recognitionUnavailable = false;
        this._switchingCamera = false;

        this.sessionControllerService.stop().catch((error: unknown) => this.loggerService.error('camera-stop-failed', error));
        this.applyViewport(null);
        this.refresh();
    }

    private downloadFailureMessage(languages: string[], results: PromiseSettledResult<void>[]): string {
        const languagesByKey: Map<string, string[]> = new Map<string, string[]>();

        results.forEach((result: PromiseSettledResult<void>, index: number) => {
            if (result.status === 'fulfilled') {
                return;
            }

            const key: string = DOWNLOAD_FAILURE_KEYS.get(this.errorCode(result.reason)) ?? DOWNLOAD_ERROR_KEY;

            languagesByKey.set(key, [...(languagesByKey.get(key) ?? []), languages[index]]);
        });

        return [...languagesByKey]
            .map(([key, failedLanguages]: [string, string[]]) =>
                this.appLanguageService.instant(key, { languages: this.formatLanguageList(failedLanguages) }),
            )
            .join(SENTENCE_SEPARATOR);
    }

    private downloadStatusMessage(): string {
        const status: string = this.appLanguageService.instant(this.downloadStatusKey);

        if (!this._downloadRequiresWifi) {
            return status;
        }

        return [status, this.appLanguageService.instant('languages.wifiOnlyNote')].join(SENTENCE_SEPARATOR);
    }

    private entersCameraListStatus(status: SessionStatus, previousStatus: SessionStatus): boolean {
        if (status === SessionStatus.ERROR) {
            return previousStatus !== SessionStatus.ERROR;
        }

        return status === SessionStatus.RUNNING && previousStatus !== SessionStatus.RUNNING && previousStatus !== SessionStatus.FROZEN;
    }

    private errorCode(error: unknown): string {
        if (typeof error !== 'object' || error === null || !('code' in error)) {
            return EMPTY;
        }

        return typeof error.code === 'string' ? error.code : EMPTY;
    }

    private focusInTransientArea(): boolean {
        const activeElement: Element | null = this.document.activeElement;

        return activeElement !== null && activeElement.closest(`#${STATUS_LINE_ID}, #${STATUS_AREA_ID}`) !== null;
    }

    private formatLanguageList(languages: string[]): string {
        const names: string[] = languages.map((language: string) => LanguageUtils.displayNameInSentence(language, this._currentLanguage));

        try {
            return new Intl.ListFormat(this._currentLanguage, { style: 'long', type: 'conjunction' }).format(names);
        } catch {
            return names.join(LIST_SEPARATOR);
        }
    }

    private languageStatusLine(): StatusLine {
        const language: string | null = this.sceneLanguage;

        if (language !== null) {
            return this.packMissing(language) ? StatusLine.MISSING_PACK : StatusLine.LANGUAGE_PAIR;
        }

        switch (this._sceneLanguage.status) {
            case SceneLanguageStatus.IDENTIFYING:
                return this.hasText ? StatusLine.IDENTIFYING : StatusLine.NONE;
            case SceneLanguageStatus.UNDETERMINED:
                return StatusLine.UNDETERMINED;
            default:
                return StatusLine.NONE;
        }
    }

    private listenForResume(): void {
        this._resumeListener = this.appPlugin
            .addListener('resume', () => {
                this.recheckLanguage(this._activation).catch((error: unknown) => this.loggerService.error('camera-language-recheck-failed', error));
            })
            .catch((error: unknown): null => {
                this.loggerService.error('camera-resume-listener-failed', error);
                return null;
            });
    }

    private livePanel(): StatusPanel {
        if (this._blackFrames && this._state.status === SessionStatus.RUNNING) {
            return StatusPanel.BLACK_FRAMES;
        }

        return this.translationSupported ? StatusPanel.NONE : StatusPanel.TRANSLATION_UNSUPPORTED;
    }

    private loadCameras(): void {
        if (!this._active || !this._capabilities.cameraSelection) {
            return;
        }

        const request: number = ++this._cameraRequest;

        this.lensEngineService.listCameras()
            .then((cameras: CameraDevice[]) => {
                if (request !== this._cameraRequest || !this._active) {
                    return;
                }

                this._cameras = cameras;
                this.refresh();
            })
            .catch((error: unknown) => this.loggerService.error('camera-list-failed', error));
    }

    private loadCapabilities(): Promise<EngineCapabilities> {
        return this.lensEngineService.getCapabilities().catch((error: unknown): EngineCapabilities => {
            this.loggerService.error('camera-capabilities-failed', error);
            return DEFAULT_ENGINE_CAPABILITIES;
        });
    }

    private measureViewport(): ScreenRect | null {
        const frame: HTMLElement | undefined = this._frame?.nativeElement;

        if (!frame) {
            return null;
        }

        const bounds: DOMRect = frame.getBoundingClientRect();

        if (bounds.width <= 0 || bounds.height <= 0) {
            return null;
        }

        return { height: bounds.height, width: bounds.width, x: bounds.left, y: bounds.top };
    }

    private observeFrame(): void {
        const view: (Window & typeof globalThis) | null = this.document.defaultView;

        this.stopObservingFrame();

        if (!view) {
            return;
        }

        this._frameSubscription = merge(fromEvent(view, 'resize'), fromEvent(view, 'orientationchange'))
            .subscribe(() => this.scheduleFrameUpdate());

        if (typeof view.ResizeObserver !== 'function') {
            return;
        }

        const resizeObserver: ResizeObserver = new view.ResizeObserver(() => this.scheduleFrameUpdate());

        [this._stage, this._frame].forEach((reference: ElementRef<HTMLElement> | null) => {
            if (reference) {
                resizeObserver.observe(reference.nativeElement);
            }
        });
        this._resizeObserver = resizeObserver;
    }

    private packMissing(language: string): boolean {
        return !this.onlineTranslationAvailable && language !== this._settings.targetLanguage && !this._inventory.downloaded.includes(language);
    }

    private async recheckLanguage(activation: number): Promise<void> {
        await this.appLanguageService.refreshDeviceLanguage();

        if (activation !== this._activation || !this.languageConfirmationService.needsConfirmation) {
            return;
        }

        await this.sessionControllerService.stop().catch((error: unknown) => this.loggerService.error('camera-stop-failed', error));

        if (activation !== this._activation) {
            return;
        }

        this.activate(++this._activation);
    }

    private refresh(): void {
        if (this._destroyed) {
            return;
        }

        const focusInTransientArea: boolean = this.focusInTransientArea();

        this.updateHint();
        this.changeDetectorRef.detectChanges();

        if (focusInTransientArea) {
            this.restoreLostFocus();
        }
    }

    private reportDownloadFailures(languages: string[], results: PromiseSettledResult<void>[]): void {
        if (!this._active) {
            return;
        }

        const message: string = this.downloadFailureMessage(languages, results);
        const activationRequired: boolean = results.every((result: PromiseSettledResult<void>) =>
            result.status === 'fulfilled' || this.errorCode(result.reason) === ACTIVATION_REQUIRED_CODE,
        );

        if (activationRequired) {
            SwalUtils.showWarningMessage(message);
            return;
        }

        SwalUtils.showErrorMessage(message);
    }

    private restartAutomaticSourceLanguage(): void {
        if (!RESTARTABLE_SCENE_STATUSES.includes(this._sceneLanguage.status)) {
            return;
        }

        this._announcement = this.appLanguageService.instant('camera.identifyingLanguage');
        this.sceneLanguageService.startAutomatic();
    }

    private restoreLostFocus(): void {
        const activeElement: Element | null = this.document.activeElement;
        const focusKept: boolean = activeElement !== null && activeElement !== this.document.body && activeElement.isConnected;

        if (!this._active || this._destroyed || focusKept) {
            return;
        }

        const target: HTMLElement | undefined = FOCUS_FALLBACK_IDS
            .map((id: string) => this.document.getElementById(id))
            .find((candidate: HTMLElement | null): candidate is HTMLElement => candidate !== null);
        const focusTarget: HTMLElement | undefined = target?.shadowRoot?.querySelector<HTMLElement>(NATIVE_BUTTON_SELECTOR) ?? target;

        focusTarget?.focus();
    }

    private scheduleFrameUpdate(): void {
        const view: Window | null = this.document.defaultView;

        if (!view || this._viewportRequest !== null) {
            return;
        }

        this._viewportRequest = view.requestAnimationFrame(() => {
            this._viewportRequest = null;
            this.syncViewport();
        });
    }

    private selectCamera(camera: CameraDevice): void {
        const cameraName: string = this.cameraName(camera);

        this._blackFrames = false;
        this._switchingCamera = true;
        this.refresh();

        this.lensEngineService.selectCamera(camera.cameraId)
            .then(() => {
                if (!this._active) {
                    return;
                }

                this._announcement = this.appLanguageService.instant('camera.cameraSelected', { camera: cameraName });
                this._cameras = this._cameras.map((candidate: CameraDevice): CameraDevice => ({ ...candidate, active: candidate.cameraId === camera.cameraId }));

                if (this._state.status === SessionStatus.ERROR) {
                    this.startSession();
                    return;
                }

                this.loadCameras();
            })
            .catch((error: unknown) => {
                this.loggerService.error('camera-switch-failed', error);

                if (this._active) {
                    SwalUtils.showErrorMessage(this.appLanguageService.instant('camera.switchCameraError'));
                }
            })
            .finally(() => {
                this._switchingCamera = false;
                this.refresh();
            });
    }

    private startSession(): void {
        this.sessionControllerService.start()
            .catch((error: unknown) => {
                this.loggerService.error('camera-start-failed', error);
                SwalUtils.showErrorMessage(this.appLanguageService.instant('camera.errorMessage'));
            })
            .finally(() => this.refresh());
    }

    private stopListeningForResume(): void {
        const listener: Promise<PluginListenerHandle | null> | null = this._resumeListener;

        this._resumeListener = null;
        listener
            ?.then((handle: PluginListenerHandle | null) => handle?.remove())
            .catch((error: unknown) => this.loggerService.error('camera-resume-listener-failed', error));
    }

    private stopObservingFrame(): void {
        this._frameSubscription?.unsubscribe();
        this._frameSubscription = null;
        this._resizeObserver?.disconnect();
        this._resizeObserver = null;

        if (this._viewportRequest !== null) {
            this.document.defaultView?.cancelAnimationFrame(this._viewportRequest);
            this._viewportRequest = null;
        }
    }

    private subscribeToChanges(): void {
        this._subscriptions.push(
            this.sessionControllerService.changes().subscribe((state: SessionState) => this.applyState(state)),
            this.overlayStoreService.changes().pipe(auditTime(0, animationFrameScheduler)).subscribe((items: OverlayItem[]) => {
                this._items = items;
                this.refresh();
            }),
            this.sceneLanguageService.changes().subscribe((state: SceneLanguageState) => {
                this._sceneLanguage = state;
                this.refresh();
            }),
            this.languageModelService.changes().subscribe((inventory: ModelInventory) => {
                this._inventory = inventory;
                this.refresh();
            }),
            this.preferencesService.settingsChanges().subscribe((settings: AppSettings) => {
                this._settings = settings;
                this.refresh();
            }),
            this.appLanguageService.changes().subscribe((language: string) => {
                this._currentLanguage = language;
                this._missingLanguagesText = this.formatLanguageList(this._state.missingLanguages);
                this._sourceLanguageOptions = LanguageUtils.sortByDisplayName(RECOGNITION_SOURCE_LANGUAGES, language);
                this.refresh();
            }),
            this._sourceLanguageControl.valueChanges.subscribe((language: string | null) => this.chooseSourceLanguage(language)),
            this._cameraControl.valueChanges.subscribe((cameraId: string | null) => this.chooseCamera(cameraId)),
            this.lensEngineService.statuses().subscribe((event: EngineStatusEvent) => this.applyEngineStatus(event)),
            this.lensEngineService.errors().subscribe((event: EngineErrorEvent) => this.applyEngineError(event)),
            ...this.watchConnectivity(),
        );
    }

    private syncViewport(): void {
        const viewport: ScreenRect | null = this.measureViewport();

        if (!this._active || viewport === null || GeometryUtils.sameScreenRect(viewport, this._viewport, PREVIEW_VIEWPORT_TOLERANCE)) {
            return;
        }

        this.applyViewport(viewport);
    }

    private updateHint(): void {
        if (!this.wantsHint()) {
            this.clearHintTimer();
            this._hintDue = false;
            return;
        }

        if (this._hintDue || this._hintTimer !== null) {
            return;
        }

        this._hintTimer = setTimeout(() => {
            this._hintTimer = null;
            this._hintDue = true;
            this.refresh();
        }, HINT_DELAY_MILLISECONDS);
    }

    private wantsHint(): boolean {
        return this._active
            && this._state.status === SessionStatus.RUNNING
            && this.translationSupported
            && !this.hasText
            && !this._blackFrames
            && !this._recognitionLoading
            && !this._recognitionUnavailable;
    }

    private watchConnectivity(): Subscription[] {
        const view: Window | null = this.document.defaultView;

        if (!view) {
            return [];
        }

        this._online = view.navigator.onLine;

        return [
            fromEvent(view, 'offline').subscribe(() => this.applyConnectivity(false)),
            fromEvent(view, 'online').subscribe(() => this.applyConnectivity(true)),
        ];
    }
}
