import { TestBed } from '@angular/core/testing';
import type { MockInstance } from 'vitest';
import { environment } from 'src/environments/environment';
import { LoggerService } from './logger.service';

interface LoggedError {
    reason: string;
    [key: string]: boolean | number | string | null;
}

describe('LoggerService', () => {
    let consoleDebugSpy: MockInstance<typeof console.debug>;
    let consoleErrorSpy: MockInstance<typeof console.error>;
    let consoleWarnSpy: MockInstance<typeof console.warn>;
    let service: LoggerService;

    beforeEach(() => {
        consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation((): void => undefined);
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((): void => undefined);
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation((): void => undefined);

        TestBed.configureTestingModule({});
        service = TestBed.inject(LoggerService);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    function lastLoggedError(): LoggedError {
        const calls: unknown[][] = consoleErrorSpy.mock.calls;

        return calls[calls.length - 1][1] as LoggedError;
    }

    it('should be created', () => {
        expect(service).toBeTruthy();
    });

    it('should start with the production flag of the environment', () => {
        expect(service.production).toBe(environment.production);
    });

    it('should switch the production flag', () => {
        service.setProduction(true);

        expect(service.production).toBe(true);

        service.setProduction(false);

        expect(service.production).toBe(false);
    });

    describe('debug', () => {
        it('should log with the app prefix outside production', () => {
            service.setProduction(false);

            service.debug('camera-started', { analysesPerSecond: 3 });

            expect(consoleDebugSpy).toHaveBeenCalledWith('[LensViva] camera-started', { analysesPerSecond: 3 });
        });

        it('should use empty details by default', () => {
            service.setProduction(false);

            service.debug('camera-started');

            expect(consoleDebugSpy).toHaveBeenCalledWith('[LensViva] camera-started', {});
        });

        it('should stay silent in production', () => {
            service.setProduction(true);

            service.debug('camera-started', { analysesPerSecond: 3 });

            expect(consoleDebugSpy).not.toHaveBeenCalled();
        });
    });

    describe('warn', () => {
        it('should log in every mode', () => {
            service.setProduction(true);
            service.warn('slow-frame', { durationMilliseconds: 120 });
            service.setProduction(false);
            service.warn('slow-frame');

            expect(consoleWarnSpy).toHaveBeenNthCalledWith(1, '[LensViva] slow-frame', { durationMilliseconds: 120 });
            expect(consoleWarnSpy).toHaveBeenNthCalledWith(2, '[LensViva] slow-frame', {});
        });
    });

    describe('error', () => {
        it('should include the error message outside production', () => {
            service.setProduction(false);

            service.error('translation-failed', new TypeError('model missing'), { language: 'pt' });

            expect(consoleErrorSpy).toHaveBeenCalledWith('[LensViva] translation-failed', {
                language: 'pt',
                reason: 'TypeError: model missing',
            });
        });

        it('should hide the error message in production', () => {
            service.setProduction(true);

            service.error('translation-failed', new TypeError('Grilled chicken with lemon'));

            expect(lastLoggedError().reason).toBe('TypeError');
            expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain('Grilled chicken');
        });

        it('should keep the error code of errors in production', () => {
            const error: Error & { code: string } = Object.assign(new Error('secret text'), { code: 'MODEL_MISSING' });

            service.setProduction(true);
            service.error('translation-failed', error);

            expect(lastLoggedError().reason).toBe('Error (MODEL_MISSING)');
        });

        it('should include the code and the message of errors outside production', () => {
            const error: Error & { code: string } = Object.assign(new Error('not downloaded'), { code: 'MODEL_MISSING' });

            service.setProduction(false);
            service.error('translation-failed', error);

            expect(lastLoggedError().reason).toBe('Error (MODEL_MISSING): not downloaded');
        });

        it('should describe plain objects through their code', () => {
            service.setProduction(true);
            service.error('engine-error', { code: 'CAMERA_UNAVAILABLE', message: 'secret' });

            expect(lastLoggedError().reason).toBe('CAMERA_UNAVAILABLE');
        });

        it('should ignore empty codes', () => {
            service.setProduction(true);
            service.error('engine-error', { code: null });

            expect(lastLoggedError().reason).toBe('unknown');
        });

        it('should hide unknown values in production', () => {
            service.setProduction(true);
            service.error('engine-error', 'Daily Specials');

            expect(lastLoggedError().reason).toBe('unknown');
        });

        it('should stringify unknown values outside production', () => {
            service.setProduction(false);
            service.error('engine-error', 42);

            expect(lastLoggedError().reason).toBe('42');
        });
    });
});
