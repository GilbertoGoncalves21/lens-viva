import { OnlineTranslationService } from '../online-translation/online-translation.service';
import { TestBed } from '@angular/core/testing';
import { Subscription } from 'rxjs';
import type { Mock } from 'vitest';
import { LanguagePair, TranslationRequest, TranslationResult } from 'src/app/shared/models';
import { TRANSLATION_QUEUE_CONCURRENCY, TranslationKeyUtils } from 'src/app/shared/utils';
import { environment } from 'src/environments/environment';
import { LensEngineService } from '../lens-engine/lens-engine.service';
import { LoggerService } from '../logger/logger.service';
import { TranslationCacheService } from '../translation-cache/translation-cache.service';
import { TranslationQueueService } from './translation-queue.service';

interface Deferred<T> {
    promise: Promise<T>;
    reject: (reason: unknown) => void;
    resolve: (value: T) => void;
}

interface LensEngineServiceStub {
    translate: Mock<(text: string, languagePair: LanguagePair) => Promise<string>>;
}

interface LoggerServiceStub {
    debug: Mock<(event: string) => void>;
    error: Mock<(event: string, error: unknown) => void>;
}

const LANGUAGE_PAIR: LanguagePair = { sourceLanguage: 'en', targetLanguage: 'pt' };

function createDeferred<T>(): Deferred<T> {
    let resolve: (value: T) => void = (): void => undefined;
    let reject: (reason: unknown) => void = (): void => undefined;
    const promise: Promise<T> = new Promise<T>((resolvePromise: (value: T) => void, rejectPromise: (reason: unknown) => void) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return { promise: promise, reject: reject, resolve: resolve };
}

function createRequest(regionId: string, text: string, textVersion: number = 1): TranslationRequest {
    return { languagePair: LANGUAGE_PAIR, regionId: regionId, text: text, textVersion: textVersion };
}

function flushPromises(): Promise<void> {
    return new Promise<void>((resolve: () => void) => setTimeout(resolve, 0));
}

describe('TranslationQueueService', () => {
    let deferredTranslations: Deferred<string>[];
    let lensEngineServiceStub: LensEngineServiceStub;
    let loggerServiceStub: LoggerServiceStub;
    let results: TranslationResult[];
    let service: TranslationQueueService;
    let subscription: Subscription;
    let translationCacheService: TranslationCacheService;
    let onlineStub: { available: boolean; cacheIdentity: string; translate: Mock<(request: TranslationRequest) => Promise<string>> };

    beforeEach(() => {
        deferredTranslations = [];
        onlineStub = { available: false, cacheIdentity: 'https://translator.example/translate', translate: vi.fn(async () => 'Tudo acontece por um motivo.') };
        lensEngineServiceStub = {
            translate: vi.fn((): Promise<string> => {
                const deferred: Deferred<string> = createDeferred<string>();
                deferredTranslations.push(deferred);

                return deferred.promise;
            }),
        };
        loggerServiceStub = { debug: vi.fn(), error: vi.fn() };

        TestBed.configureTestingModule({
            providers: [
                { provide: LensEngineService, useValue: lensEngineServiceStub },
                { provide: LoggerService, useValue: loggerServiceStub },
                { provide: OnlineTranslationService, useValue: onlineStub },
            ],
        });
        service = TestBed.inject(TranslationQueueService);
        translationCacheService = TestBed.inject(TranslationCacheService);
        results = [];
        subscription = service.results().subscribe((result: TranslationResult) => results.push(result));
    });

    afterEach(() => {
        subscription.unsubscribe();
    });

    function translatedTexts(): string[] {
        return lensEngineServiceStub.translate.mock.calls.map((call: [string, LanguagePair]) => call[0]);
    }

    it('should keep queued local work in its original provider and cache namespace after connectivity changes', async () => {
        service.enqueue(createRequest('busy-1', 'First'));
        service.enqueue(createRequest('busy-2', 'Second'));
        service.enqueue(createRequest('queued', 'Third'));
        onlineStub.available = true;
        deferredTranslations[0].resolve('Primeiro');
        await flushPromises();
        expect(lensEngineServiceStub.translate).toHaveBeenCalledWith('Third', LANGUAGE_PAIR);
        expect(onlineStub.translate).not.toHaveBeenCalled();
        deferredTranslations[2].resolve('Terceiro');
        await flushPromises();
        service.enqueue(createRequest('new-online', 'Third'));
        await flushPromises();
        expect(onlineStub.translate).toHaveBeenCalledTimes(1);
    });

    it('should reject queued work when the online endpoint changes rather than send it to a different server', async () => {
        onlineStub.available = true;
        const busy = createDeferred<string>();
        onlineStub.translate.mockImplementation(() => busy.promise);
        service.enqueue(createRequest('busy-1', 'First'));
        service.enqueue(createRequest('busy-2', 'Second'));
        service.enqueue(createRequest('queued', 'Third'));
        onlineStub.cacheIdentity = 'https://different.example/translate';
        busy.resolve('Pronto');
        await flushPromises();
        expect(onlineStub.translate).toHaveBeenCalledTimes(2);
        expect(results).toContainEqual(expect.objectContaining({ regionId: 'queued', failed: true }));
        expect(service.activeCount).toBe(0);
    });

    it('should prefer whole-sentence online translation over the local engine and glossary', async () => {
        onlineStub.available = true;
        const request = { ...createRequest('sentence', 'Everything happens for a reason.'), contextText: 'A motivational quote' };
        service.enqueue(request);
        await flushPromises();
        expect(onlineStub.translate).toHaveBeenCalledWith(request);
        expect(lensEngineServiceStub.translate).not.toHaveBeenCalled();
        expect(results[0].translatedText).toBe('Tudo acontece por um motivo.');
    });

    it('should not reuse an online translation across different sentence contexts', async () => {
        onlineStub.available = true;
        service.enqueue({ ...createRequest('one', 'bank'), contextText: 'a financial institution' });
        await flushPromises();
        service.enqueue({ ...createRequest('two', 'bank'), contextText: 'by the river' });
        await flushPromises();
        expect(onlineStub.translate).toHaveBeenCalledTimes(2);
    });

    it('should use the culinary meaning only when the request has menu context', async () => {
        service.enqueue({ ...createRequest('drink', 'Sake'), context: 'menu' });
        await flushPromises();
        expect(results[0].translatedText).toBe('Saquê');
        expect(lensEngineServiceStub.translate).not.toHaveBeenCalled();

        service.enqueue(createRequest('ordinary', 'Sake'));
        expect(lensEngineServiceStub.translate).toHaveBeenCalledWith('Sake', LANGUAGE_PAIR);
        deferredTranslations[0].resolve('Causa');
        await flushPromises();
        expect(results[1].translatedText).toBe('Causa');
    });

    it('should ignore a cached generic translation of a menu term', async () => {
        service.enqueue(createRequest('generic', 'Sides'));
        deferredTranslations[0].resolve('Os lados');
        await flushPromises();
        service.enqueue({ ...createRequest('menu', 'Sides'), context: 'menu' });
        await flushPromises();
        expect(results[1].translatedText).toBe('Acompanhamentos');
    });

    it('should be created idle', () => {
        expect(service).toBeTruthy();
        expect(service.activeCount).toBe(0);
        expect(service.pendingCount).toBe(0);
    });

    it('should translate a request through the engine and emit the result', async () => {
        service.enqueue(createRequest('region-1', 'Daily Specials'));

        expect(lensEngineServiceStub.translate).toHaveBeenCalledWith('Daily Specials', LANGUAGE_PAIR);
        expect(service.activeCount).toBe(1);

        deferredTranslations[0].resolve('Pratos do dia');
        await flushPromises();

        expect(results).toEqual([{ failed: false, regionId: 'region-1', textVersion: 1, translatedText: 'Pratos do dia' }]);
        expect(service.activeCount).toBe(0);
        expect(loggerServiceStub.debug).toHaveBeenCalledWith('translation-completed', expect.objectContaining({ durationMilliseconds: expect.any(Number) }));
    });

    it('should cache successful translations', async () => {
        service.enqueue(createRequest('region-1', 'Daily Specials'));
        deferredTranslations[0].resolve('Pratos do dia');
        await flushPromises();

        const key: string = TranslationKeyUtils.build('Daily Specials', LANGUAGE_PAIR, environment.engineVersion);

        expect(translationCacheService.get(key)).toBe('Pratos do dia');
    });

    it('should emit cache hits synchronously without calling the engine', () => {
        translationCacheService.set(TranslationKeyUtils.build('Daily Specials', LANGUAGE_PAIR, environment.engineVersion), 'Pratos do dia');

        service.enqueue(createRequest('region-7', 'Daily Specials', 3));

        expect(results).toEqual([{ failed: false, regionId: 'region-7', textVersion: 3, translatedText: 'Pratos do dia' }]);
        expect(lensEngineServiceStub.translate).not.toHaveBeenCalled();
        expect(service.activeCount).toBe(0);
    });

    it('should reuse a previous translation for the same text in another region', async () => {
        service.enqueue(createRequest('region-1', 'Daily Specials'));
        deferredTranslations[0].resolve('Pratos do dia');
        await flushPromises();

        service.enqueue(createRequest('region-2', 'Daily   Specials'));

        expect(lensEngineServiceStub.translate).toHaveBeenCalledTimes(1);
        expect(results[1]).toEqual({ failed: false, regionId: 'region-2', textVersion: 1, translatedText: 'Pratos do dia' });
    });

    it('should respect the concurrency limit', async () => {
        const total: number = TRANSLATION_QUEUE_CONCURRENCY + 2;

        for (let index: number = 0; index < total; index++) {
            service.enqueue(createRequest(`region-${index}`, `Text number ${index}`));
        }

        expect(lensEngineServiceStub.translate).toHaveBeenCalledTimes(TRANSLATION_QUEUE_CONCURRENCY);
        expect(service.activeCount).toBe(TRANSLATION_QUEUE_CONCURRENCY);
        expect(service.pendingCount).toBe(2);

        deferredTranslations[0].resolve('first');
        await flushPromises();

        expect(lensEngineServiceStub.translate).toHaveBeenCalledTimes(TRANSLATION_QUEUE_CONCURRENCY + 1);
        expect(service.activeCount).toBe(TRANSLATION_QUEUE_CONCURRENCY);
        expect(service.pendingCount).toBe(1);

        deferredTranslations.forEach((deferred: Deferred<string>) => deferred.resolve('done'));
        await flushPromises();
        deferredTranslations.forEach((deferred: Deferred<string>) => deferred.resolve('done'));
        await flushPromises();

        expect(lensEngineServiceStub.translate).toHaveBeenCalledTimes(total);
        expect(service.activeCount).toBe(0);
        expect(service.pendingCount).toBe(0);
        expect(results.length).toBe(total);
    });

    it('should replace a pending request with a newer one for the same region', async () => {
        for (let index: number = 0; index < TRANSLATION_QUEUE_CONCURRENCY; index++) {
            service.enqueue(createRequest(`busy-${index}`, `Busy text ${index}`));
        }

        service.enqueue(createRequest('region-1', 'Fresh tomato', 1));
        service.enqueue(createRequest('region-1', 'Fresh tomato soup', 2));

        expect(service.pendingCount).toBe(1);

        deferredTranslations[0].resolve('busy');
        await flushPromises();

        expect(translatedTexts()).toContain('Fresh tomato soup');
        expect(translatedTexts()).not.toContain('Fresh tomato');

        deferredTranslations[TRANSLATION_QUEUE_CONCURRENCY].resolve('Sopa de tomate fresca');
        await flushPromises();

        expect(results).toContainEqual({ failed: false, regionId: 'region-1', textVersion: 2, translatedText: 'Sopa de tomate fresca' });
    });

    it('should drop a pending request when a newer version of the region is served from the cache', () => {
        translationCacheService.set(TranslationKeyUtils.build('Chocolate cake', LANGUAGE_PAIR, environment.engineVersion), 'Bolo de chocolate');

        for (let index: number = 0; index < TRANSLATION_QUEUE_CONCURRENCY; index++) {
            service.enqueue(createRequest(`busy-${index}`, `Busy text ${index}`));
        }

        service.enqueue(createRequest('region-1', 'Chocolate', 1));
        service.enqueue(createRequest('region-1', 'Chocolate cake', 2));

        expect(service.pendingCount).toBe(0);
        expect(results).toEqual([{ failed: false, regionId: 'region-1', textVersion: 2, translatedText: 'Bolo de chocolate' }]);
    });

    describe('cancel', () => {
        it('should drop the pending requests of the given regions', async () => {
            for (let index: number = 0; index < TRANSLATION_QUEUE_CONCURRENCY; index++) {
                service.enqueue(createRequest(`busy-${index}`, `Busy text ${index}`));
            }

            service.enqueue(createRequest('region-1', 'Daily Specials'));
            service.enqueue(createRequest('region-2', 'Chocolate cake'));

            service.cancel(['region-1', 'unknown']);

            expect(service.pendingCount).toBe(1);

            deferredTranslations.forEach((deferred: Deferred<string>) => deferred.resolve('busy'));
            await flushPromises();
            deferredTranslations[TRANSLATION_QUEUE_CONCURRENCY].resolve('Bolo de chocolate');
            await flushPromises();

            expect(translatedTexts()).not.toContain('Daily Specials');
            expect(translatedTexts()).toContain('Chocolate cake');
            expect(results.some((result: TranslationResult) => result.regionId === 'region-1')).toBe(false);
            expect(results).toContainEqual({ failed: false, regionId: 'region-2', textVersion: 1, translatedText: 'Bolo de chocolate' });
            expect(service.pendingCount).toBe(0);
        });

        it('should leave in-flight requests untouched', async () => {
            service.enqueue(createRequest('region-1', 'Daily Specials'));

            service.cancel(['region-1']);
            deferredTranslations[0].resolve('Pratos do dia');
            await flushPromises();

            expect(results).toEqual([{ failed: false, regionId: 'region-1', textVersion: 1, translatedText: 'Pratos do dia' }]);
        });
    });

    describe('in-flight sharing', () => {
        it('should share one engine call between regions with the same text', async () => {
            service.enqueue(createRequest('region-1', 'Daily Specials', 1));
            service.enqueue(createRequest('region-2', 'Daily   Specials', 4));

            expect(lensEngineServiceStub.translate).toHaveBeenCalledTimes(1);
            expect(service.activeCount).toBe(1);
            expect(service.pendingCount).toBe(0);

            deferredTranslations[0].resolve('Pratos do dia');
            await flushPromises();

            expect(results).toEqual([
                { failed: false, regionId: 'region-1', textVersion: 1, translatedText: 'Pratos do dia' },
                { failed: false, regionId: 'region-2', textVersion: 4, translatedText: 'Pratos do dia' },
            ]);
            expect(service.activeCount).toBe(0);
        });

        it('should attach a request to an in-flight translation without using a concurrency slot', async () => {
            for (let index: number = 0; index < TRANSLATION_QUEUE_CONCURRENCY; index++) {
                service.enqueue(createRequest(`region-${index}`, `Text number ${index}`));
            }

            service.enqueue(createRequest('region-copy', 'Text number 0'));

            expect(lensEngineServiceStub.translate).toHaveBeenCalledTimes(TRANSLATION_QUEUE_CONCURRENCY);
            expect(service.pendingCount).toBe(0);

            deferredTranslations[0].resolve('Texto número 0');
            await flushPromises();

            expect(results).toContainEqual({ failed: false, regionId: 'region-0', textVersion: 1, translatedText: 'Texto número 0' });
            expect(results).toContainEqual({ failed: false, regionId: 'region-copy', textVersion: 1, translatedText: 'Texto número 0' });
        });

        it('should start one engine call for pending requests that share a text', async () => {
            for (let index: number = 0; index < TRANSLATION_QUEUE_CONCURRENCY; index++) {
                service.enqueue(createRequest(`busy-${index}`, `Busy text ${index}`));
            }

            service.enqueue(createRequest('region-1', 'Daily Specials'));
            service.enqueue(createRequest('region-2', 'Daily Specials'));

            expect(service.pendingCount).toBe(2);

            deferredTranslations[0].resolve('busy');
            await flushPromises();

            expect(lensEngineServiceStub.translate).toHaveBeenCalledTimes(TRANSLATION_QUEUE_CONCURRENCY + 1);
            expect(service.pendingCount).toBe(0);

            deferredTranslations[TRANSLATION_QUEUE_CONCURRENCY].resolve('Pratos do dia');
            await flushPromises();

            expect(results).toContainEqual({ failed: false, regionId: 'region-1', textVersion: 1, translatedText: 'Pratos do dia' });
            expect(results).toContainEqual({ failed: false, regionId: 'region-2', textVersion: 1, translatedText: 'Pratos do dia' });
        });

        it('should report a shared failure to every waiting region with its own text', async () => {
            service.enqueue(createRequest('region-1', 'Daily Specials', 1));
            service.enqueue(createRequest('region-2', '  Daily  Specials ', 2));

            deferredTranslations[0].reject(new Error('model missing'));
            await flushPromises();

            expect(results).toEqual([
                { failed: true, regionId: 'region-1', textVersion: 1, translatedText: 'Daily Specials' },
                { failed: true, regionId: 'region-2', textVersion: 2, translatedText: '  Daily  Specials ' },
            ]);
            expect(service.activeCount).toBe(0);
        });

        it('should call the engine again once the shared translation has settled', async () => {
            service.enqueue(createRequest('region-1', 'Daily Specials'));
            deferredTranslations[0].reject(new Error('model missing'));
            await flushPromises();

            service.enqueue(createRequest('region-2', 'Daily Specials'));

            expect(lensEngineServiceStub.translate).toHaveBeenCalledTimes(2);
        });

        it('should let a request enqueued after a clear reuse a translation still in flight', async () => {
            service.enqueue(createRequest('region-1', 'Daily Specials'));
            service.clear();
            service.enqueue(createRequest('region-2', 'Daily Specials'));

            deferredTranslations[0].resolve('Pratos do dia');
            await flushPromises();

            const key: string = TranslationKeyUtils.build('Daily Specials', LANGUAGE_PAIR, environment.engineVersion);

            expect(lensEngineServiceStub.translate).toHaveBeenCalledTimes(1);
            expect(results).toEqual([{ failed: false, regionId: 'region-2', textVersion: 1, translatedText: 'Pratos do dia' }]);
            expect(translationCacheService.get(key)).toBe('Pratos do dia');
        });
    });

    it('should discard pending requests and in-flight results when cleared', async () => {
        for (let index: number = 0; index < TRANSLATION_QUEUE_CONCURRENCY + 1; index++) {
            service.enqueue(createRequest(`region-${index}`, `Text number ${index}`));
        }

        service.clear();

        expect(service.pendingCount).toBe(0);

        deferredTranslations.forEach((deferred: Deferred<string>) => deferred.resolve('late'));
        await flushPromises();

        expect(results).toEqual([]);
        expect(translationCacheService.size).toBe(0);
        expect(service.activeCount).toBe(0);
        expect(lensEngineServiceStub.translate).toHaveBeenCalledTimes(TRANSLATION_QUEUE_CONCURRENCY);
    });

    it('should discard in-flight failures when cleared', async () => {
        service.enqueue(createRequest('region-1', 'Daily Specials'));
        service.clear();

        deferredTranslations[0].reject(new Error('engine stopped'));
        await flushPromises();

        expect(results).toEqual([]);
        expect(loggerServiceStub.error).not.toHaveBeenCalled();
    });

    it('should keep translating requests enqueued after a clear', async () => {
        service.enqueue(createRequest('region-1', 'Daily Specials'));
        service.clear();
        service.enqueue(createRequest('region-2', 'Chocolate cake'));

        deferredTranslations[0].resolve('stale');
        deferredTranslations[1].resolve('Bolo de chocolate');
        await flushPromises();

        expect(results).toEqual([{ failed: false, regionId: 'region-2', textVersion: 1, translatedText: 'Bolo de chocolate' }]);
    });

    it('should emit a failed result with the original text when the engine fails', async () => {
        service.enqueue(createRequest('region-1', 'Daily Specials', 2));

        deferredTranslations[0].reject(new Error('model missing'));
        await flushPromises();

        expect(results).toEqual([{ failed: true, regionId: 'region-1', textVersion: 2, translatedText: 'Daily Specials' }]);
        expect(loggerServiceStub.error).toHaveBeenCalledWith('translation-failed', expect.any(Error));
        expect(translationCacheService.size).toBe(0);
        expect(service.activeCount).toBe(0);
    });

    it('should keep draining when the engine throws synchronously', async () => {
        lensEngineServiceStub.translate.mockImplementationOnce((): Promise<string> => {
            throw new Error('plugin unavailable');
        });

        service.enqueue(createRequest('region-1', 'Daily Specials'));
        await flushPromises();

        expect(results).toEqual([{ failed: true, regionId: 'region-1', textVersion: 1, translatedText: 'Daily Specials' }]);
        expect(service.activeCount).toBe(0);

        service.enqueue(createRequest('region-2', 'Chocolate cake'));

        expect(lensEngineServiceStub.translate).toHaveBeenCalledTimes(2);
    });
});
