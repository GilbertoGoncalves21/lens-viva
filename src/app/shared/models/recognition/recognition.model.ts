import { FrameMetadata } from '../frame-metadata/frame-metadata.model';
import { PixelRect } from '../geometry/geometry.model';

export interface RecognizedLine {
    angle: number;
    boundingBox: PixelRect;
    confidence: number | null;
    orientedHeight: number;
    orientedWidth: number;
    recognizedLanguage: string | null;
    text: string;
}

export interface RecognizedBlock {
    boundingBox: PixelRect;
    lines: RecognizedLine[];
    orientedHeight: number;
    orientedWidth: number;
    recognizedLanguage: string | null;
    text: string;
}

export interface RecognitionEvent {
    blocks: RecognizedBlock[];
    frame: FrameMetadata;
}
