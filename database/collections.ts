import { randomUUID } from 'crypto';
import { getDb, type ClipRow } from './db';

export interface CollectionRow {
  id: number;
  name: string;
  is_smart: number;
  query: string | null;
  sync_uid?: string | null;
  updated_at?: number;
  created_at: string;
  clip_count: number;
}

export function listCollectionsWithCounts(): CollectionRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT c.id, c.name, c.is_smart, c.query, c.sync_uid, c.updated_at, c.created_at,
              COALESCE(COUNT(cc.clip_id), 0) AS clip_count
       FROM collections c
       LEFT JOIN collection_clips cc ON cc.collection_id = c.id
       GROUP BY c.id
       ORDER BY c.name COLLATE NOCASE`
    )
    .all() as CollectionRow[];
}

export function createCollection(name: string, isSmart = 0, query: string | null = null): number {
  const db = getDb();
  const r = db
    .prepare(
      `INSERT INTO collections (name, is_smart, query, sync_uid, updated_at) VALUES (?, ?, ?, ?, strftime('%s','now'))`
    )
    .run(name.trim(), isSmart, query, randomUUID());
  return Number(r.lastInsertRowid);
}

export function deleteCollection(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM collections WHERE id = ?').run(id);
}

export function addClipToCollection(collectionId: number, clipId: number): void {
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO collection_clips (collection_id, clip_id) VALUES (?, ?)').run(
    collectionId,
    clipId
  );
}

export function removeClipFromCollection(collectionId: number, clipId: number): void {
  const db = getDb();
  db.prepare('DELETE FROM collection_clips WHERE collection_id = ? AND clip_id = ?').run(
    collectionId,
    clipId
  );
}

export function clipMatchesSmartQuery(clip: ClipRow, queryStr: string | null): boolean {
  if (!queryStr?.trim()) {
    return false;
  }
  let q: { type?: string; contains?: string; tag?: string; sourceContains?: string };
  try {
    q = JSON.parse(queryStr) as typeof q;
  } catch {
    return false;
  }
  const tf = (q.type ?? 'all').trim().toLowerCase();
  if (tf !== 'all' && clip.type !== tf) {
    return false;
  }
  if (q.contains && !clip.content.includes(q.contains)) {
    return false;
  }
  if (q.sourceContains && !(clip.source ?? '').includes(q.sourceContains)) {
    return false;
  }
  if (q.tag?.trim()) {
    let tags: string[] = [];
    try {
      const parsed = JSON.parse(clip.tags_json || '[]') as unknown;
      tags = Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      tags = [];
    }
    const want = q.tag.trim().toLowerCase();
    if (!tags.some((t) => t.toLowerCase() === want)) {
      return false;
    }
  }
  return true;
}

export function refreshSmartCollection(collectionId: number): void {
  const db = getDb();
  const col = db.prepare('SELECT is_smart, query FROM collections WHERE id = ?').get(collectionId) as
    | { is_smart: number; query: string | null }
    | undefined;
  if (!col || col.is_smart !== 1) {
    return;
  }
  db.prepare('DELETE FROM collection_clips WHERE collection_id = ?').run(collectionId);
  const clips = db.prepare('SELECT * FROM clips').all() as ClipRow[];
  for (const c of clips) {
    if (clipMatchesSmartQuery(c, col.query)) {
      addClipToCollection(collectionId, c.id);
    }
  }
}

export function tryAddClipToSmartCollections(clip: ClipRow): void {
  const db = getDb();
  const rows = db
    .prepare('SELECT id, query FROM collections WHERE is_smart = 1')
    .all() as { id: number; query: string | null }[];
  for (const r of rows) {
    if (clipMatchesSmartQuery(clip, r.query)) {
      addClipToCollection(r.id, clip.id);
    }
  }
}

export function exportCollectionsJson(): string {
  const db = getDb();
  const cols = db
    .prepare('SELECT id, name, is_smart, query, created_at FROM collections ORDER BY id')
    .all() as {
    id: number;
    name: string;
    is_smart: number;
    query: string | null;
    created_at: string;
  }[];
  const out: {
    name: string;
    is_smart: number;
    query: string | null;
    clip_ids: number[];
  }[] = [];
  for (const c of cols) {
    const ids = db
      .prepare('SELECT clip_id FROM collection_clips WHERE collection_id = ? ORDER BY clip_id')
      .all(c.id) as { clip_id: number }[];
    out.push({
      name: c.name,
      is_smart: c.is_smart,
      query: c.query,
      clip_ids: ids.map((x) => x.clip_id),
    });
  }
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), collections: out }, null, 2);
}

export function importCollectionsJson(jsonText: string): { imported: number; errors: string[] } {
  const errors: string[] = [];
  let imported = 0;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { imported: 0, errors: ['Invalid JSON'] };
  }
  const root = parsed as { collections?: unknown };
  const arr = Array.isArray(root.collections) ? root.collections : Array.isArray(parsed) ? parsed : null;
  if (!arr) {
    return { imported: 0, errors: ['Expected { collections: [] }'] };
  }
  const db = getDb();
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const name = String(o['name'] ?? '').trim();
    if (!name) {
      errors.push('Skipped collection without name');
      continue;
    }
    const isSmart = o['is_smart'] === 1 || o['is_smart'] === true ? 1 : 0;
    const query = o['query'] != null ? String(o['query']) : null;
    const clipIds = Array.isArray(o['clip_ids']) ? o['clip_ids'].map((x) => Number(x)).filter((n) => n > 0) : [];
    try {
      const cid = createCollection(name, isSmart, query);
      if (isSmart) {
        refreshSmartCollection(cid);
      } else {
        for (const clipId of clipIds) {
          const exists = db.prepare('SELECT 1 FROM clips WHERE id = ?').get(clipId);
          if (exists) addClipToCollection(cid, clipId);
        }
      }
      imported++;
    } catch (e) {
      errors.push(`${name}: ${String(e)}`);
    }
  }
  return { imported, errors };
}

export interface CollectionFullRow {
  id: number;
  name: string;
  is_smart: number;
  query: string | null;
  sync_uid?: string | null;
  updated_at?: number;
  created_at: string;
}

export function listCollectionsForSync(): CollectionFullRow[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM collections ORDER BY id`).all() as CollectionFullRow[];
  for (const r of rows) {
    if (!r.sync_uid?.trim()) {
      const u = randomUUID();
      db.prepare('UPDATE collections SET sync_uid = ?, updated_at = strftime(\'%s\',\'now\') WHERE id = ?').run(
        u,
        r.id
      );
      r.sync_uid = u;
    }
  }
  return rows;
}

export function findCollectionIdBySyncUid(syncUid: string): number | null {
  const db = getDb();
  const row = db.prepare('SELECT id FROM collections WHERE sync_uid = ?').get(syncUid) as
    | { id: number }
    | undefined;
  return row ? Number(row.id) : null;
}

export function upsertCollectionFromSync(entry: {
  sync_uid: string;
  name: string;
  is_smart: number;
  query: string | null;
  updated_at: number;
}): number {
  const db = getDb();
  const existing = findCollectionIdBySyncUid(entry.sync_uid);
  if (existing == null) {
    const r = db
      .prepare(
        `INSERT INTO collections (name, is_smart, query, sync_uid, updated_at) VALUES (?,?,?,?,?)`
      )
      .run(entry.name, entry.is_smart, entry.query, entry.sync_uid, entry.updated_at);
    const id = Number(r.lastInsertRowid);
    if (entry.is_smart === 1) {
      refreshSmartCollection(id);
    }
    return id;
  }
  const row = db.prepare('SELECT updated_at FROM collections WHERE id = ?').get(existing) as {
    updated_at: number;
  };
  if (entry.updated_at > row.updated_at) {
    db.prepare(`UPDATE collections SET name=?, is_smart=?, query=?, updated_at=? WHERE id=?`).run(
      entry.name,
      entry.is_smart,
      entry.query,
      entry.updated_at,
      existing
    );
    if (entry.is_smart === 1) {
      refreshSmartCollection(existing);
    }
  }
  return existing;
}

export function replaceManualCollectionClipsByUids(collectionId: number, clipUids: string[]): void {
  const db = getDb();
  db.prepare('DELETE FROM collection_clips WHERE collection_id = ?').run(collectionId);
  for (const uid of clipUids) {
    const clipRow = db.prepare('SELECT id FROM clips WHERE sync_uid = ?').get(uid) as
      | { id: number }
      | undefined;
    if (clipRow) {
      addClipToCollection(collectionId, clipRow.id);
    }
  }
}
