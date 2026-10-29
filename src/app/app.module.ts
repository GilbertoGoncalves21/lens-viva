import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { APP_INITIALIZER, NgModule, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { IonicComponentsModule } from './ionic/ionic.module';
import { AppLanguageService } from './services/app-language/app-language.service';
import { SharedModule } from './shared/shared.module';
import { DEFAULT_APP_LANGUAGE, MotionUtils } from './shared/utils';

export function initializeApplication(appLanguageService: AppLanguageService): () => Promise<void> {
    return () => appLanguageService.initialize();
}

@NgModule({
    declarations: [
            AppComponent
    ],
    imports: [
            AppRoutingModule
        ,   BrowserModule
        ,   IonicComponentsModule
        ,   SharedModule
    ],
    providers: [
            provideBrowserGlobalErrorListeners()
        ,   provideHttpClient(withInterceptorsFromDi())
        ,   provideIonicAngular({ animated: !MotionUtils.prefersReducedMotion(), mode: 'md' })
        ,   provideTranslateService({
                fallbackLang: DEFAULT_APP_LANGUAGE,
                loader: provideTranslateHttpLoader({ prefix: './i18n/', suffix: '.json' }),
            })
        ,   provideZonelessChangeDetection()
        ,   { provide: RouteReuseStrategy, useClass: IonicRouteStrategy }
        ,   { provide: APP_INITIALIZER, useFactory: initializeApplication, deps: [AppLanguageService], multi: true }
    ],
    bootstrap: [AppComponent],
})
export class AppModule {}
