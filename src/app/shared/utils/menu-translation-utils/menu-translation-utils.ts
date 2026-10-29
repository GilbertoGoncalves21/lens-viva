import { LanguagePair } from '../../models';
import { TextUtils } from '../text-utils/text-utils';

// Exact menu headings only. Never rewrite similar-looking OCR words: e.g.
// "beets" is a real food and must not be guessed to mean "beers".
const MENU_HEADINGS: Map<string, string> = new Map([
    ['menu', 'Cardápio'],
    ['dinner menu', 'Cardápio do jantar'],
    ['lunch menu', 'Cardápio do almoço'],
    ['sushi menu', 'Cardápio de sushi'],
    ['appetizers', 'Entradas'],
    ['appetisers', 'Entradas'],
    ['entrees', 'Pratos principais'],
    ['main courses', 'Pratos principais'],
    ['sides', 'Acompanhamentos'],
    ['specials', 'Especiais'],
    ['daily specials', 'Pratos do dia'],
    ['snacks', 'Petiscos'],
    ['drinks', 'Bebidas'],
    ['beverages', 'Bebidas'],
    ['sake', 'Saquê'],
    ['beers', 'Cervejas'],
    ['wine list', 'Carta de vinhos'],
    ['cocktails', 'Coquetéis'],
    ['soft drinks', 'Refrigerantes'],
    ['soups', 'Sopas'],
    ['salads', 'Saladas'],
    ['desserts', 'Sobremesas'],
    ['reservation', 'Reservas'],
    ['reservations', 'Reservas'],
]);

export class MenuTranslationUtils {
    static isMenu(texts: string[]): boolean {
        const headings: Set<string> = new Set(texts.map((text: string) => this.key(text)).filter((key: string) => MENU_HEADINGS.has(key)));
        return headings.size >= 2;
    }

    static translate(text: string, pair: LanguagePair): string | null {
        return pair.sourceLanguage === 'en' && pair.targetLanguage === 'pt'
            ? MENU_HEADINGS.get(this.key(text)) ?? null
            : null;
    }

    private static key(text: string): string {
        return TextUtils.normalize(text).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[:：]$/u, '').trim();
    }
}
