import { NormalizedRect } from '../geometry/geometry.model';

export interface TextRegion {
    confidence: number | null;
    frameTimestamp: number;
    normalizedRect: NormalizedRect;
    orientation: number;
    orientedHeight: number;
    orientedWidth: number;
    rawText: string;
    regionId: string;
    sourceLanguage: string | null;
}
