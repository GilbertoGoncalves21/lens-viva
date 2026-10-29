export interface EnglishSpeller {
    correct(word: string): boolean;
    suggest(word: string): string[];
}

/** Lexical repair, not a grammar model. Keep ambiguous readings and valid words unchanged. */
export function repairEnglishOcr(text: string, speller: EnglishSpeller): string {
    const words = [...text.matchAll(/\b[A-Za-z]+(?:'[A-Za-z]+)?\b/gu)];
    const isolatedLongWord = words.length === 1 && words[0][0].length >= 8;
    if (
        (!isolatedLongWord && words.length < 2) ||
        text.length > 4000 ||
        /https?:\/\/|www\.|@/iu.test(text)
    )
        return text;
    const known = words.filter(([word]) => speller.correct(word)).length;
    if (!isolatedLongWord && known / words.length < 0.5) return text;
    let attempts = 0;
    return text.replace(/\b[A-Za-z]+(?:'[A-Za-z]+)?\b/gu, (word: string, index: number) => {
        if (
            word.length < 5 ||
            word.length > 32 ||
            speller.correct(word) ||
            word === word.toUpperCase()
        )
            return word;
        if (
            /[\p{L}\p{N}_]/u.test(text[index - 1] ?? '') ||
            /[\p{L}\p{N}_]/u.test(text[index + word.length] ?? '')
        )
            return word;
        const capitalized = /^[A-Z]/u.test(word);
        const prefix = text.slice(0, index);
        if (capitalized && !/^[\s"“'‘([]*$/u.test(prefix) && !/[.!?][”’"')\]]*\s*$/u.test(prefix))
            return word;
        if (++attempts > 8) return word;
        const lower = word.toLowerCase();
        const suggestions = [
            ...new Set(speller.suggest(word).map((candidate) => candidate.toLowerCase())),
        ].filter(
            (candidate) =>
                /^[a-z]+$/u.test(candidate) &&
                speller.correct(candidate) &&
                oneEditApart(lower, candidate),
        );
        if (suggestions.length !== 1) return word;
        const replacement = suggestions[0];
        return capitalized ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
    });
}

function oneEditApart(first: string, second: string): boolean {
    if (first === second || Math.abs(first.length - second.length) > 1) return false;
    if (first.length === second.length) {
        const different = [...first]
            .map((character, index) => (character === second[index] ? -1 : index))
            .filter((index) => index !== -1);
        return (
            different.length === 1 ||
            (different.length === 2 &&
                different[1] === different[0] + 1 &&
                first[different[0]] === second[different[1]] &&
                first[different[1]] === second[different[0]])
        );
    }
    const shorter = first.length < second.length ? first : second;
    const longer = first.length < second.length ? second : first;
    let index = 0;
    while (index < shorter.length && shorter[index] === longer[index]) index++;
    return shorter.slice(index) === longer.slice(index + 1);
}
