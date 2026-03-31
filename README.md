# DevClip

[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/node.js-%3E%3D20-brightgreen)](https://nodejs.org/)

Developer-focused **clipboard manager** for Windows: Electron + Angular, local **SQLite** storage, and a Spotlight-style overlay.

## Features

| Area | What you get |
|------|----------------|
| **History** | Clipboard polling, type detection (SQL, JSON, URL, code, text, email, stack traces, secrets, images), pin, search, tags, filters (type, tags, source app, date range), fuzzy search |
| **Snippets** | Saved snippets with `{{variable}}` placeholders, shortcodes, Shiki highlighting, import/export |
| **Staging** | Queue clips, reorder, paste all or paste next |
| **Actions** | JSON format/minify, Base64, URL encode/decode, extract URLs/emails, trim, regex replace (with preview), hashing, case transforms, JWT decode, timestamps, diff two clips |
| **AI actions** | Summarize, explain, translate, and more (BYOK or hosted; Pro+) |
| **Automation** | Rules on new clip (conditions + actions) |
| **Collections** | Manual and smart collections, import/export |
| **Timeline** | Activity by day |
| **Vault** | Local encrypted vault (separate PIN) |
| **Sync** | End-to-end encrypted blob sync (Pro+; configurable remote URL) |
| **Integrations** | Outbound webhooks (Zapier/Make-friendly), Notion, Slack, GitHub Gist, Jira |
| **Insights** | Usage dashboard (captures, sources, types, peak hours) |
| **Enterprise** | Org policy URL, snippet feed import, audit log export, optional license server validate |
| **Settings** | Private mode, ignore apps/patterns, themes, app lock, license tier |

Pro and Enterprise tiers use **API keys** (offline-friendly prefix validation and optional HTTPS check against a self-hosted server; see `server/` and `PLAN.md`).

## Requirements

- **Node.js 20+** (22 recommended; matches CI)
- **Windows** (primary target today)
- If `better-sqlite3` fails to build: **Visual Studio Build Tools** (C++ workload) on Windows

## Quick start

```bash
# Root: Electron main process + native module
npm install

# Renderer (required before first production build)
cd angular-app && npm install && cd ..
```

### Development

```bash
npm run dev
```

Runs Angular at `http://localhost:4200` and Electron with `DEVCLIP_DEV=1`.

### Production build (local)

```bash
npm run build:all
npx electron .
```

Serves the built UI from `angular-app/dist/angular-app/browser/`.

### Windows installer / unpacked dir

```bash
npm run dist
```

Uses `electron-builder` (see `package.json`).

## Overlay shortcuts

| Shortcut | Action |
|----------|--------|
| **Ctrl+Shift+V** | Toggle overlay |
| **1–4** | Tabs: History, Snippets, Staging, Settings |
| **Ctrl+Shift+P** | Jump to Staging (main window) |
| **Tab** | Cycle type filter (History) |
| **S** | Stage selected clip |
| **A** | Open actions for selected clip |
| **Ctrl/Cmd+K** | Focus search |

## Repository layout

| Path | Role |
|------|------|
| `electron/` | Main process, preload, IPC, integrations, sync, license |
| `database/` | SQLite schema and queries |
| `angular-app/` | Angular 19 standalone UI |
| `server/` | Optional self-hosted license API (`POST /api/v1/license/validate`) + Docker |

## Security

- Renderer: **`contextIsolation: true`**, **`nodeIntegration: false`**
- IPC only through **`preload.ts`** → `window.devclip`
- Secrets and license keys use the **OS secret store** when available

Report vulnerabilities responsibly: see [`SECURITY.md`](SECURITY.md).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

**GNU General Public License v3.0 only** (`GPL-3.0-only`). Full text: [`LICENSE`](LICENSE).

## Roadmap

Product and technical checklists: [`PLAN.md`](PLAN.md).

## After you create the GitHub repository

Add `repository`, `bugs`, and `homepage` to root `package.json` so npm and GitHub link correctly, for example:

```json
"repository": {
  "type": "git",
  "url": "https://github.com/YOUR_ORG/devclip.git"
},
"bugs": {
  "url": "https://github.com/YOUR_ORG/devclip/issues"
},
"homepage": "https://github.com/YOUR_ORG/devclip#readme"
```

Replace `YOUR_ORG` with your GitHub user or organization name.
