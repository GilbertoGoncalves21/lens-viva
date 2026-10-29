import Swal from 'sweetalert2';
import { SwalUtils } from './swal-utils';

type MatchMediaFunction = (query: string) => MediaQueryList;

describe('SwalUtils with the real SweetAlert2', () => {
    const originalMatchMedia: MatchMediaFunction | undefined = window.matchMedia;

    function confirmButton(): HTMLElement | null {
        return document.querySelector<HTMLElement>('.swal2-confirm');
    }

    function expectCleanResultDialog(iconClass: string, message: string): void {
        const popup: HTMLElement | null = visiblePopup();

        expect(popup).not.toBeNull();
        expect(document.querySelectorAll('.swal2-popup').length).toBe(1);
        expect(popup?.classList.contains('swal2-loading')).toBe(false);
        expect(popup?.classList.contains('lens-swal-loading')).toBe(false);
        expect(popup?.getAttribute('data-loading')).toBeNull();
        expect(popup?.getAttribute('aria-busy')).toBeNull();
        expect(document.querySelector('.swal2-actions.swal2-loading')).toBeNull();
        expect(document.querySelector(`.swal2-icon.${iconClass}`)).not.toBeNull();
        expect(document.querySelector('.swal2-html-container')?.textContent).toBe(message);
        expect(loader()?.style.display).not.toBe('flex');
        expect(confirmButton()?.style.display).toBe('inline-block');
    }

    function expectLoadingDialog(message: string): void {
        const popup: HTMLElement | null = visiblePopup();

        expect(popup?.classList.contains('swal2-loading')).toBe(true);
        expect(popup?.getAttribute('data-loading')).toBe('true');
        expect(loader()?.style.display).toBe('flex');
        expect(document.querySelector('.swal2-title')?.textContent).toBe(message);
        expect(document.querySelector('.swal2-icon.swal2-success')).toBeNull();
    }

    function loader(): HTMLElement | null {
        return document.querySelector<HTMLElement>('.swal2-loader');
    }

    function mediaQueryList(query: string): MediaQueryList {
        return {
            addEventListener: (): void => undefined,
            matches: true,
            media: query,
            removeEventListener: (): void => undefined,
        } as unknown as MediaQueryList;
    }

    function visiblePopup(): HTMLElement | null {
        return document.querySelector<HTMLElement>('.swal2-popup:not(.swal2-hide)');
    }

    beforeEach(() => {
        Object.defineProperty(window, 'matchMedia', { configurable: true, value: mediaQueryList, writable: true });
        vi.spyOn(window, 'scrollTo').mockImplementation((): void => undefined);
        vi.useFakeTimers();
    });

    afterEach(async () => {
        SwalUtils.showLoading(false);
        await vi.runAllTimersAsync();
        Swal.close();
        await vi.runAllTimersAsync();
        vi.useRealTimers();
        vi.restoreAllMocks();
        Object.defineProperty(window, 'matchMedia', { configurable: true, value: originalMatchMedia, writable: true });
    });

    it('should open the loading dialog with an active loader', () => {
        SwalUtils.showLoading(true, 'Apagando');
        vi.runAllTimers();

        expectLoadingDialog('Apagando');
    });

    it('should show a clean success dialog when the loading result replaces the loading dialog', () => {
        SwalUtils.showLoading(true, 'Apagando');
        SwalUtils.showLoadingResult('success', 'Pacote removido');
        vi.runAllTimers();

        expectCleanResultDialog('swal2-success', 'Pacote removido');
    });

    it('should keep the success dialog open when the loading dialog it replaced is hidden', async () => {
        SwalUtils.showLoading(true, 'Apagando');
        SwalUtils.showLoadingResult('success', 'Pacote removido');
        SwalUtils.showLoading(false);
        await vi.runAllTimersAsync();

        expectCleanResultDialog('swal2-success', 'Pacote removido');
    });

    it('should keep a message queued behind a loading result until the result is closed, even when the loading dialog is hidden afterwards', async () => {
        SwalUtils.showLoading(true, 'Apagando');

        const result: Promise<void> = SwalUtils.showLoadingResult('success', 'Pacote removido');

        SwalUtils.showInfoMessage('Outra mensagem');
        SwalUtils.showLoading(false);
        await vi.runAllTimersAsync();

        expectCleanResultDialog('swal2-success', 'Pacote removido');

        confirmButton()?.click();
        await vi.runAllTimersAsync();
        await result;

        expectCleanResultDialog('swal2-info', 'Outra mensagem');
    });

    it('should show a clean error dialog when the loading result replaces a loader that already started', () => {
        SwalUtils.showLoading(true, 'Baixando');
        vi.runAllTimers();
        SwalUtils.showLoadingResult('error', 'Falhou');
        vi.runAllTimers();

        expectCleanResultDialog('swal2-error', 'Falhou');
    });

    it('should keep a success message requested while loading off screen until the loading dialog is hidden', async () => {
        SwalUtils.showLoading(true, 'Apagando');
        SwalUtils.showSuccessMessage('Pacote removido');
        await vi.runAllTimersAsync();

        expectLoadingDialog('Apagando');

        SwalUtils.showLoading(false);
        await vi.runAllTimersAsync();

        expectCleanResultDialog('swal2-success', 'Pacote removido');
    });

    it('should show a clean success dialog after the loading dialog was hidden', async () => {
        SwalUtils.showLoading(true, 'Apagando');
        vi.runAllTimers();
        SwalUtils.showLoading(false);
        SwalUtils.showSuccessMessage('Pacote removido');
        await vi.runAllTimersAsync();

        expectCleanResultDialog('swal2-success', 'Pacote removido');
    });

    it('should close the loading dialog when hidden', async () => {
        SwalUtils.showLoading(true, 'Baixando');
        vi.runAllTimers();
        SwalUtils.showLoading(false);
        await vi.runAllTimersAsync();

        expect(visiblePopup()).toBeNull();
    });

    it('should resolve the success message once its dialog is confirmed', async () => {
        let closed: boolean = false;
        const closing: Promise<void> = SwalUtils.showSuccessMessage('Pacote baixado').then((): void => {
            closed = true;
        });

        await vi.runAllTimersAsync();

        expect(closed).toBe(false);

        confirmButton()?.click();
        await vi.runAllTimersAsync();
        await closing;

        expect(closed).toBe(true);
        expect(visiblePopup()).toBeNull();
    });
});
