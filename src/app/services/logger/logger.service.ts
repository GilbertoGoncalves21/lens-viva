import { Injectable } from '@angular/core';
import { LogDetails } from 'src/app/shared/models';
import { environment } from 'src/environments/environment';

@Injectable({
    providedIn: 'root'
})
export class LoggerService {
    private _production: boolean = environment.production;

    constructor() {}

    get production(): boolean {
        return this._production;
    }

    debug(event: string, details: LogDetails = {}): void {
        if (!this._production) {
            console.debug(`[LensViva] ${event}`, details);
        }
    }

    error(event: string, error: unknown, details: LogDetails = {}): void {
        console.error(`[LensViva] ${event}`, { ...details, reason: this.describe(error) });
    }

    setProduction(production: boolean): void {
        this._production = production;
    }

    warn(event: string, details: LogDetails = {}): void {
        console.warn(`[LensViva] ${event}`, details);
    }

    private codeOf(error: unknown): string | null {
        if (typeof error !== 'object' || error === null || !('code' in error)) {
            return null;
        }

        const code: unknown = (error as { code: unknown }).code;

        return code === undefined || code === null ? null : String(code);
    }

    private describe(error: unknown): string {
        const code: string | null = this.codeOf(error);

        if (error instanceof Error) {
            const name: string = code ? `${error.name} (${code})` : error.name;

            return this._production ? name : `${name}: ${error.message}`;
        }

        if (code) {
            return code;
        }

        return this._production ? 'unknown' : String(error);
    }
}
