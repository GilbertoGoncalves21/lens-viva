import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { OverlayStatus, RecognitionEvent } from 'src/app/shared/models';
import { HistoryService } from '../history/history.service';
import { LanguageModelService } from '../language-model/language-model.service';
import { LensEngineService } from '../lens-engine/lens-engine.service';
import { LoggerService } from '../logger/logger.service';
import { OnlineTranslationService } from '../online-translation/online-translation.service';
import { OverlayStoreService } from '../overlay-store/overlay-store.service';
import { PreferencesService } from '../preferences/preferences.service';
import { SceneLanguageService } from '../scene-language/scene-language.service';
import { RecognitionCoordinatorService } from './recognition-coordinator.service';

const ENDPOINT = 'https://translator.example/translate';

function frozenPhrase(): RecognitionEvent {
    const lines = ['Everything', 'happens for', 'a reason.'].map((text, index) => ({
        text,
        angle: 0,
        confidence: 0.95,
        recognizedLanguage: 'en',
        orientedWidth: 600,
        orientedHeight: 50,
        boundingBox: { left: 100, right: 700, top: 200 + index * 55, bottom: 250 + index * 55 },
    }));
    return {
        frame: {
            frameTimestamp: 1,
            frozen: true,
            imageHeight: 1000,
            imageWidth: 1000,
            mirrored: false,
            rotationDegrees: 0,
            viewHeight: 1000,
            viewWidth: 1000,
        },
        blocks: [
            {
                text: lines.map((line) => line.text).join('\n'),
                lines,
                recognizedLanguage: 'en',
                orientedWidth: 600,
                orientedHeight: 160,
                boundingBox: { left: 100, right: 700, top: 200, bottom: 360 },
            },
        ],
    };
}

describe('Frozen translation flow with real coordinator, queue, cache, store, and HTTP client', () => {
    it('should recover a complete phrase after an HTTP failure without another frame or an offline call', async () => {
        const recognition = new Subject<RecognitionEvent>();
        const localTranslate = vi.fn();
        const recordHistory = vi.fn();
        const settings = {
            ...PreferencesService.defaultSettings({ sourceLanguage: 'en', targetLanguage: 'pt' }),
            onlineTranslationUrl: ENDPOINT,
            onlineTranslationToken: 'test-client-token',
        };
        TestBed.configureTestingModule({
            providers: [
                provideHttpClient(),
                provideHttpClientTesting(),
                { provide: PreferencesService, useValue: { settings } },
                {
                    provide: LensEngineService,
                    useValue: {
                        recognition: () => recognition.asObservable(),
                        translate: localTranslate,
                    },
                },
                { provide: HistoryService, useValue: { record: recordHistory } },
                { provide: LanguageModelService, useValue: { isDownloaded: () => false } },
                { provide: LoggerService, useValue: { debug: vi.fn(), error: vi.fn() } },
                {
                    provide: SceneLanguageService,
                    useValue: { setFixedLanguage: vi.fn(), reset: vi.fn(), contested: false },
                },
            ],
        });
        const coordinator = TestBed.inject(RecognitionCoordinatorService);
        const store = TestBed.inject(OverlayStoreService);
        const http = TestBed.inject(HttpTestingController);
        const online = TestBed.inject(OnlineTranslationService);
        try {
            coordinator.start({ sourceLanguage: 'en', targetLanguage: 'pt' });
            coordinator.setSuspended(true);
            recognition.next(frozenPhrase());
            const first = http.expectOne(ENDPOINT);
            expect(first.request.body).toMatchObject({
                text: 'Everything happens for a reason.',
                context: 'Everything happens for a reason.',
            });
            first.flush(
                { error: 'TRANSLATION_UNAVAILABLE' },
                { status: 502, statusText: 'Bad Gateway' },
            );
            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(store.items[0].status).toBe(OverlayStatus.ERROR);
            expect(online.notice()).toBe('unavailable');
            expect(recordHistory).not.toHaveBeenCalled();
            const capturedRect = store.items[0].anchorRect;

            coordinator.retryFailedTranslations();
            const retry = http.expectOne(ENDPOINT);
            expect(retry.request.body.text).toBe('Everything happens for a reason.');
            retry.flush({ translatedText: 'Tudo acontece por um motivo.', uncertain: false });
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(coordinator.suspended).toBe(true);
            expect(store.items).toHaveLength(1);
            expect(store.items[0]).toMatchObject({
                status: OverlayStatus.TRANSLATED,
                textVersion: 2,
                anchorRect: capturedRect,
                originalText: 'Everything happens for a reason.',
                translatedText: 'Tudo acontece por um motivo.',
            });
            expect(localTranslate).not.toHaveBeenCalled();
            expect(online.notice()).toBeNull();
            expect(recordHistory).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    originalText: 'Everything happens for a reason.',
                    translatedText: 'Tudo acontece por um motivo.',
                }),
            );
        } finally {
            coordinator.stop();
            http.verify();
        }
    });
});
