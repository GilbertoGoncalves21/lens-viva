import { NgOptimizedImage, NgTemplateOutlet } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { IonicComponentsModule } from '../ionic/ionic.module';
import { SharedModule } from '../shared/shared.module';
import { CameraComponent } from './camera/camera.component';
import { HistoryComponent } from './history/history.component';
import { LanguagesComponent } from './languages/languages.component';
import { RoutingModule } from './routing.module';
import { SettingsComponent } from './settings/settings.component';
import { TermsComponent } from './terms/terms.component';

@NgModule({
    declarations: [
            CameraComponent
        ,   HistoryComponent
        ,   LanguagesComponent
        ,   SettingsComponent
        ,   TermsComponent
    ],
    imports: [
            IonicComponentsModule
        ,   NgOptimizedImage
        ,   NgTemplateOutlet
        ,   ReactiveFormsModule
        ,   RoutingModule
        ,   SharedModule
    ],
})
export class PagesModule {}
