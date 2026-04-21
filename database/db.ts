import Database from 'better-sqlite3';
import { randomBytes, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export type ClipType =
  | 'sql'
  | 'json'
  | 'url'
  | 'code'
  | 'text'
  | 'email'
  | 'stack-trace'
  | 'secret'
  | 'image'
  | 'file-path';

export interface ClipRow {
  id: number;
  content: string;
  type: ClipType;
  source: string | null;
  created_at: number;
  is_pinned: number;
  tags_json: string;
  use_count: number;
  metadata_json: string;
  sync_uid?: string | null;
  sync_lm?: number;
}

export interface ClipSearchOptions {
  tagNames?: string[];
  dateFrom?: number;
  dateTo?: number;
  sourceApp?: string;
  /** When true, rank clips by fuzzy subsequence match instead of SQL LIKE. */
  fuzzy?: boolean;
}

/** One calendar day in local time, `YYYY-MM-DD` → clip count (captures that day). */
export interface ClipActivityDayRow {
  day: string;
  count: number;
}

export function getClipActivityByDayRange(startUnix: number, endUnix: number): ClipActivityDayRow[] {
  const db = getDb();
  const lo = Math.min(startUnix, endUnix);
  const hi = Math.max(startUnix, endUnix);
  const rows = db
    .prepare(
      `SELECT date(datetime(created_at, 'unixepoch', 'localtime')) AS day,
              COUNT(*) AS cnt
       FROM clips
       WHERE created_at >= ? AND created_at <= ?
       GROUP BY day
       ORDER BY day ASC`
    )
    .all(lo, hi) as { day: string; cnt: number }[];
  return rows.map((r) => ({ day: String(r.day), count: Number(r.cnt) || 0 }));
}

export const HISTORY_LIMIT_MIN = 100;
export const HISTORY_LIMIT_MAX = 1000;
export const HISTORY_LIMIT_DEFAULT = 1000;

let dbInstance: Database.Database | null = null;

function getSchemaPath(): string {
  if (process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, 'schema.sql'))) {
    return path.join(process.resourcesPath, 'schema.sql');
  }
  return path.join(__dirname, 'schema.sql');
}

function migrate(db: Database.Database): void {
  const cols = db.prepare('PRAGMA table_info(clips)').all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  if (cols.length === 0) return;
  if (!names.has('tags_json')) {
    db.exec(`ALTER TABLE clips ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'`);
  }
  if (!names.has('use_count')) {
    db.exec(`ALTER TABLE clips ADD COLUMN use_count INTEGER NOT NULL DEFAULT 0`);
  }
  if (!names.has('metadata_json')) {
    db.exec(`ALTER TABLE clips ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'`);
  }
  if (!names.has('sync_uid')) {
    db.exec(`ALTER TABLE clips ADD COLUMN sync_uid TEXT`);
  }
  if (!names.has('sync_lm')) {
    db.exec(`ALTER TABLE clips ADD COLUMN sync_lm INTEGER NOT NULL DEFAULT 0`);
  }
  const arCols = db.prepare('PRAGMA table_info(automation_rules)').all() as { name: string }[];
  if (arCols.length > 0) {
    const arNames = new Set(arCols.map((c) => c.name));
    if (!arNames.has('sync_uid')) {
      db.exec(`ALTER TABLE automation_rules ADD COLUMN sync_uid TEXT`);
    }
    if (!arNames.has('updated_at')) {
      db.exec(
        `ALTER TABLE automation_rules ADD COLUMN updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))`
      );
    }
  }
  const colCols = db.prepare('PRAGMA table_info(collections)').all() as { name: string }[];
  if (colCols.length > 0) {
    const colNames = new Set(colCols.map((c) => c.name));
    if (!colNames.has('sync_uid')) {
      db.exec(`ALTER TABLE collections ADD COLUMN sync_uid TEXT`);
    }
    if (!colNames.has('updated_at')) {
      db.exec(
        `ALTER TABLE collections ADD COLUMN updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))`
      );
    }
  }
  const vaultCols = db.prepare('PRAGMA table_info(vault_entries)').all() as { name: string }[];
  if (vaultCols.length > 0) {
    const vaultNames = new Set(vaultCols.map((c) => c.name));
    if (!vaultNames.has('sync_uid')) {
      db.exec(`ALTER TABLE vault_entries ADD COLUMN sync_uid TEXT`);
    }
  }
}

export function initDatabase(userDataPath: string): void {
  const dbPath = path.join(userDataPath, 'devclip.db');
  dbInstance = new Database(dbPath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');
  // Migrate existing `clips` rows BEFORE applying schema indexes (e.g. idx_clips_use_count)
  // that reference columns added after the original MVP schema.
  migrate(dbInstance);
  const schema = fs.readFileSync(getSchemaPath(), 'utf-8');
  dbInstance.exec(schema);
  dbInstance
    .prepare(`INSERT OR IGNORE INTO license (id, tier, features) VALUES (1, 'free', '[]')`)
    .run();
  ensureDefaultSettings();
  trimToLimit();
}

function ensureDefaultSettings(): void {
  const db = getDb();
  const defaults: Record<string, string> = {
    privateMode: '0',
    ignoreApps: '[]',
    ignorePatterns: '[]',
    historyLimit: String(HISTORY_LIMIT_DEFAULT),
    overlayShortcut: '',
    clipboardPollMs: '500',
    theme: 'dark',
    launchAtLogin: '0',
    overlayPosition: 'center',
    uiFontScale: '100',
    uiDensity: 'comfortable',
    overlayFuzzySearch: '0',
    autoClearHistoryOnExit: '0',
    stagingPresetsJson: '[]',
    licenseServerUrl: '',
    accountDashboardUrl: 'https://devclip.app/account',
    secureDeleteOnRemove: '0',
    proHistoryCap: '0',
    appLockEnabled: '0',
    appLockPinHash: '',
    vaultConfigured: '0',
    vaultSalt: '',
    vaultVerifier: '',
    vaultAutoSecret: '0',
    vaultRemoveFromHistoryOnAdd: '1',
    aiProvider: 'openai',
    aiModel: 'gpt-4o-mini',
    aiHostedBaseUrl: '',
    aiAppendToHistory: '1',
    syncEnabled: '0',
    syncRemoteUrl: '',
    syncCategoriesJson: '{"clips":true,"snippets":true,"collections":true,"automation":true,"settings":true,"clipTypesAll":true,"clipTypes":[]}',
    syncLastSyncAt: '',
    syncLastError: '',
    syncDeviceId: '',
    syncDeviceLabel: '',
    syncDevicesJson: '{}',
    integrationsOutboundEnabled: '0',
    integrationsOutboundUrl: '',
    integrationsPayloadFormat: 'zapier',
    integrationsNotionPageId: '',
    integrationsNotionOnCapture: '0',
    integrationsSlackWebhookUrl: '',
    integrationsSlackOnCapture: '0',
    integrationsJiraSite: '',
    integrationsJiraEmail: '',
    integrationsJiraCaptureIssueKey: '',
    integrationsJiraOnCapture: '0',
    enterpriseOrgDashboardUrl: 'https://devclip.app/org',
    enterprisePolicyUrl: '',
    enterprisePolicyLastOk: '',
    enterprisePolicyLastError: '',
    enterpriseOrgSnippetsFeedUrl: '',
    enterprisePolicyIgnoreApps: '[]',
    enterprisePolicyMaxHistory: '',
    enterprisePolicyDisableAi: '0',
    enterprisePolicyDisableSync: '0',
    enterprisePolicyForcePrivate: '0',
    /** 0 = unlimited; allowed: 30, 90, 180, 365, 730 (pruned on startup and when changed). */
    auditRetentionDays: '0',
    licenseKeyFingerprint: '',
  };
  for (const [k, v] of Object.entries(defaults)) {
    const row = db.prepare('SELECT 1 FROM settings WHERE key = ?').get(k);
    if (!row) {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(k, v);
    }
  }
}

export function clampHistoryLimit(n: number): number {
  if (!Number.isFinite(n)) return HISTORY_LIMIT_DEFAULT;
  return Math.min(HISTORY_LIMIT_MAX, Math.max(HISTORY_LIMIT_MIN, Math.round(n)));
}

export function getHistoryLimit(): number {
  try {
    const db = getDb();
    // Avoid static import cycle (db ↔ licenseCache).
    const { getCachedTier } = require('./licenseCache') as typeof import('./licenseCache');
    const tier = getCachedTier();
    if (tier === 'pro' || tier === 'enterprise') {
      const capRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('proHistoryCap') as
        | { value: string }
        | undefined;
      const cap = capRow ? parseInt(capRow.value, 10) : NaN;
      let lim = !Number.isFinite(cap) || cap <= 0 ? 2_000_000 : Math.min(Math.max(cap, 1000), 50_000_000);
      if (tier === 'enterprise') {
        const pol = db.prepare('SELECT value FROM settings WHERE key = ?').get('enterprisePolicyMaxHistory') as
          | { value: string }
          | undefined;
        const om = pol?.value ? parseInt(pol.value, 10) : NaN;
        if (Number.isFinite(om) && om > 0) {
          const clamped = Math.min(50_000_000, Math.max(HISTORY_LIMIT_MIN, om));
          lim = Math.min(lim, clamped);
        }
      }
      return lim;
    }
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('historyLimit') as
      | { value: string }
      | undefined;
    const v = row ? parseInt(row.value, 10) : HISTORY_LIMIT_DEFAULT;
    if (Number.isNaN(v)) return HISTORY_LIMIT_DEFAULT;
    return clampHistoryLimit(v);
  } catch {
    return HISTORY_LIMIT_DEFAULT;
  }
}

export function getDb(): Database.Database {
  if (!dbInstance) {
    throw new Error('Database not initialized');
  }
  return dbInstance;
}

export function trimToLimit(): void {
  const db = getDb();
  const max = getHistoryLimit();
  const count = db.prepare('SELECT COUNT(*) as c FROM clips').get() as { c: number };
  if (count.c <= max) return;
  const excess = count.c - max;
  db.prepare(
    `DELETE FROM clips WHERE id IN (
      SELECT id FROM clips WHERE is_pinned = 0 ORDER BY created_at ASC LIMIT ?
    )`
  ).run(excess);
}

export function clearAllClips(): void {
  const db = getDb();
  db.prepare('DELETE FROM clips').run();
}

export function insertClip(input: {
  content: string;
  type: ClipType;
  source: string | null;
  metadata?: Record<string, unknown>;
}): ClipRow {
  const db = getDb();
  const meta = JSON.stringify(input.metadata ?? {});
  const result = db
    .prepare(
      `INSERT INTO clips (content, type, source, created_at, is_pinned, tags_json, use_count, metadata_json)
       VALUES (@content, @type, @source, strftime('%s','now'), 0, '[]', 0, @metadata_json)`
    )
    .run({
      content: input.content,
      type: input.type,
      source: input.source,
      metadata_json: meta,
    });

  trimToLimit();

  return db.prepare('SELECT * FROM clips WHERE id = ?').get(result.lastInsertRowid) as ClipRow;
}

export function getClips(): ClipRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM clips
       ORDER BY is_pinned DESC, use_count DESC, created_at DESC
       LIMIT ?`
    )
    .all(getHistoryLimit()) as ClipRow[];
}

export function searchClips(
  query: string,
  typeFilter: string,
  options: ClipSearchOptions = {}
): ClipRow[] {
  const db = getDb();
  const q = query.trim();
  const params: (string | number)[] = [];

  let sql = `SELECT DISTINCT c.* FROM clips c`;
  const joins: string[] = [];
  const where: string[] = ['1=1'];

  const tagNames = options.tagNames?.filter(Boolean) ?? [];
  if (tagNames.length > 0) {
    tagNames.forEach((name, i) => {
      const alias = `ct${i}`;
      joins.push(
        `INNER JOIN clip_tags ${alias} ON ${alias}.clip_id = c.id INNER JOIN tags t${i} ON t${i}.id = ${alias}.tag_id AND LOWER(t${i}.name) = LOWER(?)`
      );
      params.push(name);
    });
  }

  if (joins.length) {
    sql += ' ' + joins.join(' ');
  }

  if (typeFilter && typeFilter !== 'all') {
    where.push('c.type = ?');
    params.push(typeFilter);
  }

  if (q.length > 0) {
    const escaped = q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    where.push(`c.content LIKE ? ESCAPE '\\'`);
    params.push(`%${escaped}%`);
  }

  if (options.dateFrom != null) {
    where.push('c.created_at >= ?');
    params.push(options.dateFrom);
  }
  if (options.dateTo != null) {
    where.push('c.created_at <= ?');
    params.push(options.dateTo);
  }
  if (options.sourceApp?.trim()) {
    const esc = options.sourceApp.trim().replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    where.push(`c.source LIKE ? ESCAPE '\\'`);
    params.push(`%${esc}%`);
  }

  sql += ` WHERE ${where.join(' AND ')}`;
  sql += ` ORDER BY c.is_pinned DESC, c.use_count DESC, c.created_at DESC LIMIT ?`;
  params.push(getHistoryLimit());

  return db.prepare(sql).all(...params) as ClipRow[];
}

/** Subsequence fuzzy score; 0 = no match. */
export function fuzzyScore(query: string, haystack: string): number {
  const q = query.trim().toLowerCase();
  if (!q.length) return 1;
  const hay = haystack.toLowerCase();
  let qi = 0;
  let score = 0;
  let consec = 0;
  for (let i = 0; i < hay.length && qi < q.length; i++) {
    if (hay[i] === q[qi]) {
      score += 10 + consec * 2;
      consec++;
      qi++;
    } else {
      consec = 0;
    }
  }
  return qi === q.length ? score : 0;
}

export function searchClipsFuzzy(
  query: string,
  typeFilter: string,
  options: ClipSearchOptions = {}
): ClipRow[] {
  const q = query.trim();
  const base = searchClips('', typeFilter, options);
  if (!q.length) return base;
  const limit = getHistoryLimit();
  const scored = base
    .map((row) => {
      const blob = `${row.content}\n${row.source ?? ''}`;
      return { row, s: fuzzyScore(q, blob) };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.row);
  return scored;
}

export function incrementClipUseCount(id: number): void {
  const db = getDb();
  db.prepare('UPDATE clips SET use_count = use_count + 1 WHERE id = ?').run(id);
}

export function getClipById(id: number): ClipRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM clips WHERE id = ?').get(id) as ClipRow | undefined;
}

export function togglePin(id: number): ClipRow | undefined {
  const db = getDb();
  db.prepare('UPDATE clips SET is_pinned = CASE WHEN is_pinned = 1 THEN 0 ELSE 1 END WHERE id = ?').run(
    id
  );
  touchClipForSync(id);
  return db.prepare('SELECT * FROM clips WHERE id = ?').get(id) as ClipRow | undefined;
}

function overwriteClipContentForSecureDelete(id: number): void {
  const db = getDb();
  const row = db.prepare('SELECT length(content) AS len FROM clips WHERE id = ?').get(id) as
    | { len: number }
    | undefined;
  if (!row || row.len <= 0) return;
  const len = Math.min(row.len, 2_000_000);
  const buf = randomBytes(len);
  let junk = '';
  for (let i = 0; i < len; i++) junk += String.fromCharCode(32 + (buf[i]! % 95));
  db.prepare('UPDATE clips SET content = ?, metadata_json = ? WHERE id = ?').run(junk, '{}', id);
}

export function deleteClip(id: number, options?: { secure?: boolean }): void {
  const db = getDb();
  if (options?.secure) {
    overwriteClipContentForSecureDelete(id);
  }
  db.prepare('DELETE FROM clips WHERE id = ?').run(id);
}

export function setClipPinned(id: number, pinned: 0 | 1): void {
  const db = getDb();
  db.prepare('UPDATE clips SET is_pinned = ? WHERE id = ?').run(pinned, id);
  touchClipForSync(id);
}

export function updateClipContent(id: number, content: string): void {
  const db = getDb();
  db.prepare('UPDATE clips SET content = ? WHERE id = ?').run(content, id);
  touchClipForSync(id);
}

/** Bumps sync_lm and ensures sync_uid for cross-device merge (LWW). */
export function touchClipForSync(id: number): void {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const row = db.prepare('SELECT sync_uid FROM clips WHERE id = ?').get(id) as
    | { sync_uid: string | null }
    | undefined;
  if (!row) return;
  const uid = row.sync_uid?.trim() ? row.sync_uid : randomUUID();
  db.prepare('UPDATE clips SET sync_uid = ?, sync_lm = ? WHERE id = ?').run(uid, now, id);
}

export function saveClip(input: {
  content: string;
  type: ClipType;
  source?: string | null;
}): ClipRow {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO clips (content, type, source, created_at, is_pinned, tags_json, use_count, metadata_json)
       VALUES (@content, @type, @source, strftime('%s','now'), 0, '[]', 0, '{}')`
    )
    .run({
      content: input.content,
      type: input.type,
      source: input.source ?? null,
    });
  const newId = Number(result.lastInsertRowid);
  const now = Math.floor(Date.now() / 1000);
  db.prepare('UPDATE clips SET sync_uid = ?, sync_lm = ? WHERE id = ?').run(randomUUID(), now, newId);
  trimToLimit();
  return db.prepare('SELECT * FROM clips WHERE id = ?').get(newId) as ClipRow;
}

export function insertClipFromSync(input: {
  content: string;
  type: ClipType;
  source: string | null;
  created_at: number;
  is_pinned: number;
  tags_json: string;
  use_count: number;
  metadata_json: string;
  sync_uid: string;
  sync_lm: number;
}): ClipRow {
  const db = getDb();
  const r = db
    .prepare(
      `INSERT INTO clips (content, type, source, created_at, is_pinned, tags_json, use_count, metadata_json, sync_uid, sync_lm)
       VALUES (@content, @type, @source, @created_at, @is_pinned, @tags_json, @use_count, @metadata_json, @sync_uid, @sync_lm)`
    )
    .run(input);
  const newId = Number(r.lastInsertRowid);
  trimToLimit();
  return db.prepare('SELECT * FROM clips WHERE id = ?').get(newId) as ClipRow;
}

export function updateClipFromSync(input: {
  id: number;
  content: string;
  type: ClipType;
  source: string | null;
  created_at: number;
  is_pinned: number;
  tags_json: string;
  use_count: number;
  metadata_json: string;
  sync_lm: number;
}): void {
  const db = getDb();
  db.prepare(
    `UPDATE clips SET content=@content, type=@type, source=@source, created_at=@created_at,
     is_pinned=@is_pinned, tags_json=@tags_json, use_count=@use_count, metadata_json=@metadata_json, sync_lm=@sync_lm
     WHERE id=@id`
  ).run(input);
}

export function findClipIdBySyncUid(uid: string): number | null {
  const db = getDb();
  const row = db.prepare('SELECT id FROM clips WHERE sync_uid = ?').get(uid) as { id: number } | undefined;
  return row ? Number(row.id) : null;
}

export function getSettingsMap(): Record<string, string> {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

export function listTags(): { id: number; name: string }[] {
  const db = getDb();
  return db.prepare('SELECT id, name FROM tags ORDER BY name COLLATE NOCASE').all() as {
    id: number;
    name: string;
  }[];
}

export function getOrCreateTagId(name: string): number {
  const db = getDb();
  const trimmed = name.trim();
  if (!trimmed) throw new Error('empty tag');
  const existing = db.prepare('SELECT id FROM tags WHERE LOWER(name) = LOWER(?)').get(trimmed) as
    | { id: number }
    | undefined;
  if (existing) return existing.id;
  const r = db.prepare('INSERT INTO tags (name) VALUES (?)').run(trimmed);
  return Number(r.lastInsertRowid);
}

/** Replaces clip_tags + tags_json from a JSON array of tag names (e.g. after sync import). */
export function replaceClipTagsFromNames(clipId: number, tagNames: string[]): void {
  const db = getDb();
  db.prepare('DELETE FROM clip_tags WHERE clip_id = ?').run(clipId);
  for (const raw of tagNames) {
    const name = String(raw ?? '').trim();
    if (!name) continue;
    const tagId = getOrCreateTagId(name);
    db.prepare('INSERT OR IGNORE INTO clip_tags (clip_id, tag_id) VALUES (?, ?)').run(clipId, tagId);
  }
  const tags = db
    .prepare(
      `SELECT t.name FROM clip_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.clip_id = ? ORDER BY t.name`
    )
    .all(clipId) as { name: string }[];
  db.prepare('UPDATE clips SET tags_json = ? WHERE id = ?').run(
    JSON.stringify(tags.map((t) => t.name)),
    clipId
  );
}

export function addTagToClip(clipId: number, tagName: string): void {
  const db = getDb();
  const tagId = getOrCreateTagId(tagName);
  db.prepare('INSERT OR IGNORE INTO clip_tags (clip_id, tag_id) VALUES (?, ?)').run(clipId, tagId);
  syncClipTagsJson(clipId);
}

export function removeTagFromClip(clipId: number, tagName: string): void {
  const db = getDb();
  const row = db.prepare('SELECT id FROM tags WHERE LOWER(name) = LOWER(?)').get(tagName.trim()) as
    | { id: number }
    | undefined;
  if (!row) return;
  db.prepare('DELETE FROM clip_tags WHERE clip_id = ? AND tag_id = ?').run(clipId, row.id);
  syncClipTagsJson(clipId);
}

function syncClipTagsJson(clipId: number): void {
  const db = getDb();
  const tags = db
    .prepare(
      `SELECT t.name FROM clip_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.clip_id = ? ORDER BY t.name`
    )
    .all(clipId) as { name: string }[];
  const json = JSON.stringify(tags.map((t) => t.name));
  db.prepare('UPDATE clips SET tags_json = ? WHERE id = ?').run(json, clipId);
  touchClipForSync(clipId);
}

export function getClipTags(clipId: number): string[] {
  const db = getDb();
  const tags = db
    .prepare(
      `SELECT t.name FROM clip_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.clip_id = ? ORDER BY t.name`
    )
    .all(clipId) as { name: string }[];
  return tags.map((t) => t.name);
}
