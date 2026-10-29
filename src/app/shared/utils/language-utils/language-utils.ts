import { LanguagePair } from '../../models';
import {
    AUTO_LANGUAGE
,   DEFAULT_APP_LANGUAGE
,   EMPTY
,   LANGUAGE_ALIASES
,   SUPPORTED_APP_LANGUAGES
} from '../constants/constants';

export class LanguageUtils {
    static capitalizeFirst(text: string, displayLanguage: string): string {
        if (!text) {
            return EMPTY;
        }

        return text.charAt(0).toLocaleUpperCase(LanguageUtils.resolveDisplayLocale(displayLanguage)) + text.slice(1);
    }

    static dateLocales(language: string, deviceLanguageTag: string | null | undefined): string[] {
        const deviceTag: string = (deviceLanguageTag ?? EMPTY).trim().replace(/_/g, '-');
        const locales: string[] = deviceTag !== EMPTY && LanguageUtils.primarySubtag(deviceTag) === language
            ? [deviceTag, language, DEFAULT_APP_LANGUAGE]
            : [language, DEFAULT_APP_LANGUAGE];

        return locales.filter((locale: string) => LanguageUtils.isValidLocale(locale));
    }

    static displayName(language: string, displayLanguage: string): string {
        return LanguageUtils.capitalizeFirst(LanguageUtils.displayNameInSentence(language, displayLanguage), displayLanguage);
    }

    static displayNameInSentence(language: string, displayLanguage: string): string {
        if (!language) {
            return EMPTY;
        }

        try {
            const displayNames: Intl.DisplayNames = new Intl.DisplayNames([LanguageUtils.resolveDisplayLocale(displayLanguage)], {
                fallback: 'none',
                type: 'language',
            });
            const name: string | undefined = displayNames.of(language);

            return name ? name : language.toUpperCase();
        } catch {
            return language.toUpperCase();
        }
    }

    static primarySubtag(languageTag: string | null | undefined): string {
        const primary: string = (languageTag ?? EMPTY).trim().toLowerCase().split(/[-_]/)[0] ?? EMPTY;

        return LANGUAGE_ALIASES[primary] ?? primary;
    }

    static resolveAppLanguage(languageTag: string | null | undefined): string {
        const primary: string = LanguageUtils.primarySubtag(languageTag);

        return SUPPORTED_APP_LANGUAGES.includes(primary) ? primary : DEFAULT_APP_LANGUAGE;
    }

    static resolveDefaultLanguagePair(languageTag: string | null | undefined): LanguagePair {
        return { sourceLanguage: AUTO_LANGUAGE, targetLanguage: LanguageUtils.resolveAppLanguage(languageTag) };
    }

    static sortByDisplayName(languages: string[], displayLanguage: string): string[] {
        const locale: string = LanguageUtils.resolveDisplayLocale(displayLanguage);
        const names: Map<string, string> = new Map<string, string>(
            languages.map((language: string) => [language, LanguageUtils.displayName(language, locale)]),
        );

        return [...languages].sort((first: string, second: string) =>
            (names.get(first) ?? first).localeCompare(names.get(second) ?? second, locale),
        );
    }

    private static isValidLocale(locale: string): boolean {
        try {
            return Intl.getCanonicalLocales(locale).length > 0;
        } catch {
            return false;
        }
    }

    private static resolveDisplayLocale(displayLanguage: string): string {
        try {
            return Intl.DisplayNames.supportedLocalesOf([displayLanguage || DEFAULT_APP_LANGUAGE])[0] ?? DEFAULT_APP_LANGUAGE;
        } catch {
            return DEFAULT_APP_LANGUAGE;
        }
    }
}
