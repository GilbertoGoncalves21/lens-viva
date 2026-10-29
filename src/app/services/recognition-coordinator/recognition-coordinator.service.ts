import { Injectable } from '@angular/core';
import { Subscription, interval } from 'rxjs';
import {
    LanguagePair
,   ModelInventory
,   OverlayItem
,   OverlayStatus
,   RecognitionEvent
,   RegionGranularity
,   SceneLanguageState
,   SceneLanguageStatus
,   TextRegion
,   TranslationResult
} from 'src/app/shared/models';
import { AUTO_LANGUAGE, EXPIRY_TICK_MILLISECONDS, NormalizationUtils, TrackingUtils } from 'src/app/shared/utils';
import { MenuTranslationUtils } from 'src/app/shared/utils/menu-translation-utils/menu-translation-utils';
import { HistoryService } from '../history/history.service';
import { LanguageModelService } from '../language-model/language-model.service';
import { LensEngineService } from '../lens-engine/lens-engine.service';
import { LoggerService } from '../logger/logger.service';
import { OverlayStoreService } from '../overlay-store/overlay-store.service';
import { PreferencesService } from '../preferences/preferences.service';
import { SceneLanguageService } from '../scene-language/scene-language.service';
import { TranslationQueueService } from '../translation-queue/translation-queue.service';
import { OnlineTranslationService } from '../online-translation/online-translation.service';

const DECIDED_SCENE_STATUSES: SceneLanguageStatus[] = [SceneLanguageStatus.IDENTIFIED, SceneLanguageStatus.MANUAL];

@Injectable({
    providedIn: 'root'
})
export class RecognitionCoordinatorService {
    private _firstRecognitionLogged: boolean = false;
    private _languagePair: LanguagePair | null = null;
    private _lastFrameTimestamp: number = Number.NEGATIVE_INFINITY;
    private _lastFrameFrozen: boolean = false;
    private _sceneLanguage: string | null = null;
    private _menuContext: boolean = false;
    private _startedAt: number = 0;
    private _subscriptions: Subscription[] = [];
    private _suspended: boolean = false;
    private _suspendedAt: number | null = null;
    private _suspendedDuration: number = 0;

    constructor(
        private historyService: HistoryService,
        private languageModelService: LanguageModelService,
        private lensEngineService: LensEngineService,
        private loggerService: LoggerService,
        private overlayStoreService: OverlayStoreService,
        private preferencesService: PreferencesService,
        private sceneLanguageService: SceneLanguageService,
        private translationQueueService: TranslationQueueService,
        private onlineTranslationService: OnlineTranslationService,
    ) {}

    get autoDetecting(): boolean {
        return this._languagePair?.sourceLanguage === AUTO_LANGUAGE;
    }

    get running(): boolean {
        return this._languagePair !== null;
    }

    get sceneLanguage(): string | null {
        return this._sceneLanguage;
    }

    get suspended(): boolean {
        return this._suspended;
    }

    handleRecognition(event: RecognitionEvent): void {
        const languagePair: LanguagePair | null = this._languagePair;
        const frozenFrame: boolean = event.frame.frozen === true;

        if (!languagePair || (this._suspended && !frozenFrame)) {
            return;
        }

        if (event.frame.frameTimestamp <= this._lastFrameTimestamp) {
            this.loggerService.debug('stale-frame-dropped');
            return;
        }

        this._lastFrameTimestamp = event.frame.frameTimestamp;
        this._lastFrameFrozen = frozenFrame;
        this.logFirstRecognition(event);

        const menuContext: boolean = MenuTranslationUtils.isMenu([
            ...event.blocks.flatMap((block) => block.lines.map((line) => line.text)),
            ...this.readableTexts(),
        ]);
        if (menuContext !== this._menuContext) {
            this._menuContext = menuContext;
            this.translationQueueService.clear();
            this.overlayStoreService.resetTranslations();
        }

        const previousRegionIds: string[] = frozenFrame ? this.regionIds() : [];
        const granularity = this.onlineTranslationService.available ? RegionGranularity.BLOCK : this.preferencesService.settings.regionGranularity;
        const regions: TextRegion[] = NormalizationUtils.toTextRegions(event, granularity);
        const pending: OverlayItem[] = this.overlayStoreService.reconcile(regions, this.sessionTime(), !frozenFrame, frozenFrame);

        if (frozenFrame) {
            const remainingRegionIds: Set<string> = new Set<string>(this.regionIds());

            this.cancelTranslations(previousRegionIds.filter((regionId: string) => !remainingRegionIds.has(regionId)));
        }

        if (!this.autoDetecting) {
            this.dispatch(pending, languagePair.sourceLanguage);
            return;
        }

        this.observeScene();

        const sceneLanguage: string | null = this.settledSceneLanguage();

        if (sceneLanguage !== null) {
            this.dispatch(pending, sceneLanguage);
        }
    }

    setManualSourceLanguage(language: string): void {
        this.loggerService.debug('manual-source-language-selected', { language: language });

        if (this.autoDetecting) {
            this.sceneLanguageService.setManualLanguage(language);
        }
    }

    setSuspended(suspended: boolean): void {
        if (suspended === this._suspended) {
            return;
        }

        this._suspended = suspended;

        if (suspended) {
            this._suspendedAt = Date.now();
            return;
        }

        if (this._suspendedAt !== null) {
            this._suspendedDuration += Date.now() - this._suspendedAt;
            this._suspendedAt = null;
        }
    }

    start(languagePair: LanguagePair): void {
        this.stop();
        this._languagePair = languagePair;
        this._startedAt = performance.now();
        this._subscriptions = [
            this.lensEngineService.recognition().subscribe((event: RecognitionEvent) => this.handleRecognition(event)),
            this.translationQueueService.results().subscribe((result: TranslationResult) => this.applyTranslation(result)),
            interval(EXPIRY_TICK_MILLISECONDS).subscribe(() => this.tick()),
        ];

        if (!this.autoDetecting) {
            this.sceneLanguageService.setFixedLanguage(languagePair.sourceLanguage);
            return;
        }

        this.sceneLanguageService.startAutomatic();
        this._subscriptions.push(
            this.sceneLanguageService.changes().subscribe((state: SceneLanguageState) => this.applySceneLanguage(state)),
            this.languageModelService.changes().subscribe((inventory: ModelInventory) => this.resumeWaiting(inventory)),
        );
    }

    stop(): void {
        this._subscriptions.forEach((subscription: Subscription) => subscription.unsubscribe());
        this._subscriptions = [];
        this._languagePair = null;
        this._sceneLanguage = null;
        this._menuContext = false;
        this._lastFrameTimestamp = Number.NEGATIVE_INFINITY;
        this._lastFrameFrozen = false;
        this._firstRecognitionLogged = false;
        this._suspended = false;
        this._suspendedAt = null;
        this._suspendedDuration = 0;
        this.sceneLanguageService.reset();
        this.translationQueueService.clear();
        this.overlayStoreService.clear();
    }

    private applySceneLanguage(state: SceneLanguageState): void {
        const language: string | null = DECIDED_SCENE_STATUSES.includes(state.status) ? state.language : null;
        const previousLanguage: string | null = this._sceneLanguage;

        if (!this.autoDetecting || language === previousLanguage) {
            return;
        }

        this._sceneLanguage = language;
        this.loggerService.debug('scene-language-applied', { language: language });

        if (previousLanguage !== null) {
            this.translationQueueService.clear();
            this.overlayStoreService.resetTranslations();
        }

        if (language !== null) {
            this.dispatch(this.overlayStoreService.itemsWithStatus(OverlayStatus.READING), language);
        }
    }

    private applyTranslation(result: TranslationResult): void {
        const languagePair: LanguagePair | null = this._languagePair;
        const applied: OverlayItem | null = this.overlayStoreService.applyTranslation(result);

        if (
            !languagePair ||
            !applied ||
            result.failed ||
            applied.status !== OverlayStatus.TRANSLATED ||
            applied.sourceLanguage === null ||
            applied.sourceLanguage === AUTO_LANGUAGE ||
            applied.sourceLanguage === languagePair.targetLanguage ||
            this.sceneLanguageService.contested
        ) {
            return;
        }

        this.historyService.record({
            originalText: applied.originalText,
            sourceLanguage: applied.sourceLanguage,
            targetLanguage: languagePair.targetLanguage,
            translatedText: applied.translatedText,
        });
    }

    private cancelTranslations(regionIds: string[]): void {
        if (regionIds.length > 0) {
            this.translationQueueService.cancel(regionIds);
        }
    }

    private dispatch(items: OverlayItem[], sourceLanguage: string): void {
        const languagePair: LanguagePair | null = this._languagePair;

        if (!languagePair || items.length === 0) {
            return;
        }

        const stableItems = this.onlineTranslationService.available && !this._lastFrameFrozen
            ? items.filter((item) => item.stabilityScore >= 0.5)
            : items;
        const regionIds: string[] = stableItems.map((item: OverlayItem) => item.regionId);
        if (regionIds.length === 0) {
            return;
        }

        if (this.autoDetecting && sourceLanguage === languagePair.targetLanguage) {
            this.overlayStoreService.markSameLanguage(regionIds, sourceLanguage);
            return;
        }

        if (this.autoDetecting && !this.onlineTranslationService.available && !this.languageModelService.isDownloaded(sourceLanguage)) {
            return;
        }

        this.overlayStoreService
            .markTranslating(regionIds, sourceLanguage)
            .forEach((item: OverlayItem) => this.enqueue(item, sourceLanguage, languagePair.targetLanguage));
    }

    private dispatchWaiting(): void {
        const sceneLanguage: string | null = this.settledSceneLanguage();

        if (sceneLanguage !== null) {
            this.dispatch(this.overlayStoreService.itemsWithStatus(OverlayStatus.READING), sceneLanguage);
        }
    }

    private enqueue(item: OverlayItem, sourceLanguage: string, targetLanguage: string): void {
        this.translationQueueService.enqueue({
            ...(this.onlineTranslationService.available ? { contextText: this.readableTexts().join('\n').slice(0, 4000) } : {}),
            ...(this._menuContext ? { context: 'menu' as const } : {}),
            languagePair: { sourceLanguage: sourceLanguage, targetLanguage: targetLanguage },
            regionId: item.regionId,
            text: item.originalText,
            textVersion: item.textVersion,
        });
    }

    private expire(): void {
        if (this._suspended) {
            return;
        }

        const analysisIntervalMilliseconds: number = TrackingUtils.analysisIntervalFor(this.preferencesService.settings.analysesPerSecond);

        this.cancelTranslations(this.overlayStoreService.expire(this.sessionTime(), analysisIntervalMilliseconds));
    }

    private logFirstRecognition(event: RecognitionEvent): void {
        if (this._firstRecognitionLogged || event.blocks.length === 0) {
            return;
        }

        this._firstRecognitionLogged = true;
        this.loggerService.debug('first-recognition', { elapsedMilliseconds: Math.round(performance.now() - this._startedAt) });
    }

    private observeScene(): void {
        if (!this.autoDetecting) {
            return;
        }

        this.sceneLanguageService.observe(this.readableTexts(), Date.now());
    }

    private readableTexts(): string[] {
        return this.overlayStoreService.items
            .filter((item: OverlayItem) => item.status !== OverlayStatus.EXPIRING)
            .map((item: OverlayItem) => item.originalText);
    }

    private regionIds(): string[] {
        return this.overlayStoreService.items.map((item: OverlayItem) => item.regionId);
    }

    private resumeWaiting(inventory: ModelInventory): void {
        const languagePair: LanguagePair | null = this._languagePair;
        const language: string | null = this.settledSceneLanguage();

        if (!languagePair || language === null || language === languagePair.targetLanguage || !inventory.downloaded.includes(language)) {
            return;
        }

        this.dispatch(this.overlayStoreService.itemsWithStatus(OverlayStatus.READING), language);
    }

    private sessionTime(): number {
        return (this._suspendedAt ?? Date.now()) - this._suspendedDuration;
    }

    private settledSceneLanguage(): string | null {
        return this.sceneLanguageService.contested ? null : this._sceneLanguage;
    }

    private tick(): void {
        this.observeScene();
        this.dispatchWaiting();
        this.expire();
    }
}
