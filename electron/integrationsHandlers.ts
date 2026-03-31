import { app, ipcMain } from 'electron';
import { getClipById, getSettingsMap, setSetting } from '../database/db';
import type { ClipRow } from '../database/db';
import { buildClipWebhookPayload, type IntegrationPayloadFormat } from './integrationPayload';
import {
  addJiraCommentToIssue,
  createGithubGistFromClip,
  sendClipToNotion,
  sendClipToSlackWebhook,
} from './integrationConnectors';
import { readIntegrationSecret, writeIntegrationSecret, hasIntegrationSecret, type IntegrationSecretId } from './integrationSecretStore';
import { isAllowedIntegrationUrl } from './integrationsAllowUrl';

const SETTINGS_KEYS = new Set([
  'integrationsOutboundEnabled',
  'integrationsOutboundUrl',
  'integrationsPayloadFormat',
  'integrationsNotionPageId',
  'integrationsNotionOnCapture',
  'integrationsSlackWebhookUrl',
  'integrationsSlackOnCapture',
  'integrationsJiraSite',
  'integrationsJiraEmail',
  'integrationsJiraCaptureIssueKey',
  'integrationsJiraOnCapture',
]);

function userData(): string {
  return app.getPath('userData');
}

export function registerIntegrationsIpc(): void {
  ipcMain.handle('integrations:getStatus', () => {
    const s = getSettingsMap();
    const ud = userData();
    return {
      outboundEnabled: s['integrationsOutboundEnabled'] === '1',
      outboundUrl: s['integrationsOutboundUrl'] ?? '',
      payloadFormat: (s['integrationsPayloadFormat'] ?? 'zapier') as IntegrationPayloadFormat,
      hasWebhookHmac: hasIntegrationSecret(ud, 'webhook_hmac'),
      notionPageId: s['integrationsNotionPageId'] ?? '',
      notionTokenSet: hasIntegrationSecret(ud, 'notion'),
      notionOnCapture: s['integrationsNotionOnCapture'] === '1',
      slackWebhookUrl: s['integrationsSlackWebhookUrl'] ?? '',
      slackOnCapture: s['integrationsSlackOnCapture'] === '1',
      githubTokenSet: hasIntegrationSecret(ud, 'github'),
      jiraSite: s['integrationsJiraSite'] ?? '',
      jiraEmail: s['integrationsJiraEmail'] ?? '',
      jiraTokenSet: hasIntegrationSecret(ud, 'jira'),
      jiraCaptureIssueKey: s['integrationsJiraCaptureIssueKey'] ?? '',
      jiraOnCapture: s['integrationsJiraOnCapture'] === '1',
    };
  });

  ipcMain.handle('integrations:saveSettings', (_e, patch: Record<string, string>) => {
    for (const [k, v] of Object.entries(patch ?? {})) {
      if (SETTINGS_KEYS.has(k)) {
        setSetting(k, String(v ?? ''));
      }
    }
    return { ok: true as const };
  });

  ipcMain.handle('integrations:setSecret', (_e, id: string, value: string) => {
    const allowed: IntegrationSecretId[] = ['notion', 'github', 'jira', 'webhook_hmac'];
    if (!allowed.includes(id as IntegrationSecretId)) {
      return { ok: false as const, error: 'invalid_secret_id' };
    }
    writeIntegrationSecret(userData(), id as IntegrationSecretId, String(value ?? ''));
    return { ok: true as const };
  });

  ipcMain.handle('integrations:testWebhook', async () => {
    const s = getSettingsMap();
    const url = (s['integrationsOutboundUrl'] ?? '').trim();
    if (!url || !isAllowedIntegrationUrl(url)) {
      return { ok: false as const, error: 'Set a valid HTTPS outbound URL first' };
    }
    const format = (s['integrationsPayloadFormat'] ?? 'zapier') as IntegrationPayloadFormat;
    const sample: ClipRow = {
      id: 0,
      content: 'Test payload from DevClip Integrations',
      type: 'text',
      source: 'devclip:test',
      created_at: Math.floor(Date.now() / 1000),
      is_pinned: 0,
      tags_json: '[]',
      use_count: 0,
      metadata_json: '{}',
    };
    const bodyObj = buildClipWebhookPayload(sample, format === 'devclip' ? 'devclip' : 'zapier');
    const json = JSON.stringify(bodyObj);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'DevClip-Integrations/1.0',
    };
    const secret = readIntegrationSecret(userData(), 'webhook_hmac');
    if (secret) {
      const { createHmac } = await import('crypto');
      const sig = createHmac('sha256', secret).update(json).digest('hex');
      headers['X-DevClip-Signature'] = `sha256=${sig}`;
    }
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers,
        body: json,
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) {
        return { ok: false as const, error: `HTTP ${r.status}` };
      }
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('integrations:sendNotion', async (_e, clipId: number) => {
    const clip = getClipById(Number(clipId));
    if (!clip) return { ok: false as const, error: 'Clip not found' };
    const s = getSettingsMap();
    const pageId = s['integrationsNotionPageId']?.trim();
    const token = readIntegrationSecret(userData(), 'notion');
    if (!pageId || !token) return { ok: false as const, error: 'Configure Notion page id and token' };
    try {
      await sendClipToNotion(clip, token, pageId);
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('integrations:sendSlack', async (_e, clipId: number) => {
    const clip = getClipById(Number(clipId));
    if (!clip) return { ok: false as const, error: 'Clip not found' };
    const url = (getSettingsMap()['integrationsSlackWebhookUrl'] ?? '').trim();
    if (!url) return { ok: false as const, error: 'Configure Slack incoming webhook URL' };
    try {
      await sendClipToSlackWebhook(url, clip);
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle(
    'integrations:createGist',
    async (_e, payload: { clipId: number; isPublic?: boolean; filename?: string }) => {
      const clip = getClipById(Number(payload?.clipId));
      if (!clip) return { ok: false as const, error: 'Clip not found' };
      const token = readIntegrationSecret(userData(), 'github');
      if (!token) return { ok: false as const, error: 'Save a GitHub personal access token first' };
      try {
        const { html_url } = await createGithubGistFromClip(clip, token, {
          isPublic: payload?.isPublic === true,
          filename: payload?.filename,
        });
        return { ok: true as const, url: html_url };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    }
  );

  ipcMain.handle(
    'integrations:jiraComment',
    async (_e, payload: { clipId: number; issueKey: string }) => {
      const clip = getClipById(Number(payload?.clipId));
      if (!clip) return { ok: false as const, error: 'Clip not found' };
      const s = getSettingsMap();
      const site = s['integrationsJiraSite']?.trim();
      const email = s['integrationsJiraEmail']?.trim();
      const token = readIntegrationSecret(userData(), 'jira');
      const key = String(payload?.issueKey ?? '').trim();
      if (!site || !email || !token || !key) {
        return { ok: false as const, error: 'Configure Jira site, email, API token, and issue key' };
      }
      try {
        await addJiraCommentToIssue(clip, site, email, token, key);
        return { ok: true as const };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    }
  );

}
