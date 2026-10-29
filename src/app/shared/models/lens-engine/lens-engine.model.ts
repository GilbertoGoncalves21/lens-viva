import { PermissionState, PluginListenerHandle } from '@capacitor/core';
import { ScreenRect } from '../geometry/geometry.model';
import { IdentifyLanguageOptions, IdentifyLanguageResponse } from '../language-detection/language-detection.model';
import { RecognitionEvent } from '../recognition/recognition.model';

export interface CameraPermissionStatus {
    camera: PermissionState;
}

export interface DownloadedModelsResponse {
    languages: string[];
}

export enum EngineStatusCode {
    CAMERA_BLACK_FRAMES     = 'CAMERA_BLACK_FRAMES',
    CAMERA_FRAMES_RECOVERED = 'CAMERA_FRAMES_RECOVERED',
    RECOGNITION_LOADING     = 'RECOGNITION_LOADING',
    RECOGNITION_READY       = 'RECOGNITION_READY',
}

export interface EngineStatusEvent {
    code: EngineStatusCode;
}

export interface EngineErrorEvent {
    code: string;
    message: string;
}

export interface LanguageOptions {
    language: string;
}

export interface DownloadModelOptions {
    language: string;
    requireWifi: boolean;
    targetLanguage: string;
}

export interface DownloadedModelsOptions {
    targetLanguage: string;
}

export interface CameraDevice {
    active: boolean;
    cameraId: string;
    label: string;
}

export interface CameraListResponse {
    cameras: CameraDevice[];
}

export interface SelectCameraOptions {
    cameraId: string;
}

export interface EngineCapabilities {
    cameraSelection: boolean;
    languageIdentification: boolean;
    modelRemoval: boolean;
    openAppSettings: boolean;
    translation: boolean;
}

export interface AnalysisRateOptions {
    analysesPerSecond: number;
}

export interface StartCameraOptions {
    analysesPerSecond: number;
    previewHostId: string;
    recognitionLanguages: string[];
    viewport: ScreenRect | null;
}

export interface PreviewViewportOptions {
    viewport: ScreenRect | null;
}

export interface TranslateOptions {
    sourceLanguage: string;
    targetLanguage: string;
    text: string;
}

export interface TranslateResponse {
    translatedText: string;
}

export interface LensEnginePlugin {
    addListener(eventName: 'engineError', listener: (event: EngineErrorEvent) => void): Promise<PluginListenerHandle>;
    addListener(eventName: 'engineStatus', listener: (event: EngineStatusEvent) => void): Promise<PluginListenerHandle>;
    addListener(eventName: 'textRecognized', listener: (event: RecognitionEvent) => void): Promise<PluginListenerHandle>;
    checkPermissions(): Promise<CameraPermissionStatus>;
    deleteModel(options: LanguageOptions): Promise<void>;
    downloadModel(options: DownloadModelOptions): Promise<void>;
    freezeFrame(): Promise<void>;
    getCapabilities(): Promise<EngineCapabilities>;
    getDownloadedModels(options: DownloadedModelsOptions): Promise<DownloadedModelsResponse>;
    identifyLanguage(options: IdentifyLanguageOptions): Promise<IdentifyLanguageResponse>;
    listCameras(): Promise<CameraListResponse>;
    openAppSettings(): Promise<void>;
    pauseAnalysis(): Promise<void>;
    requestPermissions(): Promise<CameraPermissionStatus>;
    resumeAnalysis(): Promise<void>;
    selectCamera(options: SelectCameraOptions): Promise<void>;
    setAnalysisRate(options: AnalysisRateOptions): Promise<void>;
    setPreviewViewport(options: PreviewViewportOptions): Promise<void>;
    startCamera(options: StartCameraOptions): Promise<void>;
    stopCamera(): Promise<void>;
    translate(options: TranslateOptions): Promise<TranslateResponse>;
    unfreezeFrame(): Promise<void>;
}
