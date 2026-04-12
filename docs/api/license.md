# License API Reference

## POST /api/v1/license/validate

Validates an API key and returns tier information.

### Request

```http
POST /api/v1/license/validate
Content-Type: application/json

{
  "key": "dc_pro_abc123...",
  "app_version": "1.0.0",
  "device_fingerprint": "sha256:..."
}
```

### Response

```json
{
  "valid": true,
  "tier": "pro",
  "features": ["ai_actions", "sync", "vault", "automation"],
  "expires_at": "2025-12-31T23:59:59Z",
  "device_count": 3,
  "max_devices": 5
}
```

### Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 400 | INVALID_KEY | Malformed key format |
| 401 | KEY_REVOKED | Key has been revoked |
| 403 | TIER_EXPIRED | Subscription expired |
| 429 | RATE_LIMITED | Too many validation attempts |

## Offline License Files (JWT)

Enterprise customers can use signed JWT license files for air-gapped deployments.

### License File Format

```json
{
  "format": "devclip-license-v1",
  "issued_at": "2024-01-15T10:30:00Z",
  "jwt": "eyJhbGciOiJSUzI1NiIs...",
  "metadata": {
    "org_id": "550e8400-e29b-41d4-a716-446655440000",
    "org_name": "Acme Corp",
    "tier": "enterprise",
    "max_seats": 50,
    "expires_at": "2025-01-15T00:00:00Z"
  }
}
```

### JWT Claims

| Claim | Description |
|-------|-------------|
| `iss` | Issuer: "DevClip License Authority" |
| `sub` | Organization ID |
| `iat` | Issued at timestamp |
| `exp` | Expiration timestamp |
| `jti` | Unique token ID |
| `org` | Organization object (id, name) |
| `tier` | License tier: "pro" or "enterprise" |
| `max_seats` | Maximum allowed users |
| `features` | Feature flags object |
| `hardware_id` | Optional hardware binding |

### Verification

Licenses are signed with RS256 (RSA 4096-bit). Verification requires the public key:

```javascript
import { verifyLicenseJWT } from './utils/license.mjs';

const result = verifyLicenseJWT(jwtString, {
  hardwareId: optionalHardwareBinding
});
// Returns: { valid: boolean, expired: boolean, payload: object|null, error: string|null }
```

## License CLI Tool

The server includes a CLI for license management:

```bash
# Generate new RSA key pair
node scripts/cli/license-cli.mjs generate-keys

# Create a license
LICENSE_PRIVATE_KEY="..." node scripts/cli/license-cli.mjs create \
  --org-id=550e8400-e29b-41d4-a716-446655440000 \
  --org-name="Acme Corp" \
  --tier=enterprise \
  --seats=50 \
  --days=365 \
  --output=license.json

# Verify a license
node scripts/cli/license-cli.mjs verify license.json

# Inspect license contents (no signature check)
node scripts/cli/license-cli.mjs inspect license.json
```
