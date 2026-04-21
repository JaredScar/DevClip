import { createHash } from 'crypto';
import { getDb } from './db';

export type Tier = 'free' | 'pro' | 'enterprise';

/** After successful HTTPS validation, tier is honored offline until this TTL elapses (PLAN §3.3). */
export const LICENSE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function licenseCacheExpired(cached_at: string | null): boolean {
  if (!cached_at) return true;
  const t = new Date(cached_at).getTime();
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > LICENSE_CACHE_TTL_MS;
}

export function fingerprintForLicenseKey(key: string): string {
  return createHash('sha256').update(key.trim(), 'utf8').digest('hex');
}

export function getLicenseKeyFingerprint(): string {
  try {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('licenseKeyFingerprint') as
      | { value: string }
      | undefined;
    return row?.value ?? '';
  } catch {
    return '';
  }
}

export function setLicenseKeyFingerprint(fp: string): void {
  try {
    getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('licenseKeyFingerprint', fp);
  } catch {
    /* ignore */
  }
}

export function getCachedTier(): Tier {
  try {
    const row = getDb()
      .prepare('SELECT tier, cached_at FROM license WHERE id = 1')
      .get() as { tier: string; cached_at: string | null } | undefined;
    if (!row) return 'free';
    const t = row.tier ?? 'free';
    if (t !== 'pro' && t !== 'enterprise') return 'free';
    if (licenseCacheExpired(row.cached_at)) {
      return 'free';
    }
    return t;
  } catch {
    return 'free';
  }
}

export function getLicenseCacheRow(): {
  tier: Tier;
  features: string[];
  expires_at: string | null;
  cached_at: string | null;
  device_count: number | null;
} {
  try {
    const row = getDb()
      .prepare('SELECT tier, features, expires_at, cached_at, device_count FROM license WHERE id = 1')
      .get() as
      | {
          tier: string;
          features: string;
          expires_at: string | null;
          cached_at: string | null;
          device_count: number | null;
        }
      | undefined;
    if (!row) {
      return {
        tier: 'free',
        features: [],
        expires_at: null,
        cached_at: null,
        device_count: null,
      };
    }
    let features: string[] = [];
    try {
      features = JSON.parse(row.features || '[]') as string[];
    } catch {
      features = [];
    }
    let tier: Tier =
      row.tier === 'pro' || row.tier === 'enterprise' ? row.tier : 'free';
    if (tier !== 'free' && licenseCacheExpired(row.cached_at)) {
      tier = 'free';
      features = [];
    }
    return {
      tier,
      features,
      expires_at: row.expires_at,
      cached_at: row.cached_at,
      device_count: row.device_count,
    };
  } catch {
    return {
      tier: 'free',
      features: [],
      expires_at: null,
      cached_at: null,
      device_count: null,
    };
  }
}

export function setLicenseCache(input: {
  tier: Tier;
  features?: string[];
  expires_at?: string | null;
  device_count?: number | null;
}): void {
  const db = getDb();
  const features = JSON.stringify(input.features ?? []);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO license (id, tier, features, expires_at, cached_at, device_count)
     VALUES (1, @tier, @features, @expires_at, @cached_at, @device_count)
     ON CONFLICT(id) DO UPDATE SET
       tier = excluded.tier,
       features = excluded.features,
       expires_at = excluded.expires_at,
       cached_at = excluded.cached_at,
       device_count = excluded.device_count`
  ).run({
    tier: input.tier,
    features,
    expires_at: input.expires_at ?? null,
    cached_at: now,
    device_count: input.device_count ?? null,
  });
}

export function clearLicenseCache(): void {
  try {
    getDb()
      .prepare(
        `UPDATE license SET tier='free', features='[]', expires_at=NULL, cached_at=NULL, device_count=NULL WHERE id=1`
      )
      .run();
    getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('licenseKeyFingerprint', '');
  } catch {
    /* ignore */
  }
}
