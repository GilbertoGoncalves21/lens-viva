import { NgModule, Type } from '@angular/core';
import {
    IonApp
,   IonBackButton
,   IonBadge
,   IonButton
,   IonButtons
,   IonChip
,   IonContent
,   IonFab
,   IonFabButton
,   IonFooter
,   IonHeader
,   IonIcon
,   IonItem
,   IonItemOption
,   IonItemOptions
,   IonItemSliding
,   IonLabel
,   IonList
,   IonListHeader
,   IonNote
,   IonRange
,   IonRouterLink
,   IonRouterOutlet
,   IonSegment
,   IonSegmentButton
,   IonSelect
,   IonSelectOption
,   IonSpinner
,   IonText
,   IonTitle
,   IonToggle
,   IonToolbar
} from '@ionic/angular';

const IONIC_COMPONENTS: Type<unknown>[] = [
        IonApp
    ,   IonBackButton
    ,   IonBadge
    ,   IonButton
    ,   IonButtons
    ,   IonChip
    ,   IonContent
    ,   IonFab
    ,   IonFabButton
    ,   IonFooter
    ,   IonHeader
    ,   IonIcon
    ,   IonItem
    ,   IonItemOption
    ,   IonItemOptions
    ,   IonItemSliding
    ,   IonLabel
    ,   IonList
    ,   IonListHeader
    ,   IonNote
    ,   IonRange
    ,   IonRouterLink
    ,   IonRouterOutlet
    ,   IonSegment
    ,   IonSegmentButton
    ,   IonSelect
    ,   IonSelectOption
    ,   IonSpinner
    ,   IonText
    ,   IonTitle
    ,   IonToggle
    ,   IonToolbar
];

@NgModule({
    imports: IONIC_COMPONENTS,
    exports: IONIC_COMPONENTS,
})
export class IonicComponentsModule {}
