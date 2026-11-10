import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * The agent's "mind": a persona (its consciousness), long-term memories it
 * keeps about the user, and reusable prompt recipes.
 *
 * Everything is a small JSON document on the app's D: data dir — no database,
 * no cloud, readable by hand.
 */
export interface Persona {
  id: string;
  name: string;
  content: string;
  updatedAt: string;
}

export interface Memory {
  id: string;
  title: string;
  content: string;
  tags: string[];
  updatedAt: string;
}

export interface Recipe {
  id: string;
  title: string;
  prompt: string;
  updatedAt: string;
}

/**
 * User preferences.
 *
 * `adultContent` unlocks the app's adult-content persona, but it is only
 * honoured once `ageVerified` is set. Adult mode is a content PREFERENCE, not
 * a licence to change the hard boundaries: legal age and consent always apply
 * and are never user-toggleable.
 */
export interface Preferences {
  /** User wants the agent to allow legal adult content in replies. */
  adultContent: boolean;
  /** User has explicitly confirmed they are a legal adult (18+ / local age of majority). */
  ageVerified: boolean;
  /** ISO timestamp of when the age confirmation was made. */
  verifiedAt?: string;
  /** Year of birth the user entered as part of the age check. */
  birthYear?: number;
}

export interface Mind {
  personas: Persona[];
  memories: Memory[];
  recipes: Recipe[];
  preferences: Preferences;
}

/**
 * A fresh empty mind. This must be a factory, not a shared constant: a shallow
 * `{ ...EMPTY }` copy still shares the same arrays, so every store would push
 * into one global list and resurrect deleted records.
 */
function emptyMind(): Mind {
  return {
    personas: [],
    memories: [],
    recipes: [],
    preferences: { adultContent: false, ageVerified: false },
  };
}

export class MindStore {
  // Plain field, not a TS parameter property: node's type-stripping loader
  // (used by the test runner) cannot parse parameter properties.
  private readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  private get file(): string {
    return path.join(this.dataDir, 'mind.json');
  }

  read(): Mind {
    try {
      if (!fs.existsSync(this.file)) return emptyMind();
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const prefs = parsed.preferences ?? {};
      return {
        personas: Array.isArray(parsed.personas) ? parsed.personas : [],
        memories: Array.isArray(parsed.memories) ? parsed.memories : [],
        recipes: Array.isArray(parsed.recipes) ? parsed.recipes : [],
        preferences: {
          adultContent: prefs.adultContent === true,
          ageVerified: prefs.ageVerified === true,
          verifiedAt: typeof prefs.verifiedAt === 'string' ? prefs.verifiedAt : undefined,
          birthYear: typeof prefs.birthYear === 'number' ? prefs.birthYear : undefined,
        },
      };
    } catch {
      // A corrupt file must not brick the app; start clean rather than crash.
      return emptyMind();
    }
  }

  private write(doc: Mind): void {
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(doc, null, 2), 'utf8');
  }

  /** The persona the agent speaks with. Only one is active at a time. */
  activePersona(): Persona | null {
    const list = this.read().personas;
    return list.length ? list[list.length - 1] : null;
  }

  savePersona(input: { id?: string; name: string; content: string }): Persona {
    const doc = this.read();
    const now = new Date().toISOString();
    const existing = input.id ? doc.personas.find((p) => p.id === input.id) : undefined;
    const persona: Persona = {
      id: existing?.id ?? randomUUID(),
      name: input.name.trim() || 'Trolly',
      content: input.content,
      updatedAt: now,
    };
    if (existing) {
      doc.personas = doc.personas.map((p) => (p.id === persona.id ? persona : p));
    } else {
      doc.personas.push(persona);
    }
    this.write(doc);
    return persona;
  }

  saveMemory(input: { id?: string; title: string; content: string; tags?: string[] }): Memory {
    const doc = this.read();
    const existing = input.id ? doc.memories.find((m) => m.id === input.id) : undefined;
    const memory: Memory = {
      id: existing?.id ?? randomUUID(),
      title: input.title.trim() || 'Untitled',
      content: input.content,
      tags: input.tags ?? existing?.tags ?? [],
      updatedAt: new Date().toISOString(),
    };
    if (existing) {
      doc.memories = doc.memories.map((m) => (m.id === memory.id ? memory : m));
    } else {
      doc.memories.push(memory);
    }
    this.write(doc);
    return memory;
  }

  deleteMemory(id: string): void {
    const doc = this.read();
    doc.memories = doc.memories.filter((m) => m.id !== id);
    this.write(doc);
  }

  saveRecipe(input: { id?: string; title: string; prompt: string }): Recipe {
    const doc = this.read();
    const existing = input.id ? doc.recipes.find((r) => r.id === input.id) : undefined;
    const recipe: Recipe = {
      id: existing?.id ?? randomUUID(),
      title: input.title.trim() || 'Untitled',
      prompt: input.prompt,
      updatedAt: new Date().toISOString(),
    };
    if (existing) {
      doc.recipes = doc.recipes.map((r) => (r.id === recipe.id ? recipe : r));
    } else {
      doc.recipes.push(recipe);
    }
    this.write(doc);
    return recipe;
  }

  deleteRecipe(id: string): void {
    const doc = this.read();
    doc.recipes = doc.recipes.filter((r) => r.id !== id);
    this.write(doc);
  }

  readPreferences(): Preferences {
    return this.read().preferences;
  }

  /**
   * Record the age confirmation. `birthYear` must put the user at or above
   * 18; a younger year is rejected outright and the gate stays shut.
   */
  verifyAge(birthYear: number): Preferences {
    const year = Number(birthYear);
    if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear()) {
      throw new Error('Enter a valid year of birth.');
    }
    const age = new Date().getFullYear() - year;
    if (age < 18) {
      throw new Error('This app is for adults only. The age check was not recorded.');
    }
    const doc = this.read();
    doc.preferences = {
      ...doc.preferences,
      ageVerified: true,
      verifiedAt: new Date().toISOString(),
      birthYear: year,
    };
    this.write(doc);
    return doc.preferences;
  }

  /** Turn adult content on or off. Cannot be enabled without age verification. */
  setAdultContent(enabled: boolean): Preferences {
    const doc = this.read();
    if (enabled && !doc.preferences.ageVerified) {
      throw new Error('Complete the age check before enabling adult content.');
    }
    doc.preferences = { ...doc.preferences, adultContent: enabled === true };
    this.write(doc);
    return doc.preferences;
  }

  /** Clear the age confirmation and switch adult content off with it. */
  resetVerification(): Preferences {
    const doc = this.read();
    doc.preferences = { adultContent: false, ageVerified: false };
    this.write(doc);
    return doc.preferences;
  }
}
