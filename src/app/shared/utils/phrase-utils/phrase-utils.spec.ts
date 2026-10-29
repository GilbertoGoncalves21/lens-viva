import { RecognizedBlock } from '../../models';
import { PhraseUtils } from './phrase-utils';

function block(text: string, top: number, left: number = 20, right: number = 240): RecognizedBlock {
    const boundingBox = { top, bottom: top + 30, left, right };
    return {
        text, boundingBox, orientedHeight: 30, orientedWidth: right - left, recognizedLanguage: 'en',
        lines: [{ text, boundingBox, angle: 0, confidence: 0.9, orientedHeight: 30, orientedWidth: right - left, recognizedLanguage: 'en' }],
    };
}

describe('PhraseUtils', () => {
    it('should assemble a full sentence from separate centered OCR blocks', () => {
        const input = [block('Everything', 20), block('happens for', 65), block('a reason.', 110, 50, 210)];
        const result = PhraseUtils.paragraphs(input);
        expect(result).toHaveLength(1);
        expect(result[0].text).toBe('Everything happens for a reason.');
        expect(result[0].lines).toHaveLength(3);
        expect(input[0].text).toBe('Everything');
    });

    it('should preserve independent columns and paragraphs', () => {
        expect(PhraseUtils.paragraphs([block('One column', 20, 10, 100), block('Another column', 65, 180, 270)])).toHaveLength(2);
        expect(PhraseUtils.paragraphs([block('First paragraph.', 20), block('Second paragraph', 65)])).toHaveLength(2);
        expect(PhraseUtils.paragraphs([block('First heading', 20), block('Distant text', 180)])).toHaveLength(2);
    });
});
