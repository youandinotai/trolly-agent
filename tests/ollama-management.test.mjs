import test from 'node:test';
import assert from 'node:assert/strict';

import { OllamaClient } from '../electron/main/ollama.ts';

test('Ollama model management uses its local pull and delete APIs', async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return new Response('{}', { status: 200 });
  };
  try {
    const client = new OllamaClient('http://127.0.0.1:11434');
    await client.pullModel('llama3.2:latest');
    await client.deleteModel('llama3.2:latest');
    assert.equal(calls[0].url, 'http://127.0.0.1:11434/api/pull');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(JSON.parse(calls[0].init.body).name, 'llama3.2:latest');
    assert.equal(calls[1].url, 'http://127.0.0.1:11434/api/delete');
    assert.equal(calls[1].init.method, 'DELETE');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('Ollama model management validates names before making a request', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('unexpected network request'); };
  try {
    const client = new OllamaClient();
    await assert.rejects(() => client.pullModel('../secret'), /valid Ollama model name/i);
    await assert.rejects(() => client.deleteModel(''), /valid Ollama model name/i);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
