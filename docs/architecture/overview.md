# DevClip Architecture Overview

## System Architecture

DevClip is built as a modern desktop application using Electron for the main process and Angular for the renderer/UI layer.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              DevClip Desktop                              │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                         Electron Main Process                        │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │  │
│  │  │   Clipboard │  │    IPC      │  │   Native    │  │   Auto      │ │  │
│  │  │   Monitor   │  │   Bridge    │  │   APIs      │  │   Updater   │ │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                      │
│                         Preload Script (Safe Bridge)                      │
│                                    │                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                      Angular Renderer Process                        │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │  │
│  │  │   History   │  │  Snippets   │  │   Sync      │  │  Settings   │ │  │
│  │  │   Panel     │  │   Panel     │  │   Panel     │  │   Panel     │ │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │  │
│  │  │  Timeline   │  │ Automation  │  │   Vault     │  │ Enterprise  │ │  │
│  │  │   Panel     │  │   Panel     │  │   Panel     │  │   Panel     │ │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                              Optional Cloud
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                         DevClip Sync Server (/server)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   License   │  │    Sync     │  │    Audit    │  │   Policy    │     │
│  │  Validation  │  │   Endpoint  │  │     Log     │  │   Mgmt      │     │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘     │
│                                                                         │
│                         PostgreSQL (Multi-tenant)                       │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Architectural Decisions

### 1. Local-First Data Storage
All clipboard history, snippets, and settings are stored locally in SQLite via `better-sqlite3`. Cloud sync is strictly opt-in and end-to-end encrypted.

### 2. Context Isolation
Electron's `contextIsolation: true` and `nodeIntegration: false` ensure renderer security. All native access goes through a carefully designed preload API.

### 3. Tiered Feature System
Features are unlocked via API keys:
- **Free**: Core clipboard, snippets, basic actions
- **Pro**: AI actions, automation, cloud sync (5 devices), vault
- **Enterprise**: Team features, unlimited devices, policies, audit logs

### 4. Self-Hostable Backend
The `/server` package provides a complete license + sync server that can be self-hosted by Enterprise customers.

## Data Flow

### Clipboard Capture Flow
```
1. Native clipboard change detected (Electron main)
2. Content type classification (code, json, secret, etc.)
3. Automation rules engine evaluation
4. Storage to SQLite with encryption (if vault)
5. UI notification (optional)
```

### Sync Flow
```
1. User-triggered or automatic sync (settings)
2. Local bundle creation (clips + snippets + settings)
3. XChaCha20-Poly1305 encryption with Argon2id KDF
4. HTTPS PUT to configured sync endpoint
5. Merge downloaded bundle on response
6. Conflict resolution via LWW timestamps
```

## Security Model

| Component | Security Approach |
|-----------|-------------------|
| License keys | Electron `safeStorage` (OS keychain) |
| Sync payload | XChaCha20-Poly1305 + Argon2id |
| Vault items | AES-256-GCM + scrypt |
| API keys | Memory-only, never persisted plaintext |
| Audit logs | HMAC-SHA256 signed server-side |

## Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Desktop Host | Electron | 34.x |
| UI Framework | Angular | 19.x |
| Styling | Tailwind CSS | 3.x |
| Local DB | SQLite (better-sqlite3) | 11.x |
| Server | Fastify (Node.js) | 5.x |
| Server DB | PostgreSQL | 15+ |
| Crypto | libsodium-wrappers | 0.7.x |
