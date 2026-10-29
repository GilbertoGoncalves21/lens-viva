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
    /** Legacy storage field. Camera translation always assembles phrases and paragraphs. */
    regionGranularity: RegionGranularity;
    requireWifiForDownloads: boolean;
    showDebugRegions: boolean;
    sourceLanguage: string;
    targetLanguage: string;
}
