import { InjectionToken } from '@angular/core';
import { registerPlugin } from '@capacitor/core';
import { LensEnginePlugin } from 'src/app/shared/models';

export const LensEngine: LensEnginePlugin = registerPlugin<LensEnginePlugin>('LensEngine', {
    web: () => import('./lens-engine-web').then((module: typeof import('./lens-engine-web')) => new module.LensEngineWeb()),
});

export const LENS_ENGINE_PLUGIN: InjectionToken<LensEnginePlugin> = new InjectionToken<LensEnginePlugin>('LENS_ENGINE_PLUGIN', {
    factory: () => LensEngine,
    providedIn: 'root',
});
