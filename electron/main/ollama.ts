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
  role: 'system' | 'user' | 'assistant';
  content: string;
  /** Base64-encoded image attachments (Ollama multimodal `images` array). */
  images?: string[];
}

export class OllamaClient {
  constructor(private baseUrl = 'http://127.0.0.1:11434') {}

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

  async chat({
    model,
    messages,
    temperature = 0.8,
    maxTokens = 4096,
  }: {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const res = await fetch(this.url('/api/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        // Ollama carries image attachments on the message, not in a separate field.
        messages: messages.map((m) =>
          m.images?.length ? { ...m, images: m.images } : { role: m.role, content: m.content },
        ),
        stream: false,
        options: { temperature, num_predict: maxTokens },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Ollama chat failed: ${res.status} ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    const content = data?.message?.content ?? '';
    // Reasoning models (Qwen3-style) emit a `thinking` field and can spend the
    // whole token budget on it, leaving `content` empty. Surface the thinking
    // as the reply when there is no content, so the user still gets an answer.
    const thinking = data?.message?.thinking ?? '';
    if (content.trim()) return content;
    if (thinking.trim()) return thinking.trim();
    return '';
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
