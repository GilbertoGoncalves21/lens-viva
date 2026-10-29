export interface HistoryEntry {
    createdAt: string;
    historyEntryId: string;
    originalText: string;
    sourceLanguage: string;
    targetLanguage: string;
    translatedText: string;
}

export interface HistoryRecordRequest {
    originalText: string;
    sourceLanguage: string;
    targetLanguage: string;
    translatedText: string;
}
