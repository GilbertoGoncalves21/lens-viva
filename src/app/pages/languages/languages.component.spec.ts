import { NgTemplateOutlet } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA, Directive, forwardRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService, provideTranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { SweetAlertIcon } from 'sweetalert2';
import { Mock, MockInstance } from 'vitest';
import 'src/app/pages/pages.module';
import { AppLanguageService } from 'src/app/services/app-language/app-language.service';
import { LanguageModelService } from 'src/app/services/language-model/language-model.service';
import { LensEngineService } from 'src/app/services/lens-engine/lens-engine.service';
import { LoggerService } from 'src/app/services/logger/logger.service';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { AppSettings, EngineCapabilities, LanguageModelInfo, ModelInventory } from 'src/app/shared/models';
import { LanguageNamePipe } from 'src/app/shared/pipe';
import { AUTO_LANGUAGE, EMPTY, IconUtils, RECOGNITION_SOURCE_LANGUAGES, LanguageUtils, SwalUtils } from 'src/app/shared/utils';
import { LanguagesComponent } from './languages.component';

@Directive({
    selector: 'ion-select[formControlName]',
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => SelectValueAccessorStubDirective),
            multi: true,
        },
    ],
    standalone: false,
})
class SelectValueAccessorStubDirective implements ControlValueAccessor {
    private _value: string = EMPTY;

    get value(): string {
        return this._value;
    }

    registerOnChange(): void {}

    registerOnTouched(): void {}

    writeValue(value: string): void {
        this._value = value;
    }
}

interface SelectOptionElement extends HTMLElement {
    value: string;
}

interface AppLanguageServiceFake {
    changes: Mock<() => Observable<string>>;
    currentLanguage: string;
    instant: Mock<(key: string, parameters?: Record<string, string>) => string>;
}

interface LanguageModelServiceFake {
    changes: Mock<() => Observable<ModelInventory>>;
    download: Mock<(language: string, requireWifi: boolean) => Promise<void>>;
    refresh: Mock<() => Promise<string[]>>;
    remove: Mock<(language: string) => Promise<void>>;
}

interface LensEngineServiceFake {
    getCapabilities: Mock<() => Promise<EngineCapabilities>>;
}

interface LoggerServiceFake {
    error: Mock<(event: string, error: unknown) => void>;
}

interface PreferencesServiceFake {
    settings: AppSettings;
    settingsChanges: Mock<() => Observable<AppSettings>>;
    update: Mock<(changes: Partial<AppSettings>) => Promise<AppSettings>>;
}

interface RouterFake {
    navigateByUrl: Mock<(url: string) => Promise<boolean>>;
}

function createCapabilities(changes: Partial<EngineCapabilities> = {}): EngineCapabilities {
    return {
        cameraSelection: false,
        languageIdentification: true,
        modelRemoval: true,
        openAppSettings: true,
        translation: true,
        ...changes,
    };
}

function createCodedError(code: string): Error {
    return Object.assign(new Error(code), { code: code });
}

describe('LanguagesComponent', () => {
    let appLanguageService: AppLanguageServiceFake;
    let component: LanguagesComponent;
    let confirmationSpy: MockInstance<(title: string, message: string, confirmText?: string, icon?: SweetAlertIcon, destructive?: boolean) => Promise<boolean>>;
    let currentSettings: AppSettings;
    let errorMessageSpy: MockInstance<(message: string) => void>;
    let fixture: ComponentFixture<LanguagesComponent>;
    let inventory$: BehaviorSubject<ModelInventory>;
    let language$: BehaviorSubject<string>;
    let languageModelService: LanguageModelServiceFake;
    let lensEngineService: LensEngineServiceFake;
    let loadingResultSpy: MockInstance<(icon: SweetAlertIcon, message: string) => Promise<void>>;
    let loadingSpy: MockInstance<(visible: boolean, message?: string) => void>;
    let loggerService: LoggerServiceFake;
    let preferencesService: PreferencesServiceFake;
    let router: RouterFake;
    let settings$: BehaviorSubject<AppSettings>;
    let successMessageSpy: MockInstance<(message: string) => Promise<void>>;
    let warningMessageSpy: MockInstance<(message: string) => void>;

    const renderComponent: () => void = (): void => {
        fixture = TestBed.createComponent(LanguagesComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    };

    const createComponent: () => Promise<void> = async (): Promise<void> => {
        renderComponent();
        await flushPromises();
    };

    const flushPromises: () => Promise<void> = (): Promise<void> =>
        new Promise<void>((resolve: () => void) => setTimeout(resolve, 0));

    const changeSettings: (changes: Partial<AppSettings>) => void = (changes: Partial<AppSettings>): void => {
        currentSettings = { ...currentSettings, ...changes };
        settings$.next(currentSettings);
    };

    const accessibleLabel: (button: HTMLElement) => string | null = (button: HTMLElement): string | null =>
        button.getAttribute('aria-label')
            ?? button.shadowRoot?.querySelector<HTMLElement>('.button-native')?.getAttribute('aria-label')
            ?? null;

    const findButtons: (ariaLabel: string) => HTMLElement[] = (ariaLabel: string): HTMLElement[] =>
        Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('ion-button'))
            .filter((button: HTMLElement) => accessibleLabel(button) === ariaLabel);

    const findOpenCameraButton: () => HTMLElement | undefined = (): HTMLElement | undefined =>
        Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('ion-button'))
            .find((button: HTMLElement) => (button.textContent ?? EMPTY).includes('languages.openCamera'));

    const findSectionButtons: (titleId: string, ariaLabel: string) => HTMLElement[] = (titleId: string, ariaLabel: string): HTMLElement[] =>
        Array.from(document.getElementById(titleId)?.closest('section')?.querySelectorAll<HTMLElement>('ion-button') ?? [])
            .filter((button: HTMLElement) => accessibleLabel(button) === ariaLabel);

    const findItemByText: (text: string) => HTMLElement | undefined = (text: string): HTMLElement | undefined =>
        Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('ion-item'))
            .find((item: HTMLElement) => (item.textContent ?? EMPTY).includes(text));

    const findModelItem: (titleId: string, languageName: string) => HTMLElement | undefined = (titleId: string, languageName: string): HTMLElement | undefined =>
        Array.from(document.getElementById(titleId)?.closest('section')?.querySelectorAll<HTMLElement>('ion-item') ?? [])
            .find((item: HTMLElement) => item.querySelector('h3')?.textContent?.trim() === languageName);

    const modelLanguage: (model: LanguageModelInfo) => string = (model: LanguageModelInfo): string => model.language;

    const optionValue: (option: SelectOptionElement) => string = (option: SelectOptionElement): string => option.value;

    const recognitionLanguagesFor: (targetLanguage: string, displayLanguage: string) => string[] = (targetLanguage: string, displayLanguage: string): string[] =>
        LanguageUtils.sortByDisplayName(
            RECOGNITION_SOURCE_LANGUAGES.filter((language: string) => language !== 'en' && language !== targetLanguage),
            displayLanguage,
        );

    const pageText: () => string = (): string => (fixture.nativeElement as HTMLElement).textContent ?? EMPTY;

    const readableLanguagesFor: (targetLanguage: string, displayLanguage: string) => string[] = (targetLanguage: string, displayLanguage: string): string[] =>
        LanguageUtils.sortByDisplayName(
            RECOGNITION_SOURCE_LANGUAGES.filter((language: string) => language !== targetLanguage),
            displayLanguage,
        );

    const selectOptions: (controlName: string) => SelectOptionElement[] = (controlName: string): SelectOptionElement[] =>
        Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<SelectOptionElement>(`select[formControlName="${controlName}"] option`));

    const useEnglishTranslations: () => Promise<void> = async (): Promise<void> => {
        const translateService: TranslateService = TestBed.inject(TranslateService);

        translateService.setTranslation('en', { languages: { translatingInto: 'Translating into {{language}}' } });
        await firstValueFrom(translateService.use('en'));
    };

    beforeEach(() => {
        currentSettings = {
            ...PreferencesService.defaultSettings({ sourceLanguage: 'es', targetLanguage: 'en' }),
            languageConfirmedFor: 'en',
        };
        settings$ = new BehaviorSubject<AppSettings>(currentSettings);
        inventory$ = new BehaviorSubject<ModelInventory>({ downloaded: ['en'], downloading: [] });
        language$ = new BehaviorSubject<string>('en');
        appLanguageService = {
            changes: vi.fn((): Observable<string> => language$.asObservable()),
            currentLanguage: 'en',
            instant: vi.fn((key: string): string => key),
        };
        languageModelService = {
            changes: vi.fn((): Observable<ModelInventory> => inventory$.asObservable()),
            download: vi.fn((): Promise<void> => Promise.resolve()),
            refresh: vi.fn((): Promise<string[]> => Promise.resolve(inventory$.value.downloaded)),
            remove: vi.fn((): Promise<void> => Promise.resolve()),
        };
        lensEngineService = {
            getCapabilities: vi.fn((): Promise<EngineCapabilities> => Promise.resolve(createCapabilities())),
        };
        loggerService = {
            error: vi.fn<(event: string, error: unknown) => void>(),
        };
        preferencesService = {
            get settings(): AppSettings {
                return currentSettings;
            },
            settingsChanges: vi.fn((): Observable<AppSettings> => settings$.asObservable()),
            update: vi.fn((changes: Partial<AppSettings>): Promise<AppSettings> => {
                changeSettings(changes);

                return Promise.resolve(currentSettings);
            }),
        };
        router = {
            navigateByUrl: vi.fn((): Promise<boolean> => Promise.resolve(true)),
        };

        IconUtils.register();
        confirmationSpy = vi.spyOn(SwalUtils, 'showConfirmationDialog').mockResolvedValue(true);
        errorMessageSpy = vi.spyOn(SwalUtils, 'showErrorMessage').mockImplementation((): void => undefined);
        successMessageSpy = vi.spyOn(SwalUtils, 'showSuccessMessage').mockResolvedValue(undefined);
        warningMessageSpy = vi.spyOn(SwalUtils, 'showWarningMessage').mockImplementation((): void => undefined);
        loadingSpy = vi.spyOn(SwalUtils, 'showLoading').mockImplementation((): void => undefined);
        loadingResultSpy = vi.spyOn(SwalUtils, 'showLoadingResult').mockResolvedValue(undefined);

        TestBed.configureTestingModule({
            imports: [NgTemplateOutlet, ReactiveFormsModule, TranslatePipe],
            declarations: [LanguageNamePipe, LanguagesComponent, SelectValueAccessorStubDirective],
            providers: [
                provideTranslateService(),
                { provide: AppLanguageService, useValue: appLanguageService },
                { provide: LanguageModelService, useValue: languageModelService },
                { provide: LensEngineService, useValue: lensEngineService },
                { provide: LoggerService, useValue: loggerService },
                { provide: PreferencesService, useValue: preferencesService },
                { provide: Router, useValue: router },
            ],
            schemas: [CUSTOM_ELEMENTS_SCHEMA],
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should create', async () => {
        await createComponent();

        expect(component).toBeTruthy();
        expect(component.form.getRawValue()).toEqual({ sourceLanguage: 'es' });
        expect(component.targetLanguage).toBe('en');
    });

    it('should expose native source and destination selectors with Japanese', async () => {
        await createComponent();
        const target = (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>('#target-language');
        expect(target?.options.length).toBeGreaterThan(50);
        expect(Array.from(target?.options ?? []).map(option => option.value)).toContain('ja');
        expect(component.sourceOptions).toContain('ja');
        expect(target?.value).toBe('en');
    });

    it('should save the translation destination from the native selector', async () => {
        await createComponent();
        const target = (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>('#target-language')!;
        target.value = 'ja';
        target.dispatchEvent(new Event('change'));
        await flushPromises();
        expect(preferencesService.update).toHaveBeenCalledWith({ targetLanguage: 'ja' });
        expect(component.targetLanguage).toBe('ja');
        expect(component.targetLanguageControl.value).toBe('ja');
    });

    it('should mark each language pack with a decorative language code', async () => {
        await createComponent();

        const spanishBadge: HTMLElement | null | undefined = findModelItem('languages-models-title', 'Spanish')?.querySelector<HTMLElement>('[slot="start"]');
        const englishBadge: HTMLElement | null | undefined = findModelItem('languages-models-title', 'English')?.querySelector<HTMLElement>('[slot="start"]');

        expect(spanishBadge?.textContent?.trim()).toBe('es');
        expect(spanishBadge?.getAttribute('aria-hidden')).toBe('true');
        expect(spanishBadge?.classList.contains('lens-icon-badge-neutral')).toBe(true);
        expect(englishBadge?.classList.contains('lens-icon-badge-neutral')).toBe(false);
    });

    it('should open the settings to change the app language', async () => {
        await createComponent();

        const settingsItem: HTMLElement | undefined = findItemByText('languages.changeAppLanguage');

        expect(settingsItem?.querySelector('ion-icon')?.getAttribute('aria-hidden')).toBe('true');

        settingsItem?.click();
        await flushPromises();

        expect(router.navigateByUrl).toHaveBeenCalledWith('/settings');
        await expect(component.openSettings()).resolves.toBe(true);
    });

    it('should follow the app language when the translation target changes elsewhere', async () => {
        await useEnglishTranslations();
        await createComponent();

        changeSettings({ targetLanguage: 'fr' });

        expect(component.targetLanguage).toBe('fr');
        expect(component.form.getRawValue()).toEqual({ sourceLanguage: 'es' });
        expect(component.pairModels.map(modelLanguage)).toEqual(['es', 'fr']);
        expect(component.sourceOptions).toEqual(readableLanguagesFor('fr', 'en'));
        expect(component.targetLanguageControl.value).toBe('fr');
        expect(preferencesService.update).not.toHaveBeenCalled();
    });

    it('should start with automatic detection and the app language as target with the default settings', async () => {
        currentSettings = PreferencesService.defaultSettings(LanguageUtils.resolveDefaultLanguagePair('pt-BR'));
        settings$.next(currentSettings);
        inventory$.next({ downloaded: ['en', 'pt'], downloading: [] });
        await createComponent();

        expect(component.form.getRawValue()).toEqual({ sourceLanguage: AUTO_LANGUAGE });
        expect(component.autoSourceSelected).toBe(true);
        expect(component.targetLanguage).toBe('pt');
        expect(selectOptions('sourceLanguage')[0].value).toBe(AUTO_LANGUAGE);
        expect(component.pairModels).toEqual([
            { downloaded: true, downloading: false, language: 'pt', removable: true },
        ] as LanguageModelInfo[]);
        expect(component.pairReady).toBe(true);
        expect(findOpenCameraButton()).toBeDefined();
        expect(pageText()).toContain('languages.autoDetectNote');
    });

    it('should build one row per pair language from the inventory with English as built in', async () => {
        await createComponent();

        expect(component.pairModels).toEqual([
            { downloaded: false, downloading: false, language: 'es', removable: true },
            { downloaded: true, downloading: false, language: 'en', removable: false },
        ] as LanguageModelInfo[]);
        expect(findButtons('languages.downloadLanguage').length).toBe(1);
        expect(findButtons('languages.deleteLanguage').length).toBe(0);
        expect((fixture.nativeElement as HTMLElement).textContent).toContain('languages.builtIn');
        expect(component.otherModels).toEqual([]);
    });

    it('should reflect downloading and downloaded states emitted by the inventory', async () => {
        await createComponent();

        inventory$.next({ downloaded: ['en'], downloading: ['es'] });

        expect(component.pairModels[0].downloading).toBe(true);
        expect((fixture.nativeElement as HTMLElement).querySelector('ion-spinner')).not.toBeNull();
        expect(findButtons('languages.downloadLanguage').length).toBe(0);

        inventory$.next({ downloaded: ['en', 'es', 'fr', 'de'], downloading: [] });

        expect(component.pairModels.every((model: LanguageModelInfo) => model.downloaded)).toBe(true);
        expect(component.otherModels.map((model: LanguageModelInfo) => model.language)).toEqual(['fr', 'de']);
        expect(findButtons('languages.deleteLanguage').length).toBe(3);
    });

    it('should keep the same focusable download button while the pack downloads', async () => {
        await createComponent();

        const downloadButton: HTMLElement = findButtons('languages.downloadLanguage')[0];

        inventory$.next({ downloaded: ['en'], downloading: ['es'] });

        expect(downloadButton.isConnected).toBe(true);
        expect(findButtons('languages.downloading').length).toBe(1);
        expect(findButtons('languages.downloading')[0]).toBe(downloadButton);
        expect(downloadButton.querySelector('ion-spinner')).not.toBeNull();
        expect(downloadButton.textContent).toContain('languages.downloading');

        inventory$.next({ downloaded: ['en'], downloading: [] });

        expect(findButtons('languages.downloadLanguage')[0]).toBe(downloadButton);
        expect(downloadButton.querySelector('ion-spinner')).toBeNull();
    });

    it('should move focus to the language packs heading when the finished download removes the focused button', async () => {
        languageModelService.download.mockImplementationOnce((): Promise<void> => {
            inventory$.next({ downloaded: ['en', 'es'], downloading: [] });

            return Promise.resolve();
        });
        await createComponent();

        const heading: HTMLElement | null = document.getElementById('languages-models-title');

        expect(heading?.getAttribute('tabindex')).toBe('-1');
        expect(document.getElementById('languages-other-title')).toBeNull();

        await component.downloadModel('es');

        expect(findButtons('languages.downloadLanguage').length).toBe(0);
        expect(document.activeElement).toBe(heading);
        expect(successMessageSpy).toHaveBeenCalledWith('Languages.downloadSuccess');
    });

    it('should leave focus alone when the user moved it elsewhere during the download', async () => {
        const otherControl: HTMLInputElement = document.createElement('input');

        languageModelService.download.mockImplementationOnce((): Promise<void> => {
            inventory$.next({ downloaded: ['en', 'es'], downloading: [] });

            return Promise.resolve();
        });
        document.body.appendChild(otherControl);
        await createComponent();
        otherControl.focus();

        await component.downloadModel('es');

        expect(document.activeElement).toBe(otherControl);

        otherControl.remove();
    });

    it('should explain that downloads wait for a connection while offline', async () => {
        await createComponent();
        inventory$.next({ downloaded: ['en'], downloading: ['es'] });

        expect(component.online).toBe(true);
        expect(pageText()).not.toContain('languages.offlineNote');

        window.dispatchEvent(new Event('offline'));

        expect(component.online).toBe(false);
        expect((fixture.nativeElement as HTMLElement).querySelector('[role="status"]')?.textContent).toContain('languages.offlineNote');
        expect(pageText()).toContain('languages.waitingForConnection');
        expect(pageText()).not.toContain('languages.downloading');
        expect(findButtons('languages.waitingForConnection').length).toBe(1);

        window.dispatchEvent(new Event('online'));

        expect(component.online).toBe(true);
        expect(pageText()).not.toContain('languages.offlineNote');
        expect(pageText()).toContain('languages.downloading');
        expect(findButtons('languages.downloading').length).toBe(1);
    });

    it('should start offline when the browser reports no connection', async () => {
        vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
        await createComponent();

        expect(component.online).toBe(false);
        expect(component.downloadStatusKey).toBe('languages.waitingForConnection');
        expect(pageText()).toContain('languages.offlineNote');
    });

    it('should list English outside the pair as built in and not removable', async () => {
        changeSettings({ sourceLanguage: 'fr', targetLanguage: 'de' });
        inventory$.next({ downloaded: ['de', 'en', 'fr', 'it'], downloading: [] });
        await createComponent();

        expect(component.otherModels).toEqual([
            { downloaded: true, downloading: false, language: 'en', removable: false },
            { downloaded: true, downloading: false, language: 'it', removable: true },
        ] as LanguageModelInfo[]);
        expect(findButtons('languages.deleteLanguage').length).toBe(3);
        expect((fixture.nativeElement as HTMLElement).textContent).toContain('languages.builtIn');
    });

    it('should start a download from the row button', async () => {
        await createComponent();

        findButtons('languages.downloadLanguage')[0].click();
        await flushPromises();

        expect(languageModelService.download).toHaveBeenCalledWith('es', false);
    });

    it('should download a language with the Wi-Fi preference', async () => {
        changeSettings({ requireWifiForDownloads: true });
        await createComponent();

        expect((fixture.nativeElement as HTMLElement).textContent).toContain('languages.wifiOnlyNote');

        await component.downloadModel('es');

        expect(languageModelService.download).toHaveBeenCalledWith('es', true);
        expect(successMessageSpy).toHaveBeenCalledWith('Languages.downloadSuccess');
        expect(appLanguageService.instant).toHaveBeenCalledWith('languages.downloadSuccess', { language: 'Spanish' });
    });

    it('should show an error message when the download fails', async () => {
        languageModelService.download.mockRejectedValueOnce(new Error('network'));
        await createComponent();

        await component.downloadModel('es');

        expect(languageModelService.download).toHaveBeenCalledWith('es', false);
        expect(errorMessageSpy).toHaveBeenCalledWith('Languages.downloadError');
        expect(successMessageSpy).not.toHaveBeenCalled();
    });

    it('should keep language names in sentence case and capitalize a message that starts with one', async () => {
        const templates: Record<string, string> = {
            'languages.deleteConfirmMessage': 'Remover o pacote de {{language}} deste dispositivo?',
            'languages.downloadSuccess': '{{language}} já pode ser usado offline.',
        };

        appLanguageService.instant.mockImplementation((key: string, parameters?: Record<string, string>): string =>
            (templates[key] ?? key).replace('{{language}}', parameters?.['language'] ?? EMPTY),
        );
        appLanguageService.currentLanguage = 'pt';
        language$.next('pt');
        inventory$.next({ downloaded: ['en', 'fr'], downloading: [] });
        await createComponent();
        confirmationSpy.mockResolvedValueOnce(false);

        await component.downloadModel('es');
        await component.removeModel('fr');

        expect(successMessageSpy).toHaveBeenCalledWith('Espanhol já pode ser usado offline.');
        expect(confirmationSpy).toHaveBeenCalledWith(
            'languages.deleteConfirmTitle',
            'Remover o pacote de francês deste dispositivo?',
            'languages.delete',
            'warning',
            true,
        );
    });

    it('should ask to tap the download button again when the browser needs a new tap to download', async () => {
        languageModelService.download.mockRejectedValueOnce(createCodedError('USER_ACTIVATION_REQUIRED'));
        await createComponent();

        await component.downloadModel('es');

        expect(warningMessageSpy).toHaveBeenCalledExactlyOnceWith('languages.downloadActivationRequired');
        expect(errorMessageSpy).not.toHaveBeenCalled();
        expect(successMessageSpy).not.toHaveBeenCalled();
    });

    it('should tell when the browser cannot translate the language to download', async () => {
        languageModelService.download.mockRejectedValueOnce(createCodedError('TRANSLATION_UNSUPPORTED'));
        await createComponent();

        await component.downloadModel('es');

        expect(appLanguageService.instant).toHaveBeenCalledWith('languages.downloadUnsupportedError', { language: 'Spanish' });
        expect(errorMessageSpy).toHaveBeenCalledExactlyOnceWith('Languages.downloadUnsupportedError');
        expect(warningMessageSpy).not.toHaveBeenCalled();
    });

    it('should report the generic download error for any other error code', async () => {
        languageModelService.download.mockRejectedValueOnce({ code: 'DOWNLOAD_FAILED' });
        await createComponent();

        await component.downloadModel('es');

        expect(errorMessageSpy).toHaveBeenCalledExactlyOnceWith('Languages.downloadError');
        expect(warningMessageSpy).not.toHaveBeenCalled();
    });

    it('should ask for confirmation before removing a language pack', async () => {
        inventory$.next({ downloaded: ['en', 'fr'], downloading: [] });
        await createComponent();
        confirmationSpy.mockResolvedValueOnce(false);

        await component.removeModel('fr');

        expect(confirmationSpy).toHaveBeenCalledWith('languages.deleteConfirmTitle', 'Languages.deleteConfirmMessage', 'languages.delete', 'warning', true);
        expect(languageModelService.remove).not.toHaveBeenCalled();
        expect(loadingSpy).not.toHaveBeenCalled();

        await component.removeModel('fr');

        expect(loadingSpy).toHaveBeenCalledExactlyOnceWith(true, 'common.deleting');
        expect(languageModelService.remove).toHaveBeenCalledWith('fr');
        expect(loadingResultSpy).toHaveBeenCalledExactlyOnceWith('success', 'Languages.deleteSuccess');
        expect(loadingSpy.mock.invocationCallOrder[0]).toBeLessThan(loadingResultSpy.mock.invocationCallOrder[0]);
        expect(successMessageSpy).not.toHaveBeenCalled();
    });

    it('should move focus to the other packs heading after the success dialog closes when other packs remain', async () => {
        let closeSuccessDialog: () => void = (): void => undefined;

        inventory$.next({ downloaded: ['en', 'fr', 'de'], downloading: [] });
        languageModelService.remove.mockImplementationOnce((): Promise<void> => {
            inventory$.next({ downloaded: ['en', 'de'], downloading: [] });

            return Promise.resolve();
        });
        loadingResultSpy.mockImplementationOnce((): Promise<void> => new Promise<void>((resolve: () => void) => {
            closeSuccessDialog = resolve;
        }));
        await createComponent();

        const removing: Promise<void> = component.removeModel('fr');

        await flushPromises();

        const heading: HTMLElement | null = document.getElementById('languages-other-title');

        expect(heading?.getAttribute('tabindex')).toBe('-1');
        expect(document.activeElement).not.toBe(heading);

        closeSuccessDialog();
        await removing;

        expect(document.activeElement).toBe(heading);
    });

    it('should move focus to the language packs heading after removing the last other pack', async () => {
        inventory$.next({ downloaded: ['en', 'fr'], downloading: [] });
        languageModelService.remove.mockImplementationOnce((): Promise<void> => {
            inventory$.next({ downloaded: ['en'], downloading: [] });

            return Promise.resolve();
        });
        await createComponent();

        expect(component.otherModels.map((model: LanguageModelInfo) => model.language)).toEqual(['fr']);

        await component.removeModel('fr');

        expect(component.otherModels).toEqual([]);
        expect(document.getElementById('languages-other-title')).toBeNull();
        expect(document.activeElement).toBe(document.getElementById('languages-models-title'));
    });

    it('should move focus to the language packs heading after removing a pack of the pair', async () => {
        inventory$.next({ downloaded: ['en', 'es'], downloading: [] });
        languageModelService.remove.mockImplementationOnce((): Promise<void> => {
            inventory$.next({ downloaded: ['en'], downloading: [] });

            return Promise.resolve();
        });
        await createComponent();

        await component.removeModel('es');

        expect(document.activeElement).toBe(document.getElementById('languages-models-title'));
    });

    it('should never remove the built in English pack', async () => {
        await createComponent();

        await component.removeModel('en');

        expect(confirmationSpy).not.toHaveBeenCalled();
        expect(languageModelService.remove).not.toHaveBeenCalled();
    });

    it('should report a failed removal', async () => {
        inventory$.next({ downloaded: ['en', 'fr'], downloading: [] });
        languageModelService.remove.mockRejectedValueOnce(new Error('busy'));
        await createComponent();

        await component.removeModel('fr');

        expect(languageModelService.remove).toHaveBeenCalledWith('fr');
        expect(loadingSpy).toHaveBeenCalledExactlyOnceWith(true, 'common.deleting');
        expect(loadingResultSpy).toHaveBeenCalledExactlyOnceWith('error', 'Languages.deleteError');
        expect(errorMessageSpy).not.toHaveBeenCalled();
        expect(successMessageSpy).not.toHaveBeenCalled();
    });

    it('should hide the remove buttons and explain that the browser manages the language packs', async () => {
        lensEngineService.getCapabilities.mockResolvedValue(createCapabilities({ modelRemoval: false, openAppSettings: false }));
        inventory$.next({ downloaded: ['en', 'es', 'fr'], downloading: [] });
        await createComponent();

        const modelsSection: HTMLElement | null | undefined = document.getElementById('languages-models-title')?.closest('section');

        expect(lensEngineService.getCapabilities).toHaveBeenCalledTimes(1);
        expect(component.browserManagedModels).toBe(true);
        expect(component.modelRemovalSupported).toBe(false);
        expect(component.translationSupported).toBe(true);
        expect([...component.pairModels, ...component.otherModels].map((model: LanguageModelInfo) => model.removable)).toEqual([false, false, false]);
        expect(findButtons('languages.deleteLanguage')).toEqual([]);
        expect(modelsSection?.textContent).toContain('languages.browserModelsNote');
        expect(pageText()).not.toContain('languages.builtIn');
        expect(findModelItem('languages-other-title', 'French')?.textContent).toContain('languages.downloaded');

        await component.removeModel('fr');

        expect(confirmationSpy).not.toHaveBeenCalled();
        expect(languageModelService.remove).not.toHaveBeenCalled();
    });

    it('should not offer removal before knowing whether the engine can remove language packs', async () => {
        let resolveCapabilities: (capabilities: EngineCapabilities) => void = (): void => undefined;

        lensEngineService.getCapabilities.mockImplementationOnce((): Promise<EngineCapabilities> => new Promise<EngineCapabilities>(
            (resolve: (capabilities: EngineCapabilities) => void) => {
                resolveCapabilities = resolve;
            },
        ));
        inventory$.next({ downloaded: ['en', 'fr'], downloading: [] });
        renderComponent();

        expect(findButtons('languages.deleteLanguage')).toEqual([]);
        expect(pageText()).not.toContain('languages.builtIn');
        expect(pageText()).not.toContain('languages.browserModelsNote');

        resolveCapabilities(createCapabilities());
        await flushPromises();

        expect(findButtons('languages.deleteLanguage').length).toBe(1);
        expect(pageText()).toContain('languages.builtIn');
        expect(pageText()).not.toContain('languages.browserModelsNote');
    });

    it('should log capabilities that cannot be read and keep the language packs removable', async () => {
        const failure: Error = new Error('not implemented');

        lensEngineService.getCapabilities.mockRejectedValueOnce(failure);
        inventory$.next({ downloaded: ['en', 'fr'], downloading: [] });
        await createComponent();

        expect(loggerService.error).toHaveBeenCalledWith('languages-capabilities-failed', failure);
        expect(component.translationSupported).toBe(true);
        expect(findButtons('languages.deleteLanguage').length).toBe(1);
        expect(findButtons('languages.downloadLanguage').length).toBe(1);
    });

    it('should explain that the browser cannot translate on the device and not offer downloads', async () => {
        lensEngineService.getCapabilities.mockResolvedValue(createCapabilities({ modelRemoval: false, openAppSettings: false, translation: false }));
        await createComponent();

        expect(component.translationSupported).toBe(false);
        expect(findButtons('languages.downloadLanguage')).toEqual([]);
        expect(document.getElementById('languages-models-title')?.closest('section')?.textContent).toContain('camera.translationUnsupportedMessage');
        expect(pageText()).not.toContain('languages.browserModelsNote');
        expect(findModelItem('languages-models-title', 'Spanish')?.textContent).toContain('languages.notDownloaded');

        await component.downloadModel('es');

        expect(languageModelService.download).not.toHaveBeenCalled();
    });

    it('should reject reading texts in the translation target and revert the form', async () => {
        await createComponent();

        component.form.setValue({ sourceLanguage: 'en' });
        await flushPromises();

        expect(warningMessageSpy).toHaveBeenCalledWith('languages.sameLanguageWarning');
        expect(preferencesService.update).not.toHaveBeenCalled();
        expect(component.form.getRawValue()).toEqual({ sourceLanguage: 'es' });
    });

    it('should persist only the source language and rebuild the rows', async () => {
        await createComponent();

        component.form.setValue({ sourceLanguage: 'fr' });
        await flushPromises();

        expect(preferencesService.update).toHaveBeenCalledTimes(1);
        expect(preferencesService.update).toHaveBeenCalledWith({ sourceLanguage: 'fr' });
        expect(component.targetLanguage).toBe('en');
        expect(component.pairModels.map((model: LanguageModelInfo) => model.language)).toEqual(['fr', 'en']);
    });

    it('should ignore an empty source language', async () => {
        await createComponent();

        component.form.setValue({ sourceLanguage: EMPTY });
        await flushPromises();

        expect(preferencesService.update).not.toHaveBeenCalled();
        expect(component.form.getRawValue()).toEqual({ sourceLanguage: 'es' });
    });

    it('should report a failed save and restore the stored pair', async () => {
        preferencesService.update.mockRejectedValueOnce(new Error('storage'));
        await createComponent();

        component.form.setValue({ sourceLanguage: 'fr' });
        await flushPromises();

        expect(loggerService.error).toHaveBeenCalled();
        expect(errorMessageSpy).toHaveBeenCalledWith('languages.saveError');
        expect(component.form.getRawValue()).toEqual({ sourceLanguage: 'es' });
        expect(component.pairModels.map((model: LanguageModelInfo) => model.language)).toEqual(['es', 'en']);
    });

    it('should show the open camera button only when both packs are downloaded', async () => {
        await createComponent();

        expect(component.pairReady).toBe(false);
        expect(findOpenCameraButton()).toBeUndefined();

        inventory$.next({ downloaded: ['en', 'es'], downloading: [] });

        expect(component.pairReady).toBe(true);

        const openCameraButton: HTMLElement | undefined = findOpenCameraButton();

        expect(openCameraButton).toBeDefined();

        openCameraButton?.click();
        await flushPromises();

        expect(router.navigateByUrl).toHaveBeenCalledWith('/camera');
    });

    it('should offer automatic detection as the first source option followed by the readable languages except the target', async () => {
        await createComponent();

        const sourceOptions: SelectOptionElement[] = selectOptions('sourceLanguage');

        expect(component.autoLanguage).toBe(AUTO_LANGUAGE);
        expect(sourceOptions[0].value).toBe(AUTO_LANGUAGE);
        expect(sourceOptions[0].textContent?.trim()).toBe('languages.autoDetect');
        expect(sourceOptions.slice(1).map(optionValue)).toEqual(component.sourceOptions);
        expect(component.sourceOptions).toEqual(readableLanguagesFor('en', 'en'));
        expect(component.sourceOptions).not.toContain('en');
        expect(component.sourceOptions).toContain('es');
        expect(component.autoSourceSelected).toBe(false);
        expect(pageText()).not.toContain('languages.autoDetectNote');
        expect(pageText()).toContain('languages.sourceNote');
    });

    it('should save automatic detection as the source and keep only the target pack in the pair rows', async () => {
        inventory$.next({ downloaded: ['en', 'es'], downloading: [] });
        await createComponent();

        component.form.setValue({ sourceLanguage: AUTO_LANGUAGE });
        await flushPromises();

        expect(warningMessageSpy).not.toHaveBeenCalled();
        expect(preferencesService.update).toHaveBeenCalledWith({ sourceLanguage: AUTO_LANGUAGE });
        expect(component.autoSourceSelected).toBe(true);
        expect(component.pairModels).toEqual([
            { downloaded: true, downloading: false, language: 'en', removable: false },
        ] as LanguageModelInfo[]);
        expect(component.recognitionModels.map(modelLanguage)).toEqual(recognitionLanguagesFor('en', 'en'));
        expect(component.recognitionModels.find((model: LanguageModelInfo) => model.language === 'es')).toEqual(
            { downloaded: true, downloading: false, language: 'es', removable: true } as LanguageModelInfo,
        );
        expect(component.otherModels).toEqual([]);
        expect(document.getElementById('languages-other-title')).toBeNull();
        expect(pageText()).toContain('languages.autoDetectNote');
        expect(pageText()).toContain('languages.sourceNote');
    });

    it('should only require the target pack before opening the camera in automatic mode', async () => {
        changeSettings({ sourceLanguage: AUTO_LANGUAGE, targetLanguage: 'fr' });
        inventory$.next({ downloaded: ['en', 'es'], downloading: [] });
        await createComponent();

        expect(component.pairModels).toEqual([
            { downloaded: false, downloading: false, language: 'fr', removable: true },
        ] as LanguageModelInfo[]);
        expect(component.otherModels.map(modelLanguage)).toEqual(['en']);
        expect(findSectionButtons('languages-models-title', 'languages.downloadLanguage').length).toBe(1);
        expect(component.pairReady).toBe(false);
        expect(findOpenCameraButton()).toBeUndefined();

        inventory$.next({ downloaded: ['en', 'es', 'fr'], downloading: [] });

        expect(component.pairReady).toBe(true);
        expect(findOpenCameraButton()).toBeDefined();
    });

    it('should not offer the detected language packs while the source language is fixed', async () => {
        await createComponent();

        expect(component.recognitionModels).toEqual([]);
        expect(document.getElementById('languages-recognition-title')).toBeNull();
        expect(pageText()).not.toContain('languages.recognitionModelsTitle');
    });

    it('should offer every readable language except the target and the built in pack for offline download in automatic mode', async () => {
        changeSettings({ sourceLanguage: AUTO_LANGUAGE, targetLanguage: 'fr' });
        inventory$.next({ downloaded: ['en', 'es'], downloading: ['de'] });
        await createComponent();

        const heading: HTMLElement | null = document.getElementById('languages-recognition-title');
        const notDownloadedCount: number = component.recognitionModels
            .filter((model: LanguageModelInfo) => !model.downloaded && !model.downloading).length;

        expect(component.recognitionModels.map(modelLanguage)).toEqual(recognitionLanguagesFor('fr', 'en'));
        expect(component.recognitionModels.map(modelLanguage)).not.toContain('en');
        expect(component.recognitionModels.map(modelLanguage)).not.toContain('fr');
        expect(component.recognitionModels.find((model: LanguageModelInfo) => model.language === 'es')).toEqual(
            { downloaded: true, downloading: false, language: 'es', removable: true } as LanguageModelInfo,
        );
        expect(component.recognitionModels.find((model: LanguageModelInfo) => model.language === 'de')).toEqual(
            { downloaded: false, downloading: true, language: 'de', removable: true } as LanguageModelInfo,
        );
        expect(heading?.getAttribute('tabindex')).toBe('-1');
        expect(heading?.closest('section')?.getAttribute('aria-labelledby')).toBe('languages-recognition-title');
        expect(heading?.textContent).toContain('languages.recognitionModelsTitle');
        expect(heading?.closest('section')?.textContent).toContain('languages.recognitionModelsDescription');
        expect(findSectionButtons('languages-recognition-title', 'languages.downloadLanguage').length).toBe(notDownloadedCount);
        expect(findSectionButtons('languages-recognition-title', 'languages.downloading').length).toBe(1);
        expect(findSectionButtons('languages-recognition-title', 'languages.deleteLanguage').length).toBe(1);
        expect(component.otherModels.map(modelLanguage)).toEqual(['en']);
    });

    it('should re-sort the detected language packs when the app language changes', async () => {
        changeSettings({ sourceLanguage: AUTO_LANGUAGE });
        await createComponent();

        language$.next('de');

        expect(component.recognitionModels.map(modelLanguage)).toEqual(recognitionLanguagesFor('en', 'de'));
    });

    it('should download a detected language pack in advance from its row and focus its heading when the row changes', async () => {
        changeSettings({ sourceLanguage: AUTO_LANGUAGE });
        languageModelService.download.mockImplementationOnce((): Promise<void> => {
            inventory$.next({ downloaded: ['en', 'fr'], downloading: [] });

            return Promise.resolve();
        });
        await createComponent();

        const frenchItem: HTMLElement | undefined = findModelItem('languages-recognition-title', 'French');

        expect(frenchItem).toBeDefined();

        frenchItem?.querySelector<HTMLElement>('ion-button')?.click();
        await flushPromises();

        expect(languageModelService.download).toHaveBeenCalledWith('fr', false);
        expect(successMessageSpy).toHaveBeenCalledWith('Languages.downloadSuccess');
        expect(component.recognitionModels.find((model: LanguageModelInfo) => model.language === 'fr')?.downloaded).toBe(true);
        expect(component.otherModels).toEqual([]);
        expect(document.activeElement).toBe(document.getElementById('languages-recognition-title'));
    });

    it('should keep a removed detected language pack listed for download and focus its heading', async () => {
        changeSettings({ sourceLanguage: AUTO_LANGUAGE });
        inventory$.next({ downloaded: ['en', 'es'], downloading: [] });
        languageModelService.remove.mockImplementationOnce((): Promise<void> => {
            inventory$.next({ downloaded: ['en'], downloading: [] });

            return Promise.resolve();
        });
        await createComponent();

        await component.removeModel('es');

        expect(languageModelService.remove).toHaveBeenCalledWith('es');
        expect(component.recognitionModels.find((model: LanguageModelInfo) => model.language === 'es')).toEqual(
            { downloaded: false, downloading: false, language: 'es', removable: true } as LanguageModelInfo,
        );
        expect(findModelItem('languages-recognition-title', 'Spanish')?.textContent).toContain('languages.notDownloaded');
        expect(document.activeElement).toBe(document.getElementById('languages-recognition-title'));
    });

    it('should focus the detected language packs heading after removing the last other pack in automatic mode', async () => {
        changeSettings({ sourceLanguage: AUTO_LANGUAGE });
        inventory$.next({ downloaded: ['en', 'ru'], downloading: [] });
        languageModelService.remove.mockImplementationOnce((): Promise<void> => {
            inventory$.next({ downloaded: ['en'], downloading: [] });

            return Promise.resolve();
        });
        await createComponent();

        expect(component.otherModels.map(modelLanguage)).toEqual(['ru']);

        await component.removeModel('ru');

        expect(component.otherModels).toEqual([]);
        expect(document.getElementById('languages-other-title')).toBeNull();
        expect(document.activeElement).toBe(document.getElementById('languages-recognition-title'));
    });

    it('should hide the automatic detection note after choosing a fixed source again', async () => {
        changeSettings({ sourceLanguage: AUTO_LANGUAGE });
        await createComponent();

        expect(component.form.getRawValue()).toEqual({ sourceLanguage: AUTO_LANGUAGE });
        expect(component.autoSourceSelected).toBe(true);
        expect(pageText()).toContain('languages.autoDetectNote');

        component.form.setValue({ sourceLanguage: 'fr' });
        await flushPromises();

        expect(preferencesService.update).toHaveBeenCalledWith({ sourceLanguage: 'fr' });
        expect(component.autoSourceSelected).toBe(false);
        expect(component.pairModels.map((model: LanguageModelInfo) => model.language)).toEqual(['fr', 'en']);
        expect(component.recognitionModels).toEqual([]);
        expect(document.getElementById('languages-recognition-title')).toBeNull();
        expect(pageText()).not.toContain('languages.autoDetectNote');
    });

    it('should keep a fixed source that matches the new target selectable', async () => {
        changeSettings({ sourceLanguage: 'fr', targetLanguage: 'fr' });
        await createComponent();

        expect(component.form.getRawValue()).toEqual({ sourceLanguage: 'fr' });
        expect(component.sourceOptions).toContain('fr');
        expect(component.pairModels.map(modelLanguage)).toEqual(['fr']);
    });

    it('should refresh the inventory and re-sync the form when the view enters', async () => {
        await createComponent();
        component.form.setValue({ sourceLanguage: 'fr' }, { emitEvent: false });
        currentSettings = { ...currentSettings, requireWifiForDownloads: true, sourceLanguage: 'it', targetLanguage: 'de' };

        await component.ionViewWillEnter();

        expect(languageModelService.refresh).toHaveBeenCalled();
        expect(component.form.getRawValue()).toEqual({ sourceLanguage: 'it' });
        expect(component.targetLanguage).toBe('de');
        expect(component.requireWifiForDownloads).toBe(true);
    });

    it('should log and report a failed inventory refresh', async () => {
        languageModelService.refresh.mockRejectedValueOnce(new Error('engine'));
        await createComponent();

        await component.ionViewWillEnter();

        expect(loggerService.error).toHaveBeenCalled();
        expect(errorMessageSpy).toHaveBeenCalledWith('languages.refreshError');
    });

    it('should re-sort the options when the app language changes', async () => {
        await createComponent();

        language$.next('de');

        expect(component.displayLanguage).toBe('de');
        expect(component.sourceOptions).toEqual(readableLanguagesFor('en', 'de'));
    });

    it('should unsubscribe on destroy', async () => {
        await createComponent();

        fixture.destroy();
        inventory$.next({ downloaded: ['en', 'es'], downloading: [] });
        settings$.next({ ...currentSettings, targetLanguage: 'fr' });
        window.dispatchEvent(new Event('offline'));

        expect(component.pairReady).toBe(false);
        expect(component.targetLanguage).toBe('en');
        expect(component.online).toBe(true);
    });
});
