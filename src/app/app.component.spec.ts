import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Mock, MockInstance } from 'vitest';
import { AppComponent } from './app.component';
import { initializeApplication } from './app.module';
import { AppLanguageService } from './services/app-language/app-language.service';
import { SplashService } from './services/splash/splash.service';
import { EMPTY, IconUtils } from './shared/utils';

describe('AppComponent', () => {
    let fixture: ComponentFixture<AppComponent>;
    let registerSpy: MockInstance<() => void>;

    beforeEach(() => {
        registerSpy = vi.spyOn(IconUtils, 'register');

        TestBed.configureTestingModule({
            declarations: [AppComponent],
            schemas: [CUSTOM_ELEMENTS_SCHEMA],
        });
        fixture = TestBed.createComponent(AppComponent);
        fixture.detectChanges();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should create', () => {
        expect(fixture.componentInstance).toBeTruthy();
    });

    it('should register the icons on creation', () => {
        expect(registerSpy).toHaveBeenCalledTimes(1);
    });

    it('should render the router outlet inside the ionic app shell', () => {
        const element: HTMLElement = fixture.nativeElement as HTMLElement;

        expect(element.querySelector('ion-app > ion-router-outlet')).not.toBeNull();
    });

    it('should render the opening animation before the ionic app shell so screen readers reach it first', () => {
        const element: HTMLElement = fixture.nativeElement as HTMLElement;

        expect(element.querySelectorAll('app-splash').length).toBe(1);
        expect(element.querySelector('app-splash + ion-app')).not.toBeNull();
        expect(element.querySelector('ion-app app-splash')).toBeNull();
    });

    it('should keep the pages under the opening animation out of the focus order and the accessibility tree until it ends', () => {
        const element: HTMLElement = fixture.nativeElement as HTMLElement;
        const splashService: SplashService = TestBed.inject(SplashService);

        expect(fixture.componentInstance.splashFinished).toBe(false);
        expect(element.querySelector('ion-app')?.getAttribute('inert')).toBe(EMPTY);
        expect(element.querySelector('ion-app')?.hasAttribute('aria-hidden')).toBe(false);

        splashService.complete();
        fixture.detectChanges();

        expect(fixture.componentInstance.splashFinished).toBe(true);
        expect(element.querySelector('ion-app')?.hasAttribute('inert')).toBe(false);
    });

    it('should stop following the opening animation when destroyed', () => {
        const splashService: SplashService = TestBed.inject(SplashService);

        fixture.destroy();
        splashService.complete();

        expect(fixture.componentInstance.splashFinished).toBe(false);
    });

    it('should initialize the app language before bootstrapping', async () => {
        const initialize: Mock<() => Promise<void>> = vi.fn(() => Promise.resolve());
        const appLanguageServiceStub: AppLanguageService = { initialize: initialize } as unknown as AppLanguageService;

        await initializeApplication(appLanguageServiceStub)();

        expect(initialize).toHaveBeenCalledTimes(1);
    });
});
