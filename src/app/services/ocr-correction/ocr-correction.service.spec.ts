import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { OcrCorrectionService } from './ocr-correction.service';

// Small authored dictionary exercises the real Hunspell implementation without network access.
const WORDS = [
    'everything',
    'happens',
    'for',
    'a',
    'reason',
    'the',
    'restaurant',
    'opens',
    'at',
    'noon',
    'this',
    'word',
    'world',
    'is',
    'strange',
    'we',
    'met',
    'today',
    'form',
    'here',
    'she',
    'came',
];
const DICTIONARY = `${WORDS.length}\n${WORDS.join('\n')}\n`;

describe('OcrCorrectionService', () => {
    let service: OcrCorrectionService;
    let http: HttpTestingController;
    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [provideHttpClient(), provideHttpClientTesting()],
        });
        service = TestBed.inject(OcrCorrectionService);
        http = TestBed.inject(HttpTestingController);
    });
    afterEach(() => http.verify());

    function provideDictionary(): void {
        http.expectOne((request) => request.url.endsWith('/dictionaries/en/index.aff')).flush(
            'SET UTF-8\n',
        );
        http.expectOne((request) => request.url.endsWith('/dictionaries/en/index.dic')).flush(
            DICTIONARY,
        );
    }

    it('should infer a uniquely recoverable missing letter using a dictionary and the surrounding phrase', async () => {
        const corrected = service.correct('Everyhing happens for a reason.', 'en');
        provideDictionary();
        await expect(corrected).resolves.toBe('Everything happens for a reason.');
        await expect(service.correct('Everyhing', 'en')).resolves.toBe('Everything');
        expect(service.correct('Everyhing happens for a reason.', 'en')).toBe(
            'Everything happens for a reason.',
        );
        await expect(service.correct('The restaurnt opens at noon.', 'en')).resolves.toBe(
            'The restaurant opens at noon.',
        );
    });

    it('should preserve ambiguous words, valid words, names and numbers', async () => {
        const first = service.correct('This wordl is strange.', 'en');
        provideDictionary();
        await expect(first).resolves.toBe('This wordl is strange.');
        await expect(service.correct('We met Everyhing today at 12.', 'en')).resolves.toBe(
            'We met Everyhing today at 12.',
        );
        await expect(service.correct('She came form here.', 'en')).resolves.toBe(
            'She came form here.',
        );
        await expect(service.correct('The RX500 opens at noon.', 'en')).resolves.toBe(
            'The RX500 opens at noon.',
        );
        await expect(service.correct('qzxx vrtzy mpzth for.', 'en')).resolves.toBe(
            'qzxx vrtzy mpzth for.',
        );
    });

    it('should not download a dictionary for another language or guess an isolated word', () => {
        expect(service.correct('Thng', 'en')).toBe('Thng');
        expect(service.correct('Texto para traduzir.', 'pt')).toBe('Texto para traduzir.');
        http.expectNone(() => true);
    });

    it('should continue with the original OCR when a bundled dictionary cannot load', async () => {
        const corrected = service.correct('Everyhing happens for a reason.', 'en');
        const assertion = expect(corrected).resolves.toBe('Everyhing happens for a reason.');
        http.expectOne((request) => request.url.endsWith('/index.aff')).flush('', {
            status: 404,
            statusText: 'Missing asset',
        });
        http.expectOne((request) => request.url.endsWith('/index.dic')).flush(DICTIONARY);
        await assertion;
    });
});
