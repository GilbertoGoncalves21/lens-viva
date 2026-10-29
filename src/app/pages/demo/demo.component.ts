import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SharedModule } from 'src/app/shared/shared.module';
import { RegionGranularity } from 'src/app/shared/models';
import { DEMO_SCENES, DemoScene, demoOverlays } from './demo-scenes';

@Component({
    selector: 'app-demo',
    imports: [SharedModule, RouterLink],
    templateUrl: './demo.component.html',
    styleUrl: './demo.component.scss',
})
export class DemoComponent {
    readonly scenes = DEMO_SCENES;
    readonly scene = signal<DemoScene>(DEMO_SCENES[0]);
    readonly items = signal(demoOverlays(DEMO_SCENES[0]));
    readonly showingOriginal = computed(() => this.items().some((item) => item.showOriginal));
    readonly block = RegionGranularity.BLOCK;

    selectScene(scene: DemoScene): void {
        this.scene.set(scene);
        this.items.set(demoOverlays(scene));
    }

    toggleOriginal(regionId: string): void {
        this.items.update((items) =>
            items.map((item) =>
                item.regionId === regionId ? { ...item, showOriginal: !item.showOriginal } : item,
            ),
        );
    }

    compare(): void {
        const showOriginal = !this.showingOriginal();
        this.items.update((items) => items.map((item) => ({ ...item, showOriginal })));
    }
}
