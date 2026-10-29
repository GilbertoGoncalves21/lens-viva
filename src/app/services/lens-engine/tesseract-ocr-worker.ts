import type { Worker as TesseractWorker } from 'tesseract.js';

export type TesseractModule = typeof import('tesseract.js');

export interface OcrBoundingBox {
    x0: number;
    x1: number;
    y0: number;
    y1: number;
}

export interface OcrLine {
    bbox: OcrBoundingBox;
    confidence: number;
    text: string;
}

export interface OcrParagraph {
    lines: OcrLine[];
}

export interface OcrBlock {
    bbox: OcrBoundingBox;
    paragraphs: OcrParagraph[];
}

export interface OcrPage {
    blocks: OcrBlock[] | null;
}

export interface OcrWorker {
    recognize(image: HTMLCanvasElement): Promise<OcrPage>;
    reinitialize(languages: string): Promise<void>;
    terminate(): Promise<void>;
}

const OCR_FAILURE_MESSAGE: string = 'The text recognition engine failed';

const OCR_INITIALIZATION_FAILURE_MESSAGE: string = 'The text recognition engine could not be initialized';

const OCR_OUTPUT: { blocks: boolean; text: boolean } = { blocks: true, text: false };

const OCR_STOPPED_MESSAGE: string = 'The text recognition engine was stopped';

export class TesseractOcrWorker implements OcrWorker {
    private _pendingRejections: Set<(reason: Error) => void> = new Set<(reason: Error) => void>();
    private _terminated: boolean = false;

    constructor(
        private tesseract: TesseractModule,
        private worker: TesseractWorker,
    ) {}

    static async create(tesseract: TesseractModule, languages: string): Promise<TesseractOcrWorker> {
        const worker: TesseractWorker = await new Promise<TesseractWorker>(
            (resolve: (worker: TesseractWorker) => void, reject: (reason: Error) => void): void => {
                tesseract
                    .createWorker(languages, tesseract.OEM.LSTM_ONLY, {
                        errorHandler: (): void => reject(new Error(OCR_INITIALIZATION_FAILURE_MESSAGE)),
                        logger: (): void => undefined,
                    })
                    .then(resolve, (): void => reject(new Error(OCR_INITIALIZATION_FAILURE_MESSAGE)));
            },
        );
        const ocrWorker: TesseractOcrWorker = new TesseractOcrWorker(tesseract, worker);

        try {
            await ocrWorker.configure();
        } catch (error: unknown) {
            await ocrWorker.terminate();
            throw error;
        }

        return ocrWorker;
    }

    recognize(image: HTMLCanvasElement): Promise<OcrPage> {
        return this.track(() => this.worker.recognize(image, {}, OCR_OUTPUT)).then((result: { data: OcrPage }) => result.data);
    }

    async reinitialize(languages: string): Promise<void> {
        await this.track(() => this.worker.reinitialize(languages));
        await this.configure();
    }

    async terminate(): Promise<void> {
        if (this._terminated) {
            return;
        }

        const rejections: ((reason: Error) => void)[] = [...this._pendingRejections];

        this._terminated = true;
        this._pendingRejections.clear();
        rejections.forEach((reject: (reason: Error) => void) => reject(new Error(OCR_STOPPED_MESSAGE)));

        await this.worker.terminate();
    }

    private async configure(): Promise<void> {
        await this.track(() => this.worker.setParameters({ tessedit_pageseg_mode: this.tesseract.PSM.AUTO }));
    }

    private toError(error: unknown): Error {
        return error instanceof Error ? error : new Error(OCR_FAILURE_MESSAGE);
    }

    private track<T>(job: () => Promise<T>): Promise<T> {
        if (this._terminated) {
            return Promise.reject(new Error(OCR_STOPPED_MESSAGE));
        }

        return new Promise<T>((resolve: (value: T) => void, reject: (reason: Error) => void): void => {
            const rejectJob: (reason: Error) => void = (reason: Error): void => reject(reason);

            this._pendingRejections.add(rejectJob);

            Promise.resolve()
                .then(job)
                .then(resolve, (error: unknown): void => reject(this.toError(error)))
                .finally((): void => {
                    this._pendingRejections.delete(rejectJob);
                });
        });
    }
}
