import { Injectable } from '@angular/core';
import { DEFAULT_APP_LANGUAGE, LanguageUtils, SUPPORTED_APP_LANGUAGES, SwalUtils, UNDETERMINED_LANGUAGE } from 'src/app/shared/utils';
import { AppLanguageService } from '../app-language/app-language.service';
import { LoggerService } from '../logger/logger.service';
import { PreferencesService } from '../preferences/preferences.service';

@Injectable({
    providedIn: 'root'
})
export class LanguageConfirmationService {
    private _pending: Promise<void> | null = null;

    constructor(
        private appLanguageService: AppLanguageService,
        private loggerService: LoggerService,
        private preferencesService: PreferencesService,
    ) {}

    get deviceLanguage(): string {
        return LanguageUtils.primarySubtag(this.appLanguageService.deviceLanguageTag);
    }

    get identified(): boolean {
        return SUPPORTED_APP_LANGUAGES.includes(this.deviceLanguage);
    }

    get needsConfirmation(): boolean {
        return this.preferencesService.settings.languageConfirmedFor !== this.confirmationKey();
    }

    get suggestedLanguage(): string {
        return this.identified ? this.deviceLanguage : DEFAULT_APP_LANGUAGE;
    }

    confirmIfNeeded(): Promise<void> {
        if (!this._pending) {
            this._pending = this.run()
                .catch((error: unknown) => this.loggerService.error('language-confirmation-failed', error))
                .finally((): void => {
                    this._pending = null;
                });
        }

        return this._pending;
    }

    private askToContinue(language: string): Promise<boolean | null> {
        const name: string = LanguageUtils.displayNameInSentence(language, language);
        const titleKey: string = this.identified ? 'languageConfirmation.identifiedTitle' : 'languageConfirmation.unidentifiedTitle';
        const messageKey: string = this.identified ? 'languageConfirmation.identifiedMessage' : 'languageConfirmation.unidentifiedMessage';

        return SwalUtils.showChoiceDialog(
            this.appLanguageService.instant(titleKey),
            this.appLanguageService.instant(messageKey, { language: name }),
            this.appLanguageService.instant('languageConfirmation.continue'),
            this.appLanguageService.instant('languageConfirmation.chooseAnother'),
            this.identified ? 'success' : 'info',
        );
    }

    private async confirm(): Promise<void> {
        const confirmationKey: string = this.confirmationKey();
        const suggested: string = this.suggestedLanguage;
        let chosen: string | null = null;

        await this.appLanguageService.previewLanguage(suggested);

        while (chosen === null) {
            const answer: boolean | null = await this.askToContinue(suggested);

            if (answer !== null) {
                chosen = answer ? suggested : await this.selectLanguage(suggested);
            }
        }

        await this.appLanguageService.setPreference(chosen);
        await this.preferencesService.update({ languageConfirmedFor: confirmationKey });
    }

    private confirmationKey(): string {
        return this.deviceLanguage || UNDETERMINED_LANGUAGE;
    }

    private async run(): Promise<void> {
        await this.appLanguageService.refreshDeviceLanguage();

        if (this.needsConfirmation) {
            await this.confirm();
        }
    }

    private selectLanguage(selected: string): Promise<string | null> {
        const options: Record<string, string> = Object.fromEntries(
            [...SUPPORTED_APP_LANGUAGES]
                .map((language: string): [string, string] => [language, LanguageUtils.displayName(language, language)])
                .sort((first: [string, string], second: [string, string]) => first[1].localeCompare(second[1])),
        );

        return SwalUtils.showSelectDialog(
            this.appLanguageService.instant('languageConfirmation.selectTitle'),
            this.appLanguageService.instant('languageConfirmation.selectMessage'),
            options,
            selected,
            this.appLanguageService.instant('languageConfirmation.select'),
            this.appLanguageService.instant('common.back'),
        );
    }
}
