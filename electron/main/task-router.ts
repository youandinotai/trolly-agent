import { applyPandaChoice, pandaRouteRequest } from '../../src/lib/panda-route.js';
import { routeTaskDeterministic, type TaskRoute } from '../../src/lib/task-router.js';

/** Panda picks the local model. Studio assignment stays in the deterministic map. */
export class JevTaskRouter {
  private readonly baseUrl: string;
  private readonly pandaUrl: string;

  constructor(baseUrl = 'http://127.0.0.1:11434', pandaUrl = 'http://127.0.0.1:48710') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.pandaUrl = pandaUrl.replace(/\/+$/, '');
  }

  private async installedModels(): Promise<{ name: string; contextLength?: number }[]> {
    const response = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Ollama inventory returned HTTP ${response.status}`);
    const data = await response.json();
    return (data.models ?? [])
      .filter((entry: any) => entry?.name && !entry.remote_host && !entry.remote_model && (entry.size ?? 0) >= 1_000_000)
      .map((entry: any) => ({ name: entry.name, contextLength: entry.details?.context_length }));
  }

  async classify(prompt: string): Promise<TaskRoute> {
    const fallback = routeTaskDeterministic(prompt);
    if (!String(prompt ?? '').trim()) return fallback;
    try {
      const models = await this.installedModels();
      const request = pandaRouteRequest(prompt, models);
      if (!request.pool.length) throw new Error('No installed local models to route.');
      const response = await fetch(`${this.pandaUrl}/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify(request),
      });
      if (!response.ok) throw new Error(`Panda returned HTTP ${response.status}`);
      return applyPandaChoice(fallback, await response.json(), request.pool);
    } catch {
      return {
        ...fallback,
        reason: `${fallback.reason} Panda was unavailable, so deterministic routing was used.`,
      };
    }
  }
}
