import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService, provideTranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { SweetAlertIcon } from 'sweetalert2';
import { Mock, MockInstance } from 'vitest';
import 'src/app/pages/pages.module';
import { AppLanguageService } from 'src/app/services/app-language/app-language.service';
import { HistoryService } from 'src/app/services/history/history.service';
import { LoggerService } from 'src/app/services/logger/logger.service';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { AppSettings, HistoryEntry } from 'src/app/shared/models';
import { LanguageNamePipe } from 'src/app/shared/pipe';
import { EMPTY, IconUtils, SwalUtils } from 'src/app/shared/utils';
import { HistoryComponent } from './history.component';

interface AppLanguageServiceFake {
    changes: Mock<() => Observable<string>>;
    currentLanguage: string;
    deviceLanguageTag: string;
    instant: Mock<(key: string) => string>;
}

interface HistoryServiceFake {
    changes: Mock<() => Observable<HistoryEntry[]>>;
    clear: Mock<() => Promise<void>>;
    load: Mock<() => Promise<HistoryEntry[]>>;
    remove: Mock<(historyEntryId: string) => Promise<void>>;
}

interface LoggerServiceFake {
    error: Mock<(event: string, error: unknown) => void>;
}

interface PreferencesServiceFake {
    settings: AppSettings;
    settingsChanges: Mock<() => Observable<AppSettings>>;
}

interface RouterFake {
    navigateByUrl: Mock<(url: string) => Promise<boolean>>;
}

const OLDEST_ENTRY: HistoryEntry = {
    createdAt: '2026-10-19T08:15:00.000Z',
    historyEntryId: 'entry-oldest',
    originalText: 'Sopa del día',
    sourceLanguage: 'es',
    targetLanguage: 'en',
    translatedText: 'Soup of the day',
};

const NEWEST_ENTRY: HistoryEntry = {
    createdAt: '2026-10-21T12:30:00.000Z',
    historyEntryId: 'entry-newest',
    originalText: 'Pollo asado con patatas',
    sourceLanguage: 'es',
    targetLanguage: 'en',
    translatedText: 'Roast chicken with potatoes',
};

const MIDDLE_ENTRY: HistoryEntry = {
    createdAt: '2026-10-20T19:45:00.000Z',
    historyEntryId: 'entry-middle',
    originalText: 'Tarte aux pommes',
    sourceLanguage: 'fr',
    targetLanguage: 'pt',
    translatedText: 'Torta de maçã',
};

describe('HistoryComponent', () => {
    let appLanguageService: AppLanguageServiceFake;
    let component: HistoryComponent;
    let confirmationSpy: MockInstance<(title: string, message: string, confirmText?: string, icon?: SweetAlertIcon, destructive?: boolean) => Promise<boolean>>;
    let currentSettings: AppSettings;
    let entries$: BehaviorSubject<HistoryEntry[]>;
    let errorMessageSpy: MockInstance<(message: string) => void>;
    let fixture: ComponentFixture<HistoryComponent>;
    let historyService: HistoryServiceFake;
    let language$: BehaviorSubject<string>;
    let loadingResultSpy: MockInstance<(icon: SweetAlertIcon, message: string) => Promise<void>>;
    let loadingSpy: MockInstance<(visible: boolean, message?: string) => void>;
    let loggerService: LoggerServiceFake;
    let preferencesService: PreferencesServiceFake;
    let router: RouterFake;
    let settings$: BehaviorSubject<AppSettings>;
    let successMessageSpy: MockInstance<(message: string) => Promise<void>>;

    const host: () => HTMLElement = (): HTMLElement => fixture.nativeElement as HTMLElement;

    const pageText: () => string = (): string => host().textContent ?? EMPTY;

    const accessibleLabel: (button: HTMLElement) => string | null = (button: HTMLElement): string | null =>
        button.getAttribute('aria-label')
            ?? button.shadowRoot?.querySelector<HTMLElement>('.button-native')?.getAttribute('aria-label')
            ?? null;

    const clearButton: () => HTMLElement | undefined = (): HTMLElement | undefined =>
        Array.from(host().querySelectorAll<HTMLElement>('ion-button'))
            .find((button: HTMLElement) => accessibleLabel(button) === 'history.clear');

    const deleteButtons: () => HTMLElement[] = (): HTMLElement[] =>
        Array.from(host().querySelectorAll<HTMLElement>('ion-item ion-button'));

    const findButtonByText: (text: string) => HTMLElement | undefined = (text: string): HTMLElement | undefined =>
        Array.from(host().querySelectorAll<HTMLElement>('ion-button'))
            .find((button: HTMLElement) => (button.textContent ?? EMPTY).includes(text));

    const translatedTexts: () => string[] = (): string[] =>
        Array.from(host().querySelectorAll<HTMLElement>('ion-label strong span[lang]')).map((element: HTMLElement) => (element.textContent ?? EMPTY).trim());

    const visuallyHiddenTexts: () => string[] = (): string[] =>
        Array.from(host().querySelectorAll<HTMLElement>('ion-label .visually-hidden')).map((element: HTMLElement) => (element.textContent ?? EMPTY).trim());

    const createComponent: () => void = (): void => {
        fixture = TestBed.createComponent(HistoryComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    };

    const enterPage: () => Promise<void> = async (): Promise<void> => {
        createComponent();
        await component.ionViewWillEnter();
    };

    const flushPromises: () => Promise<void> = (): Promise<void> =>
        new Promise<void>((resolve: () => void) => setTimeout(resolve, 0));

    const formatDate: (createdAt: string, language: string) => string = (createdAt: string, language: string): string =>
        new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(createdAt));

    const useEnglishTranslations: () => Promise<void> = async (): Promise<void> => {
        const translateService: TranslateService = TestBed.inject(TranslateService);

        translateService.setTranslation('en', {
            history: {
                deleteEntry: 'Delete translation: {{text}}',
                languagePair: '{{source}} → {{target}}',
                languagePairLabel: 'From {{source}} to {{target}}',
                originalLabel: 'Original:',
                savedAt: 'Saved {{date}}',
                translationLabel: 'Translation:',
            },
        });
        await firstValueFrom(translateService.use('en'));
    };

    beforeEach(() => {
        currentSettings = {
            ...PreferencesService.defaultSettings({ sourceLanguage: 'es', targetLanguage: 'en' }),
            historyEnabled: true,
        };
        entries$ = new BehaviorSubject<HistoryEntry[]>([]);
        language$ = new BehaviorSubject<string>('en');
        settings$ = new BehaviorSubject<AppSettings>(currentSettings);
        appLanguageService = {
            changes: vi.fn((): Observable<string> => language$.asObservable()),
            currentLanguage: 'en',
            deviceLanguageTag: EMPTY,
            instant: vi.fn((key: string): string => key),
        };
        historyService = {
            changes: vi.fn((): Observable<HistoryEntry[]> => entries$.asObservable()),
            clear: vi.fn((): Promise<void> => {
                entries$.next([]);

                return Promise.resolve();
            }),
            load: vi.fn((): Promise<HistoryEntry[]> => Promise.resolve(entries$.value)),
            remove: vi.fn((historyEntryId: string): Promise<void> => {
                entries$.next(entries$.value.filter((entry: HistoryEntry) => entry.historyEntryId !== historyEntryId));

                return Promise.resolve();
            }),
        };
        loggerService = { error: vi.fn<(event: string, error: unknown) => void>() };
        preferencesService = {
            get settings(): AppSettings {
                return settings$.value;
            },
            settingsChanges: vi.fn((): Observable<AppSettings> => settings$.asObservable()),
        };
        router = { navigateByUrl: vi.fn((): Promise<boolean> => Promise.resolve(true)) };

        IconUtils.register();
        confirmationSpy = vi.spyOn(SwalUtils, 'showConfirmationDialog').mockResolvedValue(true);
        errorMessageSpy = vi.spyOn(SwalUtils, 'showErrorMessage').mockImplementation((): void => undefined);
        loadingResultSpy = vi.spyOn(SwalUtils, 'showLoadingResult').mockResolvedValue(undefined);
        loadingSpy = vi.spyOn(SwalUtils, 'showLoading').mockImplementation((): void => undefined);
        successMessageSpy = vi.spyOn(SwalUtils, 'showSuccessMessage').mockResolvedValue(undefined);

        TestBed.configureTestingModule({
            imports: [TranslatePipe],
            declarations: [HistoryComponent, LanguageNamePipe],
            providers: [
                provideTranslateService(),
                { provide: AppLanguageService, useValue: appLanguageService },
                { provide: HistoryService, useValue: historyService },
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

    it('should create and load the history when the page is about to enter', async () => {
        createComponent();

        expect(component).toBeTruthy();
        expect(component.loaded).toBe(false);
        expect(pageText()).not.toContain('history.empty');

        await component.ionViewWillEnter();

        expect(historyService.load).toHaveBeenCalledTimes(1);
        expect(component.loaded).toBe(true);
    });

    it('should explain that history is off and open the settings when it is disabled and empty', async () => {
        settings$.next({ ...currentSettings, historyEnabled: false });
        await enterPage();

        expect(pageText()).toContain('history.disabledTitle');
        expect(pageText()).toContain('history.disabledMessage');
        expect(pageText()).not.toContain('history.empty');
        expect(clearButton()).toBeUndefined();

        findButtonByText('history.openSettings')?.click();

        expect(router.navigateByUrl).toHaveBeenCalledWith('/settings');
    });

    it('should show the empty message when history is enabled without entries', async () => {
        await enterPage();

        expect(pageText()).toContain('history.empty');
        expect(pageText()).not.toContain('history.disabledTitle');
        expect(host().querySelector('ion-list')).toBeNull();
    });

    it('should decorate the empty state with an icon hidden from assistive technology', async () => {
        await enterPage();

        const ring: HTMLElement | null = host().querySelector<HTMLElement>('.lens-history-ring');

        expect(ring?.getAttribute('aria-hidden')).toBe('true');
        expect(ring?.querySelector('ion-icon')?.getAttribute('name')).toBe('time-outline');
        expect(host().querySelector('h2')?.id).toBe(component.stateTitleId);
    });

    it('should show each entry as its own card with the destructive actions marked as danger', async () => {
        entries$.next([OLDEST_ENTRY, NEWEST_ENTRY]);
        await enterPage();

        const clearHistoryButton: HTMLElement | undefined = clearButton();

        expect(host().querySelector('ion-list.lens-history-list')).not.toBeNull();
        expect(host().querySelectorAll('ion-list.lens-history-list > ion-item').length).toBe(2);
        expect(clearHistoryButton?.getAttribute('color')).toBe('danger');
        expect(clearHistoryButton?.querySelector('ion-icon')?.getAttribute('aria-hidden')).toBe('true');
        deleteButtons().forEach((button: HTMLElement) => expect(button.getAttribute('color')).toBe('danger'));
    });

    it('should keep the toolbar title readable with an icon only clear action named for assistive technology', async () => {
        entries$.next([NEWEST_ENTRY]);
        await enterPage();

        const clearHistoryButton: HTMLElement | undefined = clearButton();
        const icon: HTMLElement | null | undefined = clearHistoryButton?.querySelector<HTMLElement>('ion-icon');

        expect(clearHistoryButton?.hasAttribute('layoutactions')).toBe(true);
        expect((clearHistoryButton?.textContent ?? EMPTY).trim()).toBe(EMPTY);
        expect(icon?.getAttribute('slot')).toBe('icon-only');
        expect(icon?.getAttribute('name')).toBe('trash-outline');
    });

    it('should switch the empty state when the setting changes elsewhere', async () => {
        await enterPage();

        settings$.next({ ...currentSettings, historyEnabled: false });

        expect(component.historyEnabled).toBe(false);
        expect(pageText()).toContain('history.disabledTitle');
    });

    it('should list the entries newest first', async () => {
        entries$.next([OLDEST_ENTRY, NEWEST_ENTRY, MIDDLE_ENTRY]);
        await enterPage();

        expect(component.items.map((item: { entry: HistoryEntry }) => item.entry.historyEntryId)).toEqual([
            'entry-newest',
            'entry-middle',
            'entry-oldest',
        ]);
        expect(translatedTexts()).toEqual(['Roast chicken with potatoes', 'Torta de maçã', 'Soup of the day']);
        expect(clearButton()).toBeDefined();
    });

    it('should mark the original and translated texts with their languages', async () => {
        entries$.next([MIDDLE_ENTRY]);
        await enterPage();

        const original: HTMLElement | null = host().querySelector<HTMLElement>('ion-label p span[lang="fr"]');
        const translated: HTMLElement | null = host().querySelector<HTMLElement>('ion-label strong span[lang="pt"]');

        expect(original?.textContent?.trim()).toBe('Tarte aux pommes');
        expect(original?.getAttribute('dir')).toBe('auto');
        expect(translated?.textContent?.trim()).toBe('Torta de maçã');
        expect(translated?.getAttribute('dir')).toBe('auto');
    });

    it('should announce which text is the original and which is the translation outside the language-tagged text', async () => {
        await useEnglishTranslations();
        entries$.next([MIDDLE_ENTRY]);
        await enterPage();

        const originalLabel: HTMLElement | null = host().querySelector<HTMLElement>('ion-label p > .visually-hidden');
        const translationLabel: HTMLElement | null = host().querySelector<HTMLElement>('ion-label strong > .visually-hidden');

        expect(originalLabel?.textContent?.trim()).toBe('Original:');
        expect(originalLabel?.hasAttribute('lang')).toBe(false);
        expect(originalLabel?.closest('ion-label [lang]')).toBeNull();
        expect(translationLabel?.textContent?.trim()).toBe('Translation:');
        expect(translationLabel?.hasAttribute('lang')).toBe(false);
        expect(translationLabel?.closest('ion-label [lang]')).toBeNull();
    });

    it('should describe the language pair and the localized saved date', async () => {
        await useEnglishTranslations();
        entries$.next([NEWEST_ENTRY]);
        await enterPage();

        const time: HTMLTimeElement | null = host().querySelector<HTMLTimeElement>('time');
        const visualPair: HTMLElement | undefined = Array.from(host().querySelectorAll<HTMLElement>('ion-label small'))
            .find((element: HTMLElement) => (element.textContent ?? EMPTY).includes('→'));

        expect(visualPair?.textContent?.trim()).toBe('Spanish → English');
        expect(visualPair?.getAttribute('aria-hidden')).toBe('true');
        expect(visuallyHiddenTexts()).toEqual(['Original:', 'Translation:', 'From Spanish to English']);
        expect(time?.getAttribute('datetime')).toBe(NEWEST_ENTRY.createdAt);
        expect(time?.textContent?.trim()).toBe(`Saved ${formatDate(NEWEST_ENTRY.createdAt, 'en')}`);
    });

    it('should format the saved date with the regional conventions of the device when it matches the app language', async () => {
        appLanguageService.deviceLanguageTag = 'en-GB';
        entries$.next([NEWEST_ENTRY]);
        await enterPage();

        expect(component.items[0].savedAt).toBe(formatDate(NEWEST_ENTRY.createdAt, 'en-GB'));
        expect(component.items[0].savedAt).not.toBe(formatDate(NEWEST_ENTRY.createdAt, 'en'));
        expect(component.items[0].savedAt).not.toMatch(/AM|PM/i);
    });

    it('should format the saved date with the app language when the device language differs', async () => {
        appLanguageService.deviceLanguageTag = 'ja-JP';
        entries$.next([NEWEST_ENTRY]);
        await enterPage();

        expect(component.items[0].savedAt).toBe(formatDate(NEWEST_ENTRY.createdAt, 'en'));
    });

    it('should accept a device language tag written with underscores', async () => {
        appLanguageService.deviceLanguageTag = 'en_GB';
        entries$.next([NEWEST_ENTRY]);

        await expect(enterPage()).resolves.toBeUndefined();
        expect(component.items[0].savedAt).toBe(formatDate(NEWEST_ENTRY.createdAt, 'en-GB'));
    });

    it('should fall back to the app language when the device language tag is malformed', async () => {
        appLanguageService.deviceLanguageTag = 'en-$$';
        entries$.next([NEWEST_ENTRY]);

        await expect(enterPage()).resolves.toBeUndefined();
        expect(component.items[0].savedAt).toBe(formatDate(NEWEST_ENTRY.createdAt, 'en'));
    });

    it('should drop the device region when the app language changes to another language', async () => {
        appLanguageService.deviceLanguageTag = 'pt-PT';
        appLanguageService.currentLanguage = 'pt';
        language$.next('pt');
        entries$.next([NEWEST_ENTRY]);
        await enterPage();

        expect(component.items[0].savedAt).toBe(formatDate(NEWEST_ENTRY.createdAt, 'pt-PT'));

        language$.next('en');

        expect(component.items[0].savedAt).toBe(formatDate(NEWEST_ENTRY.createdAt, 'en'));
    });

    it('should localize the language names and dates when the app language changes', async () => {
        await useEnglishTranslations();
        entries$.next([NEWEST_ENTRY]);
        await enterPage();

        language$.next('pt');

        expect(component.displayLanguage).toBe('pt');
        expect(pageText()).toContain('Espanhol → Inglês');
        expect(component.items[0].savedAt).toBe(formatDate(NEWEST_ENTRY.createdAt, 'pt'));
    });

    it('should hide the saved date of an entry with an invalid timestamp', async () => {
        entries$.next([{ ...OLDEST_ENTRY, createdAt: 'not-a-date' }]);
        await enterPage();

        expect(component.items[0].savedAt).toBe(EMPTY);
        expect(host().querySelector('time')).toBeNull();
    });

    it('should keep showing saved entries while history is disabled so they can be deleted', async () => {
        settings$.next({ ...currentSettings, historyEnabled: false });
        entries$.next([NEWEST_ENTRY]);
        await enterPage();

        expect(translatedTexts()).toEqual(['Roast chicken with potatoes']);
        expect(pageText()).toContain('history.disabledMessage');
        expect(pageText()).not.toContain('history.disabledTitle');
        expect(deleteButtons().length).toBe(1);
    });

    it('should label each delete button with a truncated excerpt of the original text', async () => {
        await useEnglishTranslations();
        entries$.next([
            NEWEST_ENTRY,
            { ...OLDEST_ENTRY, originalText: 'Ensalada de la casa con tomate, cebolla, aceitunas y atún' },
        ]);
        await enterPage();

        expect(deleteButtons().map((button: HTMLElement) => accessibleLabel(button))).toEqual([
            'Delete translation: Pollo asado con patatas',
            'Delete translation: Ensalada de la casa con tomate, cebolla…',
        ]);
    });

    it('should delete an entry and move the focus to the next one', async () => {
        entries$.next([NEWEST_ENTRY, MIDDLE_ENTRY, OLDEST_ENTRY]);
        await enterPage();

        deleteButtons()[1].click();
        await flushPromises();

        expect(historyService.remove).toHaveBeenCalledWith('entry-middle');
        expect(translatedTexts()).toEqual(['Roast chicken with potatoes', 'Soup of the day']);
        expect(document.activeElement?.id).toBe('history-entry-entry-oldest');
    });

    it('should move the focus to the previous entry when the last one is deleted', async () => {
        entries$.next([NEWEST_ENTRY, OLDEST_ENTRY]);
        await enterPage();

        await component.removeEntry(component.items[1]);

        expect(document.activeElement?.id).toBe('history-entry-entry-newest');
    });

    it('should move the focus to the empty state when the only entry is deleted', async () => {
        entries$.next([NEWEST_ENTRY]);
        await enterPage();

        await component.removeEntry(component.items[0]);

        expect(pageText()).toContain('history.empty');
        expect(document.activeElement?.id).toBe(component.stateTitleId);
    });

    it('should report a failed deletion', async () => {
        const failure: Error = new Error('storage');

        entries$.next([NEWEST_ENTRY]);
        await enterPage();
        historyService.remove.mockRejectedValueOnce(failure);

        await component.removeEntry(component.items[0]);

        expect(loggerService.error).toHaveBeenCalledWith('history-delete-failed', failure);
        expect(errorMessageSpy).toHaveBeenCalledWith('history.deleteError');
        expect(translatedTexts()).toEqual(['Roast chicken with potatoes']);
    });

    it('should clear the history after confirmation', async () => {
        entries$.next([NEWEST_ENTRY, OLDEST_ENTRY]);
        await enterPage();

        clearButton()?.click();
        await flushPromises();

        expect(confirmationSpy).toHaveBeenCalledWith(
            'history.clearConfirmTitle',
            'history.clearConfirmMessage',
            'history.clearConfirm',
            'warning',
            true,
        );
        expect(historyService.clear).toHaveBeenCalledTimes(1);
        expect(loadingSpy).toHaveBeenCalledExactlyOnceWith(true, 'common.deleting');
        expect(loadingResultSpy).toHaveBeenCalledExactlyOnceWith('success', 'history.clearSuccess');
        expect(loadingSpy.mock.invocationCallOrder[0]).toBeLessThan(loadingResultSpy.mock.invocationCallOrder[0]);
        expect(successMessageSpy).not.toHaveBeenCalled();
        expect(pageText()).toContain('history.empty');
        expect(clearButton()).toBeUndefined();
        expect(document.activeElement?.id).toBe(component.stateTitleId);
    });

    it('should keep the history when clearing is cancelled', async () => {
        confirmationSpy.mockResolvedValueOnce(false);
        entries$.next([NEWEST_ENTRY]);
        await enterPage();

        await component.clearHistory();

        expect(historyService.clear).not.toHaveBeenCalled();
        expect(loadingSpy).not.toHaveBeenCalled();
        expect(translatedTexts()).toEqual(['Roast chicken with potatoes']);
    });

    it('should report a failure while clearing the history', async () => {
        const failure: Error = new Error('storage');

        historyService.clear.mockRejectedValueOnce(failure);
        entries$.next([NEWEST_ENTRY]);
        await enterPage();

        await component.clearHistory();

        expect(loadingSpy).toHaveBeenCalledExactlyOnceWith(true, 'common.deleting');
        expect(loggerService.error).toHaveBeenCalledWith('history-clear-failed', failure);
        expect(loadingResultSpy).toHaveBeenCalledExactlyOnceWith('error', 'history.deleteError');
        expect(errorMessageSpy).not.toHaveBeenCalled();
        expect(successMessageSpy).not.toHaveBeenCalled();
    });

    it('should report a load failure and still show the page state', async () => {
        const failure: Error = new Error('storage');

        historyService.load.mockRejectedValueOnce(failure);
        await enterPage();

        expect(loggerService.error).toHaveBeenCalledWith('history-load-failed', failure);
        expect(errorMessageSpy).toHaveBeenCalledWith('history.loadError');
        expect(component.loaded).toBe(true);
        expect(pageText()).toContain('history.empty');
    });

    it('should stop listening when destroyed', async () => {
        await enterPage();
        fixture.destroy();

        entries$.next([NEWEST_ENTRY]);

        expect(component.items).toEqual([]);
    });
});
