import type { TaskRoute } from './task-router.js';

export interface LocalModelRef {
  name: string;
  contextLength?: number;
}

export interface PandaCard {
  id: string;
  provider: 'ollama';
  model: string;
  description: string;
  skills: Record<string, { theta: number; se: number }>;
  modalities: { input: string[]; output: string[] };
  features: { tools: boolean; json_mode: boolean };
  limits: { context_tokens: number };
  cost: { input_per_mtok: number; output_per_mtok: number; currency: 'USD' };
  local: true;
  provenance: 'estimated';
}

const SKILL_AXES = [
  'coding', 'debugging', 'reasoning', 'math', 'writing',
  'research', 'review', 'planning', 'ui_frontend', 'data_analysis',
] as const;

/** Card ids cannot contain a colon, so eve-cpu:latest becomes ollama-eve-cpu-latest. */
export function cardIdForModel(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return `ollama-${slug || 'local'}`;
}

export function localModelCard(model: LocalModelRef): PandaCard {
  const vision = /vl|vision|llava/i.test(model.name);
  const skills = Object.fromEntries(SKILL_AXES.map((axis) => [axis, { theta: 5, se: 1.5 }]));
  return {
    id: cardIdForModel(model.name),
    provider: 'ollama',
    model: model.name,
    description: `Installed local Ollama model ${model.name}.`,
    skills,
    modalities: { input: vision ? ['text', 'image'] : ['text'], output: ['text'] },
    limits: { context_tokens: Math.max(1, model.contextLength || 8192) },
    cost: { input_per_mtok: 0, output_per_mtok: 0, currency: 'USD' },
    features: { tools: true, json_mode: true },
    local: true,
    provenance: 'estimated',
  };
}

export function pandaRouteRequest(prompt: string, models: LocalModelRef[]) {
  const pool = models.filter((model) => model.name && !/:cloud\b/i.test(model.name)).map(localModelCard);
  return {
    task: {
      text: prompt,
      context: { repo_languages: ['typescript'] },
    },
    pool,
    constraints: { local_only: true },
    preferences: { mode: 'max_utility' as const, min_p_success: 0.4 },
    return_top_k: 1,
  };
}

/** Keep the studio assignment. Panda only chooses the local model that handles the text. */
export function applyPandaChoice(route: TaskRoute, response: any, cards: PandaCard[]): TaskRoute {
  const choiceId = String(response?.choice?.model_id ?? '');
  const card = cards.find((item) => item.id === choiceId || item.model === choiceId);
  if (!card) throw new Error('Panda did not return an installed local model.');
  if (route.task === 'chat') {
    return { ...route, model: card.model, source: 'panda', routerModel: 'panda-router' };
  }
  return { ...route, source: 'panda', routerModel: 'panda-router' };
}
