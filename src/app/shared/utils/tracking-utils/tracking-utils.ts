import { NormalizedRect, OverlayItem, OverlayStatus, ReconcileResult, TextRegion } from '../../models';
import {
    DEFAULT_ANALYSES_PER_SECOND
,   EMPTY
,   MAX_ANALYSES_PER_SECOND
,   MIN_ANALYSES_PER_SECOND
,   TRACKING_CONFIG
,   TRANSLATION_RETRY_CONFIG
} from '../constants/constants';
import { GeometryUtils } from '../geometry-utils/geometry-utils';
import { TextUtils } from '../text-utils/text-utils';

const MILLISECONDS_PER_SECOND: number = 1000;

interface MatchCandidate {
    itemIndex: number;
    regionIndex: number;
    score: number;
}

interface TrackedGeometry {
    anchorRect: NormalizedRect;
    orientation: number;
    orientedHeight: number;
    orientedWidth: number;
}

export class TrackingUtils {
    static analysisIntervalFor(analysesPerSecond: number): number {
        const rate: number = Number.isFinite(analysesPerSecond)
            ? GeometryUtils.clamp(analysesPerSecond, MIN_ANALYSES_PER_SECOND, MAX_ANALYSES_PER_SECOND)
            : DEFAULT_ANALYSES_PER_SECOND;

        return MILLISECONDS_PER_SECOND / rate;
    }

    static deduplicate(regions: TextRegion[]): TextRegion[] {
        const kept: TextRegion[] = [];

        regions.forEach((region: TextRegion) => {
            const duplicated: boolean = kept.some((keptRegion: TextRegion) =>
                GeometryUtils.intersectionOverUnion(keptRegion.normalizedRect, region.normalizedRect) >= TRACKING_CONFIG.deduplicationMinIntersection &&
                TextUtils.similarity(keptRegion.rawText, region.rawText) >= TRACKING_CONFIG.deduplicationMinTextSimilarity,
            );

            if (!duplicated) {
                kept.push(region);
            }
        });

        return kept;
    }

    static expire(
        items: OverlayItem[],
        now: number,
        analysisIntervalMilliseconds: number = TrackingUtils.analysisIntervalFor(DEFAULT_ANALYSES_PER_SECOND),
    ): OverlayItem[] {
        const expireAfterMilliseconds: number = TrackingUtils.expiryDelay(analysisIntervalMilliseconds);
        const removeAfterMilliseconds: number =
            expireAfterMilliseconds + TRACKING_CONFIG.removeAfterMilliseconds - TRACKING_CONFIG.expireAfterMilliseconds;

        return items
            .filter((item: OverlayItem) => now - item.lastSeenAt < removeAfterMilliseconds)
            .map((item: OverlayItem) =>
                now - item.lastSeenAt >= expireAfterMilliseconds && item.status !== OverlayStatus.EXPIRING
                    ? { ...item, status: OverlayStatus.EXPIRING }
                    : item,
            );
    }

    static reconcile(
        previous: OverlayItem[],
        regions: TextRegion[],
        now: number,
        createId: () => string,
        retainUnmatched: boolean = true,
        snapAnchors: boolean = false,
    ): ReconcileResult {
        const candidates: MatchCandidate[] = [];

        previous.forEach((item: OverlayItem, itemIndex: number) => {
            regions.forEach((region: TextRegion, regionIndex: number) => {
                const score: number | null = TrackingUtils.matchScore(item, region);

                if (score !== null) {
                    candidates.push({ itemIndex: itemIndex, regionIndex: regionIndex, score: score });
                }
            });
        });

        candidates.sort((first: MatchCandidate, second: MatchCandidate) => second.score - first.score);

        const matchedItems: Set<number> = new Set<number>();
        const matchedRegions: Map<number, number> = new Map<number, number>();

        candidates.forEach((candidate: MatchCandidate) => {
            if (!matchedItems.has(candidate.itemIndex) && !matchedRegions.has(candidate.regionIndex)) {
                matchedItems.add(candidate.itemIndex);
                matchedRegions.set(candidate.regionIndex, candidate.itemIndex);
            }
        });

        const createdRegions: TextRegion[] = regions.filter((region: TextRegion, regionIndex: number) => !matchedRegions.has(regionIndex));
        const items: OverlayItem[] = retainUnmatched
            ? previous.filter((item: OverlayItem, itemIndex: number) =>
                !matchedItems.has(itemIndex) && !TrackingUtils.isSuperseded(item, regions, createdRegions),
            )
            : [];
        const pendingTranslations: OverlayItem[] = [];

        regions.forEach((region: TextRegion, regionIndex: number) => {
            const itemIndex: number | undefined = matchedRegions.get(regionIndex);
            const item: OverlayItem = itemIndex === undefined
                ? TrackingUtils.createItem(region, now, createId())
                : TrackingUtils.updateItem(previous[itemIndex], region, now, snapAnchors);

            items.push(item);

            if (item.status === OverlayStatus.READING) {
                pendingTranslations.push(item);
            }
        });

        return { items: items, pendingTranslations: pendingTranslations };
    }

    private static changedItem(item: OverlayItem, text: string): OverlayItem {
        return {
            ...item,
            candidateText: EMPTY,
            failedAt: null,
            failedAttempts: 0,
            originalText: text,
            showOriginal: false,
            sourceLanguage: null,
            stabilityScore: TRACKING_CONFIG.stabilityIncrement,
            status: OverlayStatus.READING,
            textVersion: item.textVersion + 1,
            translatedText: EMPTY,
        };
    }

    private static correctedItem(item: OverlayItem, text: string): OverlayItem {
        return {
            ...item,
            candidateText: EMPTY,
            failedAt: null,
            failedAttempts: 0,
            originalText: text,
            sourceLanguage: null,
            stabilityScore: TrackingUtils.increasedStability(item),
            status: OverlayStatus.READING,
            textVersion: item.textVersion + 1,
        };
    }

    private static createItem(region: TextRegion, now: number, regionId: string): OverlayItem {
        return {
            anchorRect: region.normalizedRect,
            candidateText: EMPTY,
            failedAt: null,
            failedAttempts: 0,
            firstSeenAt: now,
            lastSeenAt: now,
            observedRect: region.normalizedRect,
            orientation: region.orientation,
            orientedHeight: region.orientedHeight,
            orientedWidth: region.orientedWidth,
            originalText: region.rawText,
            regionId: regionId,
            showOriginal: false,
            sourceLanguage: null,
            stabilityScore: TRACKING_CONFIG.stabilityIncrement,
            status: OverlayStatus.READING,
            textVersion: 1,
            translatedText: EMPTY,
        };
    }

    private static expiryDelay(analysisIntervalMilliseconds: number): number {
        const scaledDelay: number = Number.isFinite(analysisIntervalMilliseconds)
            ? Math.round(TRACKING_CONFIG.expireAfterAnalysisIntervals * analysisIntervalMilliseconds)
            : 0;

        return Math.max(TRACKING_CONFIG.expireAfterMilliseconds, scaledDelay);
    }

    private static geometryFor(item: OverlayItem, region: TextRegion, snapAnchors: boolean): TrackedGeometry {
        const target: NormalizedRect = region.normalizedRect;

        if (snapAnchors || TrackingUtils.leavesLine(item.anchorRect, target)) {
            return { anchorRect: target, orientation: region.orientation, orientedHeight: region.orientedHeight, orientedWidth: region.orientedWidth };
        }

        if (!GeometryUtils.hasMoved(item.anchorRect, target, TRACKING_CONFIG.movementThreshold)) {
            return { anchorRect: item.anchorRect, orientation: item.orientation, orientedHeight: item.orientedHeight, orientedWidth: item.orientedWidth };
        }

        const factor: number = TRACKING_CONFIG.smoothingFactor;

        return {
            anchorRect: GeometryUtils.interpolateRect(item.anchorRect, target, factor),
            orientation: GeometryUtils.interpolateAngle(item.orientation, region.orientation, factor),
            orientedHeight: GeometryUtils.interpolate(item.orientedHeight, region.orientedHeight, factor),
            orientedWidth: GeometryUtils.interpolate(item.orientedWidth, region.orientedWidth, factor),
        };
    }

    private static hasTranslation(item: OverlayItem): boolean {
        return item.translatedText !== EMPTY && item.sourceLanguage !== null;
    }

    private static increasedStability(item: OverlayItem): number {
        return Math.min(1, item.stabilityScore + TRACKING_CONFIG.stabilityIncrement);
    }

    private static isSuperseded(item: OverlayItem, regions: TextRegion[], createdRegions: TextRegion[]): boolean {
        const covered: boolean = regions.some((region: TextRegion) =>
            [item.observedRect, item.anchorRect].some((rect: NormalizedRect) =>
                GeometryUtils.overlapRatio(rect, region.normalizedRect) >= TRACKING_CONFIG.supersedeMinOverlap,
            ),
        );

        return covered || createdRegions.some((region: TextRegion) =>
            TextUtils.similarity(item.originalText, region.rawText) >= TRACKING_CONFIG.matchMinTextSimilarity,
        );
    }

    private static leavesLine(anchorRect: NormalizedRect, target: NormalizedRect): boolean {
        const anchorCenter: number = anchorRect.y + anchorRect.height / 2;
        const targetCenter: number = target.y + target.height / 2;

        return Math.abs(targetCenter - anchorCenter) > anchorRect.height;
    }

    private static matchScore(item: OverlayItem, region: TextRegion): number | null {
        const intersection: number = GeometryUtils.intersectionOverUnion(item.observedRect, region.normalizedRect);
        const distance: number = GeometryUtils.centerDistance(item.observedRect, region.normalizedRect);
        const similarity: number = TextUtils.similarity(item.originalText, region.rawText);
        const eligible: boolean =
            intersection >= TRACKING_CONFIG.matchMinIntersection ||
            (distance <= TRACKING_CONFIG.matchMaxCenterDistance && similarity >= TRACKING_CONFIG.matchMinTextSimilarity);

        return eligible ? intersection + similarity * 0.5 - distance : null;
    }

    private static restoredStatus(item: OverlayItem, now: number): OverlayStatus {
        if (item.status === OverlayStatus.EXPIRING) {
            return TrackingUtils.hasTranslation(item) ? OverlayStatus.TRANSLATED : OverlayStatus.READING;
        }

        return TrackingUtils.retryDue(item, now) ? OverlayStatus.READING : item.status;
    }

    private static retryDue(item: OverlayItem, now: number): boolean {
        return (
            item.status === OverlayStatus.ERROR &&
            item.failedAt !== null &&
            now - item.failedAt >= TRANSLATION_RETRY_CONFIG.delayMilliseconds &&
            item.failedAttempts < TRANSLATION_RETRY_CONFIG.maxFailedAttempts
        );
    }

    private static seenItem(item: OverlayItem, candidateText: string, now: number): OverlayItem {
        const recorded: OverlayItem = TrackingUtils.withRecordedFailure(item, now);
        const status: OverlayStatus = TrackingUtils.restoredStatus(recorded, now);

        return {
            ...recorded,
            candidateText: candidateText,
            failedAt: status === OverlayStatus.READING ? null : recorded.failedAt,
            stabilityScore: TrackingUtils.increasedStability(item),
            status: status,
        };
    }

    private static updateItem(item: OverlayItem, region: TextRegion, now: number, snapAnchors: boolean): OverlayItem {
        const tracked: OverlayItem = {
            ...item,
            ...TrackingUtils.geometryFor(item, region, snapAnchors),
            lastSeenAt: now,
            observedRect: region.normalizedRect,
        };
        const readingContent: string = TextUtils.toLettersAndDigits(region.rawText);

        if (readingContent === TextUtils.toLettersAndDigits(item.originalText)) {
            return TrackingUtils.seenItem(tracked, EMPTY, now);
        }

        if (TextUtils.similarity(item.originalText, region.rawText) < TRACKING_CONFIG.textChangeSimilarity) {
            return TrackingUtils.changedItem(tracked, region.rawText);
        }

        if (readingContent === TextUtils.toLettersAndDigits(item.candidateText)) {
            return TrackingUtils.correctedItem(tracked, region.rawText);
        }

        return TrackingUtils.seenItem(tracked, region.rawText, now);
    }

    private static withRecordedFailure(item: OverlayItem, now: number): OverlayItem {
        return item.status === OverlayStatus.ERROR && item.failedAt === null
            ? { ...item, failedAt: now, failedAttempts: item.failedAttempts + 1 }
            : item;
    }
}
