import { WebSocketServer } from 'ws';
import { createHash } from 'crypto';
import { pool } from '../db.mjs';

/**
 * WebSocket Sync Server for DevClip Enterprise
 * 
 * Provides real-time sync notifications:
 * - Client connects with API key authentication
 * - Server notifies clients when their sync data changes
 * - Clients request sync bundles via existing HTTPS API
 * - Supports channels: clips, snippets, settings, vault
 */

const MAX_CONNECTIONS_PER_USER = 5;
const HEARTBEAT_INTERVAL_MS = 30000;
const HEARTBEAT_TIMEOUT_MS = 60000;

class SyncWebSocketServer {
  constructor(fastifyServer) {
    this.wss = new WebSocketServer({ 
      server: fastifyServer,
      path: '/v1/realtime',
    });
    
    // Map: userId -> Set of WebSocket connections
    this.userConnections = new Map();
    
    // Map: socket -> { userId, deviceId, channels, lastPing }
    this.socketMetadata = new WeakMap();
    
    this.setupWSS();
    this.startHeartbeat();
  }

  setupWSS() {
    this.wss.on('connection', (ws, req) => {
      console.log('[WebSocket] New connection from', req.socket.remoteAddress);
      
      // Initial state: not authenticated
      this.socketMetadata.set(ws, {
        authenticated: false,
        userId: null,
        orgId: null,
        deviceId: null,
        channels: new Set(),
        lastPing: Date.now(),
      });

      ws.on('message', (data) => this.handleMessage(ws, data));
      ws.on('close', () => this.handleDisconnect(ws));
      ws.on('pong', () => {
        const meta = this.socketMetadata.get(ws);
        if (meta) meta.lastPing = Date.now();
      });

      // Send welcome message
      this.send(ws, {
        type: 'connected',
        message: 'WebSocket sync connection established. Please authenticate.',
      });
    });
  }

  async handleMessage(ws, data) {
    const meta = this.socketMetadata.get(ws);
    if (!meta) return;

    try {
      const msg = JSON.parse(data.toString());
      
      switch (msg.type) {
        case 'auth':
          await this.handleAuth(ws, msg);
          break;
        case 'subscribe':
          await this.handleSubscribe(ws, msg);
          break;
        case 'unsubscribe':
          await this.handleUnsubscribe(ws, msg);
          break;
        case 'ping':
          this.send(ws, { type: 'pong', timestamp: Date.now() });
          break;
        case 'cursor_update':
          await this.handleCursorUpdate(ws, msg);
          break;
        default:
          this.send(ws, { type: 'error', message: `Unknown message type: ${msg.type}` });
      }
    } catch (err) {
      console.error('[WebSocket] Message handling error:', err);
      this.send(ws, { type: 'error', message: 'Invalid message format' });
    }
  }

  async handleAuth(ws, msg) {
    const { apiKey, deviceId, orgId } = msg;
    
    if (!apiKey || !deviceId) {
      this.send(ws, { type: 'auth_failed', reason: 'Missing apiKey or deviceId' });
      ws.close(4001, 'Authentication required');
      return;
    }

    // Validate API key against database
    const validation = await this.validateApiKey(apiKey, orgId);
    
    if (!validation.valid) {
      this.send(ws, { type: 'auth_failed', reason: 'Invalid API key' });
      ws.close(4002, 'Invalid API key');
      return;
    }

    // Check connection limit per user
    const userConns = this.userConnections.get(validation.userId);
    if (userConns && userConns.size >= MAX_CONNECTIONS_PER_USER) {
      this.send(ws, { type: 'auth_failed', reason: 'Too many connections' });
      ws.close(4003, 'Connection limit exceeded');
      return;
    }

    // Update metadata
    const meta = this.socketMetadata.get(ws);
    meta.authenticated = true;
    meta.userId = validation.userId;
    meta.orgId = validation.orgId;
    meta.deviceId = deviceId;
    meta.tier = validation.tier;

    // Add to user connections
    if (!this.userConnections.has(validation.userId)) {
      this.userConnections.set(validation.userId, new Set());
    }
    this.userConnections.get(validation.userId).add(ws);

    // Record session in database
    await this.recordSession(validation.userId, deviceId, validation.orgId);

    console.log(`[WebSocket] User ${validation.userId} authenticated from device ${deviceId}`);

    this.send(ws, {
      type: 'auth_success',
      userId: validation.userId,
      tier: validation.tier,
      channels: ['clips', 'snippets', 'settings', 'vault'],
    });
  }

  async handleSubscribe(ws, msg) {
    const meta = this.socketMetadata.get(ws);
    
    if (!meta?.authenticated) {
      this.send(ws, { type: 'error', message: 'Not authenticated' });
      return;
    }

    const { channels } = msg;
    if (!Array.isArray(channels)) {
      this.send(ws, { type: 'error', message: 'channels must be an array' });
      return;
    }

    const validChannels = ['clips', 'snippets', 'settings', 'vault'];
    for (const ch of channels) {
      if (validChannels.includes(ch)) {
        meta.channels.add(ch);
      }
    }

    this.send(ws, { 
      type: 'subscribed', 
      channels: Array.from(meta.channels) 
    });
  }

  async handleUnsubscribe(ws, msg) {
    const meta = this.socketMetadata.get(ws);
    
    if (!meta?.authenticated) return;

    const { channels } = msg;
    if (Array.isArray(channels)) {
      for (const ch of channels) {
        meta.channels.delete(ch);
      }
    }

    this.send(ws, { 
      type: 'unsubscribed', 
      channels: Array.from(meta.channels) 
    });
  }

  async handleCursorUpdate(ws, msg) {
    const meta = this.socketMetadata.get(ws);
    
    if (!meta?.authenticated) return;

    const { cursor } = msg;
    
    // Update cursor in database
    if (pool) {
      try {
        await pool.query(
          `INSERT INTO sync_cursors (user_id, device_id, cursor_data, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (user_id, device_id)
           DO UPDATE SET cursor_data = $3, updated_at = NOW()`,
          [meta.userId, meta.deviceId, JSON.stringify(cursor)]
        );
      } catch (err) {
        console.error('[WebSocket] Failed to update cursor:', err);
      }
    }

    this.send(ws, { type: 'cursor_ack', timestamp: Date.now() });
  }

  handleDisconnect(ws) {
    const meta = this.socketMetadata.get(ws);
    
    if (meta?.authenticated && meta.userId) {
      const userConns = this.userConnections.get(meta.userId);
      if (userConns) {
        userConns.delete(ws);
        if (userConns.size === 0) {
          this.userConnections.delete(meta.userId);
        }
      }
      
      // Update session in database as disconnected
      this.endSession(meta.userId, meta.deviceId);
      
      console.log(`[WebSocket] User ${meta.userId} disconnected`);
    }
  }

  async validateApiKey(apiKey, orgId) {
    // Support prefix keys and full database lookup
    const k = String(apiKey).trim();
    
    // Prefix key validation (offline-friendly)
    if (k.startsWith('dc_ent_')) {
      return { valid: true, tier: 'enterprise', userId: this.hashKey(k) };
    }
    if (k.startsWith('dc_pro_')) {
      return { valid: true, tier: 'pro', userId: this.hashKey(k) };
    }

    // Database validation for full API keys
    if (!pool) {
      return { valid: false };
    }

    try {
      const keyHash = createHash('sha256').update(k).digest('hex');
      const { rows } = await pool.query(
        `SELECT ak.id, ak.org_id, ak.user_id, ak.scopes, ak.expires_at,
                o.tier as org_tier
         FROM api_keys ak
         LEFT JOIN organizations o ON o.id = ak.org_id
         WHERE ak.key_hash = $1 AND ak.is_active = true
           AND (ak.expires_at IS NULL OR ak.expires_at > NOW())`,
        [keyHash]
      );

      if (rows.length === 0) {
        return { valid: false };
      }

      const key = rows[0];
      
      // Update last used
      await pool.query(
        `UPDATE api_keys 
         SET last_used_at = NOW(), usage_count = usage_count + 1
         WHERE id = $1`,
        [key.id]
      );

      return {
        valid: true,
        userId: key.user_id,
        orgId: key.org_id,
        tier: key.org_tier === 'enterprise' ? 'enterprise' : 'pro',
      };
    } catch (err) {
      console.error('[WebSocket] API key validation error:', err);
      return { valid: false };
    }
  }

  hashKey(key) {
    return createHash('sha256').update(key).digest('hex').slice(0, 32);
  }

  async recordSession(userId, deviceId, orgId) {
    if (!pool) return;
    
    try {
      await pool.query(
        `INSERT INTO sync_sessions (user_id, device_id, org_id, socket_id, connected_at, last_ping_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (user_id, device_id) 
         DO UPDATE SET socket_id = $4, connected_at = NOW(), disconnected_at = NULL`,
        [userId, deviceId, orgId, `ws-${Date.now()}`]
      );
    } catch (err) {
      console.error('[WebSocket] Failed to record session:', err);
    }
  }

  async endSession(userId, deviceId) {
    if (!pool) return;
    
    try {
      await pool.query(
        `UPDATE sync_sessions 
         SET disconnected_at = NOW()
         WHERE user_id = $1 AND device_id = $2`,
        [userId, deviceId]
      );
    } catch (err) {
      console.error('[WebSocket] Failed to end session:', err);
    }
  }

  /**
   * Notify a user's devices about sync updates
   * @param {string} userId - User to notify
   * @param {string} channel - Channel that updated: 'clips', 'snippets', 'settings', 'vault'
   * @param {Object} payload - Optional payload with update details
   */
  notifyUser(userId, channel, payload = {}) {
    const userConns = this.userConnections.get(userId);
    if (!userConns) return;

    for (const ws of userConns) {
      const meta = this.socketMetadata.get(ws);
      if (!meta?.authenticated) continue;
      if (!meta.channels.has(channel)) continue;

      this.send(ws, {
        type: 'update',
        channel,
        timestamp: new Date().toISOString(),
        ...payload,
      });
    }
  }

  /**
   * Broadcast to all connected clients in an org
   */
  notifyOrg(orgId, channel, payload = {}) {
    for (const [userId, connections] of this.userConnections) {
      for (const ws of connections) {
        const meta = this.socketMetadata.get(ws);
        if (meta?.orgId === orgId && meta.channels.has(channel)) {
          this.send(ws, {
            type: 'org_update',
            channel,
            timestamp: new Date().toISOString(),
            ...payload,
          });
        }
      }
    }
  }

  send(ws, message) {
    if (ws.readyState === 1) { // OPEN
      ws.send(JSON.stringify(message));
    }
  }

  startHeartbeat() {
    setInterval(() => {
      const now = Date.now();
      
      for (const connections of this.userConnections.values()) {
        for (const ws of connections) {
          const meta = this.socketMetadata.get(ws);
          if (!meta) continue;

          // Check for timeout
          if (now - meta.lastPing > HEARTBEAT_TIMEOUT_MS) {
            console.log('[WebSocket] Client timeout, closing connection');
            ws.terminate();
            continue;
          }

          // Send ping
          if (ws.readyState === 1) {
            ws.ping();
          }
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  getStats() {
    let totalConnections = 0;
    let authenticatedConnections = 0;

    for (const connections of this.userConnections.values()) {
      for (const ws of connections) {
        totalConnections++;
        const meta = this.socketMetadata.get(ws);
        if (meta?.authenticated) authenticatedConnections++;
      }
    }

    return {
      totalUsers: this.userConnections.size,
      totalConnections,
      authenticatedConnections,
    };
  }
}

export default SyncWebSocketServer;
