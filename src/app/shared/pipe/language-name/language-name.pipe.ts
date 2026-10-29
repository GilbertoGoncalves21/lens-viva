import { Pipe, PipeTransform } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { AUTO_LANGUAGE, DEFAULT_APP_LANGUAGE, EMPTY, LanguageUtils } from 'src/app/shared/utils';

const AUTO_LANGUAGE_LABEL_KEY: string = 'languages.autoDetect';

@Pipe({
    name: 'languageName',
    standalone: false,
})
export class LanguageNamePipe implements PipeTransform {
    constructor(
        private translateService: TranslateService,
    ) {}

    transform(language: string | null | undefined, displayLanguage: string = DEFAULT_APP_LANGUAGE, inSentence: boolean = false): string {
        if (!language) {
            return EMPTY;
        }

        if (language === AUTO_LANGUAGE) {
            return String(this.translateService.instant(AUTO_LANGUAGE_LABEL_KEY));
        }

        return inSentence ? LanguageUtils.displayNameInSentence(language, displayLanguage) : LanguageUtils.displayName(language, displayLanguage);
    }
}
