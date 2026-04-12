import Fastify from 'fastify';
import SyncWebSocketServer from './websocket/sync.mjs';

const fastify = Fastify({ logger: true });

function keySet(envName) {
  return new Set(
    String(process.env[envName] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

const extraEnterprise = keySet('DEVCLIP_EXTRA_ENTERPRISE_KEYS');
const extraPro = keySet('DEVCLIP_EXTRA_PRO_KEYS');

function tierForKey(key) {
  const k = String(key ?? '').trim();
  if (!k) return null;
  if (k.startsWith('dc_ent_') || extraEnterprise.has(k)) return 'enterprise';
  if (k.startsWith('dc_pro_') || extraPro.has(k)) return 'pro';
  return null;
}

fastify.post(
  '/api/v1/license/validate',
  {
    schema: {
      body: {
        type: 'object',
        properties: { key: { type: 'string' } },
      },
    },
  },
  async (request, reply) => {
    const { key } = request.body ?? {};
    const tier = tierForKey(key);
    if (!tier) {
      return reply.code(404).send({ error: 'invalid_key' });
    }
    return {
      tier,
      features: ['all'],
      expires_at: null,
      device_count: null,
    };
  }
);

fastify.get('/health', async () => {
  // Basic health check - in production, also verify database connectivity
  const health = {
    ok: true,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    checks: {
      server: 'healthy',
    },
  };

  // If database is configured, check connection
  if (process.env.DATABASE_URL) {
    try {
      const { pool } = await import('./db.mjs');
      await pool.query('SELECT 1');
      health.checks.database = 'healthy';
    } catch {
      health.checks.database = 'unhealthy';
      health.ok = false;
    }
  }

  // WebSocket stats
  if (fastify.wss) {
    health.websocket = fastify.wss.getStats();
  }

  return health;
});

// Sync bundle endpoints (for REST-based sync)
fastify.get('/api/v1/sync/bundle', async (request, reply) => {
  const auth = request.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
  
  // For now, return placeholder (full implementation would query encrypted_clips, etc.)
  return {
    has_changes: false,
    message: 'Sync endpoint ready. Encrypted blob retrieval not yet implemented.',
  };
});

// Notify other devices about sync (triggered by sync bundle upload)
fastify.post('/api/v1/sync/notify', async (request, reply) => {
  const auth = request.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
  
  const { channel, cursor } = request.body || {};
  
  // Extract user info from auth (simplified - would validate token in production)
  // For now, just log that notification would be sent
  console.log(`[Sync] Notification on channel ${channel} with cursor`, cursor);
  
  return { notified: true, channel };
});

// Register snippet library routes
const { default: snippetRoutes } = await import('./routes/snippets.mjs');
await fastify.register(snippetRoutes, { prefix: '/api/v1/org/snippets' });

const port = Number(process.env.PORT) || 8787;
const host = process.env.HOST || '0.0.0.0';

await fastify.listen({ port, host });

// Initialize WebSocket sync server
const wss = new SyncWebSocketServer(fastify.server);
console.log('[Server] WebSocket sync server initialized at /v1/realtime');

// Expose WebSocket server for use in routes
fastify.decorate('wss', wss);
