import { IconUtils } from './icon-utils';

interface IoniconsWindow {
    Ionicons?: { map?: Map<string, string> };
}

const USED_ICON_NAMES: string[] = [
    'alert-circle-outline'
,   'camera-outline'
,   'cloud-download-outline'
,   'document-text-outline'
,   'eye-outline'
,   'help-circle-outline'
,   'language-outline'
,   'play-outline'
,   'refresh-outline'
,   'scan-outline'
,   'settings-outline'
,   'shield-checkmark-outline'
,   'snow-outline'
,   'sparkles-outline'
,   'time-outline'
,   'trash-outline'
];

const UNUSED_ICON_NAMES: string[] = [
    'arrow-forward-outline'
,   'checkmark-circle'
,   'globe-outline'
,   'swap-horizontal-outline'
];

function registeredIconNames(): string[] {
    return [...((window as unknown as IoniconsWindow).Ionicons?.map?.keys() ?? [])];
}

describe('IconUtils', () => {
    describe('register', () => {
        it('should register the icons without throwing', () => {
            expect(() => IconUtils.register()).not.toThrow();
        });

        it('should be safe to call more than once', () => {
            IconUtils.register();

            expect(() => IconUtils.register()).not.toThrow();
        });

        it('should register every icon used by the templates', () => {
            IconUtils.register();

            expect(registeredIconNames()).toEqual(expect.arrayContaining(USED_ICON_NAMES));
        });

        it('should not register icons that no template uses', () => {
            IconUtils.register();

            const registered: string[] = registeredIconNames();

            UNUSED_ICON_NAMES.forEach((iconName: string) => expect(registered).not.toContain(iconName));
        });
    });
});
