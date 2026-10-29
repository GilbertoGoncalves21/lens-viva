import { Inject, Injectable } from '@angular/core';
import { GetResult, PreferencesPlugin } from '@capacitor/preferences';
import { BehaviorSubject, Observable } from 'rxjs';
import { AppSettings, LanguagePair, RegionGranularity } from 'src/app/shared/models';
import {
    AUTO_LANGUAGE
,   DEFAULT_ANALYSES_PER_SECOND
,   DEFAULT_BALLOON_FONT_SCALE
,   EMPTY
,   LanguageUtils
} from 'src/app/shared/utils';
import { PREFERENCES_PLUGIN } from '../capacitor/capacitor-plugins';

const REVISED_SETTINGS: (keyof AppSettings)[] = ['regionGranularity'];

const SETTINGS_KEY: string = 'lens-viva.settings';

const SETTINGS_REVISION: string = '3';

const SETTINGS_REVISION_KEY: string = 'lens-viva.settings-revision';

@Injectable({
    providedIn: 'root'
})
export class PreferencesService {
    private _deviceLanguageTag: string | null = null;
    private _settings$: BehaviorSubject<AppSettings> = new BehaviorSubject<AppSettings>(
        PreferencesService.defaultSettings(LanguageUtils.resolveDefaultLanguagePair(null)),
    );
    private _tasks: Promise<void> = Promise.resolve();

    constructor(
        @Inject(PREFERENCES_PLUGIN) private preferencesPlugin: PreferencesPlugin,
    ) {}

    get settings(): AppSettings {
        return this._settings$.value;
    }

    static defaultSettings(languagePair: LanguagePair): AppSettings {
        return {
            analysesPerSecond: DEFAULT_ANALYSES_PER_SECOND,
            appLanguage: AUTO_LANGUAGE,
            balloonFontScale: DEFAULT_BALLOON_FONT_SCALE,
            historyEnabled: false,
            languageConfirmedFor: EMPTY,
            regionGranularity: RegionGranularity.BLOCK,
            requireWifiForDownloads: false,
            showDebugRegions: false,
            sourceLanguage: languagePair.sourceLanguage,
            targetLanguage: languagePair.targetLanguage,
        };
    }

    load(deviceLanguageTag: string): Promise<AppSettings> {
        return this.schedule(async (): Promise<AppSettings> => {
            this._deviceLanguageTag = deviceLanguageTag;

            const defaults: AppSettings = this.deviceDefaults();
            const stored: Partial<AppSettings> = await this.applyRevision(await this.readStored(defaults));
            const settings: AppSettings = { ...defaults, ...stored };

            this._settings$.next(settings);

            return settings;
        });
    }

    reset(): Promise<void> {
        return this.schedule(async (): Promise<void> => {
            await this.preferencesPlugin.remove({ key: SETTINGS_KEY });
            this._settings$.next(this.deviceDefaults());
        });
    }

    settingsChanges(): Observable<AppSettings> {
        return this._settings$.asObservable();
    }

    update(changes: Partial<AppSettings>): Promise<AppSettings> {
        return this.schedule(async (): Promise<AppSettings> => {
            const settings: AppSettings = { ...this._settings$.value, ...changes };

            await this.preferencesPlugin.set({ key: SETTINGS_KEY, value: JSON.stringify(settings) });
            this._settings$.next(settings);

            return settings;
        });
    }

    private async applyRevision(stored: Partial<AppSettings>): Promise<Partial<AppSettings>> {
        try {
            const revision: GetResult = await this.preferencesPlugin.get({ key: SETTINGS_REVISION_KEY });

            if (revision.value === SETTINGS_REVISION) {
                return stored;
            }

            const revised: Partial<AppSettings> = { ...stored };

            REVISED_SETTINGS.forEach((key: keyof AppSettings) => delete revised[key]);

            if (Object.keys(stored).length > 0) {
                await this.preferencesPlugin.set({ key: SETTINGS_KEY, value: JSON.stringify(revised) });
            }

            await this.preferencesPlugin.set({ key: SETTINGS_REVISION_KEY, value: SETTINGS_REVISION });

            return revised;
        } catch {
            return stored;
        }
    }

    private deviceDefaults(): AppSettings {
        return PreferencesService.defaultSettings(LanguageUtils.resolveDefaultLanguagePair(this._deviceLanguageTag));
    }

    private async readStored(defaults: AppSettings): Promise<Partial<AppSettings>> {
        try {
            const result: GetResult = await this.preferencesPlugin.get({ key: SETTINGS_KEY });

            return result.value ? this.sanitize(JSON.parse(result.value) as unknown, defaults) : {};
        } catch {
            return {};
        }
    }

    private sanitize(stored: unknown, defaults: AppSettings): Partial<AppSettings> {
        if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
            return {};
        }

        const values: Record<string, unknown> = stored as Record<string, unknown>;
        const entries: [string, unknown][] = Object.entries(defaults)
            .filter(([key, defaultValue]: [string, unknown]) => typeof values[key] === typeof defaultValue)
            .map(([key]: [string, unknown]): [string, unknown] => [key, values[key]]);
        const sanitized: Partial<AppSettings> = Object.fromEntries(entries) as Partial<AppSettings>;
        for (const key of ['onlineTranslationUrl', 'onlineTranslationToken'] as const) {
            if (typeof values[key] === 'string') {
                sanitized[key] = values[key];
            }
        }
        const granularities: string[] = Object.values(RegionGranularity);

        if (sanitized.regionGranularity !== undefined && !granularities.includes(sanitized.regionGranularity)) {
            delete sanitized.regionGranularity;
        }

        return sanitized;
    }

    private schedule<T>(task: () => Promise<T>): Promise<T> {
        const result: Promise<T> = this._tasks.then(task);

        this._tasks = result.then((): void => undefined, (): void => undefined);

        return result;
    }
}
