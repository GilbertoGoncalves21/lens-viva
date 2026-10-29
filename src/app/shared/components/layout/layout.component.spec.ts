import { ApplicationRef, ComponentRef, CUSTOM_ELEMENTS_SCHEMA, EnvironmentInjector, NgModuleRef, createComponent, createNgModule } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslatePipe, TranslateService, provideTranslateService } from '@ngx-translate/core';
import { EMPTY } from 'src/app/shared/utils';
import { SharedModule } from '../../shared.module';
import { LayoutComponent } from './layout.component';

interface BackButtonElement extends HTMLElement {
    defaultHref: string;
    text: string;
}

interface HeaderElement extends HTMLElement {
    translucent: boolean;
}

interface ContentElement extends HTMLElement {
    fullscreen: boolean;
}

interface ProjectedLayout {
    componentRef: ComponentRef<LayoutComponent>;
    hostElement: HTMLElement;
}

describe('LayoutComponent', () => {
    let component: LayoutComponent;
    let element: HTMLElement;
    let fixture: ComponentFixture<LayoutComponent>;

    beforeEach(() => {
        TestBed.configureTestingModule({
            declarations: [LayoutComponent],
            imports: [TranslatePipe],
            providers: [provideTranslateService()],
            schemas: [CUSTOM_ELEMENTS_SCHEMA],
        });

        const translateService: TranslateService = TestBed.inject(TranslateService);

        translateService.setTranslation('en', { common: { back: 'Back' } });
        translateService.use('en');

        fixture = TestBed.createComponent(LayoutComponent);
        component = fixture.componentInstance;
        element = fixture.nativeElement as HTMLElement;
    });

    function createProjectedLayout(inputs: Record<string, string | boolean>): ProjectedLayout {
        const actionButton: HTMLButtonElement = document.createElement('button');
        const body: HTMLParagraphElement = document.createElement('p');
        const footer: HTMLParagraphElement = document.createElement('p');

        actionButton.setAttribute('layoutActions', EMPTY);
        actionButton.textContent = 'Action';
        body.textContent = 'Page body';
        footer.setAttribute('layoutFooter', EMPTY);
        footer.textContent = 'Version 1.0.0';

        const componentRef: ComponentRef<LayoutComponent> = createComponent(LayoutComponent, {
            environmentInjector: TestBed.inject(EnvironmentInjector),
            projectableNodes: [[actionButton], [body], [footer]],
        });

        Object.entries(inputs).forEach(([name, value]: [string, string | boolean]) => componentRef.setInput(name, value));
        TestBed.inject(ApplicationRef).attachView(componentRef.hostView);
        componentRef.changeDetectorRef.detectChanges();

        return { componentRef: componentRef, hostElement: componentRef.location.nativeElement as HTMLElement };
    }

    function destroyProjectedLayout(layout: ProjectedLayout): void {
        TestBed.inject(ApplicationRef).detachView(layout.componentRef.hostView);
        layout.componentRef.destroy();
    }

    function componentStyles(): string {
        return Array.from(document.querySelectorAll<HTMLStyleElement>('style'))
            .map((style: HTMLStyleElement) => style.textContent ?? EMPTY)
            .join(EMPTY)
            .replace(/\s+/g, EMPTY);
    }

    function render(inputs: Record<string, string | boolean | null>): void {
        Object.entries(inputs).forEach(([name, value]: [string, string | boolean | null]) => fixture.componentRef.setInput(name, value));
        fixture.detectChanges();
    }

    it('should create', () => {
        render({});

        expect(component).toBeTruthy();
    });

    it('should be declared by an instantiable SharedModule', () => {
        const moduleRef: NgModuleRef<SharedModule> = createNgModule(SharedModule, TestBed.inject(EnvironmentInjector));

        expect(moduleRef.instance).toBeInstanceOf(SharedModule);

        moduleRef.destroy();
    });

    it('should use the flex host classes', () => {
        render({});

        expect(element.classList.contains('d-flex')).toBe(true);
        expect(element.classList.contains('flex-column')).toBe(true);
        expect(element.classList.contains('h-100')).toBe(true);
        expect(element.classList.contains('w-100')).toBe(true);
    });

    it('should render the title', () => {
        render({ title: 'Languages' });

        expect(element.querySelector('ion-title')?.textContent?.trim()).toBe('Languages');
    });

    it('should expose the title as the page level heading', () => {
        render({ title: 'Languages' });

        const title: HTMLElement | null = element.querySelector<HTMLElement>('ion-title');

        expect(title?.getAttribute('role')).toBe('heading');
        expect(title?.getAttribute('aria-level')).toBe('1');
    });

    it('should update the title when the input changes', () => {
        render({ title: 'Languages' });
        render({ title: 'Settings' });

        expect(element.querySelector('ion-title')?.textContent?.trim()).toBe('Settings');
    });

    it('should not render a back button without backHref', () => {
        render({ title: 'Lens Viva' });

        expect(element.querySelector('ion-back-button')).toBeNull();
    });

    it('should render a translated back button with backHref', () => {
        render({ backHref: '/camera', title: 'Settings' });

        const backButton: BackButtonElement | null = element.querySelector<BackButtonElement>('ion-back-button');

        expect(backButton).not.toBeNull();
        expect(backButton?.defaultHref).toBe('/camera');
        expect(backButton?.text).toBe('Back');
    });

    it('should remove the back button when backHref is cleared', () => {
        render({ backHref: '/camera' });
        render({ backHref: null });

        expect(element.querySelector('ion-back-button')).toBeNull();
    });

    it('should not render the brand by default', () => {
        render({ title: 'Settings' });

        expect(element.querySelector('ion-toolbar > section[slot="start"]')).toBeNull();
        expect(element.querySelector('img')).toBeNull();
        expect(element.querySelector('h1')).toBeNull();
    });

    it('should render the logo and the wordmark heading at the toolbar start instead of the back button and title in brand mode', () => {
        render({ backHref: '/camera', showBrand: true, title: 'Settings' });

        const brand: HTMLElement | null = element.querySelector<HTMLElement>('ion-toolbar > section[slot="start"]');
        const logo: HTMLImageElement | null = brand?.querySelector<HTMLImageElement>('img') ?? null;
        const heading: HTMLHeadingElement | null = brand?.querySelector<HTMLHeadingElement>('h1') ?? null;

        expect(brand?.getAttribute('slot')).toBe('start');
        expect(logo?.getAttribute('src')).toBe('assets/icon.png');
        expect(logo?.getAttribute('alt')).toBe(EMPTY);
        expect(logo?.getAttribute('width')).toBe('32');
        expect(logo?.getAttribute('height')).toBe('32');
        expect(logo?.classList.contains('lens-brand-logo')).toBe(true);
        expect(heading?.classList.contains('lens-wordmark')).toBe(true);
        expect(heading?.textContent?.trim()).toBe('Lens Viva');
        expect(heading?.querySelector('.lens-brand-accent')?.textContent).toBe('Viva');
        expect(brand?.firstElementChild).toBe(logo);
        expect(element.querySelector('ion-title')).toBeNull();
        expect(element.querySelector('ion-back-button')).toBeNull();
        expect(element.querySelectorAll('h1, [role="heading"][aria-level="1"]').length).toBe(1);
    });

    it('should switch back to the title when brand mode is turned off', () => {
        render({ showBrand: true, title: 'Settings' });
        render({ showBrand: false });

        expect(element.querySelector('ion-toolbar > section[slot="start"]')).toBeNull();
        expect(element.querySelector('ion-title')?.textContent?.trim()).toBe('Settings');
    });

    it('should not be transparent by default and draw the header without the Material shadow', () => {
        render({});

        const header: HeaderElement | null = element.querySelector<HeaderElement>('ion-header');
        const content: ContentElement | null = element.querySelector<ContentElement>('ion-content');

        expect(header?.classList.contains('lens-chrome-dark')).toBe(false);
        expect(header?.classList.contains('ion-no-border')).toBe(true);
        expect(content?.classList.contains('lens-content-transparent')).toBe(false);
    });

    it('should paint the header, the content and the footer with the dark app surface in every mode', () => {
        render({ showFooter: true, title: 'Settings' });

        const styles: string = componentStyles();

        expect(styles).toMatch(/ion-header\[[^\]]+\],\[[^\]]+\]ion-footer\[[^\]]+\]\{background:var\(--lens-surface-0\);/);
        expect(styles).toMatch(/ion-toolbar\[[^\]]+\]\{--border-style:solid;--border-width:001px;?\}/);
        expect(styles).toMatch(/ion-content\[[^\]]+\]\{--background:var\(--lens-surface-0\);--color:var\(--lens-text-primary\);?\}/);
        expect(styles).toMatch(/\.lens-chrome-dark\[[^\]]+\]ion-toolbar\[[^\]]+\]\{--border-width:0;?\}/);
        expect(styles).toMatch(/\.lens-content-transparent\[[^\]]+\]\{--background:transparent;?\}/);
        expect(element.querySelector('ion-footer')?.classList.contains('ion-no-border')).toBe(true);
    });

    it('should leave the toolbar, the title and the focus ring to the global theme and keep only the larger back button target', () => {
        render({ backHref: '/camera', title: 'Settings' });

        const styles: string = componentStyles();

        expect(styles).toMatch(/ion-back-button\[[^\]]+\]\{[^}]*--min-height:48px;--min-width:48px;?\}/);
        expect(styles).not.toMatch(/ion-title\[[^\]]+\]\{/);
        expect(styles).not.toMatch(/ion-back-button\[[^\]]+\]\.ion-focused/);
        expect(styles).not.toContain('#c7d2fe');
        expect(styles).not.toContain('--min-height:4rem');
        expect(styles).not.toContain('--background:var(--lens-surface-0);--border-color');
    });

    it('should compact the toolbar on short landscape screens to leave more room for the content', () => {
        render({ showBrand: true, showFooter: true, transparent: true });

        expect(componentStyles()).toMatch(/@media\(orientation:landscape\)and\(max-height:32rem\)\{\[[^\]]+\]ion-toolbar\[[^\]]+\]\{--min-height:3rem;?\}\}/);
    });

    it('should paint a dark borderless header above a transparent content when transparent', () => {
        render({ transparent: true });

        const header: HeaderElement | null = element.querySelector<HeaderElement>('ion-header');
        const content: ContentElement | null = element.querySelector<ContentElement>('ion-content');

        expect(header?.classList.contains('lens-chrome-dark')).toBe(true);
        expect(header?.classList.contains('ion-no-border')).toBe(true);
        expect(content?.classList.contains('lens-content-transparent')).toBe(true);
        expect(header?.translucent).not.toBe(true);
        expect(content?.fullscreen).not.toBe(true);
    });

    it('should not render a footer by default', () => {
        render({});

        expect(element.querySelector('ion-footer')).toBeNull();
    });

    it('should render a dark footer when transparent', () => {
        render({ showFooter: true, transparent: true });

        const footer: HTMLElement | null = element.querySelector<HTMLElement>('ion-footer');

        expect(footer).not.toBeNull();
        expect(footer?.classList.contains('lens-chrome-dark')).toBe(true);
        expect(footer?.classList.contains('ion-no-border')).toBe(true);
    });

    it('should project actions into the toolbar end slot and the body into the content', () => {
        const layout: ProjectedLayout = createProjectedLayout({ title: 'Settings' });

        expect(layout.hostElement.querySelector('ion-title')?.textContent?.trim()).toBe('Settings');
        expect(layout.hostElement.querySelector('ion-buttons[slot="end"] button[layoutActions]')?.textContent).toBe('Action');
        expect(layout.hostElement.querySelector('ion-content p')?.textContent).toBe('Page body');
        expect(layout.hostElement.querySelector('ion-footer')).toBeNull();
        expect(layout.hostElement.querySelector('[layoutFooter]')).toBeNull();

        destroyProjectedLayout(layout);
    });

    it('should project the footer content into the footer after the content', () => {
        const layout: ProjectedLayout = createProjectedLayout({ showBrand: true, showFooter: true });
        const footer: HTMLElement | null = layout.hostElement.querySelector<HTMLElement>('ion-footer');

        expect(footer?.querySelector('[layoutFooter]')?.textContent).toBe('Version 1.0.0');
        expect(layout.hostElement.querySelector('ion-content [layoutFooter]')).toBeNull();
        expect(layout.hostElement.querySelector('ion-content p')?.textContent).toBe('Page body');
        expect(layout.hostElement.lastElementChild).toBe(footer);
        expect(layout.hostElement.querySelector('ion-buttons[slot="end"] button[layoutActions]')?.textContent).toBe('Action');

        destroyProjectedLayout(layout);
    });
});
