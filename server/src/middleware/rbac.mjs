import { pool } from '../db.mjs';

/**
 * RBAC (Role-Based Access Control) Middleware for DevClip Enterprise
 *
 * Roles:
 * - owner: Full control over org, billing, members, policies
 * - admin: Manage members, snippets, policies (no billing deletion)
 * - member: Create/edit own snippets, view shared resources
 * - viewer: Read-only access to shared snippets and policies
 *
 * Permissions are checked at the route level using requireRole() or requirePermission()
 */

export const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
  VIEWER: 'viewer',
};

// Permission matrix: role -> array of allowed permissions
const PERMISSION_MATRIX = {
  [ROLES.OWNER]: [
    // Org management
    'org:read', 'org:update', 'org:delete',
    'org:billing:read', 'org:billing:update',
    // Members
    'members:read', 'members:create', 'members:update', 'members:delete',
    // Snippets
    'snippets:read', 'snippets:create', 'snippets:update', 'snippets:delete',
    'snippets:admin', // admin override on any snippet
    // Policies
    'policies:read', 'policies:create', 'policies:update', 'policies:delete', 'policies:activate',
    // Audit
    'audit:read', 'audit:export',
    // API Keys
    'apikeys:read', 'apikeys:create', 'apikeys:revoke',
    // Sync
    'sync:read', 'sync:write', 'sync:admin',
  ],
  [ROLES.ADMIN]: [
    // Org management (no delete)
    'org:read', 'org:update',
    'org:billing:read',
    // Members (no delete owner)
    'members:read', 'members:create', 'members:update',
    // Snippets
    'snippets:read', 'snippets:create', 'snippets:update', 'snippets:delete',
    'snippets:admin',
    // Policies
    'policies:read', 'policies:create', 'policies:update', 'policies:activate',
    // Audit
    'audit:read', 'audit:export',
    // API Keys
    'apikeys:read', 'apikeys:create', 'apikeys:revoke',
    // Sync
    'sync:read', 'sync:write', 'sync:admin',
  ],
  [ROLES.MEMBER]: [
    // Org (read only)
    'org:read',
    // Members (view only)
    'members:read',
    // Snippets (own + shared)
    'snippets:read', 'snippets:create', 'snippets:update:own', 'snippets:delete:own',
    // Policies (read only)
    'policies:read',
    // Sync
    'sync:read', 'sync:write',
  ],
  [ROLES.VIEWER]: [
    // Read-only access
    'org:read',
    'members:read',
    'snippets:read',
    'policies:read',
    'sync:read',
  ],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role, permission) {
  const permissions = PERMISSION_MATRIX[role] || [];
  return permissions.includes(permission) || permissions.includes(`${permission.split(':')[0]}:admin`);
}

/**
 * Middleware: Load user's org membership and role
 * Must be called after authentication middleware
 */
export async function loadOrgMembership(request, reply) {
  if (!request.user) {
    return reply.code(401).send({ error: 'Not authenticated' });
  }

  const { orgId, userId } = request.user;

  if (!orgId) {
    // User doesn't belong to an org
    request.membership = null;
    request.userRole = null;
    return;
  }

  try {
    const { rows } = await pool.query(
      `SELECT om.id, om.role, om.is_active, o.name as org_name, o.tier as org_tier
       FROM org_members om
       JOIN organizations o ON o.id = om.org_id
       WHERE om.org_id = $1 AND om.user_id = $2 AND om.is_active = true`,
      [orgId, userId]
    );

    if (rows.length === 0) {
      request.membership = null;
      request.userRole = null;
      return reply.code(403).send({ error: 'Not a member of this organization' });
    }

    request.membership = rows[0];
    request.userRole = rows[0].role;
  } catch (err) {
    console.error('[RBAC] Error loading membership:', err);
    return reply.code(500).send({ error: 'Failed to verify organization membership' });
  }
}

/**
 * Middleware factory: Require specific role
 */
export function requireRole(...allowedRoles) {
  return async (request, reply) => {
    if (!request.userRole) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'Organization membership required',
      });
    }

    if (!allowedRoles.includes(request.userRole)) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: `Required role: ${allowedRoles.join(' or ')}`,
        currentRole: request.userRole,
      });
    }
  };
}

/**
 * Middleware factory: Require specific permission
 */
export function requirePermission(permission) {
  return async (request, reply) => {
    if (!request.userRole) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'Organization membership required',
      });
    }

    if (!hasPermission(request.userRole, permission)) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: `Permission required: ${permission}`,
        currentRole: request.userRole,
      });
    }

    // Attach permission check result
    request.hasPermission = (perm) => hasPermission(request.userRole, perm);
  };
}

/**
 * Middleware: Check if user owns a specific resource
 * For snippets, clips, etc.
 */
export function requireOwnership(resourceType, idParam = 'id') {
  return async (request, reply) => {
    const resourceId = request.params[idParam];
    const { userId, orgId } = request.user;

    if (!resourceId) {
      return reply.code(400).send({ error: 'Resource ID required' });
    }

    try {
      let ownerCheckQuery;
      let queryParams;

      switch (resourceType) {
        case 'snippet':
          ownerCheckQuery = 'SELECT created_by as owner FROM encrypted_snippets WHERE id = $1 AND org_id = $2';
          queryParams = [resourceId, orgId];
          break;
        case 'apikey':
          ownerCheckQuery = 'SELECT user_id as owner FROM api_keys WHERE id = $1 AND org_id = $2';
          queryParams = [resourceId, orgId];
          break;
        case 'policy':
          ownerCheckQuery = 'SELECT created_by as owner FROM policies WHERE id = $1 AND org_id = $2';
          queryParams = [resourceId, orgId];
          break;
        default:
          return reply.code(500).send({ error: 'Unknown resource type' });
      }

      const { rows } = await pool.query(ownerCheckQuery, queryParams);

      if (rows.length === 0) {
        return reply.code(404).send({ error: 'Resource not found' });
      }

      const ownerId = rows[0].owner;
      const isOwner = ownerId === userId;
      const isAdmin = hasPermission(request.userRole, `${resourceType}:admin`) ||
                      hasPermission(request.userRole, 'org:admin');

      if (!isOwner && !isAdmin) {
        return reply.code(403).send({
          error: 'Forbidden',
          message: 'You do not own this resource',
        });
      }

      request.isResourceOwner = isOwner;
      request.resourceOwnerId = ownerId;
    } catch (err) {
      console.error('[RBAC] Ownership check error:', err);
      return reply.code(500).send({ error: 'Failed to verify resource ownership' });
    }
  };
}

/**
 * Get role hierarchy (for role comparison)
 */
export function getRoleLevel(role) {
  const hierarchy = {
    [ROLES.OWNER]: 4,
    [ROLES.ADMIN]: 3,
    [ROLES.MEMBER]: 2,
    [ROLES.VIEWER]: 1,
  };
  return hierarchy[role] || 0;
}

/**
 * Check if one role outranks another
 */
export function outranks(role1, role2) {
  return getRoleLevel(role1) > getRoleLevel(role2);
}

/**
 * RBAC-aware audit log helper
 */
export async function rbacAuditLog(action, request, resourceType, resourceId, details = {}) {
  const { createAuditEntry } = await import('../utils/audit.mjs');
  
  await createAuditEntry({
    eventType: `rbac:${action}`,
    orgId: request.user?.orgId,
    userId: request.user?.id,
    resourceType,
    resourceId,
    payload: {
      role: request.userRole,
      ...details,
    },
  });
}
