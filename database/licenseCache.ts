import { getDb } from './db';

export type Tier = 'free' | 'pro' | 'enterprise';

export function getCachedTier(): Tier {
  try {
    const row = getDb().prepare('SELECT tier FROM license WHERE id = 1').get() as
      | { tier: string }
      | undefined;
    const t = row?.tier ?? 'free';
    if (t === 'pro' || t === 'enterprise') return t;
    return 'free';
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
    const tier: Tier =
      row.tier === 'pro' || row.tier === 'enterprise' ? row.tier : 'free';
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
  } catch {
    /* ignore */
  }
}
