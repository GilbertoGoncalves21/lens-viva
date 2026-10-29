import { LanguagePair } from '../language/language.model';

export enum SessionStatus {
    CAMERA_BLOCKED     = 'CAMERA_BLOCKED',
    ERROR              = 'ERROR',
    FROZEN             = 'FROZEN',
    IDLE               = 'IDLE',
    MODEL_MISSING      = 'MODEL_MISSING',
    PAUSED             = 'PAUSED',
    PERMISSION_BLOCKED = 'PERMISSION_BLOCKED',
    PERMISSION_DENIED  = 'PERMISSION_DENIED',
    RUNNING            = 'RUNNING',
    STARTING           = 'STARTING',
}

export interface SessionState {
    languagePair: LanguagePair;
    missingLanguages: string[];
    status: SessionStatus;
}
