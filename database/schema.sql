CREATE TABLE IF NOT EXISTS clips (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  content       TEXT    NOT NULL,
  type          TEXT    NOT NULL DEFAULT 'text',
  source        TEXT,
  created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  is_pinned     INTEGER NOT NULL DEFAULT 0,
  tags_json     TEXT    NOT NULL DEFAULT '[]',
  use_count     INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT    NOT NULL DEFAULT '{}',
  sync_uid      TEXT,
  sync_lm       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_clips_type ON clips(type);
CREATE INDEX IF NOT EXISTS idx_clips_created ON clips(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clips_pinned ON clips(is_pinned);
CREATE INDEX IF NOT EXISTS idx_clips_use_count ON clips(use_count DESC);

CREATE TABLE IF NOT EXISTS snippets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  variables  TEXT    NOT NULL DEFAULT '[]',
  tags       TEXT    NOT NULL DEFAULT '[]',
  category   TEXT    NOT NULL DEFAULT '',
  shortcode  TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  is_pinned  INTEGER NOT NULL DEFAULT 0,
  use_count  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_snippets_created ON snippets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_snippets_pinned ON snippets(is_pinned);

CREATE TABLE IF NOT EXISTS tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE IF NOT EXISTS clip_tags (
  clip_id INTEGER NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (clip_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_clip_tags_tag ON clip_tags(tag_id);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- License validation cache (API key stored encrypted on disk via Electron safeStorage — see main process)
CREATE TABLE IF NOT EXISTS license (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  tier          TEXT    NOT NULL DEFAULT 'free',
  features      TEXT    NOT NULL DEFAULT '[]',
  expires_at    TEXT,
  cached_at     TEXT,
  device_count  INTEGER
);

CREATE TABLE IF NOT EXISTS automation_rules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  trigger     TEXT    NOT NULL,
  conditions  TEXT    NOT NULL,
  actions     TEXT    NOT NULL,
  sync_uid    TEXT,
  updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  created_at  TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS collections (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  is_smart    INTEGER NOT NULL DEFAULT 0,
  query       TEXT,
  sync_uid    TEXT,
  updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  created_at  TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS collection_clips (
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  clip_id       INTEGER NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  PRIMARY KEY (collection_id, clip_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_clips_clip ON collection_clips(clip_id);

CREATE TABLE IF NOT EXISTS vault_entries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  type          TEXT    NOT NULL DEFAULT 'text',
  title_hint    TEXT    NOT NULL DEFAULT '',
  ciphertext    BLOB    NOT NULL,
  sync_uid      TEXT
);

CREATE INDEX IF NOT EXISTS idx_vault_created ON vault_entries(created_at DESC);

CREATE TABLE IF NOT EXISTS sync_outbox (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  payload_b64 TEXT   NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS audit_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  category    TEXT    NOT NULL,
  action      TEXT    NOT NULL,
  detail_json TEXT    NOT NULL DEFAULT '{}',
  actor_hint  TEXT    NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_events(ts DESC);
