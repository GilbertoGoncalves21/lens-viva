import { OnlineTranslationService } from 'src/app/services/online-translation/online-translation.service';
import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular';
import { Subscription, fromEvent } from 'rxjs';
import { AppLanguageService } from 'src/app/services/app-language/app-language.service';
import { LanguageModelService } from 'src/app/services/language-model/language-model.service';
import { LensEngineService } from 'src/app/services/lens-engine/lens-engine.service';
import { LoggerService } from 'src/app/services/logger/logger.service';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { AppSettings, EngineCapabilities, LanguageModelInfo, LanguagePair, ModelInventory } from 'src/app/shared/models';
import {
    AUTO_LANGUAGE
,   BUILT_IN_MODEL_LANGUAGE
,   DEFAULT_APP_LANGUAGE
,   EMPTY
,   RECOGNITION_SOURCE_LANGUAGES
,   TRANSLATION_LANGUAGES
,   LanguageUtils
,   SwalUtils
} from 'src/app/shared/utils';

const ACTIVATION_REQUIRED_CODE: string = 'USER_ACTIVATION_REQUIRED';

const CAMERA_ROUTE: string = '/camera';

const DEFAULT_ENGINE_CAPABILITIES: EngineCapabilities = {
    cameraSelection: false,
    languageIdentification: true,
    modelRemoval: true,
    openAppSettings: true,
    translation: true,
};

const MODELS_TITLE_ID: string = 'languages-models-title';

const OTHER_MODELS_TITLE_ID: string = 'languages-other-title';

const RECOGNITION_MODELS_TITLE_ID: string = 'languages-recognition-title';

const SETTINGS_ROUTE: string = '/settings';

const TRANSLATION_UNSUPPORTED_CODE: string = 'TRANSLATION_UNSUPPORTED';

interface SourceLanguageForm {
    sourceLanguage: FormControl<string>;
}

@Component({
    selector: 'app-languages',
    templateUrl: './languages.component.html',
    styleUrls: ['./languages.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false,
})
export class LanguagesComponent implements OnDestroy, OnInit, ViewWillEnter {
    private _capabilities: EngineCapabilities | null = null;
    private _displayLanguage: string = DEFAULT_APP_LANGUAGE;
    private _form: FormGroup<SourceLanguageForm>;
    private _inventory: ModelInventory = { downloaded: [], downloading: [] };
    private _languagePair: LanguagePair = { sourceLanguage: EMPTY, targetLanguage: EMPTY };
    private _online: boolean = true;
    private _otherModels: LanguageModelInfo[] = [];
    private _pairModels: LanguageModelInfo[] = [];
    private _recognitionModels: LanguageModelInfo[] = [];
    private _requireWifiForDownloads: boolean = false;
    private _sourceOptions: string[] = [];
    private _subscriptions: Subscription[] = [];
    readonly targetLanguageControl: FormControl<string> = new FormControl<string>(EMPTY, { nonNullable: true });

    get targetOptions(): string[] {
        return LanguageUtils.sortByDisplayName(TRANSLATION_LANGUAGES, this._displayLanguage);
    }

    constructor(
        private appLanguageService: AppLanguageService,
        private changeDetectorRef: ChangeDetectorRef,
        @Inject(DOCUMENT) private document: Document,
        private formBuilder: FormBuilder,
        private languageModelService: LanguageModelService,
        private lensEngineService: LensEngineService,
        private loggerService: LoggerService,
        private preferencesService: PreferencesService,
        private router: Router,
        private onlineTranslationService: OnlineTranslationService,
    ) {
        this._displayLanguage = this.appLanguageService.currentLanguage;
        this._form = this.formBuilder.nonNullable.group({
            sourceLanguage: [this.preferencesService.settings.sourceLanguage, Validators.required],
        });
        this._online = this.document.defaultView?.navigator.onLine ?? true;
    }

    get autoLanguage(): string {
        return AUTO_LANGUAGE;
    }

    get autoSourceSelected(): boolean {
        return this._languagePair.sourceLanguage === AUTO_LANGUAGE;
    }

    get browserManagedModels(): boolean {
        return this._capabilities?.modelRemoval === false;
    }

    get displayLanguage(): string {
        return this._displayLanguage;
    }

    get downloadStatusKey(): string {
        return this._online ? 'languages.downloading' : 'languages.waitingForConnection';
    }

    get form(): FormGroup<SourceLanguageForm> {
        return this._form;
    }

    get modelRemovalSupported(): boolean {
        return this._capabilities?.modelRemoval === true;
    }

    get online(): boolean {
        return this._online;
    }

    get otherModels(): LanguageModelInfo[] {
        return this._otherModels;
    }

    get pairModels(): LanguageModelInfo[] {
        return this._pairModels;
    }

    get onlineTranslationAvailable(): boolean { return this.onlineTranslationService.available; }

    get pairReady(): boolean {
        return this.onlineTranslationAvailable || this._pairModels.length > 0 && this._pairModels.every((model: LanguageModelInfo) => model.downloaded);
    }

    get recognitionModels(): LanguageModelInfo[] {
        return this._recognitionModels;
    }

    get requireWifiForDownloads(): boolean {
        return this._requireWifiForDownloads;
    }

    get sourceOptions(): string[] {
        return this._sourceOptions;
    }

    get targetLanguage(): string {
        return this._languagePair.targetLanguage;
    }

    get translationSupported(): boolean {
        return this.onlineTranslationAvailable || (this._capabilities?.translation ?? true);
    }

    async ionViewWillEnter(): Promise<void> {
        this.syncFromSettings(this.preferencesService.settings);
        this.changeDetectorRef.detectChanges();
        await this.refreshInventory();
    }

    ngOnDestroy(): void {
        this._subscriptions.forEach((subscription: Subscription) => subscription.unsubscribe());
        this._subscriptions = [];
    }

    ngOnInit(): void {
        this.syncFromSettings(this.preferencesService.settings);
        this.loadCapabilities();
        this._subscriptions.push(
            this.appLanguageService.changes().subscribe((language: string) => this.applyDisplayLanguage(language)),
            this.preferencesService.settingsChanges().subscribe((settings: AppSettings) => this.applySettings(settings)),
            this.languageModelService.changes().subscribe((inventory: ModelInventory) => this.applyInventory(inventory)),
            this._form.controls.sourceLanguage.valueChanges.subscribe((sourceLanguage: string) => {
                this.handleSourceLanguageChange(sourceLanguage);
            }),
            this.targetLanguageControl.valueChanges.subscribe((language: string) => { this.changeTargetLanguage(language); }),
            ...this.watchConnectivity(),
        );
    }

    async downloadModel(language: string): Promise<void> {
        if (this._inventory.downloading.includes(language) || !this.translationSupported) {
            return;
        }

        const sectionTitleId: string = this.modelSectionTitleId(language);

        try {
            await this.languageModelService.download(language, this.preferencesService.settings.requireWifiForDownloads);
            this.restoreLostFocus(sectionTitleId);
            SwalUtils.showSuccessMessage(this.languageMessage('languages.downloadSuccess', language));
        } catch (error: unknown) {
            this.reportDownloadFailure(error, language);
        } finally {
            this.changeDetectorRef.detectChanges();
        }
    }

    openCamera(): Promise<boolean> {
        return this.router.navigateByUrl(CAMERA_ROUTE);
    }

    openSettings(): Promise<boolean> {
        return this.router.navigateByUrl(SETTINGS_ROUTE);
    }

    async removeModel(language: string): Promise<void> {
        if (!this.isRemovable(language)) {
            return;
        }

        const confirmed: boolean = await SwalUtils.showConfirmationDialog(
            this.appLanguageService.instant('languages.deleteConfirmTitle'),
            this.languageMessage('languages.deleteConfirmMessage', language),
            this.appLanguageService.instant('languages.delete'),
            'warning',
            true,
        );

        if (!confirmed) {
            return;
        }

        const sectionTitleId: string = this.modelSectionTitleId(language);

        SwalUtils.showLoading(true, this.appLanguageService.instant('common.deleting'));

        try {
            await this.languageModelService.remove(language);
            await SwalUtils.showLoadingResult('success', this.languageMessage('languages.deleteSuccess', language));
            this.restoreLostFocus(this.focusTitleIdAfterRemoval(sectionTitleId));
        } catch {
            SwalUtils.showLoadingResult('error', this.languageMessage('languages.deleteError', language));
        } finally {
            this.changeDetectorRef.detectChanges();
        }
    }

    trackByLanguage(index: number, language: string): string {
        return language;
    }

    trackByModel(index: number, model: LanguageModelInfo): string {
        return model.language;
    }

    private applyConnectivity(online: boolean): void {
        this._online = online;
        this.changeDetectorRef.detectChanges();
    }

    private applyDisplayLanguage(language: string): void {
        if (language === this._displayLanguage && this._sourceOptions.length > 0) {
            return;
        }

        this._displayLanguage = language;
        this.sortOptions();
        this.buildModels();
        this.changeDetectorRef.detectChanges();
    }

    private applyInventory(inventory: ModelInventory): void {
        this._inventory = inventory;
        this.buildModels();
        this.changeDetectorRef.detectChanges();
    }

    private applySettings(settings: AppSettings): void {
        this.syncFromSettings(settings);
        this.changeDetectorRef.detectChanges();
    }

    private buildModelInfo(language: string): LanguageModelInfo {
        return {
            downloaded: this._inventory.downloaded.includes(language),
            downloading: this._inventory.downloading.includes(language),
            language: language,
            removable: this.isRemovable(language),
        };
    }

    private buildModels(): void {
        const pairLanguages: string[] = this.uniqueLanguages([this._languagePair.sourceLanguage, this._languagePair.targetLanguage])
            .filter((language: string) => language !== AUTO_LANGUAGE);
        const recognitionLanguages: string[] = this.autoSourceSelected
            ? RECOGNITION_SOURCE_LANGUAGES.filter((language: string) => language !== BUILT_IN_MODEL_LANGUAGE && !pairLanguages.includes(language))
            : [];
        const otherLanguages: string[] = this.uniqueLanguages(this._inventory.downloaded)
            .filter((language: string) => !pairLanguages.includes(language) && !recognitionLanguages.includes(language));

        this._pairModels = pairLanguages.map((language: string) => this.buildModelInfo(language));
        this._recognitionModels = LanguageUtils.sortByDisplayName(recognitionLanguages, this._displayLanguage)
            .map((language: string) => this.buildModelInfo(language));
        this._otherModels = LanguageUtils.sortByDisplayName(otherLanguages, this._displayLanguage)
            .map((language: string) => this.buildModelInfo(language));
    }

    private errorCode(error: unknown): string {
        if (typeof error !== 'object' || error === null || !('code' in error)) {
            return EMPTY;
        }

        return typeof error.code === 'string' ? error.code : EMPTY;
    }

    private focusTitleIdAfterRemoval(sectionTitleId: string): string {
        if (sectionTitleId !== OTHER_MODELS_TITLE_ID || this._otherModels.length > 0) {
            return sectionTitleId;
        }

        return this._recognitionModels.length > 0 ? RECOGNITION_MODELS_TITLE_ID : MODELS_TITLE_ID;
    }

    private async handleSourceLanguageChange(sourceLanguage: string): Promise<void> {
        if (sourceLanguage === this._languagePair.sourceLanguage) {
            return;
        }

        if (sourceLanguage === this._languagePair.targetLanguage) {
            SwalUtils.showWarningMessage(this.appLanguageService.instant('languages.sameLanguageWarning'));
            this.restoreForm();
            this.changeDetectorRef.detectChanges();
            return;
        }

        if (this._form.controls.sourceLanguage.invalid) {
            this.restoreForm();
            this.changeDetectorRef.detectChanges();
            return;
        }

        this._languagePair = { ...this._languagePair, sourceLanguage: sourceLanguage };
        this.sortOptions();
        this.buildModels();
        this.changeDetectorRef.detectChanges();
        await this.saveSourceLanguage(sourceLanguage);
    }

    private isListedIn(models: LanguageModelInfo[], language: string): boolean {
        return models.some((model: LanguageModelInfo) => model.language === language);
    }

    private isRemovable(language: string): boolean {
        return this.modelRemovalSupported && language !== BUILT_IN_MODEL_LANGUAGE;
    }

    private languageMessage(key: string, language: string): string {
        const message: string = this.appLanguageService.instant(key, {
            language: LanguageUtils.displayNameInSentence(language, this._displayLanguage),
        });

        return LanguageUtils.capitalizeFirst(message, this._displayLanguage);
    }

    private async loadCapabilities(): Promise<void> {
        try {
            this._capabilities = await this.lensEngineService.getCapabilities();
        } catch (error: unknown) {
            this.loggerService.error('languages-capabilities-failed', error);
            this._capabilities = DEFAULT_ENGINE_CAPABILITIES;
        }

        this.buildModels();
        this.changeDetectorRef.detectChanges();
    }

    private modelSectionTitleId(language: string): string {
        if (this.isListedIn(this._recognitionModels, language)) {
            return RECOGNITION_MODELS_TITLE_ID;
        }

        if (this.isListedIn(this._otherModels, language)) {
            return OTHER_MODELS_TITLE_ID;
        }

        return MODELS_TITLE_ID;
    }

    private async refreshInventory(): Promise<void> {
        try {
            await this.languageModelService.refresh();
        } catch (error: unknown) {
            this.loggerService.error('model-inventory-refresh-failed', error);
            SwalUtils.showErrorMessage(this.appLanguageService.instant('languages.refreshError'));
        } finally {
            this.changeDetectorRef.detectChanges();
        }
    }

    private reportDownloadFailure(error: unknown, language: string): void {
        switch (this.errorCode(error)) {
            case ACTIVATION_REQUIRED_CODE:
                SwalUtils.showWarningMessage(this.appLanguageService.instant('languages.downloadActivationRequired'));
                return;
            case TRANSLATION_UNSUPPORTED_CODE:
                SwalUtils.showErrorMessage(this.languageMessage('languages.downloadUnsupportedError', language));
                return;
            default:
                SwalUtils.showErrorMessage(this.languageMessage('languages.downloadError', language));
        }
    }

    private restoreForm(): void {
        this._form.setValue({ sourceLanguage: this._languagePair.sourceLanguage }, { emitEvent: false });
    }

    private restoreLostFocus(elementId: string): void {
        const activeElement: Element | null = this.document.activeElement;

        if (activeElement && activeElement !== this.document.body) {
            return;
        }

        this.document.getElementById(elementId)?.focus();
    }

    private async saveSourceLanguage(sourceLanguage: string): Promise<void> {
        try {
            await this.preferencesService.update({ sourceLanguage: sourceLanguage });
        } catch (error: unknown) {
            this.loggerService.error('language-pair-save-failed', error);
            SwalUtils.showErrorMessage(this.appLanguageService.instant('languages.saveError'));
            this.syncFromSettings(this.preferencesService.settings);
        } finally {
            this.changeDetectorRef.detectChanges();
        }
    }

    private async changeTargetLanguage(language: string): Promise<void> {
        if (!TRANSLATION_LANGUAGES.includes(language) || language === this.targetLanguage) {
            return;
        }

        const changes: Partial<AppSettings> = { targetLanguage: language };
        if (language === this._languagePair.sourceLanguage) {
            changes.sourceLanguage = AUTO_LANGUAGE;
        }

        try {
            await this.preferencesService.update(changes);
        } catch (error: unknown) {
            this.loggerService.error('target-language-save-failed', error);
            SwalUtils.showErrorMessage(this.appLanguageService.instant('languages.saveError'));
        } finally {
            this.syncFromSettings(this.preferencesService.settings);
            this.changeDetectorRef.detectChanges();
        }
    }

    private sortOptions(): void {
        const readableLanguages: string[] = RECOGNITION_SOURCE_LANGUAGES.filter((language: string) =>
            language !== this._languagePair.targetLanguage || language === this._languagePair.sourceLanguage,
        );

        this._sourceOptions = LanguageUtils.sortByDisplayName(readableLanguages, this._displayLanguage);
    }

    private syncFromSettings(settings: AppSettings): void {
        this._languagePair = { sourceLanguage: settings.sourceLanguage, targetLanguage: settings.targetLanguage };
        this.targetLanguageControl.setValue(settings.targetLanguage, { emitEvent: false });
        this._requireWifiForDownloads = settings.requireWifiForDownloads;
        this.restoreForm();
        this.sortOptions();
        this.buildModels();
    }

    private uniqueLanguages(languages: string[]): string[] {
        return languages.filter((language: string, index: number, allLanguages: string[]) =>
            language !== EMPTY && allLanguages.indexOf(language) === index,
        );
    }

    private watchConnectivity(): Subscription[] {
        const view: Window | null = this.document.defaultView;

        if (!view) {
            return [];
        }

        return [
            fromEvent(view, 'offline').subscribe(() => this.applyConnectivity(false)),
            fromEvent(view, 'online').subscribe(() => this.applyConnectivity(true)),
        ];
    }
}
