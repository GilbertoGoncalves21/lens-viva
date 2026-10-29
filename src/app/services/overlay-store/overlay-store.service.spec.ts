import { TestBed } from '@angular/core/testing';
import { Subscription } from 'rxjs';
import { NormalizedRect, OverlayItem, OverlayStatus, TextRegion } from 'src/app/shared/models';
import { DEFAULT_ANALYSES_PER_SECOND, EMPTY, MIN_ANALYSES_PER_SECOND, TRACKING_CONFIG, TrackingUtils } from 'src/app/shared/utils';
import { OverlayStoreService } from './overlay-store.service';

const UPPER_RECT: NormalizedRect = { height: 0.05, width: 0.5, x: 0.25, y: 0.2 };
const LOWER_RECT: NormalizedRect = { height: 0.05, width: 0.5, x: 0.25, y: 0.6 };

const DEFAULT_INTERVAL: number = TrackingUtils.analysisIntervalFor(DEFAULT_ANALYSES_PER_SECOND);

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

describe('OverlayStoreService', () => {
    let emissions: OverlayItem[][];
    let service: OverlayStoreService;
    let subscription: Subscription;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(OverlayStoreService);
        emissions = [];
        subscription = service.changes().subscribe((items: OverlayItem[]) => emissions.push(items));
    });

    afterEach(() => {
        subscription.unsubscribe();
    });

    function findItem(regionId: string): OverlayItem | undefined {
        return service.items.find((item: OverlayItem) => item.regionId === regionId);
    }

    function seedTwoRegions(now: number = 0): OverlayItem[] {
        return service.reconcile([createRegion('Daily Specials', UPPER_RECT), createRegion('Chocolate cake', LOWER_RECT)], now);
    }

    it('should retry only failed regions without losing the frame or successful translations', () => {
        const [failed, successful] = seedTwoRegions();
        service.markTranslating([failed.regionId, successful.regionId], 'en');
        service.applyTranslation({ regionId: failed.regionId, textVersion: 1, failed: true, translatedText: '' });
        service.applyTranslation({ regionId: successful.regionId, textVersion: 1, failed: false, translatedText: 'Bolo de chocolate' });
        const ready = findItem(successful.regionId);

        const retried = service.retryFailedTranslations();

        expect(retried).toHaveLength(1);
        expect(retried[0]).toMatchObject({ regionId: failed.regionId, originalText: failed.originalText, anchorRect: failed.anchorRect, status: OverlayStatus.READING, textVersion: 2 });
        expect(findItem(successful.regionId)).toBe(ready);
        service.markTranslating([failed.regionId], 'en');
        expect(service.applyTranslation({ regionId: failed.regionId, textVersion: 1, failed: false, translatedText: 'Stale result' })).toBeNull();
        expect(findItem(failed.regionId)?.status).toBe(OverlayStatus.TRANSLATING);
    });

    it('should start empty and emit the current items on subscription', () => {
        expect(service.items).toEqual([]);
        expect(emissions).toEqual([[]]);
    });

    describe('reconcile', () => {
        it('should drop the items missing from the frame when unseen items are not retained', () => {
            seedTwoRegions(0);

            const pending: OverlayItem[] = service.reconcile([
                createRegion('Daily Specials', UPPER_RECT),
                createRegion('Fresh tomato soup', { ...LOWER_RECT, y: 0.8 }),
            ], 0, false);

            expect(service.items.map((item: OverlayItem) => item.regionId)).toEqual(['region-1', 'region-3']);
            expect(pending.map((item: OverlayItem) => item.regionId)).toEqual(['region-1', 'region-3']);
        });

        it('should assign sequential identifiers and return new regions as pending', () => {
            const pending: OverlayItem[] = seedTwoRegions(100);

            expect(pending.map((item: OverlayItem) => item.regionId)).toEqual(['region-1', 'region-2']);
            expect(pending.every((item: OverlayItem) => item.status === OverlayStatus.READING)).toBe(true);
            expect(service.items.length).toBe(2);
            expect(findItem('region-1')?.originalText).toBe('Daily Specials');
            expect(findItem('region-1')?.firstSeenAt).toBe(100);
            expect(emissions.length).toBe(2);
        });

        it('should never reuse identifiers', () => {
            seedTwoRegions();
            service.clear();

            const pending: OverlayItem[] = service.reconcile([createRegion('Fresh tomato soup', UPPER_RECT)], 10);

            expect(pending[0].regionId).toBe('region-3');
        });

        it('should merge duplicated regions before tracking', () => {
            const pending: OverlayItem[] = service.reconcile(
                [createRegion('Daily Specials', UPPER_RECT), createRegion('Daily Specials', UPPER_RECT)],
                0,
            );

            expect(pending.length).toBe(1);
            expect(service.items.length).toBe(1);
        });

        it('should smooth the anchors of live frames and snap them onto the regions when asked', () => {
            const moved: NormalizedRect = { ...UPPER_RECT, x: UPPER_RECT.x + 0.05, y: UPPER_RECT.y + 0.03 };
            const frozen: NormalizedRect = { ...UPPER_RECT, x: UPPER_RECT.x + 0.08, y: UPPER_RECT.y + 0.04 };

            seedTwoRegions(0);
            service.reconcile([createRegion('Daily Specials', moved)], 100);

            expect(findItem('region-1')?.anchorRect.x).toBeCloseTo(UPPER_RECT.x + 0.05 * TRACKING_CONFIG.smoothingFactor);
            expect(findItem('region-1')?.observedRect).toEqual(moved);

            service.reconcile([createRegion('Daily Specials', frozen)], 200, false, true);

            expect(findItem('region-1')?.anchorRect).toEqual(frozen);
            expect(service.items.map((item: OverlayItem) => item.regionId)).toEqual(['region-1']);
        });

        it('should keep the identifier of a region that is seen again', () => {
            seedTwoRegions(0);
            service.markTranslating(['region-1', 'region-2'], 'en');

            const pending: OverlayItem[] = seedTwoRegions(200);

            expect(pending).toEqual([]);
            expect(service.items.map((item: OverlayItem) => item.regionId).sort()).toEqual(['region-1', 'region-2']);
            expect(findItem('region-1')?.lastSeenAt).toBe(200);
        });
    });

    describe('markTranslating', () => {
        it('should move only READING items to TRANSLATING', () => {
            seedTwoRegions();
            service.markTranslating(['region-1'], 'en');
            service.applyTranslation({ failed: false, regionId: 'region-1', textVersion: 1, translatedText: 'Pratos do dia' });

            service.markTranslating(['region-1', 'region-2'], 'en');

            expect(findItem('region-1')?.status).toBe(OverlayStatus.TRANSLATED);
            expect(findItem('region-2')?.status).toBe(OverlayStatus.TRANSLATING);
        });

        it('should record the source language and return the marked items', () => {
            seedTwoRegions();

            const marked: OverlayItem[] = service.markTranslating(['region-2'], 'de');

            expect(marked.map((item: OverlayItem) => item.regionId)).toEqual(['region-2']);
            expect(marked[0].status).toBe(OverlayStatus.TRANSLATING);
            expect(findItem('region-2')?.sourceLanguage).toBe('de');
            expect(findItem('region-1')?.sourceLanguage).toBeNull();
        });

        it('should not emit when nothing changes', () => {
            seedTwoRegions();
            service.markTranslating(['region-1', 'region-2'], 'en');

            const count: number = emissions.length;

            expect(service.markTranslating(['region-1', 'region-2', 'unknown'], 'en')).toEqual([]);
            expect(emissions.length).toBe(count);
        });
    });

    describe('markSameLanguage', () => {
        it('should show READING items as they are, in the given language, and return them', () => {
            seedTwoRegions();
            service.markTranslating(['region-1'], 'en');

            const marked: OverlayItem[] = service.markSameLanguage(['region-1', 'region-2'], 'pt');

            expect(marked.map((item: OverlayItem) => item.regionId)).toEqual(['region-2']);
            expect(findItem('region-2')?.status).toBe(OverlayStatus.TRANSLATED);
            expect(findItem('region-2')?.sourceLanguage).toBe('pt');
            expect(findItem('region-2')?.translatedText).toBe('Chocolate cake');
            expect(findItem('region-1')?.status).toBe(OverlayStatus.TRANSLATING);
        });

        it('should not emit when nothing changes', () => {
            seedTwoRegions();
            service.markSameLanguage(['region-1', 'region-2'], 'pt');

            const count: number = emissions.length;

            expect(service.markSameLanguage(['region-1', 'region-2', 'unknown'], 'pt')).toEqual([]);
            expect(emissions.length).toBe(count);
        });
    });

    describe('itemsWithStatus', () => {
        it('should list the items in the given status', () => {
            seedTwoRegions();
            service.markTranslating(['region-2'], 'en');

            expect(service.itemsWithStatus(OverlayStatus.TRANSLATING).map((item: OverlayItem) => item.regionId)).toEqual(['region-2']);
            expect(service.itemsWithStatus(OverlayStatus.READING).map((item: OverlayItem) => item.regionId)).toEqual(['region-1']);
            expect(service.itemsWithStatus(OverlayStatus.ERROR)).toEqual([]);
        });
    });

    describe('applyTranslation', () => {
        beforeEach(() => {
            seedTwoRegions();
            service.markTranslating(['region-1', 'region-2'], 'en');
        });

        it('should store successful translations', () => {
            const applied: OverlayItem | null =
                service.applyTranslation({ failed: false, regionId: 'region-1', textVersion: 1, translatedText: 'Pratos do dia' });

            expect(findItem('region-1')?.status).toBe(OverlayStatus.TRANSLATED);
            expect(findItem('region-1')?.translatedText).toBe('Pratos do dia');
            expect(findItem('region-1')?.sourceLanguage).toBe('en');
            expect(findItem('region-2')?.status).toBe(OverlayStatus.TRANSLATING);
            expect(applied).toBe(findItem('region-1'));
        });

        it('should flag failed translations without replacing the translated text', () => {
            service.applyTranslation({ failed: true, regionId: 'region-1', textVersion: 1, translatedText: 'Daily Specials' });

            expect(findItem('region-1')?.status).toBe(OverlayStatus.ERROR);
            expect(findItem('region-1')?.translatedText).toBe(EMPTY);
        });

        it('should ignore results for an outdated text version', () => {
            const count: number = emissions.length;

            expect(service.applyTranslation({ failed: false, regionId: 'region-1', textVersion: 7, translatedText: 'Stale' })).toBeNull();

            expect(findItem('region-1')?.status).toBe(OverlayStatus.TRANSLATING);
            expect(emissions.length).toBe(count);
        });

        it('should ignore results for unknown regions', () => {
            const count: number = emissions.length;

            expect(service.applyTranslation({ failed: false, regionId: 'region-99', textVersion: 1, translatedText: 'Ghost' })).toBeNull();

            expect(emissions.length).toBe(count);
        });

        it('should keep expiring items expiring while storing their translation', () => {
            service.expire(TRACKING_CONFIG.expireAfterMilliseconds, DEFAULT_INTERVAL);

            service.applyTranslation({ failed: false, regionId: 'region-1', textVersion: 1, translatedText: 'Pratos do dia' });

            expect(findItem('region-1')?.status).toBe(OverlayStatus.EXPIRING);
            expect(findItem('region-1')?.translatedText).toBe('Pratos do dia');
        });

        it('should ignore results for items that are waiting for their source language', () => {
            service.resetTranslations();

            const count: number = emissions.length;

            expect(service.applyTranslation({ failed: false, regionId: 'region-1', textVersion: 2, translatedText: 'Pratos do dia' })).toBeNull();

            expect(findItem('region-1')?.status).toBe(OverlayStatus.READING);
            expect(findItem('region-1')?.translatedText).toBe(EMPTY);
            expect(emissions.length).toBe(count);
        });

        it('should keep expiring items expiring when their translation fails', () => {
            service.expire(TRACKING_CONFIG.expireAfterMilliseconds, DEFAULT_INTERVAL);

            service.applyTranslation({ failed: true, regionId: 'region-1', textVersion: 1, translatedText: 'Daily Specials' });

            expect(findItem('region-1')?.status).toBe(OverlayStatus.EXPIRING);
            expect(findItem('region-1')?.translatedText).toBe(EMPTY);
        });
    });

    describe('expire', () => {
        it('should not emit while every item is still fresh', () => {
            seedTwoRegions(0);

            const count: number = emissions.length;

            expect(service.expire(TRACKING_CONFIG.expireAfterMilliseconds - 1, DEFAULT_INTERVAL)).toEqual([]);
            expect(emissions.length).toBe(count);
        });

        it('should mark old items as expiring once', () => {
            seedTwoRegions(0);

            const count: number = emissions.length;

            expect(service.expire(TRACKING_CONFIG.expireAfterMilliseconds, DEFAULT_INTERVAL)).toEqual([]);
            expect(emissions.length).toBe(count + 1);
            expect(service.items.every((item: OverlayItem) => item.status === OverlayStatus.EXPIRING)).toBe(true);

            service.expire(TRACKING_CONFIG.expireAfterMilliseconds + 10, DEFAULT_INTERVAL);

            expect(emissions.length).toBe(count + 1);
        });

        it('should remove items that were not seen for too long and return their identifiers', () => {
            seedTwoRegions(0);

            expect(service.expire(TRACKING_CONFIG.removeAfterMilliseconds, DEFAULT_INTERVAL)).toEqual(['region-1', 'region-2']);
            expect(service.items).toEqual([]);
        });

        it('should return only the identifiers of the removed items', () => {
            seedTwoRegions(0);
            service.reconcile([createRegion('Daily Specials', UPPER_RECT)], TRACKING_CONFIG.expireAfterMilliseconds);

            expect(service.expire(TRACKING_CONFIG.removeAfterMilliseconds, DEFAULT_INTERVAL)).toEqual(['region-2']);
            expect(service.items.map((item: OverlayItem) => item.regionId)).toEqual(['region-1']);
        });

        it('should wait longer before expiring at a slow analysis rate', () => {
            seedTwoRegions(0);

            const slowInterval: number = TrackingUtils.analysisIntervalFor(MIN_ANALYSES_PER_SECOND);

            expect(service.expire(TRACKING_CONFIG.removeAfterMilliseconds, slowInterval)).toEqual([]);
            expect(service.items.every((item: OverlayItem) => item.status !== OverlayStatus.EXPIRING)).toBe(true);
        });

        it('should return no identifiers when there are no items', () => {
            expect(service.expire(TRACKING_CONFIG.removeAfterMilliseconds, DEFAULT_INTERVAL)).toEqual([]);
        });
    });

    describe('resetTranslations', () => {
        beforeEach(() => {
            seedTwoRegions();
            service.markTranslating(['region-1', 'region-2'], 'de');
            service.applyTranslation({ failed: false, regionId: 'region-1', textVersion: 1, translatedText: 'Pratos do dia' });
            service.applyTranslation({ failed: true, regionId: 'region-2', textVersion: 1, translatedText: 'Chocolate cake' });
        });

        it('should forget the source language, translation and failures of every item and mark them as READING', () => {
            const reset: OverlayItem[] = service.resetTranslations();

            expect(reset.map((item: OverlayItem) => item.regionId)).toEqual(['region-1', 'region-2']);
            expect(service.items.every((item: OverlayItem) => item.status === OverlayStatus.READING)).toBe(true);
            expect(service.items.every((item: OverlayItem) => item.sourceLanguage === null)).toBe(true);
            expect(service.items.every((item: OverlayItem) => item.translatedText === EMPTY)).toBe(true);
            expect(service.items.every((item: OverlayItem) => item.failedAttempts === 0 && item.failedAt === null)).toBe(true);
        });

        it('should bump the text version so that results for the previous language are discarded', () => {
            service.resetTranslations();
            service.markTranslating(['region-1'], 'en');

            expect(findItem('region-1')?.textVersion).toBe(2);
            expect(service.applyTranslation({ failed: false, regionId: 'region-1', textVersion: 1, translatedText: 'Pratos do dia' })).toBeNull();
            expect(findItem('region-1')?.translatedText).toBe(EMPTY);
        });

        it('should keep expiring items expiring', () => {
            service.expire(TRACKING_CONFIG.expireAfterMilliseconds, DEFAULT_INTERVAL);

            service.resetTranslations();

            expect(findItem('region-1')?.status).toBe(OverlayStatus.EXPIRING);
            expect(findItem('region-1')?.sourceLanguage).toBeNull();
            expect(findItem('region-1')?.translatedText).toBe(EMPTY);
        });

        it('should not emit when there are no items', () => {
            service.clear();

            const count: number = emissions.length;

            expect(service.resetTranslations()).toEqual([]);
            expect(emissions.length).toBe(count);
        });
    });

    describe('toggleOriginal', () => {
        it('should flip the original text flag of one item', () => {
            seedTwoRegions();

            service.toggleOriginal('region-2');

            expect(findItem('region-2')?.showOriginal).toBe(true);
            expect(findItem('region-1')?.showOriginal).toBe(false);

            service.toggleOriginal('region-2');

            expect(findItem('region-2')?.showOriginal).toBe(false);
        });

        it('should not emit for unknown regions', () => {
            seedTwoRegions();

            const count: number = emissions.length;

            service.toggleOriginal('region-99');

            expect(emissions.length).toBe(count);
        });
    });

    describe('clear', () => {
        it('should remove every item', () => {
            seedTwoRegions();

            service.clear();

            expect(service.items).toEqual([]);
            expect(emissions[emissions.length - 1]).toEqual([]);
        });

        it('should not emit when already empty', () => {
            service.clear();

            expect(emissions.length).toBe(1);
        });
    });
});
