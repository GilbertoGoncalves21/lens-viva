import {
    FrameMetadata
,   NormalizedRect
,   PixelRect
,   RecognitionEvent
,   RecognizedBlock
,   RecognizedLine
,   RegionGranularity
,   TextRegion
,   ViewportSize
} from '../../models';
import { EMPTY, RECOGNITION_FILTER } from '../constants/constants';
import { GeometryUtils } from '../geometry-utils/geometry-utils';
import { TextUtils } from '../text-utils/text-utils';
import { MenuTranslationUtils } from '../menu-translation-utils/menu-translation-utils';
import { PhraseUtils } from '../phrase-utils/phrase-utils';

const ADDRESS_PATTERN: RegExp = /(?:https?:|www\.|@|\.(?:br|com|edu|gov|info|io|net|org)\b)/iu;

const LETTER_PATTERN: RegExp = /\p{L}/gu;

const PRICE_PATTERN: RegExp = /(?:(?:R\$|US\$|\$|€|£)\s?\d[\d.,]*|\d+(?:[.,]\d{3})*[.,]\d{2}(?!\d))/gu;

const REPEATED_SYMBOL_PATTERN: RegExp = /([^\p{L}\p{N}])\1+/gu;

const WHITESPACE_PATTERN: RegExp = /\s+/gu;

interface FrameProjection {
    offsetX: number;
    offsetY: number;
    scale: number;
    viewHeight: number;
    viewWidth: number;
}

interface RegionGeometry {
    normalizedRect: NormalizedRect;
    orientation: number;
    orientedHeight: number;
    orientedWidth: number;
}

export class NormalizationUtils {
    static toNormalizedRect(box: PixelRect, frame: FrameMetadata): NormalizedRect {
        return GeometryUtils.clampRect(NormalizationUtils.toUnclampedRect(box, frame));
    }

    static toTextRegions(event: RecognitionEvent, granularity: RegionGranularity): TextRegion[] {
        event = { ...event, blocks: PhraseUtils.rows(event.blocks) };
        const menu: boolean = MenuTranslationUtils.isMenu(event.blocks.flatMap((block: RecognizedBlock) => block.lines.map((line: RecognizedLine) => line.text)));
        const candidates: TextRegion[] = granularity === RegionGranularity.LINE || menu
            ? NormalizationUtils.fromLines(event)
            : NormalizationUtils.fromBlocks({ ...event, blocks: PhraseUtils.paragraphs(event.blocks) });

        return candidates.filter((region: TextRegion) => NormalizationUtils.isReadable(region));
    }

    private static averageAngle(lines: RecognizedLine[]): number {
        if (lines.length === 0) {
            return 0;
        }

        return lines.reduce((sum: number, line: RecognizedLine) => sum + line.angle, 0) / lines.length;
    }

    private static averageConfidence(lines: RecognizedLine[]): number | null {
        const confidences: number[] = lines
            .map((line: RecognizedLine) => line.confidence)
            .filter((confidence: number | null): confidence is number => confidence !== null);

        if (confidences.length === 0) {
            return null;
        }

        return confidences.reduce((sum: number, confidence: number) => sum + confidence, 0) / confidences.length;
    }

    private static fromBlocks(event: RecognitionEvent): TextRegion[] {
        return event.blocks
            .filter((block: RecognizedBlock) => NormalizationUtils.isMostlyVisible(block.boundingBox, event.frame))
            .map((block: RecognizedBlock): TextRegion => ({
                ...NormalizationUtils.toGeometry(
                    block.boundingBox,
                    block.orientedWidth,
                    block.orientedHeight,
                    NormalizationUtils.averageAngle(block.lines),
                    event.frame,
                ),
                confidence: NormalizationUtils.averageConfidence(block.lines),
                frameTimestamp: event.frame.frameTimestamp,
                rawText: TextUtils.normalize(block.text),
                regionId: EMPTY,
                sourceLanguage: NormalizationUtils.toLanguage(block.recognizedLanguage),
            }));
    }

    private static fromLines(event: RecognitionEvent): TextRegion[] {
        return event.blocks.flatMap((block: RecognizedBlock) =>
            block.lines
                .filter((line: RecognizedLine) => NormalizationUtils.isMostlyVisible(line.boundingBox, event.frame))
                .map((line: RecognizedLine): TextRegion => ({
                    ...NormalizationUtils.toGeometry(line.boundingBox, line.orientedWidth, line.orientedHeight, line.angle, event.frame),
                    confidence: line.confidence,
                    frameTimestamp: event.frame.frameTimestamp,
                    rawText: TextUtils.normalize(line.text),
                    regionId: EMPTY,
                    sourceLanguage: NormalizationUtils.toLanguage(line.recognizedLanguage ?? block.recognizedLanguage),
                })),
        );
    }

    private static isAddress(text: string): boolean {
        return ADDRESS_PATTERN.test(text);
    }

    private static isClamped(rect: NormalizedRect): boolean {
        return rect.x < 0 || rect.y < 0 || rect.x + rect.width > 1 || rect.y + rect.height > 1;
    }

    private static isCutByEdge(rect: NormalizedRect, letters: number): boolean {
        const margin: number = RECOGNITION_FILTER.edgeMargin;
        const touchesEdge: boolean =
            rect.x <= margin ||
            rect.y <= margin ||
            rect.x + rect.width >= 1 - margin ||
            rect.y + rect.height >= 1 - margin;

        return touchesEdge && letters < RECOGNITION_FILTER.edgeMinLetters;
    }

    private static isMostlyVisible(box: PixelRect, frame: FrameMetadata): boolean {
        const unclamped: NormalizedRect = NormalizationUtils.toUnclampedRect(box, frame);
        const fullArea: number = GeometryUtils.area(unclamped);

        return fullArea > 0 && GeometryUtils.area(GeometryUtils.clampRect(unclamped)) / fullArea >= RECOGNITION_FILTER.minVisibleFraction;
    }

    private static isReadable(region: TextRegion): boolean {
        const letters: number = NormalizationUtils.letterCount(region.rawText);

        return (
            letters >= RECOGNITION_FILTER.minLetters &&
            NormalizationUtils.letterShare(region.rawText) >= RECOGNITION_FILTER.minLetterShare &&
            !NormalizationUtils.isAddress(region.rawText) &&
            !NormalizationUtils.isCutByEdge(region.normalizedRect, letters) &&
            GeometryUtils.area(region.normalizedRect) >= RECOGNITION_FILTER.minArea &&
            (region.confidence === null || region.confidence >= RECOGNITION_FILTER.minConfidence)
        );
    }

    private static letterCount(text: string): number {
        return (text.match(LETTER_PATTERN) ?? []).length;
    }

    private static letterShare(text: string): number {
        const significant: string = text
            .replace(PRICE_PATTERN, EMPTY)
            .replace(WHITESPACE_PATTERN, EMPTY)
            .replace(REPEATED_SYMBOL_PATTERN, '$1');

        return significant.length > 0 ? NormalizationUtils.letterCount(significant) / significant.length : 0;
    }

    private static projectionFor(frame: FrameMetadata): FrameProjection | null {
        const imageSize: ViewportSize = { height: frame.imageHeight, width: frame.imageWidth };
        const viewWidth: number = frame.viewWidth > 0 ? frame.viewWidth : imageSize.width;
        const viewHeight: number = frame.viewHeight > 0 ? frame.viewHeight : imageSize.height;

        if (imageSize.width <= 0 || imageSize.height <= 0 || viewWidth <= 0 || viewHeight <= 0) {
            return null;
        }

        const scale: number = Math.max(viewWidth / imageSize.width, viewHeight / imageSize.height);

        return {
            offsetX: (viewWidth - imageSize.width * scale) / 2,
            offsetY: (viewHeight - imageSize.height * scale) / 2,
            scale: scale,
            viewHeight: viewHeight,
            viewWidth: viewWidth,
        };
    }

    private static toGeometry(box: PixelRect, orientedWidth: number, orientedHeight: number, angle: number, frame: FrameMetadata): RegionGeometry {
        const projection: FrameProjection | null = NormalizationUtils.projectionFor(frame);
        const unclamped: NormalizedRect = NormalizationUtils.toUnclampedRect(box, frame);
        const normalizedRect: NormalizedRect = GeometryUtils.clampRect(unclamped);
        const width: number = projection ? (orientedWidth * projection.scale) / projection.viewWidth : 0;
        const height: number = projection ? (orientedHeight * projection.scale) / projection.viewHeight : 0;
        const usable: boolean =
            Number.isFinite(angle) &&
            Number.isFinite(width) &&
            Number.isFinite(height) &&
            width > 0 &&
            height > 0 &&
            !NormalizationUtils.isClamped(unclamped);

        if (!usable) {
            return { normalizedRect: normalizedRect, orientation: 0, orientedHeight: normalizedRect.height, orientedWidth: normalizedRect.width };
        }

        return {
            normalizedRect: normalizedRect,
            orientation: frame.mirrored && angle !== 0 ? -angle : angle,
            orientedHeight: height,
            orientedWidth: width,
        };
    }

    private static toLanguage(language: string | null): string | null {
        return language && language !== 'und' ? language : null;
    }

    private static toUnclampedRect(box: PixelRect, frame: FrameMetadata): NormalizedRect {
        const projection: FrameProjection | null = NormalizationUtils.projectionFor(frame);

        if (projection === null) {
            return { height: 0, width: 0, x: 0, y: 0 };
        }

        const left: number = (box.left * projection.scale + projection.offsetX) / projection.viewWidth;
        const right: number = (box.right * projection.scale + projection.offsetX) / projection.viewWidth;
        const top: number = (box.top * projection.scale + projection.offsetY) / projection.viewHeight;
        const bottom: number = (box.bottom * projection.scale + projection.offsetY) / projection.viewHeight;

        return {
            height: bottom - top,
            width: right - left,
            x: frame.mirrored ? 1 - right : left,
            y: top,
        };
    }
}
