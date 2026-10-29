import { LanguagePair } from '../../models';
import { HashUtils } from '../hash-utils/hash-utils';
import { TextUtils } from '../text-utils/text-utils';

export class TranslationKeyUtils {
    static build(text: string, languagePair: LanguagePair, engineVersion: string): string {
        const normalizedText: string = TextUtils.normalize(text);

        return [
            HashUtils.fnv1a(normalizedText),
            normalizedText.length,
            languagePair.sourceLanguage,
            languagePair.targetLanguage,
            engineVersion,
        ].join(':');
    }
}
