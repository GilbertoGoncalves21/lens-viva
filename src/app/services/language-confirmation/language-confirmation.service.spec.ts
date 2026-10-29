import { TestBed } from '@angular/core/testing';
import { SweetAlertIcon } from 'sweetalert2';
import type { Mock, MockInstance } from 'vitest';
import { AppSettings, RegionGranularity } from 'src/app/shared/models';
import { AUTO_LANGUAGE, EMPTY, SwalUtils, UNDETERMINED_LANGUAGE } from 'src/app/shared/utils';
import { AppLanguageService } from '../app-language/app-language.service';
import { LoggerService } from '../logger/logger.service';
import { PreferencesService } from '../preferences/preferences.service';
import { LanguageConfirmationService } from './language-confirmation.service';

type ChoiceDialogFunction = (title: string, message: string, confirmText: string, cancelText: string, icon?: SweetAlertIcon) => Promise<boolean | null>;

type SelectDialogFunction = (
    title: string,
    message: string,
    options: Record<string, string>,
    selectedValue: string,
    confirmText: string,
    cancelText: string,
) => Promise<string | null>;

interface AppLanguageServiceStub {
    deviceLanguageTag: string;
    instant: Mock<(key: string, parameters?: Record<string, string>) => string>;
    previewLanguage: Mock<(language: string) => Promise<void>>;
    refreshDeviceLanguage: Mock<() => Promise<string>>;
    setPreference: Mock<(appLanguage: string) => Promise<void>>;
}

interface Deferred<T> {
    promise: Promise<T>;
    reject: (reason: unknown) => void;
    resolve: (value: T) => void;
}

interface LoggerServiceStub {
    error: Mock<(event: string, error: unknown) => void>;
}

interface PreferencesServiceStub {
    settings: AppSettings;
    update: Mock<(changes: Partial<AppSettings>) => Promise<AppSettings>>;
}

const SORTED_LANGUAGE_OPTIONS: Record<string, string> = {
    de: 'Deutsch',
    en: 'English',
    es: 'Español',
    fr: 'Français',
    it: 'Italiano',
    pt: 'Português',
                    ja: '日本語',
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

function createSettings(languageConfirmedFor: string): AppSettings {
    return {
        analysesPerSecond: 3,
        appLanguage: AUTO_LANGUAGE,
        balloonFontScale: 1,
        historyEnabled: false,
        languageConfirmedFor: languageConfirmedFor,
        regionGranularity: RegionGranularity.BLOCK,
        requireWifiForDownloads: false,
        showDebugRegions: false,
        sourceLanguage: AUTO_LANGUAGE,
        targetLanguage: 'en',
    };
}

describe('LanguageConfirmationService', () => {
    let appLanguageServiceStub: AppLanguageServiceStub;
    let choiceDialogSpy: MockInstance<ChoiceDialogFunction>;
    let loggerServiceStub: LoggerServiceStub;
    let preferencesServiceStub: PreferencesServiceStub;
    let selectDialogSpy: MockInstance<SelectDialogFunction>;
    let service: LanguageConfirmationService;

    beforeEach(() => {
        appLanguageServiceStub = {
            deviceLanguageTag: 'pt-BR',
            instant: vi.fn((key: string, parameters?: Record<string, string>): string =>
                parameters ? `${key}|${JSON.stringify(parameters)}` : key,
            ),
            previewLanguage: vi.fn(async (): Promise<void> => undefined),
            refreshDeviceLanguage: vi.fn(async (): Promise<string> => appLanguageServiceStub.deviceLanguageTag),
            setPreference: vi.fn(async (): Promise<void> => undefined),
        };
        loggerServiceStub = { error: vi.fn() };
        preferencesServiceStub = {
            settings: createSettings(EMPTY),
            update: vi.fn(async (changes: Partial<AppSettings>): Promise<AppSettings> => {
                preferencesServiceStub.settings = { ...preferencesServiceStub.settings, ...changes };

                return preferencesServiceStub.settings;
            }),
        };
        choiceDialogSpy = vi.spyOn(SwalUtils, 'showChoiceDialog').mockResolvedValue(true) as unknown as MockInstance<ChoiceDialogFunction>;
        selectDialogSpy = vi.spyOn(SwalUtils, 'showSelectDialog').mockResolvedValue(null) as unknown as MockInstance<SelectDialogFunction>;

        TestBed.configureTestingModule({
            providers: [
                { provide: AppLanguageService, useValue: appLanguageServiceStub },
                { provide: LoggerService, useValue: loggerServiceStub },
                { provide: PreferencesService, useValue: preferencesServiceStub },
            ],
        });
        service = TestBed.inject(LanguageConfirmationService);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('device language', () => {
        it('should use the primary subtag of the device language', () => {
            expect(service.deviceLanguage).toBe('pt');
        });

        it('should resolve language aliases', () => {
            appLanguageServiceStub.deviceLanguageTag = 'nb-NO';

            expect(service.deviceLanguage).toBe('no');
        });

        it('should identify the languages the app is translated into', () => {
            ['de-DE', 'en-US', 'es-419', 'fr-CA', 'it-IT', 'pt-PT'].forEach((languageTag: string) => {
                appLanguageServiceStub.deviceLanguageTag = languageTag;

                expect(service.identified).toBe(true);
            });
        });

        it('should not identify other languages', () => {
            appLanguageServiceStub.deviceLanguageTag = 'ar-SA';

            expect(service.identified).toBe(false);

            appLanguageServiceStub.deviceLanguageTag = EMPTY;

            expect(service.identified).toBe(false);
        });

        it('should suggest the device language when identified', () => {
            appLanguageServiceStub.deviceLanguageTag = 'fr-FR';

            expect(service.suggestedLanguage).toBe('fr');
        });

        it('should suggest English when the device language is not identified', () => {
            appLanguageServiceStub.deviceLanguageTag = 'ar-SA';

            expect(service.suggestedLanguage).toBe('en');
        });
    });

    describe('needsConfirmation', () => {
        it('should be needed when no language was ever confirmed', () => {
            expect(service.needsConfirmation).toBe(true);
        });

        it('should not be needed when the device language was confirmed', () => {
            preferencesServiceStub.settings = createSettings('pt');

            expect(service.needsConfirmation).toBe(false);
        });

        it('should be needed again when the device language changed', () => {
            preferencesServiceStub.settings = createSettings('pt');
            appLanguageServiceStub.deviceLanguageTag = 'de-DE';

            expect(service.needsConfirmation).toBe(true);
        });

        it('should compare an unknown device language as undetermined', () => {
            appLanguageServiceStub.deviceLanguageTag = EMPTY;
            preferencesServiceStub.settings = createSettings(UNDETERMINED_LANGUAGE);

            expect(service.needsConfirmation).toBe(false);
        });
    });

    describe('confirmIfNeeded', () => {
        it('should not ask anything when the device language was already confirmed', async () => {
            preferencesServiceStub.settings = createSettings('pt');

            await service.confirmIfNeeded();

            expect(appLanguageServiceStub.refreshDeviceLanguage).toHaveBeenCalledTimes(1);
            expect(appLanguageServiceStub.previewLanguage).not.toHaveBeenCalled();
            expect(choiceDialogSpy).not.toHaveBeenCalled();
            expect(preferencesServiceStub.update).not.toHaveBeenCalled();
        });

        it('should show the identified language in the device language before asking', async () => {
            await service.confirmIfNeeded();

            expect(appLanguageServiceStub.previewLanguage).toHaveBeenCalledWith('pt');
            expect(appLanguageServiceStub.previewLanguage.mock.invocationCallOrder[0]).toBeLessThan(choiceDialogSpy.mock.invocationCallOrder[0]);
            expect(choiceDialogSpy).toHaveBeenCalledWith(
                'languageConfirmation.identifiedTitle',
                'languageConfirmation.identifiedMessage|{"language":"português"}',
                'languageConfirmation.continue',
                'languageConfirmation.chooseAnother',
                'success',
            );
        });

        it('should offer English in English when the device language is not identified', async () => {
            appLanguageServiceStub.deviceLanguageTag = 'ar-SA';

            await service.confirmIfNeeded();

            expect(appLanguageServiceStub.previewLanguage).toHaveBeenCalledWith('en');
            expect(choiceDialogSpy).toHaveBeenCalledWith(
                'languageConfirmation.unidentifiedTitle',
                'languageConfirmation.unidentifiedMessage|{"language":"English"}',
                'languageConfirmation.continue',
                'languageConfirmation.chooseAnother',
                'info',
            );
        });

        it('should save the identified language as app language and confirm it for the device', async () => {
            await service.confirmIfNeeded();

            expect(appLanguageServiceStub.setPreference).toHaveBeenCalledWith('pt');
            expect(preferencesServiceStub.update).toHaveBeenCalledWith({ languageConfirmedFor: 'pt' });
            expect(appLanguageServiceStub.setPreference.mock.invocationCallOrder[0]).toBeLessThan(preferencesServiceStub.update.mock.invocationCallOrder[0]);
            expect(selectDialogSpy).not.toHaveBeenCalled();
            expect(service.needsConfirmation).toBe(false);
        });

        it('should save English and confirm it for the unidentified device language', async () => {
            appLanguageServiceStub.deviceLanguageTag = 'ar-SA';

            await service.confirmIfNeeded();

            expect(appLanguageServiceStub.setPreference).toHaveBeenCalledWith('en');
            expect(preferencesServiceStub.update).toHaveBeenCalledWith({ languageConfirmedFor: 'ar' });
        });

        it('should confirm an unknown device language as undetermined', async () => {
            appLanguageServiceStub.deviceLanguageTag = EMPTY;

            await service.confirmIfNeeded();

            expect(appLanguageServiceStub.previewLanguage).toHaveBeenCalledWith('en');
            expect(appLanguageServiceStub.setPreference).toHaveBeenCalledWith('en');
            expect(preferencesServiceStub.update).toHaveBeenCalledWith({ languageConfirmedFor: UNDETERMINED_LANGUAGE });
        });

        it('should let the user choose another app language', async () => {
            choiceDialogSpy.mockResolvedValueOnce(false);
            selectDialogSpy.mockResolvedValueOnce('fr');

            await service.confirmIfNeeded();

            expect(selectDialogSpy).toHaveBeenCalledWith(
                'languageConfirmation.selectTitle',
                'languageConfirmation.selectMessage',
                SORTED_LANGUAGE_OPTIONS,
                'pt',
                'languageConfirmation.select',
                'common.back',
            );
            expect(appLanguageServiceStub.setPreference).toHaveBeenCalledWith('fr');
            expect(preferencesServiceStub.update).toHaveBeenCalledWith({ languageConfirmedFor: 'pt' });
        });

        it('should list the seven app languages by their own names in alphabetical order', async () => {
            choiceDialogSpy.mockResolvedValueOnce(false);
            selectDialogSpy.mockResolvedValueOnce('de');

            await service.confirmIfNeeded();

            const options: Record<string, string> = selectDialogSpy.mock.calls[0][2];

            expect(Object.keys(options)).toEqual(['de', 'en', 'es', 'fr', 'it', 'pt', 'ja']);
            expect(Object.values(options)).toEqual(['Deutsch', 'English', 'Español', 'Français', 'Italiano', 'Português', '日本語']);
        });

        it('should preselect English when the device language is not identified', async () => {
            appLanguageServiceStub.deviceLanguageTag = 'ar-SA';
            choiceDialogSpy.mockResolvedValueOnce(false);
            selectDialogSpy.mockResolvedValueOnce('it');

            await service.confirmIfNeeded();

            expect(selectDialogSpy.mock.calls[0][3]).toBe('en');
            expect(appLanguageServiceStub.setPreference).toHaveBeenCalledWith('it');
            expect(preferencesServiceStub.update).toHaveBeenCalledWith({ languageConfirmedFor: 'ar' });
        });

        it('should go back to the first question when the selection is cancelled', async () => {
            choiceDialogSpy.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
            selectDialogSpy.mockResolvedValueOnce(null);

            await service.confirmIfNeeded();

            expect(choiceDialogSpy).toHaveBeenCalledTimes(2);
            expect(selectDialogSpy).toHaveBeenCalledTimes(1);
            expect(appLanguageServiceStub.setPreference).toHaveBeenCalledTimes(1);
            expect(appLanguageServiceStub.setPreference).toHaveBeenCalledWith('pt');
        });

        it('should allow choosing another language after going back', async () => {
            choiceDialogSpy.mockResolvedValueOnce(false).mockResolvedValueOnce(false);
            selectDialogSpy.mockResolvedValueOnce(null).mockResolvedValueOnce('es');

            await service.confirmIfNeeded();

            expect(choiceDialogSpy).toHaveBeenCalledTimes(2);
            expect(selectDialogSpy).toHaveBeenCalledTimes(2);
            expect(appLanguageServiceStub.setPreference).toHaveBeenCalledWith('es');
        });

        it('should ask the same question again when another dialog replaces it', async () => {
            choiceDialogSpy.mockResolvedValueOnce(null).mockResolvedValueOnce(true);

            await service.confirmIfNeeded();

            expect(choiceDialogSpy).toHaveBeenCalledTimes(2);
            expect(choiceDialogSpy.mock.calls[1]).toEqual(choiceDialogSpy.mock.calls[0]);
            expect(selectDialogSpy).not.toHaveBeenCalled();
            expect(appLanguageServiceStub.setPreference).toHaveBeenCalledTimes(1);
            expect(appLanguageServiceStub.setPreference).toHaveBeenCalledWith('pt');
            expect(preferencesServiceStub.update).toHaveBeenCalledWith({ languageConfirmedFor: 'pt' });
        });

        it('should keep asking while the question keeps being replaced', async () => {
            choiceDialogSpy.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(true);

            await service.confirmIfNeeded();

            expect(choiceDialogSpy).toHaveBeenCalledTimes(3);
            expect(selectDialogSpy).not.toHaveBeenCalled();
            expect(appLanguageServiceStub.setPreference).toHaveBeenCalledWith('pt');
        });

        it('should open the selection only after the user explicitly chooses another language', async () => {
            choiceDialogSpy.mockResolvedValueOnce(null).mockResolvedValueOnce(false);
            selectDialogSpy.mockResolvedValueOnce('it');

            await service.confirmIfNeeded();

            expect(choiceDialogSpy).toHaveBeenCalledTimes(2);
            expect(selectDialogSpy).toHaveBeenCalledTimes(1);
            expect(choiceDialogSpy.mock.invocationCallOrder[1]).toBeLessThan(selectDialogSpy.mock.invocationCallOrder[0]);
            expect(appLanguageServiceStub.setPreference).toHaveBeenCalledWith('it');
        });

        it('should not save anything while the question has not been answered', async () => {
            const answer: Deferred<boolean | null> = createDeferred<boolean | null>();
            choiceDialogSpy.mockResolvedValueOnce(null).mockReturnValueOnce(answer.promise);

            const confirmation: Promise<void> = service.confirmIfNeeded();

            await vi.waitFor((): void => expect(choiceDialogSpy).toHaveBeenCalledTimes(2));

            expect(appLanguageServiceStub.setPreference).not.toHaveBeenCalled();
            expect(preferencesServiceStub.update).not.toHaveBeenCalled();
            expect(service.needsConfirmation).toBe(true);

            answer.resolve(true);
            await confirmation;

            expect(appLanguageServiceStub.setPreference).toHaveBeenCalledWith('pt');
        });

        it('should ask again when the device language changes', async () => {
            await service.confirmIfNeeded();

            appLanguageServiceStub.deviceLanguageTag = 'fr-FR';
            await service.confirmIfNeeded();

            expect(choiceDialogSpy).toHaveBeenCalledTimes(2);
            expect(choiceDialogSpy.mock.calls[1][1]).toBe('languageConfirmation.identifiedMessage|{"language":"français"}');
            expect(appLanguageServiceStub.previewLanguage).toHaveBeenLastCalledWith('fr');
            expect(appLanguageServiceStub.setPreference).toHaveBeenLastCalledWith('fr');
            expect(preferencesServiceStub.settings.languageConfirmedFor).toBe('fr');
        });

        it('should ask again when an unidentified device language changes to another one', async () => {
            appLanguageServiceStub.deviceLanguageTag = 'ar-SA';
            await service.confirmIfNeeded();

            appLanguageServiceStub.deviceLanguageTag = 'ko-KR';
            await service.confirmIfNeeded();

            expect(choiceDialogSpy).toHaveBeenCalledTimes(2);
            expect(preferencesServiceStub.settings.languageConfirmedFor).toBe('ko');
        });

        it('should not ask again when only the region changes', async () => {
            await service.confirmIfNeeded();

            appLanguageServiceStub.deviceLanguageTag = 'pt-PT';
            await service.confirmIfNeeded();

            expect(choiceDialogSpy).toHaveBeenCalledTimes(1);
        });

        it('should read the device language again before deciding', async () => {
            preferencesServiceStub.settings = createSettings('pt');
            appLanguageServiceStub.refreshDeviceLanguage.mockImplementationOnce(async (): Promise<string> => {
                appLanguageServiceStub.deviceLanguageTag = 'de-DE';

                return 'de-DE';
            });

            await service.confirmIfNeeded();

            expect(appLanguageServiceStub.previewLanguage).toHaveBeenCalledWith('de');
            expect(preferencesServiceStub.update).toHaveBeenCalledWith({ languageConfirmedFor: 'de' });
        });

        it('should return the same pending confirmation to every caller', async () => {
            const answer: Deferred<boolean> = createDeferred<boolean>();
            choiceDialogSpy.mockReturnValueOnce(answer.promise);

            const first: Promise<void> = service.confirmIfNeeded();
            const second: Promise<void> = service.confirmIfNeeded();

            expect(second).toBe(first);

            await vi.waitFor((): void => expect(choiceDialogSpy).toHaveBeenCalled());
            answer.resolve(true);
            await Promise.all([first, second]);

            expect(appLanguageServiceStub.refreshDeviceLanguage).toHaveBeenCalledTimes(1);
            expect(choiceDialogSpy).toHaveBeenCalledTimes(1);
            expect(appLanguageServiceStub.setPreference).toHaveBeenCalledTimes(1);
        });

        it('should start a new check once the previous one has finished', async () => {
            preferencesServiceStub.settings = createSettings('pt');

            const first: Promise<void> = service.confirmIfNeeded();
            await first;
            const second: Promise<void> = service.confirmIfNeeded();
            await second;

            expect(second).not.toBe(first);
            expect(appLanguageServiceStub.refreshDeviceLanguage).toHaveBeenCalledTimes(2);
        });

        it('should log and swallow a failure to save the language', async () => {
            const failure: Error = new Error('storage full');
            appLanguageServiceStub.setPreference.mockRejectedValueOnce(failure);

            await expect(service.confirmIfNeeded()).resolves.toBeUndefined();

            expect(loggerServiceStub.error).toHaveBeenCalledWith('language-confirmation-failed', failure);
            expect(preferencesServiceStub.update).not.toHaveBeenCalled();
            expect(service.needsConfirmation).toBe(true);
        });

        it('should log and swallow a failure to save the confirmation', async () => {
            const failure: Error = new Error('storage full');
            preferencesServiceStub.update.mockRejectedValueOnce(failure);

            await expect(service.confirmIfNeeded()).resolves.toBeUndefined();

            expect(loggerServiceStub.error).toHaveBeenCalledWith('language-confirmation-failed', failure);
        });

        it('should log and swallow a dialog failure', async () => {
            const failure: Error = new Error('dialog unavailable');
            choiceDialogSpy.mockRejectedValueOnce(failure);

            await expect(service.confirmIfNeeded()).resolves.toBeUndefined();

            expect(loggerServiceStub.error).toHaveBeenCalledWith('language-confirmation-failed', failure);
            expect(appLanguageServiceStub.setPreference).not.toHaveBeenCalled();
        });

        it('should ask again on the next call after a failure', async () => {
            appLanguageServiceStub.setPreference.mockRejectedValueOnce(new Error('storage full'));

            await service.confirmIfNeeded();
            await service.confirmIfNeeded();

            expect(choiceDialogSpy).toHaveBeenCalledTimes(2);
            expect(preferencesServiceStub.settings.languageConfirmedFor).toBe('pt');
        });
    });
});
