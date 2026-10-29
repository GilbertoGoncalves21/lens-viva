import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslatePipe, TranslateService, provideTranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { Mock } from 'vitest';
import 'src/app/shared/shared.module';
import { NormalizedRect, OverlayItem, OverlayStatus, RegionGranularity } from 'src/app/shared/models';
import { AUTO_LANGUAGE, EMPTY, LENS_FRAME_RADIUS_PIXELS, UNDETERMINED_LANGUAGE } from 'src/app/shared/utils';
import { BalloonPlacement, OverlayLayerComponent } from './overlay-layer.component';

interface FrameExtent {
    bottom: number;
    left: number;
    right: number;
    top: number;
}

interface RenderedPlacement {
    fontSize: number;
    left: number;
    minHeight: number;
    rotation: number;
    top: number;
    width: number;
}

const BALLOON_HORIZONTAL_PADDING_PIXELS: number = 4;

const COLLISION_GAP_PIXELS: number = 2;

const FONTS_PROPERTY: string = 'fonts';

const FRAME_HEIGHT_PIXELS: number = 500;

const FRAME_MARGIN_PIXELS: number = 4;

const FRAME_WIDTH_PIXELS: number = 400;

const LONG_TRANSLATION: string = 'Sopa de tomate fresca com manjericão e torradas da casa';

const LONG_WORD: string = 'Pneumoultramicroscopicossilicovulcanoconiótico';

const MEASURED_CHARACTER_WIDTH_EM: number = 0.5;

const MEASURED_FONT_FAMILY: string = 'Inter';

const MEASUREMENT_REFERENCE_PIXELS: number = 100;

const MEASUREMENT_SLACK: number = 1.08;

const NEIGHBOR_GAP_PIXELS: number = 4;

const OFFSCREEN_CANVAS_PROPERTY: string = 'OffscreenCanvas';

const PIXEL_PRECISION: number = 2;

const REGION_ID_ATTRIBUTE: string = 'data-region-id';

const RESIZE_OBSERVER_PROPERTY: string = 'ResizeObserver';

const ROTATION_PATTERN: RegExp = /rotate\((-?[\d.]+)deg\)/;

const TRUNCATING_CLASS_PATTERN: RegExp = /truncate|nowrap|clamp|overflow-(hidden|clip|x-hidden|y-hidden)/;

class MeasurementContextFake {
    private _acceptsFonts: boolean;
    private static _characterWidthEm: number = MEASURED_CHARACTER_WIDTH_EM;
    private _font: string = '10px sans-serif';

    constructor(acceptsFonts: boolean) {
        this._acceptsFonts = acceptsFonts;
    }

    static set characterWidthEm(characterWidthEm: number) {
        MeasurementContextFake._characterWidthEm = characterWidthEm;
    }

    get font(): string {
        return this._font;
    }

    set font(font: string) {
        if (this._acceptsFonts) {
            this._font = font;
        }
    }

    measureText(text: string): TextMetrics {
        return { width: Array.from(text).length * MeasurementContextFake._characterWidthEm * MEASUREMENT_REFERENCE_PIXELS } as TextMetrics;
    }
}

class OffscreenCanvasFake {
    private static _acceptsFonts: boolean = true;
    private static _contexts: MeasurementContextFake[] = [];

    constructor(width: number, height: number) {}

    static set acceptsFonts(acceptsFonts: boolean) {
        OffscreenCanvasFake._acceptsFonts = acceptsFonts;
    }

    static get contexts(): MeasurementContextFake[] {
        return OffscreenCanvasFake._contexts;
    }

    getContext(contextType: string): MeasurementContextFake | null {
        const context: MeasurementContextFake | null = contextType === '2d' ? new MeasurementContextFake(OffscreenCanvasFake._acceptsFonts) : null;

        if (context) {
            OffscreenCanvasFake._contexts.push(context);
        }

        return context;
    }

    static reset(): void {
        OffscreenCanvasFake._acceptsFonts = true;
        OffscreenCanvasFake._contexts = [];
        MeasurementContextFake.characterWidthEm = MEASURED_CHARACTER_WIDTH_EM;
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

function cornerArc(distance: number): number {
    const offset: number = LENS_FRAME_RADIUS_PIXELS - Math.max(0, distance);

    return distance >= LENS_FRAME_RADIUS_PIXELS ? 0 : LENS_FRAME_RADIUS_PIXELS - Math.sqrt(LENS_FRAME_RADIUS_PIXELS * LENS_FRAME_RADIUS_PIXELS - offset * offset);
}

function createDomRect(width: number, height: number): DOMRect {
    return {
        bottom: height,
        height: height,
        left: 0,
        right: width,
        toJSON: (): Record<string, number> => ({ height: height, width: width }),
        top: 0,
        width: width,
        x: 0,
        y: 0,
    };
}

function createItem(changes: Partial<OverlayItem> = {}): OverlayItem {
    const anchorRect: NormalizedRect = changes.anchorRect ?? { height: 0.05, width: 0.5, x: 0.1, y: 0.5 };

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
        originalText: 'Fresh tomato soup',
        regionId: 'region-1',
        showOriginal: false,
        sourceLanguage: 'en',
        stabilityScore: 0.5,
        status: OverlayStatus.TRANSLATED,
        textVersion: 1,
        translatedText: 'Sopa de tomate fresca',
        ...changes,
    };
}

function lineCountHeight(lines: number, fontSize: number): number {
    return lines * fontSize * 1.2 + 2;
}

function measuredWidth(text: string, fontSize: number, characterWidthEm: number = MEASURED_CHARACTER_WIDTH_EM): number {
    return Array.from(text).length * characterWidthEm * fontSize * MEASUREMENT_SLACK + BALLOON_HORIZONTAL_PADDING_PIXELS * 2;
}

function renderedHeights(heights: Record<string, number>): void {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement): number {
        return heights[this.getAttribute(REGION_ID_ATTRIBUTE) ?? EMPTY] ?? 0;
    });
}

describe('OverlayLayerComponent', () => {
    let component: OverlayLayerComponent;
    let element: HTMLElement;
    let fixture: ComponentFixture<OverlayLayerComponent>;
    let originalOffscreenCanvas: PropertyDescriptor | undefined;
    let originalResizeObserver: PropertyDescriptor | undefined;
    let view: Window & typeof globalThis;

    function balloon(regionId: string): HTMLButtonElement {
        return element.querySelector<HTMLButtonElement>(`button[data-region-id="${regionId}"]`) as HTMLButtonElement;
    }

    function balloonText(regionId: string): HTMLElement {
        return element.querySelector<HTMLElement>(`button[data-region-id="${regionId}"] .lens-balloon-text`) as HTMLElement;
    }

    function balloons(): HTMLButtonElement[] {
        return Array.from(element.querySelectorAll<HTMLButtonElement>('button.lens-balloon'));
    }

    function componentStyles(): string {
        return Array.from(document.querySelectorAll<HTMLStyleElement>('style'))
            .map((style: HTMLStyleElement) => style.textContent ?? EMPTY)
            .filter((styles: string) => styles.includes('.lens-balloon'))
            .join(EMPTY)
            .replace(/\s+/g, EMPTY);
    }

    function expectApart(firstRegionId: string, secondRegionId: string): void {
        const first: FrameExtent = extentOf(firstRegionId);
        const second: FrameExtent = extentOf(secondRegionId);
        const horizontalGap: number = Math.max(second.left - first.right, first.left - second.right);
        const verticalGap: number = Math.max(second.top - first.bottom, first.top - second.bottom);

        expect(Math.max(horizontalGap, verticalGap)).toBeGreaterThanOrEqual(COLLISION_GAP_PIXELS - 0.01);
    }

    function expectClearOfCorners(regionId: string): void {
        const extent: FrameExtent = extentOf(regionId);
        const depth: number = Math.min(extent.top, FRAME_HEIGHT_PIXELS - extent.bottom);
        const clearance: number = Math.min(extent.left, FRAME_WIDTH_PIXELS - extent.right) - FRAME_MARGIN_PIXELS;

        expect(clearance).toBeGreaterThanOrEqual(cornerArc(depth) - 0.01);
    }

    function expectInsideFrame(regionId: string, width: number = FRAME_WIDTH_PIXELS, height: number = FRAME_HEIGHT_PIXELS): void {
        const extent: FrameExtent = extentOf(regionId);

        expect(extent.left).toBeGreaterThanOrEqual(FRAME_MARGIN_PIXELS - 0.01);
        expect(extent.top).toBeGreaterThanOrEqual(FRAME_MARGIN_PIXELS - 0.01);
        expect(extent.right).toBeLessThanOrEqual(width - FRAME_MARGIN_PIXELS + 0.01);
        expect(extent.bottom).toBeLessThanOrEqual(height - FRAME_MARGIN_PIXELS + 0.01);
    }

    function expectPlacement(regionId: string, expected: Partial<RenderedPlacement>): void {
        const rendered: RenderedPlacement = placementOf(regionId);

        (Object.keys(expected) as (keyof RenderedPlacement)[]).forEach((key: keyof RenderedPlacement) => {
            expect({ [key]: rendered[key] }).toEqual({ [key]: expect.closeTo(expected[key] as number, PIXEL_PRECISION) });
        });
    }

    function extentOf(regionId: string): FrameExtent {
        const placement: RenderedPlacement = placementOf(regionId);
        const radians: number = (placement.rotation * Math.PI) / 180;
        const halfHeight: number = placement.minHeight / 2;
        const pivotY: number = placement.top + halfHeight;
        const corners: { x: number; y: number }[] = [
            { x: 0, y: -halfHeight },
            { x: 0, y: halfHeight },
            { x: placement.width, y: -halfHeight },
            { x: placement.width, y: halfHeight },
        ].map((corner: { x: number; y: number }) => ({
            x: placement.left + corner.x * Math.cos(radians) - corner.y * Math.sin(radians),
            y: pivotY + corner.x * Math.sin(radians) + corner.y * Math.cos(radians),
        }));

        return {
            bottom: Math.max(...corners.map((corner: { x: number; y: number }) => corner.y)),
            left: Math.min(...corners.map((corner: { x: number; y: number }) => corner.x)),
            right: Math.max(...corners.map((corner: { x: number; y: number }) => corner.x)),
            top: Math.min(...corners.map((corner: { x: number; y: number }) => corner.y)),
        };
    }

    function hostSize(width: number, height: number): void {
        vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(createDomRect(width, height));
    }

    function order(): (string | null)[] {
        return balloons().map((button: HTMLButtonElement) => button.getAttribute('data-region-id'));
    }

    function placementOf(regionId: string): RenderedPlacement {
        const style: CSSStyleDeclaration = balloon(regionId).style;
        const rotation: RegExpMatchArray | null = style.transform.match(ROTATION_PATTERN);

        return {
            fontSize: parseFloat(style.fontSize),
            left: parseFloat(style.left),
            minHeight: parseFloat(style.minHeight),
            rotation: rotation ? parseFloat(rotation[1]) : 0,
            top: parseFloat(style.top),
            width: parseFloat(style.width),
        };
    }

    function removeTextMeasurement(): void {
        Reflect.deleteProperty(view, OFFSCREEN_CANVAS_PROPERTY);
    }

    function render(items: OverlayItem[], fontScale: number = 1): void {
        fixture.componentRef.setInput('items', items);
        fixture.componentRef.setInput('fontScale', fontScale);
        fixture.detectChanges();
    }

    it('should keep all short menu labels on one line in narrow source boxes', () => {
        const labels = ['Cardápio', 'Entradas', 'Especiais', 'Acompanhamentos', 'Bebidas', 'Saquê', 'Cervejas', 'Sobremesas', 'Refrigerantes'];
        const items = labels.map((translatedText, index) => createItem({
            regionId: `menu-${index}`, translatedText,
            anchorRect: { x: 0.08 + (index % 3) * 0.3, y: 0.1 + Math.floor(index / 3) * 0.25, width: 0.14, height: 0.045 },
        }));
        hostSize(360, 450);
        render(items);
        expect(component.readingMode).toBe(false);
        items.forEach(item => {
            const placement = placementOf(item.regionId);
            expect(placement.width).toBeGreaterThanOrEqual(measuredWidth(item.translatedText, placement.fontSize) - 0.01);
            expect(placement.minHeight).toBeCloseTo(Math.max(450 * 0.045, lineCountHeight(1, placement.fontSize)), 2);
        });
        expect(componentStyles()).toContain('white-space:nowrap');
    });

    it('should correct underestimated glyph widths using the rendered single line', async () => {
        const item = createItem({ translatedText: 'Refrigerantes' });
        render([item]);
        const initial = placementOf(item.regionId).width;
        vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement): number {
            return this.classList.contains('lens-balloon-text') ? 220 : 0;
        });
        render([{ ...item }]);
        await settle();
        expect(placementOf(item.regionId).width).toBeGreaterThan(initial);
        expect(placementOf(item.regionId).width).toBeGreaterThanOrEqual(228);
    });

    it('should switch dense translations to a scrollable document without losing paragraphs', () => {
        const items = Array.from({ length: 20 }, (_, index) => createItem({
            regionId: `dense-${index}`,
            anchorRect: { x: 0.05, y: index / 22, width: 0.9, height: 0.04 },
            orientedWidth: 0.9,
            orientedHeight: 0.04,
            translatedText: `Parágrafo ${index}: ${LONG_TRANSLATION}`,
        }));
        render(items);
        expect(component.readingMode).toBe(true);
        const paragraphs = element.querySelectorAll<HTMLButtonElement>('.lens-reading-paragraph');
        expect(paragraphs.length).toBe(items.length);
        expect(paragraphs[19].textContent).toContain(items[19].translatedText);
        expect(element.querySelectorAll('.lens-balloon').length).toBe(0);
        vi.spyOn(component.balloonToggled, 'emit');
        paragraphs[0].click();
        expect(component.balloonToggled.emit).toHaveBeenCalledWith('dense-0');
    });

    it('should return to positioned balloons when the scene becomes sparse', () => {
        render(Array.from({ length: 20 }, (_, index) => createItem({
            regionId: `dense-${index}`, translatedText: LONG_TRANSLATION,
            anchorRect: { x: 0.05, y: index / 22, width: 0.9, height: 0.04 },
        })));
        expect(component.readingMode).toBe(true);
        render([createItem()]);
        expect(component.readingMode).toBe(false);
        expect(element.querySelector('.lens-reading-panel')).toBeNull();
        expect(balloons().length).toBe(1);
    });

    async function settle(): Promise<void> {
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
    }

    function resizeObserver(): ResizeObserverFake {
        return ResizeObserverFake.instances[ResizeObserverFake.instances.length - 1];
    }

    function restoreProperty(name: string, descriptor: PropertyDescriptor | undefined): void {
        if (descriptor) {
            Object.defineProperty(view, name, descriptor);
        } else {
            Reflect.deleteProperty(view, name);
        }
    }

    beforeEach(async () => {
        view = document.defaultView as Window & typeof globalThis;
        originalOffscreenCanvas = Object.getOwnPropertyDescriptor(view, OFFSCREEN_CANVAS_PROPERTY);
        originalResizeObserver = Object.getOwnPropertyDescriptor(view, RESIZE_OBSERVER_PROPERTY);
        Object.defineProperty(view, RESIZE_OBSERVER_PROPERTY, { configurable: true, value: ResizeObserverFake, writable: true });
        Object.defineProperty(view, OFFSCREEN_CANVAS_PROPERTY, { configurable: true, value: OffscreenCanvasFake, writable: true });
        OffscreenCanvasFake.reset();
        ResizeObserverFake.reset();

        await TestBed.configureTestingModule({
            imports: [TranslatePipe],
            declarations: [OverlayLayerComponent],
            providers: [provideTranslateService()],
            schemas: [CUSTOM_ELEMENTS_SCHEMA],
        }).compileComponents();

        fixture = TestBed.createComponent(OverlayLayerComponent);
        component = fixture.componentInstance;
        element = fixture.nativeElement as HTMLElement;
        element.style.fontFamily = MEASURED_FONT_FAMILY;
        fixture.componentRef.setInput('targetLanguage', 'pt');
        hostSize(FRAME_WIDTH_PIXELS, FRAME_HEIGHT_PIXELS);
    });

    afterEach(() => {
        fixture.destroy();
        vi.restoreAllMocks();
        restoreProperty(OFFSCREEN_CANVAS_PROPERTY, originalOffscreenCanvas);
        restoreProperty(RESIZE_OBSERVER_PROPERTY, originalResizeObserver);
        Reflect.deleteProperty(document, FONTS_PROPERTY);
    });

    it('should create', () => {
        render([]);

        expect(component).toBeTruthy();
        expect(balloons().length).toBe(0);
    });

    it('should read the regions line by line by default', () => {
        expect(component.granularity()).toBe(RegionGranularity.LINE);
    });

    it('should cover the whole camera frame it is placed in above the camera preview without catching taps outside the balloons', () => {
        const hostClasses: string[] = ['position-absolute', 'top-0', 'start-0', 'w-100', 'h-100', 'overflow-hidden', 'pe-none', 'z-0'];

        render([createItem()]);

        expect(hostClasses.filter((hostClass: string) => !element.classList.contains(hostClass))).toEqual([]);
        expect(balloons()[0].classList.contains('position-absolute')).toBe(true);
        expect(balloons()[0].classList.contains('pe-auto')).toBe(true);
        expect(balloons()[0].getAttribute('type')).toBe('button');
    });

    it('should render only the balloons that carry a real translation', () => {
        const hiddenStatuses: OverlayStatus[] = [
            OverlayStatus.DETECTING
        ,   OverlayStatus.ERROR
        ,   OverlayStatus.MODEL_MISSING
        ,   OverlayStatus.UNDETERMINED
        ];

        render([
            ...hiddenStatuses.map((status: OverlayStatus, index: number) => createItem({ regionId: `hidden-${index}`, status: status })),
            createItem({ regionId: 'reading', status: OverlayStatus.READING, translatedText: EMPTY }),
            createItem({ regionId: 'translating', status: OverlayStatus.TRANSLATING, translatedText: EMPTY }),
            createItem({ regionId: 'translated' }),
            createItem({ regionId: 'empty', translatedText: EMPTY }),
            createItem({ regionId: 'blank', translatedText: '   ' }),
            createItem({ originalText: 'Pizza', regionId: 'identical', translatedText: 'Pizza' }),
            createItem({ originalText: 'Menu', regionId: 'case-only', translatedText: 'menu' }),
        ]);

        expect(order()).toEqual(['translated']);
    });

    it('should keep the previous translation of a corrected text on screen while it is translated again', () => {
        render([
            createItem({ firstSeenAt: 1000, regionId: 'translating', sourceLanguage: null, status: OverlayStatus.TRANSLATING }),
            createItem({ firstSeenAt: 2000, regionId: 'reading', sourceLanguage: null, status: OverlayStatus.READING }),
            createItem({ firstSeenAt: 3000, regionId: 'new', sourceLanguage: null, status: OverlayStatus.TRANSLATING, translatedText: EMPTY }),
        ]);

        expect(order()).toEqual(['translating', 'reading']);
        expect(balloon('translating').textContent?.trim()).toBe('Sopa de tomate fresca');
        expect(balloon('translating').classList.contains('pe-auto')).toBe(true);
        expect(balloon('translating').classList.contains('opacity-0')).toBe(false);
    });

    it('should hide the text that is already written in the target language', () => {
        render([
            createItem({ regionId: 'region-1', sourceLanguage: 'pt' }),
            createItem({ regionId: 'region-2', sourceLanguage: 'en' }),
            createItem({ regionId: 'region-3', sourceLanguage: null }),
        ]);

        expect(order()).toEqual(['region-2', 'region-3']);
    });

    it('should keep the width and position of the source text when the translation is shorter', () => {
        const item: OverlayItem = createItem({ anchorRect: { height: 0.05, width: 0.5, x: 0.1, y: 0.5 }, translatedText: 'Sopa' });

        render([item]);

        expectPlacement('region-1', { fontSize: 20, left: 40, minHeight: 26, top: 249.5, width: 200 });
        expect(component.placementFor(item)).toEqual({
            fontSize: 20,
            left: 40,
            minHeight: expect.closeTo(26, PIXEL_PRECISION),
            rotation: 0,
            top: expect.closeTo(249.5, PIXEL_PRECISION),
            width: 200,
        } as BalloonPlacement);
    });

    it('should grow a longer translation to the right up to its measured width without shrinking it', () => {
        render([createItem({ anchorRect: { height: 0.05, width: 0.25, x: 0.1, y: 0.5 }, originalText: 'Roast beef', translatedText: 'Carne assada' })]);

        expectPlacement('region-1', { fontSize: 20, left: 40, width: measuredWidth('Carne assada', 20) });
        expect(placementOf('region-1').width).toBeCloseTo(137.6, PIXEL_PRECISION);
        expect(balloonText('region-1').textContent).toBe('Carne assada');
    });

    it('should slide a translation that reaches the frame edge to the left instead of cutting it', () => {
        render([createItem({ anchorRect: { height: 0.05, width: 0.2, x: 0.75, y: 0.5 }, originalText: 'Roast beef', translatedText: 'Carne assada' })]);

        const placement: RenderedPlacement = placementOf('region-1');

        expectPlacement('region-1', { fontSize: 20, width: measuredWidth('Carne assada', 20) });
        expect(placement.left).toBeLessThan(300);
        expect(placement.left + placement.width).toBeCloseTo(FRAME_WIDTH_PIXELS - FRAME_MARGIN_PIXELS, PIXEL_PRECISION);
        expectInsideFrame('region-1');
    });

    it('should stop growing before the next balloon on the same row', () => {
        render([
            createItem({ anchorRect: { height: 0.05, width: 0.2, x: 0.1, y: 0.5 }, originalText: 'Grilled chicken', regionId: 'dish', translatedText: 'Frango grelhado' }),
            createItem({ anchorRect: { height: 0.05, width: 0.2, x: 0.5, y: 0.5 }, originalText: 'Soup', regionId: 'price', translatedText: 'Sopa' }),
        ]);

        const dish: RenderedPlacement = placementOf('dish');

        expectPlacement('dish', { fontSize: 20, width: measuredWidth('Frango grelhado', 20) });
        expect(dish.left + dish.width).toBeCloseTo(200 - NEIGHBOR_GAP_PIXELS, PIXEL_PRECISION);
        expect(dish.left).toBeGreaterThanOrEqual(FRAME_MARGIN_PIXELS);
        expectPlacement('price', { left: 200, width: 80 });
    });

    it('should not let balloons on other rows limit the growth', () => {
        render([
            createItem({ anchorRect: { height: 0.05, width: 0.2, x: 0.1, y: 0.5 }, originalText: 'Grilled chicken', regionId: 'dish', translatedText: 'Frango grelhado' }),
            createItem({ anchorRect: { height: 0.05, width: 0.2, x: 0.5, y: 0.7 }, originalText: 'Soup', regionId: 'below', translatedText: 'Sopa' }),
        ]);

        expectPlacement('dish', { fontSize: 20, left: 40, width: measuredWidth('Frango grelhado', 20) });
        expect(placementOf('dish').left + placementOf('dish').width).toBeGreaterThan(200);
    });

    it('should never let two growing balloons on the same row cover each other', () => {
        render([
            createItem({ anchorRect: { height: 0.05, width: 0.2, x: 0.1, y: 0.5 }, originalText: 'Grilled chicken', regionId: 'first', translatedText: 'Frango grelhado' }),
            createItem({ anchorRect: { height: 0.05, width: 0.3, x: 0.6, y: 0.5 }, originalText: 'Red onion cream', regionId: 'second', translatedText: 'Creme de cebola roxa' }),
        ]);

        const first: RenderedPlacement = placementOf('first');
        const second: RenderedPlacement = placementOf('second');

        expectPlacement('first', { fontSize: 20, left: 40, width: measuredWidth('Frango grelhado', 20) });
        expectPlacement('second', { fontSize: 16, width: measuredWidth('Creme de cebola roxa', 16) });
        expect(second.left).toBeGreaterThanOrEqual(first.left + first.width + NEIGHBOR_GAP_PIXELS - 0.01);
        expectInsideFrame('second');
    });

    it('should expand and shrink long translations to keep a single line', () => {
        render([
            createItem({ anchorRect: { height: 0.05, width: 0.3, x: 0.1, y: 0.3 }, regionId: 'dish', translatedText: LONG_TRANSLATION }),
            createItem({ anchorRect: { height: 0.05, width: 0.2, x: 0.6, y: 0.3 }, originalText: 'Soup', regionId: 'price', translatedText: 'Sopa' }),
        ]);
        const placement = placementOf('dish');
        expect(component.readingMode).toBe(false);
        expect(placement.fontSize).toBeGreaterThanOrEqual(12);
        expect(placement.width).toBeGreaterThanOrEqual(measuredWidth(LONG_TRANSLATION, placement.fontSize));
        expect(placement.minHeight).toBe(25);
        expectInsideFrame('dish');
    });

    it('should show a line too long for twelve pixels in a horizontally scrollable panel', () => {
        const translation = LONG_TRANSLATION + ' ' + LONG_TRANSLATION;
        render([createItem({ translatedText: translation })]);
        expect(component.readingMode).toBe(true);
        expect(element.querySelector('.lens-reading-paragraph')?.textContent?.trim()).toBe(translation);
        expect(balloons().length).toBe(0);
        expect(componentStyles()).toContain('white-space:nowrap');
        expect(componentStyles()).toContain('overflow:auto');
    });

    it('should shrink a single very long word towards twelve pixels instead of splitting it', () => {
        render([createItem({ anchorRect: { height: 0.05, width: 0.3, x: 0.1, y: 0.3 }, originalText: 'Pneumonoultramicroscopic', translatedText: LONG_WORD })]);

        expectPlacement('region-1', { fontSize: 15, minHeight: 25, width: measuredWidth(LONG_WORD, 15) });
        expect(balloonText('region-1').textContent).toBe(LONG_WORD);
        expectInsideFrame('region-1');
    });

    it('should preserve a word wider than the screen without breaking or truncating it', () => {
        const word = LONG_WORD + LONG_WORD;
        render([createItem({ translatedText: word })]);
        expect(component.readingMode).toBe(true);
        expect(element.querySelector('.lens-reading-paragraph')?.textContent?.trim()).toBe(word);
        expect(componentStyles()).not.toContain('overflow-wrap:break-word');
    });

    it('should never split a word to squeeze a balloon between close neighbours on a dense row', () => {
        render([
            createItem({ anchorRect: { height: 0.03, width: 0.12, x: 0.05, y: 0.5 }, originalText: 'LASAGNA BOLOGNESE', regionId: 'dish', translatedText: 'LASANHA À BOLONHESA' }),
            createItem({ anchorRect: { height: 0.03, width: 0.1, x: 0.15, y: 0.5 }, originalText: 'Price', regionId: 'price', translatedText: 'Preço' }),
        ]);

        expectPlacement('dish', { fontSize: 12, minHeight: lineCountHeight(1, 12), width: measuredWidth('LASANHA À BOLONHESA', 12) });
        expect(placementOf('dish').width).toBeGreaterThanOrEqual(measuredWidth('BOLONHESA', 12));
        expectApart('dish', 'price');
        expectInsideFrame('dish');
        expectInsideFrame('price');
    });

    it('should never truncate, clamp, clip or fix the height of any balloon', () => {
        const items: OverlayItem[] = [
            createItem({ anchorRect: { height: 0.05, width: 0.25, x: 0.1, y: 0.1 }, regionId: 'grown', translatedText: 'Carne assada' }),
            createItem({ anchorRect: { height: 0.05, width: 0.2, x: 0.75, y: 0.2 }, regionId: 'edge', translatedText: 'Suco de laranja natural' }),
            createItem({ anchorRect: { height: 0.05, width: 0.3, x: 0.1, y: 0.3 }, regionId: 'wrapped', translatedText: LONG_TRANSLATION }),
            createItem({ anchorRect: { height: 0.05, width: 0.2, x: 0.6, y: 0.3 }, regionId: 'neighbor', translatedText: 'Salada' }),
            createItem({ anchorRect: { height: 0.05, width: 0.3, x: 0.1, y: 0.5 }, regionId: 'word', translatedText: LONG_WORD }),
            createItem({ anchorRect: { height: 0.016, width: 0.1, x: 0.1, y: 0.7 }, regionId: 'tiny', translatedText: 'LASANHA À BOLONHESA' }),
            createItem({ anchorRect: { height: 0.1, width: 0.4, x: 0.5, y: 0.8 }, orientation: 8, orientedHeight: 0.04, orientedWidth: 0.35, regionId: 'tilted', translatedText: LONG_TRANSLATION }),
        ];

        render(items);

        const styles: string = componentStyles();
        const balloonRule: string = styles.match(/\.lens-balloon\[[^\]]+\]\{[^}]*\}/)?.[0] ?? EMPTY;
        const textRule: string = styles.match(/\.lens-balloon-text\[[^\]]+\]\{[^}]*\}/)?.[0] ?? EMPTY;

        expect(balloons().length).toBe(items.length);
        items.forEach((item: OverlayItem) => {
            const button: HTMLButtonElement = balloon(item.regionId);
            const text: HTMLElement = balloonText(item.regionId);

            [button, text].forEach((rendered: HTMLElement) => {
                expect(Array.from(rendered.classList).filter((name: string) => TRUNCATING_CLASS_PATTERN.test(name))).toEqual([]);
                expect([rendered.style.height, rendered.style.maxHeight, rendered.style.maxWidth, rendered.style.overflow, rendered.style.textOverflow, rendered.style.whiteSpace]).toEqual([EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY]);
                expect(rendered.style.getPropertyValue('-webkit-line-clamp')).toBe(EMPTY);
                expect(rendered.style.getPropertyValue('--lens-balloon-lines')).toBe(EMPTY);
            });
            expect(text.textContent).toBe(item.translatedText);
            expect(placementOf(item.regionId).fontSize).toBeGreaterThanOrEqual(12);
            expectInsideFrame(item.regionId);
        });
        expect(balloonRule).toContain('overflow:visible');
        expect(balloonRule).toContain('height:auto');
        expect(textRule).toContain('white-space:nowrap');
        expect(textRule).toContain('overflow-wrap:normal');
        ['line-clamp', 'text-overflow', 'ellipsis', 'overflow:hidden', 'max-height', 'max-width'].forEach((forbidden: string) => {
            expect(balloonRule + textRule).not.toContain(forbidden);
        });
    });

    it('should hide the source text behind an opaque dark glass with a small radius', () => {
        render([createItem()]);

        const balloonRule: string = componentStyles().match(/\.lens-balloon\[[^\]]+\]\{[^}]*\}/)?.[0] ?? EMPTY;

        expect(balloonRule).toContain('background:rgba(15,23,42,0.92)');
        expect(balloonRule).toContain('backdrop-filter:blur(2px)');
        expect(balloonRule).toContain('border-radius:4px');
        expect(balloonRule).toContain('border:0');
        expect(balloonRule).toContain('box-sizing:border-box');
        expect(balloonRule).toContain('padding:1px4px');
        expect(balloonRule).not.toContain('margin');
    });

    it('should not turn balloons over upright text', () => {
        const item: OverlayItem = createItem({ orientation: 1 });

        render([item]);

        expect(balloons()[0].style.transform).toBe(EMPTY);
        expect(component.balloonTransform(component.placementFor(item))).toBeNull();
    });

    it.each([90, -90, 180])('should render horizontal readable text for a source angle of %s degrees', (orientation) => {
        render([createItem({ orientation, translatedText: 'Tudo acontece por um motivo.' })]);
        expect(balloons()[0].style.transform).toBe(EMPTY);
        expect(placementOf('region-1').rotation).toBe(0);
        expect(balloonText('region-1').textContent).toBe('Tudo acontece por um motivo.');
        expectInsideFrame('region-1');
    });

    it('should keep a translation horizontal even when the source is tilted', () => {
        const radians: number = 0;

        render([
            createItem({
                anchorRect: { height: 0.1, width: 0.5, x: 0.2, y: 0.4 },
                orientation: 6,
                orientedHeight: 0.04,
                orientedWidth: 0.48,
                translatedText: 'Sopa',
            }),
        ]);

        expect(balloons()[0].style.transform).toBe(EMPTY);
        expect(componentStyles()).toMatch(/\.lens-balloon\[[^\]]+\]\{[^}]*transform-origin:050%/);
        expectPlacement('region-1', {
            fontSize: 16,
            left: 180 - 96 * Math.cos(radians),
            minHeight: lineCountHeight(1, 16),
            rotation: 0,
            top: 225 - 96 * Math.sin(radians) - lineCountHeight(1, 16) / 2,
            width: 192,
        });
    });

    it('should keep a tilted balloon that grows near the frame edge inside the frame', () => {
        render([
            createItem({
                anchorRect: { height: 0.1, width: 0.3, x: 0.6, y: 0.4 },
                orientation: 6,
                orientedHeight: 0.04,
                orientedWidth: 0.28,
                originalText: 'Roast beef',
                translatedText: 'Carne assada na brasa',
            }),
        ]);

        expectPlacement('region-1', { fontSize: 16, rotation: 0, width: measuredWidth('Carne assada na brasa', 16) });
        expect(extentOf('region-1').right).toBeCloseTo(FRAME_WIDTH_PIXELS - FRAME_MARGIN_PIXELS, PIXEL_PRECISION);
        expectInsideFrame('region-1');
    });

    it('should keep an oversized tilted translation intact in the reading panel', () => {
        const text = [LONG_TRANSLATION, LONG_TRANSLATION, LONG_TRANSLATION].join(' ');
        render([createItem({ orientation: 20, translatedText: text })]);
        expect(component.readingMode).toBe(true);
        expect(element.querySelector('.lens-reading-paragraph')?.textContent?.trim()).toBe(text);
    });

    it('should keep a tilted balloon whose text runs upwards inside the top of the frame', () => {
        render([
            createItem({
                anchorRect: { height: 0.1, width: 0.5, x: 0.1, y: 0.01 },
                orientation: -10,
                orientedHeight: 0.04,
                orientedWidth: 0.45,
                translatedText: LONG_TRANSLATION,
            }),
        ]);

        expect(placementOf('region-1').rotation).toBe(0);
        expectInsideFrame('region-1');
    });

    it('should keep a single line near the bottom inside the rounded frame', () => {
        render([createItem({ anchorRect: { height: 0.03, width: 0.5, x: 0.1, y: 0.96 }, translatedText: LONG_TRANSLATION })]);
        expect(component.readingMode).toBe(false);
        expect(placementOf('region-1').minHeight).toBeCloseTo(lineCountHeight(1, 12), 2);
        expectInsideFrame('region-1');
        expectClearOfCorners('region-1');
    });

    it('should inset a balloon in a frame corner by the rounded corner arc', () => {
        render([
            createItem({ anchorRect: { height: 0.03, width: 0.3, x: 0, y: 0 }, regionId: 'top-left', translatedText: 'Sopa' }),
            createItem({ anchorRect: { height: 0.03, width: 0.3, x: 0.7, y: 0.97 }, regionId: 'bottom-right', translatedText: 'Sopa' }),
        ]);

        const inset: number = FRAME_MARGIN_PIXELS + cornerArc(FRAME_MARGIN_PIXELS);

        expectPlacement('top-left', { left: inset, top: FRAME_MARGIN_PIXELS, width: 120 });
        expect(extentOf('bottom-right').right).toBeCloseTo(FRAME_WIDTH_PIXELS - inset, PIXEL_PRECISION);
        ['top-left', 'bottom-right'].forEach((regionId: string) => {
            expectInsideFrame(regionId);
            expectClearOfCorners(regionId);
        });
    });

    it('should move a full width single line out of the rounded corners', () => {
        render([createItem({ anchorRect: { height: 0.03, width: 1, x: 0, y: 0.9 }, translatedText: LONG_TRANSLATION })]);
        expectPlacement('region-1', { left: FRAME_MARGIN_PIXELS, width: FRAME_WIDTH_PIXELS - FRAME_MARGIN_PIXELS * 2 });
        expectClearOfCorners('region-1');
    });

    it('should separate two overlapping single line translations', () => {
        render([
            createItem({ anchorRect: { height: 0.03, width: 0.5, x: 0.1, y: 0.3 }, regionId: 'first', translatedText: LONG_TRANSLATION }),
            createItem({ anchorRect: { height: 0.03, width: 0.3, x: 0.1, y: 0.32 }, regionId: 'next', translatedText: 'Sopa' }),
        ]);
        expectApart('first', 'next');
        expectInsideFrame('first');
        expectInsideFrame('next');
    });

    it('should lift a stack of balloons that would leave the bottom of the frame as one block', () => {
        const regionIds: string[] = ['row-0', 'row-1', 'row-2'];

        render(regionIds.map((regionId: string, index: number) => createItem({
            anchorRect: { height: 0.03, width: 0.5, x: 0.1, y: 0.94 + index * 0.02 },
            regionId: regionId,
            translatedText: LONG_TRANSLATION,
        })));

        const placements: RenderedPlacement[] = regionIds.map((regionId: string) => placementOf(regionId));

        expect(placements[0].top).toBeLessThan(470);
        expect(placements[1].top).toBeCloseTo(placements[0].top + placements[0].minHeight + COLLISION_GAP_PIXELS, PIXEL_PRECISION);
        expect(placements[2].top).toBeCloseTo(placements[1].top + placements[1].minHeight + COLLISION_GAP_PIXELS, PIXEL_PRECISION);
        expectApart('row-0', 'row-2');
        regionIds.forEach((regionId: string) => {
            expectInsideFrame(regionId);
            expectClearOfCorners(regionId);
        });
    });

    it('should let a fading balloon keep its place without pushing or limiting the others', () => {
        const dish: OverlayItem = createItem({ anchorRect: { height: 0.05, width: 0.2, x: 0.1, y: 0.5 }, originalText: 'Grilled chicken', regionId: 'dish', translatedText: 'Frango grelhado' });
        const price: OverlayItem = createItem({ anchorRect: { height: 0.05, width: 0.2, x: 0.5, y: 0.5 }, originalText: 'Soup', regionId: 'price', translatedText: 'Sopa' });

        render([dish, price]);

        const before: RenderedPlacement = placementOf('dish');

        render([
            { ...dish, status: OverlayStatus.EXPIRING },
            price,
            createItem({ anchorRect: { height: 0.05, width: 0.2, x: 0.1, y: 0.52 }, originalText: 'Tomato', regionId: 'below', translatedText: 'Sopa de tomate' }),
        ]);

        expectPlacement('dish', { left: before.left, top: before.top, width: before.width });
        expectPlacement('below', { top: 259.5, width: measuredWidth('Sopa de tomate', 20) });
        expectPlacement('price', { left: 200, top: 249.5, width: 80 });
    });

    it('should stop a tilted balloon before the next balloon on its row', () => {
        render([
            createItem({
                anchorRect: { height: 0.08, width: 0.3, x: 0.1, y: 0.5 },
                orientation: 5,
                orientedHeight: 0.04,
                orientedWidth: 0.28,
                originalText: 'Roast beef',
                regionId: 'tilted',
                translatedText: 'Carne assada na brasa',
            }),
            createItem({ anchorRect: { height: 0.05, width: 0.2, x: 0.5, y: 0.5 }, originalText: 'Soup', regionId: 'price', translatedText: 'Sopa' }),
        ]);

        expect(placementOf('tilted').rotation).toBe(0);
        expect(extentOf('tilted').right).toBeLessThanOrEqual(extentOf('price').left - NEIGHBOR_GAP_PIXELS + 0.01);
        expectPlacement('price', { left: 200, top: 249.5, width: 80 });
        expectInsideFrame('tilted');
    });

    it('should stop a balloon before the rotated extent of a tilted neighbour', () => {
        render([
            createItem({ anchorRect: { height: 0.05, width: 0.2, x: 0.1, y: 0.5 }, originalText: 'Grilled chicken', regionId: 'dish', translatedText: 'Frango grelhado' }),
            createItem({
                anchorRect: { height: 0.08, width: 0.3, x: 0.5, y: 0.49 },
                orientation: -6,
                orientedHeight: 0.04,
                orientedWidth: 0.28,
                originalText: 'Soup',
                regionId: 'tilted',
                translatedText: 'Sopa',
            }),
        ]);

        expectPlacement('dish', { fontSize: 20, width: measuredWidth('Frango grelhado', 20) });
        expect(extentOf('dish').right).toBeLessThanOrEqual(extentOf('tilted').left - NEIGHBOR_GAP_PIXELS + 0.01);
        expectApart('dish', 'tilted');
    });

    it('should keep a balloon that renders taller than predicted inside the frame and clear of the next one', async () => {
        renderedHeights({ above: 60 });
        render([
            createItem({ anchorRect: { height: 0.05, width: 0.5, x: 0.1, y: 0.82 }, regionId: 'above', translatedText: 'Sopa' }),
            createItem({ anchorRect: { height: 0.05, width: 0.5, x: 0.1, y: 0.9 }, regionId: 'below', translatedText: 'Sopa' }),
        ]);
        await settle();

        expectPlacement('above', { minHeight: 26, top: 408 });
        expectPlacement('below', { minHeight: 26, top: 470 });

        await settle();

        expectPlacement('above', { top: 408 });
        expectPlacement('below', { top: 470 });
    });

    it('should forget a taller rendered height once the balloon renders at its predicted height again', async () => {
        const items: OverlayItem[] = [
            createItem({ anchorRect: { height: 0.05, width: 0.5, x: 0.1, y: 0.82 }, regionId: 'above', translatedText: 'Sopa' }),
            createItem({ anchorRect: { height: 0.05, width: 0.5, x: 0.1, y: 0.9 }, regionId: 'below', translatedText: 'Sopa' }),
        ];

        renderedHeights({ above: 60 });
        render(items);
        await settle();
        vi.restoreAllMocks();
        hostSize(FRAME_WIDTH_PIXELS, FRAME_HEIGHT_PIXELS);
        renderedHeights({ above: 26, below: 26 });
        render([...items]);
        await settle();

        expectPlacement('above', { top: 409.5 });
        expectPlacement('below', { top: 449.5 });
    });

    it('should measure the text again once the web fonts have loaded', async () => {
        const item: OverlayItem = createItem({ anchorRect: { height: 0.05, width: 0.25, x: 0.1, y: 0.1 }, translatedText: 'Frango frito' });
        let fontsLoaded: () => void = () => undefined;
        const ready: Promise<void> = new Promise<void>((resolve: () => void) => {
            fontsLoaded = resolve;
        });

        Object.defineProperty(document, FONTS_PROPERTY, { configurable: true, value: { ready: ready } });
        render([item]);
        MeasurementContextFake.characterWidthEm = 0.6;
        render([{ ...item }]);

        expectPlacement('region-1', { width: measuredWidth('Frango frito', 20) });

        fontsLoaded();
        await ready;
        fixture.detectChanges();

        expectPlacement('region-1', { width: measuredWidth('Frango frito', 20, 0.6) });
    });

    it('should keep a balloon near the top of the frame inside it', () => {
        render([createItem({ anchorRect: { height: 0.02, width: 0.5, x: 0.1, y: 0 }, translatedText: 'Sopa' })]);

        expectPlacement('region-1', { top: FRAME_MARGIN_PIXELS });
        expectInsideFrame('region-1');
    });

    it('should scale the font with the preferred font scale kept between 0.8 and 1.6', () => {
        const expectations: [number, number][] = [[0.8, 16], [1, 20], [1.25, 25], [1.6, 32], [0.5, 16], [3, 32], [Number.NaN, 20]];

        expectations.forEach(([fontScale, fontSize]: [number, number]) => {
            render([createItem({ translatedText: 'Sopa' })], fontScale);

            expectPlacement('region-1', { fontSize: fontSize, minHeight: Math.max(25, lineCountHeight(1, fontSize)), width: 200 });
        });
    });

    it('should keep the readable font floor without wrapping small text', () => {
        render([createItem({ anchorRect: { height: 0.03, width: 0.2, x: 0.1, y: 0.5 }, translatedText: 'Aperitivos' })], 0.8);
        expectPlacement('region-1', { fontSize: 12 });
        expect(placementOf('region-1').width).toBeGreaterThanOrEqual(measuredWidth('Aperitivos', 12));
        expect(componentStyles()).toContain('white-space:nowrap');
    });

    it('should size a paragraph by the height of each of its source lines', () => {
        fixture.componentRef.setInput('granularity', RegionGranularity.BLOCK);
        render([
            createItem({ anchorRect: { height: 0.12, width: 0.5, x: 0.1, y: 0.1 }, originalText: 'Grilled chicken\nwith rice\nand salad', regionId: 'written', translatedText: 'Sopa' }),
            createItem({ anchorRect: { height: 0.08, width: 0.5, x: 0.1, y: 0.6 }, originalText: 'Fresh tomato soup with basil and homemade toast', regionId: 'estimated', translatedText: 'Sopa' }),
            createItem({ anchorRect: { height: 0.05, width: 0.5, x: 0.1, y: 0.4 }, originalText: 'Fresh tomato soup', regionId: 'single', translatedText: 'Sopa' }),
        ]);

        expectPlacement('written', { fontSize: 16 });
        expectPlacement('estimated', { fontSize: 16 });
        expectPlacement('single', { fontSize: 18 });
        expect(placementOf('written').minHeight).toBeCloseTo(lineCountHeight(1, 16), 2);
    });

    it('should animate only the position and opacity of a balloon so its text never re-wraps while it moves', () => {
        render([createItem()]);

        const transition: string = componentStyles().match(/\.lens-balloon\[[^\]]+\]\{[^}]*?transition:([^;}]*)/)?.[1] ?? EMPTY;

        expect(transition.split(',').map((property: string) => property.replace(/\d.*$/, EMPTY))).toEqual(['left', 'top', 'transform', 'opacity']);
    });

    it('should base the font on the line height between twelve pixels and the granularity maximum', () => {
        render([
            createItem({ anchorRect: { height: 0.1, width: 0.5, x: 0.1, y: 0.1 }, regionId: 'tall', translatedText: 'Sopa' }),
            createItem({ anchorRect: { height: 0.01, width: 0.5, x: 0.1, y: 0.5 }, regionId: 'tiny', translatedText: 'Sopa' }),
        ]);

        expectPlacement('tall', { fontSize: 24 });
        expectPlacement('tiny', { fontSize: 12, minHeight: lineCountHeight(1, 12) });

        fixture.componentRef.setInput('granularity', RegionGranularity.BLOCK);
        fixture.detectChanges();

        expectPlacement('tall', { fontSize: 18 });
        expectPlacement('tiny', { fontSize: 12 });
    });

    it('should measure the displayed text once with the balloon font', () => {
        render([createItem({ anchorRect: { height: 0.05, width: 0.25, x: 0.1, y: 0.1 }, translatedText: 'Frango frito' })]);
        render([createItem({ anchorRect: { height: 0.05, width: 0.25, x: 0.1, y: 0.1 }, translatedText: 'Frango frito' }), createItem({ regionId: 'region-2', translatedText: 'Sopa' })]);

        expect(OffscreenCanvasFake.contexts.length).toBe(1);
        expect(OffscreenCanvasFake.contexts[0].font).toBe(`500 100px ${MEASURED_FONT_FAMILY}`);
        expectPlacement('region-1', { fontSize: 20, width: measuredWidth('Frango frito', 20) });
    });

    it('should estimate a generous width when the browser cannot measure text', () => {
        removeTextMeasurement();
        render([
            createItem({ anchorRect: { height: 0.05, width: 0.25, x: 0.1, y: 0.1 }, regionId: 'mixed', translatedText: 'Carne assada' }),
            createItem({ anchorRect: { height: 0.05, width: 0.25, x: 0.1, y: 0.3 }, regionId: 'capitals', translatedText: 'CARNE ASSADA' }),
        ]);

        expectPlacement('mixed', { fontSize: 20, left: 40, width: (0.75 + 11 * 0.6) * 20 * MEASUREMENT_SLACK + BALLOON_HORIZONTAL_PADDING_PIXELS * 2 });
        expectPlacement('capitals', { fontSize: 20, left: 40, width: (11 * 0.75 + 0.6) * 20 * MEASUREMENT_SLACK + BALLOON_HORIZONTAL_PADDING_PIXELS * 2 });
        expect(OffscreenCanvasFake.contexts.length).toBe(0);
    });

    it('should estimate the width when the canvas rejects the balloon font', () => {
        OffscreenCanvasFake.acceptsFonts = false;
        render([createItem({ anchorRect: { height: 0.05, width: 0.25, x: 0.1, y: 0.1 }, translatedText: 'Carne assada' })]);

        expect(OffscreenCanvasFake.contexts.length).toBe(1);
        expectPlacement('region-1', { width: (0.75 + 11 * 0.6) * 20 * MEASUREMENT_SLACK + BALLOON_HORIZONTAL_PADDING_PIXELS * 2 });
    });

    it('should fit the balloon to the original text while the original is shown', () => {
        const item: OverlayItem = createItem({ originalText: 'Roast beef with fries and salad', translatedText: 'Rosbife' });

        render([item]);

        expectPlacement('region-1', { left: 40, width: 200 });

        render([{ ...item, showOriginal: true }]);

        expectPlacement('region-1', { left: 40, width: measuredWidth('Roast beef with fries and salad', 20) });
        expect(balloonText('region-1').textContent).toBe('Roast beef with fries and salad');
    });

    it('should follow the size of the camera frame it covers', () => {
        render([createItem({ translatedText: 'Sopa' })]);

        expect(resizeObserver().targets).toEqual([element]);
        expectPlacement('region-1', { fontSize: 20, left: 40, width: 200 });

        hostSize(200, 250);
        resizeObserver().notify();
        fixture.detectChanges();

        expectPlacement('region-1', { fontSize: 12, left: 20, width: 100 });
    });

    it('should use a phone sized frame until the frame has been measured', () => {
        hostSize(0, 0);
        render([createItem({ translatedText: 'Sopa' })]);

        expectPlacement('region-1', { fontSize: 18, left: 36, width: 180 });
    });

    it('should stop following the frame size when destroyed', () => {
        render([createItem()]);

        const observer: ResizeObserverFake = resizeObserver();

        fixture.destroy();

        expect(observer.disconnected).toBe(true);
    });

    it('should render without following the frame when ResizeObserver is not available', () => {
        Reflect.deleteProperty(view, RESIZE_OBSERVER_PROPERTY);
        render([createItem({ translatedText: 'Sopa' })]);

        expect(ResizeObserverFake.instances.length).toBe(0);
        expectPlacement('region-1', { fontSize: 20, left: 40, width: 200 });
    });

    it('should render the translated text alone without status icons or pending indicators', () => {
        render([createItem()]);

        const button: HTMLButtonElement = balloons()[0];

        expect(button.textContent?.trim()).toBe('Sopa de tomate fresca');
        expect(button.querySelector('ion-icon')).toBeNull();
        expect(button.querySelector('.lens-balloon-indicator')).toBeNull();
        expect(button.querySelector('span[hidden]')).toBeNull();
        expect(button.hasAttribute('aria-label')).toBe(false);
    });

    it('should swap to the original text with a subtle amber underline and a pressed state when showOriginal is set', () => {
        render([createItem({ showOriginal: true })]);

        const button: HTMLButtonElement = balloons()[0];

        expect(button.textContent?.trim()).toBe('Fresh tomato soup');
        expect(button.classList.contains('lens-balloon-original')).toBe(true);
        expect(button.getAttribute('aria-pressed')).toBe('true');
        expect(componentStyles()).toContain('.lens-balloon-original[_ngcontent');
        expect(componentStyles()).toContain('box-shadow:inset0-2px0var(--lens-amber)');
    });

    it('should mark a balloon showing its translation as not pressed', () => {
        render([createItem()]);

        expect(balloons()[0].getAttribute('aria-pressed')).toBe('false');
        expect(balloons()[0].classList.contains('lens-balloon-original')).toBe(false);
    });

    it('should describe every balloon with the same hidden hint outside the balloons', async () => {
        const translateService: TranslateService = TestBed.inject(TranslateService);

        translateService.setTranslation('en', { camera: { balloon: { showOriginal: 'Show original text' } } });
        await firstValueFrom(translateService.use('en'));
        render([createItem({ regionId: 'region-1' }), createItem({ regionId: 'region-2', showOriginal: true })]);

        const hint: HTMLElement | null = element.querySelector<HTMLElement>(`#${component.showOriginalHintId}`);

        expect(balloons().map((button: HTMLButtonElement) => button.getAttribute('aria-describedby'))).toEqual(['lens-balloon-show-original', 'lens-balloon-show-original']);
        expect(hint?.textContent?.trim()).toBe('Show original text');
        expect(hint?.hidden).toBe(true);
        expect(element.querySelectorAll('span[hidden]').length).toBe(1);
    });

    it('should emit balloonToggled with the region id on click', () => {
        const toggled: Mock<(regionId: string) => void> = vi.fn<(regionId: string) => void>();

        component.balloonToggled.subscribe(toggled);
        render([createItem({ regionId: 'region-7' })]);
        balloons()[0].click();

        expect(toggled).toHaveBeenCalledExactlyOnceWith('region-7');
    });

    it('should fade out an expiring translation, take it out of the tab order and ignore taps on it', () => {
        const toggled: Mock<(regionId: string) => void> = vi.fn<(regionId: string) => void>();

        component.balloonToggled.subscribe(toggled);
        render([createItem({ status: OverlayStatus.EXPIRING })]);

        const button: HTMLButtonElement = balloons()[0];

        button.click();

        expect(button.classList.contains('opacity-0')).toBe(true);
        expect(button.classList.contains('pe-auto')).toBe(false);
        expect(button.getAttribute('aria-hidden')).toBe('true');
        expect(button.getAttribute('tabindex')).toBe('-1');
        expect(button.hasAttribute('aria-describedby')).toBe(false);
        expect(component.isExpiring(createItem({ status: OverlayStatus.EXPIRING }))).toBe(true);
        expect(toggled).not.toHaveBeenCalled();
    });

    it('should not fade in an expiring item that never had a translation', () => {
        render([createItem({ status: OverlayStatus.EXPIRING, translatedText: EMPTY })]);

        expect(balloons().length).toBe(0);
    });

    it('should mark the language and direction of the displayed text', () => {
        fixture.componentRef.setInput('targetLanguage', 'ar');
        render([
            createItem({ regionId: 'region-1', translatedText: 'حساء الطماطم' }),
            createItem({ anchorRect: { height: 0.05, width: 0.2, x: 0.1, y: 0.1 }, regionId: 'region-2', showOriginal: true, sourceLanguage: 'es' }),
        ]);

        expect(balloonText('region-1').getAttribute('lang')).toBe('ar');
        expect(balloonText('region-1').getAttribute('dir')).toBe('auto');
        expect(balloonText('region-2').getAttribute('lang')).toBe('es');
    });

    it('should fall back to the configured source language for an original text whose language is unknown', () => {
        fixture.componentRef.setInput('sourceLanguage', 'fr');
        render([
            createItem({ regionId: 'region-1', showOriginal: true, sourceLanguage: null }),
            createItem({ anchorRect: { height: 0.05, width: 0.2, x: 0.1, y: 0.1 }, regionId: 'region-2', showOriginal: true, sourceLanguage: UNDETERMINED_LANGUAGE }),
        ]);

        expect(balloonText('region-1').getAttribute('lang')).toBe('fr');
        expect(balloonText('region-2').getAttribute('lang')).toBe('fr');
    });

    it('should omit the language of an original text that is unknown while the source is detected automatically', () => {
        fixture.componentRef.setInput('sourceLanguage', AUTO_LANGUAGE);
        render([createItem({ showOriginal: true, sourceLanguage: null })]);

        expect(balloonText('region-1').hasAttribute('lang')).toBe(false);
    });

    it('should not set a language on the translation when no target is provided', () => {
        fixture.componentRef.setInput('targetLanguage', EMPTY);
        render([createItem()]);

        expect(balloonText('region-1').hasAttribute('lang')).toBe(false);
    });

    it('should keep a stable DOM order based on appearance', () => {
        render([
            createItem({ firstSeenAt: 2000, regionId: 'region-10', anchorRect: { height: 0.05, width: 0.2, x: 0.1, y: 0.1 } }),
            createItem({ firstSeenAt: 1000, regionId: 'region-2', anchorRect: { height: 0.05, width: 0.2, x: 0.1, y: 0.6 } }),
            createItem({ firstSeenAt: 2000, regionId: 'region-9', anchorRect: { height: 0.05, width: 0.2, x: 0.6, y: 0.3 } }),
        ]);

        expect(order()).toEqual(['region-2', 'region-9', 'region-10']);
        expect(component.balloons.map((item: OverlayItem) => component.trackByRegionId(0, item))).toEqual(['region-2', 'region-9', 'region-10']);
    });

    it('should follow the on-screen reading order while frozen and restore the appearance order when unfrozen', () => {
        const items: OverlayItem[] = [
            createItem({ firstSeenAt: 1000, regionId: 'region-1', anchorRect: { height: 0.05, width: 0.2, x: 0.1, y: 0.6 } }),
            createItem({ firstSeenAt: 2000, regionId: 'region-2', anchorRect: { height: 0.05, width: 0.2, x: 0.6, y: 0.1 } }),
            createItem({ firstSeenAt: 3000, regionId: 'region-3', anchorRect: { height: 0.05, width: 0.2, x: 0.1, y: 0.11 } }),
            createItem({ firstSeenAt: 4000, regionId: 'region-4', anchorRect: { height: 0.05, width: 0.2, x: 0.4, y: 0.3 } }),
        ];

        fixture.componentRef.setInput('frozen', true);
        render(items);

        expect(order()).toEqual(['region-3', 'region-2', 'region-4', 'region-1']);

        fixture.componentRef.setInput('frozen', false);
        render(items);

        expect(order()).toEqual(['region-1', 'region-2', 'region-3', 'region-4']);
    });

    it('should draw debug outlines for every recognized region only when showDebug is enabled', () => {
        const items: OverlayItem[] = [createItem(), createItem({ regionId: 'region-2', status: OverlayStatus.READING, translatedText: EMPTY })];

        render(items);
        expect(element.querySelectorAll('.lens-debug-region').length).toBe(0);

        fixture.componentRef.setInput('showDebug', true);
        render(items);

        const outlines: NodeListOf<HTMLElement> = element.querySelectorAll<HTMLElement>('.lens-debug-region');

        expect(outlines.length).toBe(2);
        expect(outlines[0].getAttribute('aria-hidden')).toBe('true');
        expect(outlines[0].style.left).toBe('10%');
        expect(outlines[0].style.top).toBe('50%');
        expect(outlines[0].style.width).toBe('50%');
        expect(outlines[0].style.height).toBe('5%');
    });

    it('should raise the layer above the frame panels while a balloon has keyboard focus', () => {
        render([createItem()]);

        expect(componentStyles()).toContain(':has(.lens-balloon:focus-visible){z-index:1!important');
    });
});
