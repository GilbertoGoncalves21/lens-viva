import { OverlayItem, OverlayStatus } from 'src/app/shared/models';

interface DemoText {
    original: string;
    translated: string;
    y: number;
}

export interface DemoScene {
    id: 'phrase' | 'menu' | 'paragraph';
    titleKey: string;
    category: string;
    title: string;
    lines: readonly DemoText[];
}

// Curated bilingual fixtures, never responses from a live translation provider.
export const DEMO_SCENES: readonly DemoScene[] = [
    {
        id: 'phrase',
        titleKey: 'demo.phrase',
        category: 'A LITTLE PERSPECTIVE',
        title: 'Notes for today',
        lines: [
            {
                original: 'Everything happens for a reason.',
                translated: 'Tudo acontece por um motivo.',
                y: 0.4,
            },
        ],
    },
    {
        id: 'menu',
        titleKey: 'demo.menu',
        category: 'THE CORNER TABLE',
        title: 'Evening menu',
        lines: [
            { original: 'Sides', translated: 'Acompanhamentos', y: 0.3 },
            { original: 'Beers', translated: 'Cervejas', y: 0.5 },
            { original: 'Sake', translated: 'Saquê', y: 0.7 },
        ],
    },
    {
        id: 'paragraph',
        titleKey: 'demo.paragraph',
        category: 'A MOMENT TO READ',
        title: 'Take your time',
        lines: [
            {
                original:
                    'Travel lets us discover new places, meet different people, and see familiar things from another perspective.',
                translated:
                    'Viajar nos permite descobrir novos lugares, conhecer pessoas diferentes e enxergar coisas familiares por outra perspectiva.',
                y: 0.34,
            },
        ],
    },
];

export function demoOverlays(scene: DemoScene): OverlayItem[] {
    return scene.lines.map((line, index) => {
        const rect = { x: 0.1, y: line.y, width: 0.8, height: 0.08 };
        return {
            regionId: `demo-${scene.id}-${index}`,
            originalText: line.original,
            translatedText: line.translated,
            anchorRect: rect,
            observedRect: rect,
            candidateText: line.original,
            orientation: 0,
            orientedHeight: rect.height,
            orientedWidth: rect.width,
            failedAt: null,
            failedAttempts: 0,
            firstSeenAt: 0,
            lastSeenAt: 0,
            showOriginal: false,
            sourceLanguage: 'en',
            stabilityScore: 1,
            status: OverlayStatus.TRANSLATED,
            textVersion: 1,
        };
    });
}
