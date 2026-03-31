import {
  deleteClip,
  getClipById,
  getSettingsMap,
  setSetting,
  type ClipRow,
} from '../database/db';
import {
  decryptVaultBlob,
  deleteAllVaultEntries,
  deriveVaultKey,
  getVaultCiphertext,
  hashVaultKeyForVerifier,
  insertVaultEntry,
  randomVaultSalt,
  rekeyAllVaultEntries,
  type VaultPayload,
  verifyVaultPin,
} from '../database/vault';

let sessionKey: Buffer | null = null;

export function vaultIsConfigured(): boolean {
  return getSettingsMap()['vaultConfigured'] === '1';
}

export function vaultIsUnlocked(): boolean {
  return sessionKey !== null;
}

export function vaultGetSessionKey(): Buffer | null {
  return sessionKey;
}

export function vaultLock(): void {
  sessionKey = null;
}

export function vaultSetup(pin: string): { ok: boolean; error?: string } {
  if (vaultIsConfigured()) {
    return { ok: false, error: 'Vault is already set up' };
  }
  const p = String(pin ?? '').trim();
  if (p.length < 4) {
    return { ok: false, error: 'PIN must be at least 4 characters' };
  }
  const salt = randomVaultSalt();
  const key = deriveVaultKey(p, salt);
  setSetting('vaultSalt', salt.toString('base64'));
  setSetting('vaultVerifier', hashVaultKeyForVerifier(key));
  setSetting('vaultConfigured', '1');
  sessionKey = key;
  return { ok: true };
}

export function vaultUnlock(pin: string): { ok: boolean; error?: string } {
  const s = getSettingsMap();
  if (s['vaultConfigured'] !== '1') {
    return { ok: false, error: 'Vault is not set up' };
  }
  const saltB64 = s['vaultSalt'] ?? '';
  const verifier = s['vaultVerifier'] ?? '';
  if (!saltB64 || !verifier) {
    return { ok: false, error: 'Vault data is missing' };
  }
  const key = verifyVaultPin(String(pin ?? ''), saltB64, verifier);
  if (!key) {
    return { ok: false, error: 'Wrong vault PIN' };
  }
  sessionKey = key;
  return { ok: true };
}

export function vaultChangePin(oldPin: string, newPin: string): { ok: boolean; error?: string } {
  const unlockRes = vaultUnlock(oldPin);
  if (!unlockRes.ok) {
    return unlockRes;
  }
  const oldKey = sessionKey!;
  const np = String(newPin ?? '').trim();
  if (np.length < 4) {
    return { ok: false, error: 'New PIN must be at least 4 characters' };
  }
  const salt = randomVaultSalt();
  const newKey = deriveVaultKey(np, salt);
  try {
    rekeyAllVaultEntries(oldKey, newKey);
  } catch {
    sessionKey = oldKey;
    return { ok: false, error: 'Could not re-encrypt vault entries' };
  }
  setSetting('vaultSalt', salt.toString('base64'));
  setSetting('vaultVerifier', hashVaultKeyForVerifier(newKey));
  sessionKey = newKey;
  return { ok: true };
}

export function vaultDisable(pin: string): { ok: boolean; error?: string } {
  const unlockRes = vaultUnlock(pin);
  if (!unlockRes.ok) {
    return unlockRes;
  }
  deleteAllVaultEntries();
  setSetting('vaultConfigured', '0');
  setSetting('vaultSalt', '');
  setSetting('vaultVerifier', '');
  sessionKey = null;
  return { ok: true };
}

export function tryAutoVaultSecretClip(row: ClipRow): boolean {
  const s = getSettingsMap();
  if (s['vaultAutoSecret'] !== '1' || row.type !== 'secret') {
    return false;
  }
  const key = sessionKey;
  if (!key) {
    return false;
  }
  if (!getClipById(row.id)) {
    return false;
  }
  const payload: VaultPayload = {
    content: row.content,
    source: row.source,
    tags_json: row.tags_json,
    metadata_json: row.metadata_json,
    migrated_from_clip_id: row.id,
  };
  insertVaultEntry(key, {
    type: row.type,
    title_hint: '',
    payload,
  });
  deleteClip(row.id);
  return true;
}

export function vaultAddFromClipId(
  clipId: number,
  titleHint: string
): { ok: boolean; error?: string; entryId?: number } {
  const key = sessionKey;
  if (!key) {
    return { ok: false, error: 'Unlock the vault first' };
  }
  const clip = getClipById(clipId);
  if (!clip) {
    return { ok: false, error: 'Clip not found' };
  }
  const payload: VaultPayload = {
    content: clip.content,
    source: clip.source,
    tags_json: clip.tags_json,
    metadata_json: clip.metadata_json,
    migrated_from_clip_id: clip.id,
  };
  const entryId = insertVaultEntry(key, {
    type: clip.type,
    title_hint: titleHint.trim(),
    payload,
  });
  const remove = getSettingsMap()['vaultRemoveFromHistoryOnAdd'] === '1';
  if (remove) {
    deleteClip(clipId);
  }
  return { ok: true, entryId };
}

export function vaultAddManual(
  type: string,
  titleHint: string,
  content: string
): { ok: boolean; error?: string; entryId?: number } {
  const key = sessionKey;
  if (!key) {
    return { ok: false, error: 'Unlock the vault first' };
  }
  if (!String(content ?? '').trim()) {
    return { ok: false, error: 'Content is empty' };
  }
  const payload: VaultPayload = {
    content,
    source: null,
    tags_json: '[]',
    metadata_json: '{}',
  };
  const entryId = insertVaultEntry(key, {
    type: type || 'text',
    title_hint: titleHint.trim(),
    payload,
  });
  return { ok: true, entryId };
}

export function vaultDecryptPayload(entryId: number): { ok: boolean; payload?: VaultPayload; error?: string } {
  const key = sessionKey;
  if (!key) {
    return { ok: false, error: 'Unlock the vault first' };
  }
  const blob = getVaultCiphertext(entryId);
  if (!blob) {
    return { ok: false, error: 'Entry not found' };
  }
  try {
    const json = decryptVaultBlob(key, blob);
    const payload = JSON.parse(json) as VaultPayload;
    return { ok: true, payload };
  } catch {
    return { ok: false, error: 'Could not decrypt (wrong key or corrupt data)' };
  }
}
