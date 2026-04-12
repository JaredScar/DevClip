import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'crypto';
import * as sodium from 'libsodium-wrappers';

const MAGIC_AES = Buffer.from('DCS1', 'ascii');
const MAGIC_SODIUM = Buffer.from('DCS2', 'ascii');

/** Ensure libsodium is ready (idempotent). */
async function initSodium(): Promise<void> {
  await sodium.ready;
}

/** Derive key with PBKDF2 (fallback compatibility). */
function deriveKeyPbkdf2(passphrase: string, salt: Buffer): Buffer {
  return pbkdf2Sync(passphrase, salt, 210_000, 32, 'sha256');
}

/** Derive key with Argon2id via libsodium (preferred). */
async function deriveKeyArgon2(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
  await initSodium();
  const opsLimit = sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE;
  const memLimit = sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE;
  return sodium.crypto_pwhash(
    32,
    passphrase,
    salt,
    opsLimit,
    memLimit,
    sodium.crypto_pwhash_ALG_ARGON2ID13
  );
}

/**
 * Encrypt sync envelope using XChaCha20-Poly1305 (libsodium) with Argon2id key derivation.
 * Format: DCS2 + salt(16) + nonce(24) + ciphertext + tag(16 inline via aead)
 */
export async function encryptSyncEnvelopeV2(plainUtf8: string, passphrase: string): Promise<string> {
  await initSodium();
  const salt = sodium.randombytes_buf(16);
  const key = await deriveKeyArgon2(passphrase, salt);
  const nonce = sodium.randombytes_buf(24); // XChaCha20 uses 24-byte nonce
  const plain = new TextEncoder().encode(plainUtf8);
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plain,
    null, // additional data
    null, // secret nonce (unused)
    nonce,
    key
  );
  const out = Buffer.concat([MAGIC_SODIUM, Buffer.from(salt), Buffer.from(nonce), Buffer.from(ciphertext)]);
  return out.toString('base64');
}

/**
 * Decrypt sync envelope supporting both v1 (AES-GCM) and v2 (XChaCha20-Poly1305).
 */
export async function decryptSyncEnvelope(b64: string, passphrase: string): Promise<string> {
  const raw = Buffer.from(String(b64).trim(), 'base64');
  if (raw.length < 4) {
    throw new Error('Invalid or corrupt sync payload');
  }
  const magic = raw.subarray(0, 4);

  // v2: libsodium XChaCha20-Poly1305
  if (magic.equals(MAGIC_SODIUM)) {
    if (raw.length < 4 + 16 + 24 + 16 + 1) {
      throw new Error('Invalid or corrupt v2 sync payload');
    }
    const salt = raw.subarray(4, 20);
    const nonce = raw.subarray(20, 44);
    const ciphertext = raw.subarray(44);
    const key = await deriveKeyArgon2(passphrase, new Uint8Array(salt));
    const decrypted = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      new Uint8Array(ciphertext),
      null,
      new Uint8Array(nonce),
      key
    );
    return new TextDecoder().decode(decrypted);
  }

  // v1: AES-256-GCM (Node crypto)
  if (magic.equals(MAGIC_AES)) {
    if (raw.length < 4 + 16 + 12 + 16 + 1) {
      throw new Error('Invalid or corrupt v1 sync payload');
    }
    const salt = raw.subarray(4, 20);
    const iv = raw.subarray(20, 32);
    const tag = raw.subarray(32, 48);
    const enc = raw.subarray(48);
    const key = deriveKeyPbkdf2(passphrase, salt);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(enc), decipher.final()]);
    return plain.toString('utf8');
  }

  throw new Error('Unknown sync payload format');
}

/** Legacy synchronous decrypt for backward compatibility. */
export function decryptSyncEnvelopeSync(b64: string, passphrase: string): string {
  const raw = Buffer.from(String(b64).trim(), 'base64');
  if (raw.length < 4) {
    throw new Error('Invalid or corrupt sync payload');
  }
  const magic = raw.subarray(0, 4);

  // v1: AES-256-GCM only for sync path
  if (magic.equals(MAGIC_AES)) {
    if (raw.length < 4 + 16 + 12 + 16 + 1) {
      throw new Error('Invalid or corrupt v1 sync payload');
    }
    const salt = raw.subarray(4, 20);
    const iv = raw.subarray(20, 32);
    const tag = raw.subarray(32, 48);
    const enc = raw.subarray(48);
    const key = deriveKeyPbkdf2(passphrase, salt);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(enc), decipher.final()]);
    return plain.toString('utf8');
  }

  throw new Error('Unknown sync payload format (v2 requires async decrypt)');
}

/**
 * Encrypt sync envelope (default to v2/XChaCha20-Poly1305).
 * This is the main export used by sync operations.
 */
export function encryptSyncEnvelope(plainUtf8: string, passphrase: string): Promise<string> {
  return encryptSyncEnvelopeV2(plainUtf8, passphrase);
}

/** Re-export init for apps that want to warm up libsodium early. */
export { initSodium };
