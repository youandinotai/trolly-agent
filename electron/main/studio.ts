import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import type { NewActor, NewGarment, NewScene, StudioActor, StudioDoc, StudioGarment, StudioScene } from '../../src/lib/studio-types.js';
import { WARDROBE_CATALOG } from '../../src/lib/wardrobe-catalog.ts';

const CATEGORIES = new Set(['hat', 'top', 'dress', 'bikini', 'underwear', 'shoes']);

/** One-of-one local admin store. All uploads and records stay outside source trees. */
export class StudioStore {
  private readonly dataDir: string;
  private readonly assetsDir: string;

  constructor(dataDir: string, options: { seedDefaults?: boolean } = {}) {
    // Validate lexically first so a rejected path never creates a directory.
    const lexical = path.resolve(dataDir);
    if (!/^d:/i.test(lexical)) throw new Error('Studio data must be on the D: drive.');
    const sourceRoot = fs.realpathSync(path.resolve('D:/Trolly/app'));
    const outsideSource = (candidate: string) => {
      const relative = path.relative(sourceRoot, candidate);
      return !relative || (!relative.startsWith('..') && !path.isAbsolute(relative));
    };
    if (outsideSource(lexical)) throw new Error('Studio data must be outside the application source tree.');
    fs.mkdirSync(lexical, { recursive: true });
    // Canonical check: a junction cannot silently redirect the store to C:.
    const resolved = fs.realpathSync(lexical);
    if (!/^d:/i.test(resolved) || outsideSource(resolved)) {
      throw new Error('Studio data must resolve to a real D: location outside the application source tree.');
    }
    this.dataDir = resolved;
    this.assetsDir = path.join(resolved, 'assets');
    fs.mkdirSync(this.assetsDir, { recursive: true });
    this.assetsDir = fs.realpathSync(this.assetsDir);
    if (options.seedDefaults !== false) this.seedDefaults();
  }

  private get file(): string { return path.join(this.dataDir, 'studio.json'); }

  read(): StudioDoc {
    if (!fs.existsSync(this.file)) return { actors: [], garments: [], scenes: [], activeActorId: null };
    let parsed: any;
    try {
      parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      // Never let a corrupt file be silently overwritten: preserve it first.
      const backup = `${this.file}.corrupt-${Date.now()}.json`;
      try { fs.copyFileSync(this.file, backup); } catch { /* preserve nothing if unreadable */ }
      return { actors: [], garments: [], scenes: [], activeActorId: null };
    }
    const garments = Array.isArray(parsed.garments) ? parsed.garments : [];
    const known = new Set(garments.map((item: { id?: string }) => item.id).filter(Boolean));
    const actors = (Array.isArray(parsed.actors) ? parsed.actors : []).map((actor: StudioActor) => ({
      ...actor,
      garmentIds: (actor.garmentIds ?? []).filter((id) => known.has(id)),
    }));
    const doc = {
      actors,
      garments,
      scenes: Array.isArray(parsed.scenes) ? parsed.scenes : [],
      activeActorId: typeof parsed.activeActorId === 'string' ? parsed.activeActorId : null,
    };
    const hadGhosts = (parsed.actors ?? []).some((actor: StudioActor) =>
      (actor.garmentIds ?? []).some((id) => !known.has(id)),
    );
    if (hadGhosts) this.write(doc);
    return doc;
  }

  private write(doc: StudioDoc): void {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const tmp = `${this.file}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(doc, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }

  saveGarment(input: NewGarment): StudioGarment {
    if (!CATEGORIES.has(input.category)) throw new Error('Unknown wardrobe category.');
    if (!input.name?.trim()) throw new Error('Garment name is required.');
    const doc = this.read();
    const existing = doc.garments.find((item) => !input.id && item.name.toLowerCase() === input.name.trim().toLowerCase() && item.category === input.category);
    const record: StudioGarment = {
      id: input.id ?? existing?.id ?? randomUUID(), name: input.name.trim(), category: input.category,
      color: input.color, scale: Math.max(0.25, Math.min(4, Number(input.scale) || 1)),
      imageUrl: input.imageUrl,
    };
    doc.garments = [...doc.garments.filter((item) => item.id !== record.id), record];
    this.write(doc);
    return record;
  }

  saveScene(input: NewScene): StudioScene {
    if (!input.name?.trim()) throw new Error('Scene name is required.');
    const doc = this.read();
    const record: StudioScene = {
      id: input.id ?? randomUUID(), name: input.name.trim(), background: input.background,
      accent: input.accent, lightIntensity: Math.max(0.2, Math.min(3, Number(input.lightIntensity) || 1)),
      imageUrl: input.imageUrl,
    };
    doc.scenes = [...doc.scenes.filter((item) => item.id !== record.id), record];
    this.write(doc);
    return record;
  }

  saveActor(input: NewActor): StudioActor {
    if (!input.name?.trim()) throw new Error('Actor name is required.');
    const doc = this.read();
    const record: StudioActor = {
      id: input.id ?? randomUUID(), name: input.name.trim(), role: input.role === 'actor' ? 'actor' : 'actress',
      modelPath: input.modelPath, hair: { ...input.hair }, smile: Math.max(0, Math.min(1, Number(input.smile) || 0)),
      garmentIds: [...new Set(input.garmentIds ?? [])], sceneId: input.sceneId,
    };
    doc.actors = [...doc.actors.filter((item) => item.id !== record.id), record];
    doc.activeActorId = record.id;
    this.write(doc);
    return record;
  }

  uploadAsset(input: { name: string; dataBase64: string; kind: 'image' | 'model' }): { path: string; url: string; name: string } {
    const bytes = Buffer.from(input.dataBase64 ?? '', 'base64');
    const extension = path.extname(input.name).toLowerCase();
    if (input.kind === 'image') {
      if (!['.png', '.jpg', '.jpeg'].includes(extension)) throw new Error('Image uploads must be PNG or JPEG.');
      if (!bytes.length || bytes.byteLength > 20 * 1024 * 1024) throw new Error('Image must be between 1 byte and 20 MB.');
      const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
      const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
      if (!png && !jpeg) throw new Error('Image upload is not a PNG or JPEG.');
    } else {
      if (!['.vrm', '.glb'].includes(extension)) throw new Error('Avatar uploads must be VRM or GLB.');
      if (!bytes.length || bytes.byteLength > 300 * 1024 * 1024) throw new Error('Avatar must be between 1 byte and 300 MB.');
      if (bytes.toString('ascii', 0, 4) !== 'glTF') throw new Error('Avatar is not a valid glTF/VRM binary.');
    }
    fs.mkdirSync(this.assetsDir, { recursive: true });
    const filename = `${randomUUID()}${extension}`;
    const file = path.join(this.assetsDir, filename);
    fs.writeFileSync(file, bytes);
    return { path: file, url: pathToFileURL(file).href, name: filename };
  }

  readAsset(filePath: string): { name: string; dataBase64: string } {
    // Canonical comparison: a junction inside the store cannot escape it.
    // A missing file falls back to the lexical path so a moved store reports
    // "outside" instead of crashing with ENOENT.
    let resolved: string;
    try {
      resolved = fs.realpathSync(path.resolve(filePath));
    } catch {
      resolved = path.resolve(filePath);
    }
    const relative = path.relative(this.assetsDir, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Asset path is outside the studio store.');
    return { name: path.basename(resolved), dataBase64: fs.readFileSync(resolved).toString('base64') };
  }

  private seedDefaults(): void {
    const doc = this.read();
    const neon = doc.scenes.find((item) => item.id === 'scene-neon') ?? this.saveScene({ id: 'scene-neon', name: 'Neon Midnight', background: '#0d0714', accent: '#67e8f9', lightIntensity: 1.2 });
    if (!doc.scenes.some((item) => item.id === 'scene-soft')) this.saveScene({ id: 'scene-soft', name: 'Soft Studio', background: '#202733', accent: '#ffd7e0', lightIntensity: 1 });
    for (const pick of WARDROBE_CATALOG) {
      if (!doc.garments.some((item) => item.id === pick.id)) {
        this.saveGarment({ id: pick.id, name: pick.name, category: pick.category, color: pick.color, scale: 1 });
      }
    }
    if (doc.actors.length) return;

    let modelPath = '';
    const source = 'D:/sow/app-w64/Soul-of-Waifu-v2.5.1/assets/emotions/vrm/AvatarSample_K.vrm';
    if (fs.existsSync(source)) {
      fs.mkdirSync(this.assetsDir, { recursive: true });
      modelPath = path.join(this.assetsDir, 'trolly-base.vrm');
      if (!fs.existsSync(modelPath)) fs.copyFileSync(source, modelPath);
    }
    this.saveActor({
      id: 'actor-trolly', name: 'Trolly', role: 'actress', modelPath,
      hair: { color: '#dff4ff', length: 1, volume: 1 }, smile: 0.25,
      garmentIds: ['garment-bikini'], sceneId: neon.id,
    });
  }
}
