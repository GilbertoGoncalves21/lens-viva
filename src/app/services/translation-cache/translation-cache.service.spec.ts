import { TestBed } from '@angular/core/testing';
import { TRANSLATION_CACHE_CONFIG } from 'src/app/shared/utils';
import { TranslationCacheService } from './translation-cache.service';

describe('TranslationCacheService', () => {
    let service: TranslationCacheService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(TranslationCacheService);
    });

    function fill(count: number, now: number): void {
        for (let index: number = 0; index < count; index++) {
            service.set(`key-${index}`, `value-${index}`, now);
        }
    }

    it('should be created empty', () => {
        expect(service).toBeTruthy();
        expect(service.size).toBe(0);
        expect(service.hitRate).toBe(0);
    });

    it('should return null and count a miss for unknown keys', () => {
        expect(service.get('missing', 0)).toBeNull();
        expect(service.hitRate).toBe(0);
    });

    it('should return stored values and count hits', () => {
        service.set('greeting', 'Olá', 0);

        expect(service.get('greeting', 10)).toBe('Olá');
        expect(service.size).toBe(1);
        expect(service.hitRate).toBe(1);
    });

    it('should compute the hit rate over every lookup', () => {
        service.set('greeting', 'Olá', 0);

        service.get('greeting', 1);
        service.get('greeting', 2);
        service.get('missing', 3);
        service.get('missing', 4);

        expect(service.hitRate).toBe(0.5);
    });

    it('should use the current time by default', () => {
        service.set('greeting', 'Olá');

        expect(service.get('greeting')).toBe('Olá');
    });

    describe('time to live', () => {
        it('should keep entries until the time to live elapses', () => {
            service.set('greeting', 'Olá', 1000);

            expect(service.get('greeting', 1000 + TRANSLATION_CACHE_CONFIG.timeToLiveMilliseconds - 1)).toBe('Olá');
        });

        it('should expire and remove entries once the time to live elapses', () => {
            service.set('greeting', 'Olá', 1000);

            expect(service.get('greeting', 1000 + TRANSLATION_CACHE_CONFIG.timeToLiveMilliseconds)).toBeNull();
            expect(service.size).toBe(0);
            expect(service.hitRate).toBe(0);
        });

        it('should renew the time to live when a key is set again', () => {
            service.set('greeting', 'Olá', 0);
            service.set('greeting', 'Oi', TRANSLATION_CACHE_CONFIG.timeToLiveMilliseconds - 1);

            expect(service.get('greeting', TRANSLATION_CACHE_CONFIG.timeToLiveMilliseconds + 10)).toBe('Oi');
            expect(service.size).toBe(1);
        });
    });

    describe('least recently used eviction', () => {
        it('should never exceed the maximum number of entries', () => {
            fill(TRANSLATION_CACHE_CONFIG.maxEntries + 5, 0);

            expect(service.size).toBe(TRANSLATION_CACHE_CONFIG.maxEntries);
        });

        it('should evict the oldest entry first', () => {
            fill(TRANSLATION_CACHE_CONFIG.maxEntries, 0);
            service.set('newest', 'value', 0);

            expect(service.get('key-0', 1)).toBeNull();
            expect(service.get('key-1', 1)).toBe('value-1');
            expect(service.get('newest', 1)).toBe('value');
        });

        it('should keep recently read entries', () => {
            fill(TRANSLATION_CACHE_CONFIG.maxEntries, 0);

            expect(service.get('key-0', 1)).toBe('value-0');

            service.set('newest', 'value', 2);

            expect(service.get('key-0', 3)).toBe('value-0');
            expect(service.get('key-1', 3)).toBeNull();
        });

        it('should treat rewritten entries as recently used', () => {
            fill(TRANSLATION_CACHE_CONFIG.maxEntries, 0);
            service.set('key-0', 'rewritten', 1);
            service.set('newest', 'value', 2);

            expect(service.get('key-0', 3)).toBe('rewritten');
            expect(service.get('key-1', 3)).toBeNull();
        });
    });

    it('should clear entries and statistics', () => {
        service.set('greeting', 'Olá', 0);
        service.get('greeting', 1);
        service.get('missing', 1);

        service.clear();

        expect(service.size).toBe(0);
        expect(service.hitRate).toBe(0);
        expect(service.get('greeting', 2)).toBeNull();
    });
});
