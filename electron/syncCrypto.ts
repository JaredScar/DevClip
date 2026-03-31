import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'crypto';

const MAGIC = Buffer.from('DCS1', 'ascii');

/** AES-256-GCM + PBKDF2 — passphrase never stored; derive key locally only. */
export function encryptSyncEnvelope(plainUtf8: string, passphrase: string): string {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(passphrase, salt, 210_000, 32, 'sha256');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plainUtf8, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const out = Buffer.concat([MAGIC, salt, iv, tag, enc]);
  return out.toString('base64');
}

export function decryptSyncEnvelope(b64: string, passphrase: string): string {
  const raw = Buffer.from(String(b64).trim(), 'base64');
  if (raw.length < 4 + 16 + 12 + 16 + 1 || !raw.subarray(0, 4).equals(MAGIC)) {
    throw new Error('Invalid or corrupt sync payload');
  }
  const salt = raw.subarray(4, 20);
  const iv = raw.subarray(20, 32);
  const tag = raw.subarray(32, 48);
  const enc = raw.subarray(48);
  const key = pbkdf2Sync(passphrase, salt, 210_000, 32, 'sha256');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(enc), decipher.final()]);
  return plain.toString('utf8');
}
