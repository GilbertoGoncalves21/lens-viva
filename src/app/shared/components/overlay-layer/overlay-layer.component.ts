import { DOCUMENT } from '@angular/common';
import {
    AfterRenderRef
,   ChangeDetectionStrategy
,   ChangeDetectorRef
,   Component
,   ElementRef
,   Inject
,   Injector
,   InputSignal
,   OnDestroy
,   OnInit
,   OutputEmitterRef
,   Signal
,   WritableSignal
,   afterEveryRender
,   computed
,   input
,   linkedSignal
,   output
,   signal
} from '@angular/core';
import { OverlayItem, OverlayStatus, RegionGranularity, ViewportSize } from 'src/app/shared/models';
import {
    AUTO_LANGUAGE
,   DEFAULT_BALLOON_FONT_SCALE
,   EMPTY
,   GeometryUtils
,   LENS_FRAME_RADIUS_PIXELS
,   TextUtils
,   UNDETERMINED_LANGUAGE
} from 'src/app/shared/utils';

interface BalloonExtent {
    bottom: number;
    left: number;
    right: number;
    top: number;
}

interface BalloonFit {
    fontSize: number;
    lines: number;
    width: number;
}

interface BalloonGeometry {
    centerY: number;
    cosine: number;
    extent: BalloonExtent;
    height: number;
    item: OverlayItem;
    left: number;
    rotation: number;
    sine: number;
    width: number;
}

interface HorizontalBounds {
    maximumRight: number;
    minimumLeft: number;
}

interface LaidOutBalloon {
    extent: BalloonExtent;
    height: number;
    placement: BalloonPlacement;
    regionId: string;
    verticalBounds: VerticalBounds;
}

interface LayoutSource {
    fontScale: number;
    fontsVersion: number;
    granularity: RegionGranularity;
    hostSize: ViewportSize;
    items: OverlayItem[];
    measuredHeights: Map<string, number>;
}

interface PlacementAttempt {
    bounds: HorizontalBounds;
    fontSizes: number[];
}

interface PreviousLayout {
    source: LayoutSource;
    value: Map<string, LaidOutBalloon>;
}

interface VerticalBounds {
    maximumBottom: number;
    minimumTop: number;
}

export interface BalloonPlacement {
    fontSize: number;
    left: number;
    minHeight: number;
    rotation: number;
    top: number;
    width: number;
}

const BALLOON_HORIZONTAL_PADDING_PIXELS: number = 4;

const BALLOON_SELECTOR: string = 'button[data-region-id]';

const BALLOON_VERTICAL_PADDING_PIXELS: number = 1;

const BASE_FONT_RATIO: number = 0.8;

const BLOCK_MAX_FONT_SIZE_PIXELS: number = 18;

const COLLISION_GAP_PIXELS: number = 2;

const COLLISION_TOLERANCE_PIXELS: number = 0.01;

const DISPLAYED_STATUSES: OverlayStatus[] = [OverlayStatus.EXPIRING, OverlayStatus.READING, OverlayStatus.TRANSLATED, OverlayStatus.TRANSLATING];

const FALLBACK_HOST_SIZE: ViewportSize = { height: 450, width: 360 };

const FONT_SIZE_PRECISION: number = 10;

const FONT_SIZE_STEP: number = 0.5;

const FRAME_MARGIN_PIXELS: number = 4;

const HALF_TURN_DEGREES: number = 180;

const HEIGHT_MEASUREMENT_TOLERANCE_PIXELS: number = 1;

const LINE_BREAK: RegExp = /\r?\n/u;

const LINE_HEIGHT: number = 1.2;

const LINE_MAX_FONT_SIZE_PIXELS: number = 24;

const MAX_FONT_SCALE: number = 1.6;

const MEASUREMENT_FONT_WEIGHT: number = 500;

const MEASUREMENT_REFERENCE_PIXELS: number = 100;

const MEASUREMENT_SLACK: number = 1.08;

const MIN_FONT_SCALE: number = 0.8;

const MIN_READABLE_FONT_SIZE_PIXELS: number = 12;

const NARROW_CHARACTER_WIDTH_EM: number = 0.6;

const NEGLIGIBLE_PROJECTION: number = 0.000001;

const NEIGHBOR_GAP_PIXELS: number = 4;

const READING_ROW_TOLERANCE: number = 0.02;

const REGION_ID_ATTRIBUTE: string = 'data-region-id';

const ROTATION_THRESHOLD_DEGREES: number = 1.5;

const ROW_OVERLAP_RATIO: number = 0.4;

const SHOW_ORIGINAL_HINT_ID: string = 'lens-balloon-show-original';

const SHRINK_FLOOR_RATIO: number = 0.8;

const WIDE_CHARACTER_PATTERN: RegExp = /[\p{Lu}\p{Nd}MWmw]/u;

const WIDE_CHARACTER_WIDTH_EM: number = 0.75;

const WIDTH_CACHE_LIMIT: number = 512;

@Component({
    selector: 'app-overlay-layer',
    templateUrl: './overlay-layer.component.html',
    styleUrls: ['./overlay-layer.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false,
    host: { class: 'position-absolute top-0 start-0 w-100 h-100 overflow-hidden pe-none z-0' },
})
export class OverlayLayerComponent implements OnDestroy, OnInit {
    private _afterRenderRef: AfterRenderRef | null = null;
    private _balloons: Signal<OverlayItem[]> = computed(() => {
        const displayed: OverlayItem[] = this.items()
            .filter((item: OverlayItem) => this.isDisplayed(item))
            .sort((first: OverlayItem, second: OverlayItem) => this.compareByAppearance(first, second));

        return this.frozen() ? this.sortByReadingOrder(displayed) : displayed;
    });
    private _destroyed: boolean = false;
    private _fontFamily: string = EMPTY;
    private _fontsVersion: WritableSignal<number> = signal<number>(0);
    private _hostSize: WritableSignal<ViewportSize> = signal<ViewportSize>(FALLBACK_HOST_SIZE);
    private _layout: Signal<Map<string, LaidOutBalloon>> = linkedSignal<LayoutSource, Map<string, LaidOutBalloon>>({
        source: () => this.layoutSource(),
        computation: (source: LayoutSource, previous?: PreviousLayout) => this.layOut(source, previous),
    });
    private _measuredHeights: WritableSignal<Map<string, number>> = signal<Map<string, number>>(new Map<string, number>());
    private _measurementContext: OffscreenCanvasRenderingContext2D | null = null;
    private _measurementResolved: boolean = false;
    private _resizeObserver: ResizeObserver | null = null;
    private _widthCache: Map<string, number> = new Map<string, number>();

    readonly balloonToggled: OutputEmitterRef<string> = output<string>();
    readonly fontScale: InputSignal<number> = input<number>(DEFAULT_BALLOON_FONT_SCALE);
    readonly frozen: InputSignal<boolean> = input<boolean>(false);
    readonly granularity: InputSignal<RegionGranularity> = input<RegionGranularity>(RegionGranularity.LINE);
    readonly items: InputSignal<OverlayItem[]> = input<OverlayItem[]>([]);
    readonly showDebug: InputSignal<boolean> = input<boolean>(false);
    readonly sourceLanguage: InputSignal<string> = input<string>(EMPTY);
    readonly targetLanguage: InputSignal<string> = input<string>(EMPTY);

    constructor(
        private changeDetectorRef: ChangeDetectorRef,
        @Inject(DOCUMENT) private document: Document,
        private elementRef: ElementRef<HTMLElement>,
        private injector: Injector,
    ) {}

    get balloons(): OverlayItem[] {
        return this._balloons();
    }

    get readingItems(): OverlayItem[] {
        return this.sortByReadingOrder(this._balloons().filter((item: OverlayItem) => !this.isExpiring(item)));
    }

    private _readingMode: Signal<boolean> = computed(() => {
        const layout: LaidOutBalloon[] = [...this._layout().values()]
            .filter((balloon: LaidOutBalloon) => this._balloons().some((item: OverlayItem) => item.regionId === balloon.regionId && !this.isExpiring(item)));
        const size: ViewportSize = this._hostSize();
        const area: number = layout.reduce((sum: number, balloon: LaidOutBalloon) =>
            sum + (balloon.extent.right - balloon.extent.left) * (balloon.extent.bottom - balloon.extent.top), 0);

        const tooWide: boolean = this._balloons().some((item: OverlayItem) => {
            const placement: BalloonPlacement | undefined = this._layout().get(item.regionId)?.placement;
            return !this.isExpiring(item) && placement !== undefined
                && this.textWidth(this.displayedText(item), placement.fontSize) + BALLOON_HORIZONTAL_PADDING_PIXELS * 2 > placement.width + 1;
        });

        return tooWide || area > size.width * size.height * 0.7 || layout.some((balloon: LaidOutBalloon, index: number) =>
            balloon.extent.bottom > size.height || layout.slice(index + 1).some((other: LaidOutBalloon) =>
                balloon.extent.left < other.extent.right - 1 && other.extent.left < balloon.extent.right - 1
                && balloon.extent.top < other.extent.bottom - 1 && other.extent.top < balloon.extent.bottom - 1));
    });

    get readingMode(): boolean {
        return this._readingMode();
    }

    get readingFontSize(): number {
        return 16 * this.normalizedScale();
    }

    get showOriginalHintId(): string {
        return SHOW_ORIGINAL_HINT_ID;
    }

    ngOnDestroy(): void {
        this._destroyed = true;
        this._afterRenderRef?.destroy();
        this._afterRenderRef = null;
        this._resizeObserver?.disconnect();
        this._resizeObserver = null;
    }

    ngOnInit(): void {
        this.measureHost();
        this.followFontLoading();
        this._afterRenderRef = afterEveryRender({ read: () => this.measureBalloons() }, { injector: this.injector });

        const view: (Window & typeof globalThis) | null = this.document.defaultView;

        if (!view || typeof view.ResizeObserver !== 'function') {
            return;
        }

        this._resizeObserver = new view.ResizeObserver(() => this.measureHost());
        this._resizeObserver.observe(this.elementRef.nativeElement);
    }

    balloonTransform(placement: BalloonPlacement): string | null {
        return placement.rotation !== 0 ? `rotate(${placement.rotation}deg)` : null;
    }

    displayedLanguage(item: OverlayItem): string | null {
        if (item.showOriginal) {
            return this.originalLanguage(item);
        }

        return this.targetLanguage() !== EMPTY ? this.targetLanguage() : null;
    }

    displayedText(item: OverlayItem): string {
        return item.showOriginal ? item.originalText : item.translatedText;
    }

    isExpiring(item: OverlayItem): boolean {
        return item.status === OverlayStatus.EXPIRING;
    }

    placementFor(item: OverlayItem): BalloonPlacement {
        const hostSize: ViewportSize = this._hostSize();
        const laidOut: LaidOutBalloon | undefined = this._layout().get(item.regionId);

        return laidOut ? laidOut.placement : this.place(this.geometryOf(item, hostSize), [], new Map<string, LaidOutBalloon>(), hostSize).placement;
    }

    toggle(item: OverlayItem): void {
        if (this.isExpiring(item)) {
            return;
        }

        this.balloonToggled.emit(item.regionId);
    }

    trackByRegionId(index: number, item: OverlayItem): string {
        return item.regionId;
    }

    private aboveFloor(balloon: LaidOutBalloon, below: LaidOutBalloon[]): LaidOutBalloon {
        const floor: number = below
            .filter((other: LaidOutBalloon) => this.overlapsHorizontally(other.extent, balloon.extent))
            .reduce((limit: number, other: LaidOutBalloon) => Math.min(limit, other.extent.top - COLLISION_GAP_PIXELS), balloon.verticalBounds.maximumBottom);
        const lift: number = Math.min(
            Math.max(0, balloon.extent.bottom - floor),
            Math.max(0, balloon.extent.top - balloon.verticalBounds.minimumTop),
        );

        return lift > 0 ? this.shiftedBalloon(balloon, -lift) : balloon;
    }

    private availableWidth(geometry: BalloonGeometry, bounds: HorizontalBounds, hostSize: ViewportSize, balloonHeight: number): number {
        const horizontalSpace: number = bounds.maximumRight - bounds.minimumLeft - balloonHeight * Math.abs(geometry.sine);
        const verticalSpace: number = hostSize.height - FRAME_MARGIN_PIXELS * 2 - balloonHeight * Math.abs(geometry.cosine);

        return Math.min(this.lengthAlong(horizontalSpace, geometry.cosine), this.lengthAlong(verticalSpace, geometry.sine));
    }

    private balloonHeight(geometry: BalloonGeometry, fontSize: number, lines: number): number {
        const sourceHeight: number = this.granularity() === RegionGranularity.BLOCK ? 0 : geometry.height;
        return Math.max(sourceHeight, lines * fontSize * LINE_HEIGHT + BALLOON_VERTICAL_PADDING_PIXELS * 2);
    }

    private baseFontSize(geometry: BalloonGeometry): number {
        const block: boolean = this.granularity() === RegionGranularity.BLOCK;
        const maximum: number = block ? BLOCK_MAX_FONT_SIZE_PIXELS : LINE_MAX_FONT_SIZE_PIXELS;
        const lineHeight: number = block ? geometry.height / this.sourceLineCount(geometry) : geometry.height;
        const fromHeight: number = GeometryUtils.clamp(lineHeight * BASE_FONT_RATIO, MIN_READABLE_FONT_SIZE_PIXELS, maximum);

        return this.roundedFontSize(GeometryUtils.clamp(fromHeight * this.normalizedScale(), MIN_READABLE_FONT_SIZE_PIXELS, maximum * MAX_FONT_SCALE));
    }

    private belowBlockers(balloon: LaidOutBalloon, settled: LaidOutBalloon[]): LaidOutBalloon {
        const blocker: LaidOutBalloon | undefined = settled.find((other: LaidOutBalloon) => this.collides(other.extent, balloon.extent));

        return blocker
            ? this.belowBlockers(this.shiftedBalloon(balloon, blocker.extent.bottom + COLLISION_GAP_PIXELS - balloon.extent.top), settled)
            : balloon;
    }

    private candidateFontSizes(baseFontSize: number, shrinkFloor: number): number[] {
        const steps: number = Math.max(0, Math.ceil((baseFontSize - shrinkFloor) / FONT_SIZE_STEP));

        return Array.from({ length: steps + 1 }, (value: unknown, index: number) =>
            Math.max(shrinkFloor, Math.round((baseFontSize - index * FONT_SIZE_STEP) * FONT_SIZE_PRECISION) / FONT_SIZE_PRECISION),
        );
    }

    private collides(first: BalloonExtent, second: BalloonExtent): boolean {
        return this.overlapsHorizontally(first, second)
            && first.top < second.bottom + COLLISION_GAP_PIXELS - COLLISION_TOLERANCE_PIXELS
            && second.top < first.bottom + COLLISION_GAP_PIXELS - COLLISION_TOLERANCE_PIXELS;
    }

    private compareByAppearance(first: OverlayItem, second: OverlayItem): number {
        return first.firstSeenAt - second.firstSeenAt || first.regionId.localeCompare(second.regionId, undefined, { numeric: true });
    }

    private cornerArc(distance: number): number {
        if (distance >= LENS_FRAME_RADIUS_PIXELS) {
            return 0;
        }

        const offset: number = LENS_FRAME_RADIUS_PIXELS - Math.max(0, distance);

        return LENS_FRAME_RADIUS_PIXELS - Math.sqrt(LENS_FRAME_RADIUS_PIXELS * LENS_FRAME_RADIUS_PIXELS - offset * offset);
    }

    private createMeasurementContext(): OffscreenCanvasRenderingContext2D | null {
        const view: (Window & typeof globalThis) | null = this.document.defaultView;

        if (!view || typeof view.OffscreenCanvas !== 'function') {
            return null;
        }

        return new view.OffscreenCanvas(1, 1).getContext('2d');
    }

    private estimatedWidthEm(text: string): number {
        return Array.from(text).reduce(
            (total: number, character: string) => total + (WIDE_CHARACTER_PATTERN.test(character) ? WIDE_CHARACTER_WIDTH_EM : NARROW_CHARACTER_WIDTH_EM),
            0,
        );
    }

    private extentAt(pivotX: number, pivotY: number, width: number, height: number, cosine: number, sine: number): BalloonExtent {
        const acrossX: number = (height / 2) * Math.abs(sine);
        const acrossY: number = (height / 2) * Math.abs(cosine);

        return {
            bottom: pivotY + Math.max(0, width * sine) + acrossY,
            left: pivotX + Math.min(0, width * cosine) - acrossX,
            right: pivotX + Math.max(0, width * cosine) + acrossX,
            top: pivotY + Math.min(0, width * sine) - acrossY,
        };
    }

    private fit(geometry: BalloonGeometry, bounds: HorizontalBounds, hostSize: ViewportSize, text: string, fontSizes: number[]): BalloonFit | null {
        for (const fontSize of fontSizes) {
            const room: number = this.availableWidth(geometry, bounds, hostSize, this.balloonHeight(geometry, fontSize, 1));
            const needed: number = this.textWidth(text, fontSize) + BALLOON_HORIZONTAL_PADDING_PIXELS * 2;

            if (needed <= room) {
                return { fontSize: fontSize, lines: 1, width: Math.min(room, Math.max(geometry.width, needed)) };
            }
        }

        return null;
    }

    private fitInsideFrame(geometry: BalloonGeometry, bounds: HorizontalBounds, hostSize: ViewportSize, fit: BalloonFit): LaidOutBalloon {
        const minHeight: number = this.balloonHeight(geometry, fit.fontSize, fit.lines);
        const height: number = Math.max(minHeight, this._measuredHeights().get(geometry.item.regionId) ?? 0);
        const top: number = geometry.centerY - this.balloonHeight(geometry, fit.fontSize, 1) / 2;
        const free: BalloonExtent = this.extentAt(geometry.left, top + height / 2, fit.width, height, geometry.cosine, geometry.sine);
        const horizontalShift: number = this.shiftWithin(free.left, free.right, bounds.minimumLeft, bounds.maximumRight);
        const verticalBounds: VerticalBounds = this.verticalBounds(free.left + horizontalShift, free.right + horizontalShift, hostSize);
        const verticalShift: number = this.shiftWithin(free.top, free.bottom, verticalBounds.minimumTop, verticalBounds.maximumBottom);

        return {
            extent: this.shiftedExtent(free, horizontalShift, verticalShift),
            height: height,
            placement: {
                fontSize: fit.fontSize,
                left: geometry.left + horizontalShift,
                minHeight: minHeight,
                rotation: geometry.rotation,
                top: top + verticalShift,
                width: fit.width,
            },
            regionId: geometry.item.regionId,
            verticalBounds: verticalBounds,
        };
    }

    private followFontLoading(): void {
        const fonts: FontFaceSet | undefined = this.document.fonts;

        fonts?.ready?.then(() => this.refreshTextMeasurement());
    }

    private frameBounds(geometry: BalloonGeometry, hostSize: ViewportSize): HorizontalBounds {
        const depth: number = Math.max(FRAME_MARGIN_PIXELS, Math.min(geometry.extent.top, hostSize.height - geometry.extent.bottom));
        const inset: number = FRAME_MARGIN_PIXELS + this.cornerArc(depth);

        return { maximumRight: hostSize.width - inset, minimumLeft: inset };
    }

    private geometryOf(item: OverlayItem, hostSize: ViewportSize): BalloonGeometry {
        const rotation: number = Math.abs(item.orientation) < ROTATION_THRESHOLD_DEGREES ? 0 : item.orientation;
        const radians: number = (rotation * Math.PI) / HALF_TURN_DEGREES;
        const cosine: number = Math.cos(radians);
        const sine: number = Math.sin(radians);
        const width: number = Math.max(1, item.orientedWidth * hostSize.width);
        const height: number = Math.max(1, item.orientedHeight * hostSize.height);
        const centerX: number = (item.anchorRect.x + item.anchorRect.width / 2) * hostSize.width;
        const centerY: number = (item.anchorRect.y + item.anchorRect.height / 2) * hostSize.height;
        const left: number = centerX - (width / 2) * cosine;
        const pivotY: number = centerY - (width / 2) * sine;

        return {
            centerY: pivotY,
            cosine: cosine,
            extent: this.extentAt(left, pivotY, width, height, cosine, sine),
            height: height,
            item: item,
            left: left,
            rotation: rotation,
            sine: sine,
            width: width,
        };
    }

    private hasTranslation(item: OverlayItem): boolean {
        return item.translatedText.trim() !== EMPTY
            && TextUtils.toComparable(item.translatedText) !== TextUtils.toComparable(item.originalText);
    }

    private horizontalBounds(
        geometry: BalloonGeometry,
        all: BalloonGeometry[],
        placed: Map<string, LaidOutBalloon>,
        frameBounds: HorizontalBounds,
    ): HorizontalBounds {
        const middle: number = (geometry.extent.left + geometry.extent.right) / 2;
        let maximumRight: number = frameBounds.maximumRight;
        let minimumLeft: number = frameBounds.minimumLeft;

        all.filter((other: BalloonGeometry) => other !== geometry && this.sharesRow(geometry, other))
            .forEach((other: BalloonGeometry) => {
                if (other.extent.left >= middle) {
                    maximumRight = Math.min(maximumRight, other.extent.left - NEIGHBOR_GAP_PIXELS);
                } else if (other.extent.right <= middle) {
                    minimumLeft = Math.max(minimumLeft, this.occupiedRight(other, placed) + NEIGHBOR_GAP_PIXELS);
                }
            });

        return {
            maximumRight: Math.max(maximumRight, Math.min(geometry.extent.right, frameBounds.maximumRight)),
            minimumLeft: Math.min(minimumLeft, Math.max(geometry.extent.left, frameBounds.minimumLeft)),
        };
    }

    private isDisplayed(item: OverlayItem): boolean {
        return DISPLAYED_STATUSES.includes(item.status) && this.hasTranslation(item) && !this.isTargetLanguage(item);
    }

    private isTargetLanguage(item: OverlayItem): boolean {
        return item.sourceLanguage !== null && item.sourceLanguage === this.targetLanguage();
    }

    private layOut(source: LayoutSource, previous: PreviousLayout | undefined): Map<string, LaidOutBalloon> {
        const hostSize: ViewportSize = source.hostSize;
        const geometries: BalloonGeometry[] = source.items.map((item: OverlayItem) => this.geometryOf(item, hostSize));
        const active: BalloonGeometry[] = geometries.filter((geometry: BalloonGeometry) => !this.isExpiring(geometry.item));
        const kept: Map<string, LaidOutBalloon> = previous !== undefined && previous.source.hostSize === hostSize
            ? previous.value
            : new Map<string, LaidOutBalloon>();
        const placed: Map<string, LaidOutBalloon> = new Map<string, LaidOutBalloon>();

        [...active]
            .sort((first: BalloonGeometry, second: BalloonGeometry) => first.extent.left - second.extent.left || first.extent.top - second.extent.top)
            .forEach((geometry: BalloonGeometry) => placed.set(geometry.item.regionId, this.place(geometry, active, placed, hostSize)));

        const laidOut: Map<string, LaidOutBalloon> = new Map<string, LaidOutBalloon>(
            this.separate([...placed.values()]).map((balloon: LaidOutBalloon): [string, LaidOutBalloon] => [balloon.regionId, balloon]),
        );

        geometries
            .filter((geometry: BalloonGeometry) => this.isExpiring(geometry.item))
            .forEach((geometry: BalloonGeometry) => laidOut.set(
                geometry.item.regionId,
                kept.get(geometry.item.regionId) ?? this.place(geometry, [], new Map<string, LaidOutBalloon>(), hostSize),
            ));

        return laidOut;
    }

    private layoutSource(): LayoutSource {
        return {
            fontScale: this.fontScale(),
            fontsVersion: this._fontsVersion(),
            granularity: this.granularity(),
            hostSize: this._hostSize(),
            items: this._balloons(),
            measuredHeights: this._measuredHeights(),
        };
    }

    private lengthAlong(space: number, projection: number): number {
        return Math.abs(projection) > NEGLIGIBLE_PROJECTION ? space / Math.abs(projection) : Number.POSITIVE_INFINITY;
    }

    private measureBalloons(): void {
        if (this.readingMode) {
            return;
        }
        const layout: Map<string, LaidOutBalloon> = this._layout();
        const stored: Map<string, number> = this._measuredHeights();
        const measured: Map<string, number> = new Map<string, number>();
        let changed: boolean = false;
        let widthChanged: boolean = false;

        this.elementRef.nativeElement.querySelectorAll<HTMLElement>(BALLOON_SELECTOR).forEach((button: HTMLElement) => {
            const regionId: string = button.getAttribute(REGION_ID_ATTRIBUTE) ?? EMPTY;
            const height: number = button.offsetHeight;
            const used: number | undefined = layout.get(regionId)?.height;
            const previous: number | undefined = stored.get(regionId);
            const text: HTMLElement | null = button.querySelector<HTMLElement>('.lens-balloon-text');
            const fontSize: number | undefined = layout.get(regionId)?.placement.fontSize;

            // Measure the rendered, unwrapped text as well as the canvas estimate.
            // Android WebViews and fallback fonts can have different glyph widths.
            if (text !== null && fontSize !== undefined && fontSize > 0 && text.scrollWidth > this.textWidth(text.textContent ?? EMPTY, fontSize) + 1) {
                this._widthCache.set(text.textContent ?? EMPTY, text.scrollWidth / fontSize);
                widthChanged = true;
            }

            if (
                used !== undefined
                && height > 0
                && Math.abs(height - used) > HEIGHT_MEASUREMENT_TOLERANCE_PIXELS
                && (previous === undefined || Math.abs(height - previous) > HEIGHT_MEASUREMENT_TOLERANCE_PIXELS)
            ) {
                measured.set(regionId, height);
                changed = true;
            } else if (previous !== undefined) {
                measured.set(regionId, previous);
            }
        });

        if (changed || measured.size !== stored.size) {
            this._measuredHeights.set(measured);
        }
        if (widthChanged) {
            this._fontsVersion.update((version: number) => version + 1);
            this.changeDetectorRef.markForCheck();
        }
    }

    private measuredWidthEm(text: string): number | null {
        const context: OffscreenCanvasRenderingContext2D | null = this.measurementContext();
        const referenceSize: string = `${MEASUREMENT_REFERENCE_PIXELS}px`;

        if (context === null || this._fontFamily === EMPTY) {
            return null;
        }

        context.font = `${MEASUREMENT_FONT_WEIGHT} ${referenceSize} ${this._fontFamily}`;

        if (!context.font.includes(referenceSize)) {
            return null;
        }

        const width: number = context.measureText(text).width;

        return Number.isFinite(width) && width > 0 ? width / MEASUREMENT_REFERENCE_PIXELS : null;
    }

    private measureHost(): void {
        const bounds: DOMRect = this.elementRef.nativeElement.getBoundingClientRect();
        const current: ViewportSize = this._hostSize();

        this.readFontFamily();

        if (bounds.width <= 0 || bounds.height <= 0 || (bounds.width === current.width && bounds.height === current.height)) {
            return;
        }

        this._hostSize.set({ height: bounds.height, width: bounds.width });
        this.changeDetectorRef.markForCheck();
    }

    private measurementContext(): OffscreenCanvasRenderingContext2D | null {
        if (!this._measurementResolved) {
            this._measurementResolved = true;
            this._measurementContext = this.createMeasurementContext();
        }

        return this._measurementContext;
    }

    private normalizedScale(): number {
        const scale: number = this.fontScale();

        return Number.isFinite(scale) ? GeometryUtils.clamp(scale, MIN_FONT_SCALE, MAX_FONT_SCALE) : DEFAULT_BALLOON_FONT_SCALE;
    }

    private occupiedRight(geometry: BalloonGeometry, placed: Map<string, LaidOutBalloon>): number {
        const balloon: LaidOutBalloon | undefined = placed.get(geometry.item.regionId);

        return balloon ? Math.max(geometry.extent.right, balloon.extent.right) : geometry.extent.right;
    }

    private originalLanguage(item: OverlayItem): string | null {
        if (item.sourceLanguage && item.sourceLanguage !== UNDETERMINED_LANGUAGE) {
            return item.sourceLanguage;
        }

        const fallback: string = this.sourceLanguage();

        return fallback !== EMPTY && fallback !== AUTO_LANGUAGE ? fallback : null;
    }

    private overlapsHorizontally(first: BalloonExtent, second: BalloonExtent): boolean {
        return first.left < second.right + COLLISION_GAP_PIXELS - COLLISION_TOLERANCE_PIXELS
            && second.left < first.right + COLLISION_GAP_PIXELS - COLLISION_TOLERANCE_PIXELS;
    }

    private place(
        geometry: BalloonGeometry,
        all: BalloonGeometry[],
        placed: Map<string, LaidOutBalloon>,
        hostSize: ViewportSize,
    ): LaidOutBalloon {
        const text: string = this.displayedText(geometry.item);
        const frameBounds: HorizontalBounds = this.frameBounds(geometry, hostSize);
        const neighborBounds: HorizontalBounds = this.horizontalBounds(geometry, all, placed, frameBounds);
        const baseFontSize: number = this.baseFontSize(geometry);
        const shrinkFloor: number = Math.min(
            baseFontSize,
            Math.max(MIN_READABLE_FONT_SIZE_PIXELS, this.roundedFontSize(baseFontSize * SHRINK_FLOOR_RATIO)),
        );
        const preferredFontSizes: number[] = this.candidateFontSizes(baseFontSize, shrinkFloor);
        const attempts: PlacementAttempt[] = [
            ...[neighborBounds, { maximumRight: frameBounds.maximumRight, minimumLeft: neighborBounds.minimumLeft }, frameBounds]
                .map((bounds: HorizontalBounds) => ({ bounds: bounds, fontSizes: preferredFontSizes })),
            ...this.candidateFontSizes(shrinkFloor, MIN_READABLE_FONT_SIZE_PIXELS)
                .map((fontSize: number) => ({ bounds: frameBounds, fontSizes: [fontSize] })),
        ];

        for (const attempt of attempts) {
            const fit: BalloonFit | null = this.fit(geometry, attempt.bounds, hostSize, text, attempt.fontSizes);

            if (fit !== null) {
                return this.fitInsideFrame(geometry, attempt.bounds, hostSize, fit);
            }
        }

        const room: number = this.availableWidth(geometry, frameBounds, hostSize, this.balloonHeight(geometry, MIN_READABLE_FONT_SIZE_PIXELS, 1));
        // A line wider than the viewport is shown in the scrollable reading panel.
        return this.fitInsideFrame(geometry, frameBounds, hostSize, {
            fontSize: MIN_READABLE_FONT_SIZE_PIXELS, lines: 1, width: Math.max(1, room),
        });
    }

    private readFontFamily(): void {
        const fontFamily: string = this.document.defaultView?.getComputedStyle(this.elementRef.nativeElement).fontFamily.trim() ?? EMPTY;

        if (fontFamily !== this._fontFamily) {
            this._fontFamily = fontFamily;
            this._widthCache.clear();
        }
    }

    private refreshTextMeasurement(): void {
        if (this._destroyed) {
            return;
        }

        this._widthCache.clear();
        this.readFontFamily();
        this._fontsVersion.update((version: number) => version + 1);
        this.changeDetectorRef.markForCheck();
    }

    private roundedFontSize(fontSize: number): number {
        return Math.floor(fontSize * FONT_SIZE_PRECISION) / FONT_SIZE_PRECISION;
    }

    private separate(balloons: LaidOutBalloon[]): LaidOutBalloon[] {
        const lowered: LaidOutBalloon[] = [];
        const lifted: LaidOutBalloon[] = [];

        [...balloons]
            .sort((first: LaidOutBalloon, second: LaidOutBalloon) => first.extent.top - second.extent.top || first.extent.left - second.extent.left)
            .forEach((balloon: LaidOutBalloon) => lowered.push(this.belowBlockers(balloon, lowered)));

        [...lowered]
            .sort((first: LaidOutBalloon, second: LaidOutBalloon) => second.extent.top - first.extent.top || second.extent.left - first.extent.left)
            .forEach((balloon: LaidOutBalloon) => lifted.push(this.aboveFloor(balloon, lifted)));

        return lifted;
    }

    private sharesRow(first: BalloonGeometry, second: BalloonGeometry): boolean {
        const overlap: number = Math.min(first.extent.bottom, second.extent.bottom) - Math.max(first.extent.top, second.extent.top);
        const shortest: number = Math.min(first.extent.bottom - first.extent.top, second.extent.bottom - second.extent.top);

        return overlap > 0 && overlap / shortest >= ROW_OVERLAP_RATIO;
    }

    private shiftedBalloon(balloon: LaidOutBalloon, verticalShift: number): LaidOutBalloon {
        return {
            ...balloon,
            extent: this.shiftedExtent(balloon.extent, 0, verticalShift),
            placement: { ...balloon.placement, top: balloon.placement.top + verticalShift },
        };
    }

    private shiftedExtent(extent: BalloonExtent, horizontalShift: number, verticalShift: number): BalloonExtent {
        return {
            bottom: extent.bottom + verticalShift,
            left: extent.left + horizontalShift,
            right: extent.right + horizontalShift,
            top: extent.top + verticalShift,
        };
    }

    private shiftWithin(start: number, end: number, lowest: number, highest: number): number {
        return GeometryUtils.clamp(start, lowest, Math.max(lowest, highest - (end - start))) - start;
    }

    private sortByReadingOrder(items: OverlayItem[]): OverlayItem[] {
        const rows: OverlayItem[][] = [];
        let rowTop: number = Number.NEGATIVE_INFINITY;

        [...items]
            .sort((first: OverlayItem, second: OverlayItem) => first.anchorRect.y - second.anchorRect.y)
            .forEach((item: OverlayItem) => {
                const top: number = item.anchorRect.y;

                if (top - rowTop > READING_ROW_TOLERANCE) {
                    rows.push([]);
                    rowTop = top;
                }

                rows[rows.length - 1].push(item);
            });

        return rows.flatMap((row: OverlayItem[]) =>
            row.sort((first: OverlayItem, second: OverlayItem) => first.anchorRect.x - second.anchorRect.x),
        );
    }

    private sourceLineCount(geometry: BalloonGeometry): number {
        const text: string = geometry.item.originalText;
        const writtenLines: number = text.split(LINE_BREAK).filter((line: string) => line.trim() !== EMPTY).length;

        if (writtenLines > 1) {
            return writtenLines;
        }

        return Math.max(1, Math.round(Math.sqrt((this.widthEm(text) * BASE_FONT_RATIO * geometry.height) / geometry.width)));
    }

    private textWidth(text: string, fontSize: number): number {
        return Math.max(this.widthEm(text), NARROW_CHARACTER_WIDTH_EM) * fontSize * MEASUREMENT_SLACK;
    }

    private verticalBounds(left: number, right: number, hostSize: ViewportSize): VerticalBounds {
        const clearance: number = Math.min(left, hostSize.width - right) - FRAME_MARGIN_PIXELS;
        const depth: number = Math.max(FRAME_MARGIN_PIXELS, this.cornerArc(clearance));

        return { maximumBottom: hostSize.height - depth, minimumTop: depth };
    }

    private widthEm(text: string): number {
        const cached: number | undefined = this._widthCache.get(text);

        if (cached !== undefined) {
            return cached;
        }

        if (this._widthCache.size >= WIDTH_CACHE_LIMIT) {
            this._widthCache.clear();
        }

        const widthEm: number = this.measuredWidthEm(text) ?? this.estimatedWidthEm(text);

        this._widthCache.set(text, widthEm);

        return widthEm;
    }

}
