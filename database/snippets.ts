import { createHash, randomUUID } from 'crypto';
import { getDb } from './db';

export interface SnippetRow {
  id: number;
  title: string;
  content: string;
  variables: string;
  tags: string;
  category: string;
  shortcode: string | null;
  sync_uid?: string | null;
  created_at: number;
  updated_at: number;
  is_pinned: number;
  use_count: number;
}

const SNIPPET_CAP_FREE = 200;
const SNIPPET_CAP_PAID = 2_000_000;

function getSnippetLimit(): number {
  try {
    const { getCachedTier } = require('./licenseCache') as typeof import('./licenseCache');
    const t = getCachedTier();
    if (t === 'pro' || t === 'enterprise') return SNIPPET_CAP_PAID;
  } catch {
    /* ignore */
  }
  return SNIPPET_CAP_FREE;
}

function migrateSnippetsColumns(db: ReturnType<typeof getDb>): void {
  const cols = db.prepare('PRAGMA table_info(snippets)').all() as { name: string }[];
  if (cols.length === 0) return;
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('category')) {
    db.exec(`ALTER TABLE snippets ADD COLUMN category TEXT NOT NULL DEFAULT ''`);
  }
  if (!names.has('shortcode')) {
    db.exec(`ALTER TABLE snippets ADD COLUMN shortcode TEXT`);
  }
  if (!names.has('use_count')) {
    db.exec(`ALTER TABLE snippets ADD COLUMN use_count INTEGER NOT NULL DEFAULT 0`);
  }
  if (!names.has('sync_uid')) {
    db.exec(`ALTER TABLE snippets ADD COLUMN sync_uid TEXT`);
  }
}

export function ensureSnippetsSchema(): void {
  migrateSnippetsColumns(getDb());
}

export function getSnippets(): SnippetRow[] {
  const db = getDb();
  migrateSnippetsColumns(db);
  return db
    .prepare(
      `SELECT * FROM snippets ORDER BY is_pinned DESC, updated_at DESC LIMIT ?`
    )
    .all(getSnippetLimit()) as SnippetRow[];
}

export function searchSnippets(query: string): SnippetRow[] {
  const db = getDb();
  migrateSnippetsColumns(db);
  const lim = getSnippetLimit();
  const q = query.trim();
  if (!q.length) {
    return getSnippets();
  }
  const escaped = q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  return db
    .prepare(
      `SELECT * FROM snippets
       WHERE title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\'
          OR category LIKE ? ESCAPE '\\' OR IFNULL(shortcode,'') LIKE ? ESCAPE '\\'
       ORDER BY is_pinned DESC, updated_at DESC LIMIT ?`
    )
    .all(`%${escaped}%`, `%${escaped}%`, `%${escaped}%`, `%${escaped}%`, `%${escaped}%`, lim) as SnippetRow[];
}

export function insertSnippet(input: {
  title: string;
  content: string;
  variables: string;
  tags: string;
  category?: string;
  shortcode?: string | null;
}): SnippetRow {
  const db = getDb();
  migrateSnippetsColumns(db);
  const category = input.category?.trim() ?? '';
  const shortcode = normalizeShortcode(input.shortcode);
  const r = db
    .prepare(
      `INSERT INTO snippets (title, content, variables, tags, category, shortcode, sync_uid, created_at, updated_at, is_pinned)
       VALUES (@title, @content, @variables, @tags, @category, @shortcode, @sync_uid, strftime('%s','now'), strftime('%s','now'), 0)`
    )
    .run({
      title: input.title,
      content: input.content,
      variables: input.variables,
      tags: input.tags,
      category,
      shortcode,
      sync_uid: randomUUID(),
    });
  return db.prepare('SELECT * FROM snippets WHERE id = ?').get(r.lastInsertRowid) as SnippetRow;
}

export function updateSnippet(input: {
  id: number;
  title: string;
  content: string;
  variables: string;
  tags: string;
  category?: string;
  shortcode?: string | null;
}): SnippetRow | undefined {
  const db = getDb();
  migrateSnippetsColumns(db);
  const category = input.category?.trim() ?? '';
  const shortcode = normalizeShortcode(input.shortcode);
  db.prepare(
    `UPDATE snippets SET title=@title, content=@content, variables=@variables, tags=@tags,
     category=@category, shortcode=@shortcode, updated_at=strftime('%s','now') WHERE id=@id`
  ).run({
    id: input.id,
    title: input.title,
    content: input.content,
    variables: input.variables,
    tags: input.tags,
    category,
    shortcode,
  });
  return db.prepare('SELECT * FROM snippets WHERE id = ?').get(input.id) as SnippetRow | undefined;
}

export function deleteSnippet(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM snippets WHERE id = ?').run(id);
}

export function toggleSnippetPin(id: number): SnippetRow | undefined {
  const db = getDb();
  db.prepare(
    `UPDATE snippets SET is_pinned = CASE WHEN is_pinned = 1 THEN 0 ELSE 1 END, updated_at = strftime('%s','now') WHERE id = ?`
  ).run(id);
  return db.prepare('SELECT * FROM snippets WHERE id = ?').get(id) as SnippetRow | undefined;
}

function normalizeShortcode(raw: string | null | undefined): string | null {
  if (raw == null || raw === '') return null;
  const s = raw.trim().toLowerCase().replace(/^:/, '');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(s)) return null;
  return s;
}

export function resolveSnippetByShortcode(token: string): SnippetRow | null {
  const db = getDb();
  migrateSnippetsColumns(db);
  const s = normalizeShortcode(token);
  if (!s) return null;
  const row = db
    .prepare(
      `SELECT * FROM snippets WHERE shortcode IS NOT NULL AND LOWER(shortcode) = ? LIMIT 1`
    )
    .get(s) as SnippetRow | undefined;
  if (row) return row;
  const byTitleDash = db
    .prepare(`SELECT * FROM snippets WHERE LOWER(REPLACE(title, ' ', '-')) = ? LIMIT 1`)
    .get(s) as SnippetRow | undefined;
  if (byTitleDash) return byTitleDash;
  const titleSpaced = s.replace(/-/g, ' ');
  return (
    (db.prepare(`SELECT * FROM snippets WHERE LOWER(title) = ? LIMIT 1`).get(titleSpaced) as
      | SnippetRow
      | undefined) ?? null
  );
}

export interface SnippetExportEntry {
  title: string;
  content: string;
  variables: string[];
  tags: string[];
  category?: string;
  shortcode?: string | null;
  is_pinned?: number;
}

export function exportSnippetsJson(): string {
  const rows = getSnippets();
  const snippets: SnippetExportEntry[] = rows.map((r) => {
    let variables: string[] = [];
    let tags: string[] = [];
    try {
      variables = JSON.parse(r.variables || '[]') as string[];
    } catch {
      variables = [];
    }
    try {
      tags = JSON.parse(r.tags || '[]') as string[];
    } catch {
      tags = [];
    }
    return {
      title: r.title,
      content: r.content,
      variables,
      tags,
      category: r.category || '',
      shortcode: r.shortcode,
      is_pinned: r.is_pinned,
    };
  });
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), snippets }, null, 2);
}

export function incrementSnippetUseCount(id: number): void {
  const db = getDb();
  migrateSnippetsColumns(db);
  db.prepare(`UPDATE snippets SET use_count = COALESCE(use_count, 0) + 1 WHERE id = ?`).run(id);
}

/** All snippets with stable sync_uid (for E2E sync). */
export function getAllSnippetsForSync(): SnippetRow[] {
  const db = getDb();
  migrateSnippetsColumns(db);
  const rows = db.prepare(`SELECT * FROM snippets ORDER BY id`).all() as SnippetRow[];
  for (const r of rows) {
    if (!r.sync_uid?.trim()) {
      const u = randomUUID();
      db.prepare('UPDATE snippets SET sync_uid = ? WHERE id = ?').run(u, r.id);
      r.sync_uid = u;
    }
  }
  return rows;
}

export function upsertSnippetFromSync(entry: {
  sync_uid: string;
  title: string;
  content: string;
  variables: string;
  tags: string;
  category: string;
  shortcode: string | null;
  created_at: number;
  updated_at: number;
  is_pinned: number;
  use_count: number;
}): void {
  const db = getDb();
  migrateSnippetsColumns(db);
  const existing = db.prepare('SELECT id, updated_at FROM snippets WHERE sync_uid = ?').get(entry.sync_uid) as
    | { id: number; updated_at: number }
    | undefined;
  const shortcode = normalizeShortcode(entry.shortcode);
  if (!existing) {
    db.prepare(
      `INSERT INTO snippets (title, content, variables, tags, category, shortcode, sync_uid, created_at, updated_at, is_pinned, use_count)
       VALUES (@title, @content, @variables, @tags, @category, @shortcode, @sync_uid, @created_at, @updated_at, @is_pinned, @use_count)`
    ).run({ ...entry, shortcode });
    return;
  }
  if (entry.updated_at <= existing.updated_at) return;
  db.prepare(
    `UPDATE snippets SET title=@title, content=@content, variables=@variables, tags=@tags, category=@category,
     shortcode=@shortcode, updated_at=@updated_at, is_pinned=@is_pinned, use_count=@use_count WHERE id=@id`
  ).run({ ...entry, shortcode, id: existing.id });
}

export function importSnippetsJson(jsonText: string): { imported: number; errors: string[] } {
  const db = getDb();
  migrateSnippetsColumns(db);
  const errors: string[] = [];
  let imported = 0;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch (e) {
    errors.push('Invalid JSON');
    return { imported: 0, errors };
  }
  const root = parsed as { snippets?: unknown };
  const arr = Array.isArray(root) ? parsed : root.snippets;
  if (!Array.isArray(arr)) {
    errors.push('Expected an array or { snippets: [] }');
    return { imported: 0, errors };
  }
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const title = String(o['title'] ?? '').trim();
    const content = String(o['content'] ?? '');
    if (!title) {
      errors.push('Skipped entry without title');
      continue;
    }
    const varsArr = Array.isArray(o['variables']) ? o['variables'].map(String) : [];
    const tagsArr = Array.isArray(o['tags']) ? o['tags'].map(String) : [];
    const category = String(o['category'] ?? '').trim();
    const shortcode = o['shortcode'] != null ? String(o['shortcode']) : null;
    const isPinned = o['is_pinned'] === 1 || o['is_pinned'] === true ? 1 : 0;
    try {
      const r = db
        .prepare(
          `INSERT INTO snippets (title, content, variables, tags, category, shortcode, created_at, updated_at, is_pinned)
           VALUES (@title, @content, @variables, @tags, @category, @shortcode, strftime('%s','now'), strftime('%s','now'), @is_pinned)`
        )
        .run({
          title,
          content,
          variables: JSON.stringify(varsArr),
          tags: JSON.stringify(tagsArr),
          category,
          shortcode: normalizeShortcode(shortcode),
          is_pinned: isPinned,
        });
      if (Number(r.changes) > 0) imported++;
    } catch (e) {
      errors.push(`Failed: ${title}: ${String(e)}`);
    }
  }
  return { imported, errors };
}

/** Upsert snippets from an org-published JSON feed (Enterprise); stable id from title+content hash. */
export function importOrgSnippetsFeedJson(jsonText: string): { imported: number; errors: string[] } {
  const errors: string[] = [];
  let imported = 0;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch {
    return { imported: 0, errors: ['Invalid JSON'] };
  }
  const root = parsed as { snippets?: unknown };
  const arr = Array.isArray(root) ? parsed : root.snippets;
  if (!Array.isArray(arr)) {
    return { imported: 0, errors: ['Expected an array or { snippets: [] }'] };
  }
  const now = Math.floor(Date.now() / 1000);
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const title = String(o['title'] ?? '').trim();
    const content = String(o['content'] ?? '');
    if (!title) {
      errors.push('Skipped entry without title');
      continue;
    }
    const varsArr = Array.isArray(o['variables']) ? o['variables'].map(String) : [];
    const tagsArr = Array.isArray(o['tags']) ? o['tags'].map(String) : [];
    let category = String(o['category'] ?? '').trim();
    if (!category) category = 'Organization';
    const shortcode = o['shortcode'] != null ? String(o['shortcode']) : null;
    const stable = createHash('sha256').update(`${title}\0${content}`).digest('hex').slice(0, 32);
    const sync_uid = `orgfeed:${stable}`;
    try {
      upsertSnippetFromSync({
        sync_uid,
        title,
        content,
        variables: JSON.stringify(varsArr),
        tags: JSON.stringify(tagsArr),
        category,
        shortcode: normalizeShortcode(shortcode),
        created_at: now,
        updated_at: now,
        is_pinned: 0,
        use_count: 0,
      });
      imported++;
    } catch (e) {
      errors.push(`Failed: ${title}: ${String(e)}`);
    }
  }
  return { imported, errors };
}
