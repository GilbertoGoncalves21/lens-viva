import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AppSettings } from 'src/app/shared/models';
import { PreferencesService } from '../preferences/preferences.service';
import { OnlineTranslationService } from './online-translation.service';

describe('OnlineTranslationService', () => {
    let settings: AppSettings;
    let service: OnlineTranslationService;
    let http: HttpTestingController;
    beforeEach(() => {
        settings = { ...PreferencesService.defaultSettings({ sourceLanguage: 'en', targetLanguage: 'pt' }),
            onlineTranslationUrl: 'https://translator.example/translate', onlineTranslationToken: 'app-token' };
        TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
            { provide: PreferencesService, useValue: { get settings() { return settings; } } },
        ] });
        service = TestBed.inject(OnlineTranslationService);
        http = TestBed.inject(HttpTestingController);
    });
    afterEach(() => http.verify());

    it('should require a configured service and reject insecure remote URLs', () => {
        expect(service.available).toBe(true);
        expect(OnlineTranslationService.validUrl('http://example.com/translate')).toBe(false);
        expect(OnlineTranslationService.validUrl('https://user:password@example.com')).toBe(false);
        expect(OnlineTranslationService.validUrl('http://127.0.0.1:8787/translate')).toBe(true);
        settings.onlineTranslationUrl = '';
        expect(service.available).toBe(false);
    });

    it('should send a complete sentence and scene context without language models', async () => {
        const translation = service.translate({ regionId: 'phrase', textVersion: 1, text: 'Everything happens for a reason.',
            contextText: 'A motivational quote', languagePair: { sourceLanguage: 'en', targetLanguage: 'pt' } });
        const request = http.expectOne('https://translator.example/translate');
        expect(request.request.headers.get('Authorization')).toBe('Bearer app-token');
        expect(request.request.body.text).toBe('Everything happens for a reason.');
        expect(request.request.body.context).toBe('A motivational quote');
        request.flush({ translatedText: 'Tudo acontece por um motivo.', uncertain: false });
        await expect(translation).resolves.toBe('Tudo acontece por um motivo.');
    });

    it('should reject an uncertain interpretation rather than show a guessed translation', async () => {
        const translation = service.translate({ regionId: 'phrase', textVersion: 1, text: 'damaged text', languagePair: { sourceLanguage: 'en', targetLanguage: 'pt' } });
        const assertion = expect(translation).rejects.toThrow('ONLINE_TRANSLATION_UNCERTAIN');
        http.expectOne('https://translator.example/translate').flush({ translatedText: '', uncertain: true });
        await assertion;
        expect(service.notice()).toBe('uncertain');
    });
});
