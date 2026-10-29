import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTranslationServer } from './app.mjs';

const token = 'test-client-token-with-enough-characters';
const input = { text: 'Vervihing happens for a reason.', context: 'Vervihing happens for a reason.', sourceLanguage: 'en', targetLanguage: 'pt' };

async function withServer(action, translate, options = {}) {
    const server = createTranslationServer({ token, translate, allowedOrigins: ['https://localhost'], ...options });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/translate`;
    const post = (body = input, headers = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...headers }, body: JSON.stringify(body) });
    try { await action(post); } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('forwards a complete phrase and its context, without language packs', async () => {
    let received;
    await withServer(async post => {
        const response = await post();
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { translatedText: 'Tudo acontece por um motivo.', uncertain: false });
        assert.deepEqual(received, input);
    }, async data => { received = data; return { translatedText: 'Tudo acontece por um motivo.', uncertain: false }; });
});

test('rejects invalid authorization and unexpected origins before calling the provider', async () => {
    let calls = 0;
    await withServer(async post => {
        assert.equal((await post(input, { Authorization: 'Bearer wrong' })).status, 401);
        assert.equal((await post(input, { Origin: 'https://unexpected.example' })).status, 403);
        assert.equal(calls, 0);
    }, async () => { calls++; });
});

test('validates input and limits paid requests', async () => {
    await withServer(async post => {
        assert.equal((await post({ ...input, text: '' })).status, 400);
        assert.equal((await post({ ...input, context: 'x'.repeat(4001) })).status, 400);
        assert.equal((await post()).status, 200);
        assert.equal((await post()).status, 429);
    }, async () => ({ translatedText: 'Tradução', uncertain: false }), { maxRequestsPerMinute: 1 });
});

test('returns a generic error on provider failure without exposing the source text', async () => {
    await withServer(async post => {
        const response = await post();
        assert.equal(response.status, 502);
        assert.deepEqual(await response.json(), { error: 'TRANSLATION_UNAVAILABLE' });
    }, async () => { throw new Error('sensitive upstream body'); });
});
