import test from 'node:test';
import assert from 'node:assert/strict';

import { ProviderClient } from '../electron/main/provider.ts';

test('OpenAI-compatible provider lists models and sends chat only to the configured endpoint', async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/models')) {
      return new Response(JSON.stringify({ data: [{ id: 'local-chat' }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ready' } }] }), { status: 200 });
  };
  try {
    const client = new ProviderClient();
    const input = { provider: 'omniroute', endpoint: 'http://127.0.0.1:20128/v1' };
    assert.deepEqual(await client.listModels(input), [{ name: 'local-chat', size: 0 }]);
    assert.equal(await client.chat({
      ...input,
      model: 'local-chat',
      messages: [{ role: 'user', content: 'hello' }],
    }), 'ready');
    assert.deepEqual(calls.map((call) => call.url), [
      'http://127.0.0.1:20128/v1/models',
      'http://127.0.0.1:20128/v1/chat/completions',
    ]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('OpenAI-compatible provider rejects image attachments instead of dropping them', async () => {
  const client = new ProviderClient();
  await assert.rejects(() => client.chat({
    provider: 'opencode',
    endpoint: 'http://127.0.0.1:4096/v1',
    model: 'model',
    messages: [{ role: 'user', content: 'describe', images: ['base64'] }],
  }), /only with the Ollama provider/i);
});
