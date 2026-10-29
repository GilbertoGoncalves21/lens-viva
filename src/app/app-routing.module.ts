import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { EMPTY } from 'src/app/shared/utils';

const routes: Routes = [
    {
        path: EMPTY,
        loadChildren: () => import('./pages/pages.module').then((module: typeof import('./pages/pages.module')) => module.PagesModule),
    },
];

@NgModule({
    imports: [RouterModule.forRoot(routes)],
    exports: [RouterModule],
})
export class AppRoutingModule {}
