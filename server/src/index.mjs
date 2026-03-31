import Fastify from 'fastify';

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

fastify.get('/health', async () => ({ ok: true }));

const port = Number(process.env.PORT) || 8787;
const host = process.env.HOST || '0.0.0.0';

await fastify.listen({ port, host });
