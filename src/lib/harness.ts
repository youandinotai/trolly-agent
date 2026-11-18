export type HarnessId = 'local' | 'hermes-local' | 'hermes-omni' | 'custom';

export interface HarnessOption {
  id: HarnessId;
  label: string;
  detail: string;
  endpoint: string;
}

/** Keys stay in Hermes or OmniRoute. This list has addresses only. */
export const HARNESSES: HarnessOption[] = [
  {
    id: 'local',
    label: 'Local',
    detail: 'Panda picks the model and the agency skill. Both stay on this machine.',
    endpoint: 'http://192.168.0.8:11434',
  },
  {
    id: 'hermes-local',
    label: 'Hermes local',
    detail: 'Hermes dashboard on this machine. Nothing has to leave it.',
    endpoint: 'http://192.168.0.8:9119',
  },
  {
    id: 'hermes-omni',
    label: 'Hermes via OmniRoute',
    detail: 'Hermes can use OmniRoute. Keys stay there, not in this app.',
    endpoint: 'http://192.168.0.8:20128/v1',
  },
  {
    id: 'opencode-omni',
    label: 'OpenCode via OmniRoute',
    detail: 'OpenCode can point to OmniRoute /v1. Keys stay in Hermes or OmniRoute.',
    endpoint: 'http://192.168.0.8:20128/v1',
  },
  {
    id: 'custom',
    label: 'Custom endpoint',
    detail: 'A URL only. Add a ChatGPT or Claude key in Hermes or OmniRoute, not here.',
    endpoint: '',
  },
];

export function harnessById(id: string): HarnessOption {
  return HARNESSES.find((item) => item.id === id) ?? HARNESSES[0];
}

export function customEndpointOrEmpty(value: string): string {
  const text = String(value ?? '').trim();
  if (!/^https?:\/\/[^/]+/i.test(text)) return '';
  if (/api[_-]?key|sk-|secret|token=/i.test(text)) return '';
  return text;
}
