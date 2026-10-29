import { CUSTOM_ELEMENTS_SCHEMA, Directive, forwardRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, provideTranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { SweetAlertIcon } from 'sweetalert2';
import { Mock, MockInstance } from 'vitest';
import 'src/app/pages/pages.module';
import { AppLanguageService } from 'src/app/services/app-language/app-language.service';
import { HistoryService } from 'src/app/services/history/history.service';
import { LanguageDetectionService } from 'src/app/services/language-detection/language-detection.service';
import { LoggerService } from 'src/app/services/logger/logger.service';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { SessionControllerService } from 'src/app/services/session-controller/session-controller.service';
import { TranslationCacheService } from 'src/app/services/translation-cache/translation-cache.service';
import { AppSettings, HistoryEntry, RegionGranularity } from 'src/app/shared/models';
import { LanguageNamePipe } from 'src/app/shared/pipe';
import { AUTO_LANGUAGE, EMPTY, IconUtils, SUPPORTED_APP_LANGUAGES, SwalUtils } from 'src/app/shared/utils';
import { SettingsComponent } from './settings.component';

@Directive({
    selector: 'ion-range[formControlName], ion-segment[formControlName], ion-select[formControlName], ion-toggle[formControlName]',
    providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => IonicValueAccessorStubDirective), multi: true }],
    standalone: false,
})
class IonicValueAccessorStubDirective implements ControlValueAccessor {
    registerOnChange(callback: (value: unknown) => void): void {}

    registerOnTouched(callback: () => void): void {}

    writeValue(value: unknown): void {}
}

class HistoryServiceFake {
    private _clear: Mock<() => Promise<void>> = vi.fn((): Promise<void> => {
        this._entries = [];

        return Promise.resolve();
    });
    private _entries: HistoryEntry[] = [];
    private _load: Mock<() => Promise<HistoryEntry[]>> = vi.fn((): Promise<HistoryEntry[]> => Promise.resolve(this._entries));

    get clear(): Mock<() => Promise<void>> {
        return this._clear;
    }

    get entries(): HistoryEntry[] {
        return this._entries;
    }

    get load(): Mock<() => Promise<HistoryEntry[]>> {
        return this._load;
    }

    setEntries(entries: HistoryEntry[]): void {
        this._entries = entries;
    }
}

class PreferencesServiceFake {
    private _reset: Mock<() => Promise<void>> = vi.fn((): Promise<void> => {
        this._settings$.next(PreferencesService.defaultSettings({ sourceLanguage: AUTO_LANGUAGE, targetLanguage: 'pt' }));

        return Promise.resolve();
    });
    private _settings$: BehaviorSubject<AppSettings> = new BehaviorSubject<AppSettings>({
        ...PreferencesService.defaultSettings({ sourceLanguage: AUTO_LANGUAGE, targetLanguage: 'en' }),
        languageConfirmedFor: 'pt',
    });
    private _update: Mock<(changes: Partial<AppSettings>) => Promise<AppSettings>> = vi.fn((changes: Partial<AppSettings>): Promise<AppSettings> => {
        const settings: AppSettings = { ...this._settings$.value, ...changes };

        this._settings$.next(settings);

        return Promise.resolve(settings);
    });

    get reset(): Mock<() => Promise<void>> {
        return this._reset;
    }

    get settings(): AppSettings {
        return this._settings$.value;
    }

    get update(): Mock<(changes: Partial<AppSettings>) => Promise<AppSettings>> {
        return this._update;
    }

    emit(changes: Partial<AppSettings>): void {
        this._settings$.next({ ...this._settings$.value, ...changes });
    }

    settingsChanges(): Observable<AppSettings> {
        return this._settings$.asObservable();
    }
}

const HISTORY_ENTRY: HistoryEntry = {
    createdAt: '2026-10-21T12:30:00.000Z',
    historyEntryId: 'entry-1',
    originalText: 'Sopa del día',
    sourceLanguage: 'es',
    targetLanguage: 'en',
    translatedText: 'Soup of the day',
};

describe('SettingsComponent', () => {
    let appLanguageService: {
        changes: () => Observable<string>;
        currentLanguage: string;
        deviceLanguageTag: string;
        instant: (key: string) => string;
        previewLanguage: Mock<(language: string) => Promise<void>>;
        setPreference: Mock<(appLanguage: string) => Promise<void>>;
        supportedLanguages: string[];
    };
    let component: SettingsComponent;
    let confirmationSpy: MockInstance<(title: string, message: string, confirmText?: string, icon?: SweetAlertIcon, destructive?: boolean) => Promise<boolean>>;
    let fixture: ComponentFixture<SettingsComponent>;
    let historyService: HistoryServiceFake;
    let languageDetectionService: { clearCache: Mock<() => void> };
    let loadingResultSpy: MockInstance<(icon: SweetAlertIcon, message: string) => Promise<void>>;
    let loadingSpy: MockInstance<(visible: boolean, message?: string) => void>;
    let loggerService: { error: (event: string, error: unknown) => void };
    let preferencesService: PreferencesServiceFake;
    let router: { navigateByUrl: Mock<(url: string, extras?: { replaceUrl: boolean }) => Promise<boolean>> };
    let sessionControllerService: { updateAnalysisRate: (analysesPerSecond: number) => Promise<void> };
    let translationCacheService: { clear: Mock<() => void> };

    beforeEach(() => {
        historyService = new HistoryServiceFake();
        languageDetectionService = { clearCache: vi.fn() };
        preferencesService = new PreferencesServiceFake();
        appLanguageService = {
            changes: vi.fn(() => new BehaviorSubject<string>('en').asObservable()),
            currentLanguage: 'en',
            deviceLanguageTag: 'pt-BR',
            instant: vi.fn((key: string) => key),
            previewLanguage: vi.fn((): Promise<void> => Promise.resolve()),
            setPreference: vi.fn((appLanguage: string) => preferencesService.update({ appLanguage: appLanguage }).then(() => undefined)),
            supportedLanguages: SUPPORTED_APP_LANGUAGES,
        };
        loggerService = { error: vi.fn() };
        router = { navigateByUrl: vi.fn((): Promise<boolean> => Promise.resolve(true)) };
        sessionControllerService = { updateAnalysisRate: vi.fn(() => Promise.resolve()) };
        translationCacheService = { clear: vi.fn() };

        IconUtils.register();
        confirmationSpy = vi.spyOn(SwalUtils, 'showConfirmationDialog').mockResolvedValue(true);
        loadingSpy = vi.spyOn(SwalUtils, 'showLoading').mockImplementation((): void => undefined);
        loadingResultSpy = vi.spyOn(SwalUtils, 'showLoadingResult').mockResolvedValue(undefined);
        vi.spyOn(SwalUtils, 'showErrorMessage').mockImplementation(() => undefined);
        vi.spyOn(SwalUtils, 'showSuccessMessage').mockResolvedValue(undefined);

        TestBed.configureTestingModule({
            imports: [ReactiveFormsModule, TranslatePipe],
            declarations: [IonicValueAccessorStubDirective, LanguageNamePipe, SettingsComponent],
            providers: [
                provideTranslateService(),
                { provide: AppLanguageService, useValue: appLanguageService },
                { provide: HistoryService, useValue: historyService },
                { provide: LanguageDetectionService, useValue: languageDetectionService },
                { provide: LoggerService, useValue: loggerService },
                { provide: PreferencesService, useValue: preferencesService },
                { provide: Router, useValue: router },
                { provide: SessionControllerService, useValue: sessionControllerService },
                { provide: TranslationCacheService, useValue: translationCacheService },
            ],
            schemas: [CUSTOM_ELEMENTS_SCHEMA],
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    function createComponent(): void {
        fixture = TestBed.createComponent(SettingsComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }

    function findItem(text: string): HTMLElement | undefined {
        return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('ion-item'))
            .find((item: HTMLElement) => (item.textContent ?? EMPTY).includes(text));
    }

    function flushPromises(): Promise<void> {
        return new Promise<void>((resolve: () => void) => setTimeout(resolve, 0));
    }

    function pageText(): string {
        return (fixture.nativeElement as HTMLElement).textContent ?? EMPTY;
    }

    it('should create', () => {
        createComponent();

        expect(component).toBeTruthy();
    });

    it('should fill the form from the stored settings', () => {
        createComponent();

        expect(component.form.controls.appLanguage.value).toBe(AUTO_LANGUAGE);
        expect(component.form.controls.balloonFontPercent.value).toBe(100);
        expect(component.form.contains('regionGranularity')).toBe(false);
        expect(component.deviceLanguageName).toBe('português');
    });

    it('should patch the form without persisting when the settings change elsewhere', () => {
        createComponent();

        preferencesService.emit({ requireWifiForDownloads: true, showDebugRegions: true });

        expect(component.form.controls.requireWifiForDownloads.value).toBe(true);
        expect(component.form.controls.showDebugRegions.value).toBe(true);
        expect(preferencesService.update).not.toHaveBeenCalled();
    });

    it('should persist reading and download toggle changes', async () => {
        createComponent();

        component.form.controls.showDebugRegions.setValue(true);
        component.form.controls.requireWifiForDownloads.setValue(true);
        await flushPromises();

        expect(preferencesService.update).toHaveBeenCalledWith({ showDebugRegions: true });
        expect(preferencesService.update).toHaveBeenCalledWith({ requireWifiForDownloads: true });
    });

    it('should persist the analysis rate after the range settles and apply it to the session', async () => {
        vi.useFakeTimers();
        createComponent();

        component.form.controls.analysesPerSecond.setValue(4);
        component.form.controls.analysesPerSecond.setValue(5);
        await vi.advanceTimersByTimeAsync(300);

        expect(preferencesService.update).toHaveBeenCalledTimes(1);
        expect(preferencesService.update).toHaveBeenCalledWith({ analysesPerSecond: 5 });
        expect(sessionControllerService.updateAnalysisRate).toHaveBeenCalledWith(5);
    });

    it('should store the balloon size as a scale factor', async () => {
        vi.useFakeTimers();
        createComponent();

        component.form.controls.balloonFontPercent.setValue(90);
        await vi.advanceTimersByTimeAsync(300);

        expect(preferencesService.update).toHaveBeenCalledWith({ balloonFontScale: 0.9 });
    });

    it('should persist a pending range change when the page is destroyed', () => {
        vi.useFakeTimers();
        createComponent();

        component.form.controls.balloonFontPercent.setValue(80);
        fixture.destroy();

        expect(preferencesService.update).toHaveBeenCalledWith({ balloonFontScale: 0.8 });
    });

    it('should offer balloon text sizes only up to the size of the source text and show a larger stored size as the largest one', () => {
        createComponent();

        expect(component.balloonFontPercentMax).toBe(100);
        expect(component.balloonFontPercentMin).toBe(80);

        preferencesService.emit({ balloonFontScale: 1.5 });

        expect(component.form.controls.balloonFontPercent.value).toBe(100);
        expect(component.balloonFontPercent).toBe(100);
    });

    it('should change the app language through the language service', async () => {
        createComponent();

        component.form.controls.appLanguage.setValue('pt');
        await flushPromises();

        expect(appLanguageService.setPreference).toHaveBeenCalledWith('pt');
    });

    it('should restore the form and report an error when saving fails', async () => {
        createComponent();
        preferencesService.update.mockRejectedValueOnce(new Error('storage'));

        component.form.controls.showDebugRegions.setValue(true);
        await flushPromises();

        expect(loggerService.error).toHaveBeenCalledWith('settings-save-failed', expect.any(Error));
        expect(SwalUtils.showErrorMessage).toHaveBeenCalledWith('common.saveError');
        expect(component.form.controls.showDebugRegions.value).toBe(false);
    });

    it('should clear the translation and language detection caches', () => {
        createComponent();

        component.clearCache();

        expect(translationCacheService.clear).toHaveBeenCalled();
        expect(languageDetectionService.clearCache).toHaveBeenCalled();
        expect(SwalUtils.showSuccessMessage).toHaveBeenCalledWith('settings.clearCacheSuccess');
    });

    it('should open the languages, history and terms pages', async () => {
        createComponent();

        await component.openLanguages();
        await component.openHistory();
        await component.openTerms();

        expect(router.navigateByUrl).toHaveBeenCalledWith('/languages');
        expect(router.navigateByUrl).toHaveBeenCalledWith('/history');
        expect(router.navigateByUrl).toHaveBeenCalledWith('/terms');
    });

    it('should label the native app language selector and describe its translation default', async () => {
        createComponent();
        const select = (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>('#app-language');
        expect(select?.getAttribute('aria-describedby')).toBe('app-language-help');
        expect(pageText()).toContain('settings.appLanguageHelp');
        expect(select?.value).toBe(AUTO_LANGUAGE);
    });

    it('should group the settings in labelled cards with decorative icons', () => {
        createComponent();

        const element: HTMLElement = fixture.nativeElement as HTMLElement;
        const groups: HTMLElement[] = Array.from(element.querySelectorAll<HTMLElement>('form > section'));
        const icons: HTMLElement[] = Array.from(element.querySelectorAll<HTMLElement>('ion-icon'));

        expect(groups.length).toBe(7);
        groups.forEach((group: HTMLElement) => {
            const heading: HTMLElement | null = group.querySelector<HTMLElement>('h2');

            expect(heading?.id).toBeTruthy();
            expect(group.getAttribute('aria-labelledby')).toBe(heading?.id);
            expect(group.querySelector('.lens-card')).not.toBeNull();
        });
        expect(icons.length).toBeGreaterThan(0);
        icons.forEach((icon: HTMLElement) => expect(icon.getAttribute('aria-hidden')).toBe('true'));
        expect(element.querySelector('img[src="assets/icon.png"]')?.getAttribute('alt')).toBe(EMPTY);
    });

    it('should render the analysis rate help as small print', () => {
        createComponent();

        const helpText: HTMLElement | null = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('ion-range[formControlName="analysesPerSecond"] + p > small');

        expect(helpText?.textContent?.trim()).toBe('settings.analysesPerSecondHelp');
        expect(helpText?.parentElement?.classList.contains('small')).toBe(false);
    });

    it('should no longer offer the introduction', () => {
        createComponent();

        expect(pageText()).not.toContain('settings.showOnboarding');
        expect((fixture.nativeElement as HTMLElement).querySelector('ion-icon[name="refresh-outline"]')).toBeNull();
        expect((component as unknown as Record<string, unknown>)['showOnboarding']).toBeUndefined();
    });

    it('should open the terms of use from the about section', async () => {
        createComponent();

        const termsItem: HTMLElement | undefined = findItem('terms.title');

        expect(termsItem?.closest('section')?.textContent).toContain('settings.aboutSection');

        termsItem?.click();
        await flushPromises();

        expect(router.navigateByUrl).toHaveBeenCalledTimes(1);
        expect(router.navigateByUrl).toHaveBeenCalledWith('/terms');
    });

    describe('history', () => {
        it('should start with history off and patch it when the settings change elsewhere', () => {
            createComponent();

            expect(component.form.controls.historyEnabled.value).toBe(false);

            preferencesService.emit({ historyEnabled: true });

            expect(component.form.controls.historyEnabled.value).toBe(true);
            expect(preferencesService.update).not.toHaveBeenCalled();
        });

        it('should save when history is turned on', async () => {
            createComponent();

            component.form.controls.historyEnabled.setValue(true);
            await flushPromises();

            expect(preferencesService.update).toHaveBeenCalledWith({ historyEnabled: true });
            expect(preferencesService.settings.historyEnabled).toBe(true);
            expect(confirmationSpy).not.toHaveBeenCalled();
            expect(historyService.clear).not.toHaveBeenCalled();
        });

        it('should turn history off without asking when nothing is saved', async () => {
            preferencesService.emit({ historyEnabled: true });
            createComponent();

            component.form.controls.historyEnabled.setValue(false);
            await flushPromises();

            expect(historyService.load).toHaveBeenCalled();
            expect(confirmationSpy).not.toHaveBeenCalled();
            expect(preferencesService.update).toHaveBeenCalledWith({ historyEnabled: false });
            expect(historyService.clear).toHaveBeenCalledTimes(1);
        });

        it('should ask before turning history off and delete the saved entries when confirmed', async () => {
            preferencesService.emit({ historyEnabled: true });
            historyService.setEntries([HISTORY_ENTRY]);
            createComponent();

            component.form.controls.historyEnabled.setValue(false);
            await flushPromises();

            expect(confirmationSpy).toHaveBeenCalledWith(
                'settings.historyDisableConfirmTitle',
                'settings.historyDisableConfirmMessage',
                'settings.historyDisableConfirm',
                'warning',
                true,
            );
            expect(preferencesService.update).toHaveBeenCalledWith({ historyEnabled: false });
            expect(historyService.clear).toHaveBeenCalledTimes(1);
            expect(preferencesService.update.mock.invocationCallOrder[0]).toBeLessThan(historyService.clear.mock.invocationCallOrder[0]);
            expect(historyService.entries).toEqual([]);
            expect(component.form.controls.historyEnabled.value).toBe(false);
        });

        it('should revert the toggle without saving when turning history off is cancelled', async () => {
            confirmationSpy.mockResolvedValueOnce(false);
            preferencesService.emit({ historyEnabled: true });
            historyService.setEntries([HISTORY_ENTRY]);
            createComponent();

            component.form.controls.historyEnabled.setValue(false);
            await flushPromises();

            expect(confirmationSpy).toHaveBeenCalled();
            expect(preferencesService.update).not.toHaveBeenCalled();
            expect(historyService.clear).not.toHaveBeenCalled();
            expect(component.form.controls.historyEnabled.value).toBe(true);
            expect(historyService.entries).toEqual([HISTORY_ENTRY]);
        });

        it('should still ask before turning history off when the saved entries cannot be read', async () => {
            const failure: Error = new Error('storage');

            confirmationSpy.mockResolvedValueOnce(false);
            preferencesService.emit({ historyEnabled: true });
            historyService.load.mockRejectedValueOnce(failure);
            createComponent();

            component.form.controls.historyEnabled.setValue(false);
            await flushPromises();

            expect(loggerService.error).toHaveBeenCalledWith('settings-history-load-failed', failure);
            expect(confirmationSpy).toHaveBeenCalledWith(
                'settings.historyDisableConfirmTitle',
                'settings.historyDisableConfirmMessage',
                'settings.historyDisableConfirm',
                'warning',
                true,
            );
            expect(preferencesService.update).not.toHaveBeenCalled();
            expect(historyService.clear).not.toHaveBeenCalled();
            expect(component.form.controls.historyEnabled.value).toBe(true);
        });

        it('should turn history off and delete the entries when confirmed after a failed read', async () => {
            preferencesService.emit({ historyEnabled: true });
            historyService.load.mockRejectedValueOnce(new Error('storage'));
            createComponent();

            component.form.controls.historyEnabled.setValue(false);
            await flushPromises();

            expect(confirmationSpy).toHaveBeenCalledTimes(1);
            expect(preferencesService.update).toHaveBeenCalledWith({ historyEnabled: false });
            expect(historyService.clear).toHaveBeenCalledTimes(1);
        });

        it('should keep the entries when saving the disabled setting fails', async () => {
            preferencesService.emit({ historyEnabled: true });
            historyService.setEntries([HISTORY_ENTRY]);
            createComponent();
            preferencesService.update.mockRejectedValueOnce(new Error('storage'));

            component.form.controls.historyEnabled.setValue(false);
            await flushPromises();

            expect(SwalUtils.showErrorMessage).toHaveBeenCalledWith('common.saveError');
            expect(historyService.clear).not.toHaveBeenCalled();
            expect(component.form.controls.historyEnabled.value).toBe(true);
        });

        it('should report a failure while deleting the entries after turning history off', async () => {
            const failure: Error = new Error('storage');

            preferencesService.emit({ historyEnabled: true });
            historyService.setEntries([HISTORY_ENTRY]);
            historyService.clear.mockRejectedValueOnce(failure);
            createComponent();

            component.form.controls.historyEnabled.setValue(false);
            await flushPromises();

            expect(loggerService.error).toHaveBeenCalledWith('settings-history-clear-failed', failure);
            expect(SwalUtils.showErrorMessage).toHaveBeenCalledWith('history.deleteError');
            expect(preferencesService.settings.historyEnabled).toBe(false);
        });
    });

    describe('delete all data', () => {
        it('should delete every local data source, reset the settings and go back to the camera', async () => {
            preferencesService.emit({ appLanguage: 'pt', historyEnabled: true });
            historyService.setEntries([HISTORY_ENTRY]);
            createComponent();

            await component.deleteAllData();

            expect(confirmationSpy).toHaveBeenCalledWith(
                'settings.deleteAllDataConfirmTitle',
                'settings.deleteAllDataConfirmDetails',
                'settings.deleteAllDataConfirm',
                'warning',
                true,
            );
            expect(historyService.clear).toHaveBeenCalledTimes(1);
            expect(historyService.entries).toEqual([]);
            expect(translationCacheService.clear).toHaveBeenCalledTimes(1);
            expect(languageDetectionService.clearCache).toHaveBeenCalledTimes(1);
            expect(preferencesService.reset).toHaveBeenCalledTimes(1);
            expect(appLanguageService.previewLanguage).toHaveBeenCalledWith('pt-BR');
            expect(appLanguageService.setPreference).not.toHaveBeenCalled();
            expect(preferencesService.reset.mock.invocationCallOrder[0]).toBeLessThan(appLanguageService.previewLanguage.mock.invocationCallOrder[0]);
            expect(preferencesService.update).not.toHaveBeenCalled();
            expect(loadingSpy).toHaveBeenCalledExactlyOnceWith(true, 'common.deleting');
            expect(loadingResultSpy).toHaveBeenCalledExactlyOnceWith('success', 'settings.deleteAllDataSuccess');
            expect(loadingSpy.mock.invocationCallOrder[0]).toBeLessThan(loadingResultSpy.mock.invocationCallOrder[0]);
            expect(SwalUtils.showSuccessMessage).not.toHaveBeenCalled();
            expect(router.navigateByUrl).toHaveBeenCalledTimes(1);
            expect(router.navigateByUrl).toHaveBeenCalledWith('/camera', { replaceUrl: true });
            expect(preferencesService.settings.languageConfirmedFor).toBe(EMPTY);
            expect(preferencesService.settings.targetLanguage).toBe('pt');
            expect(loadingResultSpy.mock.invocationCallOrder[0]).toBeLessThan(router.navigateByUrl.mock.invocationCallOrder[0]);
            expect(component.form.controls.historyEnabled.value).toBe(false);
            expect(component.form.controls.appLanguage.value).toBe(AUTO_LANGUAGE);

            fixture.destroy();

            expect(preferencesService.update).not.toHaveBeenCalled();
        });

        it('should start the deletion from the privacy section', async () => {
            createComponent();

            const deleteItem: HTMLElement | undefined = findItem('settings.deleteAllData');

            expect(deleteItem?.closest('section')?.textContent).toContain('settings.privacySection');
            expect(deleteItem?.querySelector('ion-label')?.getAttribute('color')).toBe('danger');
            expect(deleteItem?.querySelector('ion-icon')?.classList.contains('lens-icon-badge-danger')).toBe(true);

            deleteItem?.click();
            await flushPromises();

            expect(confirmationSpy).toHaveBeenCalledWith(
                'settings.deleteAllDataConfirmTitle',
                'settings.deleteAllDataConfirmDetails',
                'settings.deleteAllDataConfirm',
                'warning',
                true,
            );
            expect(router.navigateByUrl).toHaveBeenCalledWith('/camera', { replaceUrl: true });
        });

        it('should keep everything when the deletion is cancelled', async () => {
            confirmationSpy.mockResolvedValueOnce(false);
            createComponent();

            await component.deleteAllData();

            expect(historyService.clear).not.toHaveBeenCalled();
            expect(translationCacheService.clear).not.toHaveBeenCalled();
            expect(languageDetectionService.clearCache).not.toHaveBeenCalled();
            expect(preferencesService.reset).not.toHaveBeenCalled();
            expect(loadingSpy).not.toHaveBeenCalled();
            expect(router.navigateByUrl).not.toHaveBeenCalled();
        });

        it('should report a failure and stay on the settings page', async () => {
            const failure: Error = new Error('storage');

            preferencesService.reset.mockRejectedValueOnce(failure);
            createComponent();

            await component.deleteAllData();

            expect(loadingSpy).toHaveBeenCalledExactlyOnceWith(true, 'common.deleting');
            expect(loggerService.error).toHaveBeenCalledWith('settings-delete-all-data-failed', failure);
            expect(loadingResultSpy).toHaveBeenCalledExactlyOnceWith('error', 'settings.deleteAllDataError');
            expect(SwalUtils.showErrorMessage).not.toHaveBeenCalled();
            expect(SwalUtils.showSuccessMessage).not.toHaveBeenCalled();
            expect(appLanguageService.previewLanguage).not.toHaveBeenCalled();
            expect(router.navigateByUrl).not.toHaveBeenCalled();
        });
    });
});
