import type { Mock } from 'vitest';
import { NormalizedRect, OverlayItem, OverlayStatus, ReconcileResult, TextRegion } from '../../models';
import {
    DEFAULT_ANALYSES_PER_SECOND
,   EMPTY
,   MAX_ANALYSES_PER_SECOND
,   MIN_ANALYSES_PER_SECOND
,   TRACKING_CONFIG
,   TRANSLATION_RETRY_CONFIG
} from '../constants/constants';
import { TrackingUtils } from './tracking-utils';

const upperRect: NormalizedRect = { height: 0.05, width: 0.5, x: 0.25, y: 0.25 };
const lowerRect: NormalizedRect = { height: 0.05, width: 0.5, x: 0.25, y: 0.5 };

function createRegion(rawText: string, normalizedRect: NormalizedRect): TextRegion {
    return {
        confidence: 0.9,
        frameTimestamp: 0,
        normalizedRect: normalizedRect,
        orientation: 0,
        orientedHeight: normalizedRect.height,
        orientedWidth: normalizedRect.width,
        rawText: rawText,
        regionId: EMPTY,
        sourceLanguage: 'en',
    };
}

function createItem(overrides: Partial<OverlayItem> = {}): OverlayItem {
    const anchorRect: NormalizedRect = overrides.anchorRect ?? upperRect;

    return {
        anchorRect: anchorRect,
        candidateText: EMPTY,
        failedAt: null,
        failedAttempts: 0,
        firstSeenAt: 0,
        lastSeenAt: 0,
        observedRect: anchorRect,
        orientation: 0,
        orientedHeight: anchorRect.height,
        orientedWidth: anchorRect.width,
        originalText: 'Daily Specials',
        regionId: 'region-a',
        showOriginal: false,
        sourceLanguage: 'en',
        stabilityScore: 0.5,
        status: OverlayStatus.TRANSLATED,
        textVersion: 1,
        translatedText: 'Pratos do dia',
        ...overrides,
    };
}

function createSequentialIds(): () => string {
    let sequence: number = 0;

    return () => `region-${++sequence}`;
}

function findItem(result: ReconcileResult, regionId: string): OverlayItem | undefined {
    return result.items.find((item: OverlayItem) => item.regionId === regionId);
}

function shift(rect: NormalizedRect, deltaX: number, deltaY: number): NormalizedRect {
    return { ...rect, x: rect.x + deltaX, y: rect.y + deltaY };
}

describe('TrackingUtils', () => {
    describe('reconcile', () => {
        it('should create a READING pending item for a new region', () => {
            const result: ReconcileResult = TrackingUtils.reconcile([], [createRegion('Daily Specials', upperRect)], 500, createSequentialIds());
            const item: OverlayItem = result.items[0];

            expect(result.items.length).toBe(1);
            expect(item.regionId).toBe('region-1');
            expect(item.status).toBe(OverlayStatus.READING);
            expect(item.textVersion).toBe(1);
            expect(item.translatedText).toBe(EMPTY);
            expect(item.originalText).toBe('Daily Specials');
            expect(item.anchorRect).toEqual(upperRect);
            expect(item.firstSeenAt).toBe(500);
            expect(item.lastSeenAt).toBe(500);
            expect(item.showOriginal).toBe(false);
            expect(item.stabilityScore).toBe(TRACKING_CONFIG.stabilityIncrement);
            expect(result.pendingTranslations).toEqual([item]);
        });

        it('should request an identifier only for unmatched regions', () => {
            const createId: Mock<() => string> = vi.fn(createSequentialIds());
            const previous: OverlayItem[] = [createItem()];
            const regions: TextRegion[] = [createRegion('Daily Specials', upperRect), createRegion('Fresh tomato soup', lowerRect)];
            const result: ReconcileResult = TrackingUtils.reconcile(previous, regions, 100, createId);

            expect(createId).toHaveBeenCalledTimes(1);
            expect(result.items.map((item: OverlayItem) => item.regionId).sort()).toEqual(['region-1', 'region-a']);
        });

        it('should keep unmatched items by default and drop them when asked', () => {
            const previous: OverlayItem[] = [createItem(), createItem({ anchorRect: lowerRect, observedRect: lowerRect, originalText: 'Chocolate cake', regionId: 'region-b' })];
            const regions: TextRegion[] = [createRegion('Daily Specials', upperRect)];

            expect(TrackingUtils.reconcile(previous, regions, 100, createSequentialIds()).items.map((item: OverlayItem) => item.regionId))
                .toEqual(['region-b', 'region-a']);
            expect(TrackingUtils.reconcile(previous, regions, 100, createSequentialIds(), false).items.map((item: OverlayItem) => item.regionId))
                .toEqual(['region-a']);
        });

        it('should keep the anchor when the same text moves less than the movement threshold', () => {
            const movement: number = TRACKING_CONFIG.movementThreshold / 2;
            const previous: OverlayItem[] = [createItem({ stabilityScore: 0.5 })];
            const result: ReconcileResult = TrackingUtils.reconcile(
                previous,
                [createRegion('Daily Specials', shift(upperRect, movement, -movement))],
                100,
                createSequentialIds(),
            );
            const item: OverlayItem | undefined = findItem(result, 'region-a');

            expect(result.items.length).toBe(1);
            expect(item?.anchorRect).toEqual(upperRect);
            expect(item?.status).toBe(OverlayStatus.TRANSLATED);
            expect(item?.translatedText).toBe('Pratos do dia');
            expect(item?.textVersion).toBe(1);
            expect(item?.lastSeenAt).toBe(100);
            expect(item?.firstSeenAt).toBe(0);
            expect(item?.stabilityScore).toBeCloseTo(0.5 + TRACKING_CONFIG.stabilityIncrement);
            expect(result.pendingTranslations).toEqual([]);
        });

        it('should smooth the anchor towards larger movements', () => {
            const target: NormalizedRect = shift(upperRect, 0.1, 0.02);
            const result: ReconcileResult = TrackingUtils.reconcile([createItem()], [createRegion('Daily Specials', target)], 100, createSequentialIds());
            const item: OverlayItem | undefined = findItem(result, 'region-a');

            expect(item?.anchorRect.x).toBeCloseTo(upperRect.x + 0.1 * TRACKING_CONFIG.smoothingFactor);
            expect(item?.anchorRect.y).toBeCloseTo(upperRect.y + 0.02 * TRACKING_CONFIG.smoothingFactor);
            expect(item?.anchorRect.width).toBeCloseTo(upperRect.width);
            expect(item?.observedRect).toEqual(target);
            expect(item?.status).toBe(OverlayStatus.TRANSLATED);
            expect(result.pendingTranslations).toEqual([]);
        });

        it('should snap the anchor onto the observed position when asked', () => {
            const target: NormalizedRect = shift(upperRect, 0.05, 0.05);
            const result: ReconcileResult = TrackingUtils.reconcile([createItem()], [createRegion('Daily Specials', target)], 100, createSequentialIds(), false, true);
            const item: OverlayItem | undefined = findItem(result, 'region-a');

            expect(item?.anchorRect).toEqual(target);
            expect(item?.observedRect).toEqual(target);
            expect(item?.status).toBe(OverlayStatus.TRANSLATED);
        });

        it('should snap the anchor when the text moves further than its own height', () => {
            const target: NormalizedRect = shift(upperRect, 0, upperRect.height * 1.5);
            const result: ReconcileResult = TrackingUtils.reconcile([createItem()], [createRegion('Daily Specials', target)], 100, createSequentialIds());

            expect(result.items.length).toBe(1);
            expect(findItem(result, 'region-a')?.anchorRect).toEqual(target);
        });

        it('should start tracking new regions at their observed position', () => {
            const result: ReconcileResult = TrackingUtils.reconcile([], [createRegion('Daily Specials', lowerRect)], 0, createSequentialIds());

            expect(result.items[0].observedRect).toEqual(lowerRect);
            expect(result.items[0].candidateText).toBe(EMPTY);
            expect(result.items[0].failedAt).toBeNull();
            expect(result.items[0].failedAttempts).toBe(0);
        });

        it('should start tracking new regions with the angle and size of their text', () => {
            const region: TextRegion = { ...createRegion('Daily Specials', lowerRect), orientation: 4, orientedHeight: 0.03, orientedWidth: 0.48 };
            const result: ReconcileResult = TrackingUtils.reconcile([], [region], 0, createSequentialIds());

            expect(result.items[0].orientation).toBe(4);
            expect(result.items[0].orientedHeight).toBe(0.03);
            expect(result.items[0].orientedWidth).toBe(0.48);
        });

        it('should smooth the angle and size of the text together with the anchor', () => {
            const factor: number = TRACKING_CONFIG.smoothingFactor;
            const region: TextRegion = { ...createRegion('Daily Specials', shift(upperRect, 0.1, 0.02)), orientation: 10, orientedHeight: 0.03, orientedWidth: 0.4 };
            const item: OverlayItem | undefined = findItem(TrackingUtils.reconcile([createItem()], [region], 100, createSequentialIds()), 'region-a');

            expect(item?.orientation).toBeCloseTo(10 * factor);
            expect(item?.orientedWidth).toBeCloseTo(upperRect.width + (0.4 - upperRect.width) * factor);
            expect(item?.orientedHeight).toBeCloseTo(upperRect.height + (0.03 - upperRect.height) * factor);
        });

        it('should snap the angle and size of the text together with the anchor when asked', () => {
            const region: TextRegion = { ...createRegion('Daily Specials', shift(upperRect, 0.05, 0.05)), orientation: -7, orientedHeight: 0.03, orientedWidth: 0.4 };
            const item: OverlayItem | undefined = findItem(
                TrackingUtils.reconcile([createItem()], [region], 100, createSequentialIds(), false, true),
                'region-a',
            );

            expect(item?.orientation).toBe(-7);
            expect(item?.orientedHeight).toBe(0.03);
            expect(item?.orientedWidth).toBe(0.4);
        });

        it('should keep the angle and size of the text while the anchor stays in place', () => {
            const movement: number = TRACKING_CONFIG.movementThreshold / 2;
            const region: TextRegion = { ...createRegion('Daily Specials', shift(upperRect, movement, 0)), orientation: 1, orientedHeight: 0.04, orientedWidth: 0.49 };
            const item: OverlayItem | undefined = findItem(TrackingUtils.reconcile([createItem()], [region], 100, createSequentialIds()), 'region-a');

            expect(item?.orientation).toBe(0);
            expect(item?.orientedHeight).toBe(upperRect.height);
            expect(item?.orientedWidth).toBe(upperRect.width);
        });

        it('should keep the same regionId while text moves steadily', () => {
            const createId: Mock<() => string> = vi.fn(createSequentialIds());
            const startRect: NormalizedRect = { height: 0.03, width: 0.6, x: 0.2, y: 0.1 };
            let items: OverlayItem[] = [];
            let now: number = 0;

            for (let frame: number = 0; frame < 12; frame++) {
                const result: ReconcileResult = TrackingUtils.reconcile(
                    items,
                    [createRegion('Grilled chicken with lemon', shift(startRect, 0, 0.03 * frame))],
                    now,
                    createId,
                );

                items = result.items;
                now += 333;

                expect(items.length).toBe(1);
                expect(items[0].regionId).toBe('region-1');
            }

            expect(createId).toHaveBeenCalledTimes(1);
            expect(items[0].observedRect.y).toBeCloseTo(startRect.y + 0.03 * 11);
        });

        it('should bump the text version and become pending when the text changes', () => {
            const previous: OverlayItem[] = [createItem({ showOriginal: true, stabilityScore: 1 })];
            const result: ReconcileResult = TrackingUtils.reconcile(previous, [createRegion('Open until midnight', upperRect)], 100, createSequentialIds());
            const item: OverlayItem | undefined = findItem(result, 'region-a');

            expect(result.items.length).toBe(1);
            expect(item?.textVersion).toBe(2);
            expect(item?.status).toBe(OverlayStatus.READING);
            expect(item?.originalText).toBe('Open until midnight');
            expect(item?.translatedText).toBe(EMPTY);
            expect(item?.showOriginal).toBe(false);
            expect(item?.stabilityScore).toBe(TRACKING_CONFIG.stabilityIncrement);
            expect(result.pendingTranslations.map((pending: OverlayItem) => pending.regionId)).toEqual(['region-a']);
        });

        it('should keep the translation when the text only changes slightly', () => {
            const result: ReconcileResult = TrackingUtils.reconcile([createItem()], [createRegion('Daily Specials.', upperRect)], 100, createSequentialIds());
            const item: OverlayItem | undefined = findItem(result, 'region-a');

            expect(item?.textVersion).toBe(1);
            expect(item?.originalText).toBe('Daily Specials');
            expect(item?.status).toBe(OverlayStatus.TRANSLATED);
            expect(result.pendingTranslations).toEqual([]);
        });

        it('should never adopt a reading that only differs in punctuation or spacing', () => {
            const first: ReconcileResult = TrackingUtils.reconcile([createItem()], [createRegion('Daily-Specials.', upperRect)], 100, createSequentialIds());
            const second: ReconcileResult = TrackingUtils.reconcile(first.items, [createRegion('Daily-Specials.', upperRect)], 433, createSequentialIds());
            const item: OverlayItem | undefined = findItem(second, 'region-a');

            expect(item?.textVersion).toBe(1);
            expect(item?.originalText).toBe('Daily Specials');
            expect(item?.candidateText).toBe(EMPTY);
            expect(item?.status).toBe(OverlayStatus.TRANSLATED);
            expect(second.pendingTranslations).toEqual([]);
        });

        it('should adopt a completed reading of a truncated line once it is seen in two consecutive frames', () => {
            const truncated: OverlayItem = createItem({ originalText: 'Open every day until midni', translatedText: 'Aberto todos os dias até meia' });
            const first: ReconcileResult = TrackingUtils.reconcile([truncated], [createRegion('Open every day until midnight', upperRect)], 100, createSequentialIds());
            const pendingItem: OverlayItem | undefined = findItem(first, 'region-a');

            expect(pendingItem?.textVersion).toBe(1);
            expect(pendingItem?.originalText).toBe('Open every day until midni');
            expect(pendingItem?.candidateText).toBe('Open every day until midnight');
            expect(pendingItem?.status).toBe(OverlayStatus.TRANSLATED);
            expect(first.pendingTranslations).toEqual([]);

            const second: ReconcileResult = TrackingUtils.reconcile(first.items, [createRegion('Open every day until midnight', upperRect)], 433, createSequentialIds());
            const item: OverlayItem | undefined = findItem(second, 'region-a');

            expect(item?.textVersion).toBe(2);
            expect(item?.originalText).toBe('Open every day until midnight');
            expect(item?.candidateText).toBe(EMPTY);
            expect(item?.status).toBe(OverlayStatus.READING);
            expect(item?.translatedText).toBe('Aberto todos os dias até meia');
            expect(second.pendingTranslations.map((pending: OverlayItem) => pending.regionId)).toEqual(['region-a']);
        });

        it('should ignore a one character change that is seen in a single frame', () => {
            const price: OverlayItem = createItem({ originalText: 'Pizza Margherita 8,50', translatedText: 'Pizza Margherita 8,50 €' });
            const misread: ReconcileResult = TrackingUtils.reconcile([price], [createRegion('Pizza Margherita 9,50', upperRect)], 100, createSequentialIds());
            const restored: ReconcileResult = TrackingUtils.reconcile(misread.items, [createRegion('Pizza Margherita 8,50', upperRect)], 433, createSequentialIds());
            const misreadAgain: ReconcileResult = TrackingUtils.reconcile(restored.items, [createRegion('Pizza Margherita 9,50', upperRect)], 766, createSequentialIds());
            const item: OverlayItem | undefined = findItem(misreadAgain, 'region-a');

            expect(findItem(restored, 'region-a')?.candidateText).toBe(EMPTY);
            expect(item?.textVersion).toBe(1);
            expect(item?.originalText).toBe('Pizza Margherita 8,50');
            expect(item?.status).toBe(OverlayStatus.TRANSLATED);
            expect(misread.pendingTranslations).toEqual([]);
            expect(restored.pendingTranslations).toEqual([]);
            expect(misreadAgain.pendingTranslations).toEqual([]);
        });

        it('should adopt a one character change that is seen in two consecutive frames', () => {
            const price: OverlayItem = createItem({ originalText: 'Pizza Margherita 8,50', showOriginal: true, translatedText: 'Pizza Margherita 8,50 €' });
            const first: ReconcileResult = TrackingUtils.reconcile([price], [createRegion('Pizza Margherita 9,50', upperRect)], 100, createSequentialIds());
            const second: ReconcileResult = TrackingUtils.reconcile(first.items, [createRegion('Pizza Margherita 9,50', upperRect)], 433, createSequentialIds());
            const item: OverlayItem | undefined = findItem(second, 'region-a');

            expect(item?.textVersion).toBe(2);
            expect(item?.originalText).toBe('Pizza Margherita 9,50');
            expect(item?.status).toBe(OverlayStatus.READING);
            expect(item?.showOriginal).toBe(true);
            expect(item?.translatedText).toBe('Pizza Margherita 8,50 €');
            expect(second.pendingTranslations.map((pending: OverlayItem) => pending.regionId)).toEqual(['region-a']);
        });

        it('should restart the confirmation when a different reading follows the candidate', () => {
            const price: OverlayItem = createItem({ originalText: 'Pizza Margherita 8,50' });
            const first: ReconcileResult = TrackingUtils.reconcile([price], [createRegion('Pizza Margherita 9,50', upperRect)], 100, createSequentialIds());
            const second: ReconcileResult = TrackingUtils.reconcile(first.items, [createRegion('Pizza Margherita 6,50', upperRect)], 433, createSequentialIds());
            const item: OverlayItem | undefined = findItem(second, 'region-a');

            expect(item?.textVersion).toBe(1);
            expect(item?.candidateText).toBe('Pizza Margherita 6,50');
            expect(second.pendingTranslations).toEqual([]);
        });

        it('should match each region to its own item with greedy best score', () => {
            const previous: OverlayItem[] = [
                createItem({ anchorRect: upperRect, originalText: 'Daily Specials', regionId: 'region-a' }),
                createItem({ anchorRect: lowerRect, originalText: 'Fresh tomato soup', regionId: 'region-b', translatedText: 'Sopa de tomate fresca' }),
            ];
            const regions: TextRegion[] = [
                createRegion('Fresh tomato soup', shift(lowerRect, 0.004, 0.002)),
                createRegion('Daily Specials', shift(upperRect, -0.003, 0.001)),
            ];
            const createId: Mock<() => string> = vi.fn(createSequentialIds());
            const result: ReconcileResult = TrackingUtils.reconcile(previous, regions, 100, createId);

            expect(createId).not.toHaveBeenCalled();
            expect(result.items.length).toBe(2);
            expect(findItem(result, 'region-a')?.originalText).toBe('Daily Specials');
            expect(findItem(result, 'region-b')?.originalText).toBe('Fresh tomato soup');
            expect(findItem(result, 'region-b')?.translatedText).toBe('Sopa de tomate fresca');
            expect(result.pendingTranslations).toEqual([]);
        });

        it('should give a contested region to the best scoring item and keep a neighbour it does not cover untouched', () => {
            const exact: OverlayItem = createItem({ regionId: 'region-a' });
            const neighbour: OverlayItem = createItem({ anchorRect: shift(upperRect, 0, upperRect.height * 1.2), regionId: 'region-b' });
            const result: ReconcileResult = TrackingUtils.reconcile([neighbour, exact], [createRegion('Daily Specials', upperRect)], 100, createSequentialIds());

            expect(result.items.length).toBe(2);
            expect(findItem(result, 'region-a')?.lastSeenAt).toBe(100);
            expect(findItem(result, 'region-b')).toBe(neighbour);
        });

        it('should give a contested region to the best scoring item and drop the other one it covers', () => {
            const exact: OverlayItem = createItem({ regionId: 'region-a' });
            const partial: OverlayItem = createItem({ anchorRect: shift(upperRect, 0.2, 0), originalText: 'Daily', regionId: 'region-b' });
            const result: ReconcileResult = TrackingUtils.reconcile([partial, exact], [createRegion('Daily Specials', upperRect)], 100, createSequentialIds());

            expect(result.items.length).toBe(1);
            expect(findItem(result, 'region-a')?.lastSeenAt).toBe(100);
            expect(findItem(result, 'region-b')).toBeUndefined();
        });

        it('should leave no retained item when two lines are merged into one region', () => {
            const firstLine: NormalizedRect = { height: 0.04, width: 0.5, x: 0.25, y: 0.3 };
            const secondLine: NormalizedRect = { height: 0.04, width: 0.5, x: 0.25, y: 0.35 };
            const merged: NormalizedRect = { height: 0.09, width: 0.5, x: 0.25, y: 0.3 };
            const previous: OverlayItem[] = [
                createItem({ anchorRect: firstLine, originalText: 'Grilled chicken', regionId: 'region-a', translatedText: 'Frango grelhado' }),
                createItem({ anchorRect: secondLine, originalText: 'with lemon', regionId: 'region-b', translatedText: 'com limão' }),
            ];
            const result: ReconcileResult = TrackingUtils.reconcile(previous, [createRegion('Grilled chicken with lemon', merged)], 100, createSequentialIds());

            expect(result.items.map((item: OverlayItem) => item.regionId)).toEqual(['region-a']);
            expect(result.items[0].originalText).toBe('Grilled chicken with lemon');
        });

        it('should replace, not duplicate, a translated item whose text reappears far away', () => {
            const farAway: NormalizedRect = shift(upperRect, 0, TRACKING_CONFIG.matchMaxCenterDistance * 2.5);
            const result: ReconcileResult = TrackingUtils.reconcile([createItem()], [createRegion('Daily Specials', farAway)], 100, createSequentialIds());

            expect(result.items.length).toBe(1);
            expect(result.items[0].regionId).toBe('region-1');
            expect(result.items[0].anchorRect).toEqual(farAway);
            expect(result.items[0].status).toBe(OverlayStatus.READING);
        });

        it('should match nearby regions with similar text even when the boxes barely overlap', () => {
            const smallRect: NormalizedRect = { height: 0.02, width: 0.05, x: 0.5, y: 0.5 };
            const previous: OverlayItem[] = [createItem({ anchorRect: smallRect, originalText: 'Exit' })];
            const result: ReconcileResult = TrackingUtils.reconcile(previous, [createRegion('Exit', shift(smallRect, 0.04, 0))], 100, createSequentialIds());

            expect(result.items.length).toBe(1);
            expect(result.items[0].regionId).toBe('region-a');
        });

        it('should create a new item for distant regions with different text and keep the previous one', () => {
            const previous: OverlayItem[] = [createItem()];
            const result: ReconcileResult = TrackingUtils.reconcile(
                previous,
                [createRegion('Chocolate cake', { height: 0.05, width: 0.2, x: 0.7, y: 0.9 })],
                100,
                createSequentialIds(),
            );

            expect(result.items.length).toBe(2);
            expect(findItem(result, 'region-a')).toBe(previous[0]);
            expect(findItem(result, 'region-1')?.status).toBe(OverlayStatus.READING);
            expect(result.pendingTranslations.map((pending: OverlayItem) => pending.regionId)).toEqual(['region-1']);
        });

        it('should restore TRANSLATED when an expiring translated item reappears', () => {
            const previous: OverlayItem[] = [createItem({ status: OverlayStatus.EXPIRING })];
            const result: ReconcileResult = TrackingUtils.reconcile(previous, [createRegion('Daily Specials', upperRect)], 100, createSequentialIds());

            expect(result.items[0].status).toBe(OverlayStatus.TRANSLATED);
            expect(result.items[0].translatedText).toBe('Pratos do dia');
            expect(result.pendingTranslations).toEqual([]);
        });

        it('should go back to READING when an expiring item without translation reappears', () => {
            const previous: OverlayItem[] = [createItem({ status: OverlayStatus.EXPIRING, translatedText: EMPTY })];
            const result: ReconcileResult = TrackingUtils.reconcile(previous, [createRegion('Daily Specials', upperRect)], 100, createSequentialIds());

            expect(result.items[0].status).toBe(OverlayStatus.READING);
            expect(result.items[0].textVersion).toBe(1);
            expect(result.pendingTranslations.map((pending: OverlayItem) => pending.regionId)).toEqual(['region-a']);
        });

        it('should keep items that are being translated without requesting them again', () => {
            const previous: OverlayItem[] = [createItem({ status: OverlayStatus.TRANSLATING, translatedText: EMPTY })];
            const result: ReconcileResult = TrackingUtils.reconcile(previous, [createRegion('Daily Specials', upperRect)], 100, createSequentialIds());

            expect(result.items[0].status).toBe(OverlayStatus.TRANSLATING);
            expect(result.pendingTranslations).toEqual([]);
        });

        it('should record a translation failure the first time a failed item is seen again', () => {
            const previous: OverlayItem[] = [createItem({ status: OverlayStatus.ERROR, translatedText: EMPTY })];
            const result: ReconcileResult = TrackingUtils.reconcile(previous, [createRegion('Daily Specials', upperRect)], 100, createSequentialIds());

            expect(result.items[0].status).toBe(OverlayStatus.ERROR);
            expect(result.items[0].failedAt).toBe(100);
            expect(result.items[0].failedAttempts).toBe(1);
            expect(result.pendingTranslations).toEqual([]);
        });

        it('should keep a failed item in ERROR until the retry delay has passed', () => {
            const previous: OverlayItem[] = [createItem({ failedAt: 100, failedAttempts: 1, status: OverlayStatus.ERROR, translatedText: EMPTY })];
            const result: ReconcileResult = TrackingUtils.reconcile(
                previous,
                [createRegion('Daily Specials', upperRect)],
                100 + TRANSLATION_RETRY_CONFIG.delayMilliseconds - 1,
                createSequentialIds(),
            );

            expect(result.items[0].status).toBe(OverlayStatus.ERROR);
            expect(result.items[0].failedAt).toBe(100);
            expect(result.items[0].failedAttempts).toBe(1);
            expect(result.pendingTranslations).toEqual([]);
        });

        it('should retry a failed translation once the retry delay has passed', () => {
            const previous: OverlayItem[] = [createItem({ failedAt: 100, failedAttempts: 1, status: OverlayStatus.ERROR, translatedText: EMPTY })];
            const result: ReconcileResult = TrackingUtils.reconcile(
                previous,
                [createRegion('Daily Specials', upperRect)],
                100 + TRANSLATION_RETRY_CONFIG.delayMilliseconds,
                createSequentialIds(),
            );

            expect(result.items[0].status).toBe(OverlayStatus.READING);
            expect(result.items[0].textVersion).toBe(1);
            expect(result.items[0].failedAt).toBeNull();
            expect(result.items[0].failedAttempts).toBe(1);
            expect(result.pendingTranslations.map((pending: OverlayItem) => pending.regionId)).toEqual(['region-a']);
        });

        it('should count every failed retry and stop after the maximum number of failed attempts', () => {
            const maxFailedAttempts: number = TRANSLATION_RETRY_CONFIG.maxFailedAttempts;
            let items: OverlayItem[] = [createItem({ status: OverlayStatus.ERROR, translatedText: EMPTY })];
            let now: number = 0;
            let retries: number = 0;

            for (let frame: number = 0; frame < 40; frame++) {
                const result: ReconcileResult = TrackingUtils.reconcile(items, [createRegion('Daily Specials', upperRect)], now, createSequentialIds());

                retries += result.pendingTranslations.length;
                items = result.items.map((item: OverlayItem) => (item.status === OverlayStatus.READING ? { ...item, status: OverlayStatus.ERROR } : item));
                now += 333;
            }

            expect(retries).toBe(maxFailedAttempts - 1);
            expect(items[0].failedAttempts).toBe(maxFailedAttempts);
            expect(items[0].status).toBe(OverlayStatus.ERROR);
        });

        it('should reset the failure count when the text changes', () => {
            const previous: OverlayItem[] = [
                createItem({ failedAt: 100, failedAttempts: TRANSLATION_RETRY_CONFIG.maxFailedAttempts, status: OverlayStatus.ERROR, translatedText: EMPTY }),
            ];
            const result: ReconcileResult = TrackingUtils.reconcile(previous, [createRegion('Open until midnight', upperRect)], 200, createSequentialIds());

            expect(result.items[0].status).toBe(OverlayStatus.READING);
            expect(result.items[0].textVersion).toBe(2);
            expect(result.items[0].failedAt).toBeNull();
            expect(result.items[0].failedAttempts).toBe(0);
            expect(result.pendingTranslations.map((pending: OverlayItem) => pending.regionId)).toEqual(['region-a']);
        });

        it('should not keep a stale failure time when an expiring item is translated again', () => {
            const previous: OverlayItem[] = [createItem({ failedAt: 100, failedAttempts: 1, status: OverlayStatus.EXPIRING, translatedText: EMPTY })];
            const result: ReconcileResult = TrackingUtils.reconcile(previous, [createRegion('Daily Specials', upperRect)], 5000, createSequentialIds());

            expect(result.items[0].status).toBe(OverlayStatus.READING);
            expect(result.items[0].failedAt).toBeNull();
            expect(result.items[0].failedAttempts).toBe(1);
        });

        it('should create new items without a source language', () => {
            const result: ReconcileResult = TrackingUtils.reconcile([], [createRegion('Daily Specials', upperRect)], 0, createSequentialIds());

            expect(result.items[0].sourceLanguage).toBeNull();
        });

        it('should keep the source language on stable matches', () => {
            const previous: OverlayItem[] = [createItem({ sourceLanguage: 'de' })];
            const result: ReconcileResult = TrackingUtils.reconcile(previous, [createRegion('Daily Specials.', upperRect)], 100, createSequentialIds());

            expect(result.items[0].sourceLanguage).toBe('de');
            expect(result.items[0].status).toBe(OverlayStatus.TRANSLATED);
        });

        it('should reset the source language when the text changes', () => {
            const previous: OverlayItem[] = [createItem({ sourceLanguage: 'de' })];
            const result: ReconcileResult = TrackingUtils.reconcile(previous, [createRegion('Open until midnight', upperRect)], 100, createSequentialIds());

            expect(result.items[0].sourceLanguage).toBeNull();
            expect(result.items[0].status).toBe(OverlayStatus.READING);
        });

        it('should reset the source language when a corrected reading is adopted', () => {
            const truncated: OverlayItem = createItem({ originalText: 'Open every day until midni', sourceLanguage: 'de' });
            const first: ReconcileResult = TrackingUtils.reconcile([truncated], [createRegion('Open every day until midnight', upperRect)], 100, createSequentialIds());
            const second: ReconcileResult = TrackingUtils.reconcile(first.items, [createRegion('Open every day until midnight', upperRect)], 433, createSequentialIds());

            expect(findItem(first, 'region-a')?.sourceLanguage).toBe('de');
            expect(findItem(second, 'region-a')?.sourceLanguage).toBeNull();
            expect(findItem(second, 'region-a')?.status).toBe(OverlayStatus.READING);
            expect(findItem(second, 'region-a')?.textVersion).toBe(2);
        });

        it.each([
            OverlayStatus.DETECTING,
            OverlayStatus.MODEL_MISSING,
            OverlayStatus.UNDETERMINED,
        ])('should keep %s items without requesting them again', (status: OverlayStatus) => {
            const previous: OverlayItem[] = [createItem({ sourceLanguage: status === OverlayStatus.MODEL_MISSING ? 'de' : null, status: status, translatedText: EMPTY })];
            const first: ReconcileResult = TrackingUtils.reconcile(previous, [createRegion('Daily Specials', upperRect)], 100, createSequentialIds());
            const second: ReconcileResult = TrackingUtils.reconcile(first.items, [createRegion('Daily Specials', upperRect)], 5000, createSequentialIds());

            expect(second.items[0].status).toBe(status);
            expect(second.items[0].sourceLanguage).toBe(previous[0].sourceLanguage);
            expect(first.pendingTranslations).toEqual([]);
            expect(second.pendingTranslations).toEqual([]);
        });

        it.each([
            OverlayStatus.DETECTING,
            OverlayStatus.MODEL_MISSING,
            OverlayStatus.UNDETERMINED,
        ])('should send %s items back to READING when their text changes', (status: OverlayStatus) => {
            const previous: OverlayItem[] = [createItem({ sourceLanguage: 'de', status: status, translatedText: EMPTY })];
            const result: ReconcileResult = TrackingUtils.reconcile(previous, [createRegion('Open until midnight', upperRect)], 100, createSequentialIds());

            expect(result.items[0].status).toBe(OverlayStatus.READING);
            expect(result.items[0].sourceLanguage).toBeNull();
            expect(result.pendingTranslations.map((pending: OverlayItem) => pending.regionId)).toEqual(['region-a']);
        });

        it('should go back to READING when an expiring item with a translation of an unresolved version reappears', () => {
            const previous: OverlayItem[] = [createItem({ sourceLanguage: null, status: OverlayStatus.EXPIRING, textVersion: 2 })];
            const result: ReconcileResult = TrackingUtils.reconcile(previous, [createRegion('Daily Specials', upperRect)], 100, createSequentialIds());

            expect(result.items[0].status).toBe(OverlayStatus.READING);
            expect(result.items[0].translatedText).toBe('Pratos do dia');
            expect(result.items[0].textVersion).toBe(2);
            expect(result.pendingTranslations.map((pending: OverlayItem) => pending.regionId)).toEqual(['region-a']);
        });

        it('should restore TRANSLATED when an expiring item translated into its own language reappears', () => {
            const previous: OverlayItem[] = [createItem({ sourceLanguage: 'pt', status: OverlayStatus.EXPIRING, translatedText: 'Daily Specials' })];
            const result: ReconcileResult = TrackingUtils.reconcile(previous, [createRegion('Daily Specials', upperRect)], 100, createSequentialIds());

            expect(result.items[0].status).toBe(OverlayStatus.TRANSLATED);
            expect(result.items[0].sourceLanguage).toBe('pt');
            expect(result.pendingTranslations).toEqual([]);
        });

        it('should keep the source language when a failed translation is retried', () => {
            const previous: OverlayItem[] = [createItem({ failedAt: 100, failedAttempts: 1, sourceLanguage: 'de', status: OverlayStatus.ERROR, translatedText: EMPTY })];
            const result: ReconcileResult = TrackingUtils.reconcile(
                previous,
                [createRegion('Daily Specials', upperRect)],
                100 + TRANSLATION_RETRY_CONFIG.delayMilliseconds,
                createSequentialIds(),
            );

            expect(result.items[0].status).toBe(OverlayStatus.READING);
            expect(result.items[0].sourceLanguage).toBe('de');
        });

        it('should cap the stability score at 1', () => {
            const previous: OverlayItem[] = [createItem({ stabilityScore: 0.9 })];
            const result: ReconcileResult = TrackingUtils.reconcile(previous, [createRegion('Daily Specials', upperRect)], 100, createSequentialIds());

            expect(result.items[0].stabilityScore).toBe(1);
        });

        it('should not mutate the previous items', () => {
            const original: OverlayItem = createItem();
            const snapshot: OverlayItem = { ...original, anchorRect: { ...original.anchorRect } };

            TrackingUtils.reconcile([original], [createRegion('Open until midnight', shift(upperRect, 0.1, 0))], 100, createSequentialIds());

            expect(original).toEqual(snapshot);
        });
    });

    describe('expire', () => {
        it('should keep recently seen items untouched', () => {
            const items: OverlayItem[] = [createItem({ lastSeenAt: 1000 })];
            const expired: OverlayItem[] = TrackingUtils.expire(items, 1000 + TRACKING_CONFIG.expireAfterMilliseconds - 1);

            expect(expired.length).toBe(1);
            expect(expired[0]).toBe(items[0]);
        });

        it('should mark items as EXPIRING after the expiry delay', () => {
            const items: OverlayItem[] = [createItem({ lastSeenAt: 1000 })];
            const expired: OverlayItem[] = TrackingUtils.expire(items, 1000 + TRACKING_CONFIG.expireAfterMilliseconds);

            expect(expired[0].status).toBe(OverlayStatus.EXPIRING);
            expect(expired[0].translatedText).toBe('Pratos do dia');
            expect(items[0].status).toBe(OverlayStatus.TRANSLATED);
        });

        it.each([
            OverlayStatus.DETECTING,
            OverlayStatus.MODEL_MISSING,
            OverlayStatus.UNDETERMINED,
        ])('should expire %s items and keep their source language', (status: OverlayStatus) => {
            const items: OverlayItem[] = [createItem({ lastSeenAt: 1000, sourceLanguage: 'de', status: status, translatedText: EMPTY })];
            const expired: OverlayItem[] = TrackingUtils.expire(items, 1000 + TRACKING_CONFIG.expireAfterMilliseconds);

            expect(expired[0].status).toBe(OverlayStatus.EXPIRING);
            expect(expired[0].sourceLanguage).toBe('de');
        });

        it('should keep the same reference for items that are already EXPIRING', () => {
            const items: OverlayItem[] = [createItem({ lastSeenAt: 1000, status: OverlayStatus.EXPIRING })];
            const expired: OverlayItem[] = TrackingUtils.expire(items, 1000 + TRACKING_CONFIG.expireAfterMilliseconds + 100);

            expect(expired[0]).toBe(items[0]);
        });

        it('should remove items after the removal delay', () => {
            const items: OverlayItem[] = [
                createItem({ lastSeenAt: 1000, regionId: 'region-old' }),
                createItem({ lastSeenAt: 2500, regionId: 'region-recent' }),
            ];
            const expired: OverlayItem[] = TrackingUtils.expire(items, 1000 + TRACKING_CONFIG.removeAfterMilliseconds);

            expect(expired.map((item: OverlayItem) => item.regionId)).toEqual(['region-recent']);
        });

        it('should go through EXPIRING before being removed', () => {
            const seenAt: number = 1000;
            const expiring: OverlayItem[] = TrackingUtils.expire([createItem({ lastSeenAt: seenAt })], seenAt + TRACKING_CONFIG.expireAfterMilliseconds);
            const removed: OverlayItem[] = TrackingUtils.expire(expiring, seenAt + TRACKING_CONFIG.removeAfterMilliseconds);

            expect(expiring[0].status).toBe(OverlayStatus.EXPIRING);
            expect(removed).toEqual([]);
        });

        it('should keep the default thresholds at three analyses per second', () => {
            const interval: number = TrackingUtils.analysisIntervalFor(3);
            const items: OverlayItem[] = [createItem({ lastSeenAt: 1000 })];

            expect(TrackingUtils.expire(items, 1000 + TRACKING_CONFIG.expireAfterMilliseconds - 1, interval)[0]).toBe(items[0]);
            expect(TrackingUtils.expire(items, 1000 + TRACKING_CONFIG.expireAfterMilliseconds, interval)[0].status).toBe(OverlayStatus.EXPIRING);
            expect(TrackingUtils.expire(items, 1000 + TRACKING_CONFIG.removeAfterMilliseconds - 1, interval).length).toBe(1);
            expect(TrackingUtils.expire(items, 1000 + TRACKING_CONFIG.removeAfterMilliseconds, interval)).toEqual([]);
        });

        it('should survive a single missed analysis at one analysis per second', () => {
            const interval: number = TrackingUtils.analysisIntervalFor(1);
            const items: OverlayItem[] = [createItem({ lastSeenAt: 1000 })];

            expect(TrackingUtils.expire(items, 1000 + 2 * interval + 100, interval)[0]).toBe(items[0]);
            expect(TrackingUtils.expire(items, 1000 + 2499, interval)[0]).toBe(items[0]);
            expect(TrackingUtils.expire(items, 1000 + 2500, interval)[0].status).toBe(OverlayStatus.EXPIRING);
            expect(TrackingUtils.expire(items, 1000 + 3099, interval).length).toBe(1);
            expect(TrackingUtils.expire(items, 1000 + 3100, interval)).toEqual([]);
        });

        it('should fall back to the default thresholds for an invalid interval', () => {
            const items: OverlayItem[] = [createItem({ lastSeenAt: 1000 })];

            expect(TrackingUtils.expire(items, 1000 + TRACKING_CONFIG.expireAfterMilliseconds, Number.NaN)[0].status).toBe(OverlayStatus.EXPIRING);
            expect(TrackingUtils.expire(items, 1000 + TRACKING_CONFIG.removeAfterMilliseconds, Number.NaN)).toEqual([]);
        });
    });

    describe('analysisIntervalFor', () => {
        it('should convert analyses per second into milliseconds between analyses', () => {
            expect(TrackingUtils.analysisIntervalFor(1)).toBe(1000);
            expect(TrackingUtils.analysisIntervalFor(3)).toBeCloseTo(1000 / 3);
            expect(TrackingUtils.analysisIntervalFor(5)).toBe(200);
        });

        it('should clamp the rate to the supported range', () => {
            expect(TrackingUtils.analysisIntervalFor(0)).toBe(1000 / MIN_ANALYSES_PER_SECOND);
            expect(TrackingUtils.analysisIntervalFor(60)).toBe(1000 / MAX_ANALYSES_PER_SECOND);
        });

        it('should use the default rate for an invalid value', () => {
            expect(TrackingUtils.analysisIntervalFor(Number.NaN)).toBeCloseTo(1000 / DEFAULT_ANALYSES_PER_SECOND);
        });
    });

    describe('deduplicate', () => {
        it('should keep only the first of two identical regions', () => {
            const first: TextRegion = createRegion('Daily Specials', upperRect);
            const second: TextRegion = createRegion('Daily Specials', { ...upperRect });

            expect(TrackingUtils.deduplicate([first, second])).toEqual([first]);
        });

        it('should drop overlapping regions with nearly identical text', () => {
            const first: TextRegion = createRegion('Daily Specials', upperRect);
            const second: TextRegion = createRegion('daily specials.', shift(upperRect, 0.01, 0));

            expect(TrackingUtils.deduplicate([first, second])).toEqual([first]);
        });

        it('should keep overlapping regions with different text', () => {
            const regions: TextRegion[] = [createRegion('Daily Specials', upperRect), createRegion('Chocolate cake', upperRect)];

            expect(TrackingUtils.deduplicate(regions).length).toBe(2);
        });

        it('should keep regions with the same text in different places', () => {
            const regions: TextRegion[] = [createRegion('Exit', upperRect), createRegion('Exit', lowerRect)];

            expect(TrackingUtils.deduplicate(regions).length).toBe(2);
        });

        it('should return an empty list for no regions', () => {
            expect(TrackingUtils.deduplicate([])).toEqual([]);
        });
    });
});
