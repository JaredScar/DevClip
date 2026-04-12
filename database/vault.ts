import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'crypto';
import { getDb } from './db';

const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;
const SCRYPT_SALT_LEN = 16;

export interface VaultEntryMeta {
  id: number;
  created_at: number;
  type: string;
  title_hint: string;
}

export interface VaultPayload {
  content: string;
  source: string | null;
  tags_json: string;
  metadata_json: string;
  migrated_from_clip_id?: number;
}

export function randomVaultSalt(): Buffer {
  return randomBytes(SCRYPT_SALT_LEN);
}

export function deriveVaultKey(pin: string, salt: Buffer): Buffer {
  return scryptSync(Buffer.from(pin, 'utf8'), salt, KEY_LEN);
}

export function hashVaultKeyForVerifier(key: Buffer): string {
  return createHash('sha256').update(key).digest('hex');
}

/** Returns derived key if PIN matches stored verifier; otherwise null. */
export function verifyVaultPin(pin: string, saltB64: string, verifierHex: string): Buffer | null {
  const salt = Buffer.from(saltB64, 'base64');
  if (salt.length !== SCRYPT_SALT_LEN) return null;
  const key = deriveVaultKey(pin, salt);
  const h = hashVaultKeyForVerifier(key);
  const a = Buffer.from(h, 'hex');
  const b = Buffer.from(verifierHex, 'hex');
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? key : null;
}

export function encryptVaultBlob(key: Buffer, jsonUtf8: string): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(jsonUtf8, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}

export function decryptVaultBlob(key: Buffer, blob: Buffer): string {
  if (blob.length < IV_LEN + TAG_LEN + 1) {
    throw new Error('Invalid vault blob');
  }
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export interface VaultSyncEntry {
  sync_uid: string;
  created_at: number;
  type: string;
  title_hint: string;
  payload: VaultPayload;
}

export function insertVaultEntry(
  key: Buffer,
  input: { type: string; title_hint: string; payload: VaultPayload }
): number {
  const db = getDb();
  const json = JSON.stringify(input.payload);
  const ct = encryptVaultBlob(key, json);
  const uid = randomUUID();
  const r = db
    .prepare(`INSERT INTO vault_entries (type, title_hint, ciphertext, sync_uid) VALUES (?, ?, ?, ?)`)
    .run(input.type, input.title_hint, ct, uid);
  return Number(r.lastInsertRowid);
}

/** Returns all vault entries decrypted as sync-ready objects. Requires the session key. */
export function exportVaultEntriesForSync(key: Buffer): VaultSyncEntry[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT id, created_at, type, title_hint, ciphertext, sync_uid FROM vault_entries ORDER BY created_at ASC`)
    .all() as { id: number; created_at: number; type: string; title_hint: string; ciphertext: Buffer; sync_uid: string | null }[];

  const result: VaultSyncEntry[] = [];
  for (const row of rows) {
    try {
      const json = decryptVaultBlob(key, Buffer.from(row.ciphertext));
      const payload = JSON.parse(json) as VaultPayload;
      let uid = row.sync_uid?.trim();
      if (!uid) {
        uid = randomUUID();
        db.prepare(`UPDATE vault_entries SET sync_uid = ? WHERE id = ?`).run(uid, row.id);
      }
      result.push({ sync_uid: uid, created_at: row.created_at, type: row.type, title_hint: row.title_hint, payload });
    } catch {
      // skip entries we can't decrypt (shouldn't happen if key is correct)
    }
  }
  return result;
}

/** Upserts a vault entry from a sync bundle; no-ops if sync_uid already exists. */
export function upsertVaultEntryFromSync(
  key: Buffer,
  entry: VaultSyncEntry
): void {
  const db = getDb();
  const existing = db
    .prepare(`SELECT id FROM vault_entries WHERE sync_uid = ?`)
    .get(entry.sync_uid) as { id: number } | undefined;
  if (existing) return;
  const json = JSON.stringify(entry.payload);
  const ct = encryptVaultBlob(key, json);
  db.prepare(
    `INSERT INTO vault_entries (type, title_hint, ciphertext, sync_uid, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(entry.type, entry.title_hint, ct, entry.sync_uid, entry.created_at);
}

export function listVaultEntryMeta(): VaultEntryMeta[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, created_at, type, title_hint FROM vault_entries ORDER BY created_at DESC`
    )
    .all() as VaultEntryMeta[];
}

export function getVaultCiphertext(id: number): Buffer | null {
  const db = getDb();
  const row = db.prepare('SELECT ciphertext FROM vault_entries WHERE id = ?').get(id) as
    | { ciphertext: Buffer }
    | undefined;
  return row ? Buffer.from(row.ciphertext) : null;
}

export function deleteVaultEntry(id: number): void {
  getDb().prepare('DELETE FROM vault_entries WHERE id = ?').run(id);
}

export function deleteAllVaultEntries(): void {
  getDb().prepare('DELETE FROM vault_entries').run();
}

export function countVaultEntries(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS c FROM vault_entries').get() as { c: number };
  return Number(row.c) || 0;
}

export function rekeyAllVaultEntries(oldKey: Buffer, newKey: Buffer): void {
  const db = getDb();
  const txn = db.transaction(() => {
    const rows = db.prepare('SELECT id, ciphertext FROM vault_entries').all() as {
      id: number;
      ciphertext: Buffer;
    }[];
    const upd = db.prepare('UPDATE vault_entries SET ciphertext = ? WHERE id = ?');
    for (const r of rows) {
      const plain = decryptVaultBlob(oldKey, Buffer.from(r.ciphertext));
      upd.run(encryptVaultBlob(newKey, plain), r.id);
    }
  });
  txn();
}
