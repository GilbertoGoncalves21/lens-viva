import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, Injector, inject } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { EnglishSpeller, repairEnglishOcr } from './english-ocr-repair';

@Injectable({ providedIn: 'root' })
export class OcrCorrectionService {
    private readonly document = inject(DOCUMENT);
    private readonly injector = inject(Injector);
    private dictionary: Promise<EnglishSpeller> | null = null;
    private readonly cache = new Map<string, string>();

    correct(text: string, sourceLanguage: string): string | Promise<string> {
        const words = text.match(/\b[A-Za-z]+\b/gu) ?? [];
        if (
            sourceLanguage !== 'en' ||
            text.length > 4000 ||
            (words.length < 2 && !(words.length === 1 && words[0].length >= 8))
        )
            return text;
        const cached = this.cache.get(text);
        if (cached !== undefined) return cached;
        return this.loadDictionary()
            .then((speller) => {
                const corrected = repairEnglishOcr(text, speller);
                if (this.cache.size >= 256) this.cache.clear();
                this.cache.set(text, corrected);
                return corrected;
            })
            .catch(() => text);
    }

    private loadDictionary(): Promise<EnglishSpeller> {
        if (this.dictionary === null) {
            const http = this.injector.get(HttpClient);
            const load = (file: string) =>
                firstValueFrom(
                    http
                        .get(new URL(`dictionaries/en/${file}`, this.document.baseURI).href, {
                            responseType: 'text',
                        })
                        .pipe(timeout(5000)),
                );
            this.dictionary = Promise.all([import('nspell'), load('index.aff'), load('index.dic')])
                .then(([module, aff, dic]) => module.default({ aff, dic }))
                .catch((error: unknown) => {
                    this.dictionary = null;
                    throw error;
                });
        }
        return this.dictionary;
    }
}
