import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, debounceTime } from 'rxjs';
import { AppLanguageService } from 'src/app/services/app-language/app-language.service';
import { HistoryService } from 'src/app/services/history/history.service';
import { LanguageDetectionService } from 'src/app/services/language-detection/language-detection.service';
import { LoggerService } from 'src/app/services/logger/logger.service';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { SessionControllerService } from 'src/app/services/session-controller/session-controller.service';
import { TranslationCacheService } from 'src/app/services/translation-cache/translation-cache.service';
import { AppSettings } from 'src/app/shared/models';
import {
    AUTO_LANGUAGE
,   GeometryUtils
,   LanguageUtils
,   MAX_ANALYSES_PER_SECOND
,   MIN_ANALYSES_PER_SECOND
,   SwalUtils
} from 'src/app/shared/utils';
import { environment } from 'src/environments/environment';
import { OnlineTranslationService } from 'src/app/services/online-translation/online-translation.service';

const BALLOON_FONT_PERCENT_FACTOR: number = 100;

const BALLOON_FONT_PERCENT_MAX: number = 100;

const BALLOON_FONT_PERCENT_MIN: number = 80;

const BALLOON_FONT_PERCENT_STEP: number = 10;

const CAMERA_ROUTE: string = '/camera';

const HISTORY_ROUTE: string = '/history';

const LANGUAGES_ROUTE: string = '/languages';

const RANGE_PERSIST_DEBOUNCE_MILLISECONDS: number = 300;

const TERMS_ROUTE: string = '/terms';

interface SettingsForm {
    analysesPerSecond: FormControl<number>;
    appLanguage: FormControl<string>;
    balloonFontPercent: FormControl<number>;
    historyEnabled: FormControl<boolean>;
    requireWifiForDownloads: FormControl<boolean>;
    showDebugRegions: FormControl<boolean>;
}

@Component({
    selector: 'app-settings',
    templateUrl: './settings.component.html',
    styleUrls: ['./settings.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false,
})
export class SettingsComponent implements OnDestroy, OnInit {
    readonly onlineUrlControl = new FormControl<string>('', { nonNullable: true });
    readonly onlineTokenControl = new FormControl<string>('', { nonNullable: true });
    private _appLanguages: string[];
    private _appVersion: string = environment.appVersion;
    private _deviceLanguageName: string;
    private _form: FormGroup<SettingsForm>;
    private _subscriptions: Subscription[] = [];

    constructor(
        private appLanguageService: AppLanguageService,
        private changeDetectorRef: ChangeDetectorRef,
        private formBuilder: FormBuilder,
        private historyService: HistoryService,
        private languageDetectionService: LanguageDetectionService,
        private loggerService: LoggerService,
        private preferencesService: PreferencesService,
        private router: Router,
        private sessionControllerService: SessionControllerService,
        private translationCacheService: TranslationCacheService,
    ) {
        const settings: AppSettings = this.preferencesService.settings;
        this.onlineUrlControl.setValue(settings.onlineTranslationUrl ?? '');
        this.onlineTokenControl.setValue(settings.onlineTranslationToken ?? '');
        const deviceLanguage: string = LanguageUtils.resolveAppLanguage(this.appLanguageService.deviceLanguageTag);

        this._appLanguages = this.appLanguageService.supportedLanguages;
        this._deviceLanguageName = LanguageUtils.displayNameInSentence(deviceLanguage, deviceLanguage);
        this._form = this.formBuilder.nonNullable.group({
            analysesPerSecond: this.formBuilder.nonNullable.control<number>(settings.analysesPerSecond),
            appLanguage: this.formBuilder.nonNullable.control<string>(settings.appLanguage),
            balloonFontPercent: this.formBuilder.nonNullable.control<number>(this.toBalloonFontPercent(settings.balloonFontScale)),
            historyEnabled: this.formBuilder.nonNullable.control<boolean>(settings.historyEnabled),
            requireWifiForDownloads: this.formBuilder.nonNullable.control<boolean>(settings.requireWifiForDownloads),
            showDebugRegions: this.formBuilder.nonNullable.control<boolean>(settings.showDebugRegions),
        });
    }

    get analysesPerSecond(): number {
        return this._form.controls.analysesPerSecond.value;
    }

    async saveOnlineTranslation(): Promise<void> {
        const url = this.onlineUrlControl.value.trim();
        const token = this.onlineTokenControl.value.trim();
        if (url !== '' && (!OnlineTranslationService.validUrl(url) || token === '')) {
            SwalUtils.showErrorMessage(this.appLanguageService.instant('settings.onlineInvalid'));
            return;
        }
        try {
            await this.preferencesService.update({ onlineTranslationUrl: url, onlineTranslationToken: url === '' ? '' : token });
            SwalUtils.showSuccessMessage(this.appLanguageService.instant('settings.onlineSaved'));
        } catch {
            SwalUtils.showErrorMessage(this.appLanguageService.instant('common.saveError'));
        }
    }

    get appLanguages(): string[] {
        return this._appLanguages;
    }

    get appVersion(): string {
        return this._appVersion;
    }

    get autoLanguage(): string {
        return AUTO_LANGUAGE;
    }

    get balloonFontPercent(): number {
        return this._form.controls.balloonFontPercent.value;
    }

    get balloonFontPercentMax(): number {
        return BALLOON_FONT_PERCENT_MAX;
    }

    get balloonFontPercentMin(): number {
        return BALLOON_FONT_PERCENT_MIN;
    }

    get balloonFontPercentStep(): number {
        return BALLOON_FONT_PERCENT_STEP;
    }

    get deviceLanguageName(): string {
        return this._deviceLanguageName;
    }

    get form(): FormGroup<SettingsForm> {
        return this._form;
    }

    get maxAnalysesPerSecond(): number {
        return MAX_ANALYSES_PER_SECOND;
    }

    get minAnalysesPerSecond(): number {
        return MIN_ANALYSES_PER_SECOND;
    }

    ngOnDestroy(): void {
        this._subscriptions.forEach((subscription: Subscription) => subscription.unsubscribe());
        this._subscriptions = [];
        this.persistPendingRanges();
    }

    ngOnInit(): void {
        const controls: SettingsForm = this._form.controls;

        this._subscriptions.push(
            this.preferencesService.settingsChanges().subscribe((settings: AppSettings) => this.patchForm(settings)),
            this.appLanguageService.changes().subscribe(() => this.changeDetectorRef.detectChanges()),
            this._form.valueChanges.subscribe(() => this.changeDetectorRef.detectChanges()),
            controls.appLanguage.valueChanges.subscribe((appLanguage: string) => {
                this.changeAppLanguage(appLanguage);
            }),
            controls.analysesPerSecond.valueChanges
                .pipe(debounceTime(RANGE_PERSIST_DEBOUNCE_MILLISECONDS))
                .subscribe((analysesPerSecond: number) => {
                    this.persistAnalysesPerSecond(analysesPerSecond);
                }),
            controls.balloonFontPercent.valueChanges
                .pipe(debounceTime(RANGE_PERSIST_DEBOUNCE_MILLISECONDS))
                .subscribe((balloonFontPercent: number) => {
                    this.persist({ balloonFontScale: this.toBalloonFontScale(balloonFontPercent) });
                }),
            controls.historyEnabled.valueChanges.subscribe((historyEnabled: boolean) => {
                this.changeHistoryEnabled(historyEnabled);
            }),
            controls.requireWifiForDownloads.valueChanges.subscribe((requireWifiForDownloads: boolean) => {
                this.persist({ requireWifiForDownloads: requireWifiForDownloads });
            }),
            controls.showDebugRegions.valueChanges.subscribe((showDebugRegions: boolean) => {
                this.persist({ showDebugRegions: showDebugRegions });
            }),
        );
    }

    clearCache(): void {
        this.translationCacheService.clear();
        this.languageDetectionService.clearCache();
        SwalUtils.showSuccessMessage(this.appLanguageService.instant('settings.clearCacheSuccess'));
    }

    async deleteAllData(): Promise<void> {
        const confirmed: boolean = await SwalUtils.showConfirmationDialog(
            this.appLanguageService.instant('settings.deleteAllDataConfirmTitle'),
            this.appLanguageService.instant('settings.deleteAllDataConfirmDetails'),
            this.appLanguageService.instant('settings.deleteAllDataConfirm'),
            'warning',
            true,
        );

        if (!confirmed) {
            return;
        }

        SwalUtils.showLoading(true, this.appLanguageService.instant('common.deleting'));

        try {
            await this.historyService.clear();
            this.translationCacheService.clear();
            this.languageDetectionService.clearCache();
            await this.preferencesService.reset();
            this.onlineUrlControl.reset();
            this.onlineTokenControl.reset();
            await this.appLanguageService.previewLanguage(this.appLanguageService.deviceLanguageTag);
            await SwalUtils.showLoadingResult('success', this.appLanguageService.instant('settings.deleteAllDataSuccess'));
            await this.router.navigateByUrl(CAMERA_ROUTE, { replaceUrl: true });
        } catch (error: unknown) {
            this.loggerService.error('settings-delete-all-data-failed', error);
            SwalUtils.showLoadingResult('error', this.appLanguageService.instant('settings.deleteAllDataError'));
        } finally {
            this.changeDetectorRef.detectChanges();
        }
    }

    async openHistory(): Promise<void> {
        await this.router.navigateByUrl(HISTORY_ROUTE);
    }

    async openLanguages(): Promise<void> {
        await this.router.navigateByUrl(LANGUAGES_ROUTE);
    }

    async openTerms(): Promise<void> {
        await this.router.navigateByUrl(TERMS_ROUTE);
    }

    trackByLanguage(index: number, language: string): string {
        return language;
    }

    private async changeAppLanguage(appLanguage: string): Promise<void> {
        if (appLanguage === this.preferencesService.settings.appLanguage) {
            return;
        }

        try {
            await this.appLanguageService.setPreference(appLanguage);
        } catch (error: unknown) {
            this.loggerService.error('settings-app-language-failed', error, { language: appLanguage });
            SwalUtils.showErrorMessage(this.appLanguageService.instant('common.saveError'));
            this.patchForm(this.preferencesService.settings);
        }

        this.changeDetectorRef.detectChanges();
    }

    private async changeHistoryEnabled(historyEnabled: boolean): Promise<void> {
        if (historyEnabled === this.preferencesService.settings.historyEnabled) {
            return;
        }

        if (historyEnabled) {
            await this.persist({ historyEnabled: true });
            return;
        }

        const confirmed: boolean = await this.confirmHistoryDisable();

        if (!confirmed) {
            this._form.controls.historyEnabled.setValue(this.preferencesService.settings.historyEnabled, { emitEvent: false });
            this.changeDetectorRef.detectChanges();
            return;
        }

        const persisted: boolean = await this.persist({ historyEnabled: false });

        if (persisted) {
            await this.clearHistory();
        }
    }

    private async clearHistory(): Promise<void> {
        try {
            await this.historyService.clear();
        } catch (error: unknown) {
            this.loggerService.error('settings-history-clear-failed', error);
            SwalUtils.showErrorMessage(this.appLanguageService.instant('history.deleteError'));
        }
    }

    private async confirmHistoryDisable(): Promise<boolean> {
        const hasEntries: boolean = await this.hasHistoryEntries();

        if (!hasEntries) {
            return true;
        }

        return SwalUtils.showConfirmationDialog(
            this.appLanguageService.instant('settings.historyDisableConfirmTitle'),
            this.appLanguageService.instant('settings.historyDisableConfirmMessage'),
            this.appLanguageService.instant('settings.historyDisableConfirm'),
            'warning',
            true,
        );
    }

    private hasChanges(changes: Partial<AppSettings>): boolean {
        const settings: AppSettings = this.preferencesService.settings;
        const keys: (keyof AppSettings)[] = Object.keys(changes) as (keyof AppSettings)[];

        return keys.some((key: keyof AppSettings) => settings[key] !== changes[key]);
    }

    private async hasHistoryEntries(): Promise<boolean> {
        try {
            await this.historyService.load();
        } catch (error: unknown) {
            this.loggerService.error('settings-history-load-failed', error);
            return true;
        }

        return this.historyService.entries.length > 0;
    }

    private patchForm(settings: AppSettings): void {
        this._form.patchValue(
            {
                analysesPerSecond: settings.analysesPerSecond,
                appLanguage: settings.appLanguage,
                balloonFontPercent: this.toBalloonFontPercent(settings.balloonFontScale),
                historyEnabled: settings.historyEnabled,
                requireWifiForDownloads: settings.requireWifiForDownloads,
                showDebugRegions: settings.showDebugRegions,
            },
            { emitEvent: false },
        );
        this.changeDetectorRef.detectChanges();
    }

    private async persist(changes: Partial<AppSettings>): Promise<boolean> {
        if (!this.hasChanges(changes)) {
            return false;
        }

        try {
            await this.preferencesService.update(changes);
            return true;
        } catch (error: unknown) {
            this.loggerService.error('settings-save-failed', error);
            SwalUtils.showErrorMessage(this.appLanguageService.instant('common.saveError'));
            this.patchForm(this.preferencesService.settings);
            return false;
        }
    }

    private async persistAnalysesPerSecond(analysesPerSecond: number): Promise<void> {
        const persisted: boolean = await this.persist({ analysesPerSecond: analysesPerSecond });

        if (!persisted) {
            return;
        }

        try {
            await this.sessionControllerService.updateAnalysisRate(analysesPerSecond);
        } catch (error: unknown) {
            this.loggerService.error('settings-analysis-rate-failed', error);
        }
    }

    private persistPendingRanges(): void {
        this.persistAnalysesPerSecond(this._form.controls.analysesPerSecond.value);
        this.persist({ balloonFontScale: this.toBalloonFontScale(this._form.controls.balloonFontPercent.value) });
    }

    private toBalloonFontPercent(balloonFontScale: number): number {
        return GeometryUtils.clamp(Math.round(balloonFontScale * BALLOON_FONT_PERCENT_FACTOR), BALLOON_FONT_PERCENT_MIN, BALLOON_FONT_PERCENT_MAX);
    }

    private toBalloonFontScale(balloonFontPercent: number): number {
        return balloonFontPercent / BALLOON_FONT_PERCENT_FACTOR;
    }
}
