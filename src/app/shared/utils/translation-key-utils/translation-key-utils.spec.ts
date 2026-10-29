import { LanguagePair } from '../../models';
import { TranslationKeyUtils } from './translation-key-utils';

describe('TranslationKeyUtils', () => {
    const englishToPortuguese: LanguagePair = { sourceLanguage: 'en', targetLanguage: 'pt' };

    describe('build', () => {
        it('should ignore whitespace differences', () => {
            expect(TranslationKeyUtils.build('Grilled Chicken', englishToPortuguese, 'v1'))
                .toBe(TranslationKeyUtils.build('  Grilled   Chicken ', englishToPortuguese, 'v1'));
        });

        it('should differ by case', () => {
            const germanToEnglish: LanguagePair = { sourceLanguage: 'de', targetLanguage: 'en' };

            expect(TranslationKeyUtils.build('Essen', germanToEnglish, 'v1')).not.toBe(TranslationKeyUtils.build('essen', germanToEnglish, 'v1'));
            expect(TranslationKeyUtils.build('EXIT', englishToPortuguese, 'v1')).not.toBe(TranslationKeyUtils.build('Exit', englishToPortuguese, 'v1'));
        });

        it('should treat composed and decomposed accents as the same text', () => {
            expect(TranslationKeyUtils.build('Caf\u00e9', englishToPortuguese, 'v1')).toBe(TranslationKeyUtils.build('Cafe\u0301', englishToPortuguese, 'v1'));
        });

        it('should differ for different texts', () => {
            expect(TranslationKeyUtils.build('Chocolate cake', englishToPortuguese, 'v1'))
                .not.toBe(TranslationKeyUtils.build('Chocolate cakes', englishToPortuguese, 'v1'));
        });

        it('should differ by language pair', () => {
            const keys: Set<string> = new Set<string>([
                TranslationKeyUtils.build('Chocolate cake', englishToPortuguese, 'v1'),
                TranslationKeyUtils.build('Chocolate cake', { sourceLanguage: 'en', targetLanguage: 'es' }, 'v1'),
                TranslationKeyUtils.build('Chocolate cake', { sourceLanguage: 'fr', targetLanguage: 'pt' }, 'v1'),
                TranslationKeyUtils.build('Chocolate cake', { sourceLanguage: 'pt', targetLanguage: 'en' }, 'v1'),
            ]);

            expect(keys.size).toBe(4);
        });

        it('should differ by engine version', () => {
            expect(TranslationKeyUtils.build('Chocolate cake', englishToPortuguese, 'v1'))
                .not.toBe(TranslationKeyUtils.build('Chocolate cake', englishToPortuguese, 'v2'));
        });

        it('should never contain the raw text', () => {
            const text: string = 'Grilled chicken with lemon';
            const key: string = TranslationKeyUtils.build(text, englishToPortuguese, 'v1');

            expect(key).not.toContain(text);
            expect(key.toLowerCase()).not.toContain('grilled');
            expect(key.toLowerCase()).not.toContain('chicken');
            expect(key.toLowerCase()).not.toContain('lemon');
        });

        it('should be made of hash, length, languages and engine version', () => {
            expect(TranslationKeyUtils.build('Daily Specials', englishToPortuguese, 'v1')).toMatch(/^[0-9a-f]{8}:14:en:pt:v1$/);
        });

        it('should be stable across calls', () => {
            expect(TranslationKeyUtils.build('Daily Specials', englishToPortuguese, 'v1'))
                .toBe(TranslationKeyUtils.build('Daily Specials', englishToPortuguese, 'v1'));
        });
    });
});
