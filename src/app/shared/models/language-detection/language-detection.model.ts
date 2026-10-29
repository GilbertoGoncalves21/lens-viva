export interface IdentifyLanguageOptions {
    text: string;
}

export interface IdentifyLanguageResponse {
    confidence: number;
    language: string;
}

export interface LanguageDetection {
    confidence: number;
    language: string | null;
    reliable: boolean;
}

export enum SceneLanguageStatus {
    FIXED        = 'FIXED',
    IDENTIFIED   = 'IDENTIFIED',
    IDENTIFYING  = 'IDENTIFYING',
    IDLE         = 'IDLE',
    MANUAL       = 'MANUAL',
    UNDETERMINED = 'UNDETERMINED',
}

export interface SceneLanguageState {
    confidence: number;
    language: string | null;
    status: SceneLanguageStatus;
}
