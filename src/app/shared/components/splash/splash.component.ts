import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { SplashService } from 'src/app/services/splash/splash.service';
import { MotionUtils, SPLASH_CONFIG } from 'src/app/shared/utils';

@Component({
    selector: 'app-splash',
    templateUrl: './splash.component.html',
    styleUrls: ['./splash.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false,
})
export class SplashComponent implements OnDestroy, OnInit {
    private _leaving: boolean = false;
    private _reducedMotion: boolean = false;
    private _timers: ReturnType<typeof setTimeout>[] = [];
    private _visible: boolean = true;

    constructor(
        private changeDetectorRef: ChangeDetectorRef,
        private splashService: SplashService,
    ) {}

    get leaving(): boolean {
        return this._leaving;
    }

    get reducedMotion(): boolean {
        return this._reducedMotion;
    }

    get visible(): boolean {
        return this._visible;
    }

    ngOnDestroy(): void {
        this.clearTimers();
        this.splashService.complete();
    }

    ngOnInit(): void {
        this._reducedMotion = MotionUtils.prefersReducedMotion();
        this._timers = [
            setTimeout((): void => this.startLeaving(), SPLASH_CONFIG.durationMilliseconds - SPLASH_CONFIG.exitMilliseconds),
            setTimeout((): void => this.finish(), SPLASH_CONFIG.durationMilliseconds),
        ];
    }

    private clearTimers(): void {
        this._timers.forEach((timer: ReturnType<typeof setTimeout>) => clearTimeout(timer));
        this._timers = [];
    }

    private finish(): void {
        this.clearTimers();
        this._visible = false;
        this.changeDetectorRef.detectChanges();
        this.splashService.complete();
    }

    private startLeaving(): void {
        this._leaving = true;
        this.changeDetectorRef.detectChanges();
    }
}
