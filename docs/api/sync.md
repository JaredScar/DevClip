# Sync API Reference

## Overview

The sync API provides end-to-end encrypted data synchronization for DevClip Pro and Enterprise users.

## Authentication

All sync requests require a valid API key in the Authorization header:

```http
Authorization: Bearer dc_pro_abc123...
```

## Endpoints

### PUT /api/v1/sync/bundle

Upload an encrypted sync bundle.

#### Request

```http
PUT /api/v1/sync/bundle
Authorization: Bearer {api_key}
Content-Type: application/json

{
  "device_id": "device-fingerprint",
  "bundle": "base64-encoded-encrypted-bundle",
  "format_version": 2,
  "cursor": "opaque-cursor-data"
}
```

#### Response

```json
{
  "success": true,
  "server_cursor": "new-cursor-data",
  "merged_bundle": "base64-encoded-merged-encrypted-bundle",
  "conflicts": []
}
```

### GET /api/v1/sync/bundle

Retrieve the latest sync bundle.

#### Request

```http
GET /api/v1/sync/bundle?cursor={last_cursor}
Authorization: Bearer {api_key}
```

#### Response

```json
{
  "has_changes": true,
  "bundle": "base64-encoded-encrypted-bundle",
  "server_cursor": "new-cursor-data",
  "format_version": 2
}
```

### DELETE /api/v1/sync/bundle

Delete all sync data (GDPR right to erasure).

```http
DELETE /api/v1/sync/bundle
Authorization: Bearer {api_key}
```

## Encryption Format

### Version 2 (Current)

Uses XChaCha20-Poly1305 with Argon2id key derivation.

```
Encrypted Bundle Structure:
┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐
│   Magic     │   Nonce     │   Salt      │ Argon2id    │  Ciphertext │
│  "DCS2"     │  24 bytes   │  32 bytes   │   Params    │  + Tag      │
│  4 bytes    │             │             │  (encoded)  │             │
└─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘
```

### Version 1 (Legacy)

AES-256-GCM with PBKDF2 key derivation (backward compatible).

Magic bytes: `"DCS1"`

## WebSocket Real-Time Sync (Enterprise)

Enterprise users can use WebSocket for real-time sync notifications.

### Connection

```javascript
const ws = new WebSocket('wss://sync.devclip.app/v1/realtime', [], {
  headers: { Authorization: 'Bearer dc_ent_...' }
});
```

### Messages

#### Client → Server

```json
{ "type": "subscribe", "channels": ["clips", "snippets"] }
```

#### Server → Client

```json
{ "type": "update", "channel": "clips", "cursor": "...", "timestamp": "..." }
```

## Conflict Resolution

Conflicts are resolved using Last-Write-Wins (LWW) based on `updated_at` timestamps:

1. Client uploads bundle with local timestamps
2. Server merges with stored data
3. Server compares timestamps per item
4. Newer timestamp wins
5. Server returns merged bundle

## Cursor Format

Cursors are opaque strings representing sync state. They enable delta sync:

```json
{
  "clips_ts": "2024-01-15T10:30:00Z",
  "snippets_ts": "2024-01-15T10:25:00Z",
  "settings_ts": "2024-01-15T10:20:00Z"
}
```

(Encoded as base64 string in practice)
