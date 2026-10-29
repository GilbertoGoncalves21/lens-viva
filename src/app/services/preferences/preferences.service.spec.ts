import { TestBed } from '@angular/core/testing';
import { GetOptions, GetResult, PreferencesPlugin, RemoveOptions, SetOptions } from '@capacitor/preferences';
import { Subscription } from 'rxjs';
import type { Mock } from 'vitest';
import { AppSettings, RegionGranularity } from 'src/app/shared/models';
import { AUTO_LANGUAGE, DEFAULT_ANALYSES_PER_SECOND, DEFAULT_BALLOON_FONT_SCALE, EMPTY } from 'src/app/shared/utils';
import { PREFERENCES_PLUGIN } from '../capacitor/capacitor-plugins';
import { PreferencesService } from './preferences.service';

const SETTINGS_KEY: string = 'lens-viva.settings';

const SETTINGS_REVISION_KEY: string = 'lens-viva.settings-revision';

interface PreferencesPluginStub {
    get: Mock<(options: GetOptions) => Promise<GetResult>>;
    remove: Mock<(options: RemoveOptions) => Promise<void>>;
    set: Mock<(options: SetOptions) => Promise<void>>;
}

describe('PreferencesService', () => {
    let preferencesPluginStub: PreferencesPluginStub;
    let service: PreferencesService;
    let storage: Map<string, string>;

    beforeEach(() => {
        storage = new Map<string, string>();
        preferencesPluginStub = {
            get: vi.fn(async (options: GetOptions): Promise<GetResult> => ({ value: storage.get(options.key) ?? null })),
            remove: vi.fn(async (options: RemoveOptions): Promise<void> => {
                storage.delete(options.key);
            }),
            set: vi.fn(async (options: SetOptions): Promise<void> => {
                storage.set(options.key, options.value);
            }),
        };

        TestBed.configureTestingModule({
            providers: [{ provide: PREFERENCES_PLUGIN, useValue: preferencesPluginStub as unknown as PreferencesPlugin }],
        });
        service = TestBed.inject(PreferencesService);
    });

    function storedSettings(): AppSettings {
        return JSON.parse(storage.get(SETTINGS_KEY) ?? '{}') as AppSettings;
    }

    it('should start with an automatic source, English as target and no confirmed language', () => {
        expect(service.settings.targetLanguage).toBe('en');
        expect(service.settings.sourceLanguage).toBe(AUTO_LANGUAGE);
        expect(service.settings.languageConfirmedFor).toBe(EMPTY);
        expect(service.settings.appLanguage).toBe(AUTO_LANGUAGE);
    });

    it('should build default settings for a language pair', () => {
        expect(PreferencesService.defaultSettings({ sourceLanguage: 'en', targetLanguage: 'it' })).toEqual({
            analysesPerSecond: DEFAULT_ANALYSES_PER_SECOND,
            appLanguage: AUTO_LANGUAGE,
            balloonFontScale: DEFAULT_BALLOON_FONT_SCALE,
            historyEnabled: false,
            languageConfirmedFor: EMPTY,
            regionGranularity: RegionGranularity.BLOCK,
            requireWifiForDownloads: false,
            showDebugRegions: false,
            sourceLanguage: 'en',
            targetLanguage: 'it',
        });
    });

    describe('load', () => {
        it('should derive the defaults from the device language', async () => {
            const settings: AppSettings = await service.load('pt-BR');

            expect(preferencesPluginStub.get).toHaveBeenCalledWith({ key: SETTINGS_KEY });
            expect(settings.sourceLanguage).toBe(AUTO_LANGUAGE);
            expect(settings.targetLanguage).toBe('pt');
            expect(settings.languageConfirmedFor).toBe(EMPTY);
            expect(service.settings).toEqual(settings);
        });

        it('should merge the stored settings over the defaults', async () => {
            storage.set(SETTINGS_KEY, JSON.stringify({ analysesPerSecond: 5, languageConfirmedFor: 'pt', targetLanguage: 'fr' }));

            const settings: AppSettings = await service.load('pt-BR');

            expect(settings).toEqual({
                ...PreferencesService.defaultSettings({ sourceLanguage: AUTO_LANGUAGE, targetLanguage: 'pt' }),
                analysesPerSecond: 5,
                languageConfirmedFor: 'pt',
                targetLanguage: 'fr',
            });
        });

        it('should ignore corrupt JSON', async () => {
            storage.set(SETTINGS_KEY, '{"languageConfirmedFor": "p');

            const settings: AppSettings = await service.load('de-DE');

            expect(settings).toEqual(PreferencesService.defaultSettings({ sourceLanguage: AUTO_LANGUAGE, targetLanguage: 'de' }));
        });

        it('should ignore stored values that are not objects', async () => {
            const defaults: AppSettings = PreferencesService.defaultSettings({ sourceLanguage: AUTO_LANGUAGE, targetLanguage: 'de' });

            storage.set(SETTINGS_KEY, '"settings"');
            await expect(service.load('de-DE')).resolves.toEqual(defaults);

            storage.set(SETTINGS_KEY, '[1, 2]');
            await expect(service.load('de-DE')).resolves.toEqual(defaults);

            storage.set(SETTINGS_KEY, 'null');
            await expect(service.load('de-DE')).resolves.toEqual(defaults);
        });

        it('should drop unknown keys and values with the wrong type', async () => {
            storage.set(SETTINGS_KEY, JSON.stringify({
                analysesPerSecond: 'fast',
                legacyTheme: 'dark',
                regionGranularity: 'WORD',
                showDebugRegions: true,
                sourceLanguage: 7,
            }));

            const settings: AppSettings = await service.load('es-ES');

            expect(settings).toEqual({
                ...PreferencesService.defaultSettings({ sourceLanguage: AUTO_LANGUAGE, targetLanguage: 'es' }),
                showDebugRegions: true,
            });
            expect('legacyTheme' in settings).toBe(false);
        });

        it('should keep a valid stored granularity', async () => {
            storage.set(SETTINGS_REVISION_KEY, '3');
            storage.set(SETTINGS_KEY, JSON.stringify({ regionGranularity: RegionGranularity.BLOCK }));

            const settings: AppSettings = await service.load('en-US');

            expect(settings.regionGranularity).toBe(RegionGranularity.BLOCK);
        });

        it('should move the settings stored before the paragraph default to paragraph granularity once', async () => {
            storage.set(SETTINGS_KEY, JSON.stringify({ languageConfirmedFor: 'pt', regionGranularity: RegionGranularity.BLOCK }));

            const settings: AppSettings = await service.load('pt-BR');

            expect(settings.regionGranularity).toBe(RegionGranularity.BLOCK);
            expect(settings.languageConfirmedFor).toBe('pt');
            expect(storage.get(SETTINGS_REVISION_KEY)).toBe('3');
            expect('regionGranularity' in storedSettings()).toBe(false);

            await service.update({ regionGranularity: RegionGranularity.BLOCK });

            await expect(service.load('pt-BR')).resolves.toEqual(expect.objectContaining({ regionGranularity: RegionGranularity.BLOCK }));
        });

        it('should only record the revision on a fresh install', async () => {
            await service.load('pt-BR');

            expect(storage.get(SETTINGS_REVISION_KEY)).toBe('3');
            expect(storage.has(SETTINGS_KEY)).toBe(false);
        });

        it('should keep the stored settings when the revision cannot be read', async () => {
            storage.set(SETTINGS_KEY, JSON.stringify({ regionGranularity: RegionGranularity.BLOCK }));
            preferencesPluginStub.get
                .mockImplementationOnce(async (options: GetOptions): Promise<GetResult> => ({ value: storage.get(options.key) ?? null }))
                .mockRejectedValueOnce(new Error('storage unavailable'));

            const settings: AppSettings = await service.load('en-US');

            expect(settings.regionGranularity).toBe(RegionGranularity.BLOCK);
        });

        it('should fall back to the defaults when reading fails', async () => {
            preferencesPluginStub.get.mockRejectedValueOnce(new Error('storage unavailable'));

            const settings: AppSettings = await service.load('it-IT');

            expect(settings).toEqual(PreferencesService.defaultSettings({ sourceLanguage: AUTO_LANGUAGE, targetLanguage: 'it' }));
        });

        it('should use English as target for unsupported device languages', async () => {
            const settings: AppSettings = await service.load('xx-YY');

            expect(settings.targetLanguage).toBe('en');
            expect(settings.sourceLanguage).toBe(AUTO_LANGUAGE);
        });

        it('should drop the obsolete onboarding flag and keep the confirmed language', async () => {
            storage.set(SETTINGS_KEY, JSON.stringify({ languageConfirmedFor: 'ja', onboardingCompleted: true, sourceLanguage: 'es' }));

            const settings: AppSettings = await service.load('ja-JP');

            expect('onboardingCompleted' in settings).toBe(false);
            expect(settings.languageConfirmedFor).toBe('ja');
            expect(settings.sourceLanguage).toBe('es');
            expect(settings.targetLanguage).toBe('ja');
        });

        it('should drop a confirmed language with the wrong type', async () => {
            storage.set(SETTINGS_KEY, JSON.stringify({ languageConfirmedFor: true }));

            const settings: AppSettings = await service.load('pt-BR');

            expect(settings.languageConfirmedFor).toBe(EMPTY);
        });
    });

    describe('update', () => {
        it('should persist, emit and return the merged settings', async () => {
            const emitted: AppSettings[] = [];
            const subscription: Subscription = service.settingsChanges().subscribe((settings: AppSettings) => emitted.push(settings));

            await service.load('pt-BR');

            const settings: AppSettings = await service.update({ languageConfirmedFor: 'pt', targetLanguage: 'fr' });

            expect(settings.languageConfirmedFor).toBe('pt');
            expect(settings.targetLanguage).toBe('fr');
            expect(settings.sourceLanguage).toBe(AUTO_LANGUAGE);
            expect(storedSettings()).toEqual(settings);
            expect(service.settings).toEqual(settings);
            expect(emitted[emitted.length - 1]).toEqual(settings);
            subscription.unsubscribe();
        });

        it('should not emit nor change the settings when persisting fails', async () => {
            const before: AppSettings = service.settings;
            const emitted: AppSettings[] = [];
            const subscription: Subscription = service.settingsChanges().subscribe((settings: AppSettings) => emitted.push(settings));

            preferencesPluginStub.set.mockRejectedValueOnce(new Error('quota exceeded'));

            await expect(service.update({ showDebugRegions: true })).rejects.toThrow('quota exceeded');

            expect(service.settings).toBe(before);
            expect(emitted.length).toBe(1);
            subscription.unsubscribe();
        });

        it('should keep working after a failed update', async () => {
            preferencesPluginStub.set.mockRejectedValueOnce(new Error('quota exceeded'));

            await expect(service.update({ showDebugRegions: true })).rejects.toThrow('quota exceeded');
            await service.update({ balloonFontScale: 1.2 });

            expect(service.settings.balloonFontScale).toBe(1.2);
            expect(service.settings.showDebugRegions).toBe(false);
        });

        it('should keep every change of concurrent updates', async () => {
            await Promise.all([
                service.update({ analysesPerSecond: 5 }),
                service.update({ balloonFontScale: 1.4 }),
            ]);

            expect(service.settings.analysesPerSecond).toBe(5);
            expect(service.settings.balloonFontScale).toBe(1.4);
            expect(storedSettings().analysesPerSecond).toBe(5);
            expect(storedSettings().balloonFontScale).toBe(1.4);
        });

        it('should apply updates issued while loading on top of the loaded settings', async () => {
            storage.set(SETTINGS_KEY, JSON.stringify({ languageConfirmedFor: 'fr' }));

            const loading: Promise<AppSettings> = service.load('fr-FR');
            const updating: Promise<AppSettings> = service.update({ showDebugRegions: true });

            await Promise.all([loading, updating]);

            expect(service.settings.languageConfirmedFor).toBe('fr');
            expect(service.settings.showDebugRegions).toBe(true);
            expect(service.settings.targetLanguage).toBe('fr');
        });
    });

    describe('reset', () => {
        it('should remove the stored settings and restore the device defaults', async () => {
            await service.load('pt-BR');
            await service.update({ languageConfirmedFor: 'pt', targetLanguage: 'fr' });

            await service.reset();

            expect(preferencesPluginStub.remove).toHaveBeenCalledWith({ key: SETTINGS_KEY });
            expect(storage.has(SETTINGS_KEY)).toBe(false);
            expect(service.settings).toEqual(PreferencesService.defaultSettings({ sourceLanguage: AUTO_LANGUAGE, targetLanguage: 'pt' }));
        });
    });

    it('should emit the current settings to new subscribers', () => {
        const emitted: AppSettings[] = [];
        const subscription: Subscription = service.settingsChanges().subscribe((settings: AppSettings) => emitted.push(settings));

        expect(emitted).toEqual([service.settings]);
        subscription.unsubscribe();
    });
});
