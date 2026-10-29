import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { SplashService } from './services/splash/splash.service';
import { EMPTY, IconUtils } from './shared/utils';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false,
})
export class AppComponent implements OnDestroy, OnInit {
    private _splashFinished: boolean = false;
    private _subscription: Subscription | null = null;

    constructor(
        private changeDetectorRef: ChangeDetectorRef,
        private splashService: SplashService,
    ) {
        IconUtils.register();
    }

    get contentInert(): string | null {
        return this._splashFinished ? null : EMPTY;
    }

    get splashFinished(): boolean {
        return this._splashFinished;
    }

    ngOnDestroy(): void {
        this._subscription?.unsubscribe();
        this._subscription = null;
    }

    ngOnInit(): void {
        this._subscription = this.splashService.changes().subscribe((finished: boolean) => {
            this._splashFinished = finished;
            this.changeDetectorRef.markForCheck();
        });
    }
}
