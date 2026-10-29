import { Injectable } from '@angular/core';
import { TRANSLATION_CACHE_CONFIG } from 'src/app/shared/utils';

interface CacheEntry {
    expiresAt: number;
    value: string;
}

@Injectable({
    providedIn: 'root'
})
export class TranslationCacheService {
    private _entries: Map<string, CacheEntry> = new Map<string, CacheEntry>();
    private _hits: number = 0;
    private _misses: number = 0;

    constructor() {}

    get hitRate(): number {
        const total: number = this._hits + this._misses;

        return total > 0 ? this._hits / total : 0;
    }

    get size(): number {
        return this._entries.size;
    }

    clear(): void {
        this._entries.clear();
        this._hits = 0;
        this._misses = 0;
    }

    get(key: string, now: number = Date.now()): string | null {
        const entry: CacheEntry | undefined = this._entries.get(key);

        if (!entry || entry.expiresAt <= now) {
            this._entries.delete(key);
            this._misses++;
            return null;
        }

        this._entries.delete(key);
        this._entries.set(key, entry);
        this._hits++;

        return entry.value;
    }

    set(key: string, value: string, now: number = Date.now()): void {
        this._entries.delete(key);
        this._entries.set(key, { expiresAt: now + TRANSLATION_CACHE_CONFIG.timeToLiveMilliseconds, value: value });

        while (this._entries.size > TRANSLATION_CACHE_CONFIG.maxEntries) {
            const oldestKey: string | undefined = this._entries.keys().next().value;

            if (oldestKey === undefined) {
                return;
            }

            this._entries.delete(oldestKey);
        }
    }
}
