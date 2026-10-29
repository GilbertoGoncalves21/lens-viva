import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiTranslator, TRANSLATION_INSTRUCTIONS } from './gemini.mjs';

const input = { text: 'Everything happens for a reason.', context: 'A motivational quote', sourceLanguage: 'en', targetLanguage: 'pt' };

test('sends the phrase as untrusted data with contextual translation instructions', async () => {
    let request;
    const translate = createGeminiTranslator({ apiKey: 'test-key', model: 'test-model', fetchImpl: async (url, options) => {
        request = JSON.parse(options.body);
        assert.equal(options.headers['x-goog-api-key'], 'test-key');
        return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ translatedText: 'Tudo acontece por um motivo.', uncertain: false }) }] } }] });
    } });
    assert.deepEqual(await translate(input), { translatedText: 'Tudo acontece por um motivo.', uncertain: false });
    assert.deepEqual(JSON.parse(request.contents[0].parts[0].text), input);
    assert.equal(request.systemInstruction.parts[0].text, TRANSLATION_INSTRUCTIONS);
    assert.equal(request.generationConfig.responseMimeType, 'application/json');
});

test('rejects blocked and truncated responses instead of returning fragments', async () => {
    const translate = createGeminiTranslator({ apiKey: 'test-key', model: 'test-model', fetchImpl: async () => Response.json({ candidates: [{ finishReason: 'MAX_TOKENS' }] }) });
    await assert.rejects(translate(input), /PROVIDER_INCOMPLETE/u);
});

test('preserves the provider uncertainty result', async () => {
    const translate = createGeminiTranslator({ apiKey: 'test-key', model: 'test-model', fetchImpl: async () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"translatedText":"","uncertain":true}' }] } }] }) });
    assert.deepEqual(await translate(input), { translatedText: '', uncertain: true });
});
