import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { DemoComponent } from './demo.component';

describe('DemoComponent', () => {
    it('should expose curated examples without camera or translation services and reset comparison when the scene changes', () => {
        TestBed.configureTestingModule({
            imports: [DemoComponent],
            providers: [provideRouter([]), provideTranslateService()],
        });
        const fixture = TestBed.createComponent(DemoComponent);
        const component = fixture.componentInstance;
        fixture.detectChanges();
        const element: HTMLElement = fixture.nativeElement;
        expect(element.textContent).toContain('demo.note');
        expect(element.querySelector('a')?.getAttribute('href')).toBe('/camera');
        component.compare();
        expect(component.items().every((item) => item.showOriginal)).toBe(true);
        component.selectScene(component.scenes[1]);
        fixture.detectChanges();
        expect(component.items().map((item) => item.originalText)).toEqual([
            'Sides',
            'Beers',
            'Sake',
        ]);
        expect(component.showingOriginal()).toBe(false);
        component.toggleOriginal(component.items()[0].regionId);
        expect(component.items()[0].showOriginal).toBe(true);
        expect(component.items()[1].showOriginal).toBe(false);
        fixture.destroy();
    });
});
