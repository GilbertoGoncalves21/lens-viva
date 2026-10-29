import { TestBed } from '@angular/core/testing';
import { Subscription } from 'rxjs';
import type { Mock } from 'vitest';
import { LanguageDetection, SceneLanguageState, SceneLanguageStatus } from 'src/app/shared/models';
import { SCENE_LANGUAGE_CONFIG } from 'src/app/shared/utils';
import { LanguageDetectionService } from '../language-detection/language-detection.service';
import { LoggerService } from '../logger/logger.service';
import { SceneLanguageService } from './scene-language.service';

interface Deferred<T> {
    promise: Promise<T>;
    reject: (reason: unknown) => void;
    resolve: (value: T) => void;
}

interface LanguageDetectionServiceStub {
    detect: Mock<(text: string) => Promise<LanguageDetection>>;
}

interface LoggerServiceStub {
    debug: Mock<(event: string, details?: Record<string, unknown>) => void>;
    error: Mock<(event: string, error: unknown) => void>;
}

const INTERVAL: number = SCENE_LANGUAGE_CONFIG.sampleIntervalMilliseconds;

const MENU_TEXTS: string[] = ['Fried chicken with potatoes', 'Water'];

const OTHER_MENU_TEXTS: string[] = ['Grilled salmon with lemon sauce', 'Soda'];

const SPANISH_MENU_TEXTS: string[] = ['Pollo frito con patatas', 'Agua mineral sin gas'];

const UNDETERMINED_AFTER: number = SCENE_LANGUAGE_CONFIG.undeterminedAfterMilliseconds;

function createDeferred<T>(): Deferred<T> {
    let resolve: (value: T) => void = (): void => undefined;
    let reject: (reason: unknown) => void = (): void => undefined;
    const promise: Promise<T> = new Promise<T>((resolvePromise: (value: T) => void, rejectPromise: (reason: unknown) => void) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return { promise: promise, reject: reject, resolve: resolve };
}

function detection(language: string | null, confidence: number): LanguageDetection {
    return { confidence: confidence, language: language, reliable: language !== null && confidence >= 0.5 };
}

async function flushDetections(): Promise<void> {
    for (let tick: number = 0; tick < 10; tick++) {
        await Promise.resolve();
    }
}

function sceneTexts(index: number): string[] {
    return [`Daily special number ${index} with fresh vegetables`, 'Water'];
}

describe('SceneLanguageService', () => {
    let emissions: SceneLanguageState[];
    let languageDetectionServiceStub: LanguageDetectionServiceStub;
    let loggerServiceStub: LoggerServiceStub;
    let service: SceneLanguageService;
    let subscription: Subscription;

    beforeEach(() => {
        languageDetectionServiceStub = { detect: vi.fn(async (): Promise<LanguageDetection> => detection(null, 0)) };
        loggerServiceStub = { debug: vi.fn(), error: vi.fn() };

        TestBed.configureTestingModule({
            providers: [
                { provide: LanguageDetectionService, useValue: languageDetectionServiceStub },
                { provide: LoggerService, useValue: loggerServiceStub },
            ],
        });
        service = TestBed.inject(SceneLanguageService);
        emissions = [];
        subscription = service.changes().subscribe((state: SceneLanguageState) => emissions.push(state));
    });

    afterEach(() => {
        subscription.unsubscribe();
    });

    function respondWith(...detections: LanguageDetection[]): void {
        detections.forEach((value: LanguageDetection) => languageDetectionServiceStub.detect.mockResolvedValueOnce(value));
    }

    async function sample(texts: string[], now: number, result: LanguageDetection): Promise<void> {
        respondWith(result);
        service.observe(texts, now);
        await flushDetections();
    }

    async function identifyEnglish(): Promise<void> {
        service.startAutomatic();
        await sample(MENU_TEXTS, 0, detection('en', 0.9));
    }

    function statuses(): SceneLanguageStatus[] {
        return emissions.map((state: SceneLanguageState) => state.status);
    }

    it('should start idle and ignore observations', () => {
        service.observe(MENU_TEXTS, 0);

        expect(service.state).toEqual({ confidence: 0, language: null, status: SceneLanguageStatus.IDLE });
        expect(languageDetectionServiceStub.detect).not.toHaveBeenCalled();
    });

    it('should start identifying when the automatic mode starts', () => {
        service.startAutomatic();

        expect(service.state).toEqual({ confidence: 0, language: null, status: SceneLanguageStatus.IDENTIFYING });
        expect(statuses()).toEqual([SceneLanguageStatus.IDLE, SceneLanguageStatus.IDENTIFYING]);
    });

    describe('sample', () => {
        beforeEach(() => {
            service.startAutomatic();
        });

        it('should identify one sample built from the unique texts, longest first', () => {
            service.observe(['Water', 'Fried chicken with potatoes', 'water', '  Fried   chicken with potatoes ', 'Carne assada'], 0);

            expect(languageDetectionServiceStub.detect).toHaveBeenCalledTimes(1);
            expect(languageDetectionServiceStub.detect).toHaveBeenCalledWith('Fried chicken with potatoes\nCarne assada\nWater');
        });

        it('should keep the sample within the maximum length, skipping the texts that do not fit', () => {
            const long: string = 'a'.repeat(SCENE_LANGUAGE_CONFIG.maxSampleCharacters - 10);
            const medium: string = 'b'.repeat(20);
            const short: string = 'c'.repeat(5);

            service.observe([short, medium, long], 0);

            expect(languageDetectionServiceStub.detect).toHaveBeenCalledWith(`${long}\n${short}`);
        });

        it('should cut a single text that is longer than the maximum length', () => {
            const tooLong: string = 'd'.repeat(SCENE_LANGUAGE_CONFIG.maxSampleCharacters + 50);

            service.observe([tooLong, 'Water'], 0);

            expect(languageDetectionServiceStub.detect).toHaveBeenCalledWith('d'.repeat(SCENE_LANGUAGE_CONFIG.maxSampleCharacters));
        });

        it('should not identify scenes with too few letters and let the user choose the language in time', () => {
            service.observe(['Soda', 'Menu', '12,90'], 0);
            service.observe(['Soda', 'Menu', 'Água'], UNDETERMINED_AFTER);

            expect(languageDetectionServiceStub.detect).not.toHaveBeenCalled();
            expect(service.state).toEqual({ confidence: 0, language: null, status: SceneLanguageStatus.UNDETERMINED });
        });

        it('should never log the recognized text', async () => {
            await sample(MENU_TEXTS, 0, detection('en', 0.9));

            expect(JSON.stringify(loggerServiceStub.debug.mock.calls)).not.toContain('chicken');
            expect(loggerServiceStub.debug).toHaveBeenCalledWith('scene-language-changed', {
                confidence: 0.9,
                language: 'en',
                status: SceneLanguageStatus.IDENTIFIED,
            });
        });

        it('should log a failed identification without the text and keep identifying', async () => {
            const failure: Error = new Error('identification failed');

            languageDetectionServiceStub.detect.mockRejectedValueOnce(failure);
            service.observe(MENU_TEXTS, 0);
            await flushDetections();

            expect(loggerServiceStub.error).toHaveBeenCalledWith('scene-language-detection-failed', failure);
            expect(service.state.status).toBe(SceneLanguageStatus.IDENTIFYING);
        });
    });

    describe('throttling', () => {
        beforeEach(() => {
            service.startAutomatic();
        });

        it('should sample again immediately while undecided when the texts changed', async () => {
            await sample(MENU_TEXTS, 0, detection('en', 0.4));
            await sample(OTHER_MENU_TEXTS, 100, detection('en', 0.4));

            expect(languageDetectionServiceStub.detect).toHaveBeenCalledTimes(2);
        });

        it('should wait for the interval while undecided when the texts did not change', async () => {
            await sample(MENU_TEXTS, 0, detection('en', 0.4));
            service.observe([...MENU_TEXTS].reverse(), INTERVAL - 1);

            expect(languageDetectionServiceStub.detect).toHaveBeenCalledTimes(1);

            service.observe(MENU_TEXTS, INTERVAL);

            expect(languageDetectionServiceStub.detect).toHaveBeenCalledTimes(2);
        });

        it('should wait for the interval once a language is identified while the texts change only slightly', async () => {
            const slightlyChanged: string[] = [...MENU_TEXTS, 'Soda'];

            await sample(MENU_TEXTS, 0, detection('en', 0.9));
            service.observe(slightlyChanged, INTERVAL - 1);

            expect(languageDetectionServiceStub.detect).toHaveBeenCalledTimes(1);

            service.observe(slightlyChanged, INTERVAL);

            expect(languageDetectionServiceStub.detect).toHaveBeenCalledTimes(2);
        });

        it('should sample at once when the scene changes after a language is identified', async () => {
            await sample(MENU_TEXTS, 0, detection('en', 0.9));
            service.observe(SPANISH_MENU_TEXTS, 100);

            expect(languageDetectionServiceStub.detect).toHaveBeenCalledTimes(2);
            expect(languageDetectionServiceStub.detect).toHaveBeenLastCalledWith('Pollo frito con patatas\nAgua mineral sin gas');

            service.observe(SPANISH_MENU_TEXTS, 200);

            expect(languageDetectionServiceStub.detect).toHaveBeenCalledTimes(2);
        });

        it('should identify a frozen scene by sampling the same texts again after the interval', async () => {
            await sample(MENU_TEXTS, 0, detection('en', 0.6));

            expect(service.state.status).toBe(SceneLanguageStatus.IDENTIFYING);

            await sample(MENU_TEXTS, INTERVAL, detection('en', 0.6));

            expect(service.state).toEqual({ confidence: 0.6, language: 'en', status: SceneLanguageStatus.IDENTIFIED });
        });
    });

    describe('locking', () => {
        beforeEach(() => {
            service.startAutomatic();
        });

        it('should lock a language at once when one sample is confident enough', async () => {
            await sample(MENU_TEXTS, 0, detection('en', SCENE_LANGUAGE_CONFIG.lockConfidence));

            expect(service.state).toEqual({
                confidence: SCENE_LANGUAGE_CONFIG.lockConfidence,
                language: 'en',
                status: SceneLanguageStatus.IDENTIFIED,
            });
        });

        it('should lock a language that wins two consecutive samples', async () => {
            await sample(MENU_TEXTS, 0, detection('es', 0.6));

            expect(service.state.status).toBe(SceneLanguageStatus.IDENTIFYING);

            await sample(OTHER_MENU_TEXTS, 100, detection('es', 0.55));

            expect(service.state).toEqual({ confidence: 0.55, language: 'es', status: SceneLanguageStatus.IDENTIFIED });
        });

        it('should not lock while two languages alternate with moderate confidence', async () => {
            await sample(sceneTexts(1), 0, detection('en', 0.6));
            await sample(sceneTexts(2), 100, detection('es', 0.6));
            await sample(sceneTexts(3), 200, detection('en', 0.6));

            expect(service.state.status).toBe(SceneLanguageStatus.IDENTIFYING);

            await sample(sceneTexts(4), 300, detection('en', 0.6));

            expect(service.state.language).toBe('en');
        });

        it('should ignore unreliable samples', async () => {
            await sample(sceneTexts(1), 0, detection('en', SCENE_LANGUAGE_CONFIG.minConfidence - 0.01));
            await sample(sceneTexts(2), 100, detection('ru', 0.99));
            await sample(sceneTexts(3), 200, detection(null, 0));
            await sample(sceneTexts(4), 300, detection('en', SCENE_LANGUAGE_CONFIG.minConfidence - 0.01));

            expect(service.state.status).toBe(SceneLanguageStatus.IDENTIFYING);
        });

        it('should keep the streak across unreliable samples', async () => {
            await sample(sceneTexts(1), 0, detection('fr', 0.6));
            await sample(sceneTexts(2), 100, detection(null, 0));
            await sample(sceneTexts(3), 200, detection('fr', 0.6));

            expect(service.state.language).toBe('fr');
        });
    });

    describe('switching', () => {
        beforeEach(async () => {
            await identifyEnglish();
        });

        it('should not flap while the samples alternate between two languages', async () => {
            for (let index: number = 1; index <= 8; index++) {
                await sample(sceneTexts(index), index * INTERVAL, detection(index % 2 === 0 ? 'en' : 'es', 0.95));
            }

            expect(service.state.language).toBe('en');
            expect(statuses()).toEqual([SceneLanguageStatus.IDLE, SceneLanguageStatus.IDENTIFYING, SceneLanguageStatus.IDENTIFIED]);
        });

        it('should not switch when the current language interrupts the streak', async () => {
            await sample(sceneTexts(1), INTERVAL, detection('es', 0.95));
            await sample(sceneTexts(2), INTERVAL * 2, detection('es', 0.95));
            await sample(sceneTexts(3), INTERVAL * 3, detection('en', 0.7));
            await sample(sceneTexts(4), INTERVAL * 4, detection('es', 0.95));
            await sample(sceneTexts(5), INTERVAL * 5, detection('es', 0.95));

            expect(service.state.language).toBe('en');
        });

        it('should switch after enough consecutive samples of another language', async () => {
            for (let index: number = 1; index < SCENE_LANGUAGE_CONFIG.switchConsecutiveSamples; index++) {
                await sample(sceneTexts(index), index * INTERVAL, detection('es', 0.8));
            }

            expect(service.state.language).toBe('en');

            await sample(sceneTexts(9), SCENE_LANGUAGE_CONFIG.switchConsecutiveSamples * INTERVAL, detection('es', 0.8));

            expect(service.state).toEqual({ confidence: 0.8, language: 'es', status: SceneLanguageStatus.IDENTIFIED });
            expect(emissions.map((state: SceneLanguageState) => state.language)).toEqual([null, null, 'en', 'es']);
        });

        it('should not be contested while the samples agree with the identified language', async () => {
            expect(service.contested).toBe(false);

            await sample(sceneTexts(1), INTERVAL, detection('en', 0.8));

            expect(service.contested).toBe(false);
        });

        it('should be contested while another language challenges the identified one and settle when the challenge breaks', async () => {
            await sample(sceneTexts(1), INTERVAL, detection('es', 0.8));

            expect(service.contested).toBe(true);
            expect(service.state.language).toBe('en');

            await sample(sceneTexts(2), INTERVAL * 2, detection(null, 0));

            expect(service.contested).toBe(true);

            await sample(sceneTexts(3), INTERVAL * 3, detection('en', 0.8));

            expect(service.contested).toBe(false);
            expect(service.state.language).toBe('en');
        });

        it('should stop being contested once the challenger wins', async () => {
            for (let index: number = 1; index <= SCENE_LANGUAGE_CONFIG.switchConsecutiveSamples; index++) {
                await sample(sceneTexts(index), index * INTERVAL, detection('es', 0.8));
            }

            expect(service.state.language).toBe('es');
            expect(service.contested).toBe(false);
        });

        it('should challenge at once when the camera moves to text in another language and switch after the streak', async () => {
            await sample(SPANISH_MENU_TEXTS, 100, detection('es', 0.9));

            expect(service.contested).toBe(true);

            await sample(SPANISH_MENU_TEXTS, 100 + INTERVAL, detection('es', 0.9));
            await sample(SPANISH_MENU_TEXTS, 100 + INTERVAL * 2, detection('es', 0.9));

            expect(service.state).toEqual({ confidence: 0.9, language: 'es', status: SceneLanguageStatus.IDENTIFIED });
            expect(service.contested).toBe(false);
        });

        it('should only emit when the language or the status changes', async () => {
            await sample(sceneTexts(1), INTERVAL, detection('en', 0.6));
            await sample(sceneTexts(2), INTERVAL * 2, detection('en', 0.99));

            expect(emissions.length).toBe(3);
            expect(service.state.confidence).toBe(0.9);
        });
    });

    describe('undetermined', () => {
        beforeEach(() => {
            service.startAutomatic();
        });

        it('should become undetermined when no language is decided in time and recover on a later decision', async () => {
            await sample(MENU_TEXTS, 1000, detection('en', 0.3));
            service.observe(MENU_TEXTS, 1000 + UNDETERMINED_AFTER - 1);
            await flushDetections();

            expect(service.state.status).toBe(SceneLanguageStatus.IDENTIFYING);

            service.observe(MENU_TEXTS, 1000 + UNDETERMINED_AFTER);
            await flushDetections();

            expect(service.state).toEqual({ confidence: 0, language: null, status: SceneLanguageStatus.UNDETERMINED });

            await sample(OTHER_MENU_TEXTS, 1000 + UNDETERMINED_AFTER + 10, detection('it', 0.9));

            expect(service.state).toEqual({ confidence: 0.9, language: 'it', status: SceneLanguageStatus.IDENTIFIED });
        });

        it('should become undetermined in time when the scene only shows short texts', () => {
            service.observe(['Soda'], 0);
            service.observe(['Soda'], UNDETERMINED_AFTER - 1);

            expect(service.state.status).toBe(SceneLanguageStatus.IDENTIFYING);

            service.observe(['Soda'], UNDETERMINED_AFTER);

            expect(service.state.status).toBe(SceneLanguageStatus.UNDETERMINED);
            expect(languageDetectionServiceStub.detect).not.toHaveBeenCalled();
        });

        it('should not start the timer before the scene shows letters', () => {
            const firstTextAt: number = 5000;

            service.observe([], 0);
            service.observe(['12,90', '8,50'], 1000);
            service.observe(['Soda'], firstTextAt);
            service.observe(['Soda'], firstTextAt + UNDETERMINED_AFTER - 1);

            expect(service.state.status).toBe(SceneLanguageStatus.IDENTIFYING);

            service.observe(['Soda'], firstTextAt + UNDETERMINED_AFTER);

            expect(service.state.status).toBe(SceneLanguageStatus.UNDETERMINED);
        });

        it('should start the timer again when the automatic mode starts again', () => {
            service.observe(['Soda'], 0);
            service.startAutomatic();
            service.observe(['Soda'], UNDETERMINED_AFTER);

            expect(service.state.status).toBe(SceneLanguageStatus.IDENTIFYING);

            service.observe(['Soda'], UNDETERMINED_AFTER * 2);

            expect(service.state.status).toBe(SceneLanguageStatus.UNDETERMINED);
        });

        it('should never be contested while undetermined', () => {
            service.observe(['Soda'], 0);
            service.observe(['Soda'], UNDETERMINED_AFTER);

            expect(service.contested).toBe(false);
        });
    });

    describe('out of order completions', () => {
        beforeEach(() => {
            service.startAutomatic();
        });

        it('should ignore a sample that completes after a newer one', async () => {
            const first: Deferred<LanguageDetection> = createDeferred<LanguageDetection>();

            languageDetectionServiceStub.detect.mockReturnValueOnce(first.promise);
            service.observe(MENU_TEXTS, 0);
            await sample(OTHER_MENU_TEXTS, 100, detection('es', 0.9));

            first.resolve(detection('en', 0.95));
            await flushDetections();

            expect(service.state.language).toBe('es');
        });

        it('should ignore samples that complete after a restart', async () => {
            const pending: Deferred<LanguageDetection> = createDeferred<LanguageDetection>();

            languageDetectionServiceStub.detect.mockReturnValueOnce(pending.promise);
            service.observe(MENU_TEXTS, 0);
            service.startAutomatic();

            pending.resolve(detection('en', 0.95));
            await flushDetections();

            expect(service.state.status).toBe(SceneLanguageStatus.IDENTIFYING);
        });

        it('should forget the previous votes when the automatic mode starts again', async () => {
            await sample(MENU_TEXTS, 0, detection('en', 0.6));
            service.startAutomatic();
            await sample(OTHER_MENU_TEXTS, 100, detection('en', 0.6));

            expect(service.state.status).toBe(SceneLanguageStatus.IDENTIFYING);
        });
    });

    describe('manual language', () => {
        it('should stop the automatic identification', async () => {
            const pending: Deferred<LanguageDetection> = createDeferred<LanguageDetection>();

            service.startAutomatic();
            languageDetectionServiceStub.detect.mockReturnValueOnce(pending.promise);
            service.observe(MENU_TEXTS, 0);

            service.setManualLanguage('de-DE');
            pending.resolve(detection('en', 0.95));
            service.observe(OTHER_MENU_TEXTS, INTERVAL * 10);
            await flushDetections();

            expect(service.state).toEqual({ confidence: 1, language: 'de', status: SceneLanguageStatus.MANUAL });
            expect(languageDetectionServiceStub.detect).toHaveBeenCalledTimes(1);
        });

        it('should ignore an unknown language', () => {
            service.startAutomatic();

            service.setManualLanguage('xx');

            expect(service.state.status).toBe(SceneLanguageStatus.IDENTIFYING);
        });

        it('should resume the automatic identification only when it starts again', async () => {
            service.startAutomatic();
            service.setManualLanguage('fr');

            await sample(MENU_TEXTS, 0, detection('en', 0.95));

            expect(service.state.language).toBe('fr');

            service.startAutomatic();
            await sample(MENU_TEXTS, 100, detection('en', 0.95));

            expect(service.state.language).toBe('en');
        });
    });

    describe('fixed language', () => {
        it('should use the fixed language and ignore observations', () => {
            service.setFixedLanguage('en');
            service.observe(MENU_TEXTS, 0);

            expect(service.state).toEqual({ confidence: 1, language: 'en', status: SceneLanguageStatus.FIXED });
            expect(service.contested).toBe(false);
            expect(languageDetectionServiceStub.detect).not.toHaveBeenCalled();
        });
    });

    describe('reset', () => {
        it('should return to idle and ignore pending samples', async () => {
            const pending: Deferred<LanguageDetection> = createDeferred<LanguageDetection>();

            service.startAutomatic();
            languageDetectionServiceStub.detect.mockReturnValueOnce(pending.promise);
            service.observe(MENU_TEXTS, 0);

            service.reset();
            pending.resolve(detection('en', 0.95));
            await flushDetections();

            expect(service.state).toEqual({ confidence: 0, language: null, status: SceneLanguageStatus.IDLE });
        });

        it('should not emit when already idle', () => {
            service.reset();

            expect(emissions.length).toBe(1);
        });
    });
});
