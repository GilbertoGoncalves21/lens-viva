import { MenuTranslationUtils } from './menu-translation-utils';

describe('MenuTranslationUtils', () => {
    const pair = { sourceLanguage: 'en', targetLanguage: 'pt' };

    it('should recognize a menu from multiple different headings', () => {
        expect(MenuTranslationUtils.isMenu(['Appetizers', 'Wine list', 'Sake'])).toBe(true);
        expect(MenuTranslationUtils.isMenu(['Sides', 'Sides'])).toBe(false);
        expect(MenuTranslationUtils.isMenu(['For the sake of our children', 'The two sides agree'])).toBe(false);
    });

    it('should translate menu terms in their culinary sense', () => {
        expect(MenuTranslationUtils.translate('Sake', pair)).toBe('Saquê');
        expect(MenuTranslationUtils.translate('Sides', pair)).toBe('Acompanhamentos');
        expect(MenuTranslationUtils.translate('Entrées', pair)).toBe('Pratos principais');
        expect(MenuTranslationUtils.translate('Beers', pair)).toBe('Cervejas');
        expect(MenuTranslationUtils.translate('Desserts', pair)).toBe('Sobremesas');
    });

    it('should leave ambiguous OCR and sentences to the translation engine', () => {
        expect(MenuTranslationUtils.translate('Beets', pair)).toBeNull();
        expect(MenuTranslationUtils.translate('Beeks', pair)).toBeNull();
        expect(MenuTranslationUtils.translate('For the sake of science', pair)).toBeNull();
        expect(MenuTranslationUtils.translate('Sake', { sourceLanguage: 'en', targetLanguage: 'es' })).toBeNull();
    });
});
