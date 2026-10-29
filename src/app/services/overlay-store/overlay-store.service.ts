import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { OverlayItem, OverlayStatus, ReconcileResult, TextRegion, TranslationResult } from 'src/app/shared/models';
import { EMPTY, TrackingUtils } from 'src/app/shared/utils';

const WAITING_STATUSES: OverlayStatus[] = [OverlayStatus.DETECTING, OverlayStatus.READING];

@Injectable({
    providedIn: 'root'
})
export class OverlayStoreService {
    private _items$: BehaviorSubject<OverlayItem[]> = new BehaviorSubject<OverlayItem[]>([]);
    private _sequence: number = 0;

    constructor() {}

    get items(): OverlayItem[] {
        return this._items$.value;
    }

    applyTranslation(result: TranslationResult): OverlayItem | null {
        const index: number = this.indexOf(result.regionId, result.textVersion);
        const current: OverlayItem | undefined = this.items[index];

        if (!current || WAITING_STATUSES.includes(current.status)) {
            return null;
        }

        return this.replaceAt(index, {
            ...current,
            status: this.statusAfterTranslation(current, result),
            translatedText: result.failed ? current.translatedText : result.translatedText,
        });
    }

    changes(): Observable<OverlayItem[]> {
        return this._items$.asObservable();
    }

    clear(): void {
        if (this.items.length > 0) {
            this._items$.next([]);
        }
    }

    expire(now: number, analysisIntervalMilliseconds: number): string[] {
        const current: OverlayItem[] = this.items;
        const expired: OverlayItem[] = TrackingUtils.expire(current, now, analysisIntervalMilliseconds);

        if (!this.hasChanged(current, expired)) {
            return [];
        }

        const remainingRegionIds: Set<string> = new Set<string>(expired.map((item: OverlayItem) => item.regionId));

        this._items$.next(expired);

        return current
            .filter((item: OverlayItem) => !remainingRegionIds.has(item.regionId))
            .map((item: OverlayItem) => item.regionId);
    }

    itemsWithStatus(status: OverlayStatus): OverlayItem[] {
        return this.items.filter((item: OverlayItem) => item.status === status);
    }

    markSameLanguage(regionIds: string[], language: string): OverlayItem[] {
        const identifiers: Set<string> = new Set<string>(regionIds);

        return this.transition(
            (item: OverlayItem) => identifiers.has(item.regionId) && item.status === OverlayStatus.READING,
            (item: OverlayItem) => ({
                ...item,
                sourceLanguage: language,
                status: OverlayStatus.TRANSLATED,
                translatedText: item.originalText,
            }),
        );
    }

    markTranslating(regionIds: string[], sourceLanguage: string): OverlayItem[] {
        const identifiers: Set<string> = new Set<string>(regionIds);

        return this.transition(
            (item: OverlayItem) => identifiers.has(item.regionId) && item.status === OverlayStatus.READING,
            (item: OverlayItem) => ({ ...item, sourceLanguage: sourceLanguage, status: OverlayStatus.TRANSLATING }),
        );
    }

    reconcile(regions: TextRegion[], now: number, retainUnseen: boolean = true, snapAnchors: boolean = false): OverlayItem[] {
        const result: ReconcileResult = TrackingUtils.reconcile(
            this.items,
            TrackingUtils.deduplicate(regions),
            now,
            (): string => `region-${++this._sequence}`,
            retainUnseen,
            snapAnchors,
        );

        this._items$.next(result.items);

        return result.pendingTranslations;
    }

    retryFailedTranslations(): OverlayItem[] {
        return this.transition(
            (item: OverlayItem) => item.status === OverlayStatus.ERROR,
            (item: OverlayItem) => ({
                ...item,
                failedAt: null,
                failedAttempts: 0,
                status: OverlayStatus.READING,
                textVersion: item.textVersion + 1,
            }),
        );
    }

    resetTranslations(): OverlayItem[] {
        return this.transition(
            (): boolean => true,
            (item: OverlayItem) => ({
                ...item,
                failedAt: null,
                failedAttempts: 0,
                sourceLanguage: null,
                status: item.status === OverlayStatus.EXPIRING ? OverlayStatus.EXPIRING : OverlayStatus.READING,
                textVersion: item.textVersion + 1,
                translatedText: EMPTY,
            }),
        );
    }

    toggleOriginal(regionId: string): void {
        const current: OverlayItem[] = this.items;

        if (!current.some((item: OverlayItem) => item.regionId === regionId)) {
            return;
        }

        this._items$.next(current.map((item: OverlayItem) =>
            item.regionId === regionId ? { ...item, showOriginal: !item.showOriginal } : item,
        ));
    }

    private hasChanged(current: OverlayItem[], next: OverlayItem[]): boolean {
        return next.length !== current.length || next.some((item: OverlayItem, index: number) => item !== current[index]);
    }

    private indexOf(regionId: string, textVersion: number): number {
        return this.items.findIndex((item: OverlayItem) => item.regionId === regionId && item.textVersion === textVersion);
    }

    private replaceAt(index: number, updated: OverlayItem): OverlayItem {
        this._items$.next(this.items.map((item: OverlayItem, itemIndex: number) => (itemIndex === index ? updated : item)));

        return updated;
    }

    private statusAfterTranslation(item: OverlayItem, result: TranslationResult): OverlayStatus {
        if (item.status === OverlayStatus.EXPIRING) {
            return OverlayStatus.EXPIRING;
        }

        return result.failed ? OverlayStatus.ERROR : OverlayStatus.TRANSLATED;
    }

    private transition(eligible: (item: OverlayItem) => boolean, update: (item: OverlayItem) => OverlayItem): OverlayItem[] {
        const changed: OverlayItem[] = [];
        const updated: OverlayItem[] = this.items.map((item: OverlayItem) => {
            if (!eligible(item)) {
                return item;
            }

            const next: OverlayItem = update(item);

            changed.push(next);

            return next;
        });

        if (changed.length > 0) {
            this._items$.next(updated);
        }

        return changed;
    }
}
