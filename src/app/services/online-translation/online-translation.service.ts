import { DOCUMENT } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, Injector, inject, signal } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { TranslationRequest } from 'src/app/shared/models';
import { PreferencesService } from '../preferences/preferences.service';

interface OnlineTranslationResponse {
    translatedText: string;
    uncertain?: boolean;
}

@Injectable({ providedIn: 'root' })
export class OnlineTranslationService {
    readonly notice = signal<'uncertain' | 'unavailable' | null>(null);
    private readonly document = inject(DOCUMENT);
    private readonly injector = inject(Injector);
    private readonly preferences = inject(PreferencesService);

    get configured(): boolean {
        return OnlineTranslationService.validUrl(this.preferences.settings.onlineTranslationUrl ?? '')
            && (this.preferences.settings.onlineTranslationToken ?? '').trim().length > 0;
    }

    get available(): boolean {
        return this.configured && (this.document.defaultView?.navigator.onLine ?? false);
    }

    get cacheIdentity(): string {
        return this.preferences.settings.onlineTranslationUrl ?? '';
    }

    static validUrl(value: string): boolean {
        try {
            const url = new URL(value);
            return url.username === '' && url.password === '' && url.hash === ''
                && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)));
        } catch {
            return false;
        }
    }

    async translate(request: TranslationRequest): Promise<string> {
        if (!this.available) {
            throw new Error('ONLINE_TRANSLATION_UNAVAILABLE');
        }
        let response: OnlineTranslationResponse;
        try {
            response = await firstValueFrom(this.injector.get(HttpClient).post<OnlineTranslationResponse>(
                this.preferences.settings.onlineTranslationUrl!,
                {
                    text: request.text,
                    sourceLanguage: request.languagePair.sourceLanguage,
                    targetLanguage: request.languagePair.targetLanguage,
                    context: (request.contextText ?? request.text).slice(0, 4000),
                },
                { headers: new HttpHeaders({ Authorization: `Bearer ${this.preferences.settings.onlineTranslationToken}` }) },
            ).pipe(timeout(20000)));
        } catch {
            this.notice.set('unavailable');
            throw new Error('ONLINE_TRANSLATION_UNAVAILABLE');
        }

        if (typeof response?.translatedText !== 'string' || response.translatedText.trim() === '' || response.uncertain === true) {
            this.notice.set('uncertain');
            throw new Error('ONLINE_TRANSLATION_UNCERTAIN');
        }
        this.notice.set(null);
        return response.translatedText.trim();
    }
}
