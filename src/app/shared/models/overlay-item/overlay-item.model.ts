import { NormalizedRect } from '../geometry/geometry.model';

export enum OverlayStatus {
    DETECTING     = 'DETECTING',
    ERROR         = 'ERROR',
    EXPIRING      = 'EXPIRING',
    MODEL_MISSING = 'MODEL_MISSING',
    READING       = 'READING',
    TRANSLATED    = 'TRANSLATED',
    TRANSLATING   = 'TRANSLATING',
    UNDETERMINED  = 'UNDETERMINED',
}

export interface OverlayItem {
    anchorRect: NormalizedRect;
    candidateText: string;
    failedAt: number | null;
    failedAttempts: number;
    firstSeenAt: number;
    lastSeenAt: number;
    observedRect: NormalizedRect;
    orientation: number;
    orientedHeight: number;
    orientedWidth: number;
    originalText: string;
    regionId: string;
    showOriginal: boolean;
    sourceLanguage: string | null;
    stabilityScore: number;
    status: OverlayStatus;
    textVersion: number;
    translatedText: string;
}

export interface ReconcileResult {
    items: OverlayItem[];
    pendingTranslations: OverlayItem[];
}
