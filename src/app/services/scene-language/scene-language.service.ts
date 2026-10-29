import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { LanguageDetection, SceneLanguageState, SceneLanguageStatus } from 'src/app/shared/models';
import {
    EMPTY
,   RECOGNITION_SOURCE_LANGUAGES
,   LanguageUtils
,   SCENE_LANGUAGE_CONFIG
,   TRANSLATION_LANGUAGES
,   TextUtils
} from 'src/app/shared/utils';
import { LanguageDetectionService } from '../language-detection/language-detection.service';
import { LoggerService } from '../logger/logger.service';

const AUTOMATIC_STATUSES: SceneLanguageStatus[] = [
    SceneLanguageStatus.IDENTIFIED
,   SceneLanguageStatus.IDENTIFYING
,   SceneLanguageStatus.UNDETERMINED
];

const IDLE_STATE: SceneLanguageState = { confidence: 0, language: null, status: SceneLanguageStatus.IDLE };

const SAMPLE_SEPARATOR: string = '\n';

interface SceneSample {
    letters: number;
    text: string;
}

@Injectable({
    providedIn: 'root'
})
export class SceneLanguageService {
    private _candidate: string | null = null;
    private _candidateStreak: number = 0;
    private _firstTextAt: number | null = null;
    private _generation: number = 0;
    private _lastAppliedSequence: number = 0;
    private _lastSampleAt: number = Number.NEGATIVE_INFINITY;
    private _lastSampleText: string = EMPTY;
    private _scores: Map<string, number> = new Map<string, number>();
    private _sequence: number = 0;
    private _state$: BehaviorSubject<SceneLanguageState> = new BehaviorSubject<SceneLanguageState>(IDLE_STATE);

    constructor(
        private languageDetectionService: LanguageDetectionService,
        private loggerService: LoggerService,
    ) {}

    get contested(): boolean {
        return (
            this.state.status === SceneLanguageStatus.IDENTIFIED &&
            this._candidate !== null &&
            this._candidate !== this.state.language
        );
    }

    get state(): SceneLanguageState {
        return this._state$.value;
    }

    changes(): Observable<SceneLanguageState> {
        return this._state$.asObservable();
    }

    observe(texts: string[], now: number): void {
        if (!AUTOMATIC_STATUSES.includes(this.state.status)) {
            return;
        }

        const sample: SceneSample = this.buildSample(texts);

        if (sample.letters > 0 && this._firstTextAt === null) {
            this._firstTextAt = now;
        }

        if (sample.letters >= SCENE_LANGUAGE_CONFIG.minSampleLetters && this.sampleDue(sample, now)) {
            this.takeSample(sample, now);
        }

        this.checkUndetermined(now);
    }

    reset(): void {
        this.restart();
        this.emit(IDLE_STATE);
    }

    setFixedLanguage(language: string): void {
        this.restart();
        this.emit({ confidence: 1, language: language, status: SceneLanguageStatus.FIXED });
    }

    setManualLanguage(language: string): void {
        const primary: string = LanguageUtils.primarySubtag(language);

        if (!TRANSLATION_LANGUAGES.includes(primary)) {
            return;
        }

        this.restart();
        this.emit({ confidence: 1, language: primary, status: SceneLanguageStatus.MANUAL });
    }

    startAutomatic(): void {
        this.restart();
        this.emit({ confidence: 0, language: null, status: SceneLanguageStatus.IDENTIFYING });
    }

    private applySample(detection: LanguageDetection, sequence: number, generation: number): void {
        if (generation !== this._generation || sequence <= this._lastAppliedSequence) {
            return;
        }

        this._lastAppliedSequence = sequence;

        const winner: string | null = this.reliableLanguage(detection);

        this.vote(winner, detection.confidence);

        if (winner !== null) {
            this.decide(winner, detection.confidence);
        }
    }

    private buildSample(texts: string[]): SceneSample {
        const unique: Map<string, string> = new Map<string, string>();

        texts.forEach((text: string) => {
            const normalized: string = TextUtils.normalize(text);
            const comparable: string = normalized.toLowerCase();

            if (normalized !== EMPTY && !unique.has(comparable)) {
                unique.set(comparable, normalized);
            }
        });

        const ordered: string[] = [...unique.values()].sort((first: string, second: string) =>
            second.length - first.length || this.compareTexts(first, second),
        );
        const selected: string[] = [];
        let length: number = 0;

        ordered.forEach((text: string) => {
            const separatorLength: number = selected.length > 0 ? SAMPLE_SEPARATOR.length : 0;
            const available: number = SCENE_LANGUAGE_CONFIG.maxSampleCharacters - length - separatorLength;

            if (text.length <= available) {
                selected.push(text);
                length += separatorLength + text.length;
            } else if (selected.length === 0) {
                selected.push(text.slice(0, SCENE_LANGUAGE_CONFIG.maxSampleCharacters));
                length = SCENE_LANGUAGE_CONFIG.maxSampleCharacters;
            }
        });

        const sampleText: string = selected.join(SAMPLE_SEPARATOR);

        return { letters: (sampleText.match(/\p{L}/gu) ?? []).length, text: sampleText };
    }

    private checkUndetermined(now: number): void {
        if (
            this.state.status === SceneLanguageStatus.IDENTIFYING &&
            this._firstTextAt !== null &&
            now - this._firstTextAt >= SCENE_LANGUAGE_CONFIG.undeterminedAfterMilliseconds
        ) {
            this.emit({ confidence: 0, language: null, status: SceneLanguageStatus.UNDETERMINED });
        }
    }

    private compareTexts(first: string, second: string): number {
        if (first === second) {
            return 0;
        }

        return first < second ? -1 : 1;
    }

    private decide(winner: string, confidence: number): void {
        const current: string | null = this.state.language;

        if (current === null) {
            const confident: boolean =
                confidence >= SCENE_LANGUAGE_CONFIG.lockConfidence ||
                this._candidateStreak >= SCENE_LANGUAGE_CONFIG.lockConsecutiveSamples;

            if (confident && this.leads(winner)) {
                this.identify(winner, confidence);
            }

            return;
        }

        if (
            winner !== current &&
            this._candidateStreak >= SCENE_LANGUAGE_CONFIG.switchConsecutiveSamples &&
            this.score(winner) > this.score(current)
        ) {
            this.identify(winner, confidence);
        }
    }

    private emit(state: SceneLanguageState): void {
        const current: SceneLanguageState = this.state;

        if (state.status === current.status && state.language === current.language) {
            return;
        }

        this._state$.next(state);
        this.loggerService.debug('scene-language-changed', {
            confidence: Math.round(state.confidence * 100) / 100,
            language: state.language,
            status: state.status,
        });
    }

    private identify(language: string, confidence: number): void {
        this.emit({ confidence: confidence, language: language, status: SceneLanguageStatus.IDENTIFIED });
    }

    private leads(language: string): boolean {
        const score: number = this.score(language);

        return [...this._scores.values()].every((otherScore: number) => otherScore <= score);
    }

    private reliableLanguage(detection: LanguageDetection): string | null {
        const language: string | null = detection.language;

        if (language === null || !RECOGNITION_SOURCE_LANGUAGES.includes(language) || detection.confidence < SCENE_LANGUAGE_CONFIG.minConfidence) {
            return null;
        }

        return language;
    }

    private restart(): void {
        this._generation++;
        this._candidate = null;
        this._candidateStreak = 0;
        this._firstTextAt = null;
        this._lastSampleAt = Number.NEGATIVE_INFINITY;
        this._lastSampleText = EMPTY;
        this._scores.clear();
    }

    private sampleDue(sample: SceneSample, now: number): boolean {
        if (now - this._lastSampleAt >= SCENE_LANGUAGE_CONFIG.sampleIntervalMilliseconds) {
            return true;
        }

        if (this.state.language === null) {
            return sample.text !== this._lastSampleText;
        }

        return TextUtils.similarity(sample.text, this._lastSampleText) < SCENE_LANGUAGE_CONFIG.sceneChangeSimilarity;
    }

    private score(language: string): number {
        return this._scores.get(language) ?? 0;
    }

    private takeSample(sample: SceneSample, now: number): void {
        const generation: number = this._generation;
        const sequence: number = ++this._sequence;

        this._lastSampleAt = now;
        this._lastSampleText = sample.text;

        this.languageDetectionService
            .detect(sample.text)
            .then((detection: LanguageDetection) => this.applySample(detection, sequence, generation))
            .catch((error: unknown) => this.loggerService.error('scene-language-detection-failed', error));
    }

    private vote(winner: string | null, confidence: number): void {
        this._scores.forEach((score: number, language: string) => {
            const decayed: number = score * SCENE_LANGUAGE_CONFIG.scoreDecay;

            if (decayed < SCENE_LANGUAGE_CONFIG.negligibleScore) {
                this._scores.delete(language);
            } else {
                this._scores.set(language, decayed);
            }
        });

        if (winner === null) {
            return;
        }

        this._scores.set(winner, this.score(winner) + confidence);

        if (winner === this._candidate) {
            this._candidateStreak++;
            return;
        }

        this._candidate = winner;
        this._candidateStreak = 1;
    }
}
