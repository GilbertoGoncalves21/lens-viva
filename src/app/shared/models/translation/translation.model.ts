import { LanguagePair } from '../language/language.model';

export interface TranslationRequest {
    contextText?: string;
    context?: 'menu';
    languagePair: LanguagePair;
    regionId: string;
    text: string;
    textVersion: number;
}

export interface TranslationResult {
    failed: boolean;
    regionId: string;
    textVersion: number;
    translatedText: string;
}
