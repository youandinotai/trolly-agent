import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LEN = 32;

export function hashVaultPassword(password: string, salt = randomBytes(16)): { salt: string; hash: string } {
  const value = String(password ?? '');
  if (value.length < 4) throw new Error('Vault password must be at least 4 characters.');
  const hash = scryptSync(value, salt, KEY_LEN);
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}

export function vaultPasswordMatches(password: string, saltHex: string, hashHex: string): boolean {
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(String(password ?? ''), salt, expected.length);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
