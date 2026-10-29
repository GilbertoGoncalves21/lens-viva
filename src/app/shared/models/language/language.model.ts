export interface LanguagePair {
    sourceLanguage: string;
    targetLanguage: string;
}

export interface LanguageModelInfo {
    downloaded: boolean;
    downloading: boolean;
    language: string;
    removable: boolean;
}

export interface ModelInventory {
    downloaded: string[];
    downloading: string[];
}
