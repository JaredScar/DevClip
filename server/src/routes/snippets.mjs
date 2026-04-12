import { pool } from '../db.mjs';
import { createHmac, randomBytes } from 'crypto';
import {
  loadOrgMembership,
  requirePermission,
  requireOwnership,
  hasPermission,
  rbacAuditLog,
  ROLES,
} from '../middleware/rbac.mjs';

/**
 * Enterprise Snippet Library API Routes
 * 
 * Provides CRUD operations for organization-wide shared snippets.
 * All snippets are E2E encrypted (ciphertext only visible to server).
 * RBAC (Role-Based Access Control) enforced for all operations.
 */

const AUDIT_SECRET = process.env.AUDIT_SECRET || 'devclip-secret';

// Audit log helper
async function auditLog(eventType, orgId, userId, resourceType, resourceId, payload) {
  try {
    const signature = createHmac('sha256', AUDIT_SECRET)
      .update(`${orgId}:${userId}:${eventType}:${Date.now()}`)
      .digest('hex');

    await pool.query(
      `INSERT INTO audit_log (org_id, user_id, event_type, resource_type, resource_id, payload, signature, entry_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [orgId, userId, eventType, resourceType, resourceId, JSON.stringify(payload), signature, randomBytes(32).toString('hex')]
    );
  } catch (err) {
    console.error('[Audit] Failed to log:', err);
  }
}

// Audit log helper
async function auditLog(eventType, orgId, userId, resourceType, resourceId, payload) {
  try {
    const signature = createHmac('sha256', AUDIT_SECRET)
      .update(`${orgId}:${userId}:${eventType}:${Date.now()}`)
      .digest('hex');

    await pool.query(
      `INSERT INTO audit_log (org_id, user_id, event_type, resource_type, resource_id, payload, signature, entry_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [orgId, userId, eventType, resourceType, resourceId, JSON.stringify(payload), signature, randomBytes(32).toString('hex')]
    );
  } catch (err) {
    console.error('[Audit] Failed to log:', err);
  }
}

export default async function snippetRoutes(fastify) {
  // Pre-hooks: authenticate, then load org membership with RBAC role
  fastify.addHook('preHandler', async (request, reply) => {
    // Authentication is handled globally in main server
    // Here we just ensure user is loaded and load org membership
    if (!request.user) {
      return reply.code(401).send({ error: 'Not authenticated' });
    }
    await loadOrgMembership(request, reply);
  });

  // GET /api/v1/org/snippets - List shared snippets (viewer+, member+, admin+, owner+)
  fastify.get('/', {
    preHandler: requirePermission('snippets:read'),
  }, async (request, reply) => {
    const { orgId } = request.user;
    const { tag, type, limit = 50, offset = 0 } = request.query;

    try {
      let query = `
        SELECT id, created_at, updated_at, snippet_type, language, title_hint, 
               tags, is_favorite, sync_uid, created_by
        FROM encrypted_snippets
        WHERE org_id = $1 AND deleted_at IS NULL
      `;
      const params = [orgId];
      let paramIdx = 2;

      if (tag) {
        query += ` AND $${paramIdx} = ANY(tags)`;
        params.push(tag);
        paramIdx++;
      }

      if (type) {
        query += ` AND snippet_type = $${paramIdx}`;
        params.push(type);
        paramIdx++;
      }

      query += ` ORDER BY is_favorite DESC, updated_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
      params.push(parseInt(limit), parseInt(offset));

      const { rows } = await pool.query(query, params);

      return {
        snippets: rows,
        total: rows.length,
        limit: parseInt(limit),
        offset: parseInt(offset),
      };
    } catch (err) {
      console.error('[Snippets] List error:', err);
      return reply.code(500).send({ error: 'Failed to list snippets' });
    }
  });

  // GET /api/v1/org/snippets/:id - Get a specific snippet (viewer+, member+, admin+, owner+)
  fastify.get('/:id', {
    preHandler: requirePermission('snippets:read'),
  }, async (request, reply) => {
    const { orgId } = request.user;
    const { id } = request.params;

    try {
      const { rows } = await pool.query(
        `SELECT id, created_at, updated_at, snippet_type, language, title_hint,
                tags, is_favorite, ciphertext, cipher_meta, sync_uid, created_by
         FROM encrypted_snippets
         WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
        [id, orgId]
      );

      if (rows.length === 0) {
        return reply.code(404).send({ error: 'Snippet not found' });
      }

      return { snippet: rows[0] };
    } catch (err) {
      console.error('[Snippets] Get error:', err);
      return reply.code(500).send({ error: 'Failed to get snippet' });
    }
  });

  // POST /api/v1/org/snippets - Create a shared snippet (member+, admin+, owner+)
  fastify.post('/', {
    preHandler: requirePermission('snippets:create'),
  }, async (request, reply) => {
    const { orgId, id: userId } = request.user;

    const {
      ciphertext,
      cipher_meta,
      snippet_type = 'code',
      language,
      title_hint,
      tags = [],
    } = request.body || {};

    if (!ciphertext) {
      return reply.code(400).send({ error: 'ciphertext is required' });
    }

    try {
      const syncUid = `${orgId}-${Date.now()}-${randomBytes(8).toString('hex')}`;
      
      const { rows } = await pool.query(
        `INSERT INTO encrypted_snippets 
         (org_id, user_id, ciphertext, cipher_meta, snippet_type, language, title_hint, tags, sync_uid, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $2)
         RETURNING id, created_at, sync_uid`,
        [orgId, userId, ciphertext, JSON.stringify(cipher_meta), snippet_type, language, title_hint, tags, syncUid]
      );

      await rbacAuditLog('snippet_created', request, 'snippet', rows[0].id, { type: snippet_type });

      // Notify other org members via WebSocket
      if (fastify.wss) {
        fastify.wss.notifyOrg(orgId, 'snippets', { action: 'created', id: rows[0].id });
      }

      return reply.code(201).send({
        snippet: {
          id: rows[0].id,
          sync_uid: rows[0].sync_uid,
          created_at: rows[0].created_at,
        },
      });
    } catch (err) {
      console.error('[Snippets] Create error:', err);
      return reply.code(500).send({ error: 'Failed to create snippet' });
    }
  });

  // PUT /api/v1/org/snippets/:id - Update a snippet (own update for member, any for admin+)
  fastify.put('/:id', {
    preHandler: [
      requirePermission('snippets:update'),
      requireOwnership('snippet', 'id'),
    ],
  }, async (request, reply) => {
    const { orgId, id: userId } = request.user;
    const { id } = request.params;

    // Check if user can update others' snippets
    const canUpdateAny = hasPermission(request.userRole, 'snippets:admin');
    if (!canUpdateAny && !request.isResourceOwner) {
      return reply.code(403).send({ error: 'Can only update your own snippets' });
    }

    const updates = request.body || {};
    const allowedFields = ['ciphertext', 'cipher_meta', 'snippet_type', 'language', 'title_hint', 'tags', 'is_favorite'];
    
    const fields = [];
    const values = [];
    let paramIdx = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && value !== undefined) {
        fields.push(`${key} = $${paramIdx}`);
        values.push(key === 'cipher_meta' || key === 'tags' ? JSON.stringify(value) : value);
        paramIdx++;
      }
    }

    if (fields.length === 0) {
      return reply.code(400).send({ error: 'No valid fields to update' });
    }

    try {
      fields.push(`updated_at = NOW()`);
      values.push(id, orgId);

      const { rows } = await pool.query(
        `UPDATE encrypted_snippets 
         SET ${fields.join(', ')}
         WHERE id = $${paramIdx} AND org_id = $${paramIdx + 1}
         RETURNING id, updated_at`,
        values
      );

      await rbacAuditLog('snippet_updated', request, 'snippet', id, { fields: Object.keys(updates) });

      // Notify org members
      if (fastify.wss) {
        fastify.wss.notifyOrg(orgId, 'snippets', { action: 'updated', id });
      }

      return { snippet: rows[0] };
    } catch (err) {
      console.error('[Snippets] Update error:', err);
      return reply.code(500).send({ error: 'Failed to update snippet' });
    }
  });

  // DELETE /api/v1/org/snippets/:id - Delete a snippet (soft delete) (own for member, any for admin+)
  fastify.delete('/:id', {
    preHandler: [
      requirePermission('snippets:delete'),
      requireOwnership('snippet', 'id'),
    ],
  }, async (request, reply) => {
    const { orgId, id: userId } = request.user;
    const { id } = request.params;

    // Check if user can delete others' snippets
    const canDeleteAny = hasPermission(request.userRole, 'snippets:admin');
    if (!canDeleteAny && !request.isResourceOwner) {
      return reply.code(403).send({ error: 'Can only delete your own snippets' });
    }

    try {
      const { rows } = await pool.query(
        `UPDATE encrypted_snippets 
         SET deleted_at = NOW()
         WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL
         RETURNING id`,
        [id, orgId]
      );

      if (rows.length === 0) {
        return reply.code(404).send({ error: 'Snippet not found' });
      }

      await rbacAuditLog('snippet_deleted', request, 'snippet', id, {});

      // Notify org members
      if (fastify.wss) {
        fastify.wss.notifyOrg(orgId, 'snippets', { action: 'deleted', id });
      }

      return { deleted: true, id };
    } catch (err) {
      console.error('[Snippets] Delete error:', err);
      return reply.code(500).send({ error: 'Failed to delete snippet' });
    }
  });

  // GET /api/v1/org/snippets/tags - List all tags in org (viewer+)
  fastify.get('/tags/list', {
    preHandler: requirePermission('snippets:read'),
  }, async (request, reply) => {
    const { orgId } = request.user;

    try {
      const { rows } = await pool.query(
        `SELECT DISTINCT unnest(tags) as tag, COUNT(*) as count
         FROM encrypted_snippets
         WHERE org_id = $1 AND deleted_at IS NULL AND tags IS NOT NULL
         GROUP BY tag
         ORDER BY count DESC`,
        [orgId]
      );

      return { tags: rows };
    } catch (err) {
      console.error('[Snippets] Tags error:', err);
      return reply.code(500).send({ error: 'Failed to list tags' });
    }
  });
}
