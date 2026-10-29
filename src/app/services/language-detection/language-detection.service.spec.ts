import { TestBed } from '@angular/core/testing';
import type { Mock } from 'vitest';
import { IdentifyLanguageResponse, LanguageDetection } from 'src/app/shared/models';
import { LANGUAGE_DETECTION_CONFIG, UNDETERMINED_LANGUAGE } from 'src/app/shared/utils';
import { LensEngineService } from '../lens-engine/lens-engine.service';
import { LoggerService } from '../logger/logger.service';
import { LanguageDetectionService } from './language-detection.service';

interface Deferred<T> {
    promise: Promise<T>;
    reject: (reason: unknown) => void;
    resolve: (value: T) => void;
}

interface LensEngineServiceStub {
    identifyLanguage: Mock<(text: string) => Promise<IdentifyLanguageResponse>>;
}

interface LoggerServiceStub {
    error: Mock<(event: string, error: unknown) => void>;
}

interface ServiceInternals {
    _cache: Map<string, LanguageDetection>;
}

const UNDETERMINED_RESPONSE: IdentifyLanguageResponse = { confidence: 0, language: UNDETERMINED_LANGUAGE };

const KNOWN_RESPONSES: Record<string, IdentifyLanguageResponse> = {
    'Chocolate cake': { confidence: 0.92, language: 'en' },
    'Daily Specials': { confidence: 0.92, language: 'en' },
    'Fresh tomato soup': { confidence: 0.92, language: 'en' },
    'Menú del día': { confidence: 0.9, language: 'es' },
    'Pollo a la parrilla': { confidence: 0.88, language: 'es' },
    'Sopa de tomate': { confidence: 0.86, language: 'es' },
    'Tarta de queso': { confidence: 0.87, language: 'es' },
};

function createDeferred<T>(): Deferred<T> {
    let resolve: (value: T) => void = (): void => undefined;
    let reject: (reason: unknown) => void = (): void => undefined;
    const promise: Promise<T> = new Promise<T>((resolvePromise: (value: T) => void, rejectPromise: (reason: unknown) => void) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return { promise: promise, reject: reject, resolve: resolve };
}

describe('LanguageDetectionService', () => {
    let lensEngineServiceStub: LensEngineServiceStub;
    let loggerServiceStub: LoggerServiceStub;
    let service: LanguageDetectionService;

    beforeEach(() => {
        lensEngineServiceStub = {
            identifyLanguage: vi.fn(async (text: string): Promise<IdentifyLanguageResponse> => KNOWN_RESPONSES[text] ?? UNDETERMINED_RESPONSE),
        };
        loggerServiceStub = { error: vi.fn() };

        TestBed.configureTestingModule({
            providers: [
                { provide: LensEngineService, useValue: lensEngineServiceStub },
                { provide: LoggerService, useValue: loggerServiceStub },
            ],
        });
        service = TestBed.inject(LanguageDetectionService);
    });

    function respondWith(response: IdentifyLanguageResponse): void {
        lensEngineServiceStub.identifyLanguage.mockResolvedValue(response);
    }

    function cacheKeys(): string[] {
        return [...(service as unknown as ServiceInternals)._cache.keys()];
    }

    it('should start with an empty cache', () => {
        expect(service.cacheSize).toBe(0);
    });

    describe('detect', () => {
        it('should report a reliable detection for a Latin language with enough confidence', async () => {
            const detection: LanguageDetection = await service.detect('Menú del día');

            expect(detection).toEqual({ confidence: 0.9, language: 'es', reliable: true });
            expect(lensEngineServiceStub.identifyLanguage).toHaveBeenCalledWith('Menú del día');
        });

        it('should send the normalized text to the engine', async () => {
            await service.detect('  Menú \n del   día ');

            expect(lensEngineServiceStub.identifyLanguage).toHaveBeenCalledWith('Menú del día');
        });

        it('should keep the language but flag low confidence detections as unreliable', async () => {
            respondWith({ confidence: LANGUAGE_DETECTION_CONFIG.minConfidence - 0.01, language: 'pt' });

            await expect(service.detect('Prato do dia')).resolves.toEqual({
                confidence: LANGUAGE_DETECTION_CONFIG.minConfidence - 0.01,
                language: 'pt',
                reliable: false,
            });
        });

        it('should accept a detection exactly at the minimum confidence', async () => {
            respondWith({ confidence: LANGUAGE_DETECTION_CONFIG.minConfidence, language: 'fr' });

            const detection: LanguageDetection = await service.detect('Plat du jour');

            expect(detection.reliable).toBe(true);
        });

        it('should flag languages that the OCR cannot read as unreliable', async () => {
            respondWith({ confidence: 0.99, language: 'ru' });

            await expect(service.detect('Romanized words')).resolves.toEqual({ confidence: 0.99, language: 'ru', reliable: false });
        });

        it('should treat romanized non-Latin languages as unreliable', async () => {
            respondWith({ confidence: 0.95, language: 'ja-Latn' });

            await expect(service.detect('Konnichiwa minasan')).resolves.toEqual({ confidence: 0.95, language: 'ja', reliable: false });
        });

        it('should map the undetermined code to no language', async () => {
            await expect(service.detect('Qwrtzp xkcd')).resolves.toEqual({ confidence: 0, language: null, reliable: false });
        });

        it('should map unsupported languages to no language', async () => {
            respondWith({ confidence: 0.97, language: 'xx' });

            await expect(service.detect('Unknown words')).resolves.toEqual({ confidence: 0.97, language: null, reliable: false });
        });

        it('should reduce region subtags and aliases to supported languages', async () => {
            respondWith({ confidence: 0.9, language: 'pt-BR' });
            await expect(service.detect('Prato do dia')).resolves.toEqual({ confidence: 0.9, language: 'pt', reliable: true });

            respondWith({ confidence: 0.9, language: 'nb' });
            await expect(service.detect('Dagens rett')).resolves.toEqual({ confidence: 0.9, language: 'no', reliable: true });

            respondWith({ confidence: 0.9, language: 'FIL' });
            await expect(service.detect('Pagkain ngayon')).resolves.toEqual({ confidence: 0.9, language: 'tl', reliable: true });
        });

        it('should clamp out of range confidences', async () => {
            respondWith({ confidence: 92, language: 'en' });
            await expect(service.detect('Daily menu')).resolves.toEqual({ confidence: 1, language: 'en', reliable: true });

            respondWith({ confidence: -1, language: 'en' });
            await expect(service.detect('Weekly menu')).resolves.toEqual({ confidence: 0, language: 'en', reliable: false });

            respondWith({ confidence: Number.NaN, language: 'en' });
            await expect(service.detect('Monthly menu')).resolves.toEqual({ confidence: 0, language: 'en', reliable: false });
        });

        it('should handle malformed engine responses as undetermined without logging', async () => {
            lensEngineServiceStub.identifyLanguage.mockResolvedValueOnce(null as unknown as IdentifyLanguageResponse);
            await expect(service.detect('First words')).resolves.toEqual({ confidence: 0, language: null, reliable: false });

            lensEngineServiceStub.identifyLanguage.mockResolvedValueOnce({} as IdentifyLanguageResponse);
            await expect(service.detect('Second words')).resolves.toEqual({ confidence: 0, language: null, reliable: false });

            lensEngineServiceStub.identifyLanguage.mockResolvedValueOnce({ confidence: '0.9', language: 7 } as unknown as IdentifyLanguageResponse);
            await expect(service.detect('Third words')).resolves.toEqual({ confidence: 0, language: null, reliable: false });

            expect(loggerServiceStub.error).not.toHaveBeenCalled();
        });

        it('should not call the engine for texts with too few letters', async () => {
            await expect(service.detect('12,50 €')).resolves.toEqual({ confidence: 0, language: null, reliable: false });
            await expect(service.detect('Bar')).resolves.toEqual({ confidence: 0, language: null, reliable: false });
            await expect(service.detect('1 a 2 b 3 c')).resolves.toEqual({ confidence: 0, language: null, reliable: false });

            expect(lensEngineServiceStub.identifyLanguage).not.toHaveBeenCalled();
            expect(service.cacheSize).toBe(0);
        });

        it('should count accented and composed letters as single letters', async () => {
            await service.detect('Ñoño');
            await service.detect('Café');

            expect(lensEngineServiceStub.identifyLanguage).toHaveBeenCalledTimes(2);
            expect(lensEngineServiceStub.identifyLanguage).toHaveBeenLastCalledWith('Café');
        });

        it('should handle missing text as undetermined', async () => {
            await expect(service.detect(null as unknown as string)).resolves.toEqual({ confidence: 0, language: null, reliable: false });

            expect(lensEngineServiceStub.identifyLanguage).not.toHaveBeenCalled();
        });

        describe('cache', () => {
            it('should reuse cached detections', async () => {
                await service.detect('Menú del día');
                const detection: LanguageDetection = await service.detect('Menú del día');

                expect(detection).toEqual({ confidence: 0.9, language: 'es', reliable: true });
                expect(lensEngineServiceStub.identifyLanguage).toHaveBeenCalledTimes(1);
                expect(service.cacheSize).toBe(1);
            });

            it('should share the cache across case and spacing variants', async () => {
                await service.detect('Menú del día');
                await service.detect('  MENÚ   DEL DÍA ');

                expect(lensEngineServiceStub.identifyLanguage).toHaveBeenCalledTimes(1);
            });

            it('should cache undetermined engine answers', async () => {
                await service.detect('Qwrtzp xkcd');
                await service.detect('Qwrtzp xkcd');

                expect(lensEngineServiceStub.identifyLanguage).toHaveBeenCalledTimes(1);
                expect(service.cacheSize).toBe(1);
            });

            it('should key the cache by a hash instead of the text', async () => {
                await service.detect('Menú del día');
                await service.detect('Daily Specials');

                expect(cacheKeys().length).toBe(2);
                cacheKeys().forEach((key: string) => {
                    expect(key).toMatch(/^[0-9a-f]{8}:\d+$/);
                    expect(key.toLowerCase()).not.toContain('men');
                    expect(key.toLowerCase()).not.toContain('daily');
                });
            });

            it('should return copies that cannot corrupt the cache', async () => {
                const first: LanguageDetection = await service.detect('Menú del día');

                first.language = 'fr';
                first.reliable = false;

                await expect(service.detect('Menú del día')).resolves.toEqual({ confidence: 0.9, language: 'es', reliable: true });
            });

            it('should evict the least recently used detection beyond the limit', async () => {
                await service.detect('Menú del día');
                await service.detect('Daily Specials');

                for (let index: number = 0; index < LANGUAGE_DETECTION_CONFIG.cacheMaxEntries - 1; index++) {
                    await service.detect(`Filler text ${index}`);
                }

                expect(service.cacheSize).toBe(LANGUAGE_DETECTION_CONFIG.cacheMaxEntries);
                lensEngineServiceStub.identifyLanguage.mockClear();

                await service.detect('Daily Specials');
                await service.detect('Menú del día');

                expect(lensEngineServiceStub.identifyLanguage).toHaveBeenCalledTimes(1);
                expect(lensEngineServiceStub.identifyLanguage).toHaveBeenCalledWith('Menú del día');
            });

            it('should refresh the recency of a cache hit', async () => {
                await service.detect('Menú del día');
                await service.detect('Daily Specials');

                for (let index: number = 0; index < LANGUAGE_DETECTION_CONFIG.cacheMaxEntries - 2; index++) {
                    await service.detect(`Filler text ${index}`);
                }

                await service.detect('Menú del día');
                await service.detect('One more filler');
                lensEngineServiceStub.identifyLanguage.mockClear();

                await service.detect('Menú del día');
                await service.detect('Daily Specials');

                expect(lensEngineServiceStub.identifyLanguage).toHaveBeenCalledTimes(1);
                expect(lensEngineServiceStub.identifyLanguage).toHaveBeenCalledWith('Daily Specials');
            });

            it('should empty the cache on clearCache', async () => {
                await service.detect('Menú del día');

                service.clearCache();

                expect(service.cacheSize).toBe(0);

                await service.detect('Menú del día');

                expect(lensEngineServiceStub.identifyLanguage).toHaveBeenCalledTimes(2);
            });

            it('should not cache a detection that finishes after clearCache', async () => {
                const pending: Deferred<IdentifyLanguageResponse> = createDeferred<IdentifyLanguageResponse>();
                lensEngineServiceStub.identifyLanguage.mockReturnValueOnce(pending.promise);

                const detecting: Promise<LanguageDetection> = service.detect('Menú del día');

                service.clearCache();
                pending.resolve({ confidence: 0.9, language: 'es' });

                await expect(detecting).resolves.toEqual({ confidence: 0.9, language: 'es', reliable: true });
                expect(service.cacheSize).toBe(0);
            });
        });

        describe('in-flight requests', () => {
            it('should share one engine call between concurrent detections of the same text', async () => {
                const pending: Deferred<IdentifyLanguageResponse> = createDeferred<IdentifyLanguageResponse>();
                lensEngineServiceStub.identifyLanguage.mockReturnValueOnce(pending.promise);

                const first: Promise<LanguageDetection> = service.detect('Menú del día');
                const second: Promise<LanguageDetection> = service.detect('menú del día');

                pending.resolve({ confidence: 0.9, language: 'es' });

                await expect(first).resolves.toEqual({ confidence: 0.9, language: 'es', reliable: true });
                await expect(second).resolves.toEqual({ confidence: 0.9, language: 'es', reliable: true });
                expect(lensEngineServiceStub.identifyLanguage).toHaveBeenCalledTimes(1);
            });

            it('should give each concurrent caller its own result object', async () => {
                const [first, second]: LanguageDetection[] = await Promise.all([service.detect('Menú del día'), service.detect('Menú del día')]);

                expect(first).not.toBe(second);
                expect(first).toEqual(second);
            });

            it('should call the engine again once a failed request settles', async () => {
                lensEngineServiceStub.identifyLanguage.mockRejectedValueOnce(new Error('engine busy'));

                await service.detect('Menú del día');
                await service.detect('Menú del día');

                expect(lensEngineServiceStub.identifyLanguage).toHaveBeenCalledTimes(2);
            });
        });

        describe('failures', () => {
            it('should resolve as undetermined and log only the error when the engine rejects', async () => {
                const failure: Error = new Error('identifier unavailable');
                lensEngineServiceStub.identifyLanguage.mockRejectedValueOnce(failure);

                await expect(service.detect('Menú del día')).resolves.toEqual({ confidence: 0, language: null, reliable: false });

                expect(loggerServiceStub.error).toHaveBeenCalledWith('language-detection-failed', failure);
                expect(service.cacheSize).toBe(0);
            });

            it('should resolve as undetermined when the engine throws synchronously', async () => {
                lensEngineServiceStub.identifyLanguage.mockImplementationOnce((): Promise<IdentifyLanguageResponse> => {
                    throw new TypeError('not implemented');
                });

                await expect(service.detect('Menú del día')).resolves.toEqual({ confidence: 0, language: null, reliable: false });
                expect(loggerServiceStub.error).toHaveBeenCalledWith('language-detection-failed', expect.any(TypeError));
            });
        });
    });
});
