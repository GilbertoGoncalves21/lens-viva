import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { AppLanguageService } from 'src/app/services/app-language/app-language.service';
import { EMPTY, LanguageUtils } from 'src/app/shared/utils';
import { environment } from 'src/environments/environment';

const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = { dateStyle: 'long', timeZone: 'UTC' };

const SECTION_TITLE_PREFIX: string = 'terms-section-';

const TERMS_LAST_UPDATED: string = '2026-10-27';

const TERMS_SECTIONS: TermsSectionDefinition[] = [
    {
        name: 'acceptance',
        paragraphs: [{ key: 'terms.acceptanceText', parameterKeys: {} }],
    },
    {
        name: 'license',
        paragraphs: [
            { key: 'terms.licenseText', parameterKeys: {} },
            { key: 'terms.licenseAsIs', parameterKeys: {} },
        ],
    },
    {
        name: 'howItWorks',
        paragraphs: [
            { key: 'terms.howItWorksText', parameterKeys: {} },
            { key: 'terms.howItWorksImages', parameterKeys: {} },
            { key: 'terms.howItWorksHistory', parameterKeys: {} },
        ],
    },
    {
        name: 'thirdParty',
        paragraphs: [
            { key: 'terms.thirdPartyText', parameterKeys: {} },
            { key: 'terms.thirdPartyDownloads', parameterKeys: {} },
        ],
    },
    {
        name: 'accuracy',
        paragraphs: [
            { key: 'terms.accuracyText', parameterKeys: {} },
            { key: 'terms.accuracyWarning', parameterKeys: {} },
        ],
    },
    {
        name: 'privacy',
        paragraphs: [
            { key: 'terms.privacyText', parameterKeys: {} },
            {
                key: 'terms.privacyDeletion',
                parameterKeys: { action: 'settings.deleteAllData', languages: 'languages.title', settings: 'settings.title' },
            },
        ],
    },
    {
        name: 'changes',
        paragraphs: [{ key: 'terms.changesText', parameterKeys: {} }],
    },
    {
        name: 'contact',
        paragraphs: [{ key: 'terms.contactText', parameterKeys: {} }],
    },
];

interface TermsParagraph {
    key: string;
    parameters: Record<string, string>;
}

interface TermsParagraphDefinition {
    key: string;
    parameterKeys: Record<string, string>;
}

interface TermsSection {
    paragraphs: TermsParagraph[];
    titleId: string;
    titleKey: string;
}

interface TermsSectionDefinition {
    name: string;
    paragraphs: TermsParagraphDefinition[];
}

@Component({
    selector: 'app-terms',
    templateUrl: './terms.component.html',
    styleUrls: ['./terms.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false,
})
export class TermsComponent implements OnDestroy, OnInit {
    private _appVersion: string = environment.appVersion;
    private _lastUpdated: string = EMPTY;
    private _sections: TermsSection[] = [];
    private _subscriptions: Subscription[] = [];

    constructor(
        private appLanguageService: AppLanguageService,
        private changeDetectorRef: ChangeDetectorRef,
    ) {}

    get appVersion(): string {
        return this._appVersion;
    }

    get lastUpdated(): string {
        return this._lastUpdated;
    }

    get lastUpdatedIso(): string {
        return TERMS_LAST_UPDATED;
    }

    get sections(): TermsSection[] {
        return this._sections;
    }

    ngOnDestroy(): void {
        this._subscriptions.forEach((subscription: Subscription) => subscription.unsubscribe());
        this._subscriptions = [];
    }

    ngOnInit(): void {
        this._subscriptions.push(
            this.appLanguageService.changes().subscribe((language: string) => {
                this.applyDisplayLanguage(language);
                this.changeDetectorRef.detectChanges();
            }),
        );
    }

    trackByParagraph(index: number, paragraph: TermsParagraph): string {
        return paragraph.key;
    }

    trackBySection(index: number, section: TermsSection): string {
        return section.titleId;
    }

    private applyDisplayLanguage(language: string): void {
        this._lastUpdated = this.formatLastUpdated(language);
        this._sections = TERMS_SECTIONS.map((definition: TermsSectionDefinition): TermsSection => ({
            paragraphs: definition.paragraphs.map((paragraph: TermsParagraphDefinition) => this.buildParagraph(paragraph)),
            titleId: `${SECTION_TITLE_PREFIX}${definition.name}`,
            titleKey: `terms.${definition.name}Title`,
        }));
    }

    private buildParagraph(definition: TermsParagraphDefinition): TermsParagraph {
        const parameters: Record<string, string> = Object.fromEntries(
            Object.entries(definition.parameterKeys).map(([name, key]: [string, string]): [string, string] => [
                name,
                this.appLanguageService.instant(key),
            ]),
        );

        return { key: definition.key, parameters: parameters };
    }

    private formatLastUpdated(language: string): string {
        return new Intl.DateTimeFormat(LanguageUtils.dateLocales(language, this.appLanguageService.deviceLanguageTag), DATE_FORMAT_OPTIONS)
            .format(new Date(`${TERMS_LAST_UPDATED}T00:00:00Z`));
    }
}
