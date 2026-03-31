import { clearLicenseCache, setLicenseCache, type Tier } from '../database/licenseCache';
import { readLicenseKey } from './licenseKeyStore';

export interface ValidateResult {
  tier: Tier;
  features: string[];
  expires_at: string | null;
  device_count: number | null;
}

/** Offline-friendly validation: prefix keys unlock tiers; optional HTTPS validate can be added later. */
export function validateLicenseKeyString(key: string, _serverUrl: string): ValidateResult {
  const k = key.trim();
  if (!k) {
    return { tier: 'free', features: [], expires_at: null, device_count: null };
  }
  if (k.startsWith('dc_ent_')) {
    return { tier: 'enterprise', features: ['all'], expires_at: null, device_count: null };
  }
  if (k.startsWith('dc_pro_')) {
    return { tier: 'pro', features: ['all'], expires_at: null, device_count: null };
  }
  return { tier: 'free', features: [], expires_at: null, device_count: null };
}

export function refreshLicenseFromDisk(userData: string, serverUrl: string): void {
  const key = readLicenseKey(userData);
  if (!key) {
    clearLicenseCache();
    return;
  }
  const v = validateLicenseKeyString(key, serverUrl);
  setLicenseCache({
    tier: v.tier,
    features: v.features,
    expires_at: v.expires_at,
    device_count: v.device_count,
  });
}

/** When `licenseServerUrl` points at a DevClip-compatible server, network result overrides prefix cache. */
export async function tryRefreshLicenseFromNetwork(
  userData: string,
  serverUrl: string
): Promise<void> {
  const key = readLicenseKey(userData);
  const base = serverUrl?.trim().replace(/\/$/, '');
  if (!key?.trim() || !base?.startsWith('http')) {
    return;
  }
  try {
    const r = await fetch(`${base}/api/v1/license/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: key.trim() }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) {
      return;
    }
    const j = (await r.json()) as {
      tier?: string;
      features?: unknown;
      expires_at?: string | null;
      device_count?: number | null;
    };
    const t = j.tier;
    if (t !== 'pro' && t !== 'enterprise') {
      return;
    }
    let features: string[] = [];
    if (Array.isArray(j.features)) {
      features = j.features.map(String);
    } else {
      features = ['all'];
    }
    setLicenseCache({
      tier: t,
      features,
      expires_at: j.expires_at ?? null,
      device_count: j.device_count ?? null,
    });
  } catch {
    /* keep offline / prefix cache */
  }
}
