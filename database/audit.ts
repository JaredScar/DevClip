import { getDb } from './db';

/** Allowed local audit retention windows (days). `0` = keep all. */
export const AUDIT_RETENTION_PRESETS_DAYS = [0, 30, 90, 180, 365, 730] as const;

export function clampAuditRetentionDays(raw: string): string {
  const n = parseInt(String(raw ?? '').trim(), 10);
  const allowed = new Set<number>(AUDIT_RETENTION_PRESETS_DAYS);
  return allowed.has(n) ? String(n) : '0';
}

export interface AuditEventRow {
  id: number;
  ts: number;
  category: string;
  action: string;
  detail_json: string;
  actor_hint: string;
}

/** Deletes audit rows older than `days` (wall-clock). `days <= 0` is a no-op. Returns rows removed. */
export function pruneAuditEventsRetentionDays(days: number): number {
  if (!Number.isFinite(days) || days <= 0) {
    return 0;
  }
  try {
    const db = getDb();
    const cutoff = Math.floor(Date.now() / 1000) - Math.round(days) * 86_400;
    const r = db.prepare('DELETE FROM audit_events WHERE ts < ?').run(cutoff);
    return Number(r.changes) || 0;
  } catch {
    return 0;
  }
}

export function appendAuditEvent(input: {
  category: string;
  action: string;
  detail?: Record<string, unknown>;
  actorHint?: string;
}): void {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO audit_events (ts, category, action, detail_json, actor_hint)
       VALUES (strftime('%s','now'), @category, @action, @detail_json, @actor_hint)`
    ).run({
      category: input.category.slice(0, 64),
      action: input.action.slice(0, 128),
      detail_json: JSON.stringify(input.detail ?? {}),
      actor_hint: (input.actorHint ?? '').slice(0, 256),
    });
  } catch {
    /* ignore audit failures */
  }
}

export function countAuditEvents(): number {
  try {
    const row = getDb().prepare('SELECT COUNT(*) AS c FROM audit_events').get() as { c: number };
    return Number(row.c) || 0;
  } catch {
    return 0;
  }
}

export function listAuditEvents(limit = 500): AuditEventRow[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM audit_events ORDER BY id DESC LIMIT ?`)
    .all(Math.min(10_000, Math.max(1, limit))) as AuditEventRow[];
}

export function exportAuditJsonLines(): string {
  const rows = listAuditEvents(50_000);
  return rows
    .map((r) =>
      JSON.stringify({
        id: r.id,
        ts: r.ts,
        ts_iso: new Date(r.ts * 1000).toISOString(),
        category: r.category,
        action: r.action,
        detail: safeJson(r.detail_json),
        actor_hint: r.actor_hint,
      })
    )
    .join('\n');
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

export function exportAuditCsv(): string {
  const rows = listAuditEvents(50_000);
  const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = ['id,ts_iso,category,action,detail_json,actor_hint'];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        new Date(r.ts * 1000).toISOString(),
        r.category,
        r.action,
        r.detail_json,
        r.actor_hint,
      ]
        .map((c) => esc(String(c)))
        .join(',')
    );
  }
  return lines.join('\n');
}
