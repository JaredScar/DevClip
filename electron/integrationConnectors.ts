import type { ClipRow } from '../database/db';
import { clipContentForOutbound } from './integrationPayload';
import { readIntegrationSecret } from './integrationSecretStore';
import { isAllowedIntegrationUrl } from './integrationsAllowUrl';

const NOTION_VERSION = '2022-06-28';
const FETCH_MS = 25_000;

function notionPageIdFromInput(raw: string): string {
  const s = raw.trim();
  const m = s.match(/([0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12})/i);
  return (m ? m[1] : s).replace(/-/g, '');
}

function splitNotionText(text: string, max = 1900): string[] {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += max) {
    parts.push(text.slice(i, i + max));
  }
  return parts.length ? parts : [''];
}

export async function sendClipToNotion(clip: ClipRow, token: string, pageOrBlockId: string): Promise<void> {
  const id = notionPageIdFromInput(pageOrBlockId);
  if (!id || !token.trim()) throw new Error('Notion page id and token required');
  const { content_preview } = clipContentForOutbound(clip);
  const header = `**DevClip** · ${clip.type} · #${clip.id} · ${new Date(clip.created_at * 1000).toISOString()}`;
  const bodyText = `${header}\n${content_preview}`;
  const children = splitNotionText(bodyText)
    .slice(0, 99)
    .map((t) => ({
      object: 'block' as const,
      type: 'paragraph' as const,
      paragraph: {
        rich_text: [{ type: 'text' as const, text: { content: t } }],
      },
    }));
  const r = await fetch(`https://api.notion.com/v1/blocks/${id}/children`, {
    method: 'PATCH',
    signal: AbortSignal.timeout(FETCH_MS),
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ children }),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Notion ${r.status}: ${err.slice(0, 200)}`);
  }
}

export async function sendClipToSlackWebhook(webhookUrl: string, clip: ClipRow): Promise<void> {
  if (!isAllowedIntegrationUrl(webhookUrl)) throw new Error('Invalid Slack webhook URL');
  const { content_preview } = clipContentForOutbound(clip);
  const text = `*DevClip* ${clip.type} #${clip.id}\n\`\`\`\n${content_preview}\n\`\`\``;
  const r = await fetch(webhookUrl.trim(), {
    method: 'POST',
    signal: AbortSignal.timeout(FETCH_MS),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!r.ok) {
    throw new Error(`Slack ${r.status}`);
  }
}

export async function createGithubGistFromClip(
  clip: ClipRow,
  token: string,
  opts: { isPublic: boolean; filename?: string }
): Promise<{ html_url: string }> {
  if (!token.trim()) throw new Error('GitHub token required');
  const { content } = clipContentForOutbound(clip);
  const ext =
    clip.type === 'json'
      ? 'json'
      : clip.type === 'sql'
        ? 'sql'
        : clip.type === 'code'
          ? 'txt'
          : 'txt';
  const fname = (opts.filename?.trim() || `devclip-${clip.id}`).replace(/[^a-zA-Z0-9._-]/g, '_') + `.${ext}`;
  const r = await fetch('https://api.github.com/gists', {
    method: 'POST',
    signal: AbortSignal.timeout(FETCH_MS),
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      description: `DevClip ${clip.type} #${clip.id}`,
      public: opts.isPublic,
      files: {
        [fname]: { content },
      },
    }),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`GitHub ${r.status}: ${err.slice(0, 200)}`);
  }
  const data = (await r.json()) as { html_url?: string };
  if (!data.html_url) throw new Error('Gist created but no URL returned');
  return { html_url: data.html_url };
}

function jiraAdfParagraph(text: string): Record<string, unknown> {
  const chunks = splitNotionText(text.replace(/\r\n/g, '\n'), 4000);
  return {
    type: 'doc',
    version: 1,
    content: chunks.map((c) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: c }],
    })),
  };
}

function normalizeJiraSite(site: string): string {
  let u = site.trim().replace(/\/$/, '');
  if (!u.startsWith('http')) u = `https://${u}`;
  return u.replace(/\/$/, '');
}

export async function addJiraCommentToIssue(
  clip: ClipRow,
  site: string,
  email: string,
  apiToken: string,
  issueKey: string
): Promise<void> {
  const base = normalizeJiraSite(site);
  const key = issueKey.trim().toUpperCase();
  if (!key || !email.trim() || !apiToken.trim()) throw new Error('Jira site, email, token, and issue key required');
  const { content_preview } = clipContentForOutbound(clip);
  const bodyText = `DevClip ${clip.type} #${clip.id} (${new Date(clip.created_at * 1000).toISOString()})\n\n${content_preview}`;
  const auth = Buffer.from(`${email.trim()}:${apiToken.trim()}`).toString('base64');
  const r = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(key)}/comment`, {
    method: 'POST',
    signal: AbortSignal.timeout(FETCH_MS),
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body: jiraAdfParagraph(bodyText) }),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Jira ${r.status}: ${err.slice(0, 200)}`);
  }
}

export async function runOptionalCaptureConnectors(
  clip: ClipRow,
  userData: string,
  getSettings: () => Record<string, string>
): Promise<void> {
  const s = getSettings();
  const tasks: Promise<unknown>[] = [];

  if (s['integrationsNotionOnCapture'] === '1') {
    const pageId = s['integrationsNotionPageId']?.trim();
    const token = readIntegrationSecret(userData, 'notion');
    if (pageId && token) {
      tasks.push(sendClipToNotion(clip, token, pageId).catch(() => undefined));
    }
  }

  if (s['integrationsSlackOnCapture'] === '1') {
    const wh = s['integrationsSlackWebhookUrl']?.trim();
    if (wh && isAllowedIntegrationUrl(wh)) {
      tasks.push(sendClipToSlackWebhook(wh, clip).catch(() => undefined));
    }
  }

  if (s['integrationsJiraOnCapture'] === '1') {
    const issueKey = s['integrationsJiraCaptureIssueKey']?.trim();
    const site = s['integrationsJiraSite']?.trim();
    const email = s['integrationsJiraEmail']?.trim();
    const token = readIntegrationSecret(userData, 'jira');
    if (issueKey && site && email && token) {
      tasks.push(addJiraCommentToIssue(clip, site, email, token, issueKey).catch(() => undefined));
    }
  }

  await Promise.allSettled(tasks);
}
