import jwt from 'jsonwebtoken';
import { createPublicKey, createPrivateKey, createSign, createVerify, generateKeyPairSync } from 'crypto';

/**
 * License key utilities for offline/air-gapped Enterprise deployments
 * 
 * Uses JWT format with RS256 (RSA-SHA256) signatures for offline verification
 * License files can be validated without network connectivity
 */

// In production, these come from environment variables or HSM
const LICENSE_PRIVATE_KEY = process.env.LICENSE_PRIVATE_KEY;
const LICENSE_PUBLIC_KEY = process.env.LICENSE_PUBLIC_KEY;

/**
 * Generate a new RSA key pair for license signing
 * Use this only once to generate the initial keys, then secure the private key
 * @returns {{privateKey: string, publicKey: string}}
 */
export function generateLicenseKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { privateKey, publicKey };
}

/**
 * License tiers and their features
 */
export const LICENSE_TIERS = {
  FREE: 'free',
  PRO: 'pro',
  ENTERPRISE: 'enterprise',
};

/**
 * Create a signed license JWT
 * 
 * @param {Object} params
 * @param {string} params.orgId - Organization UUID
 * @param {string} params.orgName - Organization name
 * @param {string} params.tier - 'pro' or 'enterprise'
 * @param {number} params.maxSeats - Maximum number of users
 * @param {Date} params.expiresAt - License expiration date
 * @param {string} [params.issuedBy] - Email of issuer
 * @param {Object} [params.features] - Feature flags
 * @param {string} [params.hardwareId] - Optional hardware binding
 * @returns {string} Signed JWT license string
 */
export function createLicenseJWT({
  orgId,
  orgName,
  tier,
  maxSeats,
  expiresAt,
  issuedBy = 'devclip@local',
  features = {},
  hardwareId = null,
}) {
  if (!LICENSE_PRIVATE_KEY) {
    throw new Error('LICENSE_PRIVATE_KEY not configured');
  }

  const now = Math.floor(Date.now() / 1000);
  const expires = Math.floor(expiresAt.getTime() / 1000);

  const payload = {
    // JWT standard claims
    iss: 'DevClip License Authority',
    sub: orgId,
    iat: now,
    exp: expires,
    jti: `${orgId}-${now}`, // Unique token ID

    // DevClip license claims
    org: {
      id: orgId,
      name: orgName,
    },
    tier,
    max_seats: maxSeats,
    seats_used: 0, // Will be updated during sync
    features: {
      sync: true,
      ai_integration: tier !== LICENSE_TIERS.FREE,
      snippets: true,
      vault: tier !== LICENSE_TIERS.FREE,
      enterprise_policies: tier === LICENSE_TIERS.ENTERPRISE,
      priority_support: tier === LICENSE_TIERS.ENTERPRISE,
      ...features,
    },
    issued_by: issuedBy,
    hardware_id: hardwareId, // null = not hardware-bound
  };

  return jwt.sign(payload, LICENSE_PRIVATE_KEY, {
    algorithm: 'RS256',
  });
}

/**
 * Verify and decode a license JWT
 * 
 * @param {string} licenseJwt - The license JWT string
 * @param {Object} [options]
 * @param {string} [options.hardwareId] - Hardware ID to validate against
 * @returns {{valid: boolean, expired: boolean, payload: Object|null, error: string|null}}
 */
export function verifyLicenseJWT(licenseJwt, options = {}) {
  if (!LICENSE_PUBLIC_KEY) {
    return {
      valid: false,
      expired: false,
      payload: null,
      error: 'LICENSE_PUBLIC_KEY not configured',
    };
  }

  try {
    const payload = jwt.verify(licenseJwt, LICENSE_PUBLIC_KEY, {
      algorithms: ['RS256'],
    });

    // Check hardware binding
    if (payload.hardware_id && payload.hardware_id !== options.hardwareId) {
      return {
        valid: false,
        expired: false,
        payload: null,
        error: 'License bound to different hardware',
      };
    }

    return {
      valid: true,
      expired: false,
      payload,
      error: null,
    };
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      // Still return payload for expired licenses (grace period handling)
      const decoded = jwt.decode(licenseJwt);
      return {
        valid: false,
        expired: true,
        payload: decoded,
        error: 'License expired',
      };
    }

    return {
      valid: false,
      expired: false,
      payload: null,
      error: err.message,
    };
  }
}

/**
 * Decode a license without verifying signature (for inspection only)
 * @param {string} licenseJwt
 * @returns {Object|null}
 */
export function decodeLicenseJWT(licenseJwt) {
  return jwt.decode(licenseJwt);
}

/**
 * Generate a license file for download
 * Includes the JWT plus metadata in a structured format
 * 
 * @param {Object} params - Same as createLicenseJWT
 * @returns {string} JSON license file content
 */
export function generateLicenseFile(params) {
  const jwt = createLicenseJWT(params);
  const decoded = decodeLicenseJWT(jwt);

  const licenseFile = {
    format: 'devclip-license-v1',
    issued_at: new Date().toISOString(),
    jwt,
    metadata: {
      org_id: decoded.org.id,
      org_name: decoded.org.name,
      tier: decoded.tier,
      max_seats: decoded.max_seats,
      expires_at: new Date(decoded.exp * 1000).toISOString(),
      features: decoded.features,
    },
    // Instructions for air-gapped installation
    installation: {
      method: 'file_import',
      path: '~/.config/devclip/license.json',
      steps: [
        'Save this file as license.json',
        'Place in ~/.config/devclip/ (macOS/Linux) or %APPDATA%/DevClip/ (Windows)',
        'Restart DevClip',
        'Verify activation in Settings > License',
      ],
    },
  };

  return JSON.stringify(licenseFile, null, 2);
}

/**
 * Create a license with embedded sync credentials
 * For Enterprise customers who need both license AND sync in air-gapped mode
 * 
 * @param {Object} params - Base license params
 * @param {Object} params.syncConfig - Sync server configuration for offline mode
 * @returns {string} Enhanced license JWT
 */
export function createEnterpriseOfflineLicense(params) {
  const { syncConfig, ...baseParams } = params;

  const license = createLicenseJWT({
    ...baseParams,
    tier: LICENSE_TIERS.ENTERPRISE,
    features: {
      ...baseParams.features,
      offline_sync: true,
      air_gapped_mode: true,
    },
  });

  const payload = decodeLicenseJWT(license);

  // Create an enhanced license file with embedded sync config
  const enhancedFile = {
    format: 'devclip-license-enterprise-v1',
    issued_at: new Date().toISOString(),
    license_jwt: license,
    offline_sync: {
      enabled: true,
      primary_server: syncConfig?.primaryServer || null,
      backup_servers: syncConfig?.backupServers || [],
      sync_interval_seconds: syncConfig?.syncInterval || 300,
    },
    metadata: {
      org_id: payload.org.id,
      org_name: payload.org.name,
      tier: payload.tier,
      max_seats: payload.max_seats,
      expires_at: new Date(payload.exp * 1000).toISOString(),
      features: payload.features,
    },
    installation: {
      method: 'file_import',
      path: '~/.config/devclip/enterprise-license.json',
      note: 'This license enables air-gapped Enterprise operation. Place in the specified directory and restart DevClip.',
    },
  };

  return JSON.stringify(enhancedFile, null, 2);
}

/**
 * Validate license format without cryptographic verification
 * Useful for quick format checks
 * @param {string} licenseJwt
 * @returns {{valid: boolean, error: string|null}}
 */
export function validateLicenseFormat(licenseJwt) {
  try {
    const parts = licenseJwt.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid JWT format (expected 3 parts)' };
    }

    const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

    if (header.alg !== 'RS256') {
      return { valid: false, error: 'Unsupported algorithm (expected RS256)' };
    }

    if (!payload.org || !payload.org.id) {
      return { valid: false, error: 'Missing required claim: org.id' };
    }

    if (!payload.tier) {
      return { valid: false, error: 'Missing required claim: tier' };
    }

    if (!payload.exp) {
      return { valid: false, error: 'Missing required claim: exp' };
    }

    return { valid: true, error: null };
  } catch (err) {
    return { valid: false, error: `Format validation failed: ${err.message}` };
  }
}

/**
 * License status enumeration
 */
export const LICENSE_STATUS = {
  VALID: 'valid',
  EXPIRED: 'expired',
  INVALID: 'invalid',
  HARDWARE_MISMATCH: 'hardware_mismatch',
  REVOKED: 'revoked',
};

/**
 * Get detailed license status
 * @param {string} licenseJwt
 * @param {Object} options
 * @returns {{status: string, payload: Object|null, daysRemaining: number|null, error: string|null}}
 */
export function getLicenseStatus(licenseJwt, options = {}) {
  const formatCheck = validateLicenseFormat(licenseJwt);
  if (!formatCheck.valid) {
    return {
      status: LICENSE_STATUS.INVALID,
      payload: null,
      daysRemaining: null,
      error: formatCheck.error,
    };
  }

  const verification = verifyLicenseJWT(licenseJwt, options);

  if (verification.error?.includes('hardware')) {
    return {
      status: LICENSE_STATUS.HARDWARE_MISMATCH,
      payload: verification.payload,
      daysRemaining: null,
      error: verification.error,
    };
  }

  if (verification.expired) {
    const daysSinceExpiry = Math.floor(
      (Date.now() - verification.payload.exp * 1000) / (1000 * 60 * 60 * 24)
    );
    return {
      status: LICENSE_STATUS.EXPIRED,
      payload: verification.payload,
      daysRemaining: -daysSinceExpiry,
      error: `License expired ${daysSinceExpiry} days ago`,
    };
  }

  if (!verification.valid) {
    return {
      status: LICENSE_STATUS.INVALID,
      payload: null,
      daysRemaining: null,
      error: verification.error,
    };
  }

  const daysRemaining = Math.floor(
    (verification.payload.exp * 1000 - Date.now()) / (1000 * 60 * 60 * 24)
  );

  return {
    status: LICENSE_STATUS.VALID,
    payload: verification.payload,
    daysRemaining,
    error: null,
  };
}
