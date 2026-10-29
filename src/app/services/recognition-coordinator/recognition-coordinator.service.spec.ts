import { TestBed } from '@angular/core/testing';
import { OnlineTranslationService } from '../online-translation/online-translation.service';
import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';
import type { Mock, MockInstance } from 'vitest';
import {
    AppSettings
,   HistoryRecordRequest
,   LanguagePair
,   ModelInventory
,   OverlayItem
,   OverlayStatus
,   PixelRect
,   RecognitionEvent
,   RecognizedBlock
,   RecognizedLine
,   RegionGranularity
,   SceneLanguageState
,   SceneLanguageStatus
,   TextRegion
,   TranslationRequest
,   TranslationResult
} from 'src/app/shared/models';
import { AUTO_LANGUAGE, EMPTY, EXPIRY_TICK_MILLISECONDS, TRACKING_CONFIG } from 'src/app/shared/utils';
import { HistoryService } from '../history/history.service';
import { LanguageModelService } from '../language-model/language-model.service';
import { LensEngineService } from '../lens-engine/lens-engine.service';
import { LoggerService } from '../logger/logger.service';
import { OverlayStoreService } from '../overlay-store/overlay-store.service';
import { PreferencesService } from '../preferences/preferences.service';
import { SceneLanguageService } from '../scene-language/scene-language.service';
import { TranslationQueueService } from '../translation-queue/translation-queue.service';
import { RecognitionCoordinatorService } from './recognition-coordinator.service';

type ReconcileFunction = (regions: TextRegion[], now: number, retainUnseen?: boolean, snapAnchors?: boolean) => OverlayItem[];

interface HistoryServiceStub {
    record: Mock<(request: HistoryRecordRequest) => void>;
}

interface LanguageModelServiceStub {
    changes: () => Observable<ModelInventory>;
    isDownloaded: Mock<(language: string) => boolean>;
}

interface LensEngineServiceStub {
    recognition: () => Observable<RecognitionEvent>;
}

interface LoggerServiceStub {
    debug: Mock<(event: string) => void>;
    error: Mock<(event: string, error: unknown) => void>;
}

interface PreferencesServiceStub {
    settings: AppSettings;
}

interface SceneLanguageServiceStub {
    changes: () => Observable<SceneLanguageState>;
    contested: boolean;
    observe: Mock<(texts: string[], now: number) => void>;
    reset: Mock<() => void>;
    setFixedLanguage: Mock<(language: string) => void>;
    setManualLanguage: Mock<(language: string) => void>;
    startAutomatic: Mock<() => void>;
    readonly state: SceneLanguageState;
}

interface TranslationQueueServiceStub {
    cancel: Mock<(regionIds: string[]) => void>;
    clear: Mock<() => void>;
    enqueue: Mock<(request: TranslationRequest) => void>;
    results: () => Observable<TranslationResult>;
}

const ENGLISH_TO_PORTUGUESE: LanguagePair = { sourceLanguage: 'en', targetLanguage: 'pt' };
const ENGLISH_TO_FRENCH: LanguagePair = { sourceLanguage: 'en', targetLanguage: 'fr' };
const AUTO_TO_PORTUGUESE: LanguagePair = { sourceLanguage: AUTO_LANGUAGE, targetLanguage: 'pt' };
const TRUNCATED_TEXT: string = 'Open every day until midni';
const CORRECTED_TEXT: string = 'Open every day until midnight';
const IDLE_SCENE: SceneLanguageState = { confidence: 0, language: null, status: SceneLanguageStatus.IDLE };
const WAITING_STATUSES: OverlayStatus[] = [OverlayStatus.DETECTING, OverlayStatus.MODEL_MISSING, OverlayStatus.UNDETERMINED];

function createLine(text: string, top: number): RecognizedLine {
    const boundingBox: PixelRect = { bottom: top + 50, left: 100, right: 600, top: top };

    return { angle: 0, boundingBox: boundingBox, confidence: 0.9, orientedHeight: 50, orientedWidth: 500, recognizedLanguage: 'en', text: text };
}

function createBlock(lines: RecognizedLine[]): RecognizedBlock {
    const boundingBox: PixelRect = {
        bottom: Math.max(...lines.map((line: RecognizedLine) => line.boundingBox.bottom)),
        left: 100,
        right: 600,
        top: Math.min(...lines.map((line: RecognizedLine) => line.boundingBox.top)),
    };

    return {
        boundingBox: boundingBox,
        lines: lines,
        orientedHeight: boundingBox.bottom - boundingBox.top,
        orientedWidth: boundingBox.right - boundingBox.left,
        recognizedLanguage: 'en',
        text: lines.map((line: RecognizedLine) => line.text).join(' '),
    };
}

function createEvent(frameTimestamp: number, blocks: RecognizedBlock[] = [
    createBlock([createLine('Daily Specials', 100)]),
    createBlock([createLine('Chocolate cake', 500)]),
]): RecognitionEvent {
    return {
        blocks: blocks,
        frame: {
            frameTimestamp: frameTimestamp,
            imageHeight: 1000,
            imageWidth: 1000,
            mirrored: false,
            rotationDegrees: 0,
            viewHeight: 1000,
            viewWidth: 1000,
        },
    };
}

function createFrozenEvent(frameTimestamp: number, blocks?: RecognizedBlock[]): RecognitionEvent {
    const event: RecognitionEvent = createEvent(frameTimestamp, blocks);

    return { ...event, frame: { ...event.frame, frozen: true } };
}

function createSettings(regionGranularity: RegionGranularity): AppSettings {
    return {
        analysesPerSecond: 3,
        appLanguage: 'auto',
        balloonFontScale: 1,
        historyEnabled: false,
        languageConfirmedFor: 'pt',
        regionGranularity: regionGranularity,
        requireWifiForDownloads: false,
        showDebugRegions: false,
        sourceLanguage: 'en',
        targetLanguage: 'pt',
    };
}

describe('RecognitionCoordinatorService', () => {
    let historyServiceStub: HistoryServiceStub;
    let inventory$: BehaviorSubject<ModelInventory>;
    let languageModelServiceStub: LanguageModelServiceStub;
    let loggerServiceStub: LoggerServiceStub;
    let overlayStoreService: OverlayStoreService;
    let preferencesServiceStub: PreferencesServiceStub;
    let recognition$: Subject<RecognitionEvent>;
    let reconcileSpy: MockInstance<ReconcileFunction>;
    let results$: Subject<TranslationResult>;
    let sceneState$: BehaviorSubject<SceneLanguageState>;
    let sceneLanguageServiceStub: SceneLanguageServiceStub;
    let service: RecognitionCoordinatorService;
    let translationQueueServiceStub: TranslationQueueServiceStub;

    beforeEach(() => {
        vi.useFakeTimers();
        recognition$ = new Subject<RecognitionEvent>();
        results$ = new Subject<TranslationResult>();
        sceneState$ = new BehaviorSubject<SceneLanguageState>(IDLE_SCENE);
        loggerServiceStub = { debug: vi.fn(), error: vi.fn() };
        historyServiceStub = { record: vi.fn() };
        inventory$ = new BehaviorSubject<ModelInventory>({ downloaded: ['en', 'pt'], downloading: [] });
        languageModelServiceStub = {
            changes: (): Observable<ModelInventory> => inventory$.asObservable(),
            isDownloaded: vi.fn((language: string): boolean => inventory$.value.downloaded.includes(language)),
        };
        preferencesServiceStub = { settings: createSettings(RegionGranularity.BLOCK) };
        sceneLanguageServiceStub = {
            changes: (): Observable<SceneLanguageState> => sceneState$.asObservable(),
            contested: false,
            observe: vi.fn(),
            reset: vi.fn((): void => sceneState$.next(IDLE_SCENE)),
            setFixedLanguage: vi.fn((language: string): void =>
                sceneState$.next({ confidence: 1, language: language, status: SceneLanguageStatus.FIXED })),
            setManualLanguage: vi.fn((language: string): void =>
                sceneState$.next({ confidence: 1, language: language, status: SceneLanguageStatus.MANUAL })),
            startAutomatic: vi.fn((): void =>
                sceneState$.next({ confidence: 0, language: null, status: SceneLanguageStatus.IDENTIFYING })),
            get state(): SceneLanguageState {
                return sceneState$.value;
            },
        };
        translationQueueServiceStub = {
            cancel: vi.fn(),
            clear: vi.fn(),
            enqueue: vi.fn(),
            results: (): Observable<TranslationResult> => results$.asObservable(),
        };
        const lensEngineServiceStub: LensEngineServiceStub = {
            recognition: (): Observable<RecognitionEvent> => recognition$.asObservable(),
        };

        TestBed.configureTestingModule({
            providers: [
                { provide: HistoryService, useValue: historyServiceStub },
                { provide: LanguageModelService, useValue: languageModelServiceStub },
                { provide: LensEngineService, useValue: lensEngineServiceStub },
                { provide: LoggerService, useValue: loggerServiceStub },
                { provide: PreferencesService, useValue: preferencesServiceStub },
                { provide: SceneLanguageService, useValue: sceneLanguageServiceStub },
                { provide: TranslationQueueService, useValue: translationQueueServiceStub },
            ],
        });
        service = TestBed.inject(RecognitionCoordinatorService);
        overlayStoreService = TestBed.inject(OverlayStoreService);
        reconcileSpy = vi.spyOn(overlayStoreService, 'reconcile') as unknown as MockInstance<ReconcileFunction>;
    });

    afterEach(() => {
        service.stop();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    function findItem(regionId: string): OverlayItem | undefined {
        return overlayStoreService.items.find((item: OverlayItem) => item.regionId === regionId);
    }

    function identify(language: string): void {
        sceneState$.next({ confidence: 0.9, language: language, status: SceneLanguageStatus.IDENTIFIED });
    }

    function everyItem(predicate: (item: OverlayItem) => boolean): boolean {
        return overlayStoreService.items.length > 0 && overlayStoreService.items.every(predicate);
    }

    it('should be idle and ignore events before starting', () => {
        service.handleRecognition(createEvent(1));

        expect(service.running).toBe(false);
        expect(reconcileSpy).not.toHaveBeenCalled();
        expect(overlayStoreService.items).toEqual([]);
    });

    it('should track recognized regions and enqueue them with the session language pair', () => {
        service.start(ENGLISH_TO_PORTUGUESE);
        recognition$.next(createEvent(1));

        expect(service.running).toBe(true);
        expect(overlayStoreService.items.length).toBe(2);
        expect(everyItem((item: OverlayItem) => item.status === OverlayStatus.TRANSLATING)).toBe(true);
        expect(translationQueueServiceStub.enqueue).toHaveBeenCalledTimes(2);
        expect(translationQueueServiceStub.enqueue).toHaveBeenCalledWith({
            languagePair: ENGLISH_TO_PORTUGUESE,
            regionId: 'region-1',
            text: 'Daily Specials',
            textVersion: 1,
        });
        expect(translationQueueServiceStub.enqueue).toHaveBeenCalledWith({
            languagePair: ENGLISH_TO_PORTUGUESE,
            regionId: 'region-2',
            text: 'Chocolate cake',
            textVersion: 1,
        });
    });

    it('should pass menu context to the translator for recognized menu labels', () => {
        service.start(ENGLISH_TO_PORTUGUESE);
        recognition$.next(createEvent(1, [
            createBlock([createLine('Appetizers', 100)]),
            createBlock([createLine('Sake', 500)]),
        ]));
        expect(translationQueueServiceStub.enqueue).toHaveBeenCalledWith(expect.objectContaining({ text: 'Sake', context: 'menu' }));
        expect(translationQueueServiceStub.enqueue).toHaveBeenCalledWith(expect.objectContaining({ text: 'Appetizers', context: 'menu' }));
    });

    it('should assemble and dispatch a frozen sentence with scene context for online translation', () => {
        vi.spyOn(TestBed.inject(OnlineTranslationService), 'available', 'get').mockReturnValue(true);
        service.start(ENGLISH_TO_PORTUGUESE);
        recognition$.next(createFrozenEvent(1, [
            createBlock([createLine('Everything', 100)]),
            createBlock([createLine('happens for', 160)]),
            createBlock([createLine('a reason.', 220)]),
        ]));
        expect(translationQueueServiceStub.enqueue).toHaveBeenCalledTimes(1);
        expect(translationQueueServiceStub.enqueue).toHaveBeenCalledWith(expect.objectContaining({
            text: 'Everything happens for a reason.', contextText: 'Everything happens for a reason.',
        }));
    });

    it('should not enqueue regions that are already being translated', () => {
        service.start(ENGLISH_TO_PORTUGUESE);
        recognition$.next(createEvent(1));
        recognition$.next(createEvent(2));

        expect(reconcileSpy).toHaveBeenCalledTimes(2);
        expect(translationQueueServiceStub.enqueue).toHaveBeenCalledTimes(2);
    });

    it('should drop stale and out-of-order frames', () => {
        service.start(ENGLISH_TO_PORTUGUESE);
        recognition$.next(createEvent(200));
        recognition$.next(createEvent(200));
        recognition$.next(createEvent(150));

        expect(reconcileSpy).toHaveBeenCalledTimes(1);
        expect(loggerServiceStub.debug).toHaveBeenCalledWith('stale-frame-dropped');

        recognition$.next(createEvent(201));

        expect(reconcileSpy).toHaveBeenCalledTimes(2);
    });

    it('should ignore events while suspended', () => {
        service.start(ENGLISH_TO_PORTUGUESE);
        service.setSuspended(true);
        recognition$.next(createEvent(1));

        expect(service.suspended).toBe(true);
        expect(reconcileSpy).not.toHaveBeenCalled();

        service.setSuspended(false);
        recognition$.next(createEvent(2));

        expect(service.suspended).toBe(false);
        expect(reconcileSpy).toHaveBeenCalledTimes(1);
    });

    it('should reconcile the frozen frame while suspended and drop the regions it no longer shows', () => {
        service.start(ENGLISH_TO_PORTUGUESE);
        recognition$.next(createEvent(1));
        translationQueueServiceStub.enqueue.mockClear();
        service.setSuspended(true);

        recognition$.next(createEvent(2, [createBlock([createLine('Daily Specials', 100)])]));

        expect(reconcileSpy).toHaveBeenCalledTimes(1);

        recognition$.next(createFrozenEvent(3, [
            createBlock([createLine('Daily Specials', 100)]),
            createBlock([createLine('Fresh tomato soup', 800)]),
        ]));

        expect(reconcileSpy).toHaveBeenCalledTimes(2);
        expect(overlayStoreService.items.map((item: OverlayItem) => item.regionId)).toEqual(['region-1', 'region-3']);
        expect(translationQueueServiceStub.cancel).toHaveBeenCalledWith(['region-2']);
        expect(translationQueueServiceStub.enqueue).toHaveBeenCalledTimes(1);
        expect(translationQueueServiceStub.enqueue).toHaveBeenCalledWith({
            languagePair: ENGLISH_TO_PORTUGUESE,
            regionId: 'region-3',
            text: 'Fresh tomato soup',
            textVersion: 1,
        });
        expect(findItem('region-3')?.status).toBe(OverlayStatus.TRANSLATING);
    });

    it('should snap the regions onto the frozen frame and keep smoothing the live frames', () => {
        service.start(ENGLISH_TO_PORTUGUESE);
        recognition$.next(createEvent(1));

        expect(reconcileSpy).toHaveBeenLastCalledWith(expect.any(Array), expect.any(Number), true, false);

        service.setSuspended(true);
        recognition$.next(createFrozenEvent(2));

        expect(reconcileSpy).toHaveBeenLastCalledWith(expect.any(Array), expect.any(Number), false, true);
    });

    it('should date the frozen frame at the moment of the suspension', () => {
        service.start(ENGLISH_TO_PORTUGUESE);
        recognition$.next(createEvent(1));
        vi.advanceTimersByTime(500);

        const suspendedAt: number = Date.now();

        service.setSuspended(true);
        vi.advanceTimersByTime(10000);
        recognition$.next(createFrozenEvent(2));

        expect(everyItem((item: OverlayItem) => item.lastSeenAt === suspendedAt)).toBe(true);

        service.setSuspended(false);
        vi.advanceTimersByTime(TRACKING_CONFIG.expireAfterMilliseconds - EXPIRY_TICK_MILLISECONDS);

        expect(overlayStoreService.items.some((item: OverlayItem) => item.status === OverlayStatus.EXPIRING)).toBe(false);
    });

    it('should use line regions when the line granularity is selected', () => {
        preferencesServiceStub.settings = createSettings(RegionGranularity.LINE);
        service.start(ENGLISH_TO_PORTUGUESE);

        recognition$.next(createEvent(1, [createBlock([createLine('Grilled chicken', 100), createLine('with lemon', 300)])]));

        expect(overlayStoreService.items.map((item: OverlayItem) => item.originalText)).toEqual(['Grilled chicken', 'with lemon']);
    });

    it('should apply translation results to the overlay store', () => {
        service.start(ENGLISH_TO_PORTUGUESE);
        recognition$.next(createEvent(1));

        results$.next({ failed: false, regionId: 'region-1', textVersion: 1, translatedText: 'Pratos do dia' });

        expect(findItem('region-1')?.status).toBe(OverlayStatus.TRANSLATED);
        expect(findItem('region-1')?.translatedText).toBe('Pratos do dia');
        expect(findItem('region-2')?.status).toBe(OverlayStatus.TRANSLATING);
    });

    it('should log the first recognition with text only once', () => {
        service.start(ENGLISH_TO_PORTUGUESE);
        recognition$.next(createEvent(1, []));

        expect(loggerServiceStub.debug).not.toHaveBeenCalledWith('first-recognition', expect.anything());

        recognition$.next(createEvent(2));
        recognition$.next(createEvent(3));

        const firstRecognitionLogs: [string][] = loggerServiceStub.debug.mock.calls.filter((call: [string]) => call[0] === 'first-recognition');

        expect(firstRecognitionLogs.length).toBe(1);
    });

    describe('expiry', () => {
        it('should expire and then remove regions that are no longer seen', () => {
            service.start(ENGLISH_TO_PORTUGUESE);
            recognition$.next(createEvent(1));

            vi.advanceTimersByTime(TRACKING_CONFIG.expireAfterMilliseconds - 1);

            expect(everyItem((item: OverlayItem) => item.status === OverlayStatus.TRANSLATING)).toBe(true);

            vi.advanceTimersByTime(EXPIRY_TICK_MILLISECONDS);

            expect(overlayStoreService.items.length).toBe(2);
            expect(everyItem((item: OverlayItem) => item.status === OverlayStatus.EXPIRING)).toBe(true);

            vi.advanceTimersByTime(TRACKING_CONFIG.removeAfterMilliseconds - TRACKING_CONFIG.expireAfterMilliseconds + EXPIRY_TICK_MILLISECONDS);

            expect(overlayStoreService.items).toEqual([]);
        });

        it('should wait longer before expiring at a slow analysis rate', () => {
            preferencesServiceStub.settings = { ...createSettings(RegionGranularity.BLOCK), analysesPerSecond: 1 };
            service.start(ENGLISH_TO_PORTUGUESE);
            recognition$.next(createEvent(1));

            vi.advanceTimersByTime(TRACKING_CONFIG.removeAfterMilliseconds);

            expect(overlayStoreService.items.length).toBe(2);
            expect(overlayStoreService.items.some((item: OverlayItem) => item.status === OverlayStatus.EXPIRING)).toBe(false);

            vi.advanceTimersByTime(TRACKING_CONFIG.expireAfterAnalysisIntervals * 1000 - TRACKING_CONFIG.removeAfterMilliseconds + EXPIRY_TICK_MILLISECONDS);

            expect(everyItem((item: OverlayItem) => item.status === OverlayStatus.EXPIRING)).toBe(true);
        });

        it('should cancel the queued translations of removed regions only', () => {
            service.start(ENGLISH_TO_PORTUGUESE);
            recognition$.next(createEvent(1));

            vi.advanceTimersByTime(TRACKING_CONFIG.expireAfterMilliseconds + EXPIRY_TICK_MILLISECONDS);

            expect(translationQueueServiceStub.cancel).not.toHaveBeenCalled();

            vi.advanceTimersByTime(TRACKING_CONFIG.removeAfterMilliseconds - TRACKING_CONFIG.expireAfterMilliseconds);

            expect(translationQueueServiceStub.cancel).toHaveBeenCalledTimes(1);
            expect(translationQueueServiceStub.cancel).toHaveBeenCalledWith(['region-1', 'region-2']);

            vi.advanceTimersByTime(EXPIRY_TICK_MILLISECONDS * 4);

            expect(translationQueueServiceStub.cancel).toHaveBeenCalledTimes(1);
        });

        it('should keep regions alive while they keep being recognized', () => {
            service.start(ENGLISH_TO_PORTUGUESE);

            for (let frame: number = 1; frame <= 10; frame++) {
                recognition$.next(createEvent(frame));
                vi.advanceTimersByTime(500);
            }

            expect(overlayStoreService.items.length).toBe(2);
            expect(overlayStoreService.items.some((item: OverlayItem) => item.status === OverlayStatus.EXPIRING)).toBe(false);
        });

        it('should not count suspended time towards expiry', () => {
            service.start(ENGLISH_TO_PORTUGUESE);
            recognition$.next(createEvent(1));
            vi.advanceTimersByTime(500);

            service.setSuspended(true);
            vi.advanceTimersByTime(10000);

            expect(overlayStoreService.items.length).toBe(2);

            service.setSuspended(false);
            vi.advanceTimersByTime(EXPIRY_TICK_MILLISECONDS);

            expect(overlayStoreService.items.length).toBe(2);
            expect(overlayStoreService.items.some((item: OverlayItem) => item.status === OverlayStatus.EXPIRING)).toBe(false);

            vi.advanceTimersByTime(2 * EXPIRY_TICK_MILLISECONDS);

            expect(overlayStoreService.items.length).toBe(2);
            expect(everyItem((item: OverlayItem) => item.status === OverlayStatus.EXPIRING)).toBe(true);
        });

        it('should ignore repeated suspension requests', () => {
            service.start(ENGLISH_TO_PORTUGUESE);
            recognition$.next(createEvent(1));

            service.setSuspended(true);
            vi.advanceTimersByTime(5000);
            service.setSuspended(true);
            vi.advanceTimersByTime(5000);
            service.setSuspended(false);
            service.setSuspended(false);
            vi.advanceTimersByTime(EXPIRY_TICK_MILLISECONDS);

            expect(overlayStoreService.items.length).toBe(2);
            expect(overlayStoreService.items.some((item: OverlayItem) => item.status === OverlayStatus.EXPIRING)).toBe(false);
        });
    });

    describe('stop', () => {
        it('should clear the queue and the store and stop listening', () => {
            service.start(ENGLISH_TO_PORTUGUESE);
            recognition$.next(createEvent(1));

            service.stop();

            expect(service.running).toBe(false);
            expect(translationQueueServiceStub.clear).toHaveBeenCalled();
            expect(overlayStoreService.items).toEqual([]);

            recognition$.next(createEvent(2));
            results$.next({ failed: false, regionId: 'region-1', textVersion: 1, translatedText: 'Pratos do dia' });

            expect(reconcileSpy).toHaveBeenCalledTimes(1);
            expect(overlayStoreService.items).toEqual([]);
            expect(vi.getTimerCount()).toBe(0);
        });

        it('should reset the suspension', () => {
            service.start(ENGLISH_TO_PORTUGUESE);
            service.setSuspended(true);

            service.stop();

            expect(service.suspended).toBe(false);
        });

        it('should accept lower frame timestamps after a restart', () => {
            service.start(ENGLISH_TO_PORTUGUESE);
            recognition$.next(createEvent(500));

            service.stop();
            service.start(ENGLISH_TO_PORTUGUESE);
            recognition$.next(createEvent(10));

            expect(reconcileSpy).toHaveBeenCalledTimes(2);
            expect(overlayStoreService.items.length).toBe(2);
        });

        it('should reset the scene language', () => {
            service.start(AUTO_TO_PORTUGUESE);
            sceneLanguageServiceStub.reset.mockClear();

            service.stop();

            expect(sceneLanguageServiceStub.reset).toHaveBeenCalledTimes(1);
            expect(service.sceneLanguage).toBeNull();
        });
    });

    it('should restart cleanly with a new language pair', () => {
        service.start(ENGLISH_TO_PORTUGUESE);
        service.start(ENGLISH_TO_FRENCH);
        recognition$.next(createEvent(1));

        expect(reconcileSpy).toHaveBeenCalledTimes(1);
        expect(translationQueueServiceStub.enqueue).toHaveBeenCalledWith(expect.objectContaining({ languagePair: ENGLISH_TO_FRENCH }));
        expect(translationQueueServiceStub.enqueue).not.toHaveBeenCalledWith(expect.objectContaining({ languagePair: ENGLISH_TO_PORTUGUESE }));
    });

    describe('fixed source language', () => {
        it('should hand the fixed source language to the scene language and never observe the scene', () => {
            service.start(ENGLISH_TO_PORTUGUESE);
            recognition$.next(createEvent(1));
            vi.advanceTimersByTime(EXPIRY_TICK_MILLISECONDS * 2);

            expect(service.autoDetecting).toBe(false);
            expect(sceneLanguageServiceStub.setFixedLanguage).toHaveBeenCalledWith('en');
            expect(sceneLanguageServiceStub.startAutomatic).not.toHaveBeenCalled();
            expect(sceneLanguageServiceStub.observe).not.toHaveBeenCalled();
            expect(everyItem((item: OverlayItem) => item.sourceLanguage === 'en')).toBe(true);
        });

        it('should keep the fixed source language once translated', () => {
            service.start(ENGLISH_TO_PORTUGUESE);
            recognition$.next(createEvent(1));

            results$.next({ failed: false, regionId: 'region-1', textVersion: 1, translatedText: 'Pratos do dia' });

            expect(findItem('region-1')?.sourceLanguage).toBe('en');
        });

        it('should not re-process anything when a manual language is chosen', () => {
            service.start(ENGLISH_TO_PORTUGUESE);
            recognition$.next(createEvent(1));
            translationQueueServiceStub.enqueue.mockClear();

            service.setManualSourceLanguage('de');

            expect(sceneLanguageServiceStub.setManualLanguage).not.toHaveBeenCalled();
            expect(translationQueueServiceStub.enqueue).not.toHaveBeenCalled();
        });
    });

    describe('automatic source language', () => {
        beforeEach(() => {
            inventory$.next({ downloaded: ['de', 'en', 'pt'], downloading: [] });
        });

        it('should start identifying the scene language and keep the regions waiting while it is unknown', () => {
            service.start(AUTO_TO_PORTUGUESE);
            recognition$.next(createEvent(1));

            expect(service.autoDetecting).toBe(true);
            expect(sceneLanguageServiceStub.startAutomatic).toHaveBeenCalledTimes(1);
            expect(sceneLanguageServiceStub.setFixedLanguage).not.toHaveBeenCalled();
            expect(everyItem((item: OverlayItem) => item.status === OverlayStatus.READING)).toBe(true);
            expect(everyItem((item: OverlayItem) => item.sourceLanguage === null)).toBe(true);
            expect(translationQueueServiceStub.enqueue).not.toHaveBeenCalled();
        });

        it('should feed the texts of the readable regions to the scene language after each recognition', () => {
            service.start(AUTO_TO_PORTUGUESE);
            recognition$.next(createEvent(1));

            expect(sceneLanguageServiceStub.observe).toHaveBeenLastCalledWith(['Daily Specials', 'Chocolate cake'], Date.now());

            recognition$.next(createEvent(2, [createBlock([createLine('Fresh tomato soup', 800)])]));

            expect(sceneLanguageServiceStub.observe).toHaveBeenLastCalledWith(['Daily Specials', 'Chocolate cake', 'Fresh tomato soup'], Date.now());
        });

        it('should leave the expiring regions out of the scene', () => {
            service.start(AUTO_TO_PORTUGUESE);
            recognition$.next(createEvent(1));
            vi.advanceTimersByTime(TRACKING_CONFIG.expireAfterMilliseconds + EXPIRY_TICK_MILLISECONDS);

            recognition$.next(createEvent(2, [createBlock([createLine('Fresh tomato soup', 800)])]));

            expect(sceneLanguageServiceStub.observe).toHaveBeenLastCalledWith(['Fresh tomato soup'], Date.now());
        });

        it('should keep feeding the scene language on every tick, also while a frozen frame is shown', () => {
            service.start(AUTO_TO_PORTUGUESE);
            service.setSuspended(true);
            recognition$.next(createFrozenEvent(1));
            sceneLanguageServiceStub.observe.mockClear();

            vi.advanceTimersByTime(EXPIRY_TICK_MILLISECONDS);

            expect(sceneLanguageServiceStub.observe).toHaveBeenCalledTimes(1);
            expect(sceneLanguageServiceStub.observe).toHaveBeenCalledWith(['Daily Specials', 'Chocolate cake'], Date.now());
        });

        it('should never identify the language of each region on its own', () => {
            const statuses: Set<OverlayStatus> = new Set<OverlayStatus>();
            const subscription: Subscription = overlayStoreService.changes().subscribe((items: OverlayItem[]) =>
                items.forEach((item: OverlayItem) => statuses.add(item.status)),
            );

            service.start(AUTO_TO_PORTUGUESE);
            recognition$.next(createEvent(1));
            sceneState$.next({ confidence: 0, language: null, status: SceneLanguageStatus.UNDETERMINED });
            recognition$.next(createEvent(2));
            identify('fr');
            recognition$.next(createEvent(3, [createBlock([createLine('Fresh tomato soup', 800)])]));

            expect(WAITING_STATUSES.some((status: OverlayStatus) => statuses.has(status))).toBe(false);
            subscription.unsubscribe();
        });

        it('should translate the waiting regions with the scene language once it is identified', () => {
            service.start(AUTO_TO_PORTUGUESE);
            recognition$.next(createEvent(1));

            identify('en');

            expect(service.sceneLanguage).toBe('en');
            expect(everyItem((item: OverlayItem) => item.status === OverlayStatus.TRANSLATING)).toBe(true);
            expect(everyItem((item: OverlayItem) => item.sourceLanguage === 'en')).toBe(true);
            expect(translationQueueServiceStub.enqueue).toHaveBeenCalledTimes(2);
            expect(translationQueueServiceStub.enqueue).toHaveBeenCalledWith({
                languagePair: { sourceLanguage: 'en', targetLanguage: 'pt' },
                regionId: 'region-1',
                text: 'Daily Specials',
                textVersion: 1,
            });
            expect(translationQueueServiceStub.clear).toHaveBeenCalledTimes(1);
        });

        it('should translate new regions at once while the scene language is known', () => {
            service.start(AUTO_TO_PORTUGUESE);
            identify('de');

            recognition$.next(createEvent(1));

            expect(translationQueueServiceStub.enqueue).toHaveBeenCalledTimes(2);
            expect(translationQueueServiceStub.enqueue).toHaveBeenCalledWith(expect.objectContaining({
                languagePair: { sourceLanguage: 'de', targetLanguage: 'pt' },
                regionId: 'region-2',
            }));
        });

        it('should keep the regions waiting while the scene language is undetermined', () => {
            service.start(AUTO_TO_PORTUGUESE);
            recognition$.next(createEvent(1));

            sceneState$.next({ confidence: 0, language: null, status: SceneLanguageStatus.UNDETERMINED });
            recognition$.next(createEvent(2));

            expect(everyItem((item: OverlayItem) => item.status === OverlayStatus.READING)).toBe(true);
            expect(translationQueueServiceStub.enqueue).not.toHaveBeenCalled();
        });

        it('should show the regions as they are when the scene is in the target language', () => {
            service.start(AUTO_TO_PORTUGUESE);
            recognition$.next(createEvent(1));

            identify('pt');
            recognition$.next(createEvent(2, [
                createBlock([createLine('Daily Specials', 100)]),
                createBlock([createLine('Chocolate cake', 500)]),
                createBlock([createLine('Fresh tomato soup', 800)]),
            ]));

            expect(everyItem((item: OverlayItem) => item.status === OverlayStatus.TRANSLATED)).toBe(true);
            expect(everyItem((item: OverlayItem) => item.translatedText === item.originalText)).toBe(true);
            expect(everyItem((item: OverlayItem) => item.sourceLanguage === 'pt')).toBe(true);
            expect(translationQueueServiceStub.enqueue).not.toHaveBeenCalled();
            expect(historyServiceStub.record).not.toHaveBeenCalled();
        });

        it('should translate a frozen frame once the scene language is identified', () => {
            service.start(AUTO_TO_PORTUGUESE);
            service.setSuspended(true);
            recognition$.next(createFrozenEvent(1, [createBlock([createLine('Fresh tomato soup', 800)])]));

            expect(findItem('region-1')?.status).toBe(OverlayStatus.READING);

            identify('de');

            expect(findItem('region-1')?.status).toBe(OverlayStatus.TRANSLATING);
            expect(translationQueueServiceStub.enqueue).toHaveBeenCalledWith(expect.objectContaining({
                languagePair: { sourceLanguage: 'de', targetLanguage: 'pt' },
                regionId: 'region-1',
            }));
        });

        it('should translate a failed region again with the scene language when it is retried', () => {
            service.start(AUTO_TO_PORTUGUESE);
            identify('de');
            recognition$.next(createEvent(1, [createBlock([createLine('Daily Specials', 100)])]));
            results$.next({ failed: true, regionId: 'region-1', textVersion: 1, translatedText: 'Daily Specials' });
            recognition$.next(createEvent(2, [createBlock([createLine('Daily Specials', 100)])]));
            vi.advanceTimersByTime(1000);
            recognition$.next(createEvent(3, [createBlock([createLine('Daily Specials', 100)])]));
            vi.advanceTimersByTime(1000);
            recognition$.next(createEvent(4, [createBlock([createLine('Daily Specials', 100)])]));

            expect(translationQueueServiceStub.enqueue).toHaveBeenCalledTimes(2);
            expect(translationQueueServiceStub.enqueue).toHaveBeenLastCalledWith(expect.objectContaining({
                languagePair: { sourceLanguage: 'de', targetLanguage: 'pt' },
            }));
            expect(findItem('region-1')?.status).toBe(OverlayStatus.TRANSLATING);
        });

        it('should translate a corrected reading with the scene language and keep the previous translation meanwhile', () => {
            service.start(AUTO_TO_PORTUGUESE);
            identify('de');
            recognition$.next(createEvent(1, [createBlock([createLine(TRUNCATED_TEXT, 100)])]));
            results$.next({ failed: false, regionId: 'region-1', textVersion: 1, translatedText: 'Aberto todos os dias' });

            recognition$.next(createEvent(2, [createBlock([createLine(CORRECTED_TEXT, 100)])]));
            recognition$.next(createEvent(3, [createBlock([createLine(CORRECTED_TEXT, 100)])]));

            expect(findItem('region-1')?.textVersion).toBe(2);
            expect(findItem('region-1')?.status).toBe(OverlayStatus.TRANSLATING);
            expect(findItem('region-1')?.translatedText).toBe('Aberto todos os dias');
            expect(translationQueueServiceStub.enqueue).toHaveBeenLastCalledWith({
                languagePair: { sourceLanguage: 'de', targetLanguage: 'pt' },
                regionId: 'region-1',
                text: CORRECTED_TEXT,
                textVersion: 2,
            });
        });

        describe('missing language pack', () => {
            beforeEach(() => {
                service.start(AUTO_TO_PORTUGUESE);
                recognition$.next(createEvent(1));
                identify('fr');
            });

            it('should keep the regions waiting without flagging them one by one', () => {
                recognition$.next(createEvent(2, [
                    createBlock([createLine('Daily Specials', 100)]),
                    createBlock([createLine('Chocolate cake', 500)]),
                    createBlock([createLine('Fresh tomato soup', 800)]),
                ]));

                expect(overlayStoreService.items.length).toBe(3);
                expect(everyItem((item: OverlayItem) => item.status === OverlayStatus.READING)).toBe(true);
                expect(languageModelServiceStub.isDownloaded).toHaveBeenCalledWith('fr');
                expect(translationQueueServiceStub.enqueue).not.toHaveBeenCalled();
            });

            it('should keep waiting while other packs change', () => {
                inventory$.next({ downloaded: ['de', 'en', 'pt'], downloading: ['fr'] });

                expect(everyItem((item: OverlayItem) => item.status === OverlayStatus.READING)).toBe(true);
                expect(translationQueueServiceStub.enqueue).not.toHaveBeenCalled();
            });

            it('should translate the waiting regions once the pack is downloaded', () => {
                inventory$.next({ downloaded: ['de', 'en', 'fr', 'pt'], downloading: [] });

                expect(everyItem((item: OverlayItem) => item.status === OverlayStatus.TRANSLATING)).toBe(true);
                expect(translationQueueServiceStub.enqueue).toHaveBeenCalledTimes(2);
                expect(translationQueueServiceStub.enqueue).toHaveBeenCalledWith({
                    languagePair: { sourceLanguage: 'fr', targetLanguage: 'pt' },
                    regionId: 'region-1',
                    text: 'Daily Specials',
                    textVersion: 1,
                });
            });

            it('should stop watching the packs once the session stopped', () => {
                service.stop();
                inventory$.next({ downloaded: ['de', 'en', 'fr', 'pt'], downloading: [] });

                expect(translationQueueServiceStub.enqueue).not.toHaveBeenCalled();
            });
        });

        describe('scene language change', () => {
            beforeEach(() => {
                service.start(AUTO_TO_PORTUGUESE);
                recognition$.next(createEvent(1));
                identify('en');
                results$.next({ failed: false, regionId: 'region-1', textVersion: 1, translatedText: 'Pratos do dia' });
                translationQueueServiceStub.clear.mockClear();
                translationQueueServiceStub.enqueue.mockClear();
                historyServiceStub.record.mockClear();
            });

            it('should clear the queue and translate every region again with the new language', () => {
                identify('de');

                expect(translationQueueServiceStub.clear).toHaveBeenCalledTimes(1);
                expect(everyItem((item: OverlayItem) => item.status === OverlayStatus.TRANSLATING)).toBe(true);
                expect(everyItem((item: OverlayItem) => item.sourceLanguage === 'de')).toBe(true);
                expect(findItem('region-1')?.translatedText).toBe(EMPTY);
                expect(translationQueueServiceStub.enqueue).toHaveBeenCalledTimes(2);
                expect(translationQueueServiceStub.enqueue).toHaveBeenCalledWith({
                    languagePair: { sourceLanguage: 'de', targetLanguage: 'pt' },
                    regionId: 'region-1',
                    text: 'Daily Specials',
                    textVersion: 2,
                });
            });

            it('should discard the results of the previous language', () => {
                identify('de');
                results$.next({ failed: false, regionId: 'region-2', textVersion: 1, translatedText: 'Bolo de chocolate' });

                expect(findItem('region-2')?.status).toBe(OverlayStatus.TRANSLATING);
                expect(findItem('region-2')?.translatedText).toBe(EMPTY);
                expect(historyServiceStub.record).not.toHaveBeenCalled();
            });

            it('should show the regions as they are when the new language is the target', () => {
                identify('pt');

                expect(everyItem((item: OverlayItem) => item.status === OverlayStatus.TRANSLATED)).toBe(true);
                expect(findItem('region-1')?.translatedText).toBe('Daily Specials');
                expect(translationQueueServiceStub.enqueue).not.toHaveBeenCalled();
            });

            it('should keep the regions waiting when the pack of the new language is missing', () => {
                identify('it');

                expect(everyItem((item: OverlayItem) => item.status === OverlayStatus.READING)).toBe(true);
                expect(everyItem((item: OverlayItem) => item.translatedText === EMPTY)).toBe(true);
                expect(translationQueueServiceStub.enqueue).not.toHaveBeenCalled();
            });

            it('should translate the expiring regions again when they reappear', () => {
                vi.advanceTimersByTime(TRACKING_CONFIG.expireAfterMilliseconds + EXPIRY_TICK_MILLISECONDS);

                identify('de');

                expect(everyItem((item: OverlayItem) => item.status === OverlayStatus.EXPIRING)).toBe(true);
                expect(findItem('region-1')?.translatedText).toBe(EMPTY);
                expect(translationQueueServiceStub.enqueue).not.toHaveBeenCalled();

                recognition$.next(createEvent(2));

                expect(everyItem((item: OverlayItem) => item.status === OverlayStatus.TRANSLATING)).toBe(true);
                expect(translationQueueServiceStub.enqueue).toHaveBeenCalledWith(expect.objectContaining({
                    languagePair: { sourceLanguage: 'de', targetLanguage: 'pt' },
                    regionId: 'region-1',
                    textVersion: 2,
                }));
            });

            it('should ignore states that keep the same language', () => {
                sceneState$.next({ confidence: 0.6, language: 'en', status: SceneLanguageStatus.IDENTIFIED });

                expect(translationQueueServiceStub.clear).not.toHaveBeenCalled();
                expect(translationQueueServiceStub.enqueue).not.toHaveBeenCalled();
                expect(findItem('region-1')?.translatedText).toBe('Pratos do dia');
            });
        });

        describe('contested scene language', () => {
            beforeEach(() => {
                service.start(AUTO_TO_PORTUGUESE);
                identify('en');
                sceneLanguageServiceStub.contested = true;
                recognition$.next(createEvent(1));
            });

            it('should hold the new regions while another language challenges the identified one', () => {
                vi.advanceTimersByTime(EXPIRY_TICK_MILLISECONDS * 2);

                expect(everyItem((item: OverlayItem) => item.status === OverlayStatus.READING)).toBe(true);
                expect(translationQueueServiceStub.enqueue).not.toHaveBeenCalled();
            });

            it('should translate the held regions with the identified language on the next tick when the challenge fails', () => {
                sceneLanguageServiceStub.contested = false;
                vi.advanceTimersByTime(EXPIRY_TICK_MILLISECONDS);

                expect(everyItem((item: OverlayItem) => item.status === OverlayStatus.TRANSLATING)).toBe(true);
                expect(translationQueueServiceStub.enqueue).toHaveBeenCalledTimes(2);
                expect(translationQueueServiceStub.enqueue).toHaveBeenCalledWith({
                    languagePair: { sourceLanguage: 'en', targetLanguage: 'pt' },
                    regionId: 'region-1',
                    text: 'Daily Specials',
                    textVersion: 1,
                });
            });

            it('should translate the held regions with the challenger once it wins', () => {
                sceneLanguageServiceStub.contested = false;
                identify('de');

                expect(translationQueueServiceStub.enqueue).toHaveBeenCalledTimes(2);
                expect(translationQueueServiceStub.enqueue).not.toHaveBeenCalledWith(expect.objectContaining({
                    languagePair: { sourceLanguage: 'en', targetLanguage: 'pt' },
                }));
                expect(everyItem((item: OverlayItem) => item.sourceLanguage === 'de')).toBe(true);
            });

            it('should keep the held regions waiting when a pack is downloaded during the challenge', () => {
                inventory$.next({ downloaded: ['de', 'en', 'fr', 'pt'], downloading: [] });

                expect(translationQueueServiceStub.enqueue).not.toHaveBeenCalled();
            });
        });

        describe('manual language', () => {
            it('should hand the chosen language to the scene language and translate with it', () => {
                service.start(AUTO_TO_PORTUGUESE);
                recognition$.next(createEvent(1));

                service.setManualSourceLanguage('de');

                expect(sceneLanguageServiceStub.setManualLanguage).toHaveBeenCalledWith('de');
                expect(everyItem((item: OverlayItem) => item.sourceLanguage === 'de')).toBe(true);
                expect(translationQueueServiceStub.enqueue).toHaveBeenCalledWith(expect.objectContaining({
                    languagePair: { sourceLanguage: 'de', targetLanguage: 'pt' },
                    regionId: 'region-2',
                }));
                expect(loggerServiceStub.debug).toHaveBeenCalledWith('manual-source-language-selected', { language: 'de' });
            });

            it('should translate again with the chosen language after an identified one', () => {
                service.start(AUTO_TO_PORTUGUESE);
                recognition$.next(createEvent(1));
                identify('en');
                results$.next({ failed: false, regionId: 'region-1', textVersion: 1, translatedText: 'Pratos do dia' });
                translationQueueServiceStub.enqueue.mockClear();

                service.setManualSourceLanguage('de');

                expect(findItem('region-1')?.translatedText).toBe(EMPTY);
                expect(translationQueueServiceStub.enqueue).toHaveBeenCalledTimes(2);
                expect(translationQueueServiceStub.enqueue).toHaveBeenCalledWith(expect.objectContaining({
                    languagePair: { sourceLanguage: 'de', targetLanguage: 'pt' },
                    regionId: 'region-1',
                    textVersion: 2,
                }));
            });

            it('should ignore the chosen language while the session is not running', () => {
                service.setManualSourceLanguage('de');

                expect(sceneLanguageServiceStub.setManualLanguage).not.toHaveBeenCalled();
            });
        });
    });

    describe('history', () => {
        it('should record successful translations with the fixed source language', () => {
            service.start(ENGLISH_TO_PORTUGUESE);
            recognition$.next(createEvent(1));

            results$.next({ failed: false, regionId: 'region-1', textVersion: 1, translatedText: 'Pratos do dia' });

            expect(historyServiceStub.record).toHaveBeenCalledTimes(1);
            expect(historyServiceStub.record).toHaveBeenCalledWith({
                originalText: 'Daily Specials',
                sourceLanguage: 'en',
                targetLanguage: 'pt',
                translatedText: 'Pratos do dia',
            });
        });

        it('should record successful translations with the scene language', () => {
            inventory$.next({ downloaded: ['de', 'en', 'pt'], downloading: [] });
            service.start(AUTO_TO_PORTUGUESE);
            recognition$.next(createEvent(1));
            identify('de');

            results$.next({ failed: false, regionId: 'region-2', textVersion: 1, translatedText: 'Bolo de chocolate' });

            expect(historyServiceStub.record).toHaveBeenCalledWith({
                originalText: 'Chocolate cake',
                sourceLanguage: 'de',
                targetLanguage: 'pt',
                translatedText: 'Bolo de chocolate',
            });
        });

        it('should not record translations that complete while the scene language is contested', () => {
            inventory$.next({ downloaded: ['de', 'en', 'pt'], downloading: [] });
            service.start(AUTO_TO_PORTUGUESE);
            identify('de');
            recognition$.next(createEvent(1));
            sceneLanguageServiceStub.contested = true;

            results$.next({ failed: false, regionId: 'region-1', textVersion: 1, translatedText: 'Pratos do dia' });

            expect(findItem('region-1')?.status).toBe(OverlayStatus.TRANSLATED);
            expect(historyServiceStub.record).not.toHaveBeenCalled();

            sceneLanguageServiceStub.contested = false;
            results$.next({ failed: false, regionId: 'region-2', textVersion: 1, translatedText: 'Bolo de chocolate' });

            expect(historyServiceStub.record).toHaveBeenCalledTimes(1);
            expect(historyServiceStub.record).toHaveBeenCalledWith(expect.objectContaining({ originalText: 'Chocolate cake', sourceLanguage: 'de' }));
        });

        it('should not record regions shown as they are in the target language', () => {
            service.start(AUTO_TO_PORTUGUESE);
            recognition$.next(createEvent(1));
            identify('pt');

            results$.next({ failed: false, regionId: 'region-1', textVersion: 1, translatedText: 'Daily Specials' });

            expect(historyServiceStub.record).not.toHaveBeenCalled();
        });

        it('should not record failed translations', () => {
            service.start(ENGLISH_TO_PORTUGUESE);
            recognition$.next(createEvent(1));

            results$.next({ failed: true, regionId: 'region-1', textVersion: 1, translatedText: 'Daily Specials' });

            expect(findItem('region-1')?.status).toBe(OverlayStatus.ERROR);
            expect(historyServiceStub.record).not.toHaveBeenCalled();
        });

        it('should not record translations of an outdated text or of an unknown region', () => {
            service.start(ENGLISH_TO_PORTUGUESE);
            recognition$.next(createEvent(1));

            results$.next({ failed: false, regionId: 'region-1', textVersion: 5, translatedText: 'Pratos do dia' });
            results$.next({ failed: false, regionId: 'region-99', textVersion: 1, translatedText: 'Fantasma' });

            expect(historyServiceStub.record).not.toHaveBeenCalled();
        });

        it('should not record translations into the same language', () => {
            service.start({ sourceLanguage: 'pt', targetLanguage: 'pt' });
            recognition$.next(createEvent(1));

            results$.next({ failed: false, regionId: 'region-1', textVersion: 1, translatedText: 'Daily Specials' });

            expect(historyServiceStub.record).not.toHaveBeenCalled();
        });

        it('should not record translations of regions that are expiring', () => {
            service.start(ENGLISH_TO_PORTUGUESE);
            recognition$.next(createEvent(1));
            vi.advanceTimersByTime(TRACKING_CONFIG.expireAfterMilliseconds + EXPIRY_TICK_MILLISECONDS);

            results$.next({ failed: false, regionId: 'region-1', textVersion: 1, translatedText: 'Pratos do dia' });

            expect(findItem('region-1')?.translatedText).toBe('Pratos do dia');
            expect(historyServiceStub.record).not.toHaveBeenCalled();
        });
    });

    describe('scene language lifecycle', () => {
        it('should forget the scene language of the previous session', () => {
            service.start(AUTO_TO_PORTUGUESE);
            identify('de');

            service.start(AUTO_TO_PORTUGUESE);
            recognition$.next(createEvent(1));

            expect(service.sceneLanguage).toBeNull();
            expect(sceneLanguageServiceStub.startAutomatic).toHaveBeenCalledTimes(2);
            expect(everyItem((item: OverlayItem) => item.status === OverlayStatus.READING)).toBe(true);
            expect(translationQueueServiceStub.enqueue).not.toHaveBeenCalled();
        });
    });
});
