import { TestBed } from '@angular/core/testing';
import { Subscription } from 'rxjs';
import { SplashService } from './splash.service';

function flushPromises(): Promise<void> {
    return new Promise<void>((resolve: () => void) => setTimeout(resolve, 0));
}

describe('SplashService', () => {
    let emissions: boolean[];
    let service: SplashService;
    let subscription: Subscription;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(SplashService);
        emissions = [];
        subscription = service.changes().subscribe((finished: boolean) => emissions.push(finished));
    });

    afterEach(() => {
        subscription.unsubscribe();
    });

    it('should be created as a single instance for the whole app', () => {
        expect(service).toBeTruthy();
        expect(TestBed.inject(SplashService)).toBe(service);
    });

    it('should start unfinished and emit the current state on subscription', () => {
        expect(service.finished).toBe(false);
        expect(emissions).toEqual([false]);
    });

    describe('complete', () => {
        it('should mark the opening animation as finished and emit it', () => {
            service.complete();

            expect(service.finished).toBe(true);
            expect(emissions).toEqual([false, true]);
        });

        it('should emit the finished state only once when it is completed again', () => {
            service.complete();
            service.complete();
            service.complete();

            expect(service.finished).toBe(true);
            expect(emissions).toEqual([false, true]);
        });

        it('should replay the finished state to a late subscriber', () => {
            const lateEmissions: boolean[] = [];

            service.complete();

            const lateSubscription: Subscription = service.changes().subscribe((finished: boolean) => lateEmissions.push(finished));

            expect(lateEmissions).toEqual([true]);

            lateSubscription.unsubscribe();
        });
    });

    describe('whenFinished', () => {
        it('should stay pending while the opening animation is playing', async () => {
            let resolved: boolean = false;

            service.whenFinished().then(() => {
                resolved = true;
            });
            await flushPromises();

            expect(resolved).toBe(false);
        });

        it('should resolve once the opening animation completes', async () => {
            let resolved: boolean = false;
            const finished: Promise<void> = service.whenFinished().then(() => {
                resolved = true;
            });

            service.complete();
            await finished;

            expect(resolved).toBe(true);
        });

        it('should resolve every waiting caller when the opening animation completes', async () => {
            const first: Promise<void> = service.whenFinished();
            const second: Promise<void> = service.whenFinished();

            service.complete();

            await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
        });

        it('should resolve right away when the opening animation already finished', async () => {
            service.complete();

            await expect(service.whenFinished()).resolves.toBeUndefined();
        });
    });
});
