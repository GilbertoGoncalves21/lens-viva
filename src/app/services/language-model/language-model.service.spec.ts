import { TestBed } from '@angular/core/testing';
import { OnlineTranslationService } from '../online-translation/online-translation.service';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import type { Mock } from 'vitest';
import { AppSettings, EngineCapabilities, LanguagePair, ModelInventory, RegionGranularity } from 'src/app/shared/models';
import { AUTO_LANGUAGE } from 'src/app/shared/utils';
import { LensEngineService } from '../lens-engine/lens-engine.service';
import { LoggerService } from '../logger/logger.service';
import { PreferencesService } from '../preferences/preferences.service';
import { LanguageModelService } from './language-model.service';

interface Deferred<T> {
    promise: Promise<T>;
    reject: (reason: unknown) => void;
    resolve: (value: T) => void;
}

interface LensEngineServiceStub {
    deleteModel: Mock<(language: string) => Promise<void>>;
    downloadModel: Mock<(language: string, requireWifi: boolean, targetLanguage: string) => Promise<void>>;
    getCapabilities: Mock<() => Promise<EngineCapabilities>>;
    getDownloadedModels: Mock<(targetLanguage: string) => Promise<string[]>>;
}

interface LoggerServiceStub {
    error: Mock<(event: string, error: unknown) => void>;
}

interface PreferencesServiceStub {
    readonly settings: AppSettings;
    settingsChanges: () => Observable<AppSettings>;
}

const ON_DEVICE_CAPABILITIES: EngineCapabilities = { cameraSelection: false, languageIdentification: true, modelRemoval: true, openAppSettings: true, translation: true };

function createDeferred<T>(): Deferred<T> {
    let resolve: (value: T) => void = (): void => undefined;
    let reject: (reason: unknown) => void = (): void => undefined;
    const promise: Promise<T> = new Promise<T>((resolvePromise: (value: T) => void, rejectPromise: (reason: unknown) => void) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return { promise: promise, reject: reject, resolve: resolve };
}

function createSettings(): AppSettings {
    return {
        analysesPerSecond: 3,
        appLanguage: AUTO_LANGUAGE,
        balloonFontScale: 1,
        historyEnabled: false,
        languageConfirmedFor: 'pt',
        regionGranularity: RegionGranularity.BLOCK,
        requireWifiForDownloads: false,
        showDebugRegions: false,
        sourceLanguage: AUTO_LANGUAGE,
        targetLanguage: 'pt',
    };
}

function flushPromises(): Promise<void> {
    return new Promise<void>((resolve: () => void) => setTimeout(resolve, 0));
}

describe('LanguageModelService', () => {
    let downloadedLanguages: string[];
    let lensEngineServiceStub: LensEngineServiceStub;
    let loggerServiceStub: LoggerServiceStub;
    let service: LanguageModelService;
    let settings$: BehaviorSubject<AppSettings>;

    beforeEach(() => {
        downloadedLanguages = ['en'];
        settings$ = new BehaviorSubject<AppSettings>(createSettings());
        lensEngineServiceStub = {
            deleteModel: vi.fn(async (language: string): Promise<void> => {
                downloadedLanguages = downloadedLanguages.filter((downloaded: string) => downloaded !== language);
            }),
            downloadModel: vi.fn(async (language: string): Promise<void> => {
                downloadedLanguages = [...downloadedLanguages, language];
            }),
            getCapabilities: vi.fn(async (): Promise<EngineCapabilities> => ON_DEVICE_CAPABILITIES),
            getDownloadedModels: vi.fn(async (): Promise<string[]> => [...downloadedLanguages]),
        };
        loggerServiceStub = { error: vi.fn() };

        const preferencesServiceStub: PreferencesServiceStub = {
            get settings(): AppSettings {
                return settings$.value;
            },
            settingsChanges: (): Observable<AppSettings> => settings$.asObservable(),
        };

        TestBed.configureTestingModule({
            providers: [
                { provide: LensEngineService, useValue: lensEngineServiceStub },
                { provide: LoggerService, useValue: loggerServiceStub },
                { provide: PreferencesService, useValue: preferencesServiceStub },
            ],
        });
        service = TestBed.inject(LanguageModelService);
    });

    function changeSettings(changes: Partial<AppSettings>): void {
        settings$.next({ ...settings$.value, ...changes });
    }

    it('should start with an empty inventory', () => {
        expect(service.inventory).toEqual({ downloaded: [], downloading: [] });
    });

    it('should not query the engine before the inventory is needed', () => {
        changeSettings({ targetLanguage: 'de' });

        expect(lensEngineServiceStub.getDownloadedModels).not.toHaveBeenCalled();
    });

    describe('refresh', () => {
        it('should store and return the downloaded languages', async () => {
            downloadedLanguages = ['en', 'pt'];

            const downloaded: string[] = await service.refresh();

            expect(downloaded).toEqual(['en', 'pt']);
            expect(service.inventory.downloaded).toEqual(['en', 'pt']);
        });

        it('should ask for the models available for the app language', async () => {
            await service.refresh();

            expect(lensEngineServiceStub.getDownloadedModels).toHaveBeenCalledWith('pt');
        });

        it('should emit the new inventory', async () => {
            const inventories: ModelInventory[] = [];
            const subscription: Subscription = service.changes().subscribe((inventory: ModelInventory) => inventories.push(inventory));

            await service.refresh();

            expect(inventories).toEqual([{ downloaded: [], downloading: [] }, { downloaded: ['en'], downloading: [] }]);
            subscription.unsubscribe();
        });

        it('should keep the newest answer when an older one arrives late', async () => {
            const older: Deferred<string[]> = createDeferred<string[]>();
            lensEngineServiceStub.getDownloadedModels.mockReturnValueOnce(older.promise).mockResolvedValueOnce(['en', 'es']);

            const first: Promise<string[]> = service.refresh();
            await service.refresh();
            older.resolve(['en']);

            await expect(first).resolves.toEqual(['en']);
            expect(service.inventory.downloaded).toEqual(['en', 'es']);
        });
    });

    describe('target language changes', () => {
        beforeEach(() => {
            lensEngineServiceStub.getDownloadedModels.mockImplementation(async (targetLanguage: string): Promise<string[]> =>
                targetLanguage === 'de' ? ['de', 'fr'] : [...downloadedLanguages],
            );
        });

        it('should reload the inventory for the new target language once it was loaded', async () => {
            await service.refresh();

            changeSettings({ targetLanguage: 'de' });
            await flushPromises();

            expect(lensEngineServiceStub.getDownloadedModels).toHaveBeenLastCalledWith('de');
            expect(service.inventory.downloaded).toEqual(['de', 'fr']);
        });

        it('should drop the models of the previous target language while the new inventory loads', async () => {
            const pending: Deferred<string[]> = createDeferred<string[]>();

            await service.refresh();
            lensEngineServiceStub.getDownloadedModels.mockReturnValueOnce(pending.promise);

            changeSettings({ targetLanguage: 'de' });

            expect(service.inventory.downloaded).toEqual([]);
            expect(service.isDownloaded('en')).toBe(false);

            pending.resolve(['de']);
            await flushPromises();

            expect(service.inventory.downloaded).toEqual(['de']);
        });

        it('should ignore settings changes that keep the target language', async () => {
            await service.refresh();

            changeSettings({ historyEnabled: true, sourceLanguage: 'es' });
            await flushPromises();

            expect(lensEngineServiceStub.getDownloadedModels).toHaveBeenCalledTimes(1);
            expect(service.inventory.downloaded).toEqual(['en']);
        });

        it('should not apply an answer for a previous target language', async () => {
            const previous: Deferred<string[]> = createDeferred<string[]>();

            await service.refresh();
            lensEngineServiceStub.getDownloadedModels.mockReturnValueOnce(previous.promise);

            const outdated: Promise<string[]> = service.refresh();
            changeSettings({ targetLanguage: 'de' });
            await flushPromises();
            previous.resolve(['en', 'pt']);
            await outdated;

            expect(service.inventory.downloaded).toEqual(['de', 'fr']);
        });

        it('should log when the inventory of the new target language cannot be loaded', async () => {
            await service.refresh();
            lensEngineServiceStub.getDownloadedModels.mockRejectedValueOnce(new Error('query failed'));

            changeSettings({ targetLanguage: 'de' });
            await flushPromises();

            expect(loggerServiceStub.error).toHaveBeenCalledWith('model-refresh-failed', expect.any(Error));
            expect(service.inventory.downloaded).toEqual([]);
        });
    });

    describe('missingLanguages', () => {
        it('should not query or download models when the online service is available', async () => {
            vi.spyOn(TestBed.inject(OnlineTranslationService), 'available', 'get').mockReturnValue(true);
            await expect(service.missingLanguages({ sourceLanguage: 'en', targetLanguage: 'pt' })).resolves.toEqual([]);
            expect(lensEngineServiceStub.getDownloadedModels).not.toHaveBeenCalled();
        });
        it('should list the languages of the pair that are not downloaded', async () => {
            const languagePair: LanguagePair = { sourceLanguage: 'es', targetLanguage: 'pt' };

            await expect(service.missingLanguages(languagePair)).resolves.toEqual(['es', 'pt']);
        });

        it('should ask for the models available for the target language of the pair', async () => {
            await service.missingLanguages({ sourceLanguage: 'es', targetLanguage: 'pt' });

            expect(lensEngineServiceStub.getDownloadedModels).toHaveBeenCalledWith('pt');
        });

        it('should ignore downloaded languages', async () => {
            await expect(service.missingLanguages({ sourceLanguage: 'es', targetLanguage: 'en' })).resolves.toEqual(['es']);
        });

        it('should list a language once when source and target are the same', async () => {
            await expect(service.missingLanguages({ sourceLanguage: 'fr', targetLanguage: 'fr' })).resolves.toEqual(['fr']);
        });

        it('should return nothing when every model is available', async () => {
            downloadedLanguages = ['en', 'pt'];

            await expect(service.missingLanguages({ sourceLanguage: 'en', targetLanguage: 'pt' })).resolves.toEqual([]);
            expect(service.inventory.downloaded).toEqual(['en', 'pt']);
        });

        it('should only require the target model when the source language is detected automatically', async () => {
            await expect(service.missingLanguages({ sourceLanguage: AUTO_LANGUAGE, targetLanguage: 'pt' })).resolves.toEqual(['pt']);
        });

        it('should require nothing in automatic mode when the target model is available and still refresh the inventory', async () => {
            downloadedLanguages = ['de', 'pt'];

            await expect(service.missingLanguages({ sourceLanguage: AUTO_LANGUAGE, targetLanguage: 'pt' })).resolves.toEqual([]);
            expect(lensEngineServiceStub.getDownloadedModels).toHaveBeenCalledTimes(1);
            expect(service.inventory.downloaded).toEqual(['de', 'pt']);
        });

        it('should not store the models of a pair whose target is not the app language', async () => {
            downloadedLanguages = ['en', 'it'];

            await expect(service.missingLanguages({ sourceLanguage: 'en', targetLanguage: 'it' })).resolves.toEqual([]);

            expect(lensEngineServiceStub.getDownloadedModels).toHaveBeenCalledWith('it');
            expect(service.inventory.downloaded).toEqual([]);
        });
    });

    describe('isDownloaded', () => {
        it('should report the languages of the inventory as downloaded', async () => {
            downloadedLanguages = ['de'];

            expect(service.isDownloaded('de')).toBe(false);

            await service.refresh();

            expect(service.isDownloaded('de')).toBe(true);
            expect(service.isDownloaded('fr')).toBe(false);
        });

        it('should only report English as downloaded when the engine lists it', async () => {
            downloadedLanguages = ['pt'];

            await service.refresh();

            expect(service.isDownloaded('en')).toBe(false);

            downloadedLanguages = ['en', 'pt'];
            await service.refresh();

            expect(service.isDownloaded('en')).toBe(true);
        });
    });

    describe('download', () => {
        it('should download for the app language with the Wi-Fi requirement and refresh the inventory', async () => {
            await service.download('es', true);

            expect(lensEngineServiceStub.downloadModel).toHaveBeenCalledWith('es', true, 'pt');
            expect(service.inventory).toEqual({ downloaded: ['en', 'es'], downloading: [] });
        });

        it('should start the engine download before waiting for anything else', () => {
            void service.download('es', false);

            expect(lensEngineServiceStub.downloadModel).toHaveBeenCalledWith('es', false, 'pt');
        });

        it('should flag the language as downloading while the download runs', async () => {
            const deferred: Deferred<void> = createDeferred<void>();
            lensEngineServiceStub.downloadModel.mockReturnValueOnce(deferred.promise);

            const download: Promise<void> = service.download('pt', false);

            expect(service.inventory.downloading).toEqual(['pt']);

            deferred.resolve();
            await download;

            expect(service.inventory.downloading).toEqual([]);
        });

        it('should clear the downloading flag, log and rethrow when the download fails', async () => {
            const failure: Error = new Error('network');
            lensEngineServiceStub.downloadModel.mockRejectedValueOnce(failure);

            await expect(service.download('pt', false)).rejects.toBe(failure);

            expect(service.inventory.downloading).toEqual([]);
            expect(lensEngineServiceStub.getDownloadedModels).not.toHaveBeenCalled();
            expect(loggerServiceStub.error).toHaveBeenCalledWith('model-download-failed', failure, { language: 'pt' });
        });

        it('should share a download that is already running for the same language', async () => {
            const deferred: Deferred<void> = createDeferred<void>();
            lensEngineServiceStub.downloadModel.mockReturnValueOnce(deferred.promise);

            const first: Promise<void> = service.download('pt', false);
            const second: Promise<void> = service.download('pt', false);

            expect(second).toBe(first);

            deferred.resolve();
            await Promise.all([first, second]);

            expect(lensEngineServiceStub.downloadModel).toHaveBeenCalledTimes(1);
        });

        it('should not share a running download made for another target language', async () => {
            const deferred: Deferred<void> = createDeferred<void>();
            lensEngineServiceStub.downloadModel.mockReturnValueOnce(deferred.promise);

            const first: Promise<void> = service.download('es', false);
            changeSettings({ targetLanguage: 'de' });
            const second: Promise<void> = service.download('es', false);

            expect(second).not.toBe(first);
            expect(lensEngineServiceStub.downloadModel).toHaveBeenNthCalledWith(1, 'es', false, 'pt');
            expect(lensEngineServiceStub.downloadModel).toHaveBeenNthCalledWith(2, 'es', false, 'de');

            deferred.resolve();
            await Promise.all([first, second]);
        });

        it('should allow a new download after the previous one finished', async () => {
            lensEngineServiceStub.downloadModel.mockRejectedValueOnce(new Error('network'));

            await expect(service.download('pt', false)).rejects.toThrow('network');
            await service.download('pt', false);

            expect(lensEngineServiceStub.downloadModel).toHaveBeenCalledTimes(2);
            expect(service.inventory.downloaded).toContain('pt');
        });

        it('should keep other languages flagged while one finishes', async () => {
            const deferred: Deferred<void> = createDeferred<void>();
            lensEngineServiceStub.downloadModel.mockReturnValueOnce(deferred.promise);

            const slow: Promise<void> = service.download('fr', false);

            await service.download('pt', false);

            expect(service.inventory.downloading).toEqual(['fr']);

            deferred.resolve();
            await slow;

            expect(service.inventory.downloading).toEqual([]);
        });
    });

    describe('remove', () => {
        it('should delete the model and refresh the inventory', async () => {
            downloadedLanguages = ['en', 'pt'];

            await service.remove('pt');

            expect(lensEngineServiceStub.deleteModel).toHaveBeenCalledWith('pt');
            expect(service.inventory.downloaded).toEqual(['en']);
        });

        it('should refresh the inventory and rethrow when the removal fails', async () => {
            const failure: Error = new Error('built in');
            lensEngineServiceStub.deleteModel.mockRejectedValueOnce(failure);

            await expect(service.remove('en')).rejects.toBe(failure);

            expect(lensEngineServiceStub.getDownloadedModels).toHaveBeenCalledTimes(1);
            expect(service.inventory.downloaded).toEqual(['en']);
            expect(loggerServiceStub.error).toHaveBeenCalledWith('model-remove-failed', failure, { language: 'en' });
        });

        it('should rethrow the removal failure even when the refresh fails too', async () => {
            const failure: Error = new Error('built in');
            lensEngineServiceStub.deleteModel.mockRejectedValueOnce(failure);
            lensEngineServiceStub.getDownloadedModels.mockRejectedValueOnce(new Error('query failed'));

            await expect(service.remove('en')).rejects.toBe(failure);

            expect(loggerServiceStub.error).toHaveBeenCalledWith('model-refresh-failed', expect.any(Error));
        });
    });

    describe('supportsRemoval', () => {
        it('should report that models can be removed when the engine supports it', async () => {
            await expect(service.supportsRemoval()).resolves.toBe(true);
        });

        it('should report that models cannot be removed when the engine does not support it', async () => {
            lensEngineServiceStub.getCapabilities.mockResolvedValueOnce({ ...ON_DEVICE_CAPABILITIES, modelRemoval: false });

            await expect(service.supportsRemoval()).resolves.toBe(false);
        });
    });
});
