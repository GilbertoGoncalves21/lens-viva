import {
    FrameMetadata
,   NormalizedRect
,   PixelRect
,   RecognitionEvent
,   RecognizedBlock
,   RecognizedLine
,   RegionGranularity
,   TextRegion
} from '../../models';
import { EMPTY } from '../constants/constants';
import { NormalizationUtils } from './normalization-utils';

function createFrame(overrides: Partial<FrameMetadata> = {}): FrameMetadata {
    return {
        frameTimestamp: 1000,
        imageHeight: 200,
        imageWidth: 100,
        mirrored: false,
        rotationDegrees: 0,
        viewHeight: 200,
        viewWidth: 100,
        ...overrides,
    };
}

function createLine(text: string, boundingBox: PixelRect, overrides: Partial<RecognizedLine> = {}): RecognizedLine {
    return {
        angle: 0,
        boundingBox: boundingBox,
        confidence: 0.9,
        orientedHeight: boundingBox.bottom - boundingBox.top,
        orientedWidth: boundingBox.right - boundingBox.left,
        recognizedLanguage: null,
        text: text,
        ...overrides,
    };
}

function createBlock(lines: RecognizedLine[], boundingBox: PixelRect, overrides: Partial<RecognizedBlock> = {}): RecognizedBlock {
    return {
        boundingBox: boundingBox,
        lines: lines,
        orientedHeight: boundingBox.bottom - boundingBox.top,
        orientedWidth: boundingBox.right - boundingBox.left,
        recognizedLanguage: 'en',
        text: lines.map((line: RecognizedLine) => line.text).join('\n'),
        ...overrides,
    };
}

function createEvent(blocks: RecognizedBlock[], frame: FrameMetadata = createFrame()): RecognitionEvent {
    return { blocks: blocks, frame: frame };
}

function expectRect(actual: NormalizedRect, expected: NormalizedRect): void {
    expect(actual.x).toBeCloseTo(expected.x, 6);
    expect(actual.y).toBeCloseTo(expected.y, 6);
    expect(actual.width).toBeCloseTo(expected.width, 6);
    expect(actual.height).toBeCloseTo(expected.height, 6);
}

describe('NormalizationUtils', () => {
    it('should preserve separate menu headings even in paragraph mode', () => {
        const block = createBlock([
            createLine('Appetizers', { left: 10, right: 85, top: 20, bottom: 32 }),
            createLine('Entrees', { left: 10, right: 85, top: 50, bottom: 62 }),
        ], { left: 10, right: 85, top: 20, bottom: 62 });
        const regions = NormalizationUtils.toTextRegions(createEvent([block]), RegionGranularity.BLOCK);
        expect(regions.map(region => region.rawText)).toEqual(['Appetizers', 'Entrees']);
        expect(regions[0].normalizedRect.y).toBeLessThan(regions[1].normalizedRect.y);
    });
    describe('toNormalizedRect', () => {
        const centeredBox: PixelRect = { bottom: 352, left: 192, right: 288, top: 320 };
        const imageCenterBox: PixelRect = { bottom: 336, left: 192, right: 288, top: 304 };
        const landscapeScale: number = 800 / 480;
        const portraitPhoneFrame: FrameMetadata = createFrame({ imageHeight: 640, imageWidth: 480, viewHeight: 780, viewWidth: 360 });

        it('should map pixels directly when the image matches the view', () => {
            const rect: NormalizedRect = NormalizationUtils.toNormalizedRect({ bottom: 40, left: 10, right: 60, top: 20 }, createFrame());

            expectRect(rect, { height: 0.1, width: 0.5, x: 0.1, y: 0.1 });
        });

        it('should scale uniformly when the image has the same aspect ratio as the view', () => {
            const frame: FrameMetadata = createFrame({ imageHeight: 100, imageWidth: 50 });
            const rect: NormalizedRect = NormalizationUtils.toNormalizedRect({ bottom: 20, left: 5, right: 30, top: 10 }, frame);

            expectRect(rect, { height: 0.1, width: 0.5, x: 0.1, y: 0.1 });
        });

        it('should crop horizontally when a 4:3 image fills a 9:19.5 view', () => {
            const rect: NormalizedRect = NormalizationUtils.toNormalizedRect(centeredBox, portraitPhoneFrame);

            expectRect(rect, { height: 0.05, width: 0.325, x: 0.3375, y: 0.5 });
        });

        it('should keep the full image height when cropping horizontally', () => {
            const rect: NormalizedRect = NormalizationUtils.toNormalizedRect({ bottom: 640, left: 240, right: 241, top: 0 }, portraitPhoneFrame);

            expect(rect.y).toBeCloseTo(0, 6);
            expect(rect.height).toBeCloseTo(1, 6);
            expect(rect.x).toBeCloseTo(0.5, 6);
        });

        it('should collapse regions that fall inside the cropped margin', () => {
            const rect: NormalizedRect = NormalizationUtils.toNormalizedRect({ bottom: 64, left: 0, right: 48, top: 0 }, portraitPhoneFrame);

            expect(rect.x).toBe(0);
            expect(rect.width).toBe(0);
        });

        it('should crop vertically when the view is wider than the image', () => {
            const frame: FrameMetadata = createFrame({ imageHeight: 300, imageWidth: 400, viewHeight: 450, viewWidth: 800 });
            const rect: NormalizedRect = NormalizationUtils.toNormalizedRect({ bottom: 165, left: 100, right: 300, top: 150 }, frame);

            expectRect(rect, { height: 30 / 450, width: 0.5, x: 0.25, y: 0.5 });
        });

        it('should mirror the horizontal axis for mirrored frames', () => {
            const frame: FrameMetadata = createFrame({ mirrored: true });
            const rect: NormalizedRect = NormalizationUtils.toNormalizedRect({ bottom: 40, left: 10, right: 30, top: 20 }, frame);

            expectRect(rect, { height: 0.1, width: 0.2, x: 0.7, y: 0.1 });
        });

        it('should clamp boxes that exceed the image bounds', () => {
            const rect: NormalizedRect = NormalizationUtils.toNormalizedRect({ bottom: 300, left: -20, right: 50, top: -10 }, createFrame());

            expectRect(rect, { height: 1, width: 0.5, x: 0, y: 0 });
        });

        it('should return an empty rect when the image has no size', () => {
            const empty: NormalizedRect = { height: 0, width: 0, x: 0, y: 0 };
            const box: PixelRect = { bottom: 40, left: 10, right: 60, top: 20 };

            expect(NormalizationUtils.toNormalizedRect(box, createFrame({ imageWidth: 0 }))).toEqual(empty);
            expect(NormalizationUtils.toNormalizedRect(box, createFrame({ imageHeight: 0 }))).toEqual(empty);
            expect(NormalizationUtils.toNormalizedRect(box, createFrame({ imageHeight: 0, imageWidth: 0, viewHeight: 0, viewWidth: 0 }))).toEqual(empty);
        });

        it('should fall back to the image size when the view has no size', () => {
            const frame: FrameMetadata = createFrame({ viewHeight: 0, viewWidth: 0 });
            const rect: NormalizedRect = NormalizationUtils.toNormalizedRect({ bottom: 40, left: 10, right: 60, top: 20 }, frame);

            expectRect(rect, { height: 0.1, width: 0.5, x: 0.1, y: 0.1 });
        });

        it('should keep an upright portrait image of a quarter turn frame in a landscape view', () => {
            const splitScreenFrame: FrameMetadata = createFrame({ imageHeight: 640, imageWidth: 480, rotationDegrees: 90, viewHeight: 450, viewWidth: 800 });
            const rect: NormalizedRect = NormalizationUtils.toNormalizedRect(imageCenterBox, splitScreenFrame);

            expect(rect.x + rect.width / 2).toBeCloseTo(0.5, 6);
            expect(rect.y + rect.height / 2).toBeCloseTo(0.5, 6);
            expectRect(rect, { height: 32 * landscapeScale / 450, width: 0.2, x: 0.4, y: 0.5 - 16 * landscapeScale / 450 });
        });

        it('should handle a 270 degree rotation like a 90 degree rotation', () => {
            const splitScreenFrame: FrameMetadata = createFrame({ imageHeight: 640, imageWidth: 480, rotationDegrees: 270, viewHeight: 450, viewWidth: 800 });
            const rect: NormalizedRect = NormalizationUtils.toNormalizedRect(imageCenterBox, splitScreenFrame);

            expectRect(rect, { height: 32 * landscapeScale / 450, width: 0.2, x: 0.4, y: 0.5 - 16 * landscapeScale / 450 });
        });

        it('should map the center of a portrait phone image to the center of a split screen pane', () => {
            const splitScreenFrame: FrameMetadata = createFrame({ imageHeight: 1280, imageWidth: 960, rotationDegrees: 90, viewHeight: 780, viewWidth: 1080 });
            const rect: NormalizedRect = NormalizationUtils.toNormalizedRect({ bottom: 660, left: 380, right: 580, top: 620 }, splitScreenFrame);

            expect(rect.x + rect.width / 2).toBeCloseTo(0.5, 6);
            expect(rect.y + rect.height / 2).toBeCloseTo(0.5, 6);
            expect(rect.width).toBeCloseTo((200 * 1.125) / 1080, 6);
            expect(rect.height).toBeCloseTo((40 * 1.125) / 780, 6);
        });

        it('should not swap an image size that is already upright', () => {
            const uprightFrame: FrameMetadata = { ...portraitPhoneFrame, rotationDegrees: 90 };
            const rect: NormalizedRect = NormalizationUtils.toNormalizedRect(centeredBox, uprightFrame);

            expectRect(rect, { height: 0.05, width: 0.325, x: 0.3375, y: 0.5 });
        });

        it('should keep the values inside the 0..1 range', () => {
            const rect: NormalizedRect = NormalizationUtils.toNormalizedRect({ bottom: 9999, left: -9999, right: 9999, top: -9999 }, portraitPhoneFrame);

            expect(rect.x).toBeGreaterThanOrEqual(0);
            expect(rect.y).toBeGreaterThanOrEqual(0);
            expect(rect.x + rect.width).toBeLessThanOrEqual(1);
            expect(rect.y + rect.height).toBeLessThanOrEqual(1);
        });
    });

    describe('toTextRegions', () => {
        const firstLineBox: PixelRect = { bottom: 40, left: 10, right: 90, top: 20 };
        const secondLineBox: PixelRect = { bottom: 70, left: 10, right: 80, top: 50 };
        const blockBox: PixelRect = { bottom: 70, left: 10, right: 90, top: 20 };

        it('should create one region per block with BLOCK granularity', () => {
            const block: RecognizedBlock = createBlock(
                [
                    createLine('Grilled  chicken', firstLineBox, { angle: 2, confidence: 0.8 }),
                    createLine('with lemon', secondLineBox, { angle: 4, confidence: 0.6 }),
                ],
                blockBox,
            );
            const regions: TextRegion[] = NormalizationUtils.toTextRegions(createEvent([block]), RegionGranularity.BLOCK);

            expect(regions.length).toBe(1);
            expect(regions[0].rawText).toBe('Grilled chicken with lemon');
            expect(regions[0].confidence).toBeCloseTo(0.7);
            expect(regions[0].orientation).toBeCloseTo(3);
            expect(regions[0].frameTimestamp).toBe(1000);
            expect(regions[0].regionId).toBe(EMPTY);
            expect(regions[0].sourceLanguage).toBe('en');
            expectRect(regions[0].normalizedRect, { height: 0.25, width: 0.8, x: 0.1, y: 0.1 });
        });

        it('should create one region per line with LINE granularity', () => {
            const block: RecognizedBlock = createBlock(
                [
                    createLine('Grilled chicken', firstLineBox, { angle: 2, confidence: 0.8, recognizedLanguage: 'fr' }),
                    createLine('with lemon', secondLineBox, { angle: 4, confidence: 0.6 }),
                ],
                blockBox,
            );
            const regions: TextRegion[] = NormalizationUtils.toTextRegions(createEvent([block]), RegionGranularity.LINE);

            expect(regions.length).toBe(2);
            expect(regions[0].rawText).toBe('Grilled chicken');
            expect(regions[0].confidence).toBe(0.8);
            expect(regions[0].orientation).toBe(2);
            expect(regions[0].sourceLanguage).toBe('fr');
            expectRect(regions[0].normalizedRect, { height: 0.1, width: 0.8, x: 0.1, y: 0.1 });
            expect(regions[1].rawText).toBe('with lemon');
            expect(regions[1].sourceLanguage).toBe('en');
            expectRect(regions[1].normalizedRect, { height: 0.1, width: 0.7, x: 0.1, y: 0.25 });
        });

        it('should keep the size and angle of tilted text instead of its taller axis-aligned box', () => {
            const tiltedBox: PixelRect = { bottom: 60, left: 10, right: 90, top: 20 };
            const block: RecognizedBlock = createBlock(
                [createLine('Grilled chicken', tiltedBox, { angle: 6, orientedHeight: 16, orientedWidth: 78 })],
                tiltedBox,
                { orientedHeight: 30, orientedWidth: 70 },
            );
            const lineRegions: TextRegion[] = NormalizationUtils.toTextRegions(createEvent([block]), RegionGranularity.LINE);
            const blockRegions: TextRegion[] = NormalizationUtils.toTextRegions(createEvent([block]), RegionGranularity.BLOCK);

            expectRect(lineRegions[0].normalizedRect, { height: 0.2, width: 0.8, x: 0.1, y: 0.1 });
            expect(lineRegions[0].orientation).toBe(6);
            expect(lineRegions[0].orientedWidth).toBeCloseTo(0.78, 6);
            expect(lineRegions[0].orientedHeight).toBeCloseTo(0.08, 6);
            expect(blockRegions[0].orientation).toBe(6);
            expect(blockRegions[0].orientedWidth).toBeCloseTo(0.7, 6);
            expect(blockRegions[0].orientedHeight).toBeCloseTo(0.15, 6);
        });

        it('should scale the oriented size with the same crop as the box when the preview cuts the image', () => {
            const croppedFrame: FrameMetadata = createFrame({ viewHeight: 100, viewWidth: 100 });
            const tiltedBox: PixelRect = { bottom: 90, left: 10, right: 90, top: 60 };
            const block: RecognizedBlock = createBlock([createLine('Grilled chicken', tiltedBox, { angle: -5, orientedHeight: 16, orientedWidth: 78 })], tiltedBox);
            const regions: TextRegion[] = NormalizationUtils.toTextRegions(createEvent([block], croppedFrame), RegionGranularity.LINE);

            expectRect(regions[0].normalizedRect, { height: 0.3, width: 0.8, x: 0.1, y: 0.1 });
            expect(regions[0].orientation).toBe(-5);
            expect(regions[0].orientedWidth).toBeCloseTo(0.78, 6);
            expect(regions[0].orientedHeight).toBeCloseTo(0.16, 6);
        });

        it('should mirror the angle of tilted text when the preview is mirrored', () => {
            const tiltedBox: PixelRect = { bottom: 60, left: 10, right: 90, top: 20 };
            const tilted: RecognizedBlock = createBlock([createLine('Grilled chicken', tiltedBox, { angle: 6, orientedHeight: 16, orientedWidth: 78 })], tiltedBox);
            const upright: RecognizedBlock = createBlock([createLine('Grilled chicken', firstLineBox)], firstLineBox);
            const mirroredFrame: FrameMetadata = createFrame({ mirrored: true });

            expect(NormalizationUtils.toTextRegions(createEvent([tilted], mirroredFrame), RegionGranularity.LINE)[0].orientation).toBe(-6);
            expect(NormalizationUtils.toTextRegions(createEvent([upright], mirroredFrame), RegionGranularity.LINE)[0].orientation).toBe(0);
        });

        it('should fall back to the upright box when the oriented size is unusable or the text runs past the frame edge', () => {
            const cutBox: PixelRect = { bottom: 40, left: -5, right: 95, top: 20 };
            const unusable: RecognizedBlock = createBlock([createLine('Grilled chicken', firstLineBox, { angle: 6, orientedHeight: 0, orientedWidth: 78 })], firstLineBox);
            const cut: RecognizedBlock = createBlock([createLine('Grilled chicken', cutBox, { angle: 6, orientedHeight: 16, orientedWidth: 98 })], cutBox);
            const unusableRegion: TextRegion = NormalizationUtils.toTextRegions(createEvent([unusable]), RegionGranularity.LINE)[0];
            const cutRegion: TextRegion = NormalizationUtils.toTextRegions(createEvent([cut]), RegionGranularity.LINE)[0];

            expect(unusableRegion.orientation).toBe(0);
            expect(unusableRegion.orientedWidth).toBeCloseTo(0.8, 6);
            expect(unusableRegion.orientedHeight).toBeCloseTo(0.1, 6);
            expect(cutRegion.orientation).toBe(0);
            expect(cutRegion.orientedWidth).toBeCloseTo(cutRegion.normalizedRect.width, 6);
            expect(cutRegion.orientedHeight).toBeCloseTo(cutRegion.normalizedRect.height, 6);
            expectRect(cutRegion.normalizedRect, { height: 0.1, width: 0.95, x: 0, y: 0.1 });
        });

        it('should keep blocks without confidence information', () => {
            const block: RecognizedBlock = createBlock([createLine('Fresh soup', firstLineBox, { confidence: null })], firstLineBox);
            const regions: TextRegion[] = NormalizationUtils.toTextRegions(createEvent([block]), RegionGranularity.BLOCK);

            expect(regions.length).toBe(1);
            expect(regions[0].confidence).toBeNull();
        });

        it('should ignore missing line confidences when averaging', () => {
            const block: RecognizedBlock = createBlock(
                [
                    createLine('Fresh soup', firstLineBox, { confidence: 0.5 }),
                    createLine('of the day', secondLineBox, { confidence: null }),
                ],
                blockBox,
            );
            const regions: TextRegion[] = NormalizationUtils.toTextRegions(createEvent([block]), RegionGranularity.BLOCK);

            expect(regions[0].confidence).toBe(0.5);
        });

        it('should use orientation 0 and null confidence for blocks without lines', () => {
            const block: RecognizedBlock = createBlock([], blockBox, { text: 'Chocolate cake' });
            const regions: TextRegion[] = NormalizationUtils.toTextRegions(createEvent([block]), RegionGranularity.BLOCK);

            expect(regions.length).toBe(1);
            expect(regions[0].orientation).toBe(0);
            expect(regions[0].confidence).toBeNull();
        });

        it('should drop low confidence regions', () => {
            const block: RecognizedBlock = createBlock(
                [
                    createLine('Blurry text', firstLineBox, { confidence: 0.2 }),
                    createLine('Sharp text', secondLineBox, { confidence: 0.95 }),
                ],
                blockBox,
            );
            const lineRegions: TextRegion[] = NormalizationUtils.toTextRegions(createEvent([block]), RegionGranularity.LINE);
            const blurryBlock: RecognizedBlock = createBlock([createLine('Blurry text', firstLineBox, { confidence: 0.2 })], firstLineBox);
            const blockRegions: TextRegion[] = NormalizationUtils.toTextRegions(createEvent([blurryBlock]), RegionGranularity.BLOCK);

            expect(lineRegions.map((region: TextRegion) => region.rawText)).toEqual(['Sharp text']);
            expect(blockRegions.length).toBe(0);
        });

        it('should drop regions that are too small', () => {
            const tinyBox: PixelRect = { bottom: 21, left: 10, right: 11, top: 20 };
            const block: RecognizedBlock = createBlock([createLine('Tiny print', tinyBox)], tinyBox);

            expect(NormalizationUtils.toTextRegions(createEvent([block]), RegionGranularity.BLOCK).length).toBe(0);
        });

        it('should drop regions without letters', () => {
            const block: RecognizedBlock = createBlock([createLine('12:30 - 45,00', firstLineBox)], firstLineBox);

            expect(NormalizationUtils.toTextRegions(createEvent([block]), RegionGranularity.BLOCK).length).toBe(0);
        });

        it('should drop regions shorter than the minimum length', () => {
            const block: RecognizedBlock = createBlock([createLine(' A ', firstLineBox)], firstLineBox);

            expect(NormalizationUtils.toTextRegions(createEvent([block]), RegionGranularity.BLOCK).length).toBe(0);
        });

        it('should keep short accented words', () => {
            const block: RecognizedBlock = createBlock([createLine('Café', firstLineBox)], firstLineBox);
            const regions: TextRegion[] = NormalizationUtils.toTextRegions(createEvent([block]), RegionGranularity.BLOCK);

            expect(regions.map((region: TextRegion) => region.rawText)).toEqual(['Café']);
        });

        describe('noise filtering', () => {
            function stackedBox(index: number, left: number = 10): PixelRect {
                const top: number = 10 + index * 14;

                return { bottom: top + 10, left: left, right: 90, top: top };
            }

            function readableTexts(texts: string[], granularity: RegionGranularity = RegionGranularity.LINE): string[] {
                const blocks: RecognizedBlock[] = texts.map((text: string, index: number) =>
                    createBlock([createLine(text, stackedBox(index))], stackedBox(index)),
                );

                return NormalizationUtils.toTextRegions(createEvent(blocks), granularity).map((region: TextRegion) => region.rawText);
            }

            it('should drop the OCR garbage of a photographed menu', () => {
                const garbage: string[] = ['... 1J', 'www.solinguain', '[ ]', '......', 'R$ 12,90', '|| ;. ~ ii', 'Tel: 3456-7890'];

                expect(readableTexts(garbage)).toEqual([]);
                expect(readableTexts(garbage, RegionGranularity.BLOCK)).toEqual([]);
            });

            it('should keep real short words and dish names', () => {
                const words: string[] = ['Água', 'Soda', 'Menu', 'Carne assada', 'Fried chicken', 'Café'];

                expect(readableTexts(words)).toEqual(words);
            });

            it('should keep dish names followed by their price', () => {
                const dishes: string[] = ['Suco 10,50', 'Lasanha ..... R$ 32,90', 'Pizza grande 45,90', 'Coca-Cola 2L'];

                expect(readableTexts(dishes)).toEqual(dishes);
            });

            it('should drop web addresses and e-mail addresses', () => {
                const addresses: string[] = [
                    'http://cardapio.example',
                    'https://example.org/menu',
                    'Visit www.restaurant.example',
                    'contato@restaurante.example',
                    'solinguain.com.br',
                    'restaurante.net',
                ];

                expect(readableTexts(addresses)).toEqual([]);
            });

            it('should drop text with fewer than three letters', () => {
                expect(readableTexts(['Ok', 'A1', 'Sal'])).toEqual(['Sal']);
            });

            it('should drop text where symbols outnumber the letters', () => {
                expect(readableTexts(['#%& abc *+=', '(Bebidas)'])).toEqual(['(Bebidas)']);
            });

            it('should drop lines read with a confidence below one half', () => {
                const blocks: RecognizedBlock[] = [
                    createBlock([createLine('Grilled salmon', stackedBox(0), { confidence: 0.49 })], stackedBox(0)),
                    createBlock([createLine('Fresh salad', stackedBox(1), { confidence: 0.5 })], stackedBox(1)),
                ];
                const regions: TextRegion[] = NormalizationUtils.toTextRegions(createEvent(blocks), RegionGranularity.LINE);

                expect(regions.map((region: TextRegion) => region.rawText)).toEqual(['Fresh salad']);
            });

            it('should drop short text that touches the frame edge and keep longer text there', () => {
                const blocks: RecognizedBlock[] = [
                    createBlock([createLine('Menu', stackedBox(0, 0))], stackedBox(0, 0)),
                    createBlock([createLine('Carne assada', stackedBox(1, 0))], stackedBox(1, 0)),
                    createBlock([createLine('Soda', stackedBox(2))], stackedBox(2)),
                ];
                const regions: TextRegion[] = NormalizationUtils.toTextRegions(createEvent(blocks), RegionGranularity.LINE);

                expect(regions.map((region: TextRegion) => region.rawText)).toEqual(['Carne assada', 'Soda']);
            });
        });

        it('should convert the undetermined language to null', () => {
            const undetermined: RecognizedBlock = createBlock([createLine('Menu', firstLineBox, { recognizedLanguage: 'und' })], firstLineBox, {
                recognizedLanguage: 'und',
            });
            const missing: RecognizedBlock = createBlock([createLine('Carta', secondLineBox)], secondLineBox, { recognizedLanguage: null });
            const known: RecognizedBlock = createBlock([createLine('Cardápio', secondLineBox)], secondLineBox, { recognizedLanguage: 'pt' });
            const regions: TextRegion[] = NormalizationUtils.toTextRegions(createEvent([undetermined, missing, known]), RegionGranularity.BLOCK);
            const lineRegions: TextRegion[] = NormalizationUtils.toTextRegions(createEvent([undetermined]), RegionGranularity.LINE);

            expect(regions.map((region: TextRegion) => region.sourceLanguage)).toEqual([null, 'pt']);
            expect(lineRegions[0].sourceLanguage).toBeNull();
        });

        it('should return no regions for an event without blocks', () => {
            expect(NormalizationUtils.toTextRegions(createEvent([]), RegionGranularity.BLOCK)).toEqual([]);
            expect(NormalizationUtils.toTextRegions(createEvent([]), RegionGranularity.LINE)).toEqual([]);
        });

        describe('visible fraction', () => {
            const landscapeFrame: FrameMetadata = createFrame({ imageHeight: 960, imageWidth: 1280, viewHeight: 500, viewWidth: 400 });
            const portraitFrame: FrameMetadata = createFrame({ imageHeight: 1280, imageWidth: 960, viewHeight: 500, viewWidth: 400 });
            const centeredLineBox: PixelRect = { bottom: 440, left: 400, right: 800, top: 400 };
            const cutByLeftEdgeBox: PixelRect = { bottom: 520, left: 0, right: 400, top: 480 };
            const cutByRightEdgeBox: PixelRect = { bottom: 600, left: 900, right: 1280, top: 560 };
            const mostlyVisibleBox: PixelRect = { bottom: 680, left: 200, right: 700, top: 640 };

            function lineTexts(frame: FrameMetadata, boxes: PixelRect[]): string[] {
                const lines: RecognizedLine[] = boxes.map((box: PixelRect, index: number) => createLine(`Sign line ${index}`, box));
                const block: RecognizedBlock = createBlock(lines, { bottom: 680, left: 0, right: 1280, top: 400 });

                return NormalizationUtils.toTextRegions(createEvent([block], frame), RegionGranularity.LINE).map((region: TextRegion) => region.rawText);
            }

            it('should drop a line cut by the left edge of a 4:5 view over a landscape image', () => {
                expect(lineTexts(landscapeFrame, [centeredLineBox, cutByLeftEdgeBox])).toEqual(['Sign line 0']);
            });

            it('should drop a line cut by the right edge of a 4:5 view over a landscape image', () => {
                expect(lineTexts(landscapeFrame, [cutByRightEdgeBox, centeredLineBox])).toEqual(['Sign line 1']);
            });

            it('should drop a thin visible sliver of a longer line', () => {
                expect(lineTexts(landscapeFrame, [{ bottom: 720, left: 1000, right: 1280, top: 560 }])).toEqual([]);
            });

            it('should keep a line that is mostly visible', () => {
                expect(lineTexts(landscapeFrame, [mostlyVisibleBox])).toEqual(['Sign line 0']);
            });

            it('should apply the same rule to mirrored frames', () => {
                const mirroredFrame: FrameMetadata = { ...landscapeFrame, mirrored: true };

                expect(lineTexts(mirroredFrame, [cutByLeftEdgeBox, mostlyVisibleBox, cutByRightEdgeBox])).toEqual(['Sign line 1']);
            });

            it('should keep the clamped rect of a mostly visible line', () => {
                const block: RecognizedBlock = createBlock([createLine('Sign line', mostlyVisibleBox)], mostlyVisibleBox);
                const regions: TextRegion[] = NormalizationUtils.toTextRegions(createEvent([block], landscapeFrame), RegionGranularity.LINE);

                expect(regions.length).toBe(1);
                expectRect(regions[0].normalizedRect, NormalizationUtils.toNormalizedRect(mostlyVisibleBox, landscapeFrame));
                expect(regions[0].normalizedRect.x).toBe(0);
            });

            it('should keep a line slightly cut by the top edge of a portrait image', () => {
                expect(lineTexts(portraitFrame, [{ bottom: 80, left: 200, right: 700, top: 30 }])).toEqual(['Sign line 0']);
            });

            it('should drop a line half cut by the top edge of a portrait image', () => {
                expect(lineTexts(portraitFrame, [{ bottom: 60, left: 200, right: 700, top: 20 }])).toEqual([]);
            });

            it('should drop blocks cut by the frame edge with BLOCK granularity', () => {
                const visibleBlock: RecognizedBlock = createBlock([createLine('Open today', centeredLineBox)], centeredLineBox);
                const cutBlock: RecognizedBlock = createBlock([createLine('Closed on Sunday', cutByRightEdgeBox)], cutByRightEdgeBox);
                const regions: TextRegion[] = NormalizationUtils.toTextRegions(createEvent([cutBlock, visibleBlock], landscapeFrame), RegionGranularity.BLOCK);

                expect(regions.map((region: TextRegion) => region.rawText)).toEqual(['Open today']);
            });

            it('should drop boxes without area', () => {
                expect(lineTexts(createFrame(), [{ bottom: 40, left: 50, right: 50, top: 20 }])).toEqual([]);
            });
        });
    });
});
