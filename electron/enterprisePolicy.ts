import { createHmac, timingSafeEqual } from 'crypto';
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
  /** HMAC-SHA256 signature of the canonical JSON payload (without this field). */
  signature?: string;
}

/** Compute canonical JSON for signing (sorted keys, no whitespace). */
function canonicalJson(doc: Omit<EnterprisePolicyDoc, 'signature'>): string {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(doc).sort()) {
    sorted[key] = (doc as Record<string, unknown>)[key];
  }
  return JSON.stringify(sorted);
}

/** Verify HMAC-SHA256 signature on policy document. */
function verifyPolicySignature(doc: EnterprisePolicyDoc, secret: string): boolean {
  const sig = doc.signature;
  if (!sig || !secret) return false;
  const { signature: _, ...payload } = doc;
  const canonical = canonicalJson(payload);
  const expected = createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
  try {
    return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export function applyEnterprisePolicyDoc(doc: EnterprisePolicyDoc, signatureValid: boolean): void {
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
  setSetting('enterprisePolicySignatureValid', signatureValid ? '1' : '0');
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
): Promise<{ ok: true; signatureValid: boolean } | { ok: false; error: string }> {
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

    // Verify signature if present
    const signingSecret = tok || '';
    const hasSignature = !!j.signature;
    const signatureValid = hasSignature && signingSecret ? verifyPolicySignature(j, signingSecret) : !hasSignature;

    applyEnterprisePolicyDoc(j, signatureValid);
    setSetting('enterprisePolicyLastOk', new Date().toISOString());
    setSetting('enterprisePolicyLastError', '');
    return { ok: true, signatureValid };
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

/** Compute policy signature for server-side use (exported for testing/CLI). */
export function computePolicySignature(
  doc: Omit<EnterprisePolicyDoc, 'signature'>,
  secret: string
): string {
  const canonical = canonicalJson(doc);
  return createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
}
