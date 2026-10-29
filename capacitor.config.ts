import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    android: {
        backgroundColor: '#00000000',
    },
    appId: 'com.oaxis.lensviva',
    appName: 'Lens Viva',
    backgroundColor: '#0f172a',
    loggingBehavior: 'none',
    webDir: 'dist/lens-viva/browser',
};

export default config;
