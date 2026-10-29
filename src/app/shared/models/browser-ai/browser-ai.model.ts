export type BrowserAiAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable';

export interface BrowserAiDownloadProgressEvent extends Event {
    loaded: number;
}

export interface BrowserAiCreateMonitor {
    addEventListener(type: 'downloadprogress', listener: (event: BrowserAiDownloadProgressEvent) => void): void;
}

export interface BrowserTranslatorOptions {
    monitor?: (monitor: BrowserAiCreateMonitor) => void;
    signal?: AbortSignal;
    sourceLanguage: string;
    targetLanguage: string;
}

export interface BrowserTranslator {
    destroy(): void;
    translate(input: string, options?: { signal?: AbortSignal }): Promise<string>;
}

export interface BrowserTranslatorFactory {
    availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<BrowserAiAvailability>;
    create(options: BrowserTranslatorOptions): Promise<BrowserTranslator>;
}

export interface BrowserLanguageDetectionResult {
    confidence: number;
    detectedLanguage: string;
}

export interface BrowserLanguageDetector {
    destroy(): void;
    detect(input: string, options?: { signal?: AbortSignal }): Promise<BrowserLanguageDetectionResult[]>;
}

export interface BrowserLanguageDetectorFactory {
    availability(options?: { expectedInputLanguages?: string[] }): Promise<BrowserAiAvailability>;
    create(options?: { expectedInputLanguages?: string[]; monitor?: (monitor: BrowserAiCreateMonitor) => void; signal?: AbortSignal }): Promise<BrowserLanguageDetector>;
}

export interface BrowserAiGlobal {
    LanguageDetector?: BrowserLanguageDetectorFactory;
    Translator?: BrowserTranslatorFactory;
}
