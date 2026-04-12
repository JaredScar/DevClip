import { dialog, net } from 'electron';
import * as fs from 'fs';
import { getDb, getSettingsMap, setSetting } from '../database/db';
import {
  applySyncBundleToDb,
  buildSyncBundleFromDb,
  mergeSyncBundles,
  parseSyncBundleJson,
  persistMergedDevicesJson,
  syncOutboxCount,
  syncOutboxList,
  syncOutboxRecordFailure,
  syncOutboxRemove,
  syncOutboxEnqueue,
  parseSyncCategories,
  type SyncBundleV1,
} from '../database/syncData';
import { decryptSyncEnvelope, encryptSyncEnvelope } from './syncCrypto';
import { appendAuditEvent } from '../database/audit';
import { exportVaultEntriesForSync } from '../database/vault';
import { vaultGetSessionKey } from './vaultSession';

const FETCH_MS = 45_000;

function tierAllowsSync(): boolean {
  try {
    const row = getDb().prepare('SELECT tier FROM license WHERE id = 1').get() as { tier: string } | undefined;
    const t = row?.tier ?? 'free';
    if (t !== 'pro' && t !== 'enterprise') return false;
    if (t === 'enterprise' && getSettingsMap()['enterprisePolicyDisableSync'] === '1') {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function isUrlAllowed(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

async function httpGetText(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const t = await r.text();
    return t.trim() ? t : null;
  } finally {
    clearTimeout(timer);
  }
}

async function httpPutText(url: string, body: string): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const r = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body,
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  } finally {
    clearTimeout(timer);
  }
}

export function getSyncStatus(): {
  tierOk: boolean;
  enabled: boolean;
  remoteUrl: string;
  lastSyncAt: string;
  lastError: string;
  pendingOutbox: number;
  online: boolean;
  deviceCount: number;
  categoriesJson: string;
} {
  const s = getSettingsMap();
  let deviceCount = 0;
  try {
    const devs = JSON.parse(s['syncDevicesJson'] || '{}') as Record<string, unknown>;
    deviceCount = Object.keys(devs).length;
  } catch {
    deviceCount = 0;
  }
  return {
    tierOk: tierAllowsSync(),
    enabled: s['syncEnabled'] === '1',
    remoteUrl: s['syncRemoteUrl'] ?? '',
    lastSyncAt: s['syncLastSyncAt'] ?? '',
    lastError: s['syncLastError'] ?? '',
    pendingOutbox: syncOutboxCount(),
    online: net.isOnline(),
    deviceCount,
    categoriesJson: s['syncCategoriesJson'] ?? '{}',
  };
}

export function saveSyncConfig(patch: Record<string, string>): void {
  for (const [k, v] of Object.entries(patch)) {
    if (k.startsWith('sync')) {
      setSetting(k, v);
    }
  }
}

function attachVaultToBundle(bundle: SyncBundleV1): SyncBundleV1 {
  const cat = parseSyncCategories(getSettingsMap()['syncCategoriesJson']);
  if (!cat.vault) return bundle;
  const vaultKey = vaultGetSessionKey();
  if (!vaultKey) return bundle;
  try {
    const entries = exportVaultEntriesForSync(vaultKey);
    if (entries.length) {
      return { ...bundle, vault: entries };
    }
  } catch {
    // vault export failed — skip silently
  }
  return bundle;
}

function finishSyncOk(): void {
  const now = new Date().toISOString();
  setSetting('syncLastSyncAt', now);
  setSetting('syncLastError', '');
  appendAuditEvent({ category: 'sync', action: 'merge_push_ok', detail: { at: now } });
}

function finishSyncErr(msg: string): void {
  setSetting('syncLastError', msg.slice(0, 500));
}

export async function runSyncPush(passphrase: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!tierAllowsSync()) {
    return { ok: false, error: 'Cloud sync requires a Pro or Enterprise license.' };
  }
  const pw = String(passphrase ?? '');
  if (pw.length < 8) {
    return { ok: false, error: 'Passphrase must be at least 8 characters.' };
  }
  const s = getSettingsMap();
  if (s['syncEnabled'] !== '1') {
    return { ok: false, error: 'Enable sync first.' };
  }
  const url = (s['syncRemoteUrl'] ?? '').trim();
  if (!url || !isUrlAllowed(url)) {
    return { ok: false, error: 'Set a valid http(s) sync URL (e.g. presigned PUT/GET endpoint).' };
  }
  try {
    const localPlain = attachVaultToBundle(buildSyncBundleFromDb());
    let remotePlain: ReturnType<typeof parseSyncBundleJson> | null = null;
    const remoteB64 = await httpGetText(url);
    if (remoteB64?.trim()) {
      try {
        remotePlain = parseSyncBundleJson(decryptSyncEnvelope(remoteB64, pw));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, error: `Remote blob exists but could not decrypt (wrong passphrase?): ${msg}` };
      }
    }
    const merged = remotePlain ? mergeSyncBundles(localPlain, remotePlain) : localPlain;
    applySyncBundleToDb(merged, vaultGetSessionKey());
    persistMergedDevicesJson(merged);
    const mergedJson = JSON.stringify(merged);
    const enc = encryptSyncEnvelope(mergedJson, pw);
    try {
      await httpPutText(url, enc);
    } catch (e) {
      syncOutboxEnqueue(enc);
      const msg = e instanceof Error ? e.message : String(e);
      finishSyncErr(`Queued offline: ${msg}`);
      return { ok: false, error: `Upload failed; queued for retry. ${msg}` };
    }
    finishSyncOk();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    finishSyncErr(msg);
    return { ok: false, error: msg };
  }
}

export async function runSyncPull(passphrase: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!tierAllowsSync()) {
    return { ok: false, error: 'Cloud sync requires a Pro or Enterprise license.' };
  }
  const pw = String(passphrase ?? '');
  if (pw.length < 8) {
    return { ok: false, error: 'Passphrase must be at least 8 characters.' };
  }
  const s = getSettingsMap();
  const url = (s['syncRemoteUrl'] ?? '').trim();
  if (!url || !isUrlAllowed(url)) {
    return { ok: false, error: 'Set a valid http(s) sync URL.' };
  }
  try {
    const remoteB64 = await httpGetText(url);
    if (!remoteB64) {
      return { ok: false, error: 'Nothing at remote URL (empty or 404).' };
    }
    const remotePlain = parseSyncBundleJson(decryptSyncEnvelope(remoteB64, pw));
    const localPlain = attachVaultToBundle(buildSyncBundleFromDb());
    const merged = mergeSyncBundles(localPlain, remotePlain);
    applySyncBundleToDb(merged, vaultGetSessionKey());
    persistMergedDevicesJson(merged);
    const mergedJson = JSON.stringify(merged);
    const enc = encryptSyncEnvelope(mergedJson, pw);
    try {
      await httpPutText(url, enc);
    } catch {
      syncOutboxEnqueue(enc);
    }
    finishSyncOk();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    finishSyncErr(msg);
    return { ok: false, error: msg };
  }
}

export async function processSyncOutbox(): Promise<void> {
  if (!tierAllowsSync()) return;
  const s = getSettingsMap();
  if (s['syncEnabled'] !== '1') return;
  const url = (s['syncRemoteUrl'] ?? '').trim();
  if (!url || !isUrlAllowed(url) || !net.isOnline()) return;
  const rows = syncOutboxList();
  for (const row of rows) {
    try {
      await httpPutText(url, row.payload_b64);
      syncOutboxRemove(row.id);
      finishSyncOk();
    } catch (e) {
      syncOutboxRecordFailure(row.id, e instanceof Error ? e.message : String(e));
    }
  }
}

export async function exportSyncBackup(passphrase: string): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const pw = String(passphrase ?? '');
  if (pw.length < 8) {
    return { ok: false, error: 'Passphrase must be at least 8 characters.' };
  }
  const res = await dialog.showSaveDialog({
    title: 'Export encrypted sync backup',
    defaultPath: 'devclip-sync.dcs',
    filters: [{ name: 'DevClip sync', extensions: ['dcs'] }],
  });
  if (res.canceled || !res.filePath) {
    return { ok: false, error: 'Cancelled' };
  }
  try {
    const plain = attachVaultToBundle(buildSyncBundleFromDb());
    const enc = encryptSyncEnvelope(JSON.stringify(plain), pw);
    fs.writeFileSync(res.filePath, enc, 'utf8');
    return { ok: true, path: res.filePath };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function importSyncBackup(passphrase: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const pw = String(passphrase ?? '');
  if (pw.length < 8) {
    return { ok: false, error: 'Passphrase must be at least 8 characters.' };
  }
  const res = await dialog.showOpenDialog({
    title: 'Import encrypted sync backup',
    filters: [{ name: 'DevClip sync', extensions: ['dcs'] }],
    properties: ['openFile'],
  });
  if (res.canceled || !res.filePaths?.[0]) {
    return { ok: false, error: 'Cancelled' };
  }
  try {
    const enc = fs.readFileSync(res.filePaths[0], 'utf8');
    const plain = parseSyncBundleJson(decryptSyncEnvelope(enc, pw));
    const localPlain = attachVaultToBundle(buildSyncBundleFromDb());
    const merged = mergeSyncBundles(localPlain, plain);
    applySyncBundleToDb(merged, vaultGetSessionKey());
    persistMergedDevicesJson(merged);
    finishSyncOk();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    finishSyncErr(msg);
    return { ok: false, error: msg };
  }
}
