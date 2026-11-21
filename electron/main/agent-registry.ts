import fs from 'node:fs';
import path from 'node:path';

import { defaultAgentProfiles, type AgentProfile } from '../../src/lib/agency-roster.ts';

const PROFILE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_PROFILES = 100;

function isProfile(value: unknown): value is AgentProfile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Partial<AgentProfile>;
  return typeof profile.id === 'string'
    && PROFILE_ID.test(profile.id)
    && !/health/i.test(profile.id)
    && typeof profile.name === 'string'
    && profile.name.trim().length > 0
    && profile.name.length <= 120
    && typeof profile.description === 'string'
    && profile.description.length <= 500
    && typeof profile.systemPrompt === 'string'
    && profile.systemPrompt.trim().length > 0
    && profile.systemPrompt.length <= 6000;
}

export class AgentRegistry {
  private readonly file: string;
  private profiles: AgentProfile[] = [];
  private loadError = '';

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'agent-profiles.json');
  }

  load(): AgentProfile[] {
    this.loadError = '';
    const defaults = defaultAgentProfiles();
    try {
      if (!fs.existsSync(this.file)) {
        this.profiles = defaults;
        this.save();
        return this.list();
      }

      const parsed: unknown = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!Array.isArray(parsed)) throw new Error('profile file must contain an array');
      const configured = parsed.filter(isProfile).slice(0, MAX_PROFILES);
      if (configured.length !== parsed.length) throw new Error('profile file contains invalid or unsupported profiles');
      const byId = new Map(defaults.map((profile) => [profile.id, profile]));
      for (const profile of configured) byId.set(profile.id, profile);
      this.profiles = [...byId.values()];
    } catch (error) {
      this.profiles = defaults;
      this.loadError = `Could not load agent profiles at ${this.file}: ${String(error)}`;
      console.warn(this.loadError);
    }
    return this.list();
  }

  error(): string {
    return this.loadError;
  }

  list(): AgentProfile[] {
    return this.profiles.map((profile) => ({ ...profile }));
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.profiles, null, 2), 'utf8');
  }
}
