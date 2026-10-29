import { Inject, Injectable } from '@angular/core';
import { GetResult, PreferencesPlugin } from '@capacitor/preferences';
import { BehaviorSubject, Observable } from 'rxjs';
import { HistoryEntry, HistoryRecordRequest } from 'src/app/shared/models';
import { HISTORY_CONFIG, TRANSLATION_LANGUAGES, TextUtils } from 'src/app/shared/utils';
import { PREFERENCES_PLUGIN } from '../capacitor/capacitor-plugins';
import { LoggerService } from '../logger/logger.service';
import { PreferencesService } from '../preferences/preferences.service';

const ENTRY_FIELDS: (keyof HistoryEntry)[] = ['createdAt', 'historyEntryId', 'originalText', 'sourceLanguage', 'targetLanguage', 'translatedText'];

@Injectable({
    providedIn: 'root'
})
export class HistoryService {
    private _entries$: BehaviorSubject<HistoryEntry[]> = new BehaviorSubject<HistoryEntry[]>([]);
    private _generation: number = 0;
    private _loading: Promise<void> | null = null;
    private _persistTimer: ReturnType<typeof setTimeout> | null = null;
    private _sequence: number = 0;
    private _tasks: Promise<void> = Promise.resolve();

    constructor(
        private loggerService: LoggerService,
        @Inject(PREFERENCES_PLUGIN) private preferencesPlugin: PreferencesPlugin,
        private preferencesService: PreferencesService,
    ) {}

    get entries(): HistoryEntry[] {
        return this._entries$.value;
    }

    changes(): Observable<HistoryEntry[]> {
        return this._entries$.asObservable();
    }

    async clear(): Promise<void> {
        if (this._loading !== null) {
            await this._loading.catch((): void => undefined);
        }

        this.cancelPersist();
        this._generation++;
        this._loading = Promise.resolve();
        this._entries$.next([]);

        try {
            await this.schedule((): Promise<void> => this.preferencesPlugin.remove({ key: HISTORY_CONFIG.storageKey }));
        } catch (error: unknown) {
            this.loggerService.error('history-clear-failed', error);
            throw error;
        }
    }

    async flush(): Promise<void> {
        if (this._persistTimer === null) {
            await this._tasks;
            return;
        }

        this.cancelPersist();

        try {
            await this.persist();
        } catch (error: unknown) {
            this.loggerService.error('history-persist-failed', error);
            this.schedulePersist();
        }
    }

    load(): Promise<HistoryEntry[]> {
        if (this._loading === null) {
            this._loading = this.startLoading();
        }

        return this._loading.then((): HistoryEntry[] => this.entries);
    }

    record(request: HistoryRecordRequest, now: Date = new Date()): void {
        if (!this.isEnabled() || !this.isWorthSaving(request)) {
            return;
        }

        this.load()
            .then((): void => this.prepend(request, now))
            .catch((error: unknown) => this.loggerService.error('history-record-failed', error));
    }

    async remove(historyEntryId: string): Promise<void> {
        await this.load();

        const previous: HistoryEntry[] = this.entries;
        const remaining: HistoryEntry[] = previous.filter((entry: HistoryEntry) => entry.historyEntryId !== historyEntryId);

        if (remaining.length === previous.length) {
            return;
        }

        const persistPending: boolean = this._persistTimer !== null;

        this.cancelPersist();
        this._entries$.next(remaining);

        try {
            await this.persist();
        } catch (error: unknown) {
            this.loggerService.error('history-remove-failed', error);

            if (this.entries === remaining) {
                this._entries$.next(previous);

                if (persistPending) {
                    this.schedulePersist();
                }
            }

            throw error;
        }
    }

    private cancelPersist(): void {
        if (this._persistTimer !== null) {
            clearTimeout(this._persistTimer);
            this._persistTimer = null;
        }
    }

    private createEntryId(timestamp: number): string {
        const prefix: string = timestamp.toString(36);
        let historyEntryId: string = `${prefix}-${(++this._sequence).toString(36)}`;

        while (this.entries.some((entry: HistoryEntry) => entry.historyEntryId === historyEntryId)) {
            historyEntryId = `${prefix}-${(++this._sequence).toString(36)}`;
        }

        return historyEntryId;
    }

    private isEnabled(): boolean {
        return this.preferencesService.settings.historyEnabled === true;
    }

    private isSameEntry(entry: HistoryEntry, request: HistoryRecordRequest): boolean {
        return (
            entry.targetLanguage === request.targetLanguage &&
            TextUtils.toComparable(entry.originalText) === TextUtils.toComparable(request.originalText)
        );
    }

    private isValidEntry(value: unknown): value is HistoryEntry {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            return false;
        }

        const entry: Record<string, unknown> = value as Record<string, unknown>;
        const createdAt: unknown = entry['createdAt'];
        const historyEntryId: unknown = entry['historyEntryId'];

        return (
            ENTRY_FIELDS.every((field: keyof HistoryEntry) => typeof entry[field] === 'string') &&
            typeof historyEntryId === 'string' &&
            historyEntryId.length > 0 &&
            typeof createdAt === 'string' &&
            !Number.isNaN(Date.parse(createdAt))
        );
    }

    private isWorthSaving(request: HistoryRecordRequest | null | undefined): boolean {
        if (!request || typeof request.originalText !== 'string' || typeof request.translatedText !== 'string') {
            return false;
        }

        const originalText: string = TextUtils.normalize(request.originalText);
        const translatedText: string = TextUtils.normalize(request.translatedText);

        return (
            TRANSLATION_LANGUAGES.includes(request.sourceLanguage) &&
            TRANSLATION_LANGUAGES.includes(request.targetLanguage) &&
            request.sourceLanguage !== request.targetLanguage &&
            originalText.length >= HISTORY_CONFIG.minTextLength &&
            TextUtils.hasLetter(originalText) &&
            translatedText.length > 0 &&
            TextUtils.toComparable(originalText) !== TextUtils.toComparable(translatedText)
        );
    }

    private parseStored(value: string | null | undefined): HistoryEntry[] {
        if (!value) {
            return [];
        }

        let parsed: unknown;

        try {
            parsed = JSON.parse(value);
        } catch {
            this.loggerService.warn('history-storage-corrupted');
            return [];
        }

        if (!Array.isArray(parsed)) {
            this.loggerService.warn('history-storage-corrupted');
            return [];
        }

        const identifiers: Set<string> = new Set<string>();
        const entries: HistoryEntry[] = [];

        for (const item of parsed as unknown[]) {
            if (entries.length >= HISTORY_CONFIG.maxEntries) {
                break;
            }

            if (this.isValidEntry(item) && !identifiers.has(item.historyEntryId)) {
                identifiers.add(item.historyEntryId);
                entries.push(this.toEntry(item));
            }
        }

        return entries;
    }

    private persist(): Promise<void> {
        const serialized: string = JSON.stringify(this.entries);

        return this.schedule((): Promise<void> => this.preferencesPlugin.set({ key: HISTORY_CONFIG.storageKey, value: serialized }));
    }

    private prepend(request: HistoryRecordRequest, now: Date): void {
        if (!this.isEnabled()) {
            return;
        }

        const timestamp: Date = Number.isNaN(now.getTime()) ? new Date() : now;
        const entry: HistoryEntry = {
            createdAt: timestamp.toISOString(),
            historyEntryId: this.createEntryId(timestamp.getTime()),
            originalText: TextUtils.normalize(request.originalText),
            sourceLanguage: request.sourceLanguage,
            targetLanguage: request.targetLanguage,
            translatedText: TextUtils.normalize(request.translatedText),
        };
        const remaining: HistoryEntry[] = this.entries.filter((item: HistoryEntry) => !this.isSameEntry(item, request));

        this._entries$.next([entry, ...remaining].slice(0, HISTORY_CONFIG.maxEntries));
        this.schedulePersist();
    }

    private async readStored(): Promise<HistoryEntry[]> {
        const result: GetResult | null | undefined = await this.preferencesPlugin.get({ key: HISTORY_CONFIG.storageKey });

        return this.parseStored(result?.value);
    }

    private schedule(task: () => Promise<void>): Promise<void> {
        const result: Promise<void> = this._tasks.then(task);

        this._tasks = result.catch((): void => undefined);

        return result;
    }

    private schedulePersist(): void {
        if (this._persistTimer !== null) {
            return;
        }

        this._persistTimer = setTimeout(() => {
            this._persistTimer = null;
            this.persist().catch((error: unknown) => this.loggerService.error('history-persist-failed', error));
        }, HISTORY_CONFIG.persistDelayMilliseconds);
    }

    private startLoading(): Promise<void> {
        const generation: number = this._generation;
        const loading: Promise<void> = this.readStored().then(
            (entries: HistoryEntry[]): void => {
                if (generation === this._generation) {
                    this._entries$.next(entries);
                }
            },
            (error: unknown): never => {
                this.loggerService.error('history-load-failed', error);

                if (this._loading === loading) {
                    this._loading = null;
                }

                throw error;
            },
        );

        return loading;
    }

    private toEntry(entry: HistoryEntry): HistoryEntry {
        return {
            createdAt: entry.createdAt,
            historyEntryId: entry.historyEntryId,
            originalText: entry.originalText,
            sourceLanguage: entry.sourceLanguage,
            targetLanguage: entry.targetLanguage,
            translatedText: entry.translatedText,
        };
    }
}
