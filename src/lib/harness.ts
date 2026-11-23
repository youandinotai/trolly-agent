export type HarnessId = 'local' | 'omniroute' | 'opencode' | 'hermes' | 'custom';
export type ProviderAdapter = 'ollama' | 'openai-compatible';

export interface HarnessOption {
  id: HarnessId;
  label: string;
  detail: string;
  endpoint: string;
  adapter: ProviderAdapter;
}

/** Credentials stay in the selected provider service, never in Trolly. */
export const HARNESSES: HarnessOption[] = [
  {
    id: 'local',
    label: 'Ollama local',
    detail: 'Models run on this device through the local Ollama daemon.',
    endpoint: 'http://127.0.0.1:11434',
    adapter: 'ollama',
  },
  {
    id: 'omniroute',
    label: 'OmniRoute',
    detail: 'OpenAI-compatible local gateway. Configure credentials in OmniRoute.',
    endpoint: 'http://127.0.0.1:20128/v1',
    adapter: 'openai-compatible',
  },
  {
    id: 'opencode',
    label: 'OpenCode via OmniRoute',
    detail: 'Uses your local OmniRoute gateway for configured OpenCode-backed models.',
    endpoint: 'http://127.0.0.1:20128/v1',
    adapter: 'openai-compatible',
  },
  {
    id: 'hermes',
    label: 'Hermes local proxy',
    detail: 'Uses the configured local Hermes OpenAI-compatible proxy.',
    endpoint: 'http://127.0.0.1:8645/v1',
    adapter: 'openai-compatible',
  },
  {
    id: 'custom',
    label: 'Custom OpenAI-compatible',
    detail: 'A URL only. Keep provider credentials in the configured service.',
    endpoint: '',
    adapter: 'openai-compatible',
  },
];

export function harnessById(id: string): HarnessOption {
  return HARNESSES.find((item) => item.id === id) ?? HARNESSES[0];
}

export function customEndpointOrEmpty(value: string): string {
  const text = String(value ?? '').trim();
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return '';
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) return '';
  if (/api[_-]?key|sk-|secret|token=/i.test(text)) return '';
  return text.replace(/\/+$/, '');
}
