import { parseTaskRoute, routeTaskDeterministic, type TaskRoute } from '../../src/lib/task-router.js';

/** Local JEV-style task router with a deterministic, no-network fallback. */
export class JevTaskRouter {
  private readonly baseUrl: string;
  private readonly model: string;
  private verifiedLocal = false;

  constructor(baseUrl = 'http://127.0.0.1:11434', model = 'eve-cpu:latest') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.model = model;
  }

  private async verifyLocalModel(): Promise<void> {
    if (this.verifiedLocal) return;
    const response = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Local router inventory returned HTTP ${response.status}`);
    const data = await response.json();
    const installed = data.models?.find((entry: any) => entry.name === this.model);
    if (!installed) throw new Error(`Router model ${this.model} is not installed.`);
    if (installed.remote_host || installed.remote_model || installed.size < 1_000_000) {
      throw new Error('Router model is not fully local; refusing to send the prompt.');
    }
    this.verifiedLocal = true;
  }

  async classify(prompt: string): Promise<TaskRoute> {
    const fallback = routeTaskDeterministic(prompt);
    if (!String(prompt ?? '').trim()) return fallback;
    try {
      await this.verifyLocalModel();
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(120_000),
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: 'json',
          think: false,
          keep_alive: '5m',
          messages: [{
            role: 'user',
            content: [
              'Classify the user request into exactly one task: avatar, image, video, edit, or chat.',
              'avatar means a VRM/3D stage character; image means a new still; video means motion;',
              'edit means transforming an existing image; chat means ordinary conversation.',
              'Return JSON only: {"task":"avatar|image|video|edit|chat","reason":"short reason"}.',
              `Request: ${prompt}`,
            ].join(' '),
          }],
          options: { temperature: 0, num_gpu: 0 },
        }),
      });
      if (!response.ok) throw new Error(`Local router returned HTTP ${response.status}`);
      const data = await response.json();
      return { ...parseTaskRoute(data?.message?.content ?? '', prompt), routerModel: this.model };
    } catch (error: any) {
      return {
        ...fallback,
        reason: `${fallback.reason} JEV was unavailable or uncertain, so deterministic routing was used.`,
      };
    }
  }
}
