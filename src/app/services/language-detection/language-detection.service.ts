import { Injectable } from '@angular/core';
import { IdentifyLanguageResponse, LanguageDetection } from 'src/app/shared/models';
import {
    GeometryUtils
,   HashUtils
,   LANGUAGE_DETECTION_CONFIG
,   LATIN_SOURCE_LANGUAGES
,   LanguageUtils
,   TRANSLATION_LANGUAGES
,   TextUtils
,   UNDETERMINED_LANGUAGE
} from 'src/app/shared/utils';
import { LensEngineService } from '../lens-engine/lens-engine.service';
import { LoggerService } from '../logger/logger.service';

@Injectable({
    providedIn: 'root'
})
export class LanguageDetectionService {
    private _cache: Map<string, LanguageDetection> = new Map<string, LanguageDetection>();
    private _cacheGeneration: number = 0;
    private _inFlight: Map<string, Promise<LanguageDetection>> = new Map<string, Promise<LanguageDetection>>();

    constructor(
        private lensEngineService: LensEngineService,
        private loggerService: LoggerService,
    ) {}

    get cacheSize(): number {
        return this._cache.size;
    }

    clearCache(): void {
        this._cache.clear();
        this._inFlight.clear();
        this._cacheGeneration++;
    }

    detect(text: string): Promise<LanguageDetection> {
        const normalizedText: string = TextUtils.normalize(text);

        return this.detectNormalized(normalizedText, this.keyFor(normalizedText));
    }

    private cached(key: string): LanguageDetection | null {
        const cached: LanguageDetection | undefined = this._cache.get(key);

        if (!cached) {
            return null;
        }

        this._cache.delete(key);
        this._cache.set(key, cached);

        return cached;
    }

    private detectNormalized(normalizedText: string, key: string): Promise<LanguageDetection> {
        const cached: LanguageDetection | null = this.cached(key);

        if (cached) {
            return Promise.resolve({ ...cached });
        }

        if (this.letterCount(normalizedText) < LANGUAGE_DETECTION_CONFIG.minLetters) {
            return Promise.resolve(this.undeterminedDetection());
        }

        const inFlight: Promise<LanguageDetection> = this._inFlight.get(key) ?? this.startIdentification(normalizedText, key);

        return inFlight.then((detection: LanguageDetection): LanguageDetection => ({ ...detection }));
    }

    private async identify(normalizedText: string, key: string, cacheGeneration: number): Promise<LanguageDetection> {
        try {
            const response: IdentifyLanguageResponse = await this.lensEngineService.identifyLanguage(normalizedText);
            const detection: LanguageDetection = this.toDetection(response);

            if (cacheGeneration === this._cacheGeneration) {
                this.remember(key, detection);
            }

            return detection;
        } catch (error: unknown) {
            this.loggerService.error('language-detection-failed', error);

            return this.undeterminedDetection();
        }
    }

    private keyFor(normalizedText: string): string {
        const comparable: string = TextUtils.toComparable(normalizedText);

        return `${HashUtils.fnv1a(comparable)}:${comparable.length}`;
    }

    private letterCount(text: string): number {
        return (text.match(/\p{L}/gu) ?? []).length;
    }

    private remember(key: string, detection: LanguageDetection): void {
        this._cache.delete(key);
        this._cache.set(key, detection);

        while (this._cache.size > LANGUAGE_DETECTION_CONFIG.cacheMaxEntries) {
            const oldestKey: string | undefined = this._cache.keys().next().value;

            if (oldestKey === undefined) {
                return;
            }

            this._cache.delete(oldestKey);
        }
    }

    private startIdentification(normalizedText: string, key: string): Promise<LanguageDetection> {
        const identification: Promise<LanguageDetection> = this.identify(normalizedText, key, this._cacheGeneration)
            .finally((): void => {
                if (this._inFlight.get(key) === identification) {
                    this._inFlight.delete(key);
                }
            });

        this._inFlight.set(key, identification);

        return identification;
    }

    private toDetection(response: IdentifyLanguageResponse | null | undefined): LanguageDetection {
        const rawLanguage: unknown = response?.language;
        const rawConfidence: unknown = response?.confidence;
        const primary: string = LanguageUtils.primarySubtag(typeof rawLanguage === 'string' ? rawLanguage : null);
        const language: string | null = primary !== UNDETERMINED_LANGUAGE && TRANSLATION_LANGUAGES.includes(primary) ? primary : null;
        const confidence: number = typeof rawConfidence === 'number' && Number.isFinite(rawConfidence) ? GeometryUtils.clamp(rawConfidence, 0, 1) : 0;
        const reliable: boolean =
            language !== null &&
            LATIN_SOURCE_LANGUAGES.includes(language) &&
            confidence >= LANGUAGE_DETECTION_CONFIG.minConfidence;

        return { confidence: confidence, language: language, reliable: reliable };
    }

    private undeterminedDetection(): LanguageDetection {
        return { confidence: 0, language: null, reliable: false };
    }
}
