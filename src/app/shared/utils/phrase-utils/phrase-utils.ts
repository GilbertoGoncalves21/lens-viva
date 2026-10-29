import { PixelRect, RecognizedBlock } from '../../models';
import { TextUtils } from '../text-utils/text-utils';

/** Join visual lines belonging to the same paragraph, never neighbouring columns. */
export class PhraseUtils {
    static paragraphs(blocks: RecognizedBlock[]): RecognizedBlock[] {
        const paragraphs: RecognizedBlock[] = [];
        const rows = this.rows(blocks);
        const angle = this.angleOf([...rows].sort((a, b) => b.text.length - a.text.length)[0]);
        const ordered = [...rows].sort((first, second) => {
            const a = this.inReadingAxes(first, angle);
            const b = this.inReadingAxes(second, angle);
            return a.top - b.top || a.left - b.left;
        });

        for (const block of ordered) {
            const previous = [...paragraphs]
                .reverse()
                .find((candidate) => this.continues(candidate, block));
            if (previous === undefined) {
                paragraphs.push({ ...block });
                continue;
            }
            Object.assign(previous, this.merge(previous, block, false));
        }
        return paragraphs;
    }

    /** Reassemble OCR fragments on one baseline before any sentence or menu decision. */
    static rows(blocks: RecognizedBlock[]): RecognizedBlock[] {
        const rows: RecognizedBlock[] = [];
        const angle = this.angleOf([...blocks].sort((a, b) => b.text.length - a.text.length)[0]);
        const ordered = [...blocks].sort(
            (a, b) => this.inReadingAxes(a, angle).left - this.inReadingAxes(b, angle).left,
        );
        for (const block of ordered) {
            const row = rows.find((candidate) => this.sameRow(candidate, block));
            if (!row) {
                rows.push({ ...block });
            } else {
                Object.assign(row, this.merge(row, block, true));
            }
        }
        return rows;
    }

    private static sameRow(first: RecognizedBlock, next: RecognizedBlock): boolean {
        if (first.lines.length !== 1 || next.lines.length !== 1 || !this.compatible(first, next))
            return false;
        const a = this.inReadingAxes(first, this.angleOf(first));
        const b = this.inReadingAxes(next, this.angleOf(first));
        const height = Math.max(a.bottom - a.top, b.bottom - b.top);
        const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        const narrowHeight = Math.min(a.bottom - a.top, b.bottom - b.top);
        const gap = b.left - a.right;
        return (
            height > 0 &&
            narrowHeight / height >= 0.6 &&
            overlap >= narrowHeight * 0.6 &&
            gap >= -height * 0.1 &&
            gap <= height * 0.75
        );
    }

    private static angleOf(block: RecognizedBlock | undefined): number {
        const angles = block?.lines.map((line) => line.angle).filter(Number.isFinite) ?? [];
        return angles.length ? angles.reduce((sum, angle) => sum + angle, 0) / angles.length : 0;
    }

    private static compatible(first: RecognizedBlock, next: RecognizedBlock): boolean {
        const sameScriptDirection = Math.abs(this.angleOf(first) - this.angleOf(next)) <= 12;
        // Language identification on isolated words is unreliable; decide after assembling a phrase.
        const longBlocks =
            first.text.replace(/\s/gu, '').length >= 12 &&
            next.text.replace(/\s/gu, '').length >= 12;
        const languagesAgree =
            !longBlocks ||
            !first.recognizedLanguage ||
            !next.recognizedLanguage ||
            first.recognizedLanguage === next.recognizedLanguage;
        return sameScriptDirection && languagesAgree;
    }

    private static inReadingAxes(block: RecognizedBlock, angle: number): PixelRect {
        const radians = (angle * Math.PI) / 180;
        const cosine = Math.cos(radians),
            sine = Math.sin(radians);
        const { left, right, top, bottom } = block.boundingBox;
        const corners = [
            [left, top],
            [right, top],
            [left, bottom],
            [right, bottom],
        ];
        const x = corners.map(([x, y]) => x * cosine + y * sine);
        const y = corners.map(([x, y]) => -x * sine + y * cosine);
        return {
            left: Math.min(...x),
            right: Math.max(...x),
            top: Math.min(...y),
            bottom: Math.max(...y),
        };
    }

    private static merge(
        first: RecognizedBlock,
        next: RecognizedBlock,
        sameRow: boolean,
    ): RecognizedBlock {
        const box = this.union(first.boundingBox, next.boundingBox);
        const axes = this.inReadingAxes({ ...first, boundingBox: box }, this.angleOf(first));
        const text = TextUtils.normalize(`${first.text} ${next.text}`);
        const lines = [...first.lines, ...next.lines];
        const confidence = lines
            .map((line) => line.confidence)
            .filter((value): value is number => value !== null);
        return {
            ...first,
            recognizedLanguage: first.recognizedLanguage ?? next.recognizedLanguage,
            text,
            boundingBox: box,
            orientedWidth: axes.right - axes.left,
            orientedHeight: axes.bottom - axes.top,
            lines: sameRow
                ? [
                      {
                          text,
                          boundingBox: box,
                          angle: this.angleOf(first),
                          confidence: confidence.length
                              ? confidence.reduce((sum, value) => sum + value, 0) /
                                confidence.length
                              : null,
                          orientedWidth: axes.right - axes.left,
                          orientedHeight: axes.bottom - axes.top,
                          recognizedLanguage: first.recognizedLanguage ?? next.recognizedLanguage,
                      },
                  ]
                : lines,
        };
    }

    private static continues(first: RecognizedBlock, next: RecognizedBlock): boolean {
        if (/[.!?。！？][”’"']?$/u.test(first.text.trim())) {
            return false;
        }
        if (!this.compatible(first, next)) {
            return false;
        }
        const angle = this.angleOf(first);
        const a = this.inReadingAxes(first, angle);
        const b = this.inReadingAxes(next, angle);
        const lineHeight = (block: RecognizedBlock) => {
            const box = this.inReadingAxes(block, angle);
            return (box.bottom - box.top) / Math.max(1, block.lines.length);
        };
        const firstHeight = lineHeight(first);
        const nextHeight = lineHeight(next);
        const size = Math.max(firstHeight, nextHeight);
        const gap = b.top - a.bottom;
        const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const narrowWidth = Math.min(a.right - a.left, b.right - b.left);
        const aligned =
            Math.abs(a.left - b.left) <= size ||
            Math.abs((a.left + a.right - b.left - b.right) / 2) <= size;

        return (
            size > 0 &&
            Math.min(firstHeight, nextHeight) / size >= 0.6 &&
            gap >= 0 &&
            gap <= size * 1.25 &&
            narrowWidth > 0 &&
            overlap / narrowWidth >= 0.65 &&
            aligned
        );
    }

    private static union(first: PixelRect, second: PixelRect): PixelRect {
        return {
            left: Math.min(first.left, second.left),
            right: Math.max(first.right, second.right),
            top: Math.min(first.top, second.top),
            bottom: Math.max(first.bottom, second.bottom),
        };
    }
}
