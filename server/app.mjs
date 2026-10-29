import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

export function createTranslationServer({ translate, token, allowedOrigins = [], maxRequestsPerMinute = 30 }) {
    if (typeof token !== 'string' || token.length < 24) {
        throw new Error('CLIENT_TOKEN must contain at least 24 characters');
    }
    const secret = Buffer.from(`Bearer ${token}`);
    let windowStarted = Date.now();
    let requestCount = 0;
    let active = 0;
    return createServer(async (request, response) => {
        const origin = request.headers.origin;
        const reply = (status, body) => {
            response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            response.end(JSON.stringify(body));
        };
        if (origin && !allowedOrigins.includes(origin)) {
            return reply(403, { error: 'ORIGIN_DENIED' });
        }
        if (origin) {
            response.setHeader('Access-Control-Allow-Origin', origin);
            response.setHeader('Vary', 'Origin');
        }
        response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        if (request.method === 'OPTIONS') {
            response.writeHead(204);
            return response.end();
        }
        if (request.method !== 'POST' || request.url !== '/translate') {
            return reply(404, { error: 'NOT_FOUND' });
        }
        const credentials = Buffer.from(request.headers.authorization ?? '');
        if (credentials.length !== secret.length || !timingSafeEqual(credentials, secret)) {
            return reply(401, { error: 'UNAUTHORIZED' });
        }
        if (!(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
            return reply(415, { error: 'JSON_REQUIRED' });
        }
        if (Date.now() - windowStarted >= 60000) {
            windowStarted = Date.now(); requestCount = 0;
        }
        if (requestCount >= maxRequestsPerMinute || active >= 2) {
            response.setHeader('Retry-After', '60');
            return reply(429, { error: 'RATE_LIMITED' });
        }
        let body;
        try {
            const chunks = [];
            let bytes = 0;
            for await (const chunk of request) {
                bytes += chunk.length;
                if (bytes > 32768) {
                    reply(413, { error: 'BODY_TOO_LARGE' });
                    request.resume();
                    return;
                }
                chunks.push(chunk);
            }
            body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
            return reply(400, { error: 'INVALID_JSON' });
        }
        const language = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/u;
        if (typeof body?.text !== 'string' || !body.text.trim() || body.text.length > 4000
            || typeof body.context !== 'string' || body.context.length > 4000
            || typeof body.sourceLanguage !== 'string' || typeof body.targetLanguage !== 'string'
            || !language.test(body.sourceLanguage) || !language.test(body.targetLanguage)) {
            return reply(400, { error: 'INVALID_INPUT' });
        }
        if (requestCount >= maxRequestsPerMinute || active >= 2) {
            response.setHeader('Retry-After', '60');
            return reply(429, { error: 'RATE_LIMITED' });
        }
        requestCount++; active++;
        try {
            const result = await translate({ text: body.text, context: body.context, sourceLanguage: body.sourceLanguage, targetLanguage: body.targetLanguage });
            reply(200, result);
        } catch {
            // Never log recognized text, authorization headers or upstream error bodies.
            reply(502, { error: 'TRANSLATION_UNAVAILABLE' });
        } finally {
            active--;
        }
    });
}
