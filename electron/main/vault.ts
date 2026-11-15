import fs from 'node:fs';
import path from 'node:path';

import { hashVaultPassword, vaultPasswordMatches } from '../../src/lib/vault-lock.js';

interface LockFile {
  salt: string;
  hash: string;
}

/** Adult library lock. Starts locked every launch. Files stay on D:, outside the repo. */
export class MediaVault {
  private unlocked = false;

  constructor(private readonly dir: string) {
    if (!/^d:/i.test(path.resolve(dir))) throw new Error('Vault must live on D:.');
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
    fs.mkdirSync(this.dir, { recursive: true });
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
    fs.writeFileSync(this.lockPath(), JSON.stringify(record), { mode: 0o600 });
    this.unlocked = true;
    return this.status();
  }

  reset(password: string): { hasPassword: boolean; unlocked: boolean } {
    this.unlock(password);
    fs.rmSync(this.imagesDir(), { recursive: true, force: true });
    fs.rmSync(this.lockPath(), { force: true });
    this.unlocked = false;
    return this.status();
  }

  list(): { name: string }[] {
    if (!this.unlocked) return [];
    const dir = this.imagesDir();
    if (!fs.existsSync(dir)) return [];
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
    fs.mkdirSync(this.imagesDir(), { recursive: true });
    const dest = path.join(this.imagesDir(), `${Date.now()}-${safe}`);
    fs.writeFileSync(dest, bytes);
    return { name: path.basename(dest) };
  }

  read(name: string): { name: string; dataBase64: string } | null {
    if (!this.unlocked) return null;
    const file = path.join(this.imagesDir(), path.basename(name));
    if (!file.startsWith(this.imagesDir())) return null;
    if (!fs.existsSync(file)) return null;
    return { name: path.basename(file), dataBase64: fs.readFileSync(file).toString('base64') };
  }

  remove(name: string): void {
    if (!this.unlocked) throw new Error('Vault is locked.');
    const file = path.join(this.imagesDir(), path.basename(name));
    if (fs.existsSync(file)) fs.rmSync(file);
  }
}
