import { TestBed } from '@angular/core/testing';
import { GetOptions, GetResult, PreferencesPlugin, RemoveOptions, SetOptions } from '@capacitor/preferences';
import { Subscription } from 'rxjs';
import type { Mock } from 'vitest';
import { AppSettings, HistoryEntry, HistoryRecordRequest } from 'src/app/shared/models';
import { AUTO_LANGUAGE, EMPTY, HISTORY_CONFIG, UNDETERMINED_LANGUAGE } from 'src/app/shared/utils';
import { PREFERENCES_PLUGIN } from '../capacitor/capacitor-plugins';
import { LoggerService } from '../logger/logger.service';
import { PreferencesService } from '../preferences/preferences.service';
import { HistoryService } from './history.service';

interface Deferred<T> {
    promise: Promise<T>;
    reject: (reason: unknown) => void;
    resolve: (value: T) => void;
}

interface LoggerServiceStub {
    error: Mock<(event: string, error: unknown) => void>;
    warn: Mock<(event: string) => void>;
}

interface PreferencesPluginStub {
    get: Mock<(options: GetOptions) => Promise<GetResult>>;
    remove: Mock<(options: RemoveOptions) => Promise<void>>;
    set: Mock<(options: SetOptions) => Promise<void>>;
}

interface PreferencesServiceStub {
    settings: AppSettings;
}

const NOW: Date = new Date('2026-10-21T12:00:00.000Z');

function createDeferred<T>(): Deferred<T> {
    let resolve: (value: T) => void = (): void => undefined;
    let reject: (reason: unknown) => void = (): void => undefined;
    const promise: Promise<T> = new Promise<T>((resolvePromise: (value: T) => void, rejectPromise: (reason: unknown) => void) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return { promise: promise, reject: reject, resolve: resolve };
}

function createEntry(index: number, overrides: Partial<HistoryEntry> = {}): HistoryEntry {
    return {
        createdAt: new Date(NOW.getTime() - index * 60000).toISOString(),
        historyEntryId: `stored-${index}`,
        originalText: `Plato número ${index}`,
        sourceLanguage: 'es',
        targetLanguage: 'en',
        translatedText: `Dish number ${index}`,
        ...overrides,
    };
}

function createRequest(overrides: Partial<HistoryRecordRequest> = {}): HistoryRecordRequest {
    return {
        originalText: 'Menú del día',
        sourceLanguage: 'es',
        targetLanguage: 'en',
        translatedText: 'Menu of the day',
        ...overrides,
    };
}

function createSettings(historyEnabled: boolean): AppSettings {
    return { ...PreferencesService.defaultSettings({ sourceLanguage: 'es', targetLanguage: 'en' }), historyEnabled: historyEnabled };
}

describe('HistoryService', () => {
    let loggerServiceStub: LoggerServiceStub;
    let preferencesPluginStub: PreferencesPluginStub;
    let preferencesServiceStub: PreferencesServiceStub;
    let service: HistoryService;
    let storage: Map<string, string>;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
        storage = new Map<string, string>();
        loggerServiceStub = { error: vi.fn(), warn: vi.fn() };
        preferencesPluginStub = {
            get: vi.fn(async (options: GetOptions): Promise<GetResult> => ({ value: storage.get(options.key) ?? null })),
            remove: vi.fn(async (options: RemoveOptions): Promise<void> => {
                storage.delete(options.key);
            }),
            set: vi.fn(async (options: SetOptions): Promise<void> => {
                storage.set(options.key, options.value);
            }),
        };
        preferencesServiceStub = { settings: createSettings(true) };

        TestBed.configureTestingModule({
            providers: [
                { provide: LoggerService, useValue: loggerServiceStub },
                { provide: PREFERENCES_PLUGIN, useValue: preferencesPluginStub as unknown as PreferencesPlugin },
                { provide: PreferencesService, useValue: preferencesServiceStub },
            ],
        });
        service = TestBed.inject(HistoryService);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    async function settle(): Promise<void> {
        for (let index: number = 0; index < 50; index++) {
            await Promise.resolve();
        }
    }

    function store(entries: unknown): void {
        storage.set(HISTORY_CONFIG.storageKey, JSON.stringify(entries));
    }

    function storedEntries(): HistoryEntry[] {
        return JSON.parse(storage.get(HISTORY_CONFIG.storageKey) ?? '[]') as HistoryEntry[];
    }

    function originalTexts(entries: HistoryEntry[]): string[] {
        return entries.map((entry: HistoryEntry) => entry.originalText);
    }

    async function record(request: HistoryRecordRequest, now: Date = NOW): Promise<void> {
        service.record(request, now);
        await settle();
    }

    it('should start empty', () => {
        const received: HistoryEntry[][] = [];
        const subscription: Subscription = service.changes().subscribe((entries: HistoryEntry[]) => received.push(entries));

        expect(service.entries).toEqual([]);
        expect(received).toEqual([[]]);
        subscription.unsubscribe();
    });

    describe('load', () => {
        it('should read and emit the stored entries', async () => {
            const received: HistoryEntry[][] = [];
            const subscription: Subscription = service.changes().subscribe((entries: HistoryEntry[]) => received.push(entries));
            store([createEntry(0), createEntry(1)]);

            const entries: HistoryEntry[] = await service.load();

            expect(preferencesPluginStub.get).toHaveBeenCalledWith({ key: HISTORY_CONFIG.storageKey });
            expect(entries).toEqual([createEntry(0), createEntry(1)]);
            expect(service.entries).toEqual(entries);
            expect(received[received.length - 1]).toEqual(entries);
            subscription.unsubscribe();
        });

        it('should read the storage only once', async () => {
            await Promise.all([service.load(), service.load()]);
            await service.load();

            expect(preferencesPluginStub.get).toHaveBeenCalledTimes(1);
        });

        it('should resolve with the current entries after later changes', async () => {
            await service.load();
            await record(createRequest());

            const entries: HistoryEntry[] = await service.load();

            expect(originalTexts(entries)).toEqual(['Menú del día']);
        });

        it('should start empty when nothing is stored', async () => {
            await expect(service.load()).resolves.toEqual([]);
        });

        it('should ignore corrupt JSON without logging its content', async () => {
            storage.set(HISTORY_CONFIG.storageKey, '[{"originalText": "Menú del día", "translatedText": ');

            await expect(service.load()).resolves.toEqual([]);

            expect(loggerServiceStub.warn).toHaveBeenCalledWith('history-storage-corrupted');
            expect(loggerServiceStub.error).not.toHaveBeenCalled();
            expect(JSON.stringify(loggerServiceStub.warn.mock.calls)).not.toContain('Menú');
        });

        it('should ignore stored values that are not lists', async () => {
            store({ entries: [createEntry(0)] });

            await expect(service.load()).resolves.toEqual([]);
            expect(loggerServiceStub.warn).toHaveBeenCalledWith('history-storage-corrupted');
        });

        it('should drop invalid and duplicated entries and unknown fields', async () => {
            store([
                { ...createEntry(0), legacyImage: 'data:image/png;base64,AAAA' },
                createEntry(1, { historyEntryId: 'stored-0' }),
                createEntry(2, { createdAt: 'yesterday' }),
                createEntry(3, { historyEntryId: EMPTY }),
                { ...createEntry(4), translatedText: 12 },
                { createdAt: NOW.toISOString(), historyEntryId: 'partial' },
                null,
                'entry',
                [createEntry(5)],
                createEntry(6),
            ]);

            const entries: HistoryEntry[] = await service.load();

            expect(entries).toEqual([createEntry(0), createEntry(6)]);
            expect(Object.keys(entries[0]).sort()).toEqual(['createdAt', 'historyEntryId', 'originalText', 'sourceLanguage', 'targetLanguage', 'translatedText']);
        });

        it('should keep at most the maximum number of stored entries', async () => {
            store(Array.from({ length: HISTORY_CONFIG.maxEntries + 5 }, (_value: unknown, index: number) => createEntry(index)));

            const entries: HistoryEntry[] = await service.load();

            expect(entries.length).toBe(HISTORY_CONFIG.maxEntries);
            expect(entries[0]).toEqual(createEntry(0));
        });

        it('should reject, log and allow a retry when the storage cannot be read', async () => {
            const failure: Error = new Error('storage unavailable');
            preferencesPluginStub.get.mockRejectedValueOnce(failure);
            store([createEntry(0)]);

            await expect(service.load()).rejects.toThrow('storage unavailable');
            expect(loggerServiceStub.error).toHaveBeenCalledWith('history-load-failed', failure);

            await expect(service.load()).resolves.toEqual([createEntry(0)]);
            expect(preferencesPluginStub.get).toHaveBeenCalledTimes(2);
        });
    });

    describe('record', () => {
        it('should do nothing while the history is disabled', async () => {
            preferencesServiceStub.settings = createSettings(false);

            await record(createRequest());
            await vi.advanceTimersByTimeAsync(HISTORY_CONFIG.persistDelayMilliseconds);

            expect(service.entries).toEqual([]);
            expect(preferencesPluginStub.get).not.toHaveBeenCalled();
            expect(preferencesPluginStub.set).not.toHaveBeenCalled();
        });

        it('should add the newest entry at the top with normalized texts', async () => {
            store([createEntry(0)]);

            await record(createRequest({ originalText: '  Menú \n del   día ', translatedText: ' Menu  of the day ' }));

            expect(service.entries.length).toBe(2);
            expect(service.entries[0]).toEqual({
                createdAt: NOW.toISOString(),
                historyEntryId: expect.any(String),
                originalText: 'Menú del día',
                sourceLanguage: 'es',
                targetLanguage: 'en',
                translatedText: 'Menu of the day',
            });
            expect(service.entries[1]).toEqual(createEntry(0));
        });

        it('should emit the new list', async () => {
            const received: HistoryEntry[][] = [];
            const subscription: Subscription = service.changes().subscribe((entries: HistoryEntry[]) => received.push(entries));

            await record(createRequest());

            expect(originalTexts(received[received.length - 1])).toEqual(['Menú del día']);
            subscription.unsubscribe();
        });

        it('should skip requests that are not worth saving', async () => {
            const requests: HistoryRecordRequest[] = [
                createRequest({ sourceLanguage: 'en', targetLanguage: 'en' }),
                createRequest({ sourceLanguage: AUTO_LANGUAGE }),
                createRequest({ sourceLanguage: UNDETERMINED_LANGUAGE }),
                createRequest({ targetLanguage: EMPTY }),
                createRequest({ originalText: 'a', translatedText: 'b' }),
                createRequest({ originalText: '12,50', translatedText: '12.50' }),
                createRequest({ translatedText: '   ' }),
                createRequest({ originalText: 'Hotel Plaza', translatedText: ' HOTEL  plaza ' }),
                createRequest({ originalText: null as unknown as string }),
                createRequest({ translatedText: undefined as unknown as string }),
                null as unknown as HistoryRecordRequest,
            ];

            for (const request of requests) {
                await record(request);
            }

            expect(service.entries).toEqual([]);
            expect(preferencesPluginStub.get).not.toHaveBeenCalled();
        });

        it('should move a repeated text to the top with the latest translation', async () => {
            await record(createRequest());
            await record(createRequest({ originalText: 'Sopa de tomate', translatedText: 'Tomato soup' }));
            await record(createRequest({ originalText: 'MENÚ  DEL DÍA', translatedText: 'Set menu' }), new Date(NOW.getTime() + 1000));

            expect(originalTexts(service.entries)).toEqual(['MENÚ DEL DÍA', 'Sopa de tomate']);
            expect(service.entries[0].translatedText).toBe('Set menu');
            expect(service.entries[0].createdAt).toBe(new Date(NOW.getTime() + 1000).toISOString());
        });

        it('should keep the same text for another target language', async () => {
            await record(createRequest());
            await record(createRequest({ targetLanguage: 'pt', translatedText: 'Menu do dia' }));

            expect(service.entries.length).toBe(2);
        });

        it('should replace the entry of the same text recorded from another source language', async () => {
            await record(createRequest({ sourceLanguage: 'it', translatedText: 'Menu of the god' }));
            await record(createRequest({ originalText: 'Sopa de tomate', translatedText: 'Tomato soup' }));
            await record(createRequest(), new Date(NOW.getTime() + 1000));

            expect(originalTexts(service.entries)).toEqual(['Menú del día', 'Sopa de tomate']);
            expect(service.entries[0].sourceLanguage).toBe('es');
            expect(service.entries[0].translatedText).toBe('Menu of the day');
        });

        it('should keep only the most recent entries', async () => {
            store(Array.from({ length: HISTORY_CONFIG.maxEntries }, (_value: unknown, index: number) => createEntry(index)));

            await record(createRequest());

            expect(service.entries.length).toBe(HISTORY_CONFIG.maxEntries);
            expect(service.entries[0].originalText).toBe('Menú del día');
            expect(service.entries.some((entry: HistoryEntry) => entry.historyEntryId === `stored-${HISTORY_CONFIG.maxEntries - 1}`)).toBe(false);
        });

        it('should create unique identifiers for entries recorded at the same time', async () => {
            await record(createRequest());
            await record(createRequest({ originalText: 'Sopa de tomate', translatedText: 'Tomato soup' }));
            await record(createRequest({ originalText: 'Tarta de queso', translatedText: 'Cheesecake' }));

            const identifiers: Set<string> = new Set<string>(service.entries.map((entry: HistoryEntry) => entry.historyEntryId));

            expect(identifiers.size).toBe(3);
        });

        it('should not reuse an identifier that is already stored', async () => {
            store([createEntry(0, { historyEntryId: `${NOW.getTime().toString(36)}-1` })]);

            await record(createRequest());

            expect(service.entries[0].historyEntryId).not.toBe(service.entries[1].historyEntryId);
        });

        it('should use the current time when the given date is invalid', async () => {
            await record(createRequest(), new Date(Number.NaN));

            expect(service.entries[0].createdAt).toBe(NOW.toISOString());
        });

        it('should not save when the history is disabled before the stored entries load', async () => {
            const pending: Deferred<GetResult> = createDeferred<GetResult>();
            preferencesPluginStub.get.mockReturnValueOnce(pending.promise);

            service.record(createRequest(), NOW);
            preferencesServiceStub.settings = createSettings(false);
            pending.resolve({ value: null });
            await settle();
            await vi.advanceTimersByTimeAsync(HISTORY_CONFIG.persistDelayMilliseconds);

            expect(service.entries).toEqual([]);
            expect(preferencesPluginStub.set).not.toHaveBeenCalled();
        });

        it('should drop the request and keep the storage untouched when it cannot be read', async () => {
            const failure: Error = new Error('storage unavailable');
            preferencesPluginStub.get.mockRejectedValueOnce(failure);
            store([createEntry(0)]);

            await record(createRequest());
            await vi.advanceTimersByTimeAsync(HISTORY_CONFIG.persistDelayMilliseconds);

            expect(service.entries).toEqual([]);
            expect(preferencesPluginStub.set).not.toHaveBeenCalled();
            expect(storedEntries()).toEqual([createEntry(0)]);
            expect(loggerServiceStub.error).toHaveBeenCalledWith('history-record-failed', failure);
        });

        it('should never log the recorded texts', async () => {
            preferencesPluginStub.set.mockRejectedValue(new Error('disk full'));

            await record(createRequest());
            await vi.advanceTimersByTimeAsync(HISTORY_CONFIG.persistDelayMilliseconds);

            expect(loggerServiceStub.error).toHaveBeenCalledWith('history-persist-failed', expect.any(Error));
            expect(JSON.stringify(loggerServiceStub.error.mock.calls)).not.toContain('Menú');
            expect(JSON.stringify(loggerServiceStub.error.mock.calls)).not.toContain('Menu of the day');
        });
    });

    describe('persistence', () => {
        it('should save after the persist delay', async () => {
            await record(createRequest());
            await vi.advanceTimersByTimeAsync(HISTORY_CONFIG.persistDelayMilliseconds - 1);

            expect(preferencesPluginStub.set).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(1);

            expect(preferencesPluginStub.set).toHaveBeenCalledTimes(1);
            expect(originalTexts(storedEntries())).toEqual(['Menú del día']);
        });

        it('should save several records in one write', async () => {
            await record(createRequest());
            await record(createRequest({ originalText: 'Sopa de tomate', translatedText: 'Tomato soup' }));
            await vi.advanceTimersByTimeAsync(HISTORY_CONFIG.persistDelayMilliseconds);

            expect(preferencesPluginStub.set).toHaveBeenCalledTimes(1);
            expect(originalTexts(storedEntries())).toEqual(['Sopa de tomate', 'Menú del día']);
        });

        it('should keep saving while records keep arriving', async () => {
            const interval: number = Math.floor(HISTORY_CONFIG.persistDelayMilliseconds / 2);

            for (let index: number = 0; index < 6; index++) {
                await record(createRequest({ originalText: `Plato ${index}`, translatedText: `Dish ${index}` }));
                await vi.advanceTimersByTimeAsync(interval);
            }

            expect(preferencesPluginStub.set.mock.calls.length).toBeGreaterThanOrEqual(2);
        });

        it('should apply the writes in order', async () => {
            const slowWrite: Deferred<void> = createDeferred<void>();
            preferencesPluginStub.set.mockImplementationOnce(async (options: SetOptions): Promise<void> => {
                await slowWrite.promise;
                storage.set(options.key, options.value);
            });

            await record(createRequest());
            await vi.advanceTimersByTimeAsync(HISTORY_CONFIG.persistDelayMilliseconds);
            await record(createRequest({ originalText: 'Sopa de tomate', translatedText: 'Tomato soup' }));
            const flushing: Promise<void> = service.flush();

            slowWrite.resolve();
            await flushing;

            expect(originalTexts(storedEntries())).toEqual(['Sopa de tomate', 'Menú del día']);
        });

        it('should keep the entries in memory and log when a delayed write fails', async () => {
            const failure: Error = new Error('disk full');
            preferencesPluginStub.set.mockRejectedValueOnce(failure);

            await record(createRequest());
            await vi.advanceTimersByTimeAsync(HISTORY_CONFIG.persistDelayMilliseconds);

            expect(loggerServiceStub.error).toHaveBeenCalledWith('history-persist-failed', failure);
            expect(originalTexts(service.entries)).toEqual(['Menú del día']);
        });
    });

    describe('flush', () => {
        it('should save pending changes immediately and cancel the delayed write', async () => {
            await record(createRequest());

            await service.flush();

            expect(preferencesPluginStub.set).toHaveBeenCalledTimes(1);
            expect(originalTexts(storedEntries())).toEqual(['Menú del día']);

            await vi.advanceTimersByTimeAsync(HISTORY_CONFIG.persistDelayMilliseconds);

            expect(preferencesPluginStub.set).toHaveBeenCalledTimes(1);
        });

        it('should resolve without writing when nothing is pending', async () => {
            await expect(service.flush()).resolves.toBeUndefined();

            expect(preferencesPluginStub.set).not.toHaveBeenCalled();
        });

        it('should wait for a write in progress', async () => {
            const slowWrite: Deferred<void> = createDeferred<void>();
            let flushed: boolean = false;
            store([createEntry(0), createEntry(1)]);
            preferencesPluginStub.set.mockImplementationOnce(async (options: SetOptions): Promise<void> => {
                await slowWrite.promise;
                storage.set(options.key, options.value);
            });
            const removing: Promise<void> = service.remove('stored-0');
            await settle();

            const flushing: Promise<void> = service.flush().then((): void => {
                flushed = true;
            });
            await settle();

            expect(flushed).toBe(false);

            slowWrite.resolve();
            await Promise.all([removing, flushing]);

            expect(flushed).toBe(true);
        });

        it('should not reject and should retry later when the write fails', async () => {
            preferencesPluginStub.set.mockRejectedValueOnce(new Error('disk full'));
            await record(createRequest());

            await expect(service.flush()).resolves.toBeUndefined();

            expect(loggerServiceStub.error).toHaveBeenCalledWith('history-persist-failed', expect.any(Error));

            await vi.advanceTimersByTimeAsync(HISTORY_CONFIG.persistDelayMilliseconds);

            expect(preferencesPluginStub.set).toHaveBeenCalledTimes(2);
            expect(originalTexts(storedEntries())).toEqual(['Menú del día']);
        });
    });

    describe('remove', () => {
        beforeEach(() => {
            store([createEntry(0), createEntry(1), createEntry(2)]);
        });

        it('should remove the entry and save immediately', async () => {
            await service.remove('stored-1');

            expect(service.entries.map((entry: HistoryEntry) => entry.historyEntryId)).toEqual(['stored-0', 'stored-2']);
            expect(storedEntries().map((entry: HistoryEntry) => entry.historyEntryId)).toEqual(['stored-0', 'stored-2']);
        });

        it('should not write when the entry does not exist', async () => {
            await service.remove('missing');

            expect(service.entries.length).toBe(3);
            expect(preferencesPluginStub.set).not.toHaveBeenCalled();
        });

        it('should include pending records in the same write', async () => {
            await record(createRequest());

            await service.remove('stored-0');
            await vi.advanceTimersByTimeAsync(HISTORY_CONFIG.persistDelayMilliseconds);

            expect(preferencesPluginStub.set).toHaveBeenCalledTimes(1);
            expect(originalTexts(storedEntries())).toEqual(['Menú del día', 'Plato número 1', 'Plato número 2']);
        });

        it('should restore the entry, log and reject when the write fails', async () => {
            const failure: Error = new Error('disk full');
            preferencesPluginStub.set.mockRejectedValueOnce(failure);

            await expect(service.remove('stored-1')).rejects.toThrow('disk full');

            expect(service.entries.map((entry: HistoryEntry) => entry.historyEntryId)).toEqual(['stored-0', 'stored-1', 'stored-2']);
            expect(loggerServiceStub.error).toHaveBeenCalledWith('history-remove-failed', failure);
        });

        it('should still save pending records after a failed removal', async () => {
            await record(createRequest());
            preferencesPluginStub.set.mockRejectedValueOnce(new Error('disk full'));

            await expect(service.remove('stored-1')).rejects.toThrow('disk full');
            await vi.advanceTimersByTimeAsync(HISTORY_CONFIG.persistDelayMilliseconds);

            expect(preferencesPluginStub.set).toHaveBeenCalledTimes(2);
            expect(originalTexts(storedEntries())).toEqual(['Menú del día', 'Plato número 0', 'Plato número 1', 'Plato número 2']);
        });

        it('should reject when the storage cannot be read', async () => {
            preferencesPluginStub.get.mockRejectedValueOnce(new Error('storage unavailable'));

            await expect(service.remove('stored-1')).rejects.toThrow('storage unavailable');
            expect(preferencesPluginStub.set).not.toHaveBeenCalled();
        });
    });

    describe('clear', () => {
        it('should remove every entry and the stored key', async () => {
            store([createEntry(0), createEntry(1)]);
            await service.load();

            await service.clear();

            expect(service.entries).toEqual([]);
            expect(preferencesPluginStub.remove).toHaveBeenCalledWith({ key: HISTORY_CONFIG.storageKey });
            expect(storage.has(HISTORY_CONFIG.storageKey)).toBe(false);
        });

        it('should not read the storage when it was never loaded', async () => {
            store([createEntry(0)]);

            await service.clear();

            expect(preferencesPluginStub.get).not.toHaveBeenCalled();
            expect(storage.has(HISTORY_CONFIG.storageKey)).toBe(false);
            await expect(service.load()).resolves.toEqual([]);
            expect(preferencesPluginStub.get).not.toHaveBeenCalled();
        });

        it('should cancel a pending write', async () => {
            await record(createRequest());

            await service.clear();
            await vi.advanceTimersByTimeAsync(HISTORY_CONFIG.persistDelayMilliseconds);

            expect(preferencesPluginStub.set).not.toHaveBeenCalled();
            expect(storage.has(HISTORY_CONFIG.storageKey)).toBe(false);
        });

        it('should delete the stored data even when it cannot be read', async () => {
            preferencesPluginStub.get.mockRejectedValueOnce(new Error('storage unavailable'));
            store([createEntry(0)]);
            await expect(service.load()).rejects.toThrow('storage unavailable');

            await service.clear();

            expect(storage.has(HISTORY_CONFIG.storageKey)).toBe(false);
            await expect(service.load()).resolves.toEqual([]);
        });

        it('should not bring back entries from a load that finishes during the clear', async () => {
            const pending: Deferred<GetResult> = createDeferred<GetResult>();
            preferencesPluginStub.get.mockReturnValueOnce(pending.promise);
            const loading: Promise<HistoryEntry[]> = service.load();

            const clearing: Promise<void> = service.clear();
            pending.resolve({ value: JSON.stringify([createEntry(0)]) });
            await Promise.all([loading, clearing]);

            expect(service.entries).toEqual([]);
            expect(storage.has(HISTORY_CONFIG.storageKey)).toBe(false);
        });

        it('should wipe records requested before the clear and keep the ones requested after it', async () => {
            store([createEntry(0)]);
            await service.load();

            service.record(createRequest(), NOW);
            const clearing: Promise<void> = service.clear();
            service.record(createRequest({ originalText: 'Sopa de tomate', translatedText: 'Tomato soup' }), NOW);
            await clearing;
            await settle();
            await service.flush();

            expect(originalTexts(service.entries)).toEqual(['Sopa de tomate']);
            expect(originalTexts(storedEntries())).toEqual(['Sopa de tomate']);
        });

        it('should log and reject when the stored key cannot be removed', async () => {
            const failure: Error = new Error('storage unavailable');
            preferencesPluginStub.remove.mockRejectedValueOnce(failure);
            await record(createRequest());

            await expect(service.clear()).rejects.toThrow('storage unavailable');

            expect(service.entries).toEqual([]);
            expect(loggerServiceStub.error).toHaveBeenCalledWith('history-clear-failed', failure);
        });

        it('should accept new records after clearing', async () => {
            await service.clear();

            await record(createRequest());
            await service.flush();

            expect(originalTexts(storedEntries())).toEqual(['Menú del día']);
        });
    });
});
