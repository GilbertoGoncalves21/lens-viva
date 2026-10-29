import { EMPTY } from '../constants/constants';
import { TextUtils } from './text-utils';

describe('TextUtils', () => {
    describe('normalize', () => {
        it('should collapse whitespace and trim', () => {
            expect(TextUtils.normalize('  Grilled \n\t chicken   with  lemon  ')).toBe('Grilled chicken with lemon');
        });

        it('should collapse non breaking spaces', () => {
            expect(TextUtils.normalize('Daily  Specials')).toBe('Daily Specials');
        });

        it('should compose decomposed accents', () => {
            const normalized: string = TextUtils.normalize('Café');

            expect(normalized).toBe('Café');
            expect(normalized.length).toBe(4);
        });

        it('should keep the original casing', () => {
            expect(TextUtils.normalize('Menu DO Dia')).toBe('Menu DO Dia');
        });

        it('should return EMPTY for null or undefined input', () => {
            expect(TextUtils.normalize(null as unknown as string)).toBe(EMPTY);
            expect(TextUtils.normalize(undefined as unknown as string)).toBe(EMPTY);
        });
    });

    describe('toComparable', () => {
        it('should normalize whitespace and lower case', () => {
            expect(TextUtils.toComparable('  HeLLo   World ')).toBe('hello world');
        });

        it('should lower case independently of the device locale', () => {
            expect(TextUtils.toComparable('INFO')).toBe('info');
        });

        it('should lower case accented letters', () => {
            expect(TextUtils.toComparable('ÇÃO É ÜBER')).toBe('ção é über');
        });
    });

    describe('toLettersAndDigits', () => {
        it('should drop whitespace and punctuation and lower case the rest', () => {
            expect(TextUtils.toLettersAndDigits('  Daily  Specials. ')).toBe('dailyspecials');
        });

        it('should keep digits so that prices stay distinct', () => {
            expect(TextUtils.toLettersAndDigits('Pizza Margherita 8,50')).toBe('pizzamargherita850');
            expect(TextUtils.toLettersAndDigits('Pizza Margherita 8,50')).not.toBe(TextUtils.toLettersAndDigits('Pizza Margherita 9,50'));
        });

        it('should keep accented and non latin letters', () => {
            expect(TextUtils.toLettersAndDigits('Café, à la carte!')).toBe('caféàlacarte');
            expect(TextUtils.toLettersAndDigits('日本 - 東京')).toBe('日本東京');
        });

        it('should return an empty text for missing text', () => {
            expect(TextUtils.toLettersAndDigits(null as unknown as string)).toBe(EMPTY);
        });
    });

    describe('similarity', () => {
        it('should be 1 for identical strings', () => {
            expect(TextUtils.similarity('Fresh tomato soup', 'Fresh tomato soup')).toBe(1);
        });

        it('should ignore case and whitespace differences', () => {
            expect(TextUtils.similarity('Fresh  TOMATO soup ', 'fresh tomato soup')).toBe(1);
        });

        it('should treat composed and decomposed accents as identical', () => {
            expect(TextUtils.similarity('Café', 'Café')).toBe(1);
        });

        it('should be 1 for two empty strings', () => {
            expect(TextUtils.similarity(EMPTY, EMPTY)).toBe(1);
        });

        it('should be 0 when only one string is empty', () => {
            expect(TextUtils.similarity('Menu', EMPTY)).toBe(0);
            expect(TextUtils.similarity(EMPTY, 'Menu')).toBe(0);
        });

        it('should be 0 for different single characters', () => {
            expect(TextUtils.similarity('a', 'b')).toBe(0);
        });

        it('should be 0 when one string is too short to have bigrams', () => {
            expect(TextUtils.similarity('a', 'ab')).toBe(0);
        });

        it('should be 0 for strings without shared bigrams', () => {
            expect(TextUtils.similarity('abc', 'xyz')).toBe(0);
        });

        it('should be high but below 1 for nearly identical strings', () => {
            const similarity: number = TextUtils.similarity('Grilled chicken with lemon', 'Grilled chicken with lemon!');

            expect(similarity).toBeGreaterThan(0.9);
            expect(similarity).toBeLessThan(1);
        });

        it('should be low for unrelated sentences', () => {
            expect(TextUtils.similarity('Chocolate cake', 'Open every day until midnight')).toBeLessThan(0.3);
        });

        it('should count repeated bigrams only as many times as they are shared', () => {
            expect(TextUtils.similarity('aaaa', 'aa')).toBeCloseTo(0.5);
        });

        it('should be symmetric', () => {
            expect(TextUtils.similarity('Daily Specials', 'Daily Special')).toBeCloseTo(TextUtils.similarity('Daily Special', 'Daily Specials'));
        });

        it('should stay within 0 and 1', () => {
            const pairs: string[][] = [
                ['night', 'nacht'],
                ['context', 'contact'],
                ['Sopa de tomate', 'Sopa de tomate fresca'],
            ];

            pairs.forEach((pair: string[]) => {
                const similarity: number = TextUtils.similarity(pair[0], pair[1]);

                expect(similarity).toBeGreaterThanOrEqual(0);
                expect(similarity).toBeLessThanOrEqual(1);
            });
        });
    });

    describe('hasLetter', () => {
        it('should detect plain latin letters', () => {
            expect(TextUtils.hasLetter('Menu')).toBe(true);
        });

        it('should detect accented letters', () => {
            expect(TextUtils.hasLetter('é')).toBe(true);
            expect(TextUtils.hasLetter('ção')).toBe(true);
            expect(TextUtils.hasLetter('ß')).toBe(true);
            expect(TextUtils.hasLetter('12 €, à')).toBe(true);
        });

        it('should detect letters from non latin scripts', () => {
            expect(TextUtils.hasLetter('日本')).toBe(true);
            expect(TextUtils.hasLetter('Жизнь')).toBe(true);
            expect(TextUtils.hasLetter('مرحبا')).toBe(true);
        });

        it('should be false for digits, punctuation and symbols only', () => {
            expect(TextUtils.hasLetter('12:30 - 45,00')).toBe(false);
            expect(TextUtils.hasLetter('!!! ??? €')).toBe(false);
        });

        it('should be false for empty or missing text', () => {
            expect(TextUtils.hasLetter(EMPTY)).toBe(false);
            expect(TextUtils.hasLetter(null as unknown as string)).toBe(false);
        });
    });
});
