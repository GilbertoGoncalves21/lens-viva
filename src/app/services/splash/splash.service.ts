import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, filter, firstValueFrom } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class SplashService {
    private _finished$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

    constructor() {}

    get finished(): boolean {
        return this._finished$.value;
    }

    changes(): Observable<boolean> {
        return this._finished$.asObservable();
    }

    complete(): void {
        if (!this._finished$.value) {
            this._finished$.next(true);
        }
    }

    whenFinished(): Promise<void> {
        if (this._finished$.value) {
            return Promise.resolve();
        }

        return firstValueFrom(this._finished$.pipe(filter((finished: boolean) => finished))).then((): void => undefined);
    }
}
