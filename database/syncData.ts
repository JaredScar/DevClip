import { randomUUID } from 'crypto';
import { getCachedTier } from './licenseCache';
import type { ClipType } from './db';
import {
  getClipById,
  getClips,
  getSettingsMap,
  findClipIdBySyncUid,
  getDb,
  insertClipFromSync,
  replaceClipTagsFromNames,
  setSetting,
  touchClipForSync,
  updateClipFromSync,
} from './db';
import { upsertAutomationFromSync, listAutomationRulesForSync } from './automation';
import {
  listCollectionsForSync,
  replaceManualCollectionClipsByUids,
  upsertCollectionFromSync,
} from './collections';
import { getAllSnippetsForSync, upsertSnippetFromSync } from './snippets';

export const SYNC_SETTING_KEYS = new Set([
  'theme',
  'uiFontScale',
  'uiDensity',
  'overlayPosition',
  'clipboardPollMs',
  'overlayFuzzySearch',
  'historyLimit',
  'ignoreApps',
  'ignorePatterns',
  'privateMode',
  'autoClearHistoryOnExit',
  'stagingPresetsJson',
]);

export interface SyncCategories {
  clips: boolean;
  snippets: boolean;
  collections: boolean;
  automation: boolean;
  settings: boolean;
  clipTypesAll: boolean;
  clipTypes: string[];
}

export interface SyncBundleV1 {
  format: 'devclip-sync';
  version: 1;
  exportedAt: number;
  deviceId: string;
  deviceLabel?: string;
  devices?: Record<string, { label: string; seenAt: number }>;
  categories?: SyncCategories;
  clips?: Array<{
    uid: string;
    lm: number;
    content: string;
    type: string;
    source: string | null;
    created_at: number;
    is_pinned: number;
    tags_json: string;
    use_count: number;
    metadata_json: string;
  }>;
  snippets?: Array<{
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
  }>;
  automation?: Array<{
    sync_uid: string;
    name: string;
    enabled: number;
    trigger: string;
    conditions: string;
    actions: string;
    updated_at: number;
  }>;
  collections?: Array<{
    sync_uid: string;
    name: string;
    is_smart: number;
    query: string | null;
    updated_at: number;
    clip_uids: string[];
  }>;
  settings?: Record<string, { v: string; t: number }>;
}

export function parseSyncCategories(raw: string | undefined): SyncCategories {
  const d: SyncCategories = {
    clips: true,
    snippets: true,
    collections: true,
    automation: true,
    settings: true,
    clipTypesAll: true,
    clipTypes: [],
  };
  if (!raw?.trim()) return d;
  try {
    const o = JSON.parse(raw) as Partial<SyncCategories>;
    return {
      ...d,
      ...o,
      clipTypes: Array.isArray(o.clipTypes) ? o.clipTypes.map(String) : [],
    };
  } catch {
    return d;
  }
}

function clipTypeAllowed(type: string, c: SyncCategories): boolean {
  if (!c.clips) return false;
  if (c.clipTypesAll) return true;
  return c.clipTypes.includes(type);
}

export function ensureSyncDeviceId(settings: Record<string, string>): string {
  let id = settings['syncDeviceId']?.trim();
  if (!id) {
    id = randomUUID();
    setSetting('syncDeviceId', id);
  }
  return id;
}

export function buildSyncBundleFromDb(): SyncBundleV1 {
  const settings = getSettingsMap();
  const cat = parseSyncCategories(settings['syncCategoriesJson']);
  const now = Math.floor(Date.now() / 1000);
  const deviceId = ensureSyncDeviceId(settings);
  const deviceLabel = settings['syncDeviceLabel']?.trim() || '';

  let devices: Record<string, { label: string; seenAt: number }> = {};
  try {
    devices = JSON.parse(settings['syncDevicesJson'] || '{}') as Record<
      string,
      { label: string; seenAt: number }
    >;
  } catch {
    devices = {};
  }
  devices[deviceId] = { label: deviceLabel || 'This device', seenAt: now };

  const bundle: SyncBundleV1 = {
    format: 'devclip-sync',
    version: 1,
    exportedAt: now,
    deviceId,
    deviceLabel,
    devices,
    categories: cat,
  };

  if (cat.clips) {
    const clipsOut: NonNullable<SyncBundleV1['clips']> = [];
    for (const row of getClips()) {
      if (!clipTypeAllowed(row.type, cat)) continue;
      touchClipForSync(row.id);
      const fresh = getClipById(row.id);
      if (!fresh?.sync_uid?.trim()) continue;
      clipsOut.push({
        uid: fresh.sync_uid.trim(),
        lm: Number(fresh.sync_lm ?? 0),
        content: fresh.content,
        type: fresh.type,
        source: fresh.source,
        created_at: fresh.created_at,
        is_pinned: fresh.is_pinned,
        tags_json: fresh.tags_json,
        use_count: fresh.use_count,
        metadata_json: fresh.metadata_json,
      });
    }
    bundle.clips = clipsOut;
  }

  if (cat.snippets) {
    bundle.snippets = getAllSnippetsForSync().map((r) => ({
      sync_uid: r.sync_uid!,
      title: r.title,
      content: r.content,
      variables: r.variables,
      tags: r.tags,
      category: r.category,
      shortcode: r.shortcode,
      created_at: r.created_at,
      updated_at: r.updated_at,
      is_pinned: r.is_pinned,
      use_count: r.use_count,
    }));
  }

  if (cat.automation) {
    bundle.automation = listAutomationRulesForSync().map((r) => ({
      sync_uid: r.sync_uid!,
      name: r.name,
      enabled: r.enabled,
      trigger: r.trigger,
      conditions: r.conditions,
      actions: r.actions,
      updated_at: Number(r.updated_at ?? 0),
    }));
  }

  if (cat.collections) {
    const db = getDb();
    bundle.collections = listCollectionsForSync().map((c) => {
      const uidRows = db
        .prepare(
          `SELECT cl.sync_uid FROM collection_clips cc
           JOIN clips cl ON cl.id = cc.clip_id
           WHERE cc.collection_id = ? ORDER BY cl.id`
        )
        .all(c.id) as { sync_uid: string | null }[];
      const clip_uids = uidRows.map((x) => x.sync_uid).filter((x): x is string => !!x?.trim());
      return {
        sync_uid: c.sync_uid!,
        name: c.name,
        is_smart: c.is_smart,
        query: c.query,
        updated_at: Number(c.updated_at ?? 0),
        clip_uids,
      };
    });
  }

  if (cat.settings) {
    const s: Record<string, { v: string; t: number }> = {};
    for (const key of SYNC_SETTING_KEYS) {
      if (settings[key] !== undefined) {
        s[key] = { v: settings[key]!, t: now };
      }
    }
    bundle.settings = s;
  }

  return bundle;
}

function mergeDevices(
  a: Record<string, { label: string; seenAt: number }> | undefined,
  b: Record<string, { label: string; seenAt: number }> | undefined
): Record<string, { label: string; seenAt: number }> {
  const out: Record<string, { label: string; seenAt: number }> = { ...a };
  for (const [k, v] of Object.entries(b ?? {})) {
    const prev = out[k];
    if (!prev || v.seenAt >= prev.seenAt) out[k] = v;
  }
  return out;
}

type SnippetSyncEntry = NonNullable<SyncBundleV1['snippets']>[number];
type AutomationSyncEntry = NonNullable<SyncBundleV1['automation']>[number];
type CollectionSyncEntry = NonNullable<SyncBundleV1['collections']>[number];
type ClipSyncEntry = NonNullable<SyncBundleV1['clips']>[number];

function mergeClipSyncEntries(
  a: ClipSyncEntry[] | undefined,
  b: ClipSyncEntry[] | undefined
): ClipSyncEntry[] {
  const m = new Map<string, ClipSyncEntry>();
  for (const x of [...(a ?? []), ...(b ?? [])]) {
    const prev = m.get(x.uid);
    if (!prev || x.lm > prev.lm) m.set(x.uid, x);
  }
  return [...m.values()];
}

function mergeSnippets(
  a: NonNullable<SyncBundleV1['snippets']> | undefined,
  b: NonNullable<SyncBundleV1['snippets']> | undefined
): NonNullable<SyncBundleV1['snippets']> {
  const m = new Map<string, SnippetSyncEntry>();
  for (const x of [...(a ?? []), ...(b ?? [])]) {
    const prev = m.get(x.sync_uid);
    if (!prev || x.updated_at > prev.updated_at) m.set(x.sync_uid, x);
  }
  return [...m.values()];
}

function mergeAutomation(
  a: NonNullable<SyncBundleV1['automation']> | undefined,
  b: NonNullable<SyncBundleV1['automation']> | undefined
): NonNullable<SyncBundleV1['automation']> {
  const m = new Map<string, AutomationSyncEntry>();
  for (const x of [...(a ?? []), ...(b ?? [])]) {
    const prev = m.get(x.sync_uid);
    if (!prev || x.updated_at > prev.updated_at) m.set(x.sync_uid, x);
  }
  return [...m.values()];
}

function mergeCollections(
  a: NonNullable<SyncBundleV1['collections']> | undefined,
  b: NonNullable<SyncBundleV1['collections']> | undefined
): NonNullable<SyncBundleV1['collections']> {
  const m = new Map<string, CollectionSyncEntry>();
  for (const x of [...(a ?? []), ...(b ?? [])]) {
    const prev = m.get(x.sync_uid);
    if (!prev || x.updated_at > prev.updated_at) m.set(x.sync_uid, x);
  }
  return [...m.values()];
}

function mergeSettings(
  a: SyncBundleV1['settings'] | undefined,
  b: SyncBundleV1['settings'] | undefined
): SyncBundleV1['settings'] {
  const out: Record<string, { v: string; t: number }> = { ...a };
  for (const [k, v] of Object.entries(b ?? {})) {
    if (!SYNC_SETTING_KEYS.has(k)) continue;
    const prev = out[k];
    if (!prev || v.t > prev.t) out[k] = v;
  }
  return out;
}

export function mergeSyncBundles(local: SyncBundleV1, remote: SyncBundleV1): SyncBundleV1 {
  const mergedClips = mergeClipSyncEntries(local.clips, remote.clips);

  return {
    format: 'devclip-sync',
    version: 1,
    exportedAt: Math.max(local.exportedAt, remote.exportedAt),
    deviceId: local.deviceId,
    deviceLabel: local.deviceLabel,
    categories: local.categories ?? remote.categories,
    devices: mergeDevices(local.devices, remote.devices),
    clips: mergedClips.length ? mergedClips : undefined,
    snippets: (() => {
      const s = mergeSnippets(local.snippets, remote.snippets);
      return s.length ? s : undefined;
    })(),
    automation: (() => {
      const s = mergeAutomation(local.automation, remote.automation);
      return s.length ? s : undefined;
    })(),
    collections: (() => {
      const s = mergeCollections(local.collections, remote.collections);
      return s.length ? s : undefined;
    })(),
    settings: mergeSettings(local.settings, remote.settings),
  };
}

export function applySyncBundleToDb(bundle: SyncBundleV1): {
  clips: number;
  snippets: number;
  automation: number;
  collections: number;
  settings: number;
} {
  const stats = { clips: 0, snippets: 0, automation: 0, collections: 0, settings: 0 };
  const cat = bundle.categories ?? parseSyncCategories(undefined);

  if (bundle.clips?.length && cat.clips) {
    for (const e of bundle.clips) {
      const localId = findClipIdBySyncUid(e.uid);
      if (localId == null) {
        const row = insertClipFromSync({
          content: e.content,
          type: e.type as ClipType,
          source: e.source,
          created_at: e.created_at,
          is_pinned: e.is_pinned,
          tags_json: e.tags_json,
          use_count: e.use_count,
          metadata_json: e.metadata_json,
          sync_uid: e.uid,
          sync_lm: e.lm,
        });
        let tagNames: string[] = [];
        try {
          tagNames = JSON.parse(e.tags_json || '[]') as string[];
        } catch {
          tagNames = [];
        }
        replaceClipTagsFromNames(row.id, tagNames);
        stats.clips++;
      } else {
        const local = getClipById(localId);
        if (local && e.lm > (local.sync_lm ?? 0)) {
          updateClipFromSync({
            id: localId,
            content: e.content,
            type: e.type as ClipType,
            source: e.source,
            created_at: e.created_at,
            is_pinned: e.is_pinned,
            tags_json: e.tags_json,
            use_count: e.use_count,
            metadata_json: e.metadata_json,
            sync_lm: e.lm,
          });
          let tagNames: string[] = [];
          try {
            tagNames = JSON.parse(e.tags_json || '[]') as string[];
          } catch {
            tagNames = [];
          }
          replaceClipTagsFromNames(localId, tagNames);
          stats.clips++;
        }
      }
    }
  }

  if (bundle.snippets?.length && cat.snippets) {
    for (const s of bundle.snippets) {
      upsertSnippetFromSync(s);
    }
    stats.snippets = bundle.snippets.length;
  }

  if (bundle.automation?.length && cat.automation) {
    for (const r of bundle.automation) {
      upsertAutomationFromSync(r);
    }
    stats.automation = bundle.automation.length;
  }

  if (bundle.collections?.length && cat.collections) {
    for (const c of bundle.collections) {
      const id = upsertCollectionFromSync({
        sync_uid: c.sync_uid,
        name: c.name,
        is_smart: c.is_smart,
        query: c.query,
        updated_at: c.updated_at,
      });
      if (c.is_smart !== 1) {
        replaceManualCollectionClipsByUids(id, c.clip_uids);
      }
    }
    stats.collections = bundle.collections.length;
  }

  if (bundle.settings && cat.settings) {
    for (const [k, ent] of Object.entries(bundle.settings)) {
      if (!SYNC_SETTING_KEYS.has(k)) continue;
      setSetting(k, ent.v);
      stats.settings++;
    }
  }

  return stats;
}

export function persistMergedDevicesJson(bundle: SyncBundleV1): void {
  const devs = bundle.devices ?? {};
  const keys = Object.keys(devs);
  if (getCachedTier() === 'enterprise') {
    setSetting('syncDevicesJson', JSON.stringify(devs));
    return;
  }
  if (keys.length > 5) {
    const sorted = [...keys].sort((a, b) => (devs[b]!.seenAt ?? 0) - (devs[a]!.seenAt ?? 0));
    const keep = sorted.slice(0, 5);
    const pruned: typeof devs = {};
    for (const k of keep) pruned[k] = devs[k]!;
    setSetting('syncDevicesJson', JSON.stringify(pruned));
  } else {
    setSetting('syncDevicesJson', JSON.stringify(devs));
  }
}

export function syncOutboxEnqueue(payloadB64: string): void {
  getDb().prepare('INSERT INTO sync_outbox (payload_b64) VALUES (?)').run(payloadB64);
}

export function syncOutboxList(): { id: number; payload_b64: string; attempts: number }[] {
  return getDb()
    .prepare('SELECT id, payload_b64, attempts FROM sync_outbox ORDER BY id ASC')
    .all() as { id: number; payload_b64: string; attempts: number }[];
}

export function syncOutboxRemove(id: number): void {
  getDb().prepare('DELETE FROM sync_outbox WHERE id = ?').run(id);
}

export function syncOutboxRecordFailure(id: number, err: string): void {
  getDb()
    .prepare('UPDATE sync_outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?')
    .run(String(err).slice(0, 500), id);
}

export function syncOutboxCount(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS c FROM sync_outbox').get() as { c: number };
  return Number(row.c) || 0;
}

export function parseSyncBundleJson(json: string): SyncBundleV1 {
  const o = JSON.parse(json) as SyncBundleV1;
  if (o.format !== 'devclip-sync' || o.version !== 1) {
    throw new Error('Invalid sync bundle');
  }
  return o;
}
