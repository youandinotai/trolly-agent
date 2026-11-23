/**
 * Ollama client — local LLM provider.
 *
 * Trolly Agent talks to a local Ollama daemon (default http://127.0.0.1:11434)
 * and can also reach Ollama's cloud models through the same API.
 */

export interface OllamaModel {
  name: string;
  size: number;
  contextLength?: number;
  family?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Base64-encoded image attachments (Ollama multimodal `images` array). */
  images?: string[];
  tool_calls?: OllamaToolCall[];
}

export interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface OllamaToolCall {
  function: { name: string; arguments?: Record<string, unknown> };
}

export interface OllamaChatTurn {
  content: string;
  thinking: string;
  toolCalls: OllamaToolCall[];
}

export class OllamaClient {
  private readonly baseUrl: string;

  constructor(baseUrl = 'http://127.0.0.1:11434') {
    this.baseUrl = baseUrl;
  }

  private url(p: string) {
    return `${this.baseUrl.replace(/\/+$/, '')}${p}`;
  }

  async listModels(): Promise<OllamaModel[]> {
    const res = await fetch(this.url('/api/tags'));
    if (!res.ok) throw new Error(`Ollama /api/tags failed: ${res.status}`);
    const data = await res.json();
    return (data.models ?? []).map((m: any) => ({
      name: m.name,
      size: m.size ?? 0,
      contextLength: m.details?.context_length,
      family: m.details?.family,
    }));
  }

  async pullModel(name: string): Promise<void> {
    const model = String(name ?? '').trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,149}$/.test(model)) {
      throw new Error('Enter a valid Ollama model name.');
    }
    const res = await fetch(this.url('/api/pull'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model, stream: false }),
      signal: AbortSignal.timeout(30 * 60 * 1000),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Ollama pull failed: ${res.status} ${body.slice(0, 200)}`);
    }
  }

  async deleteModel(name: string): Promise<void> {
    const model = String(name ?? '').trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,149}$/.test(model)) {
      throw new Error('Enter a valid Ollama model name.');
    }
    const res = await fetch(this.url('/api/delete'), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Ollama delete failed: ${res.status} ${body.slice(0, 200)}`);
    }
  }

  async chat(input: {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    maxTokens?: number;
    tools?: OllamaTool[];
  }): Promise<string> {
    const turn = await this.chatTurn(input);
    if (turn.content.trim()) return turn.content;
    if (turn.thinking.trim()) return turn.thinking.trim();
    return '';
  }

  async chatTurn({
    model,
    messages,
    temperature = 0.8,
    maxTokens = 4096,
    tools,
  }: {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    maxTokens?: number;
    tools?: OllamaTool[];
  }): Promise<OllamaChatTurn> {
    const res = await fetch(this.url('/api/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.images?.length ? { images: m.images } : {}),
          ...(m.tool_calls?.length ? { tool_calls: m.tool_calls } : {}),
        })),
        stream: false,
        ...(tools?.length ? { tools } : {}),
        options: { temperature, num_predict: maxTokens },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Ollama chat failed: ${res.status} ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    const calls = Array.isArray(data?.message?.tool_calls) ? data.message.tool_calls : [];
    return {
      content: String(data?.message?.content ?? ''),
      thinking: String(data?.message?.thinking ?? ''),
      toolCalls: calls
        .filter((call: any) => typeof call?.function?.name === 'string')
        .map((call: any) => ({
          function: {
            name: call.function.name,
            arguments: call.function.arguments && typeof call.function.arguments === 'object'
              ? call.function.arguments
              : {},
          },
        })),
    };
  }

  async status() {
    try {
      const models = await this.listModels();
      return { online: true, modelCount: models.length, models };
    } catch (err: any) {
      return { online: false, error: String(err?.message ?? err), models: [] as OllamaModel[] };
    }
  }
}
