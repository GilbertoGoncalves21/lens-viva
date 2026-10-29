export enum RegionGranularity {
    BLOCK = 'BLOCK',
    LINE  = 'LINE',
}

export interface AppSettings {
    onlineTranslationUrl?: string;
    onlineTranslationToken?: string;
    analysesPerSecond: number;
    appLanguage: string;
    balloonFontScale: number;
    historyEnabled: boolean;
    languageConfirmedFor: string;
    regionGranularity: RegionGranularity;
    requireWifiForDownloads: boolean;
    showDebugRegions: boolean;
    sourceLanguage: string;
    targetLanguage: string;
}
