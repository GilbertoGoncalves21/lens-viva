import { LanguagePair } from '../../models';
import { AUTO_LANGUAGE, EMPTY, SUPPORTED_APP_LANGUAGES } from '../constants/constants';
import { LanguageUtils } from './language-utils';

describe('LanguageUtils', () => {
    describe('primarySubtag', () => {
        it('should extract the lower case primary subtag', () => {
            expect(LanguageUtils.primarySubtag('pt-BR')).toBe('pt');
            expect(LanguageUtils.primarySubtag('en_US')).toBe('en');
            expect(LanguageUtils.primarySubtag(' DE ')).toBe('de');
            expect(LanguageUtils.primarySubtag('zh-Hant-TW')).toBe('zh');
        });

        it('should resolve legacy and regional aliases', () => {
            expect(LanguageUtils.primarySubtag('nb')).toBe('no');
            expect(LanguageUtils.primarySubtag('nb-NO')).toBe('no');
            expect(LanguageUtils.primarySubtag('nn')).toBe('no');
            expect(LanguageUtils.primarySubtag('iw')).toBe('he');
            expect(LanguageUtils.primarySubtag('in-ID')).toBe('id');
            expect(LanguageUtils.primarySubtag('fil')).toBe('tl');
        });

        it('should return EMPTY for missing tags', () => {
            expect(LanguageUtils.primarySubtag(null)).toBe(EMPTY);
            expect(LanguageUtils.primarySubtag(undefined)).toBe(EMPTY);
            expect(LanguageUtils.primarySubtag(EMPTY)).toBe(EMPTY);
        });
    });

    describe('resolveAppLanguage', () => {
        it('should use the primary subtag of supported languages', () => {
            expect(LanguageUtils.resolveAppLanguage('pt-BR')).toBe('pt');
            expect(LanguageUtils.resolveAppLanguage('en_US')).toBe('en');
            expect(LanguageUtils.resolveAppLanguage('es-419')).toBe('es');
            expect(LanguageUtils.resolveAppLanguage('fr-CA')).toBe('fr');
            expect(LanguageUtils.resolveAppLanguage('de-AT')).toBe('de');
            expect(LanguageUtils.resolveAppLanguage('it')).toBe('it');
        });

        it('should fall back to English for unsupported languages', () => {
            expect(LanguageUtils.resolveAppLanguage('ar-SA')).toBe('en');
            expect(LanguageUtils.resolveAppLanguage('xx')).toBe('en');
        });

        it('should fall back to English for missing tags', () => {
            expect(LanguageUtils.resolveAppLanguage(null)).toBe('en');
            expect(LanguageUtils.resolveAppLanguage(undefined)).toBe('en');
            expect(LanguageUtils.resolveAppLanguage(EMPTY)).toBe('en');
        });
    });

    describe('resolveDefaultLanguagePair', () => {
        it('should detect the source automatically and translate into the device language', () => {
            const pair: LanguagePair = LanguageUtils.resolveDefaultLanguagePair('pt-BR');

            expect(pair).toEqual({ sourceLanguage: AUTO_LANGUAGE, targetLanguage: 'pt' });
        });

        it('should translate into every supported app language', () => {
            expect(LanguageUtils.resolveDefaultLanguagePair('de-AT')).toEqual({ sourceLanguage: AUTO_LANGUAGE, targetLanguage: 'de' });
            expect(LanguageUtils.resolveDefaultLanguagePair('en-US')).toEqual({ sourceLanguage: AUTO_LANGUAGE, targetLanguage: 'en' });
            expect(LanguageUtils.resolveDefaultLanguagePair('es-419')).toEqual({ sourceLanguage: AUTO_LANGUAGE, targetLanguage: 'es' });
            expect(LanguageUtils.resolveDefaultLanguagePair('fr-CA')).toEqual({ sourceLanguage: AUTO_LANGUAGE, targetLanguage: 'fr' });
            expect(LanguageUtils.resolveDefaultLanguagePair('it')).toEqual({ sourceLanguage: AUTO_LANGUAGE, targetLanguage: 'it' });
        });

        it('should translate into English when the device language is not an app language', () => {
            expect(LanguageUtils.resolveDefaultLanguagePair('ar-SA')).toEqual({ sourceLanguage: AUTO_LANGUAGE, targetLanguage: 'en' });
            expect(LanguageUtils.resolveDefaultLanguagePair('nb-NO')).toEqual({ sourceLanguage: AUTO_LANGUAGE, targetLanguage: 'en' });
            expect(LanguageUtils.resolveDefaultLanguagePair('xx')).toEqual({ sourceLanguage: AUTO_LANGUAGE, targetLanguage: 'en' });
        });

        it('should translate into English when the device language is missing', () => {
            expect(LanguageUtils.resolveDefaultLanguagePair(null)).toEqual({ sourceLanguage: AUTO_LANGUAGE, targetLanguage: 'en' });
            expect(LanguageUtils.resolveDefaultLanguagePair(undefined)).toEqual({ sourceLanguage: AUTO_LANGUAGE, targetLanguage: 'en' });
            expect(LanguageUtils.resolveDefaultLanguagePair(EMPTY)).toEqual({ sourceLanguage: AUTO_LANGUAGE, targetLanguage: 'en' });
        });

        it('should always target one of the app languages', () => {
            ['pt-BR', 'en-US', 'xx', 'de', 'ar', 'zh-Hant-TW', 'iw'].forEach((languageTag: string) => {
                expect(SUPPORTED_APP_LANGUAGES).toContain(LanguageUtils.resolveDefaultLanguagePair(languageTag).targetLanguage);
            });
        });
    });

    describe('dateLocales', () => {
        it('should prefer the device region when it matches the language', () => {
            expect(LanguageUtils.dateLocales('pt', 'pt_BR')).toEqual(['pt-BR', 'pt', 'en']);
        });

        it('should ignore the device region of another language', () => {
            expect(LanguageUtils.dateLocales('en', 'pt-BR')).toEqual(['en', 'en']);
        });

        it('should use the language and English when the device tag is missing', () => {
            expect(LanguageUtils.dateLocales('pt', EMPTY)).toEqual(['pt', 'en']);
            expect(LanguageUtils.dateLocales('pt', undefined)).toEqual(['pt', 'en']);
        });

        it('should drop an invalid device tag', () => {
            expect(LanguageUtils.dateLocales('pt', 'pt-!!')).toEqual(['pt', 'en']);
        });
    });

    describe('displayName', () => {
        it('should return localized capitalized names', () => {
            expect(LanguageUtils.displayName('pt', 'pt')).toBe('Português');
            expect(LanguageUtils.displayName('de', 'en')).toBe('German');
            expect(LanguageUtils.displayName('en', 'fr')).toBe('Anglais');
            expect(LanguageUtils.displayName('fr', 'de')).toBe('Französisch');
            expect(LanguageUtils.displayName('es', 'es')).toBe('Español');
            expect(LanguageUtils.displayName('en', 'it')).toBe('Inglese');
        });

        it('should accept regional display languages', () => {
            expect(LanguageUtils.displayName('en', 'pt-BR')).toBe('Inglês');
        });

        it('should return EMPTY for a missing language', () => {
            expect(LanguageUtils.displayName(EMPTY, 'en')).toBe(EMPTY);
        });

        it('should fall back to English when the display language is missing', () => {
            expect(LanguageUtils.displayName('pt', EMPTY)).toBe('Portuguese');
        });

        it('should fall back to English when the display language is invalid', () => {
            expect(LanguageUtils.displayName('pt', 'not a locale')).toBe('Portuguese');
        });

        it('should fall back to the upper case code for unknown or invalid languages', () => {
            expect(LanguageUtils.displayName('zz', 'en')).toBe('ZZ');
            expect(LanguageUtils.displayName('not a code', 'en')).toBe('NOT A CODE');
        });
    });

    describe('displayNameInSentence', () => {
        it('should keep the lower case names used inside sentences', () => {
            expect(LanguageUtils.displayNameInSentence('pt', 'pt')).toBe('português');
            expect(LanguageUtils.displayNameInSentence('es', 'es')).toBe('español');
            expect(LanguageUtils.displayNameInSentence('en', 'fr')).toBe('anglais');
            expect(LanguageUtils.displayNameInSentence('es', 'it')).toBe('spagnolo');
            expect(LanguageUtils.displayNameInSentence('en', 'pt-BR')).toBe('inglês');
        });

        it('should keep the capitalized names of languages that capitalize them', () => {
            expect(LanguageUtils.displayNameInSentence('fr', 'de')).toBe('Französisch');
            expect(LanguageUtils.displayNameInSentence('de', 'en')).toBe('German');
        });

        it('should return EMPTY for a missing language', () => {
            expect(LanguageUtils.displayNameInSentence(EMPTY, 'pt')).toBe(EMPTY);
        });

        it('should fall back to English when the display language is missing or invalid', () => {
            expect(LanguageUtils.displayNameInSentence('pt', EMPTY)).toBe('Portuguese');
            expect(LanguageUtils.displayNameInSentence('pt', 'not a locale')).toBe('Portuguese');
        });

        it('should fall back to the upper case code for unknown or invalid languages', () => {
            expect(LanguageUtils.displayNameInSentence('zz', 'pt')).toBe('ZZ');
            expect(LanguageUtils.displayNameInSentence('not a code', 'pt')).toBe('NOT A CODE');
        });
    });

    describe('capitalizeFirst', () => {
        it('should upper case only the first character', () => {
            expect(LanguageUtils.capitalizeFirst('português disponível', 'pt')).toBe('Português disponível');
            expect(LanguageUtils.capitalizeFirst('Englisch', 'de')).toBe('Englisch');
        });

        it('should use the casing rules of the display language', () => {
            expect(LanguageUtils.capitalizeFirst('istanbul', 'tr')).toBe('İstanbul');
        });

        it('should return EMPTY for an empty text', () => {
            expect(LanguageUtils.capitalizeFirst(EMPTY, 'pt')).toBe(EMPTY);
        });

        it('should not throw for an invalid display language', () => {
            expect(LanguageUtils.capitalizeFirst('español', 'not a locale')).toBe('Español');
        });
    });

    describe('sortByDisplayName', () => {
        it('should sort by the localized name', () => {
            expect(LanguageUtils.sortByDisplayName(['de', 'en', 'fr'], 'en')).toEqual(['en', 'fr', 'de']);
            expect(LanguageUtils.sortByDisplayName(['de', 'en', 'fr'], 'pt')).toEqual(['de', 'fr', 'en']);
        });

        it('should not mutate the input', () => {
            const languages: string[] = ['pt', 'de', 'en'];

            LanguageUtils.sortByDisplayName(languages, 'en');

            expect(languages).toEqual(['pt', 'de', 'en']);
        });

        it('should not throw for missing or invalid display languages', () => {
            expect(LanguageUtils.sortByDisplayName(['pt', 'de', 'en'], EMPTY)).toEqual(['en', 'de', 'pt']);
            expect(LanguageUtils.sortByDisplayName(['pt', 'de', 'en'], 'not a locale')).toEqual(['en', 'de', 'pt']);
        });

        it('should return an empty list for no languages', () => {
            expect(LanguageUtils.sortByDisplayName([], 'en')).toEqual([]);
        });
    });
});
