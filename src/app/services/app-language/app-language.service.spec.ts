import { TestBed } from '@angular/core/testing';
import { DevicePlugin, LanguageTag } from '@capacitor/device';
import { InterpolatableTranslationObject, InterpolationParameters, Translation, TranslateService, provideTranslateService } from '@ngx-translate/core';
import { Observable, Subject, Subscription, of, throwError } from 'rxjs';
import type { Mock, MockInstance } from 'vitest';
import { AppSettings, RegionGranularity, SwalLabels } from 'src/app/shared/models';
import { AUTO_LANGUAGE, EMPTY, SUPPORTED_APP_LANGUAGES, SwalUtils } from 'src/app/shared/utils';
import { DEVICE_PLUGIN } from '../capacitor/capacitor-plugins';
import { LoggerService } from '../logger/logger.service';
import { PreferencesService } from '../preferences/preferences.service';
import { AppLanguageService } from './app-language.service';

type UseFunction = (language: string) => Observable<InterpolatableTranslationObject>;

type InstantFunction = (key: string | string[], parameters?: InterpolationParameters) => Translation;

interface DevicePluginStub {
    getLanguageTag: Mock<() => Promise<LanguageTag>>;
}

interface LoggerServiceStub {
    error: Mock<(event: string, error: unknown) => void>;
}

interface PreferencesServiceStub {
    load: Mock<(deviceLanguageTag: string) => Promise<AppSettings>>;
    settings: AppSettings;
    update: Mock<(changes: Partial<AppSettings>) => Promise<AppSettings>>;
}

function createSettings(appLanguage: string): AppSettings {
    return {
        analysesPerSecond: 3,
        appLanguage: appLanguage,
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

describe('AppLanguageService', () => {
    let devicePluginStub: DevicePluginStub;
    let instantSpy: MockInstance<InstantFunction>;
    let loggerServiceStub: LoggerServiceStub;
    let originalDocumentLanguage: string;
    let originalLabels: SwalLabels;
    let preferencesServiceStub: PreferencesServiceStub;
    let service: AppLanguageService;
    let storedAppLanguage: string;
    let translateService: TranslateService;
    let useSpy: MockInstance<UseFunction>;

    beforeEach(() => {
        originalDocumentLanguage = document.documentElement.lang;
        originalLabels = SwalUtils.labels;
        storedAppLanguage = AUTO_LANGUAGE;
        devicePluginStub = { getLanguageTag: vi.fn(async (): Promise<LanguageTag> => ({ value: 'pt-BR' })) };
        loggerServiceStub = { error: vi.fn() };
        preferencesServiceStub = {
            load: vi.fn(async (): Promise<AppSettings> => createSettings(storedAppLanguage)),
            settings: createSettings(AUTO_LANGUAGE),
            update: vi.fn(async (changes: Partial<AppSettings>): Promise<AppSettings> => ({ ...createSettings(storedAppLanguage), ...changes })),
        };

        TestBed.configureTestingModule({
            providers: [
                provideTranslateService(),
                { provide: DEVICE_PLUGIN, useValue: devicePluginStub as unknown as DevicePlugin },
                { provide: LoggerService, useValue: loggerServiceStub },
                { provide: PreferencesService, useValue: preferencesServiceStub },
            ],
        });
        translateService = TestBed.inject(TranslateService);
        useSpy = vi.spyOn(translateService, 'use') as unknown as MockInstance<UseFunction>;
        useSpy.mockImplementation((): Observable<InterpolatableTranslationObject> => of({}));
        instantSpy = vi.spyOn(translateService, 'instant') as unknown as MockInstance<InstantFunction>;
        instantSpy.mockImplementation((key: string | string[]): Translation => `translated:${String(key)}`);
        service = TestBed.inject(AppLanguageService);
    });

    afterEach(() => {
        document.documentElement.lang = originalDocumentLanguage;
        SwalUtils.setLabels(originalLabels);
        vi.restoreAllMocks();
    });

    it('should start in English with no device language', () => {
        expect(service.currentLanguage).toBe('en');
        expect(service.deviceLanguageTag).toBe(EMPTY);
    });

    it('should expose the supported languages', () => {
        expect(service.supportedLanguages).toEqual(SUPPORTED_APP_LANGUAGES);
    });

    describe('initialize', () => {
        it('should use the primary subtag of a supported device language', async () => {
            await service.initialize();

            expect(service.deviceLanguageTag).toBe('pt-BR');
            expect(preferencesServiceStub.load).toHaveBeenCalledWith('pt-BR');
            expect(useSpy).toHaveBeenCalledWith('pt');
            expect(service.currentLanguage).toBe('pt');
        });

        it('should fall back to English for unsupported device languages', async () => {
            devicePluginStub.getLanguageTag.mockResolvedValueOnce({ value: 'ar-SA' });

            await service.initialize();

            expect(useSpy).toHaveBeenCalledWith('en');
            expect(service.currentLanguage).toBe('en');
        });

        it('should prefer the explicit preference over the device language', async () => {
            storedAppLanguage = 'fr';

            await service.initialize();

            expect(useSpy).toHaveBeenCalledWith('fr');
            expect(service.currentLanguage).toBe('fr');
        });

        it('should update the document language', async () => {
            await service.initialize();

            expect(document.documentElement.lang).toBe('pt');
        });

        it('should localize the dialog labels', async () => {
            await service.initialize();

            expect(SwalUtils.labels).toEqual({
                cancel: 'translated:common.cancel',
                confirm: 'translated:common.ok',
                errorTitle: 'translated:common.error',
                infoTitle: 'translated:common.info',
                successTitle: 'translated:common.success',
                warningTitle: 'translated:common.warning',
            });
        });

        it('should fall back to the browser language when the device plugin fails', async () => {
            devicePluginStub.getLanguageTag.mockRejectedValueOnce(new Error('unavailable'));
            vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('de-DE');

            await service.initialize();

            expect(service.deviceLanguageTag).toBe('de-DE');
            expect(service.currentLanguage).toBe('de');
        });

        it('should fall back to the browser language when the device returns an empty tag', async () => {
            devicePluginStub.getLanguageTag.mockResolvedValueOnce({ value: EMPTY });
            vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('it-IT');

            await service.initialize();

            expect(service.currentLanguage).toBe('it');
        });

        it('should fall back to English when the translations fail to load', async () => {
            useSpy.mockImplementationOnce((): Observable<InterpolatableTranslationObject> => throwError((): Error => new Error('404')));

            await service.initialize();

            expect(useSpy).toHaveBeenNthCalledWith(1, 'pt');
            expect(useSpy).toHaveBeenNthCalledWith(2, 'en');
            expect(service.currentLanguage).toBe('en');
            expect(document.documentElement.lang).toBe('en');
            expect(loggerServiceStub.error).toHaveBeenCalledWith('app-language-load-failed', expect.any(Error), { language: 'pt' });
        });

        it('should still finish when the English translations fail to load too', async () => {
            useSpy.mockImplementation((): Observable<InterpolatableTranslationObject> => throwError((): Error => new Error('offline')));

            await expect(service.initialize()).resolves.toBeUndefined();

            expect(service.currentLanguage).toBe('en');
            expect(loggerServiceStub.error).toHaveBeenCalledTimes(2);
        });

        it('should not retry English when English itself fails', async () => {
            devicePluginStub.getLanguageTag.mockResolvedValueOnce({ value: 'en-US' });
            useSpy.mockImplementation((): Observable<InterpolatableTranslationObject> => throwError((): Error => new Error('offline')));

            await service.initialize();

            expect(useSpy).toHaveBeenCalledTimes(1);
            expect(service.currentLanguage).toBe('en');
        });
    });

    describe('setPreference', () => {
        beforeEach(async () => {
            await service.initialize();
        });

        it('should persist and apply an explicit language', async () => {
            await service.setPreference('es');

            expect(preferencesServiceStub.update).toHaveBeenCalledWith({ appLanguage: 'es', targetLanguage: 'es' });
            expect(service.currentLanguage).toBe('es');
            expect(document.documentElement.lang).toBe('es');
        });

        it('should follow the device language again when set to automatic', async () => {
            await service.setPreference('es');
            await service.setPreference(AUTO_LANGUAGE);

            expect(preferencesServiceStub.update).toHaveBeenLastCalledWith({ appLanguage: AUTO_LANGUAGE, targetLanguage: 'pt' });
            expect(service.currentLanguage).toBe('pt');
        });

        it('should translate into English when the chosen language has no interface', async () => {
            await service.setPreference('ar');

            expect(preferencesServiceStub.update).toHaveBeenCalledWith({ appLanguage: 'ar', targetLanguage: 'en' });
            expect(service.currentLanguage).toBe('en');
        });

        it('should save the target language before applying the interface language', async () => {
            await service.setPreference('fr');

            const lastUse: number = useSpy.mock.invocationCallOrder[useSpy.mock.invocationCallOrder.length - 1];

            expect(preferencesServiceStub.update.mock.invocationCallOrder[0]).toBeLessThan(lastUse);
        });

        it('should detect the source automatically when it would equal the new target', async () => {
            preferencesServiceStub.settings = { ...createSettings(AUTO_LANGUAGE), sourceLanguage: 'es' };

            await service.setPreference('es');

            expect(preferencesServiceStub.update).toHaveBeenCalledWith({ appLanguage: 'es', sourceLanguage: AUTO_LANGUAGE, targetLanguage: 'es' });
        });

        it('should keep a manual source that differs from the new target', async () => {
            preferencesServiceStub.settings = { ...createSettings(AUTO_LANGUAGE), sourceLanguage: 'es' };

            await service.setPreference('de');

            expect(preferencesServiceStub.update).toHaveBeenCalledWith({ appLanguage: 'de', targetLanguage: 'de' });
        });

        it('should emit every applied language', async () => {
            const languages: string[] = [];
            const subscription: Subscription = service.changes().subscribe((language: string) => languages.push(language));

            await service.setPreference('it');

            expect(languages).toEqual(['pt', 'it']);
            subscription.unsubscribe();
        });

        it('should keep the latest choice when an older one finishes loading later', async () => {
            const slowItalian: Subject<InterpolatableTranslationObject> = new Subject<InterpolatableTranslationObject>();

            useSpy.mockImplementation((language: string): Observable<InterpolatableTranslationObject> =>
                language === 'it' ? slowItalian.asObservable() : of({}),
            );

            const italian: Promise<void> = service.setPreference('it');
            const spanish: Promise<void> = service.setPreference('es');

            await spanish;
            slowItalian.next({});
            await italian;

            expect(service.currentLanguage).toBe('es');
            expect(document.documentElement.lang).toBe('es');
        });

        it('should reject when the preference cannot be saved', async () => {
            preferencesServiceStub.update.mockRejectedValueOnce(new Error('storage full'));

            await expect(service.setPreference('fr')).rejects.toThrow('storage full');

            expect(service.currentLanguage).toBe('pt');
        });
    });

    describe('previewLanguage', () => {
        beforeEach(async () => {
            await service.initialize();
        });

        it('should apply a language without saving it', async () => {
            await service.previewLanguage('fr');

            expect(useSpy).toHaveBeenLastCalledWith('fr');
            expect(service.currentLanguage).toBe('fr');
            expect(document.documentElement.lang).toBe('fr');
            expect(preferencesServiceStub.update).not.toHaveBeenCalled();
        });

        it('should use the primary subtag of a regional tag', async () => {
            await service.previewLanguage('de-AT');

            expect(service.currentLanguage).toBe('de');
        });

        it('should show languages without an interface in English', async () => {
            await service.previewLanguage('ar');

            expect(service.currentLanguage).toBe('en');
            expect(document.documentElement.lang).toBe('en');
        });

        it('should follow the device language when automatic', async () => {
            await service.previewLanguage('it');
            await service.previewLanguage(AUTO_LANGUAGE);

            expect(service.currentLanguage).toBe('pt');
        });

        it('should localize the dialog labels again', async () => {
            SwalUtils.setLabels(originalLabels);

            await service.previewLanguage('es');

            expect(SwalUtils.labels.confirm).toBe('translated:common.ok');
            expect(SwalUtils.labels.cancel).toBe('translated:common.cancel');
        });

        it('should emit the previewed language', async () => {
            const languages: string[] = [];
            const subscription: Subscription = service.changes().subscribe((language: string) => languages.push(language));

            await service.previewLanguage('it');

            expect(languages).toEqual(['pt', 'it']);
            subscription.unsubscribe();
        });

        it('should be replaced by a preference saved while it was loading', async () => {
            const slowItalian: Subject<InterpolatableTranslationObject> = new Subject<InterpolatableTranslationObject>();

            useSpy.mockImplementation((language: string): Observable<InterpolatableTranslationObject> =>
                language === 'it' ? slowItalian.asObservable() : of({}),
            );

            const preview: Promise<void> = service.previewLanguage('it');
            await service.setPreference('es');
            slowItalian.next({});
            await preview;

            expect(service.currentLanguage).toBe('es');
        });
    });

    describe('refreshDeviceLanguage', () => {
        beforeEach(async () => {
            await service.initialize();
        });

        it('should read the device language again without changing the interface', async () => {
            devicePluginStub.getLanguageTag.mockResolvedValueOnce({ value: 'fr-FR' });

            await expect(service.refreshDeviceLanguage()).resolves.toBe('fr-FR');

            expect(service.deviceLanguageTag).toBe('fr-FR');
            expect(service.currentLanguage).toBe('pt');
            expect(preferencesServiceStub.load).toHaveBeenCalledTimes(1);
        });

        it('should make automatic previews follow the new device language', async () => {
            devicePluginStub.getLanguageTag.mockResolvedValueOnce({ value: 'it-IT' });

            await service.refreshDeviceLanguage();
            await service.previewLanguage(AUTO_LANGUAGE);

            expect(service.currentLanguage).toBe('it');
        });

        it('should fall back to the browser language when the device plugin fails', async () => {
            devicePluginStub.getLanguageTag.mockRejectedValueOnce(new Error('unavailable'));
            vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('es-MX');

            await expect(service.refreshDeviceLanguage()).resolves.toBe('es-MX');
        });
    });

    describe('instant', () => {
        it('should delegate to the translate service and return a string', () => {
            const text: string = service.instant('languages.downloadSuccess', { language: 'Português' });

            expect(text).toBe('translated:languages.downloadSuccess');
            expect(instantSpy).toHaveBeenCalledWith('languages.downloadSuccess', { language: 'Português' });
        });
    });
});
