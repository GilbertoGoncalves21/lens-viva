import { NgModule } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { IonicComponentsModule } from '../ionic/ionic.module';
import { LayoutComponent, OverlayLayerComponent, SplashComponent } from './components';
import { LanguageNamePipe } from './pipe';

@NgModule({
    declarations: [
            LanguageNamePipe
        ,   LayoutComponent
        ,   OverlayLayerComponent
        ,   SplashComponent
    ],
    imports: [
            IonicComponentsModule
        ,   TranslatePipe
    ],
    exports: [
            LanguageNamePipe
        ,   LayoutComponent
        ,   OverlayLayerComponent
        ,   SplashComponent
        ,   TranslatePipe
    ],
})
export class SharedModule {}
