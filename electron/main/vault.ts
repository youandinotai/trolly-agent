import fs from 'node:fs';
import path from 'node:path';

import { hashVaultPassword, vaultPasswordMatches } from '../../src/lib/vault-lock.js';

interface LockFile {
  salt: string;
  hash: string;
}

/** Adult library lock. Starts locked every launch. Files stay outside the source tree. */
export class MediaVault {
  private unlocked = false;
  private readonly dir: string;
  private readonly sourceRoot: string;

  constructor(dir: string, sourceRoot = process.cwd()) {
    this.dir = path.resolve(dir);
    this.sourceRoot = fs.realpathSync(path.resolve(sourceRoot));
    this.assertOutsideSource(this.dir);
    if (fs.existsSync(this.dir)) this.assertOutsideSource(fs.realpathSync(this.dir));
  }

  private assertOutsideSource(candidate: string): void {
    const relative = path.relative(this.sourceRoot, path.resolve(candidate));
    if (!relative || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
      throw new Error('Vault must be outside the application source tree.');
    }
  }

  private ensureDataDir(): void {
    fs.mkdirSync(this.dir, { recursive: true });
    this.assertOutsideSource(fs.realpathSync(this.dir));
  }

  private ensureImagesDir(): string {
    this.ensureDataDir();
    const dir = this.imagesDir();
    fs.mkdirSync(dir, { recursive: true });
    const resolved = fs.realpathSync(dir);
    this.assertOutsideSource(resolved);
    return resolved;
  }

  private lockPath(): string {
    return path.join(this.dir, 'lock.json');
  }

  private imagesDir(): string {
    return path.join(this.dir, 'images');
  }

  private readLock(): LockFile | null {
    try {
      return JSON.parse(fs.readFileSync(this.lockPath(), 'utf8')) as LockFile;
    } catch {
      return null;
    }
  }

  status(): { hasPassword: boolean; unlocked: boolean } {
    return { hasPassword: !!this.readLock(), unlocked: this.unlocked };
  }

  lock(): { hasPassword: boolean; unlocked: boolean } {
    this.unlocked = false;
    return this.status();
  }

  setPassword(password: string): { hasPassword: boolean; unlocked: boolean } {
    if (this.readLock()) throw new Error('Vault already has a password. Change it instead.');
    const record = hashVaultPassword(password);
    this.ensureDataDir();
    fs.writeFileSync(this.lockPath(), JSON.stringify(record), { mode: 0o600 });
    this.unlocked = true;
    return this.status();
  }

  unlock(password: string): { hasPassword: boolean; unlocked: boolean } {
    const lock = this.readLock();
    if (!lock || !vaultPasswordMatches(password, lock.salt, lock.hash)) {
      this.unlocked = false;
      throw new Error('Vault password did not match.');
    }
    this.unlocked = true;
    return this.status();
  }

  changePassword(current: string, next: string): { hasPassword: boolean; unlocked: boolean } {
    this.unlock(current);
    const record = hashVaultPassword(next);
    this.ensureDataDir();
    fs.writeFileSync(this.lockPath(), JSON.stringify(record), { mode: 0o600 });
    this.unlocked = true;
    return this.status();
  }

  reset(password: string): { hasPassword: boolean; unlocked: boolean } {
    this.unlock(password);
    if (fs.existsSync(this.imagesDir())) {
      const images = fs.realpathSync(this.imagesDir());
      this.assertOutsideSource(images);
      fs.rmSync(images, { recursive: true, force: true });
    }
    fs.rmSync(this.lockPath(), { force: true });
    this.unlocked = false;
    return this.status();
  }

  list(): { name: string }[] {
    if (!this.unlocked) return [];
    if (!fs.existsSync(this.imagesDir())) return [];
    const dir = fs.realpathSync(this.imagesDir());
    this.assertOutsideSource(dir);
    return fs.readdirSync(dir)
      .filter((name) => /\.(png|jpe?g|webp|gif|mp4|webm)$/i.test(name))
      .map((name) => ({ name }));
  }

  add(name: string, dataBase64: string): { name: string } {
    if (!this.unlocked) throw new Error('Vault is locked.');
    const safe = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!/\.(png|jpe?g|webp|gif|mp4|webm)$/i.test(safe)) throw new Error('Only image or video files can enter the vault.');
    const bytes = Buffer.from(dataBase64, 'base64');
    if (bytes.length < 16 || bytes.length > 80 * 1024 * 1024) throw new Error('Vault file must be between 16 bytes and 80 MB.');
    const dest = path.join(this.ensureImagesDir(), `${Date.now()}-${safe}`);
    fs.writeFileSync(dest, bytes);
    return { name: path.basename(dest) };
  }

  read(name: string): { name: string; dataBase64: string } | null {
    if (!this.unlocked) return null;
    const images = this.imagesDir();
    if (!fs.existsSync(images)) return null;
    const dir = fs.realpathSync(images);
    this.assertOutsideSource(dir);
    const file = path.join(dir, path.basename(name));
    if (!fs.existsSync(file)) return null;
    return { name: path.basename(file), dataBase64: fs.readFileSync(file).toString('base64') };
  }

  remove(name: string): void {
    if (!this.unlocked) throw new Error('Vault is locked.');
    const images = this.imagesDir();
    if (!fs.existsSync(images)) return;
    const dir = fs.realpathSync(images);
    this.assertOutsideSource(dir);
    const file = path.join(dir, path.basename(name));
    if (fs.existsSync(file)) fs.rmSync(file);
  }
}
