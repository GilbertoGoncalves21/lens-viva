import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { DevicePlugin, LanguageTag } from '@capacitor/device';
import { InterpolationParameters, TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { AppSettings } from 'src/app/shared/models';
import { AUTO_LANGUAGE, DEFAULT_APP_LANGUAGE, EMPTY, LanguageUtils, SUPPORTED_APP_LANGUAGES, SwalUtils } from 'src/app/shared/utils';
import { DEVICE_PLUGIN } from '../capacitor/capacitor-plugins';
import { LoggerService } from '../logger/logger.service';
import { PreferencesService } from '../preferences/preferences.service';

@Injectable({
    providedIn: 'root'
})
export class AppLanguageService {
    private _applyToken: number = 0;
    private _currentLanguage$: BehaviorSubject<string> = new BehaviorSubject<string>(DEFAULT_APP_LANGUAGE);
    private _deviceLanguageTag: string = EMPTY;

    constructor(
        @Inject(DEVICE_PLUGIN) private devicePlugin: DevicePlugin,
        @Inject(DOCUMENT) private document: Document,
        private loggerService: LoggerService,
        private preferencesService: PreferencesService,
        private translateService: TranslateService,
    ) {}

    get currentLanguage(): string {
        return this._currentLanguage$.value;
    }

    get deviceLanguageTag(): string {
        return this._deviceLanguageTag;
    }

    get supportedLanguages(): string[] {
        return SUPPORTED_APP_LANGUAGES;
    }

    changes(): Observable<string> {
        return this._currentLanguage$.asObservable();
    }

    async initialize(): Promise<void> {
        const deviceLanguageTag: string = await this.refreshDeviceLanguage();
        const settings: AppSettings = await this.preferencesService.load(deviceLanguageTag);

        await this.applyLanguage(this.resolveLanguage(settings.appLanguage));
    }

    instant(key: string, parameters?: InterpolationParameters): string {
        return String(this.translateService.instant(key, parameters));
    }

    async previewLanguage(language: string): Promise<void> {
        await this.applyLanguage(this.resolveLanguage(language));
    }

    async refreshDeviceLanguage(): Promise<string> {
        this._deviceLanguageTag = await this.readDeviceLanguageTag();

        return this._deviceLanguageTag;
    }

    async setPreference(appLanguage: string): Promise<void> {
        const language: string = this.resolveLanguage(appLanguage);
        const changes: Partial<AppSettings> = { appLanguage: appLanguage, targetLanguage: language };

        if (this.preferencesService.settings.sourceLanguage === language) {
            changes.sourceLanguage = AUTO_LANGUAGE;
        }

        await this.preferencesService.update(changes);
        await this.applyLanguage(language);
    }

    private async applyLanguage(language: string): Promise<void> {
        const token: number = ++this._applyToken;
        const appliedLanguage: string = await this.useLanguage(language);

        if (token !== this._applyToken) {
            return;
        }

        this.document.documentElement.lang = appliedLanguage;
        SwalUtils.setLabels({
            cancel: this.instant('common.cancel'),
            confirm: this.instant('common.ok'),
            errorTitle: this.instant('common.error'),
            infoTitle: this.instant('common.info'),
            successTitle: this.instant('common.success'),
            warningTitle: this.instant('common.warning'),
        });
        this._currentLanguage$.next(appliedLanguage);
    }

    private navigatorLanguage(): string {
        return this.document.defaultView?.navigator.language || DEFAULT_APP_LANGUAGE;
    }

    private async readDeviceLanguageTag(): Promise<string> {
        try {
            const languageTag: LanguageTag = await this.devicePlugin.getLanguageTag();

            return languageTag.value || this.navigatorLanguage();
        } catch {
            return this.navigatorLanguage();
        }
    }

    private resolveLanguage(appLanguage: string): string {
        return LanguageUtils.resolveAppLanguage(appLanguage === AUTO_LANGUAGE ? this._deviceLanguageTag : appLanguage);
    }

    private async useLanguage(language: string): Promise<string> {
        try {
            await firstValueFrom(this.translateService.use(language));

            return language;
        } catch (error: unknown) {
            this.loggerService.error('app-language-load-failed', error, { language: language });
        }

        if (language !== DEFAULT_APP_LANGUAGE) {
            try {
                await firstValueFrom(this.translateService.use(DEFAULT_APP_LANGUAGE));
            } catch (error: unknown) {
                this.loggerService.error('app-language-load-failed', error, { language: DEFAULT_APP_LANGUAGE });
            }
        }

        return DEFAULT_APP_LANGUAGE;
    }
}
