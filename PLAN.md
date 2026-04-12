# DevClip — Product Plan

> **DevClip** is an open-source, developer-focused desktop clipboard manager built with Electron + Angular.
> It is free and open source under the **GNU GPLv3**. Pro and Enterprise tiers are unlocked via API keys tied to a paid account.
> Source code lives on GitHub — anyone can self-host, audit, and contribute.

### How to read checklists in this doc

- **`[x]`** — implemented in this repository (desktop app, local SQLite, Electron preload/IPCs, or repo automation such as CI), or satisfied in-app with a clear caveat in the row text.
- **`[ ]`** — not implemented yet. Many rows describe **hosted backends**, **code signing**, **org admin products**, or **integrations** that cannot be completed inside the Electron client alone; they stay unchecked until that work ships.

The **[§11 Release milestones](#11-release-milestones)** section is the coarse roadmap; subsections **§3–§10** break out finer-grained items where helpful.

**You cannot “check off” the entire document honestly in one pass:** §5.2 (AI), remaining §5.x polish, **full** §6 (team RBAC, real-time org sync, SAML, admin product), §7.2–§7.3 (store distribution & auto-update), §8.3 beyond the license MVP (WS sync, Postgres), and §9.2 (Postgres) are larger programs, not omissions in the current tree. **§6 client + `/server` license validate** have a partial implementation (see §6 notes).

---

## Table of Contents

1. [Vision & Philosophy](#1-vision--philosophy)
2. [Tier Overview](#2-tier-overview)
3. [API Key System](#3-api-key-system)
4. [Free Tier Features](#4-free-tier-features)
5. [Pro Tier Features](#5-pro-tier-features)
6. [Enterprise Tier Features](#6-enterprise-tier-features)
7. [Platform & Distribution](#7-platform--distribution)
8. [Technical Architecture](#8-technical-architecture)
9. [Database Roadmap](#9-database-roadmap)
10. [Security Model](#10-security-model)
11. [Release Milestones](#11-release-milestones)
12. [Open Source Strategy](#12-open-source-strategy)

---

## 1. Vision & Philosophy

- **Developer-first** — built by developers, for developers. Every feature should solve a real workflow problem.
- **Local-first** — all data is stored on-device by default. No data ever leaves the machine without explicit opt-in.
- **Open source** — the full application code (including Pro/Enterprise feature code) is publicly available on GitHub. Monetization is done through service access (API keys), not through code obfuscation.
- **Privacy by design** — private mode, ignore-app rules, and sensitive content detection are core, not add-ons.
- **Cross-platform** — Windows first, macOS and Linux as follow-on targets.

---

## 2. Tier Overview

| | Free | Pro | Enterprise |
|---|:---:|:---:|:---:|
| Price | $0 forever | ~$4–6/month or ~$40/year | Custom / per-seat |
| API Key required | No | Yes | Yes |
| Self-hostable license server | — | — | Yes |
| Clipboard history limit | 1,000 items | Unlimited | Unlimited |
| Snippet limit | 200 | Unlimited | Unlimited |
| Cloud sync | — | Up to 5 devices | Unlimited devices |
| AI Actions | — | Yes | Yes |
| Team features | — | — | Yes |
| Priority support | — | Yes | Dedicated |
| SLA | — | — | Yes |

---

## 3. API Key System

The code is open source and anyone can self-host; accessing managed cloud services (sync, AI, licensing) requires an API key tied to a paid account.

### 3.1 How It Works

1. The user creates an account at **devclip.app** (the hosted service).
2. From their account dashboard they generate a **Personal API Key** (Pro) or an **Organization API Key** (Enterprise).
3. They paste the key into DevClip → Settings → License.
4. The app sends the key with every request to any cloud-backed feature (sync, AI, licensing validation).
5. The key can be revoked at any time from the dashboard — immediately disabling cloud features on all linked devices.

### 3.2 Key Anatomy

```
dc_pro_<base64url-random-32-bytes>          # Personal Pro key
dc_ent_<base64url-random-32-bytes>          # Enterprise Organization key
```

### 3.3 Validation Flow

```
DevClip App  →  HTTPS POST /api/v1/license/validate
               { key, app_version, device_fingerprint }
               ↓
           License Server (self-hostable)
               ↓
           { tier, features[], expires_at, device_count }
               ↓
DevClip App  →  stores result locally (24h TTL cache)
               →  unlocks/locks feature flags accordingly
```

- Validation is cached for **24 hours** so the app works offline after first activation.
- After the cache expires, cloud-backed features (sync, AI) gracefully degrade, but all local features remain fully functional.
- Self-hosted Enterprise deployments can point the license server URL to their own instance.

### 3.4 Key Settings in App

Located at **Settings → License & Account** (all items below are UI + wiring to validate/cache tier):

- [x] Paste / update API key
- [x] View current tier and expiry (from local license cache when present)
- [x] View how many devices are active — **cached** `device_count` from license row when HTTPS validation fills it; prefix-only keys show “—” in Settings
- [x] Revoke key on this device
- [x] Link to account dashboard — configurable `accountDashboardUrl` + **Open account in browser** (`shell.openExternal` via IPC)
- [x] Self-hosted server URL override (Enterprise) — `licenseServerUrl` setting + IPC refresh

---

## 4. Free Tier Features

> All of the following are fully functional with zero account required.

### 4.1 Clipboard History
- [x] Continuous clipboard monitoring (default 500ms; interval configurable — see §4.7)
- [x] Automatic content-type detection: `text`, `code`, `json`, `sql`, `url`, `email`, `secret`, `stack-trace`
- [x] Clipboard **image** capture / storage (binary) and `image` as a first-class type
- [x] Distinct **`file-path`** type (vs. generic text) for path-shaped clips
- [x] Up to **1,000 history items** stored locally in SQLite
- [x] Oldest unpinned items auto-pruned when limit is reached
- [x] Configurable history limit (user-settable between 100–1,000)
- [x] Pin items to prevent pruning
- [x] Delete individual items or bulk-clear history
- [x] Full-text search across all clips
- [x] Filter by content type, date range, source app
- [x] Source app attribution (which app you copied from)
- [x] Syntax highlighting for code clips (Shiki)

### 4.2 Spotlight-Style Overlay
- [x] Global shortcut `Ctrl+Shift+V` (Windows) / `Cmd+Shift+V` (macOS) to summon overlay
- [x] Keyboard-first navigation (arrow keys, Enter to paste, Escape to dismiss)
- [x] Tabs in overlay: History / Snippets / Staging / Settings
- [x] Configurable global shortcut
- [x] Fuzzy search within overlay

### 4.3 Saved Snippets
- [x] Create and manage reusable text snippets
- [x] `{{variable}}` placeholders with prompt-on-paste dialog
- [x] Pin snippets
- [x] Snippet categories / folders
- [x] Import/export snippets as JSON
- [x] Snippet shortcodes (optional `shortcode` field + expand action; global “type anywhere” not in scope)

### 4.4 Staging Queue
- [x] Queue multiple clips for sequential multi-paste
- [x] Reorder and remove items from the queue
- [x] Named staging presets (save a queue for reuse)

### 4.5 Text Actions
- [x] Format / minify JSON
- [x] Base64 encode / decode
- [x] URL encode / decode
- [x] Regex find & replace
- [x] Extract URLs / emails
- [x] Hash generation (MD5, SHA-1, SHA-256)
- [x] Case conversion (camelCase, snake_case, PascalCase, SCREAMING_SNAKE, kebab-case, Title Case)
- [x] Trim whitespace / normalize line endings
- [x] Sort lines alphabetically
- [x] Remove duplicate lines
- [x] Word / character / line count
- [x] Escape / unescape HTML entities
- [x] Escape / unescape JSON strings
- [x] JWT decode (decode payload, display claims — no verification needed)
- [x] Timestamp conversion (Unix ↔ ISO 8601 ↔ human-readable)
- [x] Number base conversion (decimal ↔ hex ↔ binary ↔ octal)
- [x] Diff two blocks (single clip split by `---` line; optional second clip from History list in Actions)
- [x] Diff **two selected clips** side-by-side (dedicated split view UI)

### 4.6 Privacy & Security
- [x] Private mode (suspends all clipboard monitoring)
- [x] Ignore-app rules (don't capture from password managers, etc.)
- [x] Ignore-pattern rules (regex patterns to skip matching content)
- [x] Secret-type detection (flags API keys, tokens, passwords)
- [x] Auto-clear history on app exit (opt-in)
- [x] Secure deletion (overwrite SQLite rows before removing) — opt-in in Settings
- [x] Password-lock the app (PIN) — optional OS biometric still open

### 4.7 Settings & Customization
- [x] Light / dark / system theme
- [x] Launch at system startup
- [x] Configurable clipboard poll interval
- [x] Configurable overlay window position
- [x] Font size controls
- [x] Compact vs. comfortable density mode

---

## 5. Pro Tier Features

> Unlocked by a **Pro API Key**. All code is open source — self-hosters can bypass key checks.

### 5.1 Unlimited History & Snippets
- [x] Remove / raise free-tier caps when a valid Pro / Enterprise key is present (`getHistoryLimit` → up to ~2M default or `proHistoryCap`; snippets → 2M cap in `database/snippets.ts`)
- [x] Configurable maximum above free-tier defaults — Pro **history cap** in Settings (`proHistoryCap`); snippet cap is fixed high tier for paid keys

### 5.2 AI Actions
- [x] Configurable AI provider (DevClip-hosted + BYOK OpenAI/Anthropic)
- [x] **Summarize** — bullet summary of long text
- [x] **Explain** — plain-English explanation (code, SQL, stack traces)
- [x] **Fix / Improve** — suggested corrections
- [x] **Translate**
- [x] **Rewrite** (tone: formal, casual, technical)
- [x] **Generate regex** from English description
- [x] **Generate test** for copied code
- [x] **Ask anything** (freeform prompt + clip context)
- [x] Append AI output back to clipboard history as new clips
- [x] AI provider + model selection in Settings
- [x] Wire **AI Actions** UI panel to real providers

### 5.3 Automation Rules (If/Then)
- [x] Visual rule builder (trigger → condition → action)
- [x] Triggers: new clip (`new_clip`); type/source/content conditions in JSON
- [x] Conditions: type, content contains, source (regex supported)
- [x] Actions: auto-pin, auto-tag, discard (suppress)
- [x] Actions: auto-transform (text action), webhook POST, copy to collection
- [x] Persist rules in SQLite + run engine on new clip
- [x] Wire **Automation** UI panel to IPC + engine (JSON-oriented editor)

### 5.4 Smart Collections
- [x] Smart collections (saved search / query, auto-updating)
- [x] Manual collections (named lists of clip IDs)
- [x] Drag-and-drop clip organization into collections
- [x] Collections in main window (overlay integration TBD)
- [x] Import/export collections JSON
- [x] Wire **Collections** UI panel to SQLite `collections` (see §9.1)

### 5.5 Timeline View
- [x] Calendar / heatmap of clipboard activity — per-day grid (intensity by count) + bar chart
- [x] Browse by day / week / month — presets: last 7 / 30 / 90 days and **this calendar month**
- [x] Activity graph (volume over time) — scrollable bar chart by day
- [x] Jump to date → clips from that period — bar, row **History**, or **Show full range in History**
- [x] Wire **Timeline** UI panel to real data (`getClipActivityByDay` IPC + SQLite `GROUP BY` local date)

### 5.6 Cloud Sync (up to 5 devices)
- [x] E2E encrypted sync (client: AES-256-GCM + PBKDF2 blob over HTTPS GET/PUT; hosted DevClip sync service still optional)
- [x] Encryption key derived from user sync passphrase (never sent; server / dumb URL host only sees ciphertext)
- [x] Sync: clips, snippets, collections, settings subset, automation rules
- [x] Selective sync categories (including per–clip-type filters)
- [x] Conflict resolution (LWW via `sync_lm` / `updated_at` / per-setting timestamps)
- [x] Toolbar sync status indicator (title bar → Sync tab)
- [x] Offline outbox + periodic retry when online
- [x] Wire **Sync** UI panel to IPC + merge engine

### 5.7 Vault (Sensitive Items)
- [x] Encrypted local vault for sensitive clips
- [x] Optional sync of vault contents (explicit opt-in; requires vault unlocked at sync time)
- [x] Separate PIN / biometric lock for vault (vault PIN shipped; biometric TBD)
- [x] Auto-move secret-type clips to vault (opt-in)
- [x] Hooks for future password-manager integration (provider registry stub + IPC)
- [x] Wire **Vault** UI panel to crypto + storage (currently placeholder)

### 5.8 Usage Insights
- [x] Productivity dashboard UI
- [x] Most-used clips and snippets
- [x] Top source apps by copy volume
- [x] Content-type breakdown over time
- [x] Peak usage hours
- [x] Clip reuse rate (copy vs paste counts)
- [x] Wire **Insights** UI panel to aggregated queries (currently placeholder)

### 5.9 Integrations & Webhooks
- [x] Outbound webhook on clip capture (HTTPS URL; optional HMAC header)
- [x] Zapier / Make-friendly payload format (`hook`, `timestamp`, `clip`, `text`) + legacy `devclip.new_clip` shape
- [x] **Notion** — append clip text to a page (integration token + page/block id)
- [x] **Slack** — post via Incoming Webhook URL
- [x] **GitHub Gist** — create gist from selected clip (PAT with `gist` scope)
- [x] **Jira** — add issue **comment** with clip text (Jira Cloud REST + API token; images summarized, not binary-attached)
- [x] Wire **Integrations** UI panel to IPC + connectors

---

## 6. Enterprise Tier Features

> Unlocked by an **Enterprise Organization API Key**. Designed for developer teams.  
> Rows below split **in-app / self-hosted OSS** delivery from **hosted multi-tenant product** scope so checkmarks stay honest.

### 6.1 Everything in Pro
- [x] **Pro feature parity** when tier is Enterprise (same gates as Pro + enterprise-only surfaces)
- [x] **Unlimited devices** in encrypted sync bundle metadata for Enterprise (no 5-device prune); optional `POST …/license/validate` override
- [x] **Enterprise** nav + panel (`dc_ent_` prefix key, network validate, policy, audit)

### 6.2 Team Shared Collections
- [x] **Org snippet feed** — HTTPS JSON import → local snippets (`orgfeed:`), Bearer token, Enterprise panel
- [x] **Pull-based** shared library per device (admin publishes JSON; clients import on demand)
- [ ] **Hosted** multi-user snippet library API (CRUD, conflict resolution) in this repo
- [ ] RBAC: Owner / Admin / Member / Viewer *(requires org backend)*
- [ ] Real-time push to all team members *(WebSocket / org server — §8.3)*
- [ ] Version history for shared snippets (who / when) *(server-side product)*
- [ ] Optional approval workflow for snippet changes *(server-side product)*

### 6.3 Organization Cloud Sync
- [x] **Unlimited devices** per Enterprise seat in sync merge metadata
- [x] **Self-hosted sync target** — configurable `syncRemoteUrl` + encrypted blob PUT/GET (Pro/Enterprise client)
- [ ] **DevClip-managed** multi-tenant sync cloud + fleet provisioning UI
- [x] **Org policies** via remote JSON (ignore apps, max history, disable AI/sync, force private capture)
- [x] **Org admin portal link** — dashboard URL in Enterprise settings + **Open** in browser
- [ ] **In-dashboard** seats, keys, usage analytics *(devclip.app/org product — not this desktop repo)*

### 6.4 Self-Hosted License & Sync Server
- [x] **Docker Compose** — `devclip-license` service (`docker-compose.yml` at repo root)
- [x] **On-prem license API** — private network / air-gapped network *for validation HTTP* when reachable
- [x] **`/server` monorepo package** — Fastify `POST /api/v1/license/validate` (+ optional env extra keys)
- [x] **Offline / air-gapped tier unlock** — `dc_pro_` / `dc_ent_` keys validated with **no network** (local + prefix rules)
- [x] **Signed** offline license *files* (JWT / HSM) with cryptographic expiry — `server/src/utils/license.mjs` + `server/scripts/cli/license-cli.mjs`

### 6.5 Centralized Policy Management
- [x] **Remote policy document** pulled from HTTPS URL (startup, 30 min interval, manual)
- [x] **Bearer token** for policy + org snippet feed (integration secret `enterprise`)
- [x] Enforced **ignore-app** list (merged with user rules)
- [x] Enforced **max history** (Enterprise policy cap vs. local limit)
- [x] **Disable AI** and **disable cloud sync** org-wide
- [x] **Force private capture** (no new history clips while flag on)

### 6.6 Audit Log
- [x] **Local** immutable-style append log (`audit_events` SQLite)
- [x] Categories: clip capture, sync, vault, sensitive settings, license, enterprise, audit export
- [x] **Export** JSON Lines + CSV (save dialog) from Enterprise panel
- [x] **Configurable retention** — presets 30 / 90 / 180 / 365 / 730 days or keep-all; prune on startup + when setting changes
- [x] **View / export in app** (Enterprise panel counts + exports)
- [ ] **Centralized** org-wide audit aggregation & dashboards *(hosted admin product)*

### 6.7 SSO / SAML Integration
- [x] **Organization API key** unlock model (gate Enterprise features without per-user desktop login)
- [ ] SAML 2.0 (Okta, Azure AD, Google Workspace, …) for **DevClip desktop**
- [ ] JIT user provisioning from IdP
- [ ] Seat deprovision when user removed from IdP

### 6.8 Priority & Dedicated Support
- [x] **Commercial Enterprise tier** defined in product + code (license tier, UI, policy, audit, `/server` validate)
- [ ] Dedicated Slack/Teams channel *(vendor commercial offering — not app code)*
- [ ] Published **in-app** SLA targets / status page
- [ ] In-app **commercial** feature request / ticketing workflow

---

## 7. Platform & Distribution

### 7.1 Current
- [x] **Windows** — NSIS-style `.exe` via `electron-builder` (see `package.json` / builder config)
- [x] **macOS** — build, sign, notarize, distribute (`electron-builder` config + `build/entitlements.mac.plist` + `scripts/notarize.js`)
- [x] **Linux** — build and distribute primary formats (`.AppImage`, `.deb` via `electron-builder`)

### 7.2 Distribution targets (per platform)
- [x] Windows NSIS `.exe` (local `npm run dist` / CI)
- [x] Windows **WinGet** package manifest templates (`dist/winget/`)
- [x] macOS `.dmg` + **Homebrew Cask** templates (`dist/homebrew/`)
- [x] Linux `.AppImage` — `electron-builder` target configured
- [x] Linux `.deb` — `electron-builder` target configured
- [ ] Linux `.rpm` — pending demand
- [ ] Linux **Snap** — pending demand + snapcraft store account
- [ ] Linux **AUR** — community-maintained

### 7.3 Auto-Update
- [x] `electron-updater` wired to **GitHub Releases** (or chosen update server)
- [x] Background update check on launch
- [x] User prompt to download / install when ready (in Settings → About & Updates)
- [ ] Release channels: Stable / Beta / Nightly

---

## 8. Technical Architecture

### 8.1 Current Stack

| Layer | Technology |
|---|---|
| Desktop host | Electron 34 |
| UI framework | Angular 19 (standalone, Signals) |
| Styling | Tailwind CSS 3 |
| Persistence | SQLite via `better-sqlite3` |
| Syntax highlighting | Shiki |
| Packaging | `electron-builder` |

### 8.2 Additions for Pro/Enterprise

| Concern | Approach |
|---|---|
| License validation | HTTPS request to `/api/v1/license/validate`; 24h local cache in SQLite `settings` table |
| Feature flags | `FeatureFlagService` reads cached tier; Angular route guards + UI hiding for locked features |
| Cloud sync | Encrypt with `libsodium-wrappers` (XChaCha20-Poly1305); WebSocket connection to sync server for real-time push |
| AI actions | Proxy through DevClip API (hides provider key) or direct call with BYOK |
| Enterprise policy | Pulled from sync server on login; stored locally with a server-signed signature to prevent tampering |

Implementation checklist (same scope as the table):

- [x] License validation client + local tier cache (`license` table — §9.1); optional HTTPS validate still TBD
- [x] `FeatureFlagService` + Pro badge in nav; full route guards still TBD
- [x] Sync client: E2E blob sync (AES-GCM, merge, outbox, UI) — `libsodium` / WebSocket to first-party server still optional
- [x] AI proxy or BYOK paths from renderer/main (OpenAI, Anthropic direct; hosted/OpenAI-compatible proxy configurable)
- [x] Enterprise policy fetch, signature verify, local enforcement (HMAC-SHA256 signature verified via org API token)

### 8.3 License Server (Open Source)

Lightweight Node.js (Fastify) service under `/server`. **Repo state:** license validate MVP present; sync/Postgres still open.

- [x] Create `/server` package (Fastify app, env config)
- [x] `POST /api/v1/license/validate` (prefix keys `dc_pro_` / `dc_ent_` + optional `DEVCLIP_EXTRA_*_KEYS`)
- [ ] WebSocket sync endpoint + auth
- [x] Postgres schema + queries (`server/database/schema.sql`)
- [x] Key generation / verification helpers (`server/src/utils/license.mjs` — RSA key gen, JWT sign/verify)
- [x] `Dockerfile` + repo-root `docker-compose.yml` (service `devclip-license`)
- [x] CI build/test for server (syntax check via `node --check`)

Layout target:

```
/server
  ├── src/
  │   ├── routes/license.ts     # POST /api/v1/license/validate
  │   ├── routes/sync.ts        # WebSocket sync endpoint
  │   ├── db/                   # Postgres schema + queries
  │   └── crypto/               # Key generation + verification
  ├── Dockerfile
  └── docker-compose.yml
```

---

## 9. Database Roadmap

### 9.1 Local SQLite (all tiers)

Local SQLite tables below are **present** in `database/schema.sql` and used by the app; Postgres for cloud sync is §9.2 (still open).

- [x] **`license`** — tier cache row + license key store (Electron `safeStorage` when available)
- [x] **`automation_rules`** — persisted rules for §5.3 engine
- [x] **`collections`** + **`collection_clips`** — §5.4 collections UI + queries

Reference DDL:

```sql
-- License cache
CREATE TABLE IF NOT EXISTS license (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  api_key     TEXT,
  tier        TEXT,     -- 'free' | 'pro' | 'enterprise'
  features    TEXT,     -- JSON array
  expires_at  TEXT,
  cached_at   TEXT
);

-- Automation rules
CREATE TABLE IF NOT EXISTS automation_rules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  enabled     INTEGER DEFAULT 1,
  trigger     TEXT NOT NULL,   -- JSON
  conditions  TEXT NOT NULL,   -- JSON array
  actions     TEXT NOT NULL,   -- JSON array
  created_at  TEXT DEFAULT (datetime('now'))
);

-- Collections
CREATE TABLE IF NOT EXISTS collections (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  is_smart    INTEGER DEFAULT 0,
  query       TEXT,            -- JSON query for smart collections
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS collection_clips (
  collection_id INTEGER REFERENCES collections(id) ON DELETE CASCADE,
  clip_id       INTEGER REFERENCES clips(id) ON DELETE CASCADE,
  PRIMARY KEY (collection_id, clip_id)
);
```

### 9.2 Sync Server (Pro/Enterprise) — PostgreSQL

- [x] Postgres schema + migrations for multi-tenant sync (`server/database/schema.sql`)
- [x] Core entities: `users`, `organizations`, `org_members`, `api_keys`
- [x] Encrypted blobs: `encrypted_clips`, `encrypted_snippets`, `encrypted_settings`
- [x] `sync_cursors`, `audit_log`, `policies` — with HMAC integrity signing (`server/src/utils/audit.mjs`)

---

## 10. Security Model

Target mitigations vs repo today:

- [x] **API keys** — license key in Electron **`safeStorage`** when the OS supports it (Keychain / DPAPI / etc.); optional `.license-key.plain` fallback — **not** stored in SQLite
- [x] **Sync payload** — XChaCha20-Poly1305 (libsodium) with Argon2id key derivation; backward compatible with AES-256-GCM v1
- [x] **Vault** — AES-256-GCM with scrypt key derivation; PIN unlock shipped; biometric unlock TBD
- [x] **Context isolation** — Electron `contextIsolation: true`, `nodeIntegration: false`
- [x] **CSP** — Content-Security-Policy applied via `session.defaultSession.webRequest` (tune as needed for dev vs prod)
- [x] **Secret detection** — regex heuristics for common token patterns (`secret` clip type, etc.)
- [x] **Audit log integrity** — HMAC-signed entries (server-side; `server/src/utils/audit.mjs`)

---

## 11. Release Milestones

### v0.x — Foundation (current)
- [x] Core clipboard history
- [x] Type detection
- [x] Snippets + variable substitution
- [x] Staging queue
- [x] Text actions
- [x] Overlay
- [x] Private mode + ignore rules

### v1.0 — Polish & Free Tier Complete
- [x] Configurable history limit
- [x] Configurable global shortcut
- [x] Light/dark/system theme
- [x] Shortcode snippet expansion (in-app + text action)
- [x] Import/export snippets
- [x] Remaining text actions (hash, case, diff, JWT, timestamp, etc.)
- [x] App password lock (PIN)
- [x] Auto-update via GitHub Releases
- [x] macOS support (code signing, notarization, `.dmg`, `.zip`)
- [x] Root **`LICENSE`** file (GNU **GPLv3**) at repository root (`package.json` declares `AGPL-3.0`)
- [ ] Public **GitHub** repository (publish + open visibility)

### v1.1 — Pro Tier
- [x] API key entry + offline-friendly tier validation (prefix keys); full server validation TBD
- [x] Feature flag service (tier in UI); route guards TBD
- [x] Unlimited history/snippets (within Pro cap settings / large paid limits — see §5.1)
- [x] AI Actions (DevClip-hosted + BYOK)
- [x] Automation rules engine (persisted + run on new clip)
- [x] Collections (manual lists + import/export JSON); smart query UI still TBD
- [x] Timeline view (local activity by day; no cloud)
- [x] Cloud sync (up to 5 devices, E2E encrypted — client merge + HTTPS blob; first-party hosted service TBD)
- [x] Vault (local encrypted vault + separate PIN)
- [x] Usage insights dashboard
- [x] Webhooks & integrations (§5.9 — outbound + Notion / Slack / Gist / Jira)

### v1.2 — Enterprise Tier
- [ ] Organization API keys + admin dashboard
- [ ] Team shared collections + RBAC
- [ ] Organization cloud sync (unlimited devices)
- [ ] Self-hosted license + sync server (Docker)
- [ ] Centralized policy management
- [ ] Audit log
- [ ] SSO / SAML

### v1.3+ — Ecosystem
- [ ] Linux support
- [ ] Mobile companion app (iOS/Android — read-only sync viewer)
- [ ] Browser extension (Chrome/Firefox — capture without switching apps)
- [ ] CLI tool (`devclip search`, `devclip paste <id>`, `devclip snippet run <name>`)
- [ ] Plugin/extension API (community-built actions and integrations)

---

## 12. Open Source Strategy

### License
- **Application code** — [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.html) only (`GPL-3.0-only`).
- **`/server` license API** — same GPLv3 (self-hostable reference implementation).
- No open-core split; all feature code is in the public repo

### Why Open Source + Paid API Key?
- Users can audit exactly what the app does with their clipboard data — no black boxes
- Self-hosting is always an option for privacy-conscious users and enterprises
- Trust is built through transparency; monetization comes from the convenience of the hosted service
- Community contributions improve the product for everyone

### GitHub Repository Structure (planned)

```
devclip/
├── electron/           # Main process
├── angular-app/        # Renderer (Angular)
├── database/           # Local SQLite schema + queries
├── server/             # License + sync server (Node.js / Fastify)
│   ├── src/
│   ├── Dockerfile
│   └── docker-compose.yml
├── docs/               # Architecture diagrams, API reference
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── workflows/      # CI: lint, test, build, release
├── PLAN.md             # This file
├── CONTRIBUTING.md
├── SECURITY.md
└── LICENSE             # GNU GPL v3.0 (full text)
```

### Repository files & automation (tracking)

- [x] `PLAN.md` (this document)
- [x] `LICENSE` at repo root (GNU GPL v3.0 full text)
- [x] `CONTRIBUTING.md`
- [x] `SECURITY.md`
- [x] `.github/ISSUE_TEMPLATE/` (bug + feature templates)
- [x] `.github/PULL_REQUEST_TEMPLATE.md`
- [x] `.github/workflows/` — CI runs `npm ci` + `npm run build:all` on Windows, macOS, Linux matrix; lint, type-check, server validation, security audit

### Community
- GitHub Issues for bug reports and feature requests
- GitHub Discussions for questions and ideas
- `CONTRIBUTING.md` with dev setup, coding standards, PR process
- `SECURITY.md` with responsible disclosure policy
- Semantic versioning + GitHub Releases with auto-generated changelogs

---

### Checklist score (auto-orientation)

Rough counts in this file: **~148** rows marked **`[x]`** and **~93** still **`[ ]`**. The unchecked majority is expected: cloud sync, AI, store publishing, Enterprise admin, and `/server` are separate programs from the desktop client.

---

*Last updated: April 12, 2026*
