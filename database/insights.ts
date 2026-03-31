import { getDb, getClipActivityByDayRange } from './db';
import { ensureSnippetsSchema } from './snippets';

export interface InsightsSummary {
  windowStart: number;
  windowEnd: number;
  captures: number;
  distinctSources: number;
  topSources: { source: string; count: number }[];
  types: { type: string; count: number }[];
  hourCounts: { hour: number; count: number }[];
  peakHour: number | null;
  /** Avg `use_count` for clips whose first capture fell in the window (lifetime uses on those rows). */
  avgUseCountCaptured: number;
  /** Sum of `use_count` for clips captured in the window. */
  sumUseCountCaptured: number;
  topClips: { id: number; preview: string; type: string; use_count: number }[];
  topSnippets: { id: number; title: string; use_count: number }[];
  snippetCount: number;
  last7Days: { day: string; count: number }[];
}

export function getInsightsSummary(startUnix: number, endUnix: number): InsightsSummary {
  ensureSnippetsSchema();
  const db = getDb();
  const lo = Math.min(startUnix, endUnix);
  const hi = Math.max(startUnix, endUnix);

  const capRow = db
    .prepare(`SELECT COUNT(*) AS c FROM clips WHERE created_at >= ? AND created_at <= ?`)
    .get(lo, hi) as { c: number };
  const captures = Number(capRow.c) || 0;

  const srcRows = db
    .prepare(
      `SELECT COALESCE(NULLIF(TRIM(source), ''), '(unknown)') AS src, COUNT(*) AS cnt
       FROM clips
       WHERE created_at >= ? AND created_at <= ?
       GROUP BY COALESCE(NULLIF(TRIM(source), ''), '(unknown)')
       ORDER BY cnt DESC
       LIMIT 10`
    )
    .all(lo, hi) as { src: string; cnt: number }[];

  const typeRows = db
    .prepare(
      `SELECT type, COUNT(*) AS cnt FROM clips
       WHERE created_at >= ? AND created_at <= ?
       GROUP BY type ORDER BY cnt DESC`
    )
    .all(lo, hi) as { type: string; cnt: number }[];

  const hourRows = db
    .prepare(
      `SELECT CAST(strftime('%H', datetime(created_at, 'unixepoch', 'localtime')) AS INTEGER) AS hour,
              COUNT(*) AS cnt
       FROM clips WHERE created_at >= ? AND created_at <= ?
       GROUP BY hour ORDER BY hour ASC`
    )
    .all(lo, hi) as { hour: number; cnt: number }[];

  let peakHour: number | null = null;
  let peakC = -1;
  for (const h of hourRows) {
    const c = Number(h.cnt) || 0;
    if (c > peakC) {
      peakC = c;
      peakHour = Number(h.hour);
    }
  }
  if (peakC <= 0) peakHour = null;

  const useRow = db
    .prepare(
      `SELECT AVG(use_count) AS avg_u, SUM(use_count) AS sum_u FROM clips
       WHERE created_at >= ? AND created_at <= ?`
    )
    .get(lo, hi) as { avg_u: number | null; sum_u: number | null };
  const avgUseCountCaptured = useRow.avg_u != null && Number.isFinite(useRow.avg_u) ? useRow.avg_u : 0;
  const sumUseCountCaptured = useRow.sum_u != null && Number.isFinite(useRow.sum_u) ? useRow.sum_u : 0;

  const clipTop = db
    .prepare(
      `SELECT id, type, use_count, SUBSTR(content, 1, 80) AS preview
       FROM clips
       ORDER BY use_count DESC, created_at DESC
       LIMIT 8`
    )
    .all() as { id: number; type: string; use_count: number; preview: string }[];

  const snipTop = db
    .prepare(
      `SELECT id, title, use_count FROM snippets
       ORDER BY use_count DESC, updated_at DESC
       LIMIT 8`
    )
    .all() as { id: number; title: string; use_count: number }[];

  const snipTotal = db.prepare(`SELECT COUNT(*) AS c FROM snippets`).get() as { c: number };

  const now = Math.floor(Date.now() / 1000);
  const last7Days = getClipActivityByDayRange(now - 7 * 86400, now);

  return {
    windowStart: lo,
    windowEnd: hi,
    captures,
    distinctSources: srcRows.length,
    topSources: srcRows.map((r) => ({ source: r.src, count: Number(r.cnt) || 0 })),
    types: typeRows.map((r) => ({ type: r.type, count: Number(r.cnt) || 0 })),
    hourCounts: hourRows.map((r) => ({ hour: Number(r.hour), count: Number(r.cnt) || 0 })),
    peakHour,
    avgUseCountCaptured,
    sumUseCountCaptured,
    topClips: clipTop.map((r) => ({
      id: r.id,
      type: r.type,
      use_count: Number(r.use_count) || 0,
      preview: r.preview ?? '',
    })),
    topSnippets: snipTop.map((r) => ({
      id: r.id,
      title: r.title,
      use_count: Number(r.use_count) || 0,
    })),
    snippetCount: Number(snipTotal.c) || 0,
    last7Days,
  };
}
