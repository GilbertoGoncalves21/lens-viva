import { InjectionToken } from '@angular/core';
import { App, AppPlugin } from '@capacitor/app';
import { Device, DevicePlugin } from '@capacitor/device';
import { Preferences, PreferencesPlugin } from '@capacitor/preferences';

export const APP_PLUGIN: InjectionToken<AppPlugin> = new InjectionToken<AppPlugin>('APP_PLUGIN', {
    factory: (): AppPlugin => App,
    providedIn: 'root',
});

export const DEVICE_PLUGIN: InjectionToken<DevicePlugin> = new InjectionToken<DevicePlugin>('DEVICE_PLUGIN', {
    factory: (): DevicePlugin => Device,
    providedIn: 'root',
});

export const PREFERENCES_PLUGIN: InjectionToken<PreferencesPlugin> = new InjectionToken<PreferencesPlugin>('PREFERENCES_PLUGIN', {
    factory: (): PreferencesPlugin => Preferences,
    providedIn: 'root',
});
