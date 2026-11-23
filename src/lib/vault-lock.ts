import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

const KEY_LEN = 32;
const FILE_MAGIC = Buffer.from('TROLLY-VLT-1\0', 'ascii');
const MIN_PASSWORD_LENGTH = 12;

export interface EncryptedVaultLock {
  version: 1;
  salt: string;
  hash: string;
  wrappedKey: string;
}

export interface LegacyVaultLock {
  salt: string;
  hash: string;
}

export function deriveVaultKey(password: string, salt: Buffer | string): Buffer {
  return scryptSync(String(password ?? ''), typeof salt === 'string' ? Buffer.from(salt, 'hex') : salt, KEY_LEN);
}

export function hashVaultPassword(password: string, salt = randomBytes(16)): { salt: string; hash: string } {
  const value = String(password ?? '');
  if (value.length < 4) throw new Error('Vault password must be at least 4 characters.');
  return { salt: salt.toString('hex'), hash: deriveVaultKey(value, salt).toString('hex') };
}

export function vaultPasswordMatches(password: string, saltHex: string, hashHex: string): boolean {
  if (!/^[\da-f]{32}$/i.test(saltHex) || !/^[\da-f]{64}$/i.test(hashHex)) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = deriveVaultKey(password, salt);
  return timingSafeEqual(actual, expected);
}

export function createVaultLock(
  password: string,
  vaultKey: Buffer,
  allowLegacyWeakPassword = false,
): EncryptedVaultLock {
  const value = String(password ?? '');
  if (!allowLegacyWeakPassword && value.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Vault password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (vaultKey.length !== KEY_LEN) throw new Error('Vault encryption key has an invalid length.');
  const salt = randomBytes(16);
  const passwordKey = deriveVaultKey(value, salt);
  return {
    version: 1,
    salt: salt.toString('hex'),
    hash: passwordKey.toString('hex'),
    wrappedKey: encryptVaultBytes(vaultKey, passwordKey).toString('base64'),
  };
}

export function unlockVaultKey(password: string, lock: EncryptedVaultLock): Buffer | null {
  if (!vaultPasswordMatches(password, lock.salt, lock.hash)) return null;
  try {
    return decryptVaultBytes(Buffer.from(lock.wrappedKey, 'base64'), deriveVaultKey(password, lock.salt));
  } catch {
    return null;
  }
}

export function isEncryptedVaultBytes(value: Uint8Array): boolean {
  return value.byteLength >= FILE_MAGIC.length &&
    Buffer.from(value).subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC);
}

export function encryptVaultBytes(value: Uint8Array, key: Buffer): Buffer {
  if (key.length !== KEY_LEN) throw new Error('Vault encryption key has an invalid length.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value), cipher.final()]);
  return Buffer.concat([FILE_MAGIC, iv, cipher.getAuthTag(), encrypted]);
}

export function decryptVaultBytes(value: Uint8Array, key: Buffer): Buffer {
  const bytes = Buffer.from(value);
  const headerLength = FILE_MAGIC.length + 12 + 16;
  if (!isEncryptedVaultBytes(bytes) || bytes.length < headerLength) {
    throw new Error('Vault file is not in the encrypted format.');
  }
  const ivOffset = FILE_MAGIC.length;
  const tagOffset = ivOffset + 12;
  const dataOffset = tagOffset + 16;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(ivOffset, tagOffset));
    decipher.setAuthTag(bytes.subarray(tagOffset, dataOffset));
    return Buffer.concat([decipher.update(bytes.subarray(dataOffset)), decipher.final()]);
  } catch {
    throw new Error('Vault file authentication failed; the data was not returned.');
  }
}
