import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { TranslationRequest, TranslationResult } from 'src/app/shared/models';
import { TRANSLATION_QUEUE_CONCURRENCY, TranslationKeyUtils } from 'src/app/shared/utils';
import { environment } from 'src/environments/environment';
import { MenuTranslationUtils } from 'src/app/shared/utils/menu-translation-utils/menu-translation-utils';
import { LensEngineService } from '../lens-engine/lens-engine.service';
import { LoggerService } from '../logger/logger.service';
import { TranslationCacheService } from '../translation-cache/translation-cache.service';
import { OnlineTranslationService } from '../online-translation/online-translation.service';
import { HashUtils } from 'src/app/shared/utils';

interface PendingTranslation {
    key: string;
    request: TranslationRequest;
}

@Injectable({
    providedIn: 'root'
})
export class TranslationQueueService {
    private _generation: number = 0;
    private _inFlight: Map<string, Promise<string>> = new Map<string, Promise<string>>();
    private _pending: Map<string, PendingTranslation> = new Map<string, PendingTranslation>();
    private _results$: Subject<TranslationResult> = new Subject<TranslationResult>();

    constructor(
        private lensEngineService: LensEngineService,
        private loggerService: LoggerService,
        private translationCacheService: TranslationCacheService,
        private onlineTranslationService: OnlineTranslationService,
    ) {}

    get activeCount(): number {
        return this._inFlight.size;
    }

    get pendingCount(): number {
        return this._pending.size;
    }

    cancel(regionIds: string[]): void {
        regionIds.forEach((regionId: string) => this._pending.delete(regionId));
    }

    clear(): void {
        this._pending.clear();
        this._generation++;
    }

    enqueue(request: TranslationRequest): void {
        const key: string = this.keyFor(request);
        const cached: string | null = this.translationCacheService.get(key);

        this._pending.delete(request.regionId);

        if (cached !== null) {
            this._results$.next({ failed: false, regionId: request.regionId, textVersion: request.textVersion, translatedText: cached });
            return;
        }

        this._pending.set(request.regionId, { key: key, request: request });
        this.drain();
    }

    results(): Observable<TranslationResult> {
        return this._results$.asObservable();
    }

    private drain(): void {
        this._pending.forEach((pending: PendingTranslation, regionId: string) => {
            if (!this._inFlight.has(pending.key) && this._inFlight.size >= TRANSLATION_QUEUE_CONCURRENCY) {
                return;
            }

            this._pending.delete(regionId);
            void this.process(pending, this._generation);
        });
    }

    private keyFor(request: TranslationRequest): string {
        const version: string = this.onlineTranslationService.available
            ? `${environment.engineVersion}:online:${HashUtils.fnv1a(this.onlineTranslationService.cacheIdentity + (request.contextText ?? request.text))}`
            : request.context === 'menu' ? `${environment.engineVersion}:menu` : environment.engineVersion;
        return TranslationKeyUtils.build(request.text, request.languagePair, version);
    }

    private async process(pending: PendingTranslation, generation: number): Promise<void> {
        const result: TranslationResult = await this.translate(pending, generation);

        if (generation === this._generation) {
            this._results$.next(result);
        }

        this.drain();
    }

    private release(key: string, translation: Promise<string>): void {
        if (this._inFlight.get(key) === translation) {
            this._inFlight.delete(key);
        }
    }

    private sharedTranslation(pending: PendingTranslation): Promise<string> {
        const inFlight: Promise<string> | undefined = this._inFlight.get(pending.key);

        if (inFlight) {
            return inFlight;
        }

        const menuTranslation: string | null = pending.request.context === 'menu'
            ? MenuTranslationUtils.translate(pending.request.text, pending.request.languagePair)
            : null;
        const translation: Promise<string> = (this.onlineTranslationService.available
            ? this.onlineTranslationService.translate(pending.request)
            : menuTranslation !== null
            ? Promise.resolve(menuTranslation)
            : this.lensEngineService.translate(pending.request.text, pending.request.languagePair))
            .finally((): void => this.release(pending.key, translation));

        this._inFlight.set(pending.key, translation);

        return translation;
    }

    private async translate(pending: PendingTranslation, generation: number): Promise<TranslationResult> {
        const request: TranslationRequest = pending.request;
        const startedAt: number = performance.now();

        try {
            const translatedText: string = await this.sharedTranslation(pending);

            if (generation === this._generation) {
                this.translationCacheService.set(pending.key, translatedText);
                this.loggerService.debug('translation-completed', { durationMilliseconds: Math.round(performance.now() - startedAt) });
            }

            return { failed: false, regionId: request.regionId, textVersion: request.textVersion, translatedText: translatedText };
        } catch (error: unknown) {
            if (generation === this._generation) {
                this.loggerService.error('translation-failed', error);
            }

            return { failed: true, regionId: request.regionId, textVersion: request.textVersion, translatedText: request.text };
        }
    }
}
