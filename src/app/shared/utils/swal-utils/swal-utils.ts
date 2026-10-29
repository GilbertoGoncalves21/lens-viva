import Swal, { SweetAlertIcon, SweetAlertResult, SweetAlertTheme } from 'sweetalert2';
import { SwalLabels } from '../../models';
import { EMPTY } from '../constants/constants';

const NO_DIALOG: number = 0;
const SWAL_ACTIVE_LOADER_CLASS: string = 'swal2-loading';
const SWAL_DESTRUCTIVE_CONFIRM_CLASS: string = 'lens-swal-destructive';
const SWAL_LOADING_POPUP_CLASS: string = 'lens-swal-loading';
const SWAL_SELECT_SELECTOR: string = 'select.swal2-select';
const SWAL_THEME: SweetAlertTheme = 'dark';

export class SwalUtils {
    private static _activeDialog: number = NO_DIALOG;
    private static _blockingDialog: number = NO_DIALOG;
    private static _labels: SwalLabels = {
        cancel: 'Cancel',
        confirm: 'OK',
        errorTitle: 'Error',
        infoTitle: 'Information',
        successTitle: 'Success',
        warningTitle: 'Attention',
    };
    private static _loadingDialog: number = NO_DIALOG;
    private static _unblock: () => void = (): void => undefined;
    private static _unblocked: Promise<void> = Promise.resolve();

    static get labels(): SwalLabels {
        return SwalUtils._labels;
    }

    static setLabels(labels: SwalLabels): void {
        SwalUtils._labels = labels;
    }

    static showChoiceDialog(
        title: string,
        message: string,
        confirmText: string,
        cancelText: string,
        icon: SweetAlertIcon = 'question',
    ): Promise<boolean | null> {
        return SwalUtils.whenUnblocked((): Promise<boolean | null> => {
            const dialog: number = SwalUtils.nextDialog();

            return Swal.fire({
                allowEscapeKey: false,
                allowOutsideClick: false,
                cancelButtonText: cancelText,
                confirmButtonText: confirmText,
                didOpen: (popup: HTMLElement): void => SwalUtils.clearLoader(dialog, popup),
                focusConfirm: true,
                heightAuto: false,
                icon: icon,
                reverseButtons: false,
                showCancelButton: true,
                text: message,
                theme: SWAL_THEME,
                title: title,
            }).then((result: SweetAlertResult): boolean | null => {
                if (result.isConfirmed) {
                    return true;
                }

                return result.dismiss === Swal.DismissReason.cancel ? false : null;
            });
        });
    }

    static showConfirmationDialog(
        title: string,
        message: string,
        confirmText: string = SwalUtils._labels.confirm,
        icon: SweetAlertIcon = 'question',
        destructive: boolean = false,
    ): Promise<boolean> {
        return SwalUtils.whenUnblocked((): Promise<boolean> => {
            const dialog: number = SwalUtils.nextDialog();

            return Swal.fire({
                cancelButtonText: SwalUtils._labels.cancel,
                confirmButtonText: confirmText,
                customClass: { confirmButton: destructive ? SWAL_DESTRUCTIVE_CONFIRM_CLASS : EMPTY },
                didOpen: (popup: HTMLElement): void => SwalUtils.clearLoader(dialog, popup),
                focusCancel: destructive,
                focusConfirm: !destructive,
                heightAuto: false,
                icon: icon,
                reverseButtons: false,
                showCancelButton: true,
                text: message,
                theme: SWAL_THEME,
                title: title,
            }).then((result: SweetAlertResult): boolean => result.isConfirmed);
        });
    }

    static showErrorMessage(message: string): void {
        SwalUtils.showMessage('error', SwalUtils._labels.errorTitle, message);
    }

    static showInfoMessage(message: string): void {
        SwalUtils.showMessage('info', SwalUtils._labels.infoTitle, message);
    }

    static showLoading(visible: boolean, message: string = EMPTY): void {
        if (!visible) {
            const loadingDialog: number = SwalUtils._loadingDialog;

            SwalUtils.closeLoading();
            SwalUtils.unblock(loadingDialog);
            return;
        }

        const dialog: number = SwalUtils.nextDialog();

        SwalUtils._loadingDialog = dialog;
        SwalUtils.block(dialog);
        Swal.fire({
            allowEscapeKey: false,
            allowOutsideClick: false,
            customClass: { popup: SWAL_LOADING_POPUP_CLASS },
            heightAuto: false,
            showConfirmButton: false,
            theme: SWAL_THEME,
            title: message,
            willOpen: (): void => SwalUtils.startLoader(dialog),
        });
    }

    static showLoadingResult(icon: SweetAlertIcon, message: string): Promise<void> {
        if (!SwalUtils.isLoading(SwalUtils._loadingDialog)) {
            return SwalUtils.showMessage(icon, SwalUtils.titleFor(icon), message);
        }

        const dialog: number = SwalUtils.nextDialog();

        SwalUtils.block(dialog);

        return SwalUtils.openMessage(dialog, icon, SwalUtils.titleFor(icon), message);
    }

    static showSelectDialog(
        title: string,
        message: string,
        options: Record<string, string>,
        selectedValue: string,
        confirmText: string,
        cancelText: string,
    ): Promise<string | null> {
        return SwalUtils.whenUnblocked((): Promise<string | null> => {
            const dialog: number = SwalUtils.nextDialog();

            return Swal.fire({
                allowEscapeKey: false,
                allowOutsideClick: false,
                cancelButtonText: cancelText,
                confirmButtonText: confirmText,
                didOpen: (popup: HTMLElement): void => {
                    SwalUtils.clearLoader(dialog, popup);
                    SwalUtils.markOptionLanguages(dialog, popup);
                },
                heightAuto: false,
                input: 'select',
                inputAttributes: { 'aria-label': title },
                inputOptions: options,
                inputValue: selectedValue,
                reverseButtons: false,
                showCancelButton: true,
                text: message,
                theme: SWAL_THEME,
                title: title,
            }).then((result: SweetAlertResult<string>): string | null => (result.isConfirmed && typeof result.value === 'string' ? result.value : null));
        });
    }

    static showSuccessMessage(message: string): Promise<void> {
        return SwalUtils.showMessage('success', SwalUtils._labels.successTitle, message);
    }

    static showWarningMessage(message: string): void {
        SwalUtils.showMessage('warning', SwalUtils._labels.warningTitle, message);
    }

    private static block(dialog: number): void {
        if (SwalUtils._blockingDialog === NO_DIALOG) {
            SwalUtils._unblocked = new Promise<void>((resolve: () => void) => {
                SwalUtils._unblock = resolve;
            });
        }

        SwalUtils._blockingDialog = dialog;
    }

    private static clearLoader(dialog: number, popup: HTMLElement): void {
        if (!SwalUtils.isActive(dialog) || !popup.classList.contains(SWAL_ACTIVE_LOADER_CLASS)) {
            return;
        }

        Swal.hideLoading();
    }

    private static closeLoading(): void {
        if (!SwalUtils.isLoading(SwalUtils._loadingDialog)) {
            return;
        }

        SwalUtils._loadingDialog = NO_DIALOG;
        Swal.close();
    }

    private static isActive(dialog: number): boolean {
        return dialog !== NO_DIALOG && dialog === SwalUtils._activeDialog;
    }

    private static isLoading(dialog: number): boolean {
        return SwalUtils.isActive(dialog) && dialog === SwalUtils._loadingDialog;
    }

    private static markOptionLanguages(dialog: number, popup: HTMLElement): void {
        const select: Element | null = SwalUtils.isActive(dialog) ? popup.querySelector(SWAL_SELECT_SELECTOR) : null;

        if (!(select instanceof HTMLSelectElement)) {
            return;
        }

        Array.from(select.options).forEach((option: HTMLOptionElement) => {
            option.lang = option.value;
        });
    }

    private static nextDialog(): number {
        SwalUtils._activeDialog += 1;
        SwalUtils._loadingDialog = NO_DIALOG;

        return SwalUtils._activeDialog;
    }

    private static openMessage(dialog: number, icon: SweetAlertIcon, title: string, message: string): Promise<void> {
        return new Promise<void>((resolve: () => void) => {
            const finish: () => void = (): void => {
                SwalUtils.unblock(dialog);
                resolve();
            };

            Swal.fire({
                confirmButtonText: SwalUtils._labels.confirm,
                didClose: finish,
                didDestroy: finish,
                didOpen: (popup: HTMLElement): void => SwalUtils.clearLoader(dialog, popup),
                heightAuto: false,
                icon: icon,
                text: message,
                theme: SWAL_THEME,
                title: title,
            });
        });
    }

    private static showMessage(icon: SweetAlertIcon, title: string, message: string): Promise<void> {
        return SwalUtils.whenUnblocked((): Promise<void> => SwalUtils.openMessage(SwalUtils.nextDialog(), icon, title, message));
    }

    private static startLoader(dialog: number): void {
        if (!SwalUtils.isLoading(dialog)) {
            return;
        }

        Swal.showLoading();
    }

    private static titleFor(icon: SweetAlertIcon): string {
        const titles: Record<SweetAlertIcon, string> = {
            error: SwalUtils._labels.errorTitle,
            info: SwalUtils._labels.infoTitle,
            question: SwalUtils._labels.infoTitle,
            success: SwalUtils._labels.successTitle,
            warning: SwalUtils._labels.warningTitle,
        };

        return titles[icon];
    }

    private static unblock(dialog: number): void {
        if (dialog === NO_DIALOG || dialog !== SwalUtils._blockingDialog) {
            return;
        }

        SwalUtils._blockingDialog = NO_DIALOG;
        SwalUtils._unblock();
    }

    private static whenUnblocked<Result>(open: () => Promise<Result>): Promise<Result> {
        if (SwalUtils._blockingDialog === NO_DIALOG) {
            return open();
        }

        return SwalUtils._unblocked.then((): Promise<Result> => SwalUtils.whenUnblocked(open));
    }
}
