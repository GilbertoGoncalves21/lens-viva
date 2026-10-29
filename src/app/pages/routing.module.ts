import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { EMPTY } from '../shared/utils';
import { CameraComponent } from './camera/camera.component';
import { HistoryComponent } from './history/history.component';
import { LanguagesComponent } from './languages/languages.component';
import { SettingsComponent } from './settings/settings.component';
import { TermsComponent } from './terms/terms.component';

const routes: Routes = [
    {
        path: EMPTY,
        pathMatch: 'full',
        redirectTo: 'camera',
    },
    {
        path: 'camera',
        component: CameraComponent,
    },
    {
        path: 'history',
        component: HistoryComponent,
    },
    {
        path: 'demo',
        loadComponent: () => import('./demo/demo.component').then(module => module.DemoComponent),
    },
    {
        path: 'languages',
        component: LanguagesComponent,
    },
    {
        path: 'settings',
        component: SettingsComponent,
    },
    {
        path: 'terms',
        component: TermsComponent,
    },
    {
        path: '**',
        redirectTo: 'camera',
    },
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule],
})
export class RoutingModule {}
