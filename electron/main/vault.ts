import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  createVaultLock,
  decryptVaultBytes,
  deriveVaultKey,
  encryptVaultBytes,
  isEncryptedVaultBytes,
  unlockVaultKey,
  vaultPasswordMatches,
  type EncryptedVaultLock,
  type LegacyVaultLock,
} from '../../src/lib/vault-lock.ts';

type VaultLock = EncryptedVaultLock | (LegacyVaultLock & { version?: undefined });
type VaultIndex = Record<string, string>;

/** Adult library lock. Starts locked every launch. File contents and names are encrypted at rest. */
export class MediaVault {
  private unlocked = false;
  private encryptionKey: Buffer | null = null;
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

  private indexPath(): string {
    return path.join(this.imagesDir(), 'index.vault');
  }

  private readLock(): VaultLock | null {
    if (!fs.existsSync(this.lockPath())) return null;
    let parsed: any;
    try {
      parsed = JSON.parse(fs.readFileSync(this.lockPath(), 'utf8'));
    } catch {
      throw new Error('Vault lock file is unreadable; the Vault remains locked.');
    }
    if (
      parsed?.version === 1 &&
      typeof parsed.salt === 'string' &&
      typeof parsed.hash === 'string' &&
      typeof parsed.wrappedKey === 'string'
    ) return parsed as EncryptedVaultLock;
    if (typeof parsed?.salt === 'string' && typeof parsed?.hash === 'string') {
      return { salt: parsed.salt, hash: parsed.hash };
    }
    throw new Error('Vault lock file has an unsupported format; the Vault remains locked.');
  }

  status(): { hasPassword: boolean; unlocked: boolean; encryptionVersion: 0 | 1 | null } {
    const lock = this.readLock();
    return {
      hasPassword: !!lock,
      unlocked: this.unlocked,
      encryptionVersion: lock ? (lock.version === 1 ? 1 : 0) : null,
    };
  }

  lock(): { hasPassword: boolean; unlocked: boolean; encryptionVersion: 0 | 1 | null } {
    this.encryptionKey?.fill(0);
    this.encryptionKey = null;
    this.unlocked = false;
    return this.status();
  }

  setPassword(password: string): { hasPassword: boolean; unlocked: boolean; encryptionVersion: 0 | 1 | null } {
    if (this.readLock()) throw new Error('Vault already has a password. Change it instead.');
    const key = randomBytes(32);
    this.ensureDataDir();
    fs.writeFileSync(this.lockPath(), JSON.stringify(createVaultLock(password, key)), { mode: 0o600 });
    this.encryptionKey = key;
    this.unlocked = true;
    try {
      this.migratePlaintextFiles(key);
    } catch (error) {
      this.lock();
      throw new Error(`Vault files could not all be encrypted. The Vault was locked; try unlocking again. ${String(error)}`);
    }
    return this.status();
  }

  unlock(
    password: string,
    confirmMigration = false,
  ): { hasPassword: boolean; unlocked: boolean; encryptionVersion: 0 | 1 | null } {
    this.lock();
    const lock = this.readLock();
    if (!lock) throw new Error('Vault password did not match.');
    const legacy = lock.version !== 1;
    const key = legacy
      ? vaultPasswordMatches(password, lock.salt, lock.hash) ? deriveVaultKey(password, lock.salt) : null
      : unlockVaultKey(password, lock);
    if (!key) throw new Error('Vault password did not match or the lock file is damaged.');
    if (legacy && !confirmMigration) {
      throw new Error('This Vault uses legacy unencrypted files. Confirm the encryption migration before unlocking.');
    }

    this.encryptionKey = key;
    this.unlocked = true;
    try {
      this.migratePlaintextFiles(key);
      if (legacy) {
        fs.writeFileSync(this.lockPath(), JSON.stringify(createVaultLock(password, key, true)), { mode: 0o600 });
      }
    } catch (error) {
      this.lock();
      throw new Error(`Vault encryption could not be completed. The Vault remains locked; retry the migration. ${String(error)}`);
    }
    return this.status();
  }

  changePassword(
    current: string,
    next: string,
    confirmMigration = false,
  ): { hasPassword: boolean; unlocked: boolean; encryptionVersion: 0 | 1 | null } {
    this.unlock(current, confirmMigration);
    const key = this.requireEncryptionKey();
    fs.writeFileSync(this.lockPath(), JSON.stringify(createVaultLock(next, key)), { mode: 0o600 });
    return this.status();
  }

  reset(password: string): { hasPassword: boolean; unlocked: boolean; encryptionVersion: 0 | 1 | null } {
    const lock = this.readLock();
    const key = lock?.version === 1
      ? unlockVaultKey(password, lock)
      : lock && vaultPasswordMatches(password, lock.salt, lock.hash)
        ? deriveVaultKey(password, lock.salt)
        : null;
    if (!key) {
      this.lock();
      throw new Error('Vault password did not match or the lock file is damaged.');
    }
    if (fs.existsSync(this.imagesDir())) {
      const images = fs.realpathSync(this.imagesDir());
      this.assertOutsideSource(images);
      fs.rmSync(images, { recursive: true, force: true });
    }
    fs.rmSync(this.lockPath(), { force: true });
    this.lock();
    return this.status();
  }

  list(): { id: string; name: string }[] {
    if (!this.unlocked) return [];
    const key = this.requireEncryptionKey();
    return Object.entries(this.readIndex(key)).map(([id, name]) => ({ id, name }));
  }

  add(name: string, dataBase64: string): { id: string; name: string } {
    if (!this.unlocked) throw new Error('Vault is locked.');
    const key = this.requireEncryptionKey();
    const safe = this.safeName(name);
    if (!/\.(png|jpe?g|webp|gif|mp4|webm)$/i.test(safe)) {
      throw new Error('Only image or video files can enter the Vault.');
    }
    const bytes = Buffer.from(dataBase64, 'base64');
    if (bytes.length < 16 || bytes.length > 80 * 1024 * 1024) {
      throw new Error('Vault file must be between 16 bytes and 80 MB.');
    }
    const id = randomUUID();
    const dir = this.ensureImagesDir();
    const file = path.join(dir, `${id}.vault`);
    this.writeEncryptedFile(file, bytes, key);
    try {
      const index = this.readIndex(key);
      index[id] = safe;
      this.writeIndex(index, key);
    } catch (error) {
      fs.rmSync(file, { force: true });
      throw error;
    }
    return { id, name: safe };
  }

  read(id: string): { id: string; name: string; dataBase64: string } | null {
    if (!this.unlocked) return null;
    const key = this.requireEncryptionKey();
    const name = this.readIndex(key)[id];
    if (!name) return null;
    const file = path.join(this.ensureImagesDir(), `${id}.vault`);
    if (!fs.existsSync(file) || !fs.lstatSync(file).isFile()) return null;
    const bytes = fs.readFileSync(file);
    const clear = isEncryptedVaultBytes(bytes) ? decryptVaultBytes(bytes, key) : bytes;
    if (!isEncryptedVaultBytes(bytes)) this.writeEncryptedFile(file, bytes, key);
    return { id, name, dataBase64: clear.toString('base64') };
  }

  remove(id: string): void {
    if (!this.unlocked) throw new Error('Vault is locked.');
    const key = this.requireEncryptionKey();
    const index = this.readIndex(key);
    if (!index[id]) return;
    delete index[id];
    this.writeIndex(index, key);
    fs.rmSync(path.join(this.ensureImagesDir(), `${id}.vault`), { force: true });
  }

  private requireEncryptionKey(): Buffer {
    if (!this.encryptionKey) throw new Error('Vault is locked.');
    return this.encryptionKey;
  }

  private safeName(name: string): string {
    return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  private readIndex(key: Buffer): VaultIndex {
    const file = this.indexPath();
    if (!fs.existsSync(file)) return {};
    const bytes = fs.readFileSync(file);
    let parsed: unknown;
    try {
      parsed = JSON.parse(decryptVaultBytes(bytes, key).toString('utf8'));
    } catch (error) {
      throw new Error(`Vault index could not be decrypted or parsed. ${String(error)}`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Vault index has an invalid format.');
    }
    const index: VaultIndex = {};
    for (const [id, name] of Object.entries(parsed)) {
      if (!/^[\da-f-]{36}$/i.test(id) || typeof name !== 'string' || path.basename(name) !== name) {
        throw new Error('Vault index contains an invalid entry.');
      }
      index[id] = name;
    }
    return index;
  }

  private writeIndex(index: VaultIndex, key: Buffer): void {
    const dir = this.ensureImagesDir();
    this.writeEncryptedFile(this.indexPath(), Buffer.from(JSON.stringify(index), 'utf8'), key);
  }

  private writeEncryptedFile(file: string, bytes: Uint8Array, key: Buffer): void {
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temp, encryptVaultBytes(bytes, key), { mode: 0o600 });
      fs.renameSync(temp, file);
    } finally {
      fs.rmSync(temp, { force: true });
    }
  }

  private migratePlaintextFiles(key: Buffer): void {
    const images = this.imagesDir();
    if (!fs.existsSync(images)) return;
    const dir = fs.realpathSync(images);
    this.assertOutsideSource(dir);
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || entry.name === 'index.vault' || entry.name.endsWith('.vault')) continue;
      const original = path.join(dir, entry.name);
      const id = createHmac('sha256', key).update(entry.name).digest('hex').slice(0, 36);
      const target = path.join(dir, `${id}.vault`);
      const clear = fs.readFileSync(original);
      this.writeEncryptedFile(target, clear, key);
      const index = this.readIndex(key);
      index[id] = this.safeName(entry.name.replace(/^\d+-/, ''));
      this.writeIndex(index, key);
      fs.rmSync(original, { force: true });
    }
  }
}
