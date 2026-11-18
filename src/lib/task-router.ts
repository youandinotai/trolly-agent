export type TaskKind = 'avatar' | 'image' | 'video' | 'edit' | 'chat';
export type TaskBackend = 'stage-vrm' | 'comfyui-image' | 'comfyui-ltxv' | 'comfyui-img2img' | 'ollama-chat';

export interface TaskRoute {
  task: TaskKind;
  backend: TaskBackend;
  model: string;
  reason: string;
  prompt: string;
  source: 'jev' | 'panda' | 'fallback';
  routerModel?: string;
  specialist?: string;
}

const ROUTES: Record<TaskKind, { backend: TaskBackend; model: string }> = {
  avatar: { backend: 'stage-vrm', model: 'VRM 1.0 / three-vrm' },
  image: { backend: 'comfyui-image', model: 'ponyDiffusionV6XL_v6StartWithThisOne.safetensors' },
  video: { backend: 'comfyui-ltxv', model: 'ltx-2.3-22b-distilled-fp8.safetensors' },
  edit: { backend: 'comfyui-img2img', model: 'ponyDiffusionV6XL_v6StartWithThisOne.safetensors' },
  chat: { backend: 'ollama-chat', model: 'active chat model' },
};

function routeFor(task: TaskKind, prompt: string, reason: string): TaskRoute {
  return { task, ...ROUTES[task], reason, prompt, source: 'fallback' };
}

/** Conservative offline fallback when JEV is absent, remote, or declines. */
export function routeTaskDeterministic(input: string): TaskRoute {
  const prompt = String(input ?? '').trim();
  const text = prompt.toLowerCase();
  const action = /\b(make|create|generate|render|draw|animate|edit|change|remove|replace|load|use|turn|transform|produce|img2img|inpaint|outpaint)\b/i.test(text);
  if (!prompt || !action) return routeFor('chat', prompt, 'No clear local media action was requested.');

  if (/\b(vrm|vtuber|live2d|3d avatar|avatar on stage)\b/i.test(text)) {
    return routeFor('avatar', prompt, 'The request concerns a stage avatar or VRM character.');
  }
  if (/\b(img2img|inpaint|outpaint|reference image|nsfw version|edit|remove|replace|variation)\b/i.test(text)) {
    return routeFor('edit', prompt, 'The request transforms an existing image or reference.');
  }
  if (/\b(video|animate|animation|movie|film clip|video clip)\b/i.test(text)) {
    return routeFor('video', prompt, 'The request asks for motion or a video clip.');
  }
  if (/\b(image|picture|photo|draw|drawing|render|artwork|illustration|pinup|portrait)\b/i.test(text)) {
    return routeFor('image', prompt, 'The request asks for a still image.');
  }
  return routeFor('chat', prompt, 'The request is conversational rather than a clear media job.');
}

/** Steps shown before any paid or local generation call. */
export function planRouteSteps(route: TaskRoute, chatModel: string): string[] {
  const who = route.specialist || 'product';
  const model = route.task === 'chat' ? (chatModel || route.model) : route.model;
  const hold = route.task === 'chat'
    ? 'No reply is generated until you press Run.'
    : 'No image, video, or edit job starts until you press Run.';
  return [
    `Director chose ${who}.`,
    `Task ${route.task} on ${route.backend}.`,
    `Model ${model}. Router ${route.source}.`,
    route.reason,
    hold,
  ];
}

/** Validate JEV output and map it to known local capabilities only. */
export function parseTaskRoute(answer: string, prompt: string): TaskRoute {
  let parsed: any;
  try {
    parsed = JSON.parse(String(answer ?? '').trim());
  } catch {
    throw new Error('JEV did not return valid route JSON.');
  }
  const task = parsed?.task as TaskKind;
  if (!['avatar', 'image', 'video', 'edit', 'chat'].includes(task)) {
    throw new Error('JEV returned an unknown route task.');
  }
  const route = routeFor(task, prompt, String(parsed?.reason ?? 'JEV classified the request.'));
  return { ...route, source: 'jev' };
}
