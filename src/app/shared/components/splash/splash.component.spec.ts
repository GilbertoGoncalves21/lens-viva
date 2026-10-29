import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslatePipe, TranslateService, provideTranslateService } from '@ngx-translate/core';
import { Subscription, firstValueFrom } from 'rxjs';
import type { Mock, MockInstance } from 'vitest';
import { SplashService } from 'src/app/services/splash/splash.service';
import 'src/app/shared/shared.module';
import { EMPTY, SPLASH_CONFIG } from 'src/app/shared/utils';
import { SplashComponent } from './splash.component';

type MatchMediaFunction = (query: string) => MediaQueryList;

const DECORATIVE_SELECTORS: string[] = [
        '.lens-splash-glow'
    ,   '.lens-splash-mark'
    ,   '.lens-splash-wordmark'
    ,   '.lens-splash-tagline'
    ,   '.lens-splash-progress'
];

const LEAVING_CLASS: string = 'lens-splash-leaving';

const LEAVING_DELAY_MILLISECONDS: number = SPLASH_CONFIG.durationMilliseconds - SPLASH_CONFIG.exitMilliseconds;

const LOADING_TEXT: string = 'Loading Lens Viva…';

const REDUCED_CLASS: string = 'lens-splash-reduced';

const REDUCED_MOTION_QUERY: string = '(prefers-reduced-motion: reduce)';

const SPLASH_SELECTOR: string = 'section.lens-splash';

const STATUS_SELECTOR: string = '.visually-hidden[role="status"]';

const TAGLINE_TEXT: string = 'See the world without barriers';

describe('SplashComponent', () => {
    const originalMatchMedia: MatchMediaFunction | undefined = window.matchMedia;
    let completeSpy: MockInstance<() => void>;
    let component: SplashComponent;
    let element: HTMLElement;
    let fixture: ComponentFixture<SplashComponent>;
    let splashService: SplashService;

    function createSplash(): void {
        fixture = TestBed.createComponent(SplashComponent);
        component = fixture.componentInstance;
        element = fixture.nativeElement as HTMLElement;
        fixture.detectChanges();
    }

    function splash(): HTMLElement | null {
        return element.querySelector<HTMLElement>(SPLASH_SELECTOR);
    }

    function stubMatchMedia(matches: boolean): Mock<MatchMediaFunction> {
        const matchMedia: Mock<MatchMediaFunction> = vi.fn<MatchMediaFunction>(() => ({ matches: matches }) as MediaQueryList);

        Object.defineProperty(window, 'matchMedia', { configurable: true, value: matchMedia, writable: true });

        return matchMedia;
    }

    function text(selector: string): string {
        return element.querySelector<HTMLElement>(selector)?.textContent?.trim() ?? EMPTY;
    }

    beforeEach(async () => {
        TestBed.configureTestingModule({
            declarations: [SplashComponent],
            imports: [TranslatePipe],
            providers: [provideTranslateService()],
            schemas: [CUSTOM_ELEMENTS_SCHEMA],
        });

        const translateService: TranslateService = TestBed.inject(TranslateService);

        translateService.setTranslation('en', { splash: { loading: LOADING_TEXT, tagline: TAGLINE_TEXT } });
        await firstValueFrom(translateService.use('en'));

        splashService = TestBed.inject(SplashService);
        completeSpy = vi.spyOn(splashService, 'complete');
        vi.useFakeTimers();
    });

    afterEach(() => {
        fixture?.destroy();
        vi.useRealTimers();
        vi.restoreAllMocks();
        Object.defineProperty(window, 'matchMedia', { configurable: true, value: originalMatchMedia, writable: true });
    });

    it('should create', () => {
        createSplash();

        expect(component).toBeTruthy();
    });

    it('should show the opening animation with a loading status for screen readers', () => {
        createSplash();

        expect(component.visible).toBe(true);
        expect(component.leaving).toBe(false);
        expect(splash()).not.toBeNull();
        expect(splash()?.classList.contains(LEAVING_CLASS)).toBe(false);
        expect(text(STATUS_SELECTOR)).toBe(LOADING_TEXT);
        expect(text('.lens-splash-tagline')).toBe(TAGLINE_TEXT);
        expect(splashService.finished).toBe(false);
        expect(completeSpy).not.toHaveBeenCalled();
    });

    it('should keep the loading status readable while hiding every decorative part from assistive technology', () => {
        createSplash();

        const status: HTMLElement | null = element.querySelector<HTMLElement>(STATUS_SELECTOR);

        DECORATIVE_SELECTORS.forEach((selector: string) => {
            expect(element.querySelector(selector)?.getAttribute('aria-hidden')).toBe('true');
        });
        expect(status?.closest('[aria-hidden="true"]')).toBeNull();
        expect(element.querySelector('svg.lens-splash-brackets')?.getAttribute('focusable')).toBe('false');
        expect(element.querySelector('.lens-splash-cjk')?.getAttribute('lang')).toBe('zh');
    });

    it('should leave the bracket colors to the theme so the amber and indigo brackets use their gradients', () => {
        createSplash();

        const brackets: SVGPathElement[] = Array.from(element.querySelectorAll<SVGPathElement>('path.lens-splash-bracket'));

        expect(brackets.length).toBe(4);
        expect(brackets.filter((bracket: SVGPathElement) => bracket.hasAttribute('stroke'))).toEqual([]);
        expect(element.querySelector('path.lens-splash-bracket-top-end')).not.toBeNull();
        expect(element.querySelector('path.lens-splash-bracket-bottom-start')).not.toBeNull();
        expect(element.querySelector('#lens-splash-amber')?.tagName).toBe('linearGradient');
        expect(element.querySelector('#lens-splash-indigo')?.tagName).toBe('linearGradient');
    });

    it('should keep playing without leaving until the exit begins', () => {
        createSplash();
        vi.advanceTimersByTime(LEAVING_DELAY_MILLISECONDS - 1);

        expect(component.leaving).toBe(false);
        expect(splash()?.classList.contains(LEAVING_CLASS)).toBe(false);
    });

    it('should start leaving 450 milliseconds before the end and keep the splash on screen', () => {
        createSplash();
        vi.advanceTimersByTime(LEAVING_DELAY_MILLISECONDS);

        expect(LEAVING_DELAY_MILLISECONDS).toBe(3550);
        expect(component.leaving).toBe(true);
        expect(component.visible).toBe(true);
        expect(splash()?.classList.contains(LEAVING_CLASS)).toBe(true);
        expect(completeSpy).not.toHaveBeenCalled();
        expect(splashService.finished).toBe(false);
    });

    it('should stay on screen until the last millisecond of the four seconds', () => {
        createSplash();
        vi.advanceTimersByTime(SPLASH_CONFIG.durationMilliseconds - 1);

        expect(splash()).not.toBeNull();
        expect(completeSpy).not.toHaveBeenCalled();
    });

    it('should remove the splash and let the app continue after four seconds', () => {
        createSplash();
        vi.advanceTimersByTime(SPLASH_CONFIG.durationMilliseconds);

        expect(SPLASH_CONFIG.durationMilliseconds).toBe(4000);
        expect(component.visible).toBe(false);
        expect(splash()).toBeNull();
        expect(element.querySelector(STATUS_SELECTOR)).toBeNull();
        expect(completeSpy).toHaveBeenCalledTimes(1);
        expect(splashService.finished).toBe(true);
    });

    it('should not run any of its timers again after the opening animation ends', () => {
        createSplash();
        vi.advanceTimersByTime(SPLASH_CONFIG.durationMilliseconds);
        vi.advanceTimersByTime(SPLASH_CONFIG.durationMilliseconds);

        expect(component.visible).toBe(false);
        expect(component.leaving).toBe(true);
        expect(completeSpy).toHaveBeenCalledTimes(1);
    });

    it('should resolve the services waiting for the opening animation when it ends', async () => {
        let resolved: boolean = false;

        createSplash();
        splashService.whenFinished().then(() => {
            resolved = true;
        });
        await vi.advanceTimersByTimeAsync(SPLASH_CONFIG.durationMilliseconds - 1);

        expect(resolved).toBe(false);

        await vi.advanceTimersByTimeAsync(1);

        expect(resolved).toBe(true);
    });

    it('should play the reduced version when the system asks to reduce motion', () => {
        const matchMedia: Mock<MatchMediaFunction> = stubMatchMedia(true);

        createSplash();

        expect(matchMedia).toHaveBeenCalledWith(REDUCED_MOTION_QUERY);
        expect(component.reducedMotion).toBe(true);
        expect(splash()?.classList.contains(REDUCED_CLASS)).toBe(true);
    });

    it('should keep the reduced version for the exit when the system asks to reduce motion', () => {
        stubMatchMedia(true);
        createSplash();
        vi.advanceTimersByTime(LEAVING_DELAY_MILLISECONDS);

        expect(splash()?.classList.contains(REDUCED_CLASS)).toBe(true);
        expect(splash()?.classList.contains(LEAVING_CLASS)).toBe(true);
    });

    it('should play the full animation when the system allows motion', () => {
        stubMatchMedia(false);
        createSplash();

        expect(component.reducedMotion).toBe(false);
        expect(splash()?.classList.contains(REDUCED_CLASS)).toBe(false);
    });

    it('should play the full animation when media queries are not available', () => {
        Object.defineProperty(window, 'matchMedia', { configurable: true, value: undefined, writable: true });
        createSplash();

        expect(component.reducedMotion).toBe(false);
        expect(splash()?.classList.contains(REDUCED_CLASS)).toBe(false);
    });

    it('should cancel its timers and let the app continue when it is destroyed early', () => {
        createSplash();

        expect(vi.getTimerCount()).toBe(2);

        fixture.destroy();

        expect(vi.getTimerCount()).toBe(0);
        expect(completeSpy).toHaveBeenCalledTimes(1);
        expect(splashService.finished).toBe(true);
        expect(() => vi.advanceTimersByTime(SPLASH_CONFIG.durationMilliseconds)).not.toThrow();
        expect(completeSpy).toHaveBeenCalledTimes(1);
    });

    it('should stay finished when it is destroyed after the opening animation ends', () => {
        const emissions: boolean[] = [];

        createSplash();

        const subscription: Subscription = splashService.changes().subscribe((finished: boolean) => emissions.push(finished));

        vi.advanceTimersByTime(SPLASH_CONFIG.durationMilliseconds);
        fixture.destroy();

        expect(splashService.finished).toBe(true);
        expect(emissions).toEqual([false, true]);

        subscription.unsubscribe();
    });
});
