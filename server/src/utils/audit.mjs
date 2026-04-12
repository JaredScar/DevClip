import { createHash, createHmac, randomBytes } from 'crypto';
import { pool } from '../db.mjs';

/**
 * Audit log utilities with HMAC integrity signing
 * Server-side implementation for tamper-evident audit trails
 */

const AUDIT_SECRET = process.env.AUDIT_SECRET || randomBytes(32).toString('hex');

/**
 * Generate canonical JSON string for consistent hashing
 * @param {Object} obj
 * @returns {string}
 */
function canonicalJson(obj) {
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    const value = obj[key];
    if (value === undefined) continue;
    sorted[key] = value && typeof value === 'object' ? canonicalJson(value) : value;
  }
  return JSON.stringify(sorted);
}

/**
 * Compute HMAC-SHA256 signature for audit entry
 * @param {Object} payload - The audit entry data (without signature and entry_hash)
 * @returns {string} hex-encoded signature
 */
export function computeAuditSignature(payload) {
  const canonical = canonicalJson(payload);
  return createHmac('sha256', AUDIT_SECRET).update(canonical, 'utf8').digest('hex');
}

/**
 * Compute SHA-256 hash of entry for chaining
 * @param {Object} entry - Full entry including signature
 * @returns {string} hex-encoded hash
 */
export function computeEntryHash(entry) {
  const canonical = canonicalJson(entry);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Create an audit log entry with integrity signing
 * @param {Object} params
 * @param {string} params.eventType
 * @param {string} [params.orgId]
 * @param {string} [params.userId]
 * @param {string} [params.resourceType]
 * @param {string} [params.resourceId]
 * @param {Object} [params.payload]
 * @param {string} [params.ipAddress]
 * @param {string} [params.userAgent]
 * @param {string} [params.deviceId]
 * @returns {Promise<Object>} The created audit entry
 */
export async function createAuditEntry({
  eventType,
  orgId = null,
  userId = null,
  resourceType = null,
  resourceId = null,
  payload = {},
  ipAddress = null,
  userAgent = null,
  deviceId = null,
}) {
  // Get previous entry hash for chaining
  const { rows } = await pool.query(
    'SELECT entry_hash FROM audit_log ORDER BY created_at DESC LIMIT 1'
  );
  const previousHash = rows.length > 0 ? rows[0].entry_hash : null;

  // Build entry data (without signature and hash)
  const entryData = {
    id: randomBytes(16).toString('hex'),
    created_at: new Date().toISOString(),
    org_id: orgId,
    user_id: userId,
    event_type: eventType,
    resource_type: resourceType,
    resource_id: resourceId,
    ip_address: ipAddress,
    user_agent: userAgent,
    device_id: deviceId,
    payload,
    previous_hash: previousHash,
  };

  // Compute signature
  const signature = computeAuditSignature(entryData);

  // Compute entry hash (with signature)
  const entryWithSig = { ...entryData, signature };
  const entryHash = computeEntryHash(entryWithSig);

  // Insert into database
  const insert = await pool.query(
    `INSERT INTO audit_log (
      id, created_at, org_id, user_id, event_type, resource_type, resource_id,
      ip_address, user_agent, device_id, payload, signature, previous_hash, entry_hash
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *`,
    [
      entryData.id,
      entryData.created_at,
      entryData.org_id,
      entryData.user_id,
      entryData.event_type,
      entryData.resource_type,
      entryData.resource_id,
      entryData.ip_address,
      entryData.user_agent,
      entryData.device_id,
      JSON.stringify(entryData.payload),
      signature,
      entryData.previous_hash,
      entryHash,
    ]
  );

  return insert.rows[0];
}

/**
 * Verify the integrity of an audit entry
 * @param {Object} entry - Full audit entry from database
 * @returns {boolean}
 */
export function verifyAuditEntry(entry) {
  const { signature, entry_hash, ...entryData } = entry;

  // Re-compute signature
  const expectedSig = computeAuditSignature(entryData);
  const sigValid = signature === expectedSig;

  // Re-compute hash
  const expectedHash = computeEntryHash(entry);
  const hashValid = entry_hash === expectedHash;

  return sigValid && hashValid;
}

/**
 * Verify chain integrity between two entries
 * @param {Object} currentEntry
 * @param {Object} previousEntry
 * @returns {boolean}
 */
export function verifyChainLink(currentEntry, previousEntry) {
  return currentEntry.previous_hash === previousEntry.entry_hash;
}

/**
 * Query audit log with filtering
 * @param {Object} filters
 * @param {number} [limit=100]
 * @param {number} [offset=0]
 * @returns {Promise<Array>}
 */
export async function queryAuditLog(filters = {}, limit = 100, offset = 0) {
  const conditions = [];
  const values = [];
  let paramIdx = 1;

  if (filters.orgId) {
    conditions.push(`org_id = $${paramIdx++}`);
    values.push(filters.orgId);
  }
  if (filters.userId) {
    conditions.push(`user_id = $${paramIdx++}`);
    values.push(filters.userId);
  }
  if (filters.eventType) {
    conditions.push(`event_type = $${paramIdx++}`);
    values.push(filters.eventType);
  }
  if (filters.resourceType) {
    conditions.push(`resource_type = $${paramIdx++}`);
    values.push(filters.resourceType);
  }
  if (filters.startDate) {
    conditions.push(`created_at >= $${paramIdx++}`);
    values.push(filters.startDate);
  }
  if (filters.endDate) {
    conditions.push(`created_at <= $${paramIdx++}`);
    values.push(filters.endDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  values.push(limit, offset);

  const { rows } = await pool.query(
    `SELECT * FROM audit_log
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    values
  );

  return rows;
}
