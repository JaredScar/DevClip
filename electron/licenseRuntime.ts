import {
  clearLicenseCache,
  fingerprintForLicenseKey,
  getLicenseKeyFingerprint,
  setLicenseCache,
  setLicenseKeyFingerprint,
  type Tier,
} from '../database/licenseCache';
import { readLicenseKey } from './licenseKeyStore';

export interface ValidateResult {
  tier: Tier;
  features: string[];
  expires_at: string | null;
  device_count: number | null;
}

/**
 * Tier is never derived from key prefixes alone. Pro/Enterprise require a successful
 * `POST /api/v1/license/validate` against `licenseServerUrl` (or offline cache from that).
 */
export function validateLicenseKeyString(key: string, _serverUrl: string): ValidateResult {
  const k = key.trim();
  if (!k) {
    return { tier: 'free', features: [], expires_at: null, device_count: null };
  }
  return { tier: 'free', features: [], expires_at: null, device_count: null };
}

/**
 * Reconcile local cache with the stored key: if the key matches the fingerprint from the last
 * successful server validation, keep cached tier. Otherwise reset to free until the network refresh runs.
 */
export function refreshLicenseFromDisk(userData: string, _serverUrl: string): void {
  const key = readLicenseKey(userData);
  if (!key) {
    clearLicenseCache();
    return;
  }
  const fp = fingerprintForLicenseKey(key);
  const storedFp = getLicenseKeyFingerprint();
  if (storedFp === fp) {
    return;
  }
  clearLicenseCache();
}

/** When `licenseServerUrl` points at a DevClip-compatible server, network result sets tier + fingerprint. */
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
      if (r.status === 404 || r.status === 401) {
        clearLicenseCache();
      }
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
      clearLicenseCache();
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
    setLicenseKeyFingerprint(fingerprintForLicenseKey(key));
  } catch {
    /* offline: keep existing cache if fingerprint still matches */
  }
}
