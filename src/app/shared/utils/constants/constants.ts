export const EMPTY: string = '';

export const AUTO_LANGUAGE: string = 'auto';

export const DEFAULT_APP_LANGUAGE: string = 'en';

export const SUPPORTED_APP_LANGUAGES: string[] = ['de', 'en', 'es', 'fr', 'it', 'ja', 'pt'];

export const BUILT_IN_MODEL_LANGUAGE: string = 'en';

export const TRANSLATION_LANGUAGES: string[] = [
    'af', 'ar', 'be', 'bg', 'bn', 'ca', 'cs', 'cy', 'da', 'de', 'el', 'en', 'eo', 'es', 'et', 'fa', 'fi', 'fr', 'ga', 'gl',
    'gu', 'he', 'hi', 'hr', 'ht', 'hu', 'id', 'is', 'it', 'ja', 'ka', 'kn', 'ko', 'lt', 'lv', 'mk', 'mr', 'ms', 'mt', 'nl',
    'no', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sq', 'sv', 'sw', 'ta', 'te', 'th', 'tl', 'tr', 'uk', 'ur', 'vi', 'zh',
];

export const LATIN_SOURCE_LANGUAGES: string[] = [
    'af', 'ca', 'cs', 'cy', 'da', 'de', 'en', 'eo', 'es', 'et', 'fi', 'fr', 'ga', 'gl', 'hr', 'ht', 'hu', 'id', 'is', 'it',
    'lt', 'lv', 'ms', 'mt', 'nl', 'no', 'pl', 'pt', 'ro', 'sk', 'sl', 'sq', 'sv', 'sw', 'tl', 'tr', 'vi',
];

export const RECOGNITION_SOURCE_LANGUAGES: string[] = [...LATIN_SOURCE_LANGUAGES, 'hi', 'ja', 'ko', 'mr', 'zh'];

export const LANGUAGE_ALIASES: Record<string, string> = {
    fil: 'tl',
    in: 'id',
    iw: 'he',
    nb: 'no',
    nn: 'no',
};

export const DEFAULT_ANALYSES_PER_SECOND: number = 3;

export const MIN_ANALYSES_PER_SECOND: number = 1;

export const MAX_ANALYSES_PER_SECOND: number = 5;

export const DEFAULT_BALLOON_FONT_SCALE: number = 1;

export const LENS_FRAME_RADIUS_PIXELS: number = 28;

export const PREVIEW_VIEWPORT_TOLERANCE: number = 0.5;

export const EXPIRY_TICK_MILLISECONDS: number = 250;

export const TRACKING_CONFIG: {
    deduplicationMinIntersection: number;
    deduplicationMinTextSimilarity: number;
    expireAfterAnalysisIntervals: number;
    expireAfterMilliseconds: number;
    matchMaxCenterDistance: number;
    matchMinIntersection: number;
    matchMinTextSimilarity: number;
    movementThreshold: number;
    removeAfterMilliseconds: number;
    smoothingFactor: number;
    stabilityIncrement: number;
    supersedeMinOverlap: number;
    textChangeSimilarity: number;
} = {
    deduplicationMinIntersection: 0.6,
    deduplicationMinTextSimilarity: 0.8,
    expireAfterAnalysisIntervals: 2.5,
    expireAfterMilliseconds: 1200,
    matchMaxCenterDistance: 0.08,
    matchMinIntersection: 0.15,
    matchMinTextSimilarity: 0.5,
    movementThreshold: 0.012,
    removeAfterMilliseconds: 1800,
    smoothingFactor: 0.35,
    stabilityIncrement: 0.25,
    supersedeMinOverlap: 0.3,
    textChangeSimilarity: 0.85,
};

export const RECOGNITION_FILTER: {
    edgeMargin: number;
    edgeMinLetters: number;
    minArea: number;
    minConfidence: number;
    minLetterShare: number;
    minLetters: number;
    minVisibleFraction: number;
} = {
    edgeMargin: 0.01,
    edgeMinLetters: 5,
    minArea: 0.0004,
    minConfidence: 0.5,
    minLetterShare: 0.5,
    minLetters: 3,
    minVisibleFraction: 0.6,
};

export const TRANSLATION_CACHE_CONFIG: { maxEntries: number; timeToLiveMilliseconds: number } = {
    maxEntries: 500,
    timeToLiveMilliseconds: 10 * 60 * 1000,
};

export const TRANSLATION_RETRY_CONFIG: { delayMilliseconds: number; maxFailedAttempts: number } = {
    delayMilliseconds: 2000,
    maxFailedAttempts: 3,
};

export const TRANSLATION_QUEUE_CONCURRENCY: number = 2;

export const UNDETERMINED_LANGUAGE: string = 'und';

export const LANGUAGE_DETECTION_CONFIG: {
    cacheMaxEntries: number;
    minConfidence: number;
    minLetters: number;
} = {
    cacheMaxEntries: 300,
    minConfidence: 0.5,
    minLetters: 4,
};

export const HISTORY_CONFIG: {
    maxEntries: number;
    minTextLength: number;
    persistDelayMilliseconds: number;
    storageKey: string;
} = {
    maxEntries: 200,
    minTextLength: 2,
    persistDelayMilliseconds: 800,
    storageKey: 'lens-viva.history',
};

export const CAMERA_PREVIEW_HOST_ID: string = 'lens-camera-preview';

export const WEB_ENGINE_CONFIG: {
    cameraReadyTimeoutMilliseconds: number;
    maxAnalysesPerSecond: number;
    maxFrameDimension: number;
    minRecognitionConfidence: number;
} = {
    cameraReadyTimeoutMilliseconds: 8000,
    maxAnalysesPerSecond: 1,
    maxFrameDimension: 1280,
    minRecognitionConfidence: 0.35,
};

export const TESSERACT_LANGUAGE_CODES: Record<string, string> = {
    hi: 'hin',
    ja: 'jpn',
    ko: 'kor',
    mr: 'mar',
    zh: 'chi_sim',
    af: 'afr',
    ca: 'cat',
    cs: 'ces',
    cy: 'cym',
    da: 'dan',
    de: 'deu',
    en: 'eng',
    eo: 'epo',
    es: 'spa',
    et: 'est',
    fi: 'fin',
    fr: 'fra',
    ga: 'gle',
    gl: 'glg',
    hr: 'hrv',
    ht: 'hat',
    hu: 'hun',
    id: 'ind',
    is: 'isl',
    it: 'ita',
    lt: 'lit',
    lv: 'lav',
    ms: 'msa',
    mt: 'mlt',
    nl: 'nld',
    no: 'nor',
    pl: 'pol',
    pt: 'por',
    ro: 'ron',
    sk: 'slk',
    sl: 'slv',
    sq: 'sqi',
    sv: 'swe',
    sw: 'swa',
    tl: 'tgl',
    tr: 'tur',
    vi: 'vie',
};

export const SPLASH_CONFIG: { durationMilliseconds: number; exitMilliseconds: number } = {
    durationMilliseconds: 4000,
    exitMilliseconds: 450,
};

export const SCENE_LANGUAGE_CONFIG: {
    lockConfidence: number;
    lockConsecutiveSamples: number;
    maxSampleCharacters: number;
    minConfidence: number;
    minSampleLetters: number;
    negligibleScore: number;
    sampleIntervalMilliseconds: number;
    sceneChangeSimilarity: number;
    scoreDecay: number;
    switchConsecutiveSamples: number;
    undeterminedAfterMilliseconds: number;
} = {
    lockConfidence: 0.75,
    lockConsecutiveSamples: 2,
    maxSampleCharacters: 500,
    minConfidence: 0.5,
    minSampleLetters: 24,
    negligibleScore: 0.01,
    sampleIntervalMilliseconds: 1500,
    sceneChangeSimilarity: 0.5,
    scoreDecay: 0.6,
    switchConsecutiveSamples: 3,
    undeterminedAfterMilliseconds: 6000,
};
