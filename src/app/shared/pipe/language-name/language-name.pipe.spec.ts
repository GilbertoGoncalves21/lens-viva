import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { MockInstance } from 'vitest';
import { AUTO_LANGUAGE, EMPTY } from 'src/app/shared/utils';
import { LanguageNamePipe } from './language-name.pipe';

describe('LanguageNamePipe', () => {
    let pipe: LanguageNamePipe;
    let translateService: TranslateService;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [provideTranslateService()],
        });
        translateService = TestBed.inject(TranslateService);
        pipe = new LanguageNamePipe(translateService);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should create', () => {
        expect(pipe).toBeTruthy();
    });

    it('should return EMPTY for missing languages', () => {
        expect(pipe.transform(null)).toBe(EMPTY);
        expect(pipe.transform(undefined)).toBe(EMPTY);
        expect(pipe.transform(EMPTY)).toBe(EMPTY);
    });

    it('should use English names by default', () => {
        expect(pipe.transform('pt')).toBe('Portuguese');
        expect(pipe.transform('de')).toBe('German');
    });

    it('should use the requested display language', () => {
        expect(pipe.transform('pt', 'pt')).toBe('Português');
        expect(pipe.transform('en', 'es')).toBe('Inglés');
        expect(pipe.transform('de', 'fr')).toBe('Allemand');
    });

    it('should keep the sentence casing of the display language when used inside a sentence', () => {
        expect(pipe.transform('pt', 'pt', true)).toBe('português');
        expect(pipe.transform('en', 'es', true)).toBe('inglés');
        expect(pipe.transform('de', 'fr', true)).toBe('allemand');
        expect(pipe.transform('fr', 'de', true)).toBe('Französisch');
        expect(pipe.transform('pt', 'en', true)).toBe('Portuguese');
    });

    it('should capitalize the name when not used inside a sentence', () => {
        expect(pipe.transform('pt', 'pt', false)).toBe('Português');
    });

    it('should fall back gracefully for unknown codes', () => {
        expect(pipe.transform('zz', 'en')).toBe('ZZ');
    });

    it('should label automatic detection with the translation of the active app language', async () => {
        translateService.setTranslation('en', { languages: { autoDetect: 'Detect automatically' } });
        translateService.setTranslation('pt', { languages: { autoDetect: 'Detectar automaticamente' } });
        await firstValueFrom(translateService.use('en'));

        expect(pipe.transform(AUTO_LANGUAGE)).toBe('Detect automatically');
        expect(pipe.transform(AUTO_LANGUAGE, 'en')).toBe('Detect automatically');

        await firstValueFrom(translateService.use('pt'));

        expect(pipe.transform(AUTO_LANGUAGE, 'pt')).toBe('Detectar automaticamente');
    });

    it('should fall back to the translation key while the automatic detection label is not loaded', () => {
        expect(pipe.transform(AUTO_LANGUAGE, 'en')).toBe('languages.autoDetect');
    });

    it('should resolve real language codes without the translation service', () => {
        const instantSpy: MockInstance<TranslateService['instant']> = vi.spyOn(translateService, 'instant');

        expect(pipe.transform('pt', 'en')).toBe('Portuguese');
        expect(instantSpy).not.toHaveBeenCalled();
    });
});
