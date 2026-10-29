import { NgTemplateOutlet } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA, DebugElement, Directive, forwardRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { Router, RouterLink, provideRouter } from '@angular/router';
import { AppPlugin } from '@capacitor/app';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { IonSelect } from '@ionic/angular';
import { TranslatePipe, TranslateService, provideTranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Observable, Subject, firstValueFrom } from 'rxjs';
import { Mock, MockInstance } from 'vitest';
import 'src/app/pages/pages.module';
import { AppLanguageService } from 'src/app/services/app-language/app-language.service';
import { APP_PLUGIN } from 'src/app/services/capacitor/capacitor-plugins';
import { LanguageConfirmationService } from 'src/app/services/language-confirmation/language-confirmation.service';
import { LanguageModelService } from 'src/app/services/language-model/language-model.service';
import { LensEngineService } from 'src/app/services/lens-engine/lens-engine.service';
import { LoggerService } from 'src/app/services/logger/logger.service';
import { OverlayStoreService } from 'src/app/services/overlay-store/overlay-store.service';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { SceneLanguageService } from 'src/app/services/scene-language/scene-language.service';
import { SessionControllerService } from 'src/app/services/session-controller/session-controller.service';
import { SplashService } from 'src/app/services/splash/splash.service';
import {
    AppSettings
,   CameraDevice
,   EngineCapabilities
,   EngineErrorEvent
,   EngineStatusCode
,   EngineStatusEvent
,   LogDetails
,   ModelInventory
,   NormalizedRect
,   OverlayItem
,   OverlayStatus
,   RegionGranularity
,   SceneLanguageState
,   SceneLanguageStatus
,   ScreenRect
,   SessionState
,   SessionStatus
} from 'src/app/shared/models';
import { LanguageNamePipe } from 'src/app/shared/pipe';
import { AUTO_LANGUAGE, CAMERA_PREVIEW_HOST_ID, EMPTY, IconUtils, RECOGNITION_SOURCE_LANGUAGES, LanguageUtils, SwalUtils, UNDETERMINED_LANGUAGE } from 'src/app/shared/utils';
import { environment } from 'src/environments/environment';
import { CameraComponent } from './camera.component';

const ANNOUNCEMENT_SELECTOR: string = '#camera-announcement';

const CAMERA_ACTIVE_CLASS: string = 'lens-camera-active';

const FRAME_RECT: ScreenRect = { height: 410, width: 328, x: 16, y: 72 };

const FROZEN_NOTICE_SELECTOR: string = '#camera-frozen-notice';

const HINT_DELAY_MILLISECONDS: number = 2000;

const LANGUAGE_STATUS_SELECTOR: string = '#camera-language-status';

const RESIZE_OBSERVER_PROPERTY: string = 'ResizeObserver';

const SMALL_LINE_HEIGHT: number = 1.25;

const STATUS_LINE_SELECTOR: string = '#camera-status-line';

const STATUS_MESSAGE_SELECTOR: string = '[role="status"] h2 + p';

const STATUS_TITLE_SELECTOR: string = '[role="status"] h2';

@Directive({
    selector: 'ion-select[formControl]',
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
    private _changeCallback: (value: string | null) => void = () => undefined;
    private _value: string | null = null;

    get value(): string | null {
        return this._value;
    }

    choose(value: string | null): void {
        this._value = value;
        this._changeCallback(value);
    }

    registerOnChange(callback: (value: string | null) => void): void {
        this._changeCallback = callback;
    }

    registerOnTouched(): void {}

    writeValue(value: string | null): void {
        this._value = value;
    }
}

class ResizeObserverFake {
    private _callback: ResizeObserverCallback;
    private _disconnected: boolean = false;
    private static _instances: ResizeObserverFake[] = [];
    private _targets: Element[] = [];

    constructor(callback: ResizeObserverCallback) {
        this._callback = callback;
        ResizeObserverFake._instances.push(this);
    }

    get disconnected(): boolean {
        return this._disconnected;
    }

    static get instances(): ResizeObserverFake[] {
        return ResizeObserverFake._instances;
    }

    get targets(): Element[] {
        return this._targets;
    }

    disconnect(): void {
        this._disconnected = true;
        this._targets = [];
    }

    notify(): void {
        this._callback([], this as unknown as ResizeObserver);
    }

    observe(target: Element): void {
        this._targets.push(target);
    }

    static reset(): void {
        ResizeObserverFake._instances = [];
    }

    unobserve(target: Element): void {
        this._targets = this._targets.filter((observed: Element) => observed !== target);
    }
}

interface AppLanguageServiceFake {
    changes: Mock<() => Observable<string>>;
    currentLanguage: string;
    instant: Mock<(key: string, parameters?: Record<string, string>) => string>;
    refreshDeviceLanguage: Mock<() => Promise<string>>;
}

interface AppPluginFake {
    addListener: Mock<(eventName: string, listener: () => void) => Promise<PluginListenerHandle>>;
}

interface Deferred {
    promise: Promise<void>;
    reject: (reason: unknown) => void;
    resolve: () => void;
}

interface IonicElement extends HTMLElement {
    componentOnReady?: () => Promise<HTMLElement>;
}

interface LanguageConfirmationServiceFake {
    confirmIfNeeded: Mock<() => Promise<void>>;
    needsConfirmation: boolean;
}

interface LanguageModelServiceFake {
    changes: Mock<() => Observable<ModelInventory>>;
    download: Mock<(language: string, requireWifi: boolean) => Promise<void>>;
    inventory: ModelInventory;
}

interface LensEngineServiceFake {
    errors: Mock<() => Observable<EngineErrorEvent>>;
    getCapabilities: Mock<() => Promise<EngineCapabilities>>;
    listCameras: Mock<() => Promise<CameraDevice[]>>;
    selectCamera: Mock<(cameraId: string) => Promise<void>>;
    statuses: Mock<() => Observable<EngineStatusEvent>>;
}

interface LoggerServiceFake {
    error: Mock<(event: string, error: unknown) => void>;
    warn: Mock<(event: string, details?: LogDetails) => void>;
}

interface SourcePickerElement extends HTMLElement {
    interfaceOptions: { header: string };
    label: string;
    open: Mock<() => Promise<boolean>>;
}

interface OverlayStoreServiceFake {
    changes: Mock<() => Observable<OverlayItem[]>>;
    toggleOriginal: Mock<(regionId: string) => void>;
}

interface PluginListenerHandleFake {
    remove: Mock<() => Promise<void>>;
}

interface PreferencesServiceFake {
    settings: AppSettings;
    settingsChanges: Mock<() => Observable<AppSettings>>;
}

interface SceneLanguageServiceFake {
    changes: Mock<() => Observable<SceneLanguageState>>;
    startAutomatic: Mock<() => void>;
    state: SceneLanguageState;
}

interface SessionControllerServiceFake {
    retryFailedTranslations: Mock<() => void>;
    changes: Mock<() => Observable<SessionState>>;
    openAppSettings: Mock<() => Promise<void>>;
    setManualSourceLanguage: Mock<(language: string) => void>;
    setPreviewViewport: Mock<(viewport: ScreenRect | null) => Promise<void>>;
    start: Mock<() => Promise<SessionStatus>>;
    state: SessionState;
    stop: Mock<() => Promise<void>>;
    toggleFreeze: Mock<() => Promise<void>>;
}

interface SplashServiceFake {
    whenFinished: Mock<() => Promise<void>>;
}

function createCameras(count: number, activeIndex: number = 0): CameraDevice[] {
    return Array.from({ length: count }, (value: unknown, index: number): CameraDevice => ({
        active: index === activeIndex,
        cameraId: `camera-${index}`,
        label: `Camera label ${index}`,
    }));
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

function createDeferred(): Deferred {
    let resolve: () => void = () => undefined;
    let reject: (reason: unknown) => void = () => undefined;
    const promise: Promise<void> = new Promise<void>((resolvePromise: () => void, rejectPromise: (reason: unknown) => void) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return { promise: promise, reject: reject, resolve: resolve };
}

function createDomRect(rect: ScreenRect): DOMRect {
    return {
        bottom: rect.y + rect.height,
        height: rect.height,
        left: rect.x,
        right: rect.x + rect.width,
        toJSON: (): ScreenRect => rect,
        top: rect.y,
        width: rect.width,
        x: rect.x,
        y: rect.y,
    };
}

function createSettings(): AppSettings {
    return {
        analysesPerSecond: 3,
        appLanguage: 'auto',
        balloonFontScale: 1.2,
        historyEnabled: false,
        languageConfirmedFor: 'en',
        regionGranularity: RegionGranularity.BLOCK,
        requireWifiForDownloads: false,
        showDebugRegions: true,
        sourceLanguage: 'es',
        targetLanguage: 'en',
    };
}

function createState(status: SessionStatus, missingLanguages: string[] = []): SessionState {
    return {
        languagePair: { sourceLanguage: 'es', targetLanguage: 'en' },
        missingLanguages: missingLanguages,
        status: status,
    };
}

function createItem(changes: Partial<OverlayItem> = {}): OverlayItem {
    const anchorRect: NormalizedRect = changes.anchorRect ?? { height: 0.1, width: 0.5, x: 0.25, y: 0.25 };

    return {
        anchorRect: anchorRect,
        candidateText: EMPTY,
        failedAt: null,
        failedAttempts: 0,
        firstSeenAt: 1000,
        lastSeenAt: 1000,
        observedRect: anchorRect,
        orientation: 0,
        orientedHeight: anchorRect.height,
        orientedWidth: anchorRect.width,
        originalText: 'Sopa de tomate',
        regionId: 'region-1',
        showOriginal: false,
        sourceLanguage: 'es',
        stabilityScore: 0.5,
        status: OverlayStatus.TRANSLATED,
        textVersion: 1,
        translatedText: 'Tomato soup',
        ...changes,
    };
}

function flushPromises(): Promise<void> {
    return new Promise<void>((resolve: () => void) => setTimeout(resolve, 0));
}

function nextFrame(): Promise<void> {
    return new Promise<void>((resolve: () => void) => requestAnimationFrame(() => resolve()));
}

describe('CameraComponent', () => {
    let appLanguageService: AppLanguageServiceFake;
    let appPlugin: AppPluginFake;
    let component: CameraComponent;
    let element: HTMLElement;
    let engineErrors$: Subject<EngineErrorEvent>;
    let fixture: ComponentFixture<CameraComponent>;
    let inventory$: BehaviorSubject<ModelInventory>;
    let items$: BehaviorSubject<OverlayItem[]>;
    let language$: BehaviorSubject<string>;
    let languageConfirmationService: LanguageConfirmationServiceFake;
    let languageModelService: LanguageModelServiceFake;
    let lensEngineService: LensEngineServiceFake;
    let loggerService: LoggerServiceFake;
    let originalResizeObserver: PropertyDescriptor | undefined;
    let resumeListener: (() => void) | null;
    let resumeListenerHandle: PluginListenerHandleFake;
    let overlayStoreService: OverlayStoreServiceFake;
    let preferencesService: PreferencesServiceFake;
    let navigateByUrl: MockInstance<Router['navigateByUrl']>;
    let router: Router;
    let scene$: BehaviorSubject<SceneLanguageState>;
    let sceneLanguageService: SceneLanguageServiceFake;
    let sessionControllerService: SessionControllerServiceFake;
    let settings$: BehaviorSubject<AppSettings>;
    let splashService: SplashServiceFake;
    let state$: BehaviorSubject<SessionState>;
    let statuses$: Subject<EngineStatusEvent>;
    let view: Window & typeof globalThis;

    async function ariaAttributeOf(selector: string, name: string): Promise<string | null> {
        const host: IonicElement | null = element.querySelector<IonicElement>(selector);

        await host?.componentOnReady?.();

        return host?.getAttribute(name) ?? host?.shadowRoot?.querySelector('a, button')?.getAttribute(name) ?? null;
    }

    function ariaLabelOf(selector: string): Promise<string | null> {
        return ariaAttributeOf(selector, 'aria-label');
    }

    function announcement(): string {
        return text(ANNOUNCEMENT_SELECTOR);
    }

    function attachNativeButton(host: HTMLElement | null): HTMLButtonElement | null {
        if (!host) {
            return null;
        }

        if (host instanceof HTMLButtonElement) {
            return host;
        }

        const nativeButton: HTMLButtonElement = document.createElement('button');

        (host.shadowRoot ?? host.attachShadow({ mode: 'open' })).appendChild(nativeButton);

        return nativeButton;
    }

    function callOrder(mock: { mock: { invocationCallOrder: number[] } }): number {
        return mock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY;
    }

    function cameraPicker(): SourcePickerElement | null {
        return element.querySelectorAll<SourcePickerElement>('ion-select')[1] ?? null;
    }

    function cameraPickerAccessor(): SelectValueAccessorStubDirective {
        return fixture.debugElement.queryAll(By.directive(SelectValueAccessorStubDirective))[1].injector.get(SelectValueAccessorStubDirective);
    }

    function componentStyles(): string {
        return Array.from(document.querySelectorAll<HTMLStyleElement>('style'))
            .map((style: HTMLStyleElement) => style.textContent ?? EMPTY)
            .join(EMPTY)
            .replace(/\s+/g, EMPTY);
    }

    function dismissPicker(): void {
        picker()?.dispatchEvent(new CustomEvent('ionDismiss'));
    }

    async function emitItems(items: OverlayItem[]): Promise<void> {
        items$.next(items);
        await nextFrame();
    }

    function emitState(status: SessionStatus, missingLanguages: string[] = []): void {
        state$.next(createState(status, missingLanguages));
    }

    function emitEngineError(code: string): void {
        engineErrors$.next({ code: code, message: code });
    }

    function emitInventory(downloaded: string[], downloading: string[] = []): void {
        inventory$.next({ downloaded: downloaded, downloading: downloading });
    }

    function emitScene(status: SceneLanguageStatus, language: string | null = null, confidence: number = 0.9): void {
        scene$.next({ confidence: confidence, language: language, status: status });
    }

    function emitStatus(code: EngineStatusCode): void {
        statuses$.next({ code: code });
    }

    async function enableCameraSelection(cameras: CameraDevice[]): Promise<void> {
        lensEngineService.getCapabilities.mockResolvedValue(createCapabilities({ cameraSelection: true }));
        lensEngineService.listCameras.mockResolvedValue(cameras);
        await enter();
        emitState(SessionStatus.STARTING);
        emitState(SessionStatus.RUNNING);
        await flushPromises();
    }

    async function enter(): Promise<void> {
        component.ionViewDidEnter();
        await flushPromises();
    }

    function expectWrappingStatusLine(): void {
        const labels: HTMLElement[] = Array.from(statusLine()?.querySelectorAll<HTMLElement>('.lens-status-label') ?? []);
        const labelsText: string = labels
            .map((label: HTMLElement) => label.textContent ?? EMPTY)
            .join(EMPTY)
            .replace(/\s+/g, EMPTY);

        expect(labels.length).toBeGreaterThan(0);
        expect(labelsText).toBe(statusLineText().replace(/\s+/g, EMPTY));
        expect(statusLine()?.querySelectorAll('.text-truncate, .text-nowrap').length).toBe(0);
        labels.forEach((label: HTMLElement) => {
            expect(label.classList.contains('lh-sm')).toBe(true);
            expect(label.classList.contains('text-center')).toBe(true);
            expect(label.classList.contains('text-break')).toBe(true);
        });
    }

    function frame(): HTMLElement {
        return query('.lens-frame') as HTMLElement;
    }

    function freezeIconProperty(name: string): unknown {
        return fixture.debugElement.query(By.css('#camera-freeze-button ion-icon')).properties[name];
    }

    function instantCalls(key: string): number {
        return appLanguageService.instant.mock.calls.filter((call: [key: string, parameters?: Record<string, string>]) => call[0] === key).length;
    }

    function languageStatus(): IonicElement | null {
        return element.querySelector<IonicElement>(LANGUAGE_STATUS_SELECTOR) ?? (component.statusLine === component.statusLineKind.LANGUAGE_PAIR ? element.querySelector<IonicElement>('#camera-language-pair') : null);
    }

    function mockFrameRect(rect: ScreenRect): MockInstance<() => DOMRect> {
        return vi.spyOn(frame(), 'getBoundingClientRect').mockReturnValue(createDomRect(rect));
    }

    function modelMissingAction(): HTMLElement | null {
        return query('[role="status"] .lens-status-action');
    }

    function picker(): SourcePickerElement | null {
        return element.querySelector<SourcePickerElement>('ion-select');
    }

    function pickerAccessor(): SelectValueAccessorStubDirective {
        return fixture.debugElement.query(By.directive(SelectValueAccessorStubDirective)).injector.get(SelectValueAccessorStubDirective);
    }

    function query(selector: string): HTMLElement | null {
        return element.querySelector<HTMLElement>(selector);
    }

    function recreateOnNativePlatform(): void {
        fixture.destroy();
        vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
        fixture = TestBed.createComponent(CameraComponent);
        component = fixture.componentInstance;
        element = fixture.nativeElement as HTMLElement;
        fixture.detectChanges();
    }

    function remValue(declarations: string, property: string): number {
        const match: RegExpMatchArray | null = declarations.match(new RegExp(`(?:^|;)${property}:([\\d.]+)rem`));

        return Number(match?.[1] ?? Number.NaN);
    }

    function resizeObserver(): ResizeObserverFake {
        return ResizeObserverFake.instances[ResizeObserverFake.instances.length - 1];
    }

    async function resumeApp(): Promise<void> {
        resumeListener?.();
        await flushPromises();
    }

    async function runningWithoutText(): Promise<void> {
        await enter();
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        emitState(SessionStatus.RUNNING);
    }

    function statusLine(): HTMLElement | null {
        return query(STATUS_LINE_SELECTOR);
    }

    function statusLineText(): string {
        return (component.statusLine === component.statusLineKind.LANGUAGE_PAIR ? Array.from(element.querySelectorAll('#camera-language-pair strong')).map(node => node.textContent?.trim()).join(' ') : statusLine()?.textContent ?? EMPTY).replace(/\s+/g, ' ').trim();
    }

    function text(selector: string): string {
        return query(selector)?.textContent?.trim() ?? EMPTY;
    }

    async function useTranslations(translations: Record<string, string>): Promise<void> {
        const translateService: TranslateService = TestBed.inject(TranslateService);

        translateService.setTranslation('en', { camera: translations });
        await firstValueFrom(translateService.use('en'));
    }

    beforeEach(async () => {
        IconUtils.register();
        view = document.defaultView as Window & typeof globalThis;
        originalResizeObserver = Object.getOwnPropertyDescriptor(view, RESIZE_OBSERVER_PROPERTY);
        Object.defineProperty(view, RESIZE_OBSERVER_PROPERTY, { configurable: true, value: ResizeObserverFake, writable: true });
        ResizeObserverFake.reset();
        inventory$ = new BehaviorSubject<ModelInventory>({ downloaded: ['en', 'es'], downloading: [] });
        items$ = new BehaviorSubject<OverlayItem[]>([]);
        language$ = new BehaviorSubject<string>('en');
        scene$ = new BehaviorSubject<SceneLanguageState>({ confidence: 0, language: null, status: SceneLanguageStatus.IDLE });
        settings$ = new BehaviorSubject<AppSettings>(createSettings());
        state$ = new BehaviorSubject<SessionState>(createState(SessionStatus.IDLE));
        statuses$ = new Subject<EngineStatusEvent>();
        engineErrors$ = new Subject<EngineErrorEvent>();

        appLanguageService = {
            changes: vi.fn<() => Observable<string>>(() => language$.asObservable()),
            currentLanguage: 'en',
            instant: vi.fn<(key: string, parameters?: Record<string, string>) => string>((key: string) => key),
            refreshDeviceLanguage: vi.fn<() => Promise<string>>(() => Promise.resolve('en-US')),
        };
        resumeListener = null;
        resumeListenerHandle = {
            remove: vi.fn<() => Promise<void>>(() => Promise.resolve()),
        };
        appPlugin = {
            addListener: vi.fn<(eventName: string, listener: () => void) => Promise<PluginListenerHandle>>((eventName: string, listener: () => void) => {
                resumeListener = eventName === 'resume' ? listener : resumeListener;

                return Promise.resolve(resumeListenerHandle as unknown as PluginListenerHandle);
            }),
        };
        languageConfirmationService = {
            confirmIfNeeded: vi.fn<() => Promise<void>>(() => Promise.resolve()),
            needsConfirmation: false,
        };
        languageModelService = {
            changes: vi.fn<() => Observable<ModelInventory>>(() => inventory$.asObservable()),
            download: vi.fn<(language: string, requireWifi: boolean) => Promise<void>>(() => Promise.resolve()),
            inventory: inventory$.value,
        };
        lensEngineService = {
            errors: vi.fn<() => Observable<EngineErrorEvent>>(() => engineErrors$.asObservable()),
            getCapabilities: vi.fn<() => Promise<EngineCapabilities>>(() => Promise.resolve(createCapabilities())),
            listCameras: vi.fn<() => Promise<CameraDevice[]>>(() => Promise.resolve([])),
            selectCamera: vi.fn<(cameraId: string) => Promise<void>>(() => Promise.resolve()),
            statuses: vi.fn<() => Observable<EngineStatusEvent>>(() => statuses$.asObservable()),
        };
        loggerService = {
            error: vi.fn<(event: string, error: unknown) => void>(),
            warn: vi.fn<(event: string, details?: LogDetails) => void>(),
        };
        overlayStoreService = {
            changes: vi.fn<() => Observable<OverlayItem[]>>(() => items$.asObservable()),
            toggleOriginal: vi.fn<(regionId: string) => void>(),
        };
        preferencesService = {
            settings: createSettings(),
            settingsChanges: vi.fn<() => Observable<AppSettings>>(() => settings$.asObservable()),
        };
        sceneLanguageService = {
            changes: vi.fn<() => Observable<SceneLanguageState>>(() => scene$.asObservable()),
            startAutomatic: vi.fn<() => void>(),
            state: scene$.value,
        };
        sessionControllerService = {
            retryFailedTranslations: vi.fn(),
            changes: vi.fn<() => Observable<SessionState>>(() => state$.asObservable()),
            openAppSettings: vi.fn<() => Promise<void>>(() => Promise.resolve()),
            setManualSourceLanguage: vi.fn<(language: string) => void>(),
            setPreviewViewport: vi.fn<(viewport: ScreenRect | null) => Promise<void>>(() => Promise.resolve()),
            start: vi.fn<() => Promise<SessionStatus>>(() => Promise.resolve(SessionStatus.RUNNING)),
            state: createState(SessionStatus.IDLE),
            stop: vi.fn<() => Promise<void>>(() => Promise.resolve()),
            toggleFreeze: vi.fn<() => Promise<void>>(() => Promise.resolve()),
        };
        splashService = {
            whenFinished: vi.fn<() => Promise<void>>(() => Promise.resolve()),
        };

        await TestBed.configureTestingModule({
            imports: [NgTemplateOutlet, ReactiveFormsModule, RouterLink, TranslatePipe],
            declarations: [CameraComponent, LanguageNamePipe, SelectValueAccessorStubDirective],
            providers: [
                provideRouter([]),
                provideTranslateService(),
                { provide: APP_PLUGIN, useValue: appPlugin as unknown as AppPlugin },
                { provide: AppLanguageService, useValue: appLanguageService },
                { provide: LanguageConfirmationService, useValue: languageConfirmationService },
                { provide: LanguageModelService, useValue: languageModelService },
                { provide: LensEngineService, useValue: lensEngineService },
                { provide: LoggerService, useValue: loggerService },
                { provide: OverlayStoreService, useValue: overlayStoreService },
                { provide: PreferencesService, useValue: preferencesService },
                { provide: SceneLanguageService, useValue: sceneLanguageService },
                { provide: SessionControllerService, useValue: sessionControllerService },
                { provide: SplashService, useValue: splashService },
            ],
            schemas: [CUSTOM_ELEMENTS_SCHEMA],
        }).compileComponents();

        router = TestBed.inject(Router);
        navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
        fixture = TestBed.createComponent(CameraComponent);
        component = fixture.componentInstance;
        element = fixture.nativeElement as HTMLElement;
        fixture.detectChanges();
    });

    afterEach(() => {
        vi.useRealTimers();
        fixture.destroy();
        document.body.classList.remove(CAMERA_ACTIVE_CLASS);
        vi.restoreAllMocks();

        if (originalResizeObserver) {
            Object.defineProperty(view, RESIZE_OBSERVER_PROPERTY, originalResizeObserver);
        } else {
            Reflect.deleteProperty(view, RESIZE_OBSERVER_PROPERTY);
        }
    });

    it('should show a compact automatic-language label and preserve the full source name', async () => {
        await enter();
        settings$.next({ ...settings$.value, sourceLanguage: AUTO_LANGUAGE });
        const source = query('#camera-language-pair strong');
        expect(source?.textContent).toBe('languages.autoShort');
        expect(source?.getAttribute('title')).toBeTruthy();
        expect(query('#camera-language-pair')?.getAttribute('href')).toBe('/languages');
    });

    it('should offer translation recovery without resuming or restarting a frozen camera', async () => {
        await enter();
        emitState(SessionStatus.FROZEN);
        await emitItems([createItem({ status: OverlayStatus.ERROR, translatedText: '' })]);
        sessionControllerService.start.mockClear();
        query('#camera-retry-translations')?.click();
        expect(sessionControllerService.retryFailedTranslations).toHaveBeenCalledTimes(1);
        expect(sessionControllerService.start).not.toHaveBeenCalled();
        expect(sessionControllerService.toggleFreeze).not.toHaveBeenCalled();
        expect(component.frozen).toBe(true);
    });

    it('should not count text already in the target language as a new translation', async () => {
        await enter();
        emitState(SessionStatus.RUNNING);
        await emitItems([createItem({ status: OverlayStatus.TRANSLATED, sourceLanguage: component.targetLanguage })]);
        expect(component.translatedCount).toBe(0);
        expect(component.textAlreadyInTargetLanguage).toBe(true);
        expect(text('.lens-progress')).toContain('camera.alreadyInTarget');
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should activate the camera session on ionViewDidEnter', async () => {
        await enter();

        expect(sessionControllerService.changes).toHaveBeenCalledTimes(1);
        expect(lensEngineService.statuses).toHaveBeenCalledTimes(1);
        expect(lensEngineService.errors).toHaveBeenCalledTimes(1);
        expect(overlayStoreService.changes).toHaveBeenCalledTimes(1);
        expect(sceneLanguageService.changes).toHaveBeenCalledTimes(1);
        expect(languageModelService.changes).toHaveBeenCalledTimes(1);
        expect(preferencesService.settingsChanges).toHaveBeenCalledTimes(1);
        expect(appLanguageService.changes).toHaveBeenCalledTimes(1);
        expect(languageConfirmationService.confirmIfNeeded).toHaveBeenCalledTimes(1);
        expect(appPlugin.addListener).toHaveBeenCalledExactlyOnceWith('resume', expect.any(Function));
        expect(sessionControllerService.start).toHaveBeenCalledTimes(1);
    });

    it('should keep the web page opaque and make it transparent only over the native camera preview', async () => {
        await enter();

        expect(component.nativePlatform).toBe(false);
        expect(document.body.classList.contains(CAMERA_ACTIVE_CLASS)).toBe(false);
        expect(query('.lens-camera')?.classList.contains('lens-camera-native')).toBe(false);

        component.ionViewWillLeave();
        recreateOnNativePlatform();
        await enter();

        expect(component.nativePlatform).toBe(true);
        expect(document.body.classList.contains(CAMERA_ACTIVE_CLASS)).toBe(true);
        expect(query('.lens-camera')?.classList.contains('lens-camera-native')).toBe(true);

        component.ionViewWillLeave();

        expect(document.body.classList.contains(CAMERA_ACTIVE_CLASS)).toBe(false);
    });

    it('should give the preview host its id only while the camera screen is active so a cached page never receives the video', async () => {
        expect(document.getElementById(CAMERA_PREVIEW_HOST_ID)).toBeNull();
        expect(frame().firstElementChild?.hasAttribute('id')).toBe(false);

        component.ionViewDidEnter();

        expect(document.getElementById(CAMERA_PREVIEW_HOST_ID)).toBe(frame().firstElementChild);

        await flushPromises();
        component.ionViewWillLeave();

        expect(document.getElementById(CAMERA_PREVIEW_HOST_ID)).toBeNull();
    });

    it('should read what the camera engine can do before starting the camera', async () => {
        let resolveCapabilities: (capabilities: EngineCapabilities) => void = () => undefined;

        lensEngineService.getCapabilities.mockImplementationOnce(() => new Promise<EngineCapabilities>((resolve: (capabilities: EngineCapabilities) => void) => {
            resolveCapabilities = resolve;
        }));
        component.ionViewDidEnter();
        await flushPromises();

        expect(lensEngineService.getCapabilities).toHaveBeenCalledTimes(1);
        expect(languageConfirmationService.confirmIfNeeded).toHaveBeenCalledTimes(1);
        expect(sessionControllerService.start).not.toHaveBeenCalled();

        resolveCapabilities(createCapabilities({ openAppSettings: false, translation: false }));
        await flushPromises();

        expect(sessionControllerService.start).toHaveBeenCalledTimes(1);
        expect(component.canOpenAppSettings).toBe(false);
        expect(component.translationSupported).toBe(false);
    });

    it('should log capabilities that cannot be read and keep every camera action available', async () => {
        const failure: Error = new Error('not implemented');

        lensEngineService.getCapabilities.mockImplementationOnce(() => Promise.reject(failure));
        await enter();
        emitState(SessionStatus.PERMISSION_BLOCKED);

        expect(loggerService.error).toHaveBeenCalledWith('camera-capabilities-failed', failure);
        expect(sessionControllerService.start).toHaveBeenCalledTimes(1);
        expect(component.canOpenAppSettings).toBe(true);
        expect(component.translationSupported).toBe(true);
        expect(text('.lens-status-action')).toBe('camera.openAppSettings');
    });

    it('should wait for the language confirmation before measuring the frame and starting the camera', async () => {
        const confirmation: Deferred = createDeferred();
        const bounds: MockInstance<() => DOMRect> = mockFrameRect(FRAME_RECT);

        languageConfirmationService.confirmIfNeeded.mockImplementationOnce(() => confirmation.promise);
        component.ionViewDidEnter();
        await flushPromises();

        expect(state$.observed).toBe(true);
        expect(bounds).not.toHaveBeenCalled();
        expect(sessionControllerService.setPreviewViewport).not.toHaveBeenCalled();
        expect(sessionControllerService.start).not.toHaveBeenCalled();

        confirmation.resolve();
        await flushPromises();

        expect(sessionControllerService.setPreviewViewport).toHaveBeenCalledExactlyOnceWith(FRAME_RECT);
        expect(sessionControllerService.start).toHaveBeenCalledTimes(1);
        expect(callOrder(languageConfirmationService.confirmIfNeeded)).toBeLessThan(callOrder(sessionControllerService.setPreviewViewport));
        expect(callOrder(sessionControllerService.setPreviewViewport)).toBeLessThan(callOrder(sessionControllerService.start));
    });

    it('should wait for the opening animation before confirming the language, measuring the frame and starting the camera', async () => {
        const splash: Deferred = createDeferred();
        const bounds: MockInstance<() => DOMRect> = mockFrameRect(FRAME_RECT);

        splashService.whenFinished.mockImplementationOnce(() => splash.promise);
        component.ionViewDidEnter();
        await flushPromises();

        expect(splashService.whenFinished).toHaveBeenCalledTimes(1);
        expect(lensEngineService.getCapabilities).toHaveBeenCalledTimes(1);
        expect(languageConfirmationService.confirmIfNeeded).not.toHaveBeenCalled();
        expect(bounds).not.toHaveBeenCalled();
        expect(ResizeObserverFake.instances.length).toBe(0);
        expect(sessionControllerService.setPreviewViewport).not.toHaveBeenCalled();
        expect(sessionControllerService.start).not.toHaveBeenCalled();

        splash.resolve();
        await flushPromises();

        expect(languageConfirmationService.confirmIfNeeded).toHaveBeenCalledTimes(1);
        expect(bounds).toHaveBeenCalled();
        expect(sessionControllerService.setPreviewViewport).toHaveBeenCalledExactlyOnceWith(FRAME_RECT);
        expect(sessionControllerService.start).toHaveBeenCalledTimes(1);
        expect(callOrder(splashService.whenFinished)).toBeLessThan(callOrder(languageConfirmationService.confirmIfNeeded));
        expect(callOrder(languageConfirmationService.confirmIfNeeded)).toBeLessThan(callOrder(sessionControllerService.setPreviewViewport));
    });

    it('should not confirm the language or start the camera when it is left before the opening animation ends', async () => {
        const splash: Deferred = createDeferred();

        splashService.whenFinished.mockImplementationOnce(() => splash.promise);
        component.ionViewDidEnter();
        await flushPromises();
        component.ionViewWillLeave();
        splash.resolve();
        await flushPromises();

        expect(languageConfirmationService.confirmIfNeeded).not.toHaveBeenCalled();
        expect(sessionControllerService.start).not.toHaveBeenCalled();
        expect(sessionControllerService.setPreviewViewport).toHaveBeenCalledExactlyOnceWith(null);
        expect(ResizeObserverFake.instances.length).toBe(0);
    });

    it('should start the camera only once when it is entered again before the opening animation ends', async () => {
        const splash: Deferred = createDeferred();

        splashService.whenFinished.mockImplementation(() => splash.promise);
        component.ionViewDidEnter();
        await flushPromises();
        component.ionViewWillLeave();
        component.ionViewDidEnter();
        await flushPromises();

        expect(sessionControllerService.start).not.toHaveBeenCalled();

        splash.resolve();
        await flushPromises();

        expect(splashService.whenFinished).toHaveBeenCalledTimes(2);
        expect(languageConfirmationService.confirmIfNeeded).toHaveBeenCalledTimes(1);
        expect(sessionControllerService.start).toHaveBeenCalledTimes(1);
    });

    it('should use the language confirmed in the dialog for the camera that starts afterwards', async () => {
        const confirmation: Deferred = createDeferred();

        languageConfirmationService.confirmIfNeeded.mockImplementationOnce(() => confirmation.promise);
        component.ionViewDidEnter();
        language$.next('pt');
        settings$.next({ ...createSettings(), targetLanguage: 'pt' });
        confirmation.resolve();
        await flushPromises();

        expect(component.currentLanguage).toBe('pt');
        expect(component.targetLanguage).toBe('pt');
        expect(fixture.debugElement.query(By.css('app-overlay-layer')).properties['targetLanguage']).toBe('pt');
        expect(sessionControllerService.start).toHaveBeenCalledTimes(1);
    });

    it('should not start the camera when it is left while the language is being confirmed', async () => {
        const confirmation: Deferred = createDeferred();

        languageConfirmationService.confirmIfNeeded.mockImplementationOnce(() => confirmation.promise);
        component.ionViewDidEnter();
        await flushPromises();

        expect(languageConfirmationService.confirmIfNeeded).toHaveBeenCalledTimes(1);

        component.ionViewWillLeave();
        confirmation.resolve();
        await flushPromises();

        expect(sessionControllerService.start).not.toHaveBeenCalled();
        expect(sessionControllerService.setPreviewViewport).toHaveBeenCalledExactlyOnceWith(null);
        expect(ResizeObserverFake.instances.length).toBe(0);
    });

    it('should log a failed language confirmation and still start the camera', async () => {
        const failure: Error = new Error('dialog failed');

        languageConfirmationService.confirmIfNeeded.mockImplementationOnce(() => Promise.reject(failure));
        await enter();

        expect(loggerService.error).toHaveBeenCalledWith('camera-language-confirmation-failed', failure);
        expect(sessionControllerService.start).toHaveBeenCalledTimes(1);
    });

    it('should hand the measured 4:5 frame to the camera preview before starting it', async () => {
        const viewport: Deferred = createDeferred();

        mockFrameRect(FRAME_RECT);
        sessionControllerService.setPreviewViewport.mockImplementationOnce(() => viewport.promise);
        component.ionViewDidEnter();
        await flushPromises();

        expect(sessionControllerService.setPreviewViewport).toHaveBeenCalledExactlyOnceWith(FRAME_RECT);
        expect(sessionControllerService.start).not.toHaveBeenCalled();

        viewport.resolve();
        await flushPromises();

        expect(sessionControllerService.start).toHaveBeenCalledTimes(1);
    });

    it('should let the preview fill the web view when the frame has no size yet', async () => {
        await enter();

        expect(sessionControllerService.setPreviewViewport).toHaveBeenCalledExactlyOnceWith(null);
        expect(sessionControllerService.start).toHaveBeenCalledTimes(1);
    });

    it('should log a failed viewport update and still start the camera', async () => {
        const failure: Error = new Error('viewport failed');

        mockFrameRect(FRAME_RECT);
        sessionControllerService.setPreviewViewport.mockImplementationOnce(() => Promise.reject(failure));
        await enter();

        expect(loggerService.error).toHaveBeenCalledWith('camera-viewport-failed', failure);
        expect(sessionControllerService.start).toHaveBeenCalledTimes(1);
    });

    it('should observe the frame and its stage and update the viewport once per animation frame when they change', async () => {
        const bounds: MockInstance<() => DOMRect> = mockFrameRect(FRAME_RECT);
        const moved: ScreenRect = { height: 500, width: 400, x: 24, y: 64 };

        await enter();

        expect(resizeObserver().targets).toEqual([query('.lens-stage'), frame()]);

        bounds.mockReturnValue(createDomRect(moved));
        resizeObserver().notify();
        resizeObserver().notify();
        window.dispatchEvent(new Event('resize'));
        window.dispatchEvent(new Event('orientationchange'));

        expect(sessionControllerService.setPreviewViewport).toHaveBeenCalledTimes(1);

        await nextFrame();

        expect(sessionControllerService.setPreviewViewport).toHaveBeenCalledTimes(2);
        expect(sessionControllerService.setPreviewViewport).toHaveBeenLastCalledWith(moved);
        expect(sessionControllerService.start).toHaveBeenCalledTimes(1);
    });

    it('should update the viewport when the window is resized or rotated', async () => {
        const bounds: MockInstance<() => DOMRect> = mockFrameRect(FRAME_RECT);
        const rotated: ScreenRect = { height: 260, width: 208, x: 200, y: 64 };
        const resized: ScreenRect = { height: 300, width: 240, x: 180, y: 64 };

        await enter();
        bounds.mockReturnValue(createDomRect(rotated));
        window.dispatchEvent(new Event('orientationchange'));
        await nextFrame();
        bounds.mockReturnValue(createDomRect(resized));
        window.dispatchEvent(new Event('resize'));
        await nextFrame();

        expect(sessionControllerService.setPreviewViewport.mock.calls.map((call: [viewport: ScreenRect | null]) => call[0])).toEqual([FRAME_RECT, rotated, resized]);
    });

    it('should not send the viewport again when the frame has not really moved or has no size', async () => {
        const bounds: MockInstance<() => DOMRect> = mockFrameRect(FRAME_RECT);

        await enter();
        bounds.mockReturnValue(createDomRect({ ...FRAME_RECT, width: FRAME_RECT.width + 0.2, x: FRAME_RECT.x - 0.3 }));
        resizeObserver().notify();
        await nextFrame();
        bounds.mockReturnValue(createDomRect({ height: 0, width: 0, x: 0, y: 0 }));
        resizeObserver().notify();
        await nextFrame();

        expect(sessionControllerService.setPreviewViewport).toHaveBeenCalledExactlyOnceWith(FRAME_RECT);
    });

    it('should keep following the window size when ResizeObserver is not available', async () => {
        const bounds: MockInstance<() => DOMRect> = mockFrameRect(FRAME_RECT);
        const resized: ScreenRect = { height: 300, width: 240, x: 180, y: 64 };

        Reflect.deleteProperty(view, RESIZE_OBSERVER_PROPERTY);
        await enter();
        bounds.mockReturnValue(createDomRect(resized));
        window.dispatchEvent(new Event('resize'));
        await nextFrame();

        expect(ResizeObserverFake.instances.length).toBe(0);
        expect(sessionControllerService.setPreviewViewport).toHaveBeenLastCalledWith(resized);
    });

    it('should stop the session, release the viewport, stop observing the frame and remove the body class on ionViewWillLeave', async () => {
        const bounds: MockInstance<() => DOMRect> = mockFrameRect(FRAME_RECT);

        await enter();

        const observer: ResizeObserverFake = resizeObserver();

        bounds.mockReturnValue(createDomRect({ ...FRAME_RECT, x: 40 }));
        window.dispatchEvent(new Event('resize'));
        component.ionViewWillLeave();
        await nextFrame();
        window.dispatchEvent(new Event('resize'));
        observer.notify();
        await nextFrame();

        expect(sessionControllerService.stop).toHaveBeenCalledTimes(1);
        expect(sessionControllerService.setPreviewViewport.mock.calls.map((call: [viewport: ScreenRect | null]) => call[0])).toEqual([FRAME_RECT, null]);
        expect(callOrder(sessionControllerService.stop)).toBeLessThan(sessionControllerService.setPreviewViewport.mock.invocationCallOrder[1]);
        expect(observer.disconnected).toBe(true);
        expect(document.body.classList.contains(CAMERA_ACTIVE_CLASS)).toBe(false);
        expect(state$.observed).toBe(false);
        expect(items$.observed).toBe(false);
        expect(settings$.observed).toBe(false);
        expect(language$.observed).toBe(false);
        expect(statuses$.observed).toBe(false);
        expect(scene$.observed).toBe(false);
        expect(inventory$.observed).toBe(false);

        component.ngOnDestroy();

        expect(sessionControllerService.stop).toHaveBeenCalledTimes(1);
        expect(sessionControllerService.setPreviewViewport).toHaveBeenCalledTimes(2);
    });

    it('should measure the frame again when the camera is entered again', async () => {
        const bounds: MockInstance<() => DOMRect> = mockFrameRect(FRAME_RECT);
        const resized: ScreenRect = { height: 300, width: 240, x: 180, y: 64 };

        await enter();
        component.ionViewWillLeave();
        bounds.mockReturnValue(createDomRect(resized));
        await enter();

        expect(sessionControllerService.setPreviewViewport.mock.calls.map((call: [viewport: ScreenRect | null]) => call[0])).toEqual([FRAME_RECT, null, resized]);
        expect(languageConfirmationService.confirmIfNeeded).toHaveBeenCalledTimes(2);
        expect(sessionControllerService.start).toHaveBeenCalledTimes(2);
        expect(ResizeObserverFake.instances.length).toBe(2);
    });

    it('should stop an active session on destroy', async () => {
        await enter();
        fixture.destroy();

        expect(sessionControllerService.stop).toHaveBeenCalledTimes(1);
        expect(sessionControllerService.setPreviewViewport).toHaveBeenLastCalledWith(null);
        expect(document.body.classList.contains(CAMERA_ACTIVE_CLASS)).toBe(false);
    });

    it('should stop listening for the app resuming when the camera is left', async () => {
        await enter();
        component.ionViewWillLeave();
        await flushPromises();

        expect(resumeListenerHandle.remove).toHaveBeenCalledTimes(1);

        component.ngOnDestroy();
        await flushPromises();

        expect(resumeListenerHandle.remove).toHaveBeenCalledTimes(1);
    });

    it('should keep the camera running on resume while the device language is still the confirmed one', async () => {
        await enter();
        emitState(SessionStatus.RUNNING);
        await resumeApp();

        expect(appLanguageService.refreshDeviceLanguage).toHaveBeenCalledTimes(1);
        expect(sessionControllerService.stop).not.toHaveBeenCalled();
        expect(languageConfirmationService.confirmIfNeeded).toHaveBeenCalledTimes(1);
        expect(sessionControllerService.start).toHaveBeenCalledTimes(1);
    });

    it('should stop the camera, confirm the new device language and start the camera again with it on resume', async () => {
        const confirmation: Deferred = createDeferred();

        mockFrameRect(FRAME_RECT);
        await enter();
        emitState(SessionStatus.RUNNING);

        const firstObserver: ResizeObserverFake = resizeObserver();

        languageConfirmationService.needsConfirmation = true;
        languageConfirmationService.confirmIfNeeded.mockImplementationOnce(() => confirmation.promise);
        await resumeApp();

        expect(sessionControllerService.stop).toHaveBeenCalledTimes(1);
        expect(languageConfirmationService.confirmIfNeeded).toHaveBeenCalledTimes(2);
        expect(callOrder(sessionControllerService.stop)).toBeLessThan(languageConfirmationService.confirmIfNeeded.mock.invocationCallOrder[1]);
        expect(sessionControllerService.start).toHaveBeenCalledTimes(1);

        language$.next('pt');
        settings$.next({ ...createSettings(), targetLanguage: 'pt' });
        languageConfirmationService.needsConfirmation = false;
        confirmation.resolve();
        await flushPromises();

        expect(sessionControllerService.start).toHaveBeenCalledTimes(2);
        expect(languageConfirmationService.confirmIfNeeded.mock.invocationCallOrder[1]).toBeLessThan(sessionControllerService.start.mock.invocationCallOrder[1]);
        expect(sessionControllerService.setPreviewViewport.mock.calls.map((call: [viewport: ScreenRect | null]) => call[0])).toEqual([FRAME_RECT, FRAME_RECT]);
        expect(component.targetLanguage).toBe('pt');
        expect(fixture.debugElement.query(By.css('app-overlay-layer')).properties['targetLanguage']).toBe('pt');
        expect(firstObserver.disconnected).toBe(true);
        expect(ResizeObserverFake.instances.length).toBe(2);
        expect(appPlugin.addListener).toHaveBeenCalledTimes(1);
    });

    it('should not restart the camera when it is left while the device language is read on resume', async () => {
        let finishReading: (language: string) => void = () => undefined;

        await enter();
        languageConfirmationService.needsConfirmation = true;
        appLanguageService.refreshDeviceLanguage.mockImplementationOnce(() => new Promise<string>((resolve: (language: string) => void) => {
            finishReading = resolve;
        }));
        resumeListener?.();
        component.ionViewWillLeave();
        finishReading('pt-BR');
        await flushPromises();

        expect(sessionControllerService.stop).toHaveBeenCalledTimes(1);
        expect(languageConfirmationService.confirmIfNeeded).toHaveBeenCalledTimes(1);
        expect(sessionControllerService.start).toHaveBeenCalledTimes(1);
    });

    it('should log a failed language check on resume and keep the camera running', async () => {
        const failure: Error = new Error('device unavailable');

        await enter();
        appLanguageService.refreshDeviceLanguage.mockImplementationOnce(() => Promise.reject(failure));
        await resumeApp();

        expect(loggerService.error).toHaveBeenCalledWith('camera-language-recheck-failed', failure);
        expect(sessionControllerService.stop).not.toHaveBeenCalled();
        expect(sessionControllerService.start).toHaveBeenCalledTimes(1);
    });

    it('should log when the resume listener cannot be registered and still start the camera', async () => {
        const failure: Error = new Error('no app plugin');

        appPlugin.addListener.mockImplementationOnce(() => Promise.reject(failure));
        await enter();

        expect(loggerService.error).toHaveBeenCalledExactlyOnceWith('camera-resume-listener-failed', failure);
        expect(sessionControllerService.start).toHaveBeenCalledTimes(1);

        component.ionViewWillLeave();
        await flushPromises();

        expect(resumeListenerHandle.remove).not.toHaveBeenCalled();
        expect(loggerService.error).toHaveBeenCalledTimes(1);
    });

    it('should render the brand header with a round glass settings button that opens the settings', async () => {
        const layout: DebugElement = fixture.debugElement.query(By.css('app-layout'));
        const settingsButton: HTMLElement | null = query('#camera-settings-button');

        expect(layout.properties['showBrand']).toBe(true);
        expect(layout.properties['showFooter']).toBe(true);
        expect(layout.properties['transparent']).toBe(true);
        expect(settingsButton?.hasAttribute('layoutActions')).toBe(true);
        expect(settingsButton?.classList.contains('lens-icon-button')).toBe(true);
        expect(settingsButton?.classList.contains('lens-glass-button')).toBe(true);
        expect(settingsButton?.getAttribute('shape')).toBe('round');
        expect(settingsButton?.querySelector('ion-icon')?.getAttribute('name')).toBe('settings-outline');
        expect(settingsButton?.querySelector('ion-icon')?.getAttribute('aria-hidden')).toBe('true');
        expect(await ariaLabelOf('#camera-settings-button')).toBe('camera.openSettings');

        settingsButton?.click();

        expect(navigateByUrl).toHaveBeenCalledExactlyOnceWith('/settings');
    });

    it('should always show an editable language card outside the camera frame', async () => {
        await enter();
        emitState(SessionStatus.RUNNING);
        emitScene(SceneLanguageStatus.IDENTIFIED, 'es');
        const card = query('#camera-language-pair');
        expect(frame().contains(card)).toBe(false);
        expect(query('.lens-controls')?.firstElementChild).toBe(card);
        expect(card?.getAttribute('href')).toBe('/languages');
        expect(statusLine()?.getAttribute('aria-live')).toBe('polite');
        expect(statusLine()?.childElementCount).toBe(0);
    });

    it('should open language editing from the fixed language card', async () => {
        await enter();
        settings$.next({ ...createSettings(), sourceLanguage: 'en', targetLanguage: 'pt' });
        emitInventory(['en', 'pt']);
        emitState(SessionStatus.RUNNING);
        emitScene(SceneLanguageStatus.FIXED, 'en', 1);
        expect(statusLineText()).toBe('English Portuguese');
        languageStatus()?.click();
        expect(navigateByUrl.mock.calls[0][0].toString()).toBe('/languages');
    });

    it('should show complete language names in the card in the interface language', async () => {
        await enter();
        settings$.next({ ...createSettings(), sourceLanguage: 'ht', targetLanguage: 'pt' });
        emitInventory(['ht', 'pt']);
        emitState(SessionStatus.RUNNING);
        emitScene(SceneLanguageStatus.FIXED, 'ht', 1);
        expect(statusLineText()).toBe('Haitian Creole Portuguese');
        language$.next('de');
        expect(statusLineText()).toBe('Haiti-Kreolisch Portugiesisch');
        expect(query('#camera-language-pair')?.querySelectorAll('strong').length).toBe(2);
    });

    it('should make the detected source editable through the language card', async () => {
        await enter();
        emitState(SessionStatus.RUNNING);
        emitInventory(['it', 'en']);
        emitScene(SceneLanguageStatus.IDENTIFIED, 'it', 0.8);
        expect(statusLineText()).toBe('Italian English');
        languageStatus()?.click();
        expect(navigateByUrl.mock.calls[0][0].toString()).toBe('/languages');
    });

    it('should go back from a chosen scene language to the automatic identification without leaving the camera', async () => {
        await enter();
        settings$.next({ ...createSettings(), sourceLanguage: AUTO_LANGUAGE, targetLanguage: 'pt' });
        emitInventory(['en', 'fr', 'pt']);
        emitState(SessionStatus.RUNNING);
        await emitItems([createItem({ sourceLanguage: 'fr' })]);
        emitScene(SceneLanguageStatus.MANUAL, 'fr', 1);

        const sourcePicker: SourcePickerElement | null = picker();

        if (sourcePicker) {
            sourcePicker.open = vi.fn<() => Promise<boolean>>(() => Promise.resolve(true));
        }

        component.openSourceLanguagePicker(sourcePicker as unknown as IonSelect);
        await flushPromises();

        expect(sourcePicker?.open).toHaveBeenCalledTimes(1);
        expect(pickerAccessor().value).toBe('fr');

        pickerAccessor().choose(AUTO_LANGUAGE);

        expect(sceneLanguageService.startAutomatic).toHaveBeenCalledTimes(1);
        expect(sessionControllerService.setManualSourceLanguage).not.toHaveBeenCalled();
        expect(announcement()).toBe('camera.identifyingLanguage');
        expect(component.sourceLanguageControl.value).toBeNull();

        emitScene(SceneLanguageStatus.IDENTIFYING);

        expect(query(LANGUAGE_STATUS_SELECTOR)).toBeNull();
        expect(statusLineText()).toBe('camera.identifyingLanguage');
        expectWrappingStatusLine();
    });

    it('should never restart the automatic identification while the source language is fixed or the session is idle', async () => {
        await enter();
        emitState(SessionStatus.RUNNING);
        emitScene(SceneLanguageStatus.FIXED, 'es', 1);
        pickerAccessor().choose(AUTO_LANGUAGE);

        emitScene(SceneLanguageStatus.IDLE);
        pickerAccessor().choose(AUTO_LANGUAGE);

        expect(sceneLanguageService.startAutomatic).not.toHaveBeenCalled();
        expect(sessionControllerService.setManualSourceLanguage).not.toHaveBeenCalled();
    });

    it('should show the language chosen for the scene or fixed in the settings in the same line while the camera is live or frozen', async () => {
        await enter();
        emitState(SessionStatus.RUNNING);
        emitScene(SceneLanguageStatus.MANUAL, 'es', 1);

        expect(statusLineText()).toBe('Spanish English');

        emitScene(SceneLanguageStatus.FIXED, 'es', 1);

        expect(statusLineText()).toBe('Spanish English');

        emitState(SessionStatus.FROZEN);

        expect(languageStatus()).not.toBeNull();

        emitState(SessionStatus.PERMISSION_DENIED);

        expect(languageStatus()).toBeNull();
        expect(statusLineText()).toBe(EMPTY);
    });

    it('should name the languages of the status line in the app language', async () => {
        await enter();
        emitState(SessionStatus.RUNNING);
        emitScene(SceneLanguageStatus.IDENTIFIED, 'es');
        language$.next('pt');

        expect(statusLineText()).toBe('Espanhol Inglês');
    });

    it('should tell that the language is being identified only while there is text to identify', async () => {
        await enter();
        emitState(SessionStatus.RUNNING);
        emitScene(SceneLanguageStatus.IDENTIFYING);

        expect(statusLineText()).toBe(EMPTY);

        await emitItems([createItem({ sourceLanguage: null, status: OverlayStatus.DETECTING, translatedText: EMPTY })]);

        expect(statusLineText()).toBe('camera.identifyingLanguage');
        expect(languageStatus()).toBeNull();
        expect(statusLine()?.querySelector('ion-spinner')).toBeNull();

        await emitItems([createItem({ status: OverlayStatus.EXPIRING })]);

        expect(statusLineText()).toBe(EMPTY);
    });

    it('should leave the status line empty while the scene language is idle or unknown', async () => {
        await enter();
        emitState(SessionStatus.RUNNING);
        await emitItems([createItem()]);

        expect(statusLineText()).toBe(EMPTY);

        emitScene(SceneLanguageStatus.IDENTIFIED, UNDETERMINED_LANGUAGE);

        expect(statusLineText()).toBe(EMPTY);

        emitScene(SceneLanguageStatus.IDENTIFIED, null);

        expect(statusLineText()).toBe(EMPTY);
        expect(component.sceneLanguage).toBeNull();
    });

    it('should offer to choose the language in the status line when it could not be identified', async () => {
        await useTranslations({ chooseLanguageAction: 'Choose', languageUndetermined: 'Language not identified', sourceLanguageSelected: '{{language}} selected' });
        await enter();
        emitInventory(['en', 'es', 'fr']);
        emitState(SessionStatus.RUNNING);
        await emitItems([createItem({ sourceLanguage: null, status: OverlayStatus.UNDETERMINED, translatedText: EMPTY })]);
        emitScene(SceneLanguageStatus.UNDETERMINED, null, 0.2);

        const button: IonicElement | null = languageStatus();
        const sourcePicker: SourcePickerElement | null = picker();

        if (sourcePicker) {
            sourcePicker.open = vi.fn<() => Promise<boolean>>(() => Promise.resolve(true));
        }

        expect(statusLineText()).toBe('Language not identified · Choose');
        expect(button?.getAttribute('aria-haspopup')).toBe('dialog');
        expect(button?.querySelector('span[aria-hidden="true"]')?.textContent?.trim()).toBe('·');
        expect(button?.querySelector('span[aria-hidden="true"]')?.previousSibling?.textContent).toBe(' ');
        expect(button?.querySelector('.lens-status-action-text')?.textContent?.trim()).toBe('Choose');
        expectWrappingStatusLine();
        expect(element.querySelectorAll(`${STATUS_LINE_SELECTOR} ion-button`).length).toBe(1);
        expect(frame().contains(sourcePicker)).toBe(true);

        button?.click();

        expect(sourcePicker?.open).toHaveBeenCalledTimes(1);
        expect(pickerAccessor().value).toBeNull();

        pickerAccessor().choose(null);

        expect(sessionControllerService.setManualSourceLanguage).not.toHaveBeenCalled();

        pickerAccessor().choose('fr');

        expect(sessionControllerService.setManualSourceLanguage).toHaveBeenCalledExactlyOnceWith('fr');
        expect(component.sourceLanguageControl.value).toBeNull();
        expect(pickerAccessor().value).toBeNull();
        expect(appLanguageService.instant).toHaveBeenCalledWith('camera.sourceLanguageSelected', { language: 'French' });
        expect(announcement()).toBe('camera.sourceLanguageSelected');

        emitScene(SceneLanguageStatus.MANUAL, 'fr', 1);

        expect(statusLineText()).toBe('French English');
    });

    it('should offer to download the pack of the identified scene language in place with its progress', async () => {
        const download: Deferred = createDeferred();
        const showErrorMessage: MockInstance<(message: string) => void> = vi.spyOn(SwalUtils, 'showErrorMessage').mockImplementation(() => undefined);

        await useTranslations({ downloadDetected: 'Download', languageDetected: '{{language}} detected' });
        languageModelService.download.mockImplementation(() => download.promise);
        await enter();
        emitState(SessionStatus.RUNNING);
        emitScene(SceneLanguageStatus.IDENTIFIED, 'fr');

        const button: IonicElement | null = languageStatus();

        expect(statusLineText()).toBe('French detected · Download');
        expect(button?.querySelector('.lens-status-action-text')?.textContent?.trim()).toBe('Download');
        expect(button?.hasAttribute('aria-disabled')).toBe(false);
        expect(button?.querySelector('ion-spinner')).toBeNull();
        expectWrappingStatusLine();

        button?.click();

        expect(languageModelService.download).toHaveBeenCalledExactlyOnceWith('fr', false);
        expect(component.downloadingSceneLanguage).toBe(true);
        expect(languageStatus()).toBe(button);
        expect(button?.getAttribute('aria-disabled')).toBe('true');
        expect(button?.hasAttribute('disabled')).toBe(false);
        expect(button?.querySelector('ion-spinner')?.getAttribute('aria-hidden')).toBe('true');
        expect(statusLineText()).toBe('languages.downloading');
        expect(announcement()).toBe('languages.downloading');
        expect(query(`${STATUS_LINE_SELECTOR} .lens-status-note`)).toBeNull();
        expectWrappingStatusLine();

        button?.click();
        component.downloadSceneLanguage();

        expect(languageModelService.download).toHaveBeenCalledTimes(1);

        download.resolve();
        await flushPromises();
        emitInventory(['en', 'es', 'fr']);

        expect(component.downloadingSceneLanguage).toBe(false);
        expect(appLanguageService.instant).toHaveBeenCalledWith('camera.downloadDetectedSuccess', { languages: 'French' });
        expect(announcement()).toBe('camera.downloadDetectedSuccess');
        expect(statusLineText()).toBe('French English');
        expect(showErrorMessage).not.toHaveBeenCalled();
        expect(loggerService.warn).not.toHaveBeenCalled();
        expect(sessionControllerService.start).toHaveBeenCalledTimes(1);
    });

    it('should show that the scene language download waits for Wi-Fi or for a connection', async () => {
        const download: Deferred = createDeferred();

        preferencesService.settings = { ...createSettings(), requireWifiForDownloads: true };
        languageModelService.download.mockImplementation(() => download.promise);
        await enter();
        emitState(SessionStatus.RUNNING);
        emitScene(SceneLanguageStatus.IDENTIFIED, 'de');
        component.downloadSceneLanguage();

        expect(languageModelService.download).toHaveBeenCalledExactlyOnceWith('de', true);
        expect(component.wifiOnlyDownload).toBe(true);
        expect(text(`${STATUS_LINE_SELECTOR} .lens-status-note`)).toBe('languages.wifiOnlyNote');
        expect(announcement()).toBe('languages.downloading languages.wifiOnlyNote');
        expectWrappingStatusLine();

        window.dispatchEvent(new Event('offline'));

        expect(component.downloadStatusKey).toBe('languages.waitingForConnection');
        expect(text(LANGUAGE_STATUS_SELECTOR)).toBe('languages.waitingForConnection');
        expect(announcement()).toBe('languages.waitingForConnection languages.wifiOnlyNote');

        window.dispatchEvent(new Event('online'));
        download.resolve();
        await flushPromises();

        expect(component.wifiOnlyDownload).toBe(false);
        expect(query(`${STATUS_LINE_SELECTOR} .lens-status-note`)).toBeNull();
    });

    it('should show the progress of a scene language pack that is already being downloaded', async () => {
        await enter();
        emitState(SessionStatus.RUNNING);
        emitScene(SceneLanguageStatus.IDENTIFIED, 'it');
        emitInventory(['en', 'es'], ['it']);

        expect(component.downloadingSceneLanguage).toBe(true);
        expect(languageStatus()?.getAttribute('aria-disabled')).toBe('true');
        expect(statusLineText()).toBe('languages.downloading');

        component.downloadSceneLanguage();

        expect(languageModelService.download).not.toHaveBeenCalled();
    });

    it('should report a scene language pack that could not be downloaded and let the user try again', async () => {
        const showErrorMessage: MockInstance<(message: string) => void> = vi.spyOn(SwalUtils, 'showErrorMessage').mockImplementation(() => undefined);

        languageModelService.download.mockImplementation(() => Promise.reject(new Error('no connection')));
        await enter();
        emitState(SessionStatus.RUNNING);
        emitScene(SceneLanguageStatus.IDENTIFIED, 'fr');
        languageStatus()?.click();
        await flushPromises();

        expect(appLanguageService.instant).toHaveBeenCalledWith('camera.downloadDetectedError', { languages: 'French' });
        expect(showErrorMessage).toHaveBeenCalledExactlyOnceWith('camera.downloadDetectedError');
        expect(loggerService.warn).toHaveBeenCalledWith('camera-detected-download-failed', { failed: 1, requested: 1 });
        expect(component.downloadingSceneLanguage).toBe(false);
        expect(languageStatus()?.hasAttribute('aria-disabled')).toBe(false);
        expect(statusLineText()).toBe('camera.languageDetected · camera.downloadDetected');

        languageStatus()?.click();
        await flushPromises();

        expect(languageModelService.download).toHaveBeenCalledTimes(2);
        expect(sessionControllerService.start).toHaveBeenCalledTimes(1);
    });

    it('should ask to tap again or name a pack the browser cannot translate when the scene language download fails', async () => {
        const showErrorMessage: MockInstance<(message: string) => void> = vi.spyOn(SwalUtils, 'showErrorMessage').mockImplementation(() => undefined);
        const showWarningMessage: MockInstance<(message: string) => void> = vi.spyOn(SwalUtils, 'showWarningMessage').mockImplementation(() => undefined);

        languageModelService.download
            .mockImplementationOnce(() => Promise.reject(createCodedError('USER_ACTIVATION_REQUIRED')))
            .mockImplementationOnce(() => Promise.reject(createCodedError('TRANSLATION_UNSUPPORTED')));
        await enter();
        emitState(SessionStatus.RUNNING);
        emitScene(SceneLanguageStatus.IDENTIFIED, 'eo');
        component.downloadSceneLanguage();
        await flushPromises();

        expect(appLanguageService.instant).toHaveBeenCalledWith('camera.downloadActivationRequired', { languages: 'Esperanto' });
        expect(showWarningMessage).toHaveBeenCalledExactlyOnceWith('camera.downloadActivationRequired');
        expect(showErrorMessage).not.toHaveBeenCalled();

        component.downloadSceneLanguage();
        await flushPromises();

        expect(appLanguageService.instant).toHaveBeenCalledWith('camera.downloadUnsupportedError', { languages: 'Esperanto' });
        expect(showErrorMessage).toHaveBeenCalledExactlyOnceWith('camera.downloadUnsupportedError');
        expect(instantCalls('camera.downloadDetectedError')).toBe(0);
    });

    it('should not open a dialog over another page when the scene language download fails after leaving the camera', async () => {
        const download: Deferred = createDeferred();
        const showErrorMessage: MockInstance<(message: string) => void> = vi.spyOn(SwalUtils, 'showErrorMessage').mockImplementation(() => undefined);

        languageModelService.download.mockImplementation(() => download.promise);
        await enter();
        emitState(SessionStatus.RUNNING);
        emitScene(SceneLanguageStatus.IDENTIFIED, 'de');
        component.downloadSceneLanguage();
        component.ionViewWillLeave();
        download.reject(new Error('no connection'));
        await flushPromises();

        expect(loggerService.warn).toHaveBeenCalledWith('camera-detected-download-failed', { failed: 1, requested: 1 });
        expect(showErrorMessage).not.toHaveBeenCalled();
        expect(component.downloadingSceneLanguage).toBe(false);
    });

    it('should never offer a download for the target language, a downloaded pack or an unknown language', async () => {
        await enter();
        emitState(SessionStatus.RUNNING);
        emitScene(SceneLanguageStatus.IDENTIFIED, 'en');

        expect(component.statusLine).toBe(component.statusLineKind.LANGUAGE_PAIR);

        emitScene(SceneLanguageStatus.IDENTIFIED, 'es');

        expect(component.statusLine).toBe(component.statusLineKind.LANGUAGE_PAIR);

        emitScene(SceneLanguageStatus.IDENTIFYING);
        component.downloadSceneLanguage();

        expect(languageModelService.download).not.toHaveBeenCalled();
        expect(component.downloadingSceneLanguage).toBe(false);
    });

    it('should explain in one centered card that the browser cannot translate while the camera is live and never offer downloads', async () => {
        lensEngineService.getCapabilities.mockResolvedValue(createCapabilities({ translation: false }));
        await enter();
        emitState(SessionStatus.RUNNING);
        await emitItems([createItem()]);
        emitScene(SceneLanguageStatus.IDENTIFIED, 'fr');

        expect(element.querySelectorAll('#camera-status-area .lens-panel').length).toBe(1);
        expect(text(STATUS_TITLE_SELECTOR)).toBe('camera.translationUnsupportedTitle');
        expect(text(STATUS_MESSAGE_SELECTOR)).toBe('camera.translationUnsupportedMessage');
        expect(statusLineText()).toBe(EMPTY);

        component.downloadSceneLanguage();

        expect(languageModelService.download).not.toHaveBeenCalled();

        emitState(SessionStatus.FROZEN);

        expect(text(STATUS_TITLE_SELECTOR)).toBe('camera.translationUnsupportedTitle');

        emitState(SessionStatus.PAUSED);

        expect(text(STATUS_TITLE_SELECTOR)).toBe(EMPTY);
        expect(text('#camera-status-area')).toBe('camera.paused');
    });

    it('should show only one status line at a time, preferring the text recognition notices over the language', async () => {
        await enter();
        emitState(SessionStatus.RUNNING);
        await emitItems([createItem()]);
        emitScene(SceneLanguageStatus.UNDETERMINED);
        emitStatus(EngineStatusCode.RECOGNITION_LOADING);

        expect(statusLine()?.childElementCount).toBe(1);
        expect(statusLineText()).toBe('camera.preparingRecognition');

        emitStatus(EngineStatusCode.RECOGNITION_READY);

        expect(statusLine()?.childElementCount).toBe(1);
        expect(statusLineText()).toBe('camera.languageUndetermined · camera.chooseLanguageAction');
        expect(element.querySelectorAll('.lens-chip, .lens-banner-body').length).toBe(0);
        expect(element.querySelectorAll('#camera-status-area .lens-panel').length).toBe(0);
    });

    it('should show the app version and a terms of use link in the footer', async () => {
        await useTranslations({ termsOfUse: 'Terms of use', version: 'v{{version}}' });
        fixture.detectChanges();

        const footer: HTMLElement | null = query('.lens-footer[layoutFooter]');
        const termsLink: HTMLElement | null = footer?.querySelector<HTMLElement>('ion-button') ?? null;

        expect(footer?.querySelector(':scope > p')?.textContent?.trim()).toBe(`v${environment.appVersion}`);
        expect(termsLink?.textContent?.trim()).toBe('Terms of use');
        expect(termsLink?.getAttribute('fill')).toBe('clear');
        expect(termsLink?.querySelector('span')?.classList.contains('text-decoration-underline')).toBe(true);
        expect(query('.lens-camera')?.contains(footer)).toBe(false);
    });

    it('should render the terms of use as a link that opens the terms page in the app', async () => {
        const termsLink: IonicElement | null = element.querySelector<IonicElement>('.lens-footer ion-button');
        const click: MouseEvent = new MouseEvent('click', { bubbles: true, cancelable: true });

        await termsLink?.componentOnReady?.();

        expect(termsLink?.getAttribute('href')).toBe('/terms');
        expect(termsLink?.shadowRoot?.querySelector('a')?.getAttribute('href')).toBe('/terms');
        expect(termsLink?.shadowRoot?.querySelector('button')).toBeNull();
        expect(termsLink?.getAttribute('routerDirection')).toBe('forward');
        expect(termsLink?.hasAttribute('tabindex')).toBe(false);

        termsLink?.dispatchEvent(click);

        expect(click.defaultPrevented).toBe(true);
        expect(navigateByUrl).toHaveBeenCalledTimes(1);
        expect(navigateByUrl.mock.calls[0][0].toString()).toBe('/terms');
    });

    it('should not nest another main landmark inside the main content of the layout', () => {
        expect(query('main')).toBeNull();
        expect(query('.lens-camera')?.tagName).toBe('SECTION');
    });

    it('should let the panels that block the camera use the whole stage while live, starting and black image notices keep the 4:5 frame', async () => {
        const blockingStatuses: SessionStatus[] = [
            SessionStatus.CAMERA_BLOCKED
        ,   SessionStatus.ERROR
        ,   SessionStatus.MODEL_MISSING
        ,   SessionStatus.PERMISSION_BLOCKED
        ,   SessionStatus.PERMISSION_DENIED
        ];
        const framedStatuses: SessionStatus[] = [SessionStatus.FROZEN, SessionStatus.IDLE, SessionStatus.PAUSED, SessionStatus.RUNNING, SessionStatus.STARTING];

        await enter();

        blockingStatuses.forEach((status: SessionStatus) => {
            emitState(status, status === SessionStatus.MODEL_MISSING ? ['fr'] : []);

            expect(frame().classList.contains('lens-frame-blocking')).toBe(true);
        });

        framedStatuses.forEach((status: SessionStatus) => {
            emitState(status);

            expect(frame().classList.contains('lens-frame-blocking')).toBe(false);
        });

        emitState(SessionStatus.RUNNING);
        emitStatus(EngineStatusCode.CAMERA_BLACK_FRAMES);

        expect(query('#camera-black-frames-notice')).not.toBeNull();
        expect(frame().classList.contains('lens-frame-blocking')).toBe(false);
        expect(componentStyles()).toMatch(/\.lens-frame-blocking\[[^\]]+\]\{aspect-ratio:auto;height:calc\(100cqh-1\.5rem\);width:calc\(100cqw-1\.5rem\);?\}/);
    });

    it('should keep the overlay and the status panels inside the camera frame and the status line below it', async () => {
        await enter();
        emitState(SessionStatus.RUNNING);

        const cameraFrame: HTMLElement = frame();

        expect(query('.lens-stage')?.contains(cameraFrame)).toBe(true);
        expect(cameraFrame.classList.contains('position-relative')).toBe(true);
        expect(cameraFrame.classList.contains('overflow-hidden')).toBe(true);
        expect(cameraFrame.contains(query('app-overlay-layer'))).toBe(true);
        expect(cameraFrame.contains(query('#camera-status-area'))).toBe(true);
        expect(cameraFrame.contains(query(FROZEN_NOTICE_SELECTOR))).toBe(true);
        expect(cameraFrame.contains(query(ANNOUNCEMENT_SELECTOR))).toBe(true);
        expect(cameraFrame.contains(statusLine())).toBe(false);
        expect(query('#camera-detection-area')).toBeNull();
        expect(query('#camera-top-area')).toBeNull();
    });

    it('should host the camera preview as the first layer of the frame, under the overlay and the panels, without catching taps', async () => {
        await enter();
        emitState(SessionStatus.PERMISSION_DENIED);

        const previewHost: HTMLElement | null = document.getElementById(CAMERA_PREVIEW_HOST_ID);
        const hostClasses: string[] = ['position-absolute', 'top-0', 'start-0', 'w-100', 'h-100', 'overflow-hidden', 'pe-none', 'z-0'];
        const layers: (HTMLElement | null)[] = [query('app-overlay-layer'), query('.lens-panel'), query(ANNOUNCEMENT_SELECTOR), query(FROZEN_NOTICE_SELECTOR)];

        expect(CAMERA_PREVIEW_HOST_ID).toBe('lens-camera-preview');
        expect(component.previewHostId).toBe(CAMERA_PREVIEW_HOST_ID);
        expect(previewHost).not.toBeNull();
        expect(frame().firstElementChild).toBe(previewHost);
        expect(previewHost?.tagName).toBe('SECTION');
        expect(previewHost?.getAttribute('aria-hidden')).toBe('true');
        expect(previewHost?.childElementCount).toBe(0);
        expect(hostClasses.filter((hostClass: string) => !previewHost?.classList.contains(hostClass))).toEqual([]);
        expect(layers.map((layer: HTMLElement | null) => layer !== null && previewHost?.compareDocumentPosition(layer))).toEqual([
            Node.DOCUMENT_POSITION_FOLLOWING
        ,   Node.DOCUMENT_POSITION_FOLLOWING
        ,   Node.DOCUMENT_POSITION_FOLLOWING
        ,   Node.DOCUMENT_POSITION_FOLLOWING
        ]);
    });

    it('should announce the frozen image to screen readers only, without a banner over the frame', async () => {
        await enter();
        emitState(SessionStatus.RUNNING);

        const notice: HTMLElement | null = query(FROZEN_NOTICE_SELECTOR);

        expect(notice?.tagName).toBe('P');
        expect(notice?.classList.contains('visually-hidden')).toBe(true);
        expect(notice?.getAttribute('role')).toBe('status');
        expect(notice?.getAttribute('aria-live')).toBe('polite');
        expect(text(FROZEN_NOTICE_SELECTOR)).toBe(EMPTY);

        emitState(SessionStatus.FROZEN);

        expect(query(FROZEN_NOTICE_SELECTOR)).toBe(notice);
        expect(text(FROZEN_NOTICE_SELECTOR)).toBe('camera.frozen');
        expect(query('.lens-chip')).toBeNull();
        expect(element.querySelectorAll('.lens-frame-notice, .lens-controls-notice').length).toBe(0);
        expect(frame().classList.contains('lens-frame-frozen')).toBe(false);
        expect(element.querySelectorAll('#camera-status-area .lens-panel').length).toBe(0);

        emitState(SessionStatus.RUNNING);

        expect(text(FROZEN_NOTICE_SELECTOR)).toBe(EMPTY);
    });

    it('should keep the frame an opaque dark surface in the browser, where the video is painted inside it', async () => {
        await enter();
        emitState(SessionStatus.RUNNING);

        expect(frame().classList.contains('lens-frame-scanning')).toBe(true);
        expect(frame().classList.contains('lens-frame-see-through')).toBe(false);

        emitState(SessionStatus.FROZEN);

        expect(frame().classList.contains('lens-frame-scanning')).toBe(false);
        expect(frame().classList.contains('lens-frame-see-through')).toBe(false);
        expect(componentStyles()).toMatch(/\.lens-frame\[[^\]]+\]\{aspect-ratio:4\/5;background:linear-gradient\(/);
        expect(componentStyles()).toMatch(/\.lens-frame-see-through\[[^\]]+\]\{background:none;?\}/);
    });

    it('should outline the frame with a neutral hairline that never turns amber when frozen', async () => {
        await enter();
        emitState(SessionStatus.FROZEN);

        const styles: string = componentStyles();

        expect(frame().classList.contains('lens-frame-frozen')).toBe(false);
        expect(styles).not.toContain('lens-frame-frozen');
        expect(styles).not.toContain('rgba(245,158,11,0.6)');
        expect(styles).toMatch(/\.lens-frame\[[^\]]+\]::after\{border:1pxsolidrgba\(229,231,235,0\.1019607843\);/);
    });

    it('should let the native camera preview show through the frame only while it is live or frozen', async () => {
        recreateOnNativePlatform();
        await enter();

        expect(frame().classList.contains('lens-frame-see-through')).toBe(false);

        emitState(SessionStatus.RUNNING);

        expect(frame().classList.contains('lens-frame-see-through')).toBe(true);

        emitState(SessionStatus.FROZEN);

        expect(frame().classList.contains('lens-frame-see-through')).toBe(true);

        emitState(SessionStatus.ERROR);

        expect(frame().classList.contains('lens-frame-see-through')).toBe(false);
    });

    it('should draw the corner brackets as a decorative layer between the preview and the balloons', async () => {
        const corners: HTMLElement | null = query('.lens-corners');

        expect(corners?.getAttribute('aria-hidden')).toBe('true');
        expect(corners?.parentElement).toBe(frame());
        expect(corners?.classList.contains('pe-none')).toBe(true);
        expect(frame().firstElementChild?.nextElementSibling).toBe(corners);
        expect(corners?.nextElementSibling?.tagName).toBe('APP-OVERLAY-LAYER');
        expect(Array.from(corners?.children ?? []).map((corner: Element) => corner.classList[1])).toEqual([
            'lens-corner-top-start'
        ,   'lens-corner-top-end'
        ,   'lens-corner-bottom-start'
        ,   'lens-corner-bottom-end'
        ]);
    });

    it('should keep the corner brackets thin, short, muted and in one neutral color, breathing only while scanning', () => {
        const styles: string = componentStyles();

        expect(styles).toMatch(/\.lens-corners\[[^\]]+\]\{inset:0\.75rem;opacity:0\.6;?\}/);
        expect(styles).toMatch(/\.lens-corner\[[^\]]+\]\{border:0solidvar\(--lens-mist\);height:1\.25rem;width:1\.25rem;?\}/);
        expect(styles).toMatch(/\.lens-corner-top-start\[[^\]]+\]\{border-top-left-radius:0\.75rem;border-width:2px002px;?\}/);
        expect(styles).toMatch(/\.lens-corner-bottom-end\[[^\]]+\]\{border-bottom-right-radius:0\.75rem;border-width:02px2px0;?\}/);
        expect(styles).not.toMatch(/\.lens-corner-[a-z-]+\[[^\]]+\]\{[^}]*border-color/);
        expect(styles).toMatch(/\.lens-frame-scanning\[[^\]]+\]\.lens-corners\[[^\]]+\]\{animation:[^;]*lens-breathe/);
    });

    it('should pass overlay items and settings to the overlay layer and toggle the original text', async () => {
        await enter();
        emitState(SessionStatus.RUNNING);
        items$.next([createItem()]);
        await nextFrame();

        const overlay: DebugElement = fixture.debugElement.query(By.css('app-overlay-layer'));

        expect(overlay.properties['items']).toEqual([createItem()]);
        expect(overlay.properties['fontScale']).toBe(1.2);
        expect(overlay.properties['granularity']).toBe(RegionGranularity.BLOCK);
        expect(overlay.properties['showDebug']).toBe(true);
        expect(overlay.properties['frozen']).toBe(false);
        expect(overlay.properties['sourceLanguage']).toBe('es');
        expect(overlay.properties['targetLanguage']).toBe('en');
        expect(overlay.properties['topInset']).toBeUndefined();
        expect(overlay.properties['bottomInset']).toBeUndefined();
        expect(overlay.properties['translationAvailable']).toBeUndefined();

        settings$.next({ ...createSettings(), regionGranularity: RegionGranularity.LINE });

        expect(overlay.properties['granularity']).toBe(RegionGranularity.LINE);

        overlay.triggerEventHandler('balloonToggled', 'region-1');

        expect(overlayStoreService.toggleOriginal).toHaveBeenCalledWith('region-1');
    });

    it('should render a burst of overlay changes once per animation frame with the latest items', async () => {
        await enter();
        emitState(SessionStatus.RUNNING);
        await nextFrame();

        const overlay: DebugElement = fixture.debugElement.query(By.css('app-overlay-layer'));
        const itemsRead: MockInstance<() => OverlayItem[]> = vi.spyOn(component, 'items', 'get');
        const latest: OverlayItem = { ...createItem(), translatedText: 'Tomato soup, fresh' };

        items$.next([{ ...createItem(), status: OverlayStatus.READING }]);
        items$.next([{ ...createItem(), status: OverlayStatus.TRANSLATING }]);
        items$.next([latest]);

        expect(overlay.properties['items']).toEqual([]);
        expect(itemsRead).not.toHaveBeenCalled();

        await nextFrame();

        expect(overlay.properties['items']).toEqual([latest]);
        expect(itemsRead).toHaveBeenCalledTimes(1);
    });

    it('should tell the overlay layer when the image is frozen', async () => {
        await enter();
        emitState(SessionStatus.FROZEN);

        expect(fixture.debugElement.query(By.css('app-overlay-layer')).properties['frozen']).toBe(true);
    });

    it('should show a spinner while starting', async () => {
        await enter();
        emitState(SessionStatus.STARTING);

        expect(query('ion-spinner')).not.toBeNull();
        expect(text('[role="status"]')).toContain('camera.starting');
        expect(query('#camera-freeze-button')).toBeNull();
    });

    it('should render the permission denied state and retry when allowing the camera', async () => {
        await enter();
        emitState(SessionStatus.PERMISSION_DENIED);

        expect(text(STATUS_TITLE_SELECTOR)).toBe('camera.permissionDeniedTitle');
        expect(text(STATUS_MESSAGE_SELECTOR)).toBe('camera.permissionDeniedMessage');
        expect(text('.lens-panel')).toContain('camera.permissionSettingsHint');
        expect(text('.lens-status-action')).toBe('camera.allowCamera');
        expect(query('ion-icon.lens-panel-icon')?.parentElement?.classList.contains('lens-panel-badge')).toBe(true);
        expect(query('.lens-panel-badge')?.classList.contains('lens-panel-badge-attention')).toBe(false);
        expect(query('.lens-status-action')?.classList.contains('lens-pill-primary')).toBe(true);
        expect(query('.lens-status-action')?.getAttribute('shape')).toBe('round');

        query('.lens-status-action')?.click();

        expect(sessionControllerService.start).toHaveBeenCalledTimes(2);
    });

    it('should render the blocked permission state, open the app settings and still allow a retry', async () => {
        await enter();
        emitState(SessionStatus.PERMISSION_BLOCKED);

        const actions: HTMLElement[] = Array.from(element.querySelectorAll<HTMLElement>('.lens-status-action'));

        expect(text(STATUS_TITLE_SELECTOR)).toBe('camera.permissionBlockedTitle');
        expect(text(STATUS_MESSAGE_SELECTOR)).toBe('camera.permissionBlockedMessage');
        expect(text('.lens-panel')).not.toContain('camera.permissionSettingsHint');
        expect(actions.map((action: HTMLElement) => action.textContent?.trim())).toEqual(['camera.openAppSettings', 'common.retry']);
        expect(actions[0].classList.contains('lens-pill-primary')).toBe(true);

        actions[0].click();

        expect(sessionControllerService.openAppSettings).toHaveBeenCalledTimes(1);
        expect(sessionControllerService.start).toHaveBeenCalledTimes(1);

        actions[1].click();

        expect(sessionControllerService.start).toHaveBeenCalledTimes(2);
    });

    it('should log when the app settings cannot be opened', async () => {
        const failure: Error = new Error('no settings activity');

        sessionControllerService.openAppSettings.mockImplementationOnce(() => Promise.reject(failure));
        await enter();
        emitState(SessionStatus.PERMISSION_BLOCKED);
        component.openAppSettings();
        await flushPromises();

        expect(loggerService.error).toHaveBeenCalledWith('camera-open-settings-failed', failure);
        expect(text(STATUS_TITLE_SELECTOR)).toBe('camera.permissionBlockedTitle');
    });

    it('should point to the browser site settings when no camera prompt appears in the browser', async () => {
        lensEngineService.getCapabilities.mockResolvedValue(createCapabilities({ openAppSettings: false }));
        await enter();
        emitState(SessionStatus.PERMISSION_DENIED);

        expect(text(STATUS_TITLE_SELECTOR)).toBe('camera.permissionDeniedTitle');
        expect(text('.lens-panel')).toContain('camera.permissionDeniedBrowserHint');
        expect(text('.lens-panel')).not.toContain('camera.permissionSettingsHint');
        expect(text('.lens-status-action')).toBe('camera.allowCamera');
    });

    it('should explain how to allow the camera in the browser site settings when it is blocked and offer only a retry', async () => {
        lensEngineService.getCapabilities.mockResolvedValue(createCapabilities({ modelRemoval: false, openAppSettings: false }));
        await enter();
        emitState(SessionStatus.PERMISSION_BLOCKED);

        const actions: HTMLElement[] = Array.from(element.querySelectorAll<HTMLElement>('.lens-status-action'));

        expect(text(STATUS_TITLE_SELECTOR)).toBe('camera.permissionBlockedTitle');
        expect(text(STATUS_MESSAGE_SELECTOR)).toBe('camera.permissionBlockedBrowserHint');
        expect(text('.lens-panel')).not.toContain('camera.permissionBlockedMessage');
        expect(text('.lens-panel')).not.toContain('camera.openAppSettings');
        expect(actions.map((action: HTMLElement) => action.textContent?.trim())).toEqual(['common.retry']);
        expect(actions[0].classList.contains('lens-pill-primary')).toBe(true);

        actions[0].click();

        expect(sessionControllerService.openAppSettings).not.toHaveBeenCalled();
        expect(sessionControllerService.start).toHaveBeenCalledTimes(2);
    });

    it('should render the missing model state with the language names, a download action and a link to the languages page', async () => {
        await useTranslations({ modelMissingMessage: 'Download {{languages}} to translate offline.' });
        await enter();
        emitState(SessionStatus.MODEL_MISSING, ['es', 'de']);

        const link: HTMLElement | null = query('[role="status"] .lens-text-button');

        expect(text(STATUS_TITLE_SELECTOR)).toBe('camera.modelMissingTitle');
        expect(text(STATUS_MESSAGE_SELECTOR)).toBe('Download Spanish and German to translate offline.');
        expect(text('.lens-status-action')).toBe('camera.downloadModels');
        expect(modelMissingAction()?.classList.contains('lens-pill-primary')).toBe(true);
        expect(modelMissingAction()?.hasAttribute('aria-disabled')).toBe(false);
        expect(link?.textContent?.trim()).toBe('camera.manageLanguages');
        expect(link?.getAttribute('fill')).toBe('clear');
        expect(link?.querySelector('ion-icon')?.getAttribute('aria-hidden')).toBe('true');
        expect(link?.getAttribute('href')).toBe('/languages');
        expect(link?.getAttribute('routerDirection')).toBe('forward');

        link?.click();

        expect(navigateByUrl).toHaveBeenCalledTimes(1);
        expect(navigateByUrl.mock.calls[0][0].toString()).toBe('/languages');
        expect(languageModelService.download).not.toHaveBeenCalled();
    });

    it('should download the missing packs in place with progress and then start the camera again', async () => {
        const downloads: Map<string, Deferred> = new Map<string, Deferred>([['de', createDeferred()], ['es', createDeferred()]]);
        const showErrorMessage: MockInstance<(message: string) => void> = vi.spyOn(SwalUtils, 'showErrorMessage').mockImplementation(() => undefined);

        languageModelService.download.mockImplementation((language: string) => downloads.get(language)?.promise ?? Promise.resolve());
        await enter();
        emitState(SessionStatus.MODEL_MISSING, ['es', 'de']);
        modelMissingAction()?.click();

        const action: HTMLElement | null = modelMissingAction();

        expect(languageModelService.download).toHaveBeenCalledTimes(2);
        expect(languageModelService.download).toHaveBeenCalledWith('es', false);
        expect(languageModelService.download).toHaveBeenCalledWith('de', false);
        expect(component.downloadingMissing).toBe(true);
        expect(action?.getAttribute('aria-disabled')).toBe('true');
        expect(action?.querySelector('ion-spinner')?.getAttribute('aria-hidden')).toBe('true');
        expect(action?.textContent?.trim()).toBe('languages.downloading');
        expect(query('[role="status"] .lens-panel-note')).toBeNull();
        expect(query('[role="status"]')?.contains(action)).toBe(true);

        component.downloadMissingLanguages();
        action?.click();

        expect(languageModelService.download).toHaveBeenCalledTimes(2);

        downloads.get('es')?.resolve();
        await flushPromises();

        expect(component.downloadingMissing).toBe(true);
        expect(sessionControllerService.start).toHaveBeenCalledTimes(1);

        downloads.get('de')?.resolve();
        await flushPromises();

        expect(sessionControllerService.start).toHaveBeenCalledTimes(2);
        expect(component.downloadingMissing).toBe(false);
        expect(showErrorMessage).not.toHaveBeenCalled();
        expect(loggerService.warn).not.toHaveBeenCalled();
    });

    it('should download the missing packs with the Wi-Fi preference and explain the wait', async () => {
        const download: Deferred = createDeferred();

        preferencesService.settings = { ...createSettings(), requireWifiForDownloads: true };
        languageModelService.download.mockImplementation(() => download.promise);
        await enter();
        emitState(SessionStatus.MODEL_MISSING, ['en']);
        modelMissingAction()?.click();

        expect(languageModelService.download).toHaveBeenCalledExactlyOnceWith('en', true);
        expect(text('[role="status"] .lens-panel-note')).toBe('languages.wifiOnlyNote');

        window.dispatchEvent(new Event('offline'));

        expect(text('[role="status"] .lens-status-action')).toBe('languages.waitingForConnection');

        window.dispatchEvent(new Event('online'));
        download.resolve();
        await flushPromises();

        expect(query('[role="status"] .lens-panel-note')).toBeNull();
        expect(sessionControllerService.start).toHaveBeenCalledTimes(2);
    });

    it('should report the missing packs that could not be downloaded and let the user try again without restarting', async () => {
        const showErrorMessage: MockInstance<(message: string) => void> = vi.spyOn(SwalUtils, 'showErrorMessage').mockImplementation(() => undefined);

        languageModelService.download.mockImplementation(() => Promise.reject(new Error('no connection')));
        await enter();
        emitState(SessionStatus.MODEL_MISSING, ['de']);
        modelMissingAction()?.click();
        await flushPromises();

        expect(appLanguageService.instant).toHaveBeenCalledWith('camera.downloadDetectedError', { languages: 'German' });
        expect(showErrorMessage).toHaveBeenCalledExactlyOnceWith('camera.downloadDetectedError');
        expect(loggerService.warn).toHaveBeenCalledWith('camera-missing-download-failed', { failed: 1, requested: 1 });
        expect(sessionControllerService.start).toHaveBeenCalledTimes(1);
        expect(component.downloadingMissing).toBe(false);
        expect(modelMissingAction()?.hasAttribute('aria-disabled')).toBe(false);
        expect(modelMissingAction()?.textContent?.trim()).toBe('camera.downloadModels');

        modelMissingAction()?.click();
        await flushPromises();

        expect(languageModelService.download).toHaveBeenCalledTimes(2);
        expect(sessionControllerService.start).toHaveBeenCalledTimes(1);
    });

    it('should start the camera again when only some missing packs could be downloaded', async () => {
        const showErrorMessage: MockInstance<(message: string) => void> = vi.spyOn(SwalUtils, 'showErrorMessage').mockImplementation(() => undefined);

        languageModelService.download.mockImplementation((language: string) =>
            language === 'de' ? Promise.reject(new Error('no space')) : Promise.resolve(),
        );
        await enter();
        emitState(SessionStatus.MODEL_MISSING, ['es', 'de']);
        component.downloadMissingLanguages();
        await flushPromises();

        expect(appLanguageService.instant).toHaveBeenCalledWith('camera.downloadDetectedError', { languages: 'German' });
        expect(showErrorMessage).toHaveBeenCalledTimes(1);
        expect(loggerService.warn).toHaveBeenCalledWith('camera-missing-download-failed', { failed: 1, requested: 2 });
        expect(sessionControllerService.start).toHaveBeenCalledTimes(2);
    });

    it('should ask to tap the download button again when the browser needs a new tap to download', async () => {
        const showErrorMessage: MockInstance<(message: string) => void> = vi.spyOn(SwalUtils, 'showErrorMessage').mockImplementation(() => undefined);
        const showWarningMessage: MockInstance<(message: string) => void> = vi.spyOn(SwalUtils, 'showWarningMessage').mockImplementation(() => undefined);

        languageModelService.download.mockImplementation(() => Promise.reject(createCodedError('USER_ACTIVATION_REQUIRED')));
        await enter();
        emitState(SessionStatus.MODEL_MISSING, ['es', 'de']);
        modelMissingAction()?.click();
        await flushPromises();

        expect(showWarningMessage).toHaveBeenCalledExactlyOnceWith('camera.downloadActivationRequired');
        expect(showErrorMessage).not.toHaveBeenCalled();
        expect(instantCalls('camera.downloadDetectedError')).toBe(0);
        expect(loggerService.warn).toHaveBeenCalledWith('camera-missing-download-failed', { failed: 2, requested: 2 });
        expect(component.downloadingMissing).toBe(false);
        expect(modelMissingAction()?.textContent?.trim()).toBe('camera.downloadModels');
        expect(sessionControllerService.start).toHaveBeenCalledTimes(1);
    });

    it('should name the missing packs the browser cannot translate', async () => {
        const showErrorMessage: MockInstance<(message: string) => void> = vi.spyOn(SwalUtils, 'showErrorMessage').mockImplementation(() => undefined);

        languageModelService.download.mockImplementation(() => Promise.reject(createCodedError('TRANSLATION_UNSUPPORTED')));
        await enter();
        emitState(SessionStatus.MODEL_MISSING, ['eo']);
        component.downloadMissingLanguages();
        await flushPromises();

        expect(appLanguageService.instant).toHaveBeenCalledWith('camera.downloadUnsupportedError', { languages: 'Esperanto' });
        expect(showErrorMessage).toHaveBeenCalledExactlyOnceWith('camera.downloadUnsupportedError');
        expect(instantCalls('camera.downloadDetectedError')).toBe(0);
    });

    it('should not open a dialog over another page when the missing packs fail after leaving the camera', async () => {
        const download: Deferred = createDeferred();
        const showErrorMessage: MockInstance<(message: string) => void> = vi.spyOn(SwalUtils, 'showErrorMessage').mockImplementation(() => undefined);

        languageModelService.download.mockImplementation(() => download.promise);
        await enter();
        emitState(SessionStatus.MODEL_MISSING, ['de']);
        component.downloadMissingLanguages();
        component.ionViewWillLeave();
        download.reject(new Error('no connection'));
        await flushPromises();

        expect(loggerService.warn).toHaveBeenCalledWith('camera-missing-download-failed', { failed: 1, requested: 1 });
        expect(showErrorMessage).not.toHaveBeenCalled();
        expect(component.downloadingMissing).toBe(false);
    });

    it('should not start the camera when the missing packs finish downloading after leaving it', async () => {
        const download: Deferred = createDeferred();

        languageModelService.download.mockImplementation(() => download.promise);
        await enter();
        emitState(SessionStatus.MODEL_MISSING, ['de']);
        component.downloadMissingLanguages();
        component.ionViewWillLeave();
        download.resolve();
        await flushPromises();

        expect(sessionControllerService.start).toHaveBeenCalledTimes(1);
        expect(component.downloadingMissing).toBe(false);
    });

    it('should not download anything when no pack is reported missing', async () => {
        await enter();
        emitState(SessionStatus.MODEL_MISSING);
        component.downloadMissingLanguages();

        expect(languageModelService.download).not.toHaveBeenCalled();
        expect(component.downloadingMissing).toBe(false);
    });

    it('should localize the missing language names when the app language changes', async () => {
        await enter();
        emitState(SessionStatus.MODEL_MISSING, ['es', 'de']);
        language$.next('pt');

        expect(component.missingLanguagesText).toBe('espanhol e alemão');
    });

    it('should explain that the browser cannot translate on the device instead of offering the missing packs', async () => {
        lensEngineService.getCapabilities.mockResolvedValue(createCapabilities({ translation: false }));
        await enter();
        emitState(SessionStatus.MODEL_MISSING, ['pt']);

        expect(text(STATUS_TITLE_SELECTOR)).toBe('camera.translationUnsupportedTitle');
        expect(text(STATUS_MESSAGE_SELECTOR)).toBe('camera.translationUnsupportedMessage');
        expect(query('[role="status"] ion-icon.lens-panel-icon')?.getAttribute('name')).toBe('language-outline');
        expect(query('[role="status"] ion-icon.lens-panel-icon')?.getAttribute('aria-hidden')).toBe('true');
        expect(modelMissingAction()).toBeNull();
        expect(query('[role="status"] .lens-text-button')).toBeNull();
        expect(element.textContent).not.toContain('camera.modelMissingTitle');

        component.downloadMissingLanguages();

        expect(languageModelService.download).not.toHaveBeenCalled();
        expect(component.downloadingMissing).toBe(false);
    });

    it('should render the error state and retry', async () => {
        await enter();
        emitState(SessionStatus.ERROR);

        expect(text(STATUS_TITLE_SELECTOR)).toBe('camera.errorTitle');
        expect(text('.lens-status-action')).toBe('common.retry');

        query('.lens-status-action')?.click();

        expect(sessionControllerService.start).toHaveBeenCalledTimes(2);
    });

    it('should explain how to turn on the camera blocked by the operating system and retry', async () => {
        await enter();
        emitState(SessionStatus.CAMERA_BLOCKED);

        const panel: HTMLElement | null = query('#camera-status-area .lens-panel');

        expect(text(STATUS_TITLE_SELECTOR)).toBe('camera.permissionBlockedTitle');
        expect(text(STATUS_MESSAGE_SELECTOR)).toBe('camera.cameraBlockedBySystem');
        expect(panel?.querySelector('.lens-panel-badge')?.classList.contains('lens-panel-badge-attention')).toBe(true);
        expect(panel?.querySelector('.lens-panel-badge ion-icon')?.getAttribute('aria-hidden')).toBe('true');
        expect(panel?.querySelectorAll('.lens-status-action').length).toBe(1);
        expect(text('.lens-status-action')).toBe('common.retry');
        expect(statusLineText()).toBe(EMPTY);
        expect(query('#camera-freeze-button')).toBeNull();

        query('.lens-status-action')?.click();

        expect(sessionControllerService.start).toHaveBeenCalledTimes(2);
    });

    it('should offer the other cameras from the error panel and start the camera again with the chosen one', async () => {
        const selection: Deferred = createDeferred();

        lensEngineService.selectCamera.mockImplementationOnce(() => selection.promise);
        lensEngineService.getCapabilities.mockResolvedValue(createCapabilities({ cameraSelection: true }));
        lensEngineService.listCameras.mockResolvedValue(createCameras(2));
        await enter();
        emitState(SessionStatus.STARTING);
        emitState(SessionStatus.ERROR);
        await flushPromises();

        const actions: HTMLElement[] = Array.from(element.querySelectorAll<HTMLElement>('#camera-status-area .lens-status-action'));

        expect(lensEngineService.listCameras).toHaveBeenCalledTimes(1);
        expect(actions.map((action: HTMLElement) => action.textContent?.trim())).toEqual(['common.retry', 'camera.switchCamera']);
        expect(actions[1].classList.contains('lens-pill-ghost')).toBe(true);
        expect(actions[1].querySelector('ion-icon')?.getAttribute('aria-hidden')).toBe('true');

        actions[1].click();

        expect(lensEngineService.selectCamera).toHaveBeenCalledExactlyOnceWith('camera-1');
        expect(sessionControllerService.start).toHaveBeenCalledTimes(1);

        selection.resolve();
        await flushPromises();

        expect(sessionControllerService.start).toHaveBeenCalledTimes(2);
        expect(component.switchingCamera).toBe(false);
        expect(lensEngineService.listCameras).toHaveBeenCalledTimes(1);

        emitState(SessionStatus.ERROR);
        await flushPromises();

        expect(lensEngineService.listCameras).toHaveBeenCalledTimes(1);
    });

    it('should not offer another camera from the error panel when the engine cannot select one', async () => {
        lensEngineService.listCameras.mockResolvedValue(createCameras(2));
        await enter();
        emitState(SessionStatus.ERROR);
        await flushPromises();

        expect(lensEngineService.listCameras).not.toHaveBeenCalled();
        expect(element.querySelectorAll('#camera-status-area .lens-status-action').length).toBe(1);
        expect(component.showErrorSwitchCamera).toBe(false);
    });

    it('should render the paused message', async () => {
        await enter();
        emitState(SessionStatus.PAUSED);

        expect(text('[role="status"]')).toBe('camera.paused');
        expect(query('#camera-freeze-button')).toBeNull();
    });

    it('should point the camera at text in the status line only after two seconds without recognized text', async () => {
        await runningWithoutText();

        expect(statusLineText()).toBe(EMPTY);

        vi.advanceTimersByTime(HINT_DELAY_MILLISECONDS - 1);

        expect(statusLineText()).toBe(EMPTY);

        vi.advanceTimersByTime(1);

        expect(component.showHint).toBe(true);
        expect(statusLineText()).toBe('camera.hint');
        expect(query(`${STATUS_LINE_SELECTOR} ion-icon`)?.getAttribute('aria-hidden')).toBe('true');
        expectWrappingStatusLine();
        expect(frame().textContent).not.toContain('camera.hint');

        await emitItems([createItem()]);

        expect(component.showHint).toBe(false);
        expect(statusLineText()).toBe(EMPTY);

        await emitItems([]);
        vi.advanceTimersByTime(HINT_DELAY_MILLISECONDS - 1);

        expect(statusLineText()).toBe(EMPTY);

        vi.advanceTimersByTime(1);

        expect(statusLineText()).toBe('camera.hint');
    });

    it('should never point the camera at text while recognition is preparing, the image is frozen or a black image is explained', async () => {
        await runningWithoutText();
        emitStatus(EngineStatusCode.RECOGNITION_LOADING);
        vi.advanceTimersByTime(HINT_DELAY_MILLISECONDS);

        expect(statusLineText()).toBe('camera.preparingRecognition');

        emitStatus(EngineStatusCode.RECOGNITION_READY);

        expect(statusLineText()).toBe(EMPTY);

        vi.advanceTimersByTime(HINT_DELAY_MILLISECONDS);

        expect(statusLineText()).toBe('camera.hint');

        emitState(SessionStatus.FROZEN);

        expect(statusLineText()).toBe(EMPTY);

        emitState(SessionStatus.RUNNING);
        emitStatus(EngineStatusCode.CAMERA_BLACK_FRAMES);
        vi.advanceTimersByTime(HINT_DELAY_MILLISECONDS);

        expect(statusLineText()).toBe(EMPTY);

        component.ionViewWillLeave();
        vi.advanceTimersByTime(HINT_DELAY_MILLISECONDS);

        expect(component.showHint).toBe(false);
    });

    it('should toggle freeze from a compact shutter below the frame with a short label and a descriptive name', async () => {
        await enter();
        emitState(SessionStatus.RUNNING);

        const freezeButton: HTMLElement | null = query('#camera-freeze-button');

        expect(component.frozen).toBe(false);
        expect(query('ion-fab')).toBeNull();
        expect(frame().contains(freezeButton)).toBe(false);
        expect(query('.lens-controls')?.contains(freezeButton)).toBe(true);
        expect(query('.lens-stage')?.compareDocumentPosition(query('.lens-controls') as HTMLElement)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
        expect(freezeButton?.tagName).toBe('BUTTON');
        expect(freezeButton?.getAttribute('type')).toBe('button');
        expect(text('#camera-freeze-button .lens-shutter-label')).toBe('camera.freezeShort');
        expect(freezeButton?.getAttribute('aria-label')).toBe('camera.freeze');
        expect(query('#camera-freeze-button .lens-shutter-ring')?.getAttribute('aria-hidden')).toBe('true');
        expect(freezeButton?.classList.contains('lens-shutter-frozen')).toBe(false);
        expect(freezeIconProperty('name')).toBe('snow-outline');

        freezeButton?.click();
        await flushPromises();

        expect(sessionControllerService.toggleFreeze).toHaveBeenCalledTimes(1);

        emitState(SessionStatus.FROZEN);

        expect(component.frozen).toBe(true);
        expect(query('#camera-freeze-button')).toBe(freezeButton);
        expect(text('#camera-freeze-button .lens-shutter-label')).toBe('camera.resumeShort');
        expect(freezeButton?.getAttribute('aria-label')).toBe('camera.resumeLive');
        expect(freezeButton?.classList.contains('lens-shutter-frozen')).toBe(true);
        expect(freezeIconProperty('name')).toBe('play-outline');
    });

    it('should keep the indigo shutter when frozen and only tint its icon amber', () => {
        const styles: string = componentStyles();

        expect(styles).toMatch(/\.lens-shutter-frozen\[[^\]]+\]\.lens-shutter-core\[[^\]]+\]\{color:var\(--lens-amber-text\);?\}/);
        expect(styles).not.toMatch(/\.lens-shutter-frozen\[[^\]]+\]\.lens-shutter-core\[[^\]]+\]\{[^}]*background/);
    });

    it('should center the status line and the shutter row in the controls without changing their height when frozen', async () => {
        await enter();
        emitState(SessionStatus.RUNNING);

        expect(statusLine()?.classList.contains('mt-auto')).toBe(true);
        expect(query('.lens-control-row')?.classList.contains('mb-auto')).toBe(true);
        expect(query('.lens-control-row')?.contains(query('#camera-freeze-button'))).toBe(true);
        expect(query('.lens-controls')?.classList.contains('overflow-y-auto')).toBe(true);
        expect(query('.lens-controls-notice')).toBeNull();

        emitState(SessionStatus.FROZEN);

        expect(query('.lens-controls')?.classList.contains('gap-3')).toBe(false);
        expect(componentStyles()).toMatch(/\.lens-status-line\[[^\]]+\]\{min-height:2\.75rem;?\}/);
        expect(componentStyles()).not.toContain('lens-controls-notice');
        expect(componentStyles()).toMatch(/@media\(orientation:landscape\)and\(max-height:32rem\)\{[^@]*\.lens-control-row\[[^\]]+\]\{flex-direction:column;?\}/);
    });

    it('should keep the shutter compact with a one line label', async () => {
        await enter();
        emitState(SessionStatus.RUNNING);

        const styles: string = componentStyles();

        expect(query('#camera-freeze-button .lens-shutter-label')?.classList.contains('text-nowrap')).toBe(true);
        expect(styles).toMatch(/\.lens-shutter-ring\[[^\]]+\]\{border:3pxsolid#fff;[^}]*height:3\.75rem;[^}]*width:3\.75rem;?\}/);
        expect(styles).not.toContain('min-height:2.5em');
    });

    it('should give the language status line and the terms link the same 44 pixel touch target as the other controls', () => {
        const styles: string = componentStyles();

        expect(styles).toMatch(/\.lens-status-button\[[^\]]+\]\{[^}]*min-height:2\.75rem;?\}/);
        expect(styles).toMatch(/\.lens-footer-link\[[^\]]+\]\{[^}]*min-height:2\.75rem;?\}/);
    });

    it('should fit two balanced lines of a wrapped status message in the reserved status line height so the frame never moves', () => {
        const styles: string = componentStyles();
        const buttonDeclarations: string = styles.match(/\.lens-status-button\[[^\]]+\]\{([^}]*--padding-top[^}]*)\}/)?.[1] ?? EMPTY;
        const lineDeclarations: string = styles.match(/\.lens-status-line\[[^\]]+\]\{([^}]*)\}/)?.[1] ?? EMPTY;
        const statusRules: string[] = styles.match(/[^{}]*\.lens-status[^{}]*\{[^}]*\}/g) ?? [];
        const twoLinesHeight: number =
            2 * remValue(buttonDeclarations, 'font-size') * SMALL_LINE_HEIGHT + remValue(buttonDeclarations, '--padding-top') + remValue(buttonDeclarations, '--padding-bottom');

        expect(remValue(buttonDeclarations, '--padding-top')).toBe(0.25);
        expect(remValue(buttonDeclarations, '--padding-bottom')).toBe(0.25);
        expect(twoLinesHeight).toBeLessThanOrEqual(remValue(lineDeclarations, 'min-height'));
        expect(remValue(buttonDeclarations, 'min-height')).toBe(remValue(lineDeclarations, 'min-height'));
        expect(styles).toMatch(/\.lens-status-label\[[^\]]+\]\{text-wrap:balance;?\}/);
        expect(statusRules.length).toBeGreaterThan(0);
        expect(statusRules.filter((rule: string) => /text-overflow|nowrap|line-clamp|overflow:hidden/.test(rule))).toEqual([]);
    });

    it('should take the focus ring and the indigo fills from the global design tokens', () => {
        const styles: string = componentStyles();

        expect(styles).toMatch(/\.ion-focused\[[^\]]+\],\[[^\]]+\]\.lens-shutter\[[^\]]+\]:focus-visible\{outline:2pxsolidvar\(--lens-focus-ring\);/);
        expect(styles).toMatch(/\.lens-shutter-core\[[^\]]+\]\{background:var\(--lens-indigo-strong\);/);
        expect(styles).toMatch(/\.lens-pill-primary\[[^\]]+\]\{--background:var\(--lens-indigo-strong\);/);
        expect(styles).not.toContain('#c7d2fe');
        expect(styles).not.toContain('--lens-accent-text');
        expect(styles).not.toContain('--lens-primary-fill');
    });

    it('should ignore repeated freeze taps while a toggle is pending', async () => {
        await enter();
        emitState(SessionStatus.RUNNING);

        component.toggleFreeze();
        component.toggleFreeze();

        expect(sessionControllerService.toggleFreeze).toHaveBeenCalledTimes(1);
    });

    it('should log and show an error when toggling freeze fails', async () => {
        const showErrorMessage: MockInstance<(message: string) => void> = vi.spyOn(SwalUtils, 'showErrorMessage').mockImplementation(() => undefined);

        sessionControllerService.toggleFreeze.mockImplementationOnce(() => Promise.reject(new Error('freeze failed')));
        await enter();
        emitState(SessionStatus.RUNNING);
        component.toggleFreeze();
        await flushPromises();

        expect(loggerService.error).toHaveBeenCalledWith('camera-freeze-toggle-failed', expect.any(Error));
        expect(showErrorMessage).toHaveBeenCalledWith('camera.freezeError');
    });

    it('should explain a black camera image inside the live status region until the frames recover', async () => {
        await enter();
        emitState(SessionStatus.RUNNING);

        expect(query('#camera-black-frames-notice')).toBeNull();

        emitStatus(EngineStatusCode.CAMERA_BLACK_FRAMES);

        const notice: HTMLElement | null = query('#camera-black-frames-notice');

        expect(component.statusPanel).toBe(component.statusPanelKind.BLACK_FRAMES);
        expect(query('[role="status"]')?.contains(notice)).toBe(true);
        expect(notice?.querySelector('h2')?.textContent?.trim()).toBe('camera.blackFramesTitle');
        expect(notice?.querySelector('h2 + p')?.textContent?.trim()).toBe('camera.blackFramesMessage');
        expect(notice?.querySelector('.lens-panel-badge')?.classList.contains('lens-panel-badge-attention')).toBe(true);
        expect(notice?.querySelector('ion-icon')?.getAttribute('aria-hidden')).toBe('true');
        expect(notice?.querySelector('.lens-status-action')).toBeNull();
        expect(element.querySelectorAll('#camera-status-area .lens-panel').length).toBe(1);
        expect(statusLineText()).toBe(EMPTY);
        expect(lensEngineService.listCameras).not.toHaveBeenCalled();

        emitStatus(EngineStatusCode.CAMERA_FRAMES_RECOVERED);

        expect(query('#camera-black-frames-notice')).toBeNull();
        expect(component.statusPanel).toBe(component.statusPanelKind.NONE);
    });

    it('should show the black image notice only while running and forget it when the camera starts again', async () => {
        await enter();
        emitState(SessionStatus.RUNNING);
        emitStatus(EngineStatusCode.CAMERA_BLACK_FRAMES);
        emitState(SessionStatus.FROZEN);

        expect(query('#camera-black-frames-notice')).toBeNull();

        emitState(SessionStatus.RUNNING);

        expect(query('#camera-black-frames-notice')).not.toBeNull();

        emitState(SessionStatus.STARTING);
        emitState(SessionStatus.RUNNING);

        expect(component.statusPanel).toBe(component.statusPanelKind.NONE);
        expect(query('#camera-black-frames-notice')).toBeNull();
    });

    it('should offer to switch to the other camera from the black image notice and hide the notice while switching', async () => {
        const selection: Deferred = createDeferred();

        lensEngineService.selectCamera.mockImplementationOnce(() => selection.promise);
        await enableCameraSelection(createCameras(2));
        emitStatus(EngineStatusCode.CAMERA_BLACK_FRAMES);
        await flushPromises();

        const action: HTMLElement | null = query('#camera-black-frames-notice .lens-status-action');

        expect(lensEngineService.listCameras).toHaveBeenCalledTimes(2);
        expect(action?.textContent?.trim()).toBe('camera.switchCamera');
        expect(action?.classList.contains('lens-pill-primary')).toBe(true);
        expect(action?.hasAttribute('aria-haspopup')).toBe(false);

        action?.click();

        expect(lensEngineService.selectCamera).toHaveBeenCalledExactlyOnceWith('camera-1');
        expect(query('#camera-black-frames-notice')).toBeNull();
        expect(component.switchingCamera).toBe(true);
        expect(query('#camera-switch-button')?.getAttribute('aria-disabled')).toBe('true');

        component.switchCamera(cameraPicker() as unknown as IonSelect);

        expect(lensEngineService.selectCamera).toHaveBeenCalledTimes(1);

        selection.resolve();
        await flushPromises();

        expect(component.switchingCamera).toBe(false);
        expect(query('#camera-switch-button')?.hasAttribute('aria-disabled')).toBe(false);
        expect(appLanguageService.instant).toHaveBeenCalledWith('camera.cameraSelected', { camera: 'Camera label 1' });
        expect(announcement()).toBe('camera.cameraSelected');
        expect(lensEngineService.listCameras).toHaveBeenCalledTimes(3);
    });

    it('should move the focus to the freeze button when the black image notice disappears under its focused switch camera button', async () => {
        await enableCameraSelection(createCameras(2));
        emitStatus(EngineStatusCode.CAMERA_BLACK_FRAMES);
        await flushPromises();

        const action: HTMLElement | null = query('#camera-black-frames-notice .lens-status-action');
        const freezeButton: HTMLElement | null = query('#camera-freeze-button');

        expect(query('#camera-status-area')?.getAttribute('role')).toBe('status');
        expect(query('#camera-status-area')?.contains(action)).toBe(true);

        attachNativeButton(action)?.focus();
        attachNativeButton(query('#camera-switch-button'));
        attachNativeButton(query('#camera-settings-button'));

        expect(document.activeElement).toBe(action);

        action?.click();

        expect(lensEngineService.selectCamera).toHaveBeenCalledExactlyOnceWith('camera-1');
        expect(query('#camera-black-frames-notice')).toBeNull();
        expect(document.activeElement).not.toBe(document.body);
        expect(document.activeElement).toBe(freezeButton);

        await flushPromises();

        expect(document.activeElement).toBe(freezeButton);
    });

    it('should move the focus to the freeze button when the frames recover under the focused switch camera button', async () => {
        await enableCameraSelection(createCameras(2));
        emitStatus(EngineStatusCode.CAMERA_BLACK_FRAMES);
        await flushPromises();

        const action: HTMLElement | null = query('#camera-black-frames-notice .lens-status-action');

        attachNativeButton(action)?.focus();
        emitStatus(EngineStatusCode.CAMERA_FRAMES_RECOVERED);

        expect(query('#camera-black-frames-notice')).toBeNull();
        expect(document.activeElement).toBe(query('#camera-freeze-button'));
    });

    it('should move the focus to the settings button when a retry replaces the focused button of the error panel', async () => {
        await enter();
        emitState(SessionStatus.ERROR);

        const retryButton: HTMLElement | null = query('#camera-status-area .lens-status-action');
        const settingsButton: HTMLElement | null = query('#camera-settings-button');

        attachNativeButton(retryButton)?.focus();
        attachNativeButton(settingsButton);
        retryButton?.click();

        expect(sessionControllerService.start).toHaveBeenCalledTimes(2);
        expect(document.activeElement).toBe(retryButton);

        emitState(SessionStatus.STARTING);

        expect(retryButton?.isConnected).toBe(false);
        expect(text('#camera-status-area')).toBe('camera.starting');
        expect(document.activeElement).toBe(settingsButton);
    });

    it('should leave the focus where it is when a status panel changes without holding it', async () => {
        await enableCameraSelection(createCameras(2));

        const settingsButton: HTMLElement | null = query('#camera-settings-button');

        attachNativeButton(query('#camera-freeze-button'));
        attachNativeButton(settingsButton)?.focus();
        emitStatus(EngineStatusCode.CAMERA_BLACK_FRAMES);
        await flushPromises();
        emitStatus(EngineStatusCode.CAMERA_FRAMES_RECOVERED);

        expect(document.activeElement).toBe(settingsButton);
    });

    it('should switch between two cameras from a round glass button next to the freeze button while running', async () => {
        await enableCameraSelection(createCameras(2, 1));

        const switchButton: HTMLElement | null = query('#camera-switch-button');
        const row: HTMLElement | null = query('.lens-control-row');
        const slots: HTMLElement[] = Array.from(element.querySelectorAll<HTMLElement>('.lens-control-row > .lens-control-slot'));

        expect(component.cameras.length).toBe(2);
        expect(row?.firstElementChild).toBe(slots[0]);
        expect(row?.lastElementChild).toBe(slots[1]);
        expect(slots[0].contains(switchButton)).toBe(true);
        expect(switchButton?.nextElementSibling).toBeNull();
        expect(slots[0].nextElementSibling?.id).toBe('camera-freeze-button');
        expect(switchButton?.getAttribute('shape')).toBe('round');
        expect(switchButton?.classList.contains('lens-glass-button')).toBe(true);
        expect(switchButton?.querySelector('ion-icon')?.getAttribute('slot')).toBe('icon-only');
        expect(await ariaLabelOf('#camera-switch-button')).toBe('camera.switchCamera');

        switchButton?.click();
        await flushPromises();

        expect(lensEngineService.selectCamera).toHaveBeenCalledExactlyOnceWith('camera-0');

        emitState(SessionStatus.FROZEN);

        expect(query('#camera-switch-button')).toBeNull();
        expect(element.querySelectorAll('.lens-control-row > .lens-control-slot').length).toBe(2);
    });

    it('should not offer to switch cameras when the engine cannot select one or only one camera exists', async () => {
        lensEngineService.listCameras.mockResolvedValue(createCameras(3));
        await enter();
        emitState(SessionStatus.RUNNING);
        await flushPromises();
        emitStatus(EngineStatusCode.CAMERA_BLACK_FRAMES);
        await flushPromises();

        expect(lensEngineService.listCameras).not.toHaveBeenCalled();
        expect(query('#camera-switch-button')).toBeNull();
        expect(query('#camera-black-frames-notice .lens-status-action')).toBeNull();

        component.ionViewWillLeave();
        await enableCameraSelection(createCameras(1));

        expect(lensEngineService.listCameras).toHaveBeenCalledTimes(1);
        expect(component.canSwitchCamera).toBe(false);
        expect(query('#camera-switch-button')).toBeNull();
    });

    it('should choose among three or more cameras in an alert picker that starts on the active camera', async () => {
        await enableCameraSelection(createCameras(3, 2));

        const picker: SourcePickerElement | null = cameraPicker();
        const options: HTMLElement[] = Array.from(picker?.querySelectorAll<HTMLElement>('ion-select-option') ?? []);

        if (picker) {
            picker.open = vi.fn<() => Promise<boolean>>(() => Promise.resolve(true));
        }

        expect(picker?.getAttribute('interface')).toBe('alert');
        expect(picker?.label).toBe('camera.chooseCameraTitle');
        expect(picker?.interfaceOptions).toEqual({ header: 'camera.chooseCameraTitle' });
        expect(options.map((option: HTMLElement) => option.textContent?.trim())).toEqual(['Camera label 0', 'Camera label 1', 'Camera label 2']);
        expect(await ariaAttributeOf('#camera-switch-button', 'aria-haspopup')).toBe('dialog');

        query('#camera-switch-button')?.click();

        expect(picker?.open).toHaveBeenCalledTimes(1);
        expect(cameraPickerAccessor().value).toBe('camera-2');
        expect(lensEngineService.selectCamera).not.toHaveBeenCalled();

        cameraPickerAccessor().choose('camera-2');

        expect(lensEngineService.selectCamera).not.toHaveBeenCalled();

        lensEngineService.listCameras.mockResolvedValue(createCameras(3, 0));
        cameraPickerAccessor().choose('camera-0');

        expect(component.cameras.find((camera: CameraDevice) => camera.active)?.cameraId).toBe('camera-2');

        await flushPromises();

        expect(lensEngineService.selectCamera).toHaveBeenCalledExactlyOnceWith('camera-0');
        expect(lensEngineService.listCameras).toHaveBeenCalledTimes(2);
        expect(component.cameras.find((camera: CameraDevice) => camera.active)?.cameraId).toBe('camera-0');

        picker?.dispatchEvent(new CustomEvent('ionDismiss'));

        expect(component.cameraControl.value).toBeNull();
    });

    it('should name a camera without a label by its position', async () => {
        await enableCameraSelection([...createCameras(2), { active: false, cameraId: 'camera-2', label: ' ' }]);

        const options: HTMLElement[] = Array.from(cameraPicker()?.querySelectorAll<HTMLElement>('ion-select-option') ?? []);

        expect(appLanguageService.instant).toHaveBeenCalledWith('camera.cameraFallbackLabel', { number: '3' });
        expect(options[2].textContent?.trim()).toBe('camera.cameraFallbackLabel');
    });

    it('should log and report a camera that cannot be selected or listed', async () => {
        const failure: Error = new Error('device busy');
        const listFailure: Error = new Error('enumerate failed');
        const showErrorMessage: MockInstance<(message: string) => void> = vi.spyOn(SwalUtils, 'showErrorMessage').mockImplementation(() => undefined);

        lensEngineService.selectCamera.mockImplementationOnce(() => Promise.reject(failure));
        await enableCameraSelection(createCameras(2));
        lensEngineService.listCameras.mockImplementationOnce(() => Promise.reject(listFailure));
        query('#camera-switch-button')?.click();
        await flushPromises();

        expect(loggerService.error).toHaveBeenCalledWith('camera-switch-failed', failure);
        expect(showErrorMessage).toHaveBeenCalledExactlyOnceWith('camera.switchCameraError');
        expect(component.switchingCamera).toBe(false);
        expect(component.cameras.find((camera: CameraDevice) => camera.active)?.cameraId).toBe('camera-0');

        emitStatus(EngineStatusCode.CAMERA_BLACK_FRAMES);
        await flushPromises();

        expect(loggerService.error).toHaveBeenCalledWith('camera-list-failed', listFailure);
    });

    it('should forget the cameras when the camera screen is left', async () => {
        await enableCameraSelection(createCameras(2));
        emitStatus(EngineStatusCode.CAMERA_BLACK_FRAMES);
        component.ionViewWillLeave();

        expect(component.cameras).toEqual([]);
        expect(component.statusPanel).toBe(component.statusPanelKind.NONE);
    });

    it('should show a discreet text recognition preparation notice in the status line until it is ready', async () => {
        await enter();
        emitStatus(EngineStatusCode.RECOGNITION_LOADING);
        emitState(SessionStatus.RUNNING);

        const line: HTMLElement | null = statusLine();

        expect(line?.getAttribute('role')).toBe('status');
        expect(line?.getAttribute('aria-live')).toBe('polite');
        expect(component.statusLine).toBe(component.statusLineKind.RECOGNITION_LOADING);
        expect(statusLineText()).toBe('camera.preparingRecognition');
        expect(line?.querySelector('ion-spinner')?.getAttribute('aria-hidden')).toBe('true');
        expectWrappingStatusLine();
        expect(frame().textContent).not.toContain('camera.preparingRecognition');

        emitStatus(EngineStatusCode.RECOGNITION_READY);

        expect(statusLineText()).toBe(EMPTY);
    });

    it('should keep the recognition preparation notice out of the frozen image and drop it when the session stops', async () => {
        await enter();
        emitState(SessionStatus.RUNNING);
        emitStatus(EngineStatusCode.RECOGNITION_LOADING);
        emitState(SessionStatus.FROZEN);

        expect(statusLineText()).toBe(EMPTY);

        emitState(SessionStatus.RUNNING);

        expect(component.statusLine).toBe(component.statusLineKind.RECOGNITION_LOADING);

        emitState(SessionStatus.ERROR);
        emitState(SessionStatus.RUNNING);

        expect(component.statusLine).toBe(component.statusLineKind.NONE);
    });

    it('should tell that text recognition could not load when it fails while preparing and drop the notice once it loads again', async () => {
        await enter();
        emitState(SessionStatus.STARTING);
        emitStatus(EngineStatusCode.RECOGNITION_LOADING);
        emitState(SessionStatus.RUNNING);
        emitEngineError('OCR_FAILED');

        const line: HTMLElement | null = statusLine();

        expect(component.statusLine).toBe(component.statusLineKind.RECOGNITION_UNAVAILABLE);
        expect(statusLineText()).toBe('camera.recognitionUnavailable');
        expect(line?.querySelector('ion-spinner')).toBeNull();
        expect(line?.querySelector('ion-icon')?.getAttribute('aria-hidden')).toBe('true');
        expectWrappingStatusLine();

        emitState(SessionStatus.FROZEN);

        expect(statusLineText()).toBe(EMPTY);

        emitState(SessionStatus.RUNNING);

        expect(component.statusLine).toBe(component.statusLineKind.RECOGNITION_UNAVAILABLE);

        emitStatus(EngineStatusCode.RECOGNITION_LOADING);

        expect(statusLineText()).toBe('camera.preparingRecognition');

        emitStatus(EngineStatusCode.RECOGNITION_READY);

        expect(statusLineText()).toBe(EMPTY);
    });

    it('should ignore recognition errors of single frames and forget the failed recognition when the session stops', async () => {
        await enter();
        emitState(SessionStatus.RUNNING);
        emitEngineError('OCR_FAILED');
        emitEngineError('CAMERA_ERROR');

        expect(component.statusLine).not.toBe(component.statusLineKind.RECOGNITION_UNAVAILABLE);

        emitStatus(EngineStatusCode.RECOGNITION_LOADING);
        emitEngineError('OCR_FAILED');

        expect(component.statusLine).toBe(component.statusLineKind.RECOGNITION_UNAVAILABLE);

        emitState(SessionStatus.STARTING);
        emitState(SessionStatus.RUNNING);

        expect(component.statusLine).not.toBe(component.statusLineKind.RECOGNITION_UNAVAILABLE);

        emitStatus(EngineStatusCode.RECOGNITION_LOADING);
        emitEngineError('OCR_FAILED');
        component.ionViewWillLeave();

        expect(component.statusLine).not.toBe(component.statusLineKind.RECOGNITION_UNAVAILABLE);
    });

    it('should hand the automatic source language to the overlay layer unchanged', async () => {
        await enter();
        settings$.next({ ...createSettings(), sourceLanguage: AUTO_LANGUAGE });

        expect(component.sourceLanguage).toBe(AUTO_LANGUAGE);
        expect(fixture.debugElement.query(By.css('app-overlay-layer')).properties['sourceLanguage']).toBe(AUTO_LANGUAGE);
    });

    it('should read the connectivity again when the camera is entered', async () => {
        vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
        await enter();

        expect(component.downloadStatusKey).toBe('languages.waitingForConnection');

        component.ionViewWillLeave();
        window.dispatchEvent(new Event('online'));

        expect(component.downloadStatusKey).toBe('languages.waitingForConnection');
    });

    it('should keep the focus on the language status button while it changes and move it to the freeze button when it disappears', async () => {
        await enter();
        emitState(SessionStatus.RUNNING);
        await emitItems([createItem()]);
        emitScene(SceneLanguageStatus.IDENTIFIED, 'fr');

        const button: HTMLElement | null = languageStatus();
        const freezeButton: HTMLElement | null = query('#camera-freeze-button');

        attachNativeButton(button)?.focus();
        attachNativeButton(freezeButton);
        attachNativeButton(query('#camera-settings-button'));
        button?.click();

        expect(document.activeElement).toBe(button);

        await flushPromises();

        expect(document.activeElement).toBe(button);
        expect(appLanguageService.instant).toHaveBeenCalledWith('camera.downloadDetectedSuccess', { languages: 'French' });

        emitScene(SceneLanguageStatus.IDENTIFYING);

        expect(languageStatus()).toBeNull();
        expect(statusLineText()).toBe('camera.identifyingLanguage');
        expect(document.activeElement).toBe(freezeButton);
        expect(announcement()).toBe('camera.downloadDetectedSuccess');
    });

    it('should move the lost focus to the settings button when the camera stops running', async () => {
        await enter();
        emitState(SessionStatus.RUNNING);
        emitScene(SceneLanguageStatus.IDENTIFIED, 'fr');

        const settingsButton: HTMLElement | null = query('#camera-settings-button');

        attachNativeButton(languageStatus())?.focus();
        attachNativeButton(query('#camera-freeze-button'));
        attachNativeButton(settingsButton);
        emitState(SessionStatus.PAUSED);

        expect(languageStatus()).toBeNull();
        expect(query('#camera-freeze-button')).toBeNull();
        expect(document.activeElement).toBe(settingsButton);
    });

    it('should not move the focus when the status line changes without holding it', async () => {
        const settingsButton: HTMLElement | null = query('#camera-settings-button');

        await enter();
        emitState(SessionStatus.RUNNING);
        emitScene(SceneLanguageStatus.UNDETERMINED);
        attachNativeButton(query('#camera-freeze-button'));
        attachNativeButton(settingsButton)?.focus();
        emitScene(SceneLanguageStatus.IDENTIFIED, 'es');

        expect(languageStatus()).not.toBeNull();
        expect(document.activeElement).toBe(settingsButton);
    });

    it('should restore focus to the freeze button when a source picker is dismissed after detection', async () => {
        await enter();
        emitState(SessionStatus.RUNNING);
        emitScene(SceneLanguageStatus.MANUAL, 'es', 1);
        dismissPicker();
        await nextFrame();
        expect(document.activeElement).toBe(query('#camera-freeze-button'));
    });

    it('should leave the focus alone when the source language picker is cancelled', async () => {
        await enter();
        emitState(SessionStatus.RUNNING);
        emitScene(SceneLanguageStatus.UNDETERMINED);

        const chooseButton: HTMLElement | null = languageStatus();

        attachNativeButton(query('#camera-freeze-button'));
        attachNativeButton(chooseButton)?.focus();
        dismissPicker();
        await nextFrame();

        expect(document.activeElement).toBe(chooseButton);
        expect(sessionControllerService.setManualSourceLanguage).not.toHaveBeenCalled();
        expect(component.sourceLanguageControl.value).toBeNull();
    });

    it('should forget the announcement when leaving the camera', async () => {
        await enter();
        emitState(SessionStatus.RUNNING);
        emitScene(SceneLanguageStatus.UNDETERMINED);
        pickerAccessor().choose('fr');

        expect(component.announcement).toBe('camera.sourceLanguageSelected');

        component.ionViewWillLeave();

        expect(component.announcement).toBe(EMPTY);
    });

    it('should log when the source language picker cannot be opened', async () => {
        const failure: Error = new Error('overlay failed');

        await enter();
        emitState(SessionStatus.RUNNING);
        emitScene(SceneLanguageStatus.UNDETERMINED);

        const sourcePicker: SourcePickerElement | null = picker();

        expect(sourcePicker).not.toBeNull();

        if (sourcePicker) {
            sourcePicker.open = vi.fn<() => Promise<boolean>>(() => Promise.reject(failure));
        }

        languageStatus()?.click();
        await flushPromises();

        expect(loggerService.error).toHaveBeenCalledWith('camera-source-picker-failed', failure);
        expect(sessionControllerService.setManualSourceLanguage).not.toHaveBeenCalled();
    });

    it('should list the automatic identification first and then the Latin source languages by name in the app language inside an alert picker', async () => {
        const englishOrder: string[] = LanguageUtils.sortByDisplayName(RECOGNITION_SOURCE_LANGUAGES, 'en');
        const options: HTMLElement[] = Array.from(picker()?.querySelectorAll<HTMLElement>('ion-select-option') ?? []);

        expect(component.sourceLanguageOptions).toEqual(englishOrder);
        expect(component.automaticLanguage).toBe(AUTO_LANGUAGE);
        expect(options.length).toBe(RECOGNITION_SOURCE_LANGUAGES.length + 1);
        expect(options[0].textContent?.trim()).toBe('languages.autoDetect');
        expect(options[1].textContent?.trim()).toBe(LanguageUtils.displayName(englishOrder[0], 'en'));
        expect(picker()?.getAttribute('interface')).toBe('alert');
        expect(picker()?.label).toBe('camera.chooseSourceLanguageTitle');
        expect(picker()?.interfaceOptions).toEqual({ header: 'camera.chooseSourceLanguageTitle' });

        await enter();
        language$.next('pt');

        expect(component.sourceLanguageOptions).toEqual(LanguageUtils.sortByDisplayName(RECOGNITION_SOURCE_LANGUAGES, 'pt'));
    });
});
