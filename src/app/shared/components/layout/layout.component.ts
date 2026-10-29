import { ChangeDetectionStrategy, ChangeDetectorRef, Component, InputSignal, input } from '@angular/core';
import { EMPTY } from 'src/app/shared/utils';

@Component({
    selector: 'app-layout',
    templateUrl: './layout.component.html',
    styleUrls: ['./layout.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false,
    host: { class: 'd-flex flex-column h-100 w-100' },
})
export class LayoutComponent {
    readonly backHref: InputSignal<string | null> = input<string | null>(null);
    readonly showBrand: InputSignal<boolean> = input<boolean>(false);
    readonly showFooter: InputSignal<boolean> = input<boolean>(false);
    readonly title: InputSignal<string> = input<string>(EMPTY);
    readonly transparent: InputSignal<boolean> = input<boolean>(false);

    constructor(
        private changeDetectorRef: ChangeDetectorRef,
    ) {}
}
