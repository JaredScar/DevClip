import type { ClipRow } from '../database/db';
import {
  addTagToClip,
  deleteClip,
  getClipById,
  getDb,
  setClipPinned,
  updateClipContent,
} from '../database/db';
import { addClipToCollection } from '../database/collections';
import { listEnabledAutomationRules } from '../database/automation';
import { runAutomationTransform } from './automationTransforms';
import { isAllowedIntegrationUrl } from './integrationsAllowUrl';

type Trigger = { kind: string };
type Cond = { field: string; op: string; value?: string };
type Action = {
  kind: string;
  name?: string;
  collectionId?: number;
  url?: string;
  id?: string;
  pattern?: string;
  replacement?: string;
};

function matchTrigger(t: Trigger): boolean {
  return t?.kind === 'new_clip';
}

function matchConds(conds: Cond[], clip: ClipRow): boolean {
  if (!Array.isArray(conds) || conds.length === 0) return true;
  for (const c of conds) {
    const field = c.field;
    const val =
      field === 'type'
        ? clip.type
        : field === 'source'
          ? clip.source ?? ''
          : field === 'content'
            ? clip.content
            : '';
    if (c.op === 'eq' && val !== (c.value ?? '')) return false;
    if (c.op === 'contains' && !String(val).includes(c.value ?? '')) return false;
    if (c.op === 'regex') {
      try {
        if (!new RegExp(c.value ?? '', 'i').test(clip.content)) return false;
      } catch {
        return false;
      }
    }
  }
  return true;
}

function fireWebhook(url: string, clip: ClipRow): void {
  if (!isAllowedIntegrationUrl(url)) {
    return;
  }
  const body = {
    event: 'devclip.new_clip',
    clip: {
      id: clip.id,
      type: clip.type,
      source: clip.source,
      created_at: clip.created_at,
      content: clip.content.length > 24_000 ? `${clip.content.slice(0, 24_000)}…` : clip.content,
    },
  };
  void fetch(url.trim(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  }).catch(() => {
    /* ignore */
  });
}

export function runAutomationForClip(clip: ClipRow): void {
  for (const rule of listEnabledAutomationRules()) {
    let trig: Trigger;
    let conds: Cond[];
    let acts: Action[];
    try {
      trig = JSON.parse(rule.trigger) as Trigger;
      conds = JSON.parse(rule.conditions) as Cond[];
      acts = JSON.parse(rule.actions) as Action[];
    } catch {
      continue;
    }
    if (!matchTrigger(trig)) continue;
    if (!matchConds(conds, clip)) continue;
    for (const a of acts) {
      const current = getClipById(clip.id);
      if (!current) break;

      if (a.kind === 'pin') {
        setClipPinned(clip.id, 1);
      } else if (a.kind === 'tag' && a.name) {
        addTagToClip(clip.id, a.name);
      } else if (a.kind === 'discard') {
        deleteClip(clip.id);
        break;
      } else if (a.kind === 'transform' && a.id) {
        try {
          const next = runAutomationTransform(
            a.id,
            current.content,
            a.pattern,
            a.replacement
          );
          updateClipContent(clip.id, next);
        } catch {
          /* skip invalid transform */
        }
      } else if (a.kind === 'webhook' && a.url) {
        fireWebhook(a.url, getClipById(clip.id) ?? current);
      } else if (a.kind === 'collection_add' && typeof a.collectionId === 'number') {
        if (!getClipById(clip.id)) break;
        const ok = getDb().prepare('SELECT 1 FROM collections WHERE id = ?').get(a.collectionId);
        if (ok) {
          addClipToCollection(a.collectionId, clip.id);
        }
      }
    }
  }
}
