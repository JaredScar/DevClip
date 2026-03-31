import { createHmac } from 'crypto';
import type { ClipRow } from '../database/db';
import { getSettingsMap } from '../database/db';
import { buildClipWebhookPayload, type IntegrationPayloadFormat } from './integrationPayload';
import { readIntegrationSecret } from './integrationSecretStore';
import { isAllowedIntegrationUrl } from './integrationsAllowUrl';

export function fireCaptureOutboundWebhook(clip: ClipRow, userData: string): void {
  const s = getSettingsMap();
  if (s['integrationsOutboundEnabled'] !== '1') return;
  const url = (s['integrationsOutboundUrl'] ?? '').trim();
  if (!url || !isAllowedIntegrationUrl(url)) return;
  const format = (s['integrationsPayloadFormat'] ?? 'zapier') as IntegrationPayloadFormat;
  if (format !== 'zapier' && format !== 'devclip') return;
  const bodyObj = buildClipWebhookPayload(clip, format);
  const json = JSON.stringify(bodyObj);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'DevClip-Integrations/1.0',
  };
  const secret = readIntegrationSecret(userData, 'webhook_hmac');
  if (secret) {
    const sig = createHmac('sha256', secret).update(json).digest('hex');
    headers['X-DevClip-Signature'] = `sha256=${sig}`;
  }
  void fetch(url, {
    method: 'POST',
    headers,
    body: json,
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {
    /* non-blocking */
  });
}
