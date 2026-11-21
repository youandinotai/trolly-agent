import { customEndpointOrEmpty, harnessById, type HarnessId } from '../../src/lib/harness.ts';
import { OllamaClient, type ChatMessage, type OllamaModel } from './ollama.ts';

export interface ProviderInput {
  provider: HarnessId;
  endpoint?: string;
}

export interface ProviderChatInput extends ProviderInput {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export class ProviderClient {
  private readonly ollama = new OllamaClient('http://127.0.0.1:11434');

  async listModels(input: ProviderInput): Promise<OllamaModel[]> {
    const adapter = harnessById(input.provider).adapter;
    if (adapter === 'ollama') return this.ollama.listModels();
    const endpoint = this.endpoint(input);
    const response = await fetch(`${endpoint}/models`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Provider model inventory returned HTTP ${response.status}`);
    const data = await response.json();
    const records = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
    return records
      .map((model: any) => ({
        name: typeof model?.id === 'string' ? model.id : typeof model?.name === 'string' ? model.name : '',
        size: 0,
      }))
      .filter((model: OllamaModel) => model.name);
  }

  async chat(input: ProviderChatInput): Promise<string> {
    const adapter = harnessById(input.provider).adapter;
    if (adapter === 'ollama') {
      return this.ollama.chat({
        model: input.model,
        messages: input.messages,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
      });
    }
    if (input.messages.some((message) => message.images?.length)) {
      throw new Error('Image attachments are currently supported only with the Ollama provider.');
    }
    const endpoint = this.endpoint(input);
    const response = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model: input.model,
        messages: input.messages.map(({ role, content }) => ({ role, content })),
        temperature: input.temperature ?? 0.8,
        max_tokens: input.maxTokens ?? 4096,
        stream: false,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Provider chat failed: HTTP ${response.status} ${body.slice(0, 200)}`);
    }
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.filter((part: any) => part?.type === 'text' && typeof part.text === 'string')
        .map((part: any) => part.text).join('');
    }
    throw new Error('Provider response did not contain text.');
  }

  private endpoint(input: ProviderInput): string {
    const endpoint = customEndpointOrEmpty(input.endpoint ?? harnessById(input.provider).endpoint);
    if (!endpoint) throw new Error('Enter a valid HTTP(S) provider endpoint without credentials.');
    return endpoint;
  }
}
