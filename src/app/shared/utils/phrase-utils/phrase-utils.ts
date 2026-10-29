import { PixelRect, RecognizedBlock } from '../../models';
import { TextUtils } from '../text-utils/text-utils';

/** Join visual lines belonging to the same paragraph, never neighbouring columns. */
export class PhraseUtils {
    static paragraphs(blocks: RecognizedBlock[]): RecognizedBlock[] {
        const paragraphs: RecognizedBlock[] = [];
        const ordered = [...blocks].sort((first, second) => first.boundingBox.top - second.boundingBox.top || first.boundingBox.left - second.boundingBox.left);

        for (const block of ordered) {
            const previous = [...paragraphs].reverse().find((candidate) => this.continues(candidate, block));
            if (previous === undefined) {
                paragraphs.push({ ...block });
                continue;
            }
            const box = this.union(previous.boundingBox, block.boundingBox);
            previous.text = TextUtils.normalize(`${previous.text} ${block.text}`);
            previous.lines = [...previous.lines, ...block.lines];
            previous.boundingBox = box;
            previous.orientedWidth = box.right - box.left;
            previous.orientedHeight = box.bottom - box.top;
        }
        return paragraphs;
    }

    private static continues(first: RecognizedBlock, next: RecognizedBlock): boolean {
        if (/[.!?。！？][”’"']?$/u.test(first.text.trim())) {
            return false;
        }
        if (first.recognizedLanguage && next.recognizedLanguage && first.recognizedLanguage !== next.recognizedLanguage) {
            return false;
        }
        const a = first.boundingBox;
        const b = next.boundingBox;
        const lineHeight = (block: RecognizedBlock) => (block.boundingBox.bottom - block.boundingBox.top) / Math.max(1, block.lines.length);
        const firstHeight = lineHeight(first);
        const nextHeight = lineHeight(next);
        const size = Math.max(firstHeight, nextHeight);
        const gap = b.top - a.bottom;
        const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const narrowWidth = Math.min(a.right - a.left, b.right - b.left);
        const aligned = Math.abs(a.left - b.left) <= size || Math.abs((a.left + a.right - b.left - b.right) / 2) <= size;
        const upright = [...first.lines, ...next.lines].every((line) => Math.abs(line.angle) <= 7);

        return size > 0 && Math.min(firstHeight, nextHeight) / size >= 0.6
            && gap >= 0 && gap <= size * 1.25
            && narrowWidth > 0 && overlap / narrowWidth >= 0.65 && aligned && upright;
    }

    private static union(first: PixelRect, second: PixelRect): PixelRect {
        return {
            left: Math.min(first.left, second.left), right: Math.max(first.right, second.right),
            top: Math.min(first.top, second.top), bottom: Math.max(first.bottom, second.bottom),
        };
    }
}
