import { createTranslationServer } from './app.mjs';
import { createGeminiTranslator } from './gemini.mjs';

const translate = createGeminiTranslator({ apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL });
const server = createTranslationServer({
    translate, token: process.env.CLIENT_TOKEN,
    allowedOrigins: (process.env.ALLOWED_ORIGINS ?? 'https://localhost,http://localhost:4200,http://127.0.0.1:4200').split(',').map(value => value.trim()),
});
server.requestTimeout = 25000;
server.headersTimeout = 10000;
server.listen(Number(process.env.PORT ?? 8787), process.env.HOST ?? '127.0.0.1', () => {
    console.log('Lens Viva translation server ready');
});
