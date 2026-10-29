import { EMPTY } from '../constants/constants';

export class TextUtils {
    static hasLetter(text: string): boolean {
        return /\p{L}/u.test(text ?? EMPTY);
    }

    static normalize(text: string): string {
        return (text ?? EMPTY).normalize('NFC').replace(/\s+/g, ' ').trim();
    }

    static similarity(first: string, second: string): number {
        const firstComparable: string = TextUtils.toComparable(first);
        const secondComparable: string = TextUtils.toComparable(second);

        if (firstComparable === secondComparable) {
            return 1;
        }

        if (firstComparable.length < 2 || secondComparable.length < 2) {
            return 0;
        }

        const firstBigrams: Map<string, number> = TextUtils.bigrams(firstComparable);
        const secondBigrams: Map<string, number> = TextUtils.bigrams(secondComparable);
        let shared: number = 0;

        firstBigrams.forEach((count: number, bigram: string) => {
            shared += Math.min(count, secondBigrams.get(bigram) ?? 0);
        });

        return (2 * shared) / (firstComparable.length - 1 + (secondComparable.length - 1));
    }

    static toComparable(text: string): string {
        return TextUtils.normalize(text).toLowerCase();
    }

    static toLettersAndDigits(text: string): string {
        return TextUtils.toComparable(text).replace(/[^\p{L}\p{N}]+/gu, EMPTY);
    }

    private static bigrams(text: string): Map<string, number> {
        const result: Map<string, number> = new Map<string, number>();

        for (let index: number = 0; index < text.length - 1; index++) {
            const bigram: string = text.substring(index, index + 2);
            result.set(bigram, (result.get(bigram) ?? 0) + 1);
        }

        return result;
    }
}
