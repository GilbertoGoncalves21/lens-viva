import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { AppLanguageService } from 'src/app/services/app-language/app-language.service';
import { HistoryService } from 'src/app/services/history/history.service';
import { LoggerService } from 'src/app/services/logger/logger.service';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { AppSettings, HistoryEntry } from 'src/app/shared/models';
import { EMPTY, LanguageUtils, SwalUtils, TextUtils } from 'src/app/shared/utils';

const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };

const ELLIPSIS: string = '…';

const ENTRY_ELEMENT_PREFIX: string = 'history-entry-';

const EXCERPT_MAX_LENGTH: number = 40;

const STATE_TITLE_ID: string = 'history-state-title';

interface HistoryItem {
    elementId: string;
    entry: HistoryEntry;
    excerpt: string;
    savedAt: string;
}

@Component({
    selector: 'app-history',
    templateUrl: './history.component.html',
    styleUrls: ['./history.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false,
})
export class HistoryComponent implements OnDestroy, OnInit, ViewWillEnter {
    private _dateFormat: Intl.DateTimeFormat;
    private _displayLanguage: string;
    private _entries: HistoryEntry[] = [];
    private _historyEnabled: boolean;
    private _items: HistoryItem[] = [];
    private _loaded: boolean = false;
    private _subscriptions: Subscription[] = [];

    constructor(
        private appLanguageService: AppLanguageService,
        private changeDetectorRef: ChangeDetectorRef,
        @Inject(DOCUMENT) private document: Document,
        private historyService: HistoryService,
        private loggerService: LoggerService,
        private preferencesService: PreferencesService,
        private router: Router,
    ) {
        this._displayLanguage = this.appLanguageService.currentLanguage;
        this._dateFormat = this.createDateFormat(this._displayLanguage);
        this._historyEnabled = this.preferencesService.settings.historyEnabled;
    }

    get displayLanguage(): string {
        return this._displayLanguage;
    }

    get historyEnabled(): boolean {
        return this._historyEnabled;
    }

    get items(): HistoryItem[] {
        return this._items;
    }

    get loaded(): boolean {
        return this._loaded;
    }

    get stateTitleId(): string {
        return STATE_TITLE_ID;
    }

    async ionViewWillEnter(): Promise<void> {
        try {
            await this.historyService.load();
        } catch (error: unknown) {
            this.loggerService.error('history-load-failed', error);
            SwalUtils.showErrorMessage(this.appLanguageService.instant('history.loadError'));
        } finally {
            this._loaded = true;
            this.changeDetectorRef.detectChanges();
        }
    }

    ngOnDestroy(): void {
        this._subscriptions.forEach((subscription: Subscription) => subscription.unsubscribe());
        this._subscriptions = [];
    }

    ngOnInit(): void {
        this._subscriptions.push(
            this.appLanguageService.changes().subscribe((language: string) => this.applyDisplayLanguage(language)),
            this.historyService.changes().subscribe((entries: HistoryEntry[]) => this.applyEntries(entries)),
            this.preferencesService.settingsChanges().subscribe((settings: AppSettings) => this.applySettings(settings)),
        );
    }

    async clearHistory(): Promise<void> {
        const confirmed: boolean = await SwalUtils.showConfirmationDialog(
            this.appLanguageService.instant('history.clearConfirmTitle'),
            this.appLanguageService.instant('history.clearConfirmMessage'),
            this.appLanguageService.instant('history.clearConfirm'),
            'warning',
            true,
        );

        if (!confirmed) {
            return;
        }

        SwalUtils.showLoading(true, this.appLanguageService.instant('common.deleting'));

        try {
            await this.historyService.clear();
            this.changeDetectorRef.detectChanges();
            await SwalUtils.showLoadingResult('success', this.appLanguageService.instant('history.clearSuccess'));
            this.restoreLostFocus(STATE_TITLE_ID);
        } catch (error: unknown) {
            this.loggerService.error('history-clear-failed', error);
            SwalUtils.showLoadingResult('error', this.appLanguageService.instant('history.deleteError'));
        } finally {
            this.changeDetectorRef.detectChanges();
        }
    }

    openSettings(): Promise<boolean> {
        return this.router.navigateByUrl('/settings');
    }

    async removeEntry(item: HistoryItem): Promise<void> {
        const index: number = this._items.findIndex((current: HistoryItem) => current.entry.historyEntryId === item.entry.historyEntryId);

        try {
            await this.historyService.remove(item.entry.historyEntryId);
            this.changeDetectorRef.detectChanges();
            this.restoreLostFocus(this.focusTargetAfterRemoval(index));
        } catch (error: unknown) {
            this.loggerService.error('history-delete-failed', error);
            SwalUtils.showErrorMessage(this.appLanguageService.instant('history.deleteError'));
        } finally {
            this.changeDetectorRef.detectChanges();
        }
    }

    trackByItem(index: number, item: HistoryItem): string {
        return item.entry.historyEntryId;
    }

    private applyDisplayLanguage(language: string): void {
        if (language !== this._displayLanguage) {
            this._displayLanguage = language;
            this._dateFormat = this.createDateFormat(language);
            this.buildItems();
        }

        this.changeDetectorRef.detectChanges();
    }

    private applyEntries(entries: HistoryEntry[]): void {
        this._entries = [...entries].sort((first: HistoryEntry, second: HistoryEntry) => this.timestamp(second) - this.timestamp(first));
        this.buildItems();
        this.changeDetectorRef.detectChanges();
    }

    private applySettings(settings: AppSettings): void {
        this._historyEnabled = settings.historyEnabled;
        this.changeDetectorRef.detectChanges();
    }

    private buildItems(): void {
        this._items = this._entries.map((entry: HistoryEntry): HistoryItem => ({
            elementId: `${ENTRY_ELEMENT_PREFIX}${entry.historyEntryId}`,
            entry: entry,
            excerpt: this.excerpt(entry.originalText),
            savedAt: this.formatDate(entry.createdAt),
        }));
    }

    private createDateFormat(language: string): Intl.DateTimeFormat {
        return new Intl.DateTimeFormat(LanguageUtils.dateLocales(language, this.appLanguageService.deviceLanguageTag), DATE_FORMAT_OPTIONS);
    }

    private excerpt(text: string): string {
        const characters: string[] = Array.from(TextUtils.normalize(text));

        if (characters.length <= EXCERPT_MAX_LENGTH) {
            return characters.join(EMPTY);
        }

        return `${characters.slice(0, EXCERPT_MAX_LENGTH - 1).join(EMPTY).trimEnd()}${ELLIPSIS}`;
    }

    private focusTargetAfterRemoval(index: number): string {
        if (this._items.length === 0) {
            return STATE_TITLE_ID;
        }

        return this._items[Math.min(Math.max(index, 0), this._items.length - 1)].elementId;
    }

    private formatDate(createdAt: string): string {
        const date: Date = new Date(createdAt);

        return Number.isNaN(date.getTime()) ? EMPTY : this._dateFormat.format(date);
    }

    private restoreLostFocus(elementId: string): void {
        const activeElement: Element | null = this.document.activeElement;

        if (activeElement && activeElement !== this.document.body && activeElement.isConnected) {
            return;
        }

        this.document.getElementById(elementId)?.focus();
    }

    private timestamp(entry: HistoryEntry): number {
        const time: number = Date.parse(entry.createdAt);

        return Number.isNaN(time) ? 0 : time;
    }
}
