import type { ClipRow } from '../database/db';

export type IntegrationPayloadFormat = 'zapier' | 'devclip';

const MAX_BODY = 200_000;

export function clipContentForOutbound(clip: ClipRow): {
  content: string;
  content_preview: string;
  is_binary_hint: boolean;
} {
  const isImage =
    clip.type === 'image' || clip.content.startsWith('data:image/') || clip.content.startsWith('data:');
  if (isImage) {
    const hint = `[binary ${clip.type} clip id=${clip.id}; image/base64 omitted]`;
    return { content: hint, content_preview: hint, is_binary_hint: true };
  }
  const raw =
    clip.content.length > MAX_BODY ? `${clip.content.slice(0, MAX_BODY)}…` : clip.content;
  const preview = raw.length > 800 ? `${raw.slice(0, 800)}…` : raw;
  return { content: raw, content_preview: preview, is_binary_hint: false };
}

/** Zapier / Make-friendly envelope + legacy DevClip automation shape. */
export function buildClipWebhookPayload(
  clip: ClipRow,
  format: IntegrationPayloadFormat
): Record<string, unknown> {
  const { content, content_preview, is_binary_hint } = clipContentForOutbound(clip);
  const createdIso = new Date(clip.created_at * 1000).toISOString();

  if (format === 'devclip') {
    return {
      event: 'devclip.new_clip',
      clip: {
        id: clip.id,
        type: clip.type,
        source: clip.source,
        created_at: clip.created_at,
        content,
      },
    };
  }

  return {
    hook: {
      event: 'clip.captured',
      version: 1,
      source: 'devclip',
    },
    timestamp: new Date().toISOString(),
    clip: {
      id: clip.id,
      type: clip.type,
      source: clip.source,
      created_at: clip.created_at,
      created_at_iso: createdIso,
      tags_json: clip.tags_json,
      use_count: clip.use_count,
      metadata_json: clip.metadata_json,
      content,
      content_preview,
      is_binary_hint,
    },
    text: content_preview,
    title: `DevClip ${clip.type} #${clip.id}`,
  };
}
