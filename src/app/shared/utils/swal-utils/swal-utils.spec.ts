import Swal, { SweetAlertOptions, SweetAlertResult } from 'sweetalert2';
import type { MockInstance } from 'vitest';
import { SwalLabels } from '../../models';
import { EMPTY } from '../constants/constants';
import { SwalUtils } from './swal-utils';

type FireFunction = (options: SweetAlertOptions) => Promise<SweetAlertResult>;

describe('SwalUtils', () => {
    const translatedLabels: SwalLabels = {
        cancel: 'Cancelar',
        confirm: 'Confirmar',
        errorTitle: 'Erro',
        infoTitle: 'Informação',
        successTitle: 'Sucesso',
        warningTitle: 'Atenção',
    };
    let closeSpy: MockInstance<() => void>;
    let fireSpy: MockInstance<FireFunction>;
    let hideLoadingSpy: MockInstance<() => void>;
    let originalLabels: SwalLabels;
    let showLoadingSpy: MockInstance<() => void>;

    beforeEach(() => {
        originalLabels = SwalUtils.labels;
        SwalUtils.setLabels(translatedLabels);
        fireSpy = vi.spyOn(Swal, 'fire') as unknown as MockInstance<FireFunction>;
        fireSpy.mockResolvedValue({ isConfirmed: false, isDenied: false, isDismissed: true });
        closeSpy = vi.spyOn(Swal, 'close').mockImplementation(() => undefined) as unknown as MockInstance<() => void>;
        hideLoadingSpy = vi.spyOn(Swal, 'hideLoading').mockImplementation(() => undefined) as unknown as MockInstance<() => void>;
        showLoadingSpy = vi.spyOn(Swal, 'showLoading').mockImplementation(() => undefined) as unknown as MockInstance<() => void>;
    });

    afterEach(async () => {
        SwalUtils.showLoading(false);
        await flushPromises();
        SwalUtils.setLabels(originalLabels);
        vi.restoreAllMocks();
    });

    function firedTexts(): (string | undefined)[] {
        return fireSpy.mock.calls.map((call: [SweetAlertOptions]) => call[0].text);
    }

    function flushPromises(): Promise<void> {
        return new Promise<void>((resolve: () => void) => setTimeout(resolve, 0));
    }

    function lastOptions(): SweetAlertOptions {
        return fireSpy.mock.calls[fireSpy.mock.calls.length - 1][0];
    }

    function popupElement(loading: boolean): HTMLElement {
        const popup: HTMLElement = document.createElement('section');

        popup.classList.toggle('swal2-loading', loading);

        return popup;
    }

    function selectPopup(languages: Record<string, string>): HTMLElement {
        const popup: HTMLElement = popupElement(false);
        const select: HTMLSelectElement = document.createElement('select');

        select.className = 'swal2-select';
        Object.keys(languages).forEach((language: string) => select.add(new Option(languages[language], language)));
        popup.appendChild(select);

        return popup;
    }

    describe('labels', () => {
        it('should expose the labels that were set', () => {
            expect(SwalUtils.labels).toEqual(translatedLabels);
        });

        it('should have English defaults', () => {
            expect(originalLabels.confirm).toBe('OK');
            expect(originalLabels.cancel).toBe('Cancel');
        });
    });

    describe('messages', () => {
        it('should show success messages with the translated title on the dark theme', () => {
            SwalUtils.showSuccessMessage('Pacote baixado');

            expect(lastOptions()).toEqual(expect.objectContaining({
                confirmButtonText: 'Confirmar',
                heightAuto: false,
                icon: 'success',
                text: 'Pacote baixado',
                theme: 'dark',
                title: 'Sucesso',
            }));
        });

        it('should show error messages with the translated title', () => {
            SwalUtils.showErrorMessage('Falhou');

            expect(lastOptions()).toEqual(expect.objectContaining({ heightAuto: false, icon: 'error', text: 'Falhou', theme: 'dark', title: 'Erro' }));
        });

        it('should show warning messages with the translated title', () => {
            SwalUtils.showWarningMessage('Cuidado');

            expect(lastOptions()).toEqual(expect.objectContaining({ heightAuto: false, icon: 'warning', text: 'Cuidado', theme: 'dark', title: 'Atenção' }));
        });

        it('should show info messages with the translated title', () => {
            SwalUtils.showInfoMessage('Dica');

            expect(lastOptions()).toEqual(expect.objectContaining({ heightAuto: false, icon: 'info', text: 'Dica', theme: 'dark', title: 'Informação' }));
        });

        it('should never ask for a loader on a message', () => {
            SwalUtils.showSuccessMessage('Pacote baixado');

            expect(lastOptions().willOpen).toBeUndefined();
            expect(lastOptions().showConfirmButton).toBeUndefined();
        });

        it('should resolve the success message only after the dialog has closed', async () => {
            let closed: boolean = false;
            const closing: Promise<void> = SwalUtils.showSuccessMessage('Pacote removido').then((): void => {
                closed = true;
            });

            await Promise.resolve();

            expect(closed).toBe(false);

            lastOptions().didClose?.();
            await closing;

            expect(closed).toBe(true);
        });

        it('should resolve the success message when another dialog replaces it', async () => {
            const closing: Promise<void> = SwalUtils.showSuccessMessage('Pacote removido');
            const successOptions: SweetAlertOptions = lastOptions();

            SwalUtils.showErrorMessage('Falhou');
            successOptions.didDestroy?.();

            await expect(closing).resolves.toBeUndefined();
        });

        it('should hide a loader left on its own popup once open', () => {
            SwalUtils.showSuccessMessage('Pacote removido');

            lastOptions().didOpen?.(popupElement(true));

            expect(hideLoadingSpy).toHaveBeenCalledTimes(1);
        });

        it('should leave a popup without a loader untouched once open', () => {
            SwalUtils.showSuccessMessage('Pacote removido');

            lastOptions().didOpen?.(popupElement(false));

            expect(hideLoadingSpy).not.toHaveBeenCalled();
        });

        it('should not touch a newer dialog when it opens after being replaced', () => {
            SwalUtils.showSuccessMessage('Pacote removido');
            const successOptions: SweetAlertOptions = lastOptions();

            SwalUtils.showLoading(true, 'Apagando');
            successOptions.didOpen?.(popupElement(true));

            expect(hideLoadingSpy).not.toHaveBeenCalled();
        });
    });

    describe('showLoading', () => {
        it('should open a blocking loading dialog marked as loading', () => {
            SwalUtils.showLoading(true, 'Baixando');

            expect(lastOptions()).toEqual(expect.objectContaining({
                allowEscapeKey: false,
                allowOutsideClick: false,
                customClass: { popup: 'lens-swal-loading' },
                heightAuto: false,
                showConfirmButton: false,
                theme: 'dark',
                title: 'Baixando',
            }));
        });

        it('should start the loader while its dialog is opening', () => {
            SwalUtils.showLoading(true, 'Baixando');

            lastOptions().willOpen?.(popupElement(false));

            expect(showLoadingSpy).toHaveBeenCalledTimes(1);
        });

        it('should use an empty message by default', () => {
            SwalUtils.showLoading(true);

            expect(lastOptions().title).toBe(EMPTY);
        });

        it('should close the loading dialog when hidden', () => {
            SwalUtils.showLoading(true, 'Baixando');
            SwalUtils.showLoading(false);

            expect(closeSpy).toHaveBeenCalledTimes(1);
            expect(fireSpy).toHaveBeenCalledTimes(1);
        });

        it('should close the loading dialog only once', () => {
            SwalUtils.showLoading(true, 'Baixando');
            SwalUtils.showLoading(false);
            SwalUtils.showLoading(false);

            expect(closeSpy).toHaveBeenCalledTimes(1);
        });

        it('should not close anything when no loading dialog is open', () => {
            SwalUtils.showLoading(false);

            expect(closeSpy).not.toHaveBeenCalled();
            expect(fireSpy).not.toHaveBeenCalled();
        });

        it('should not start the loader of a dialog hidden before it opened', () => {
            SwalUtils.showLoading(true, 'Apagando');
            const loadingOptions: SweetAlertOptions = lastOptions();

            SwalUtils.showLoading(false);
            loadingOptions.willOpen?.(popupElement(false));

            expect(showLoadingSpy).not.toHaveBeenCalled();
        });

        it('should start only the loader of the latest loading dialog', () => {
            SwalUtils.showLoading(true, 'Baixando');
            const firstOptions: SweetAlertOptions = lastOptions();

            SwalUtils.showLoading(true, 'Apagando');
            firstOptions.willOpen?.(popupElement(false));

            expect(showLoadingSpy).not.toHaveBeenCalled();

            lastOptions().willOpen?.(popupElement(false));

            expect(showLoadingSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('showLoadingResult', () => {
        it('should replace the loading dialog with a clean success dialog without hiding it first', () => {
            SwalUtils.showLoading(true, 'Apagando');
            const loadingOptions: SweetAlertOptions = lastOptions();

            SwalUtils.showLoadingResult('success', 'Pacote removido');
            const successPopup: HTMLElement = popupElement(false);

            loadingOptions.willOpen?.(successPopup);
            lastOptions().didOpen?.(successPopup);

            expect(closeSpy).not.toHaveBeenCalled();
            expect(fireSpy).toHaveBeenCalledTimes(2);
            expect(showLoadingSpy).not.toHaveBeenCalled();
            expect(hideLoadingSpy).not.toHaveBeenCalled();
            expect(lastOptions()).toEqual(expect.objectContaining({
                confirmButtonText: 'Confirmar',
                heightAuto: false,
                icon: 'success',
                text: 'Pacote removido',
                theme: 'dark',
                title: 'Sucesso',
            }));
            expect(lastOptions().willOpen).toBeUndefined();
            expect(lastOptions().showConfirmButton).toBeUndefined();
        });

        it('should use the title that matches each result icon', () => {
            SwalUtils.showLoading(true, 'Apagando');
            SwalUtils.showLoadingResult('error', 'Falhou');

            expect(lastOptions()).toEqual(expect.objectContaining({ icon: 'error', text: 'Falhou', title: 'Erro' }));

            SwalUtils.showLoading(true, 'Apagando');
            SwalUtils.showLoadingResult('warning', 'Cuidado');

            expect(lastOptions()).toEqual(expect.objectContaining({ icon: 'warning', title: 'Atenção' }));

            SwalUtils.showLoading(true, 'Apagando');
            SwalUtils.showLoadingResult('info', 'Dica');

            expect(lastOptions()).toEqual(expect.objectContaining({ icon: 'info', title: 'Informação' }));

            SwalUtils.showLoading(true, 'Apagando');
            SwalUtils.showLoadingResult('question', 'Pergunta');

            expect(lastOptions()).toEqual(expect.objectContaining({ icon: 'question', title: 'Informação' }));
        });

        it('should remove a loader that reached the result dialog', () => {
            SwalUtils.showLoading(true, 'Apagando');
            SwalUtils.showLoadingResult('success', 'Pacote removido');

            lastOptions().didOpen?.(popupElement(true));

            expect(hideLoadingSpy).toHaveBeenCalledTimes(1);
        });

        it('should not close the result dialog when the loading dialog is hidden afterwards', () => {
            SwalUtils.showLoading(true, 'Apagando');
            SwalUtils.showLoadingResult('error', 'Falhou');
            SwalUtils.showLoading(false);

            expect(closeSpy).not.toHaveBeenCalled();
        });

        it('should not start the loader of the replaced loading dialog on the result dialog', () => {
            SwalUtils.showLoading(true, 'Apagando');
            const loadingOptions: SweetAlertOptions = lastOptions();

            SwalUtils.showLoadingResult('success', 'Pacote removido');
            loadingOptions.willOpen?.(popupElement(false));

            expect(showLoadingSpy).not.toHaveBeenCalled();
        });

        it('should resolve only after the result dialog has closed', async () => {
            let closed: boolean = false;

            SwalUtils.showLoading(true, 'Apagando');
            const closing: Promise<void> = SwalUtils.showLoadingResult('success', 'Pacote removido').then((): void => {
                closed = true;
            });

            await flushPromises();

            expect(closed).toBe(false);

            lastOptions().didClose?.();
            await closing;

            expect(closed).toBe(true);
        });

        it('should show a plain message when nothing is loading', () => {
            SwalUtils.showLoadingResult('success', 'Pacote removido');

            expect(fireSpy).toHaveBeenCalledTimes(1);
            expect(lastOptions()).toEqual(expect.objectContaining({ icon: 'success', text: 'Pacote removido', title: 'Sucesso' }));
        });

        it('should show a plain message after the loading dialog was hidden', () => {
            SwalUtils.showLoading(true, 'Apagando');
            SwalUtils.showLoading(false);
            SwalUtils.showLoadingResult('error', 'Falhou');

            expect(closeSpy).toHaveBeenCalledTimes(1);
            expect(fireSpy).toHaveBeenCalledTimes(2);
            expect(lastOptions()).toEqual(expect.objectContaining({ icon: 'error', text: 'Falhou', title: 'Erro' }));
        });
    });

    describe('dialogs requested while loading', () => {
        it('should not start the loader on a success dialog shown after hiding the loading dialog', () => {
            SwalUtils.showLoading(true, 'Apagando');
            const loadingOptions: SweetAlertOptions = lastOptions();

            SwalUtils.showLoading(false);
            SwalUtils.showSuccessMessage('Pacote removido');
            loadingOptions.willOpen?.(popupElement(false));

            expect(closeSpy).toHaveBeenCalledTimes(1);
            expect(fireSpy).toHaveBeenCalledTimes(2);
            expect(showLoadingSpy).not.toHaveBeenCalled();
        });

        it('should keep the loading dialog up and hold a message until the loading dialog is hidden', async () => {
            SwalUtils.showLoading(true, 'Apagando');
            SwalUtils.showErrorMessage('Falhou');
            await flushPromises();

            expect(fireSpy).toHaveBeenCalledTimes(1);
            expect(lastOptions().title).toBe('Apagando');

            SwalUtils.showLoading(false);

            expect(closeSpy).toHaveBeenCalledTimes(1);

            await flushPromises();

            expect(fireSpy).toHaveBeenCalledTimes(2);
            expect(lastOptions()).toEqual(expect.objectContaining({ icon: 'error', text: 'Falhou', title: 'Erro' }));
        });

        it('should hold a message until the result dialog that replaced the loading dialog closes', async () => {
            SwalUtils.showLoading(true, 'Apagando');
            const download: Promise<void> = SwalUtils.showSuccessMessage('Pacote baixado');

            SwalUtils.showLoadingResult('success', 'Pacote removido');
            const resultOptions: SweetAlertOptions = lastOptions();

            await flushPromises();

            expect(firedTexts()).toEqual([undefined, 'Pacote removido']);

            resultOptions.didClose?.();
            resultOptions.didDestroy?.();
            await flushPromises();

            expect(firedTexts()).toEqual([undefined, 'Pacote removido', 'Pacote baixado']);

            lastOptions().didClose?.();
            await expect(download).resolves.toBeUndefined();
        });

        it('should open a confirmation requested while loading only after the loading dialog is hidden', async () => {
            SwalUtils.showLoading(true, 'Apagando');
            const confirmation: Promise<boolean> = SwalUtils.showConfirmationDialog('Remover pacote', 'Remover o pacote?');

            await flushPromises();

            expect(fireSpy).toHaveBeenCalledTimes(1);

            SwalUtils.showLoading(false);

            await expect(confirmation).resolves.toBe(false);
            expect(closeSpy).toHaveBeenCalledTimes(1);
            expect(lastOptions()).toEqual(expect.objectContaining({ showCancelButton: true, title: 'Remover pacote' }));
        });

        it('should open a choice dialog requested while loading only after the loading dialog is hidden', async () => {
            SwalUtils.showLoading(true, 'Apagando');
            const choice: Promise<boolean | null> = SwalUtils.showChoiceDialog('Title', 'Message', 'Yes', 'No');

            await flushPromises();

            expect(fireSpy).toHaveBeenCalledTimes(1);

            SwalUtils.showLoading(false);

            await expect(choice).resolves.toBeNull();
            expect(lastOptions()).toEqual(expect.objectContaining({ confirmButtonText: 'Yes', title: 'Title' }));
        });

        it('should open a select dialog requested while loading only after the loading dialog is hidden', async () => {
            SwalUtils.showLoading(true, 'Apagando');
            const selection: Promise<string | null> = SwalUtils.showSelectDialog('Title', 'Message', { en: 'English' }, 'en', 'Use', 'Back');

            await flushPromises();

            expect(fireSpy).toHaveBeenCalledTimes(1);

            SwalUtils.showLoading(false);

            await expect(selection).resolves.toBeNull();
            expect(lastOptions()).toEqual(expect.objectContaining({ input: 'select', title: 'Title' }));
        });

        it('should show the held dialogs in the order they were requested', async () => {
            SwalUtils.showLoading(true, 'Apagando');
            SwalUtils.showWarningMessage('Primeiro');
            SwalUtils.showInfoMessage('Segundo');
            SwalUtils.showLoading(false);
            await flushPromises();

            expect(firedTexts()).toEqual([undefined, 'Primeiro', 'Segundo']);
        });

        it('should keep holding a message while another loading dialog replaces the first one', async () => {
            SwalUtils.showLoading(true, 'Baixando');
            SwalUtils.showInfoMessage('Dica');
            SwalUtils.showLoading(true, 'Apagando');
            await flushPromises();

            expect(firedTexts()).toEqual([undefined, undefined]);

            SwalUtils.showLoading(false);
            await flushPromises();

            expect(closeSpy).toHaveBeenCalledTimes(1);
            expect(firedTexts()).toEqual([undefined, undefined, 'Dica']);
        });

        it('should hold a released message again when a new loading dialog opens before it is shown', async () => {
            SwalUtils.showLoading(true, 'Baixando');
            SwalUtils.showInfoMessage('Dica');
            SwalUtils.showLoading(false);
            SwalUtils.showLoading(true, 'Apagando');
            await flushPromises();

            expect(firedTexts()).toEqual([undefined, undefined]);
            expect(lastOptions().title).toBe('Apagando');

            SwalUtils.showLoading(false);
            await flushPromises();

            expect(firedTexts()).toEqual([undefined, undefined, 'Dica']);
        });

        it('should not release held messages when a replaced result dialog is destroyed', async () => {
            SwalUtils.showLoading(true, 'Apagando');
            SwalUtils.showLoadingResult('success', 'Pacote removido');
            const resultOptions: SweetAlertOptions = lastOptions();

            SwalUtils.showLoading(true, 'Apagando de novo');
            SwalUtils.showInfoMessage('Dica');
            resultOptions.didDestroy?.();
            await flushPromises();

            expect(firedTexts()).toEqual([undefined, 'Pacote removido', undefined]);
        });

        it('should close a new loading dialog opened after a message', () => {
            SwalUtils.showErrorMessage('Falhou');
            SwalUtils.showLoading(true, 'Apagando');
            SwalUtils.showLoading(false);

            expect(closeSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('showConfirmationDialog', () => {
        it('should use the translated button labels with the confirm button first', async () => {
            await SwalUtils.showConfirmationDialog('Remover pacote', 'Remover o pacote?');

            expect(lastOptions()).toEqual(expect.objectContaining({
                cancelButtonText: 'Cancelar',
                confirmButtonText: 'Confirmar',
                heightAuto: false,
                icon: 'question',
                reverseButtons: false,
                showCancelButton: true,
                text: 'Remover o pacote?',
                theme: 'dark',
                title: 'Remover pacote',
            }));
        });

        it('should accept a custom confirm label and icon', async () => {
            await SwalUtils.showConfirmationDialog('Remover pacote', 'Remover o pacote?', 'Remover', 'warning');

            expect(lastOptions()).toEqual(expect.objectContaining({
                cancelButtonText: 'Cancelar',
                confirmButtonText: 'Remover',
                icon: 'warning',
            }));
        });

        it('should focus the confirm button without the destructive style by default', async () => {
            await SwalUtils.showConfirmationDialog('Remover pacote', 'Remover o pacote?');

            expect(lastOptions()).toEqual(expect.objectContaining({
                customClass: { confirmButton: EMPTY },
                focusCancel: false,
                focusConfirm: true,
            }));
        });

        it('should focus the cancel button and use the destructive style when destructive', async () => {
            await SwalUtils.showConfirmationDialog('Apagar dados', 'Apagar todos os dados?', 'Apagar todos os dados', 'warning', true);

            expect(lastOptions()).toEqual(expect.objectContaining({
                cancelButtonText: 'Cancelar',
                confirmButtonText: 'Apagar todos os dados',
                customClass: { confirmButton: 'lens-swal-destructive' },
                focusCancel: true,
                focusConfirm: false,
                icon: 'warning',
                showCancelButton: true,
            }));
        });

        it('should hide a loader left on its popup once open', async () => {
            await SwalUtils.showConfirmationDialog('Remover pacote', 'Remover o pacote?');

            lastOptions().didOpen?.(popupElement(true));

            expect(hideLoadingSpy).toHaveBeenCalledTimes(1);
        });

        it('should resolve true when confirmed', async () => {
            fireSpy.mockResolvedValue({ isConfirmed: true, isDenied: false, isDismissed: false });

            await expect(SwalUtils.showConfirmationDialog('Title', 'Message')).resolves.toBe(true);
        });

        it('should resolve false when dismissed', async () => {
            await expect(SwalUtils.showConfirmationDialog('Title', 'Message')).resolves.toBe(false);
        });
    });

    describe('showChoiceDialog', () => {
        it('should show both choices with the given labels and block outside dismissal', async () => {
            await SwalUtils.showChoiceDialog('Idioma identificado', 'Continuar com Português?', 'Continuar', 'Escolher outro');

            expect(lastOptions()).toEqual(expect.objectContaining({
                allowEscapeKey: false,
                allowOutsideClick: false,
                cancelButtonText: 'Escolher outro',
                confirmButtonText: 'Continuar',
                focusConfirm: true,
                heightAuto: false,
                icon: 'question',
                reverseButtons: false,
                showCancelButton: true,
                text: 'Continuar com Português?',
                theme: 'dark',
                title: 'Idioma identificado',
            }));
        });

        it('should accept a custom icon', async () => {
            await SwalUtils.showChoiceDialog('Language not identified', 'Continue in English?', 'Continue', 'Choose another', 'info');

            expect(lastOptions().icon).toBe('info');
        });

        it('should not use the shared confirm and cancel labels', async () => {
            await SwalUtils.showChoiceDialog('Title', 'Message', 'Yes', 'No');

            expect(lastOptions().confirmButtonText).toBe('Yes');
            expect(lastOptions().cancelButtonText).toBe('No');
        });

        it('should hide a loader left on its popup once open', async () => {
            await SwalUtils.showChoiceDialog('Title', 'Message', 'Yes', 'No');

            lastOptions().didOpen?.(popupElement(true));

            expect(hideLoadingSpy).toHaveBeenCalledTimes(1);
        });

        it('should resolve true when the first choice is taken', async () => {
            fireSpy.mockResolvedValue({ isConfirmed: true, isDenied: false, isDismissed: false });

            await expect(SwalUtils.showChoiceDialog('Title', 'Message', 'Yes', 'No')).resolves.toBe(true);
        });

        it('should resolve false when the other choice is taken', async () => {
            fireSpy.mockResolvedValue({ isConfirmed: false, isDenied: false, isDismissed: true, dismiss: Swal.DismissReason.cancel });

            await expect(SwalUtils.showChoiceDialog('Title', 'Message', 'Yes', 'No')).resolves.toBe(false);
        });

        it('should resolve null when another dialog replaces it', async () => {
            fireSpy.mockResolvedValue({ isConfirmed: false, isDenied: false, isDismissed: true });

            await expect(SwalUtils.showChoiceDialog('Title', 'Message', 'Yes', 'No')).resolves.toBeNull();
        });
    });

    describe('showSelectDialog', () => {
        const languages: Record<string, string> = { de: 'Deutsch', en: 'English', pt: 'Português' };

        it('should show a labelled select with the options and the selected value', async () => {
            await SwalUtils.showSelectDialog('Escolha o idioma', 'Os textos serão traduzidos.', languages, 'pt', 'Usar este idioma', 'Voltar');

            expect(lastOptions()).toEqual(expect.objectContaining({
                allowEscapeKey: false,
                allowOutsideClick: false,
                cancelButtonText: 'Voltar',
                confirmButtonText: 'Usar este idioma',
                heightAuto: false,
                input: 'select',
                inputAttributes: { 'aria-label': 'Escolha o idioma' },
                inputOptions: languages,
                inputValue: 'pt',
                reverseButtons: false,
                showCancelButton: true,
                text: 'Os textos serão traduzidos.',
                theme: 'dark',
                title: 'Escolha o idioma',
            }));
        });

        it('should resolve the chosen value when confirmed', async () => {
            fireSpy.mockResolvedValue({ isConfirmed: true, isDenied: false, isDismissed: false, value: 'de' });

            await expect(SwalUtils.showSelectDialog('Title', 'Message', languages, 'pt', 'Use', 'Back')).resolves.toBe('de');
        });

        it('should resolve null when cancelled', async () => {
            await expect(SwalUtils.showSelectDialog('Title', 'Message', languages, 'pt', 'Use', 'Back')).resolves.toBeNull();
        });

        it('should mark each option with the language of its value once open', async () => {
            const popup: HTMLElement = selectPopup(languages);

            await SwalUtils.showSelectDialog('Title', 'Message', languages, 'pt', 'Use', 'Back');
            lastOptions().didOpen?.(popup);

            expect(Array.from(popup.querySelectorAll('option')).map((option: HTMLOptionElement) => option.lang)).toEqual(['de', 'en', 'pt']);
            expect(hideLoadingSpy).not.toHaveBeenCalled();
        });

        it('should hide a loader left on its popup once open', async () => {
            const popup: HTMLElement = selectPopup(languages);

            popup.classList.add('swal2-loading');
            await SwalUtils.showSelectDialog('Title', 'Message', languages, 'pt', 'Use', 'Back');
            lastOptions().didOpen?.(popup);

            expect(hideLoadingSpy).toHaveBeenCalledTimes(1);
        });

        it('should not mark the options once another dialog replaced it', async () => {
            const popup: HTMLElement = selectPopup(languages);

            await SwalUtils.showSelectDialog('Title', 'Message', languages, 'pt', 'Use', 'Back');
            const selectOptions: SweetAlertOptions = lastOptions();

            SwalUtils.showInfoMessage('Dica');
            selectOptions.didOpen?.(popup);

            expect(Array.from(popup.querySelectorAll('option')).map((option: HTMLOptionElement) => option.lang)).toEqual([EMPTY, EMPTY, EMPTY]);
        });

        it('should ignore a missing select once open', async () => {
            await SwalUtils.showSelectDialog('Title', 'Message', languages, 'pt', 'Use', 'Back');

            expect(() => lastOptions().didOpen?.(popupElement(false))).not.toThrow();
        });

        it('should resolve null when confirmed without a value', async () => {
            fireSpy.mockResolvedValue({ isConfirmed: true, isDenied: false, isDismissed: false });

            await expect(SwalUtils.showSelectDialog('Title', 'Message', languages, 'pt', 'Use', 'Back')).resolves.toBeNull();
        });
    });
});
