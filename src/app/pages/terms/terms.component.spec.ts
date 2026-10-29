import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslatePipe, TranslateService, TranslationObject, provideTranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { Mock } from 'vitest';
import 'src/app/pages/pages.module';
import { AppLanguageService } from 'src/app/services/app-language/app-language.service';
import { EMPTY } from 'src/app/shared/utils';
import { environment } from 'src/environments/environment';
import { TermsComponent } from './terms.component';

interface AppLanguageServiceFake {
    changes: Mock<() => Observable<string>>;
    currentLanguage: string;
    deviceLanguageTag: string;
    instant: Mock<(key: string) => string>;
}

const LAST_UPDATED: Date = new Date('2026-10-27T00:00:00Z');

const SECTION_TITLE_KEYS: string[] = [
    'terms.acceptanceTitle',
    'terms.licenseTitle',
    'terms.howItWorksTitle',
    'terms.thirdPartyTitle',
    'terms.accuracyTitle',
    'terms.privacyTitle',
    'terms.changesTitle',
    'terms.contactTitle',
];

const TRANSLATED_NAMES: Record<string, string> = {
    'languages.title': 'Languages',
    'settings.deleteAllData': 'Delete all data',
    'settings.title': 'Settings',
};

describe('TermsComponent', () => {
    let appLanguageService: AppLanguageServiceFake;
    let component: TermsComponent;
    let fixture: ComponentFixture<TermsComponent>;
    let language$: BehaviorSubject<string>;

    const host: () => HTMLElement = (): HTMLElement => fixture.nativeElement as HTMLElement;

    const createComponent: () => void = (): void => {
        fixture = TestBed.createComponent(TermsComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    };

    const formatDate: (locale: string) => string = (locale: string): string =>
        new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(LAST_UPDATED);

    const headingTexts: () => string[] = (): string[] =>
        Array.from(host().querySelectorAll<HTMLElement>('h2')).map((heading: HTMLElement) => (heading.textContent ?? EMPTY).trim());

    const paragraphTexts: () => string[] = (): string[] =>
        Array.from(host().querySelectorAll<HTMLElement>('.lens-terms > section p')).map((paragraph: HTMLElement) => (paragraph.textContent ?? EMPTY).trim());

    const useTranslations: (language: string, translations: TranslationObject) => Promise<void> = async (language: string, translations: TranslationObject): Promise<void> => {
        const translateService: TranslateService = TestBed.inject(TranslateService);

        translateService.setTranslation(language, translations);
        await firstValueFrom(translateService.use(language));
    };

    beforeEach(() => {
        language$ = new BehaviorSubject<string>('en');
        appLanguageService = {
            changes: vi.fn((): Observable<string> => language$.asObservable()),
            currentLanguage: 'en',
            deviceLanguageTag: EMPTY,
            instant: vi.fn((key: string): string => TRANSLATED_NAMES[key] ?? key),
        };

        TestBed.configureTestingModule({
            imports: [TranslatePipe],
            declarations: [TermsComponent],
            providers: [
                provideTranslateService(),
                { provide: AppLanguageService, useValue: appLanguageService },
            ],
            schemas: [CUSTOM_ELEMENTS_SCHEMA],
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should create inside the layout with the terms title and a way back to the camera', () => {
        createComponent();

        const layout: (HTMLElement & { backHref?: string; title?: string }) | null = host().querySelector<HTMLElement & { backHref?: string; title?: string }>('app-layout');

        expect(component).toBeTruthy();
        expect(layout?.title).toBe('terms.title');
        expect(layout?.backHref).toBe('/camera');
    });

    it('should render every section as a labelled region with its own heading', () => {
        createComponent();

        const sections: HTMLElement[] = Array.from(host().querySelectorAll<HTMLElement>('.lens-terms > section'));

        expect(component.sections.map((section: { titleKey: string }) => section.titleKey)).toEqual(SECTION_TITLE_KEYS);
        expect(headingTexts()).toEqual(SECTION_TITLE_KEYS);
        expect(host().querySelectorAll('h1').length).toBe(0);
        expect(sections.length).toBe(SECTION_TITLE_KEYS.length);
        sections.forEach((section: HTMLElement) => {
            const heading: HTMLElement | null = section.querySelector<HTMLElement>('h2');

            expect(heading?.id).toMatch(/^terms-section-/);
            expect(section.getAttribute('aria-labelledby')).toBe(heading?.id);
        });
    });

    it('should cover the provisional terms topics', () => {
        createComponent();

        expect(paragraphTexts()).toEqual([
            'terms.acceptanceText',
            'terms.licenseText',
            'terms.licenseAsIs',
            'terms.howItWorksText',
            'terms.howItWorksImages',
            'terms.howItWorksHistory',
            'terms.thirdPartyText',
            'terms.thirdPartyDownloads',
            'terms.accuracyText',
            'terms.accuracyWarning',
            'terms.privacyText',
            'terms.privacyDeletion',
            'terms.changesText',
            'terms.contactText',
        ]);
        expect(host().textContent).toContain('terms.intro');
    });

    it('should point to the translated settings path to delete all data', async () => {
        await useTranslations('en', {
            terms: { privacyDeletion: 'Delete them in {{settings}} › {{action}}. Remove language packs in {{languages}}.' },
        });
        createComponent();

        expect(paragraphTexts()).toContain('Delete them in Settings › Delete all data. Remove language packs in Languages.');
        expect(appLanguageService.instant).toHaveBeenCalledWith('settings.title');
        expect(appLanguageService.instant).toHaveBeenCalledWith('settings.deleteAllData');
        expect(appLanguageService.instant).toHaveBeenCalledWith('languages.title');
    });

    it('should show the last updated date localized in the app language', async () => {
        await useTranslations('en', { terms: { lastUpdated: 'Last updated: {{date}}' } });
        createComponent();

        const time: HTMLElement | null = host().querySelector<HTMLElement>('time');

        expect(component.lastUpdated).toBe(formatDate('en'));
        expect(component.lastUpdated).toBe('October 27, 2026');
        expect(component.lastUpdatedIso).toBe('2026-10-27');
        expect(time?.getAttribute('datetime')).toBe('2026-10-27');
        expect(time?.textContent?.trim()).toBe('Last updated: October 27, 2026');
        expect(time?.closest('header p > small')).not.toBeNull();
    });

    it('should format the date again when the app language changes', async () => {
        createComponent();
        await useTranslations('pt', { terms: { lastUpdated: 'Última atualização: {{date}}' } });

        language$.next('pt');

        expect(component.lastUpdated).toBe(formatDate('pt'));
        expect(component.lastUpdated).toContain('outubro');
        expect(host().querySelector('time')?.textContent?.trim()).toBe(`Última atualização: ${formatDate('pt')}`);
    });

    it('should use the device region when it matches the app language', () => {
        appLanguageService.deviceLanguageTag = 'en_GB';
        createComponent();

        expect(component.lastUpdated).toBe(formatDate('en-GB'));
        expect(component.lastUpdated).toBe('27 October 2026');
    });

    it('should ignore the device region of another language', () => {
        appLanguageService.deviceLanguageTag = 'pt-BR';
        createComponent();

        expect(component.lastUpdated).toBe(formatDate('en'));
    });

    it('should show the app version', async () => {
        await useTranslations('en', { terms: { version: 'Lens Viva version {{version}}' } });
        createComponent();

        expect(component.appVersion).toBe(environment.appVersion);
        expect(host().querySelector('footer')?.textContent?.trim()).toBe(`Lens Viva version ${environment.appVersion}`);
        expect(host().querySelector('footer p > small')?.textContent?.trim()).toBe(`Lens Viva version ${environment.appVersion}`);
    });

    it('should render the secondary notes as small print without the unavailable small class', () => {
        createComponent();

        expect(host().querySelectorAll('.lens-terms p > small').length).toBe(2);
        expect(host().querySelectorAll('.small').length).toBe(0);
    });

    it('should stop following language changes when destroyed', () => {
        createComponent();

        fixture.destroy();
        language$.next('de');

        expect(component.lastUpdated).toBe(formatDate('en'));
    });
});
