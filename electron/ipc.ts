import { createHash } from 'crypto';
import { app, BrowserWindow, ipcMain, clipboard, nativeImage, shell } from 'electron';
import type { ClipRow, ClipSearchOptions, ClipType } from '../database/db';
import {
  addTagToClip,
  deleteClip,
  getClipActivityByDayRange,
  getClips,
  getClipTags,
  getSettingsMap,
  incrementClipUseCount,
  listTags,
  removeTagFromClip,
  saveClip,
  searchClips,
  searchClipsFuzzy,
  setSetting,
  togglePin,
  trimToLimit,
} from '../database/db';
import {
  addClipToCollection,
  createCollection,
  deleteCollection,
  exportCollectionsJson,
  importCollectionsJson,
  listCollectionsWithCounts,
  refreshSmartCollection,
  removeClipFromCollection,
} from '../database/collections';
import {
  deleteAutomationRule,
  insertAutomationRule,
  listAutomationRules,
  updateAutomationRule,
} from '../database/automation';
import { getLicenseCacheRow } from '../database/licenseCache';
import { getInsightsSummary } from '../database/insights';
import {
  deleteSnippet,
  exportSnippetsJson,
  getSnippets,
  importSnippetsJson,
  incrementSnippetUseCount,
  insertSnippet,
  resolveSnippetByShortcode,
  searchSnippets,
  toggleSnippetPin,
  updateSnippet,
} from '../database/snippets';
import { appendAuditEvent, clampAuditRetentionDays, pruneAuditEventsRetentionDays } from '../database/audit';
import { refreshLicenseFromDisk, tryRefreshLicenseFromNetwork } from './licenseRuntime';
import { hasStoredLicenseKey, writeLicenseKey } from './licenseKeyStore';
import { listVaultExternalProviderHooks } from './vaultIntegrations';
import {
  vaultAddFromClipId,
  vaultAddManual,
  vaultChangePin,
  vaultDecryptPayload,
  vaultDisable,
  vaultIsConfigured,
  vaultIsUnlocked,
  vaultLock,
  vaultSetup,
  vaultUnlock,
} from './vaultSession';
import { countVaultEntries, deleteVaultEntry, listVaultEntryMeta } from '../database/vault';
import { runAiCompletion, type AiActionId } from './aiActions';
import { hasAiSecret, writeAiSecret, type AiSecretId } from './aiSecretStore';
import {
  exportSyncBackup,
  getSyncStatus,
  importSyncBackup,
  processSyncOutbox,
  runSyncPull,
  runSyncPush,
  saveSyncConfig,
} from './syncOps';
import { registerEnterpriseIpc } from './enterpriseHandlers';
import { registerIntegrationsIpc } from './integrationsHandlers';
import { runCaptureIntegrations } from './integrationsCapture';

function isAllowedExternalUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Cleared when app lock is enabled until user enters PIN. */
let lockSessionUnlocked = true;

export function resetLockSessionFromSettings(settings: Record<string, string>): void {
  lockSessionUnlocked = settings['appLockEnabled'] !== '1';
}

function licenseStatusForRenderer(): Record<string, unknown> {
  const userData = app.getPath('userData');
  const cache = getLicenseCacheRow();
  return {
    tier: cache.tier,
    isEnterprise: cache.tier === 'enterprise',
    hasKey: hasStoredLicenseKey(userData),
    expiresAt: cache.expires_at,
    cachedAt: cache.cached_at,
    deviceCount: cache.device_count,
    features: cache.features,
  };
}

function auditSettingChange(key: string): void {
  if (
    key === 'licenseServerUrl' ||
    key === 'privateMode' ||
    key === 'appLockEnabled' ||
    key.startsWith('sync') ||
    key.startsWith('enterprise')
  ) {
    appendAuditEvent({ category: 'settings', action: 'set', detail: { key } });
  }
}

export function registerIpcHandlers(
  getOverlayWindow: () => BrowserWindow | null,
  getMainWindow: () => BrowserWindow | null,
  onClipCreated: (row: ClipRow) => void
): void {
  registerIntegrationsIpc();
  registerEnterpriseIpc();
  ipcMain.handle('clips:get', () => {
    return getClips();
  });

  ipcMain.handle('clips:activityByDay', (_e, startUnix: number, endUnix: number) => {
    return getClipActivityByDayRange(Number(startUnix), Number(endUnix));
  });

  ipcMain.handle('insights:getSummary', (_e, startUnix: number, endUnix: number) => {
    return getInsightsSummary(Number(startUnix), Number(endUnix));
  });

  ipcMain.handle(
    'clips:search',
    (_e, query: string, typeFilter: string, opts?: ClipSearchOptions) => {
      const o = opts ?? {};
      const { fuzzy, ...rest } = o;
      const q = query ?? '';
      const tf = typeFilter ?? 'all';
      if (fuzzy && q.trim().length > 0) {
        return searchClipsFuzzy(q, tf, rest);
      }
      return searchClips(q, tf, rest);
    }
  );

  ipcMain.handle(
    'clips:save',
    (_e, payload: { content: string; type: ClipType; source?: string | null }) => {
      const row = saveClip({
        content: payload.content,
        type: payload.type,
        source: payload.source ?? null,
      });
      onClipCreated(row);
      runCaptureIntegrations(row, app.getPath('userData'));
      return row;
    }
  );

  ipcMain.handle('clips:pin', (_e, id: number) => {
    return togglePin(id);
  });

  ipcMain.handle('clips:delete', (_e, id: number) => {
    const secure = getSettingsMap()['secureDeleteOnRemove'] === '1';
    deleteClip(id, { secure });
    return { ok: true };
  });

  ipcMain.handle('clips:incrementUse', (_e, id: number) => {
    incrementClipUseCount(id);
    return { ok: true };
  });

  ipcMain.handle('clips:tag', (_e, clipId: number, tagName: string) => {
    addTagToClip(clipId, tagName);
    return { ok: true };
  });

  ipcMain.handle('clips:untag', (_e, clipId: number, tagName: string) => {
    removeTagFromClip(clipId, tagName);
    return { ok: true };
  });

  ipcMain.handle('clips:getTags', (_e, clipId: number) => {
    return getClipTags(clipId);
  });

  ipcMain.handle('clipboard:write', (_e, text: string) => {
    clipboard.writeText(text);
    return { ok: true };
  });

  ipcMain.handle('clipboard:writeImage', (_e, dataUrl: string) => {
    try {
      const img = nativeImage.createFromDataURL(String(dataUrl ?? ''));
      clipboard.writeImage(img);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle('overlay:hide', () => {
    const win = getOverlayWindow();
    if (win && !win.isDestroyed()) {
      win.hide();
    }
    return { ok: true };
  });

  ipcMain.handle('main:show', () => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) {
        win.restore();
      }
      win.show();
      win.focus();
    }
    return { ok: true };
  });

  ipcMain.handle('main:minimize', () => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.minimize();
    }
    return { ok: true };
  });

  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    const u = String(url ?? '').trim();
    if (!isAllowedExternalUrl(u)) {
      return { ok: false, error: 'invalid_url' };
    }
    return shell
      .openExternal(u)
      .then(() => ({ ok: true as const }))
      .catch(() => ({ ok: false as const, error: 'open_failed' }));
  });

  ipcMain.handle('settings:get', () => {
    return getSettingsMap();
  });

  ipcMain.handle('settings:set', (_e, key: string, value: string) => {
    let v = String(value ?? '');
    if (key === 'auditRetentionDays') {
      v = clampAuditRetentionDays(v);
    }
    setSetting(key, v);
    auditSettingChange(key);
    if (key === 'auditRetentionDays') {
      pruneAuditEventsRetentionDays(parseInt(v, 10));
    }
    if (key === 'historyLimit' || key === 'proHistoryCap') {
      trimToLimit();
    }
    if (key === 'licenseServerUrl') {
      refreshLicenseFromDisk(app.getPath('userData'), v);
      void tryRefreshLicenseFromNetwork(app.getPath('userData'), v);
    }
    if (key === 'appLockEnabled') {
      resetLockSessionFromSettings(getSettingsMap());
    }
    return { ok: true };
  });

  ipcMain.handle('license:getStatus', () => {
    return licenseStatusForRenderer();
  });

  ipcMain.handle('license:setKey', (_e, key: string) => {
    writeLicenseKey(app.getPath('userData'), String(key ?? ''));
    const ud = app.getPath('userData');
    const serverUrl = getSettingsMap()['licenseServerUrl'] ?? '';
    refreshLicenseFromDisk(ud, serverUrl);
    void tryRefreshLicenseFromNetwork(ud, serverUrl);
    trimToLimit();
    appendAuditEvent({ category: 'license', action: 'key_set' });
    return licenseStatusForRenderer();
  });

  ipcMain.handle('license:clear', () => {
    writeLicenseKey(app.getPath('userData'), '');
    refreshLicenseFromDisk(app.getPath('userData'), '');
    trimToLimit();
    appendAuditEvent({ category: 'license', action: 'key_cleared' });
    return licenseStatusForRenderer();
  });

  ipcMain.handle('lock:getState', () => {
    const s = getSettingsMap();
    const enabled = s['appLockEnabled'] === '1';
    return { enabled, unlocked: !enabled || lockSessionUnlocked };
  });

  ipcMain.handle('lock:unlock', (_e, pin: string) => {
    const s = getSettingsMap();
    if (s['appLockEnabled'] !== '1') {
      lockSessionUnlocked = true;
      return { ok: true };
    }
    const expected = s['appLockPinHash'] ?? '';
    const got = createHash('sha256').update(String(pin ?? ''), 'utf8').digest('hex');
    if (expected && got === expected) {
      lockSessionUnlocked = true;
      return { ok: true };
    }
    return { ok: false };
  });

  ipcMain.handle('lock:lockSession', () => {
    if (getSettingsMap()['appLockEnabled'] === '1') {
      lockSessionUnlocked = false;
    }
    return { ok: true };
  });

  ipcMain.handle('lock:setPin', (_e, pin: string) => {
    const p = String(pin ?? '').trim();
    if (p.length < 4) {
      return { ok: false, error: 'PIN must be at least 4 characters' };
    }
    const hash = createHash('sha256').update(p, 'utf8').digest('hex');
    setSetting('appLockPinHash', hash);
    setSetting('appLockEnabled', '1');
    lockSessionUnlocked = true;
    return { ok: true };
  });

  ipcMain.handle('lock:clearPin', () => {
    setSetting('appLockPinHash', '');
    setSetting('appLockEnabled', '0');
    lockSessionUnlocked = true;
    return { ok: true };
  });

  ipcMain.handle('collections:list', () => {
    return listCollectionsWithCounts();
  });

  ipcMain.handle(
    'collections:create',
    (
      _e,
      name: string,
      opts?: { isSmart?: boolean; query?: string | null }
    ) => {
      const smart = opts?.isSmart === true ? 1 : 0;
      const q = smart ? String(opts?.query ?? '{}') : null;
      const id = createCollection(String(name ?? ''), smart, q);
      if (smart) {
        refreshSmartCollection(id);
      }
      return { id };
    }
  );

  ipcMain.handle('collections:refreshSmart', (_e, id: number) => {
    refreshSmartCollection(Number(id));
    return { ok: true };
  });

  ipcMain.handle('collections:delete', (_e, id: number) => {
    deleteCollection(id);
    return { ok: true };
  });

  ipcMain.handle('collections:addClip', (_e, collectionId: number, clipId: number) => {
    addClipToCollection(collectionId, clipId);
    return { ok: true };
  });

  ipcMain.handle('collections:removeClip', (_e, collectionId: number, clipId: number) => {
    removeClipFromCollection(collectionId, clipId);
    return { ok: true };
  });

  ipcMain.handle('collections:exportJson', () => {
    return exportCollectionsJson();
  });

  ipcMain.handle('collections:importJson', (_e, json: string) => {
    return importCollectionsJson(String(json ?? ''));
  });

  ipcMain.handle('automation:list', () => {
    return listAutomationRules();
  });

  ipcMain.handle(
    'automation:create',
    (
      _e,
      payload: { name: string; trigger: string; conditions: string; actions: string; enabled?: number }
    ) => {
      const id = insertAutomationRule(payload);
      return { id };
    }
  );

  ipcMain.handle(
    'automation:update',
    (
      _e,
      payload: {
        id: number;
        name: string;
        enabled: number;
        trigger: string;
        conditions: string;
        actions: string;
      }
    ) => {
      updateAutomationRule(payload);
      return { ok: true };
    }
  );

  ipcMain.handle('automation:delete', (_e, id: number) => {
    deleteAutomationRule(id);
    return { ok: true };
  });

  ipcMain.handle('crypto:digest', (_e, algorithm: string, text: string) => {
    const a = String(algorithm || '').toLowerCase();
    if (a !== 'md5' && a !== 'sha1' && a !== 'sha256') {
      throw new Error('Unsupported digest');
    }
    const h = createHash(a);
    h.update(String(text ?? ''), 'utf8');
    return h.digest('hex');
  });

  ipcMain.handle('snippets:exportJson', () => {
    return exportSnippetsJson();
  });

  ipcMain.handle('snippets:importJson', (_e, jsonText: string) => {
    return importSnippetsJson(String(jsonText ?? ''));
  });

  ipcMain.handle('snippets:resolveShortcode', (_e, token: string) => {
    return resolveSnippetByShortcode(String(token ?? ''));
  });

  ipcMain.handle('tags:list', () => {
    return listTags();
  });

  ipcMain.handle('snippets:get', () => {
    return getSnippets();
  });

  ipcMain.handle('snippets:search', (_e, query: string) => {
    return searchSnippets(query ?? '');
  });

  ipcMain.handle(
    'snippets:save',
    (
      _e,
      payload: {
        title: string;
        content: string;
        variables: string;
        tags: string;
        category?: string;
        shortcode?: string | null;
      }
    ) => {
      return insertSnippet(payload);
    }
  );

  ipcMain.handle(
    'snippets:update',
    (
      _e,
      payload: {
        id: number;
        title: string;
        content: string;
        variables: string;
        tags: string;
        category?: string;
        shortcode?: string | null;
      }
    ) => {
      return updateSnippet(payload);
    }
  );

  ipcMain.handle('snippets:delete', (_e, id: number) => {
    deleteSnippet(id);
    return { ok: true };
  });

  ipcMain.handle('snippets:pin', (_e, id: number) => {
    return toggleSnippetPin(id);
  });

  ipcMain.handle('snippets:incrementUse', (_e, id: number) => {
    incrementSnippetUseCount(Number(id));
    return { ok: true };
  });

  ipcMain.handle('ai:getKeyStatus', () => {
    const userData = app.getPath('userData');
    return {
      openai: hasAiSecret(userData, 'openai'),
      anthropic: hasAiSecret(userData, 'anthropic'),
      hosted: hasAiSecret(userData, 'hosted'),
    };
  });

  ipcMain.handle('ai:setApiKey', (_e, slot: string, key: string) => {
    const s = String(slot ?? '').trim();
    if (s !== 'openai' && s !== 'anthropic' && s !== 'hosted') {
      return { ok: false as const, error: 'invalid_slot' };
    }
    writeAiSecret(app.getPath('userData'), s as AiSecretId, String(key ?? ''));
    return { ok: true as const };
  });

  ipcMain.handle(
    'ai:runAction',
    async (
      _e,
      payload: {
        action: string;
        clipContent: string;
        clipType?: string;
        extra?: string;
        appendToHistory?: boolean;
      }
    ) => {
      try {
        const action = String(payload?.action ?? '') as AiActionId;
        const allowed: AiActionId[] = [
          'summarize',
          'explain',
          'fix_improve',
          'translate',
          'rewrite',
          'gen_regex',
          'gen_test',
          'ask',
        ];
        if (!allowed.includes(action)) {
          return { ok: false as const, error: 'Unknown action' };
        }
        const content = String(payload?.clipContent ?? '');
        const extraStr = String(payload?.extra ?? '').trim();
        if (action === 'ask' && !extraStr) {
          return { ok: false as const, error: 'Enter a question for “Ask anything”' };
        }
        if (!content.trim() && action === 'gen_regex' && !extraStr) {
          return { ok: false as const, error: 'Add a pattern description or clip context' };
        }
        if (!content.trim() && action !== 'gen_regex') {
          return { ok: false as const, error: 'No clip content — select a text clip or paste below' };
        }
        if (getSettingsMap()['enterprisePolicyDisableAi'] === '1') {
          return {
            ok: false as const,
            error: 'AI actions are disabled by your organization policy.',
          };
        }
        const clipBody = content.trim() || (action === 'gen_regex' ? '' : '(no clip body)');
        const text = await runAiCompletion({
          action,
          clipContent: clipBody,
          clipType: payload?.clipType,
          extra: payload?.extra,
        });
        const settings = getSettingsMap();
        const append =
          payload?.appendToHistory !== false && settings['aiAppendToHistory'] !== '0';
        if (append) {
          const row = saveClip({
            content: text,
            type: 'text',
            source: `ai:${action}`,
          });
          onClipCreated(row);
          runCaptureIntegrations(row, app.getPath('userData'));
        }
        return { ok: true as const, text };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false as const, error: msg };
      }
    }
  );

  ipcMain.handle('vault:getState', () => ({
    configured: vaultIsConfigured(),
    unlocked: vaultIsUnlocked(),
    entryCount: countVaultEntries(),
  }));

  ipcMain.handle('vault:listExternalHooks', () => listVaultExternalProviderHooks());

  ipcMain.handle('vault:setup', (_e, pin: string) => {
    const r = vaultSetup(String(pin ?? ''));
    if (r.ok) appendAuditEvent({ category: 'vault', action: 'setup' });
    return r;
  });

  ipcMain.handle('vault:unlock', (_e, pin: string) => {
    const r = vaultUnlock(String(pin ?? ''));
    if (r.ok) appendAuditEvent({ category: 'vault', action: 'unlock' });
    return r;
  });

  ipcMain.handle('vault:lock', () => {
    vaultLock();
    appendAuditEvent({ category: 'vault', action: 'lock' });
    return { ok: true };
  });

  ipcMain.handle('vault:changePin', (_e, oldPin: string, newPin: string) => {
    const r = vaultChangePin(String(oldPin ?? ''), String(newPin ?? ''));
    if (r.ok) appendAuditEvent({ category: 'vault', action: 'change_pin' });
    return r;
  });

  ipcMain.handle('vault:disable', (_e, pin: string) => {
    const r = vaultDisable(String(pin ?? ''));
    if (r.ok) appendAuditEvent({ category: 'vault', action: 'disable' });
    return r;
  });

  ipcMain.handle('vault:listMeta', () => {
    if (!vaultIsUnlocked()) {
      return [];
    }
    return listVaultEntryMeta();
  });

  ipcMain.handle('vault:addFromClip', (_e, clipId: number, titleHint?: string) => {
    const r = vaultAddFromClipId(Number(clipId), String(titleHint ?? ''));
    if (r.ok) {
      appendAuditEvent({
        category: 'vault',
        action: 'add_from_clip',
        detail: { entryId: r.entryId },
      });
    }
    return r;
  });

  ipcMain.handle(
    'vault:addManual',
    (_e, payload: { type?: string; titleHint?: string; content?: string }) => {
      const r = vaultAddManual(
        String(payload?.type ?? 'text'),
        String(payload?.titleHint ?? ''),
        String(payload?.content ?? '')
      );
      if (r.ok) {
        appendAuditEvent({
          category: 'vault',
          action: 'add_manual',
          detail: { entryId: r.entryId },
        });
      }
      return r;
    }
  );

  ipcMain.handle('vault:deleteEntry', (_e, entryId: number) => {
    if (!vaultIsUnlocked()) {
      return { ok: false, error: 'Unlock the vault first' };
    }
    deleteVaultEntry(Number(entryId));
    appendAuditEvent({ category: 'vault', action: 'delete_entry', detail: { entryId: Number(entryId) } });
    return { ok: true };
  });

  ipcMain.handle('vault:copyEntry', (_e, entryId: number) => {
    const res = vaultDecryptPayload(Number(entryId));
    if (!res.ok || !res.payload) {
      return { ok: false, error: res.error ?? 'decrypt_failed' };
    }
    const c = res.payload.content;
    if (c.startsWith('data:image/')) {
      try {
        const img = nativeImage.createFromDataURL(c);
        clipboard.writeImage(img);
      } catch {
        return { ok: false, error: 'clipboard_image_failed' };
      }
    } else {
      clipboard.writeText(c);
    }
    appendAuditEvent({ category: 'vault', action: 'copy_entry', detail: { entryId: Number(entryId) } });
    return { ok: true };
  });

  ipcMain.handle('sync:getStatus', () => getSyncStatus());

  ipcMain.handle('sync:saveConfig', (_e, patch: Record<string, string>) => {
    saveSyncConfig(patch ?? {});
    const keys = Object.keys(patch ?? {}).filter((k) => k.startsWith('sync'));
    if (keys.length) {
      appendAuditEvent({ category: 'sync', action: 'config_patch', detail: { keys } });
    }
    return { ok: true as const };
  });

  ipcMain.handle('sync:push', (_e, passphrase: string) => runSyncPush(String(passphrase ?? '')));

  ipcMain.handle('sync:pull', (_e, passphrase: string) => runSyncPull(String(passphrase ?? '')));

  ipcMain.handle('sync:exportBackup', (_e, passphrase: string) =>
    exportSyncBackup(String(passphrase ?? ''))
  );

  ipcMain.handle('sync:importBackup', (_e, passphrase: string) =>
    importSyncBackup(String(passphrase ?? ''))
  );

  ipcMain.handle('sync:processOutbox', () => {
    void processSyncOutbox();
    return { ok: true as const };
  });
}
