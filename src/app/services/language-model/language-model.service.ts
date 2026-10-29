import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, distinctUntilChanged, map } from 'rxjs';
import { AppSettings, EngineCapabilities, LanguagePair, ModelInventory } from 'src/app/shared/models';
import { AUTO_LANGUAGE } from 'src/app/shared/utils';
import { LensEngineService } from '../lens-engine/lens-engine.service';
import { LoggerService } from '../logger/logger.service';
import { PreferencesService } from '../preferences/preferences.service';
import { OnlineTranslationService } from '../online-translation/online-translation.service';

@Injectable({
    providedIn: 'root'
})
export class LanguageModelService {
    private _appliedQuery: number = 0;
    private _downloads: Map<string, Promise<void>> = new Map<string, Promise<void>>();
    private _inventory$: BehaviorSubject<ModelInventory> = new BehaviorSubject<ModelInventory>({ downloaded: [], downloading: [] });
    private _inventoryTarget: string | null = null;
    private _queryCount: number = 0;

    constructor(
        private lensEngineService: LensEngineService,
        private loggerService: LoggerService,
        private preferencesService: PreferencesService,
        private onlineTranslationService: OnlineTranslationService,
    ) {
        this.preferencesService.settingsChanges()
            .pipe(
                map((settings: AppSettings) => settings.targetLanguage),
                distinctUntilChanged(),
            )
            .subscribe((targetLanguage: string) => this.handleTargetChange(targetLanguage));
    }

    get inventory(): ModelInventory {
        return this._inventory$.value;
    }

    changes(): Observable<ModelInventory> {
        return this._inventory$.asObservable();
    }

    download(language: string, requireWifi: boolean): Promise<void> {
        const targetLanguage: string = this.preferencesService.settings.targetLanguage;
        const key: string = this.downloadKey(language, targetLanguage);
        const inProgress: Promise<void> | undefined = this._downloads.get(key);

        if (inProgress) {
            return inProgress;
        }

        const download: Promise<void> = this.performDownload(language, requireWifi, targetLanguage).finally(() => this._downloads.delete(key));

        this._downloads.set(key, download);

        return download;
    }

    isDownloaded(language: string): boolean {
        return this.inventory.downloaded.includes(language);
    }

    async missingLanguages(languagePair: LanguagePair): Promise<string[]> {
        if (this.onlineTranslationService.available) {
            return [];
        }
        const downloaded: string[] = await this.query(languagePair.targetLanguage);

        return [languagePair.sourceLanguage, languagePair.targetLanguage]
            .filter((language: string) => language !== AUTO_LANGUAGE)
            .filter((language: string, index: number, languages: string[]) => languages.indexOf(language) === index)
            .filter((language: string) => !downloaded.includes(language));
    }

    refresh(): Promise<string[]> {
        return this.query(this.preferencesService.settings.targetLanguage);
    }

    async remove(language: string): Promise<void> {
        try {
            await this.lensEngineService.deleteModel(language);
        } catch (error: unknown) {
            this.loggerService.error('model-remove-failed', error, { language: language });
            await this.refresh().catch((refreshError: unknown) => this.loggerService.error('model-refresh-failed', refreshError));
            throw error;
        }

        await this.refresh();
    }

    async supportsRemoval(): Promise<boolean> {
        const capabilities: EngineCapabilities = await this.lensEngineService.getCapabilities();

        return capabilities.modelRemoval;
    }

    private downloadKey(language: string, targetLanguage: string): string {
        return `${targetLanguage}:${language}`;
    }

    private handleTargetChange(targetLanguage: string): void {
        if (this._inventoryTarget === null || this._inventoryTarget === targetLanguage) {
            return;
        }

        this._inventoryTarget = targetLanguage;
        this._inventory$.next({ ...this._inventory$.value, downloaded: [] });
        this.refresh().catch((error: unknown) => this.loggerService.error('model-refresh-failed', error));
    }

    private async performDownload(language: string, requireWifi: boolean, targetLanguage: string): Promise<void> {
        this.updateDownloading(language, true);

        try {
            await this.lensEngineService.downloadModel(language, requireWifi, targetLanguage);
            await this.refresh();
        } catch (error: unknown) {
            this.loggerService.error('model-download-failed', error, { language: language });
            throw error;
        } finally {
            this.updateDownloading(language, false);
        }
    }

    private async query(targetLanguage: string): Promise<string[]> {
        const queryNumber: number = ++this._queryCount;
        const downloaded: string[] = await this.lensEngineService.getDownloadedModels(targetLanguage);

        if (queryNumber > this._appliedQuery && targetLanguage === this.preferencesService.settings.targetLanguage) {
            this._appliedQuery = queryNumber;
            this._inventoryTarget = targetLanguage;
            this._inventory$.next({ ...this._inventory$.value, downloaded: downloaded });
        }

        return downloaded;
    }

    private updateDownloading(language: string, downloading: boolean): void {
        const current: string[] = this._inventory$.value.downloading.filter((item: string) => item !== language);

        this._inventory$.next({
            ...this._inventory$.value,
            downloading: downloading ? [...current, language] : current,
        });
    }
}
