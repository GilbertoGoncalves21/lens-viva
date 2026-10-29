import type { Mock } from 'vitest';
import { OcrPage, TesseractModule, TesseractOcrWorker } from './tesseract-ocr-worker';

interface CreateWorkerOptions {
    errorHandler: (error: unknown) => void;
    logger: (message: unknown) => void;
}

interface OutputFormats {
    blocks: boolean;
    text: boolean;
}

interface TesseractWorkerStub {
    recognize: Mock<(image: HTMLCanvasElement, options: Record<string, never>, output: OutputFormats) => Promise<{ data: OcrPage }>>;
    reinitialize: Mock<(languages: string) => Promise<unknown>>;
    setParameters: Mock<(parameters: Record<string, string>) => Promise<unknown>>;
    terminate: Mock<() => Promise<unknown>>;
}

interface TesseractModuleStub {
    createWorker: Mock<(languages: string, oem: number, options: CreateWorkerOptions) => Promise<TesseractWorkerStub>>;
    OEM: { LSTM_ONLY: number };
    PSM: { AUTO: string };
}

const PAGE: OcrPage = {
    blocks: [
        {
            bbox: { x0: 10, x1: 200, y0: 20, y1: 60 },
            paragraphs: [{ lines: [{ bbox: { x0: 10, x1: 200, y0: 20, y1: 60 }, confidence: 91, text: 'Exit\n' }] }],
        },
    ],
};

function never<T>(): Promise<T> {
    return new Promise<T>((): void => undefined);
}

describe('TesseractOcrWorker', () => {
    let tesseractStub: TesseractModuleStub;
    let workerStub: TesseractWorkerStub;

    beforeEach(() => {
        workerStub = {
            recognize: vi.fn(async (): Promise<{ data: OcrPage }> => ({ data: PAGE })),
            reinitialize: vi.fn(async (): Promise<unknown> => undefined),
            setParameters: vi.fn(async (): Promise<unknown> => undefined),
            terminate: vi.fn(async (): Promise<unknown> => undefined),
        };
        tesseractStub = {
            createWorker: vi.fn(async (): Promise<TesseractWorkerStub> => workerStub),
            OEM: { LSTM_ONLY: 1 },
            PSM: { AUTO: '3' },
        };
    });

    function create(languages: string = 'eng+por'): Promise<TesseractOcrWorker> {
        return TesseractOcrWorker.create(tesseractStub as unknown as TesseractModule, languages);
    }

    describe('create', () => {
        it('should create an LSTM worker for the languages with quiet logging and an error handler', async () => {
            await create('eng+spa');

            const [languages, oem, options] = tesseractStub.createWorker.mock.calls[0];

            expect(languages).toBe('eng+spa');
            expect(oem).toBe(1);
            expect(typeof options.errorHandler).toBe('function');
            expect(typeof options.logger).toBe('function');
        });

        it('should switch the worker to automatic page segmentation', async () => {
            await create();

            expect(workerStub.setParameters).toHaveBeenCalledWith({ tessedit_pageseg_mode: '3' });
        });

        it('should reject when the engine reports an error before the worker is ready', async () => {
            tesseractStub.createWorker.mockImplementationOnce((languages: string, oem: number, options: CreateWorkerOptions) => {
                options.errorHandler('language data download failed');

                return never<TesseractWorkerStub>();
            });

            await expect(create()).rejects.toThrow('The text recognition engine could not be initialized');
        });

        it('should reject with an Error when the worker cannot be created', async () => {
            tesseractStub.createWorker.mockRejectedValueOnce('network error');

            await expect(create()).rejects.toBeInstanceOf(Error);
        });

        it('should terminate the worker and reject when it cannot be configured', async () => {
            workerStub.setParameters.mockRejectedValueOnce('bad parameter');

            await expect(create()).rejects.toThrow('The text recognition engine failed');

            expect(workerStub.terminate).toHaveBeenCalledTimes(1);
        });
    });

    describe('recognize', () => {
        it('should request block output without plain text and return the page', async () => {
            const worker: TesseractOcrWorker = await create();
            const canvas: HTMLCanvasElement = document.createElement('canvas');

            await expect(worker.recognize(canvas)).resolves.toEqual(PAGE);

            expect(workerStub.recognize).toHaveBeenCalledWith(canvas, {}, { blocks: true, text: false });
        });

        it('should turn engine failures into errors', async () => {
            const worker: TesseractOcrWorker = await create();
            workerStub.recognize.mockRejectedValueOnce('Error attempting to read image.');

            await expect(worker.recognize(document.createElement('canvas'))).rejects.toThrow('The text recognition engine failed');
        });

        it('should keep errors raised by the engine', async () => {
            const worker: TesseractOcrWorker = await create();
            const failure: Error = new Error('out of memory');
            workerStub.recognize.mockRejectedValueOnce(failure);

            await expect(worker.recognize(document.createElement('canvas'))).rejects.toBe(failure);
        });
    });

    describe('reinitialize', () => {
        it('should load the new languages and restore automatic page segmentation', async () => {
            const worker: TesseractOcrWorker = await create();
            workerStub.setParameters.mockClear();

            await worker.reinitialize('eng+fra');

            expect(workerStub.reinitialize).toHaveBeenCalledWith('eng+fra');
            expect(workerStub.setParameters).toHaveBeenCalledWith({ tessedit_pageseg_mode: '3' });
            expect(workerStub.reinitialize.mock.invocationCallOrder[0]).toBeLessThan(workerStub.setParameters.mock.invocationCallOrder[0]);
        });

        it('should reject when the new languages cannot be loaded', async () => {
            const worker: TesseractOcrWorker = await create();
            workerStub.reinitialize.mockRejectedValueOnce('language data download failed');

            await expect(worker.reinitialize('eng+fra')).rejects.toThrow('The text recognition engine failed');
        });
    });

    describe('terminate', () => {
        it('should reject jobs that are still running because the engine never answers them', async () => {
            const worker: TesseractOcrWorker = await create();
            workerStub.recognize.mockReturnValueOnce(never<{ data: OcrPage }>());

            const recognizing: Promise<OcrPage> = worker.recognize(document.createElement('canvas'));
            await Promise.resolve();
            await worker.terminate();

            await expect(recognizing).rejects.toThrow('The text recognition engine was stopped');
        });

        it('should terminate the engine only once', async () => {
            const worker: TesseractOcrWorker = await create();

            await worker.terminate();
            await worker.terminate();

            expect(workerStub.terminate).toHaveBeenCalledTimes(1);
        });

        it('should reject new jobs after termination without reaching the engine', async () => {
            const worker: TesseractOcrWorker = await create();

            await worker.terminate();

            await expect(worker.recognize(document.createElement('canvas'))).rejects.toThrow('The text recognition engine was stopped');
            expect(workerStub.recognize).not.toHaveBeenCalled();
        });
    });
});
