export enum LensEngineErrorCode {
    CAMERA_BLOCKED_BY_SYSTEM       = 'CAMERA_BLOCKED_BY_SYSTEM',
    CAMERA_ERROR                   = 'CAMERA_ERROR',
    CAMERA_NOT_STARTED             = 'CAMERA_NOT_STARTED',
    CAMERA_SELECTION_UNSUPPORTED   = 'CAMERA_SELECTION_UNSUPPORTED',
    CAMERA_UNAVAILABLE             = 'CAMERA_UNAVAILABLE',
    LANGUAGE_IDENTIFICATION_FAILED = 'LANGUAGE_IDENTIFICATION_FAILED',
    MODEL_DELETE_UNSUPPORTED       = 'MODEL_DELETE_UNSUPPORTED',
    MODEL_DOWNLOAD_FAILED          = 'MODEL_DOWNLOAD_FAILED',
    MODEL_MISSING                  = 'MODEL_MISSING',
    OCR_FAILED                     = 'OCR_FAILED',
    PERMISSION_DENIED              = 'PERMISSION_DENIED',
    SETTINGS_UNAVAILABLE           = 'SETTINGS_UNAVAILABLE',
    TRANSLATION_FAILED             = 'TRANSLATION_FAILED',
    TRANSLATION_UNSUPPORTED        = 'TRANSLATION_UNSUPPORTED',
    UNSUPPORTED_LANGUAGE           = 'UNSUPPORTED_LANGUAGE',
    USER_ACTIVATION_REQUIRED       = 'USER_ACTIVATION_REQUIRED',
}

export class LensEngineWebError extends Error {
    private _code: LensEngineErrorCode;

    constructor(code: LensEngineErrorCode, message: string) {
        super(message);
        this._code = code;
        this.name = 'LensEngineWebError';
    }

    get code(): LensEngineErrorCode {
        return this._code;
    }
}
