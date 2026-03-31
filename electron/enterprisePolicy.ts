import { getSettingsMap, setSetting, trimToLimit } from '../database/db';
import { getCachedTier } from '../database/licenseCache';
import { readIntegrationSecret } from './integrationSecretStore';
import { isAllowedIntegrationUrl } from './integrationsAllowUrl';

export interface EnterprisePolicyDoc {
  version?: number;
  ignore_apps?: string[];
  max_history_clips?: number;
  disable_ai?: boolean;
  disable_cloud_sync?: boolean;
  force_private_mode?: boolean;
}

export function applyEnterprisePolicyDoc(doc: EnterprisePolicyDoc): void {
  setSetting('enterprisePolicyIgnoreApps', JSON.stringify(doc.ignore_apps ?? []));
  const mh = doc.max_history_clips;
  if (typeof mh === 'number' && Number.isFinite(mh) && mh > 0) {
    setSetting('enterprisePolicyMaxHistory', String(Math.round(mh)));
  } else {
    setSetting('enterprisePolicyMaxHistory', '');
  }
  setSetting('enterprisePolicyDisableAi', doc.disable_ai ? '1' : '0');
  setSetting('enterprisePolicyDisableSync', doc.disable_cloud_sync ? '1' : '0');
  setSetting('enterprisePolicyForcePrivate', doc.force_private_mode ? '1' : '0');
  try {
    trimToLimit();
  } catch {
    /* ignore */
  }
}

export async function fetchEnterprisePolicyFromUrl(
  userData: string,
  url: string,
  bearer: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const u = url.trim();
  if (!u || !isAllowedIntegrationUrl(u)) {
    return { ok: false, error: 'Invalid policy URL' };
  }
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const tok = bearer?.trim();
    if (tok) headers['Authorization'] = `Bearer ${tok}`;
    const r = await fetch(u, { method: 'GET', headers, signal: AbortSignal.timeout(12_000) });
    if (!r.ok) {
      return { ok: false, error: `HTTP ${r.status}` };
    }
    const j = (await r.json()) as EnterprisePolicyDoc;
    applyEnterprisePolicyDoc(j);
    setSetting('enterprisePolicyLastOk', new Date().toISOString());
    setSetting('enterprisePolicyLastError', '');
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setSetting('enterprisePolicyLastError', msg.slice(0, 500));
    return { ok: false, error: msg };
  }
}

export async function refreshEnterprisePolicyIfConfigured(userData: string): Promise<void> {
  if (getCachedTier() !== 'enterprise') return;
  const s = getSettingsMap();
  const url = s['enterprisePolicyUrl']?.trim();
  if (!url) return;
  const bearer = readIntegrationSecret(userData, 'enterprise');
  await fetchEnterprisePolicyFromUrl(userData, url, bearer);
}
