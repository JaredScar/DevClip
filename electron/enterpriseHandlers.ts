import { app, dialog, ipcMain } from 'electron';
import {
  appendAuditEvent,
  clampAuditRetentionDays,
  countAuditEvents,
  exportAuditCsv,
  exportAuditJsonLines,
  pruneAuditEventsRetentionDays,
} from '../database/audit';
import { getSettingsMap, setSetting } from '../database/db';
import { getCachedTier } from '../database/licenseCache';
import { importOrgSnippetsFeedJson } from '../database/snippets';
import {
  fetchEnterprisePolicyFromUrl,
  refreshEnterprisePolicyIfConfigured,
} from './enterprisePolicy';
import { readIntegrationSecret, writeIntegrationSecret } from './integrationSecretStore';
import { isAllowedIntegrationUrl } from './integrationsAllowUrl';

const SETTINGS_KEYS = new Set([
  'enterpriseOrgDashboardUrl',
  'enterprisePolicyUrl',
  'enterpriseOrgSnippetsFeedUrl',
]);

function ud(): string {
  return app.getPath('userData');
}

export function registerEnterpriseIpc(): void {
  ipcMain.handle('enterprise:getStatus', () => {
    const s = getSettingsMap();
    const tier = getCachedTier();
    return {
      isEnterprise: tier === 'enterprise',
      orgDashboardUrl: s['enterpriseOrgDashboardUrl'] ?? '',
      policyUrl: s['enterprisePolicyUrl'] ?? '',
      policyLastOk: s['enterprisePolicyLastOk'] ?? '',
      policyLastError: s['enterprisePolicyLastError'] ?? '',
      snippetsFeedUrl: s['enterpriseOrgSnippetsFeedUrl'] ?? '',
      hasOrgApiToken: !!readIntegrationSecret(ud(), 'enterprise')?.trim(),
      auditEventCount: countAuditEvents(),
      policyDisableAi: s['enterprisePolicyDisableAi'] === '1',
      policyDisableSync: s['enterprisePolicyDisableSync'] === '1',
      policyForcePrivate: s['enterprisePolicyForcePrivate'] === '1',
      policySignatureValid: s['enterprisePolicySignatureValid'] === '1',
      auditRetentionDays: clampAuditRetentionDays(s['auditRetentionDays'] ?? '0'),
    };
  });

  ipcMain.handle('enterprise:getCloudAnalytics', async () => {
    if (getCachedTier() !== 'enterprise') {
      return { ok: false as const, error: 'Enterprise license required' };
    }

    const s = getSettingsMap();
    const remoteUrl = String(s['syncRemoteUrl'] ?? '').trim();
    if (!remoteUrl) {
      return { ok: false as const, error: 'Set syncRemoteUrl first in Sync settings' };
    }

    const bearer = readIntegrationSecret(ud(), 'enterprise')?.trim();
    if (!bearer) {
      return { ok: false as const, error: 'Enterprise API token is not set' };
    }

    const url = remoteUrl.replace(/\/+$/, '') + '/api/v1/admin/analytics/summary';
    try {
      const r = await fetch(url, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${bearer}`,
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) {
        return { ok: false as const, error: `HTTP ${r.status}` };
      }
      const data = (await r.json()) as unknown;
      return { ok: true as const, data };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
  });

  ipcMain.handle('enterprise:saveSettings', (_e, patch: Record<string, string>) => {
    for (const [k, v] of Object.entries(patch ?? {})) {
      if (SETTINGS_KEYS.has(k)) {
        const val = k === 'auditRetentionDays' ? clampAuditRetentionDays(String(v ?? '')) : String(v ?? '');
        setSetting(k, val);
        if (k === 'auditRetentionDays') {
          pruneAuditEventsRetentionDays(parseInt(val, 10));
        }
      }
    }
    appendAuditEvent({ category: 'enterprise', action: 'settings_patch', detail: { keys: Object.keys(patch ?? {}) } });
    return { ok: true as const };
  });

  ipcMain.handle('enterprise:setApiToken', (_e, token: string) => {
    if (getCachedTier() !== 'enterprise') {
      return { ok: false as const, error: 'Enterprise license required' };
    }
    writeIntegrationSecret(ud(), 'enterprise', String(token ?? ''));
    appendAuditEvent({ category: 'enterprise', action: 'api_token_updated' });
    return { ok: true as const };
  });

  ipcMain.handle('enterprise:fetchPolicy', async () => {
    if (getCachedTier() !== 'enterprise') {
      return { ok: false as const, error: 'Enterprise license required' };
    }
    const s = getSettingsMap();
    const url = s['enterprisePolicyUrl']?.trim();
    if (!url) {
      return { ok: false as const, error: 'Set policy URL first' };
    }
    const bearer = readIntegrationSecret(ud(), 'enterprise');
    const r = await fetchEnterprisePolicyFromUrl(ud(), url, bearer);
    appendAuditEvent({
      category: 'enterprise',
      action: 'policy_fetch',
      detail: { ok: r.ok, error: r.ok ? undefined : r.error, signatureValid: r.ok ? r.signatureValid : undefined },
    });
    return r;
  });

  ipcMain.handle('enterprise:importOrgSnippets', async () => {
    if (getCachedTier() !== 'enterprise') {
      return { ok: false as const, error: 'Enterprise license required' };
    }
    const s = getSettingsMap();
    const url = s['enterpriseOrgSnippetsFeedUrl']?.trim();
    if (!url || !isAllowedIntegrationUrl(url)) {
      return { ok: false as const, error: 'Set a valid HTTPS org snippets feed URL' };
    }
    const bearer = readIntegrationSecret(ud(), 'enterprise');
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      const tok = bearer?.trim();
      if (tok) headers['Authorization'] = `Bearer ${tok}`;
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
      if (!r.ok) {
        return { ok: false as const, error: `HTTP ${r.status}` };
      }
      const text = await r.text();
      const res = importOrgSnippetsFeedJson(text);
      appendAuditEvent({
        category: 'enterprise',
        action: 'org_snippets_import',
        detail: { imported: res.imported, errors: res.errors.length },
      });
      return { ok: true as const, imported: res.imported, errors: res.errors };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
  });

  ipcMain.handle('enterprise:refreshPolicyScheduled', async () => {
    await refreshEnterprisePolicyIfConfigured(ud());
    return { ok: true as const };
  });

  ipcMain.handle('audit:exportJsonl', async () => {
    const res = await dialog.showSaveDialog({
      title: 'Export audit log (JSON Lines)',
      defaultPath: 'devclip-audit.jsonl',
      filters: [{ name: 'JSON Lines', extensions: ['jsonl', 'json'] }],
    });
    if (res.canceled || !res.filePath) {
      return { ok: false as const, error: 'Cancelled' };
    }
    try {
      const fs = await import('fs');
      fs.writeFileSync(res.filePath, exportAuditJsonLines(), 'utf8');
      appendAuditEvent({ category: 'audit', action: 'export_jsonl' });
      return { ok: true as const, path: res.filePath };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('audit:exportCsv', async () => {
    const res = await dialog.showSaveDialog({
      title: 'Export audit log (CSV)',
      defaultPath: 'devclip-audit.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (res.canceled || !res.filePath) {
      return { ok: false as const, error: 'Cancelled' };
    }
    try {
      const fs = await import('fs');
      fs.writeFileSync(res.filePath, exportAuditCsv(), 'utf8');
      appendAuditEvent({ category: 'audit', action: 'export_csv' });
      return { ok: true as const, path: res.filePath };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });
}
