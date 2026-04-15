import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import type { Clip, ClipSearchOptions, ClipType } from '../models/clip.model';
import { ClipsStore } from '../store/clips.store';

function parseJsonArray(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function mapClipRow(row: Record<string, unknown>): Clip {
  const tags = parseJsonArray(row['tags_json'] as string | undefined);
  let metadata: Record<string, unknown> | undefined;
  try {
    metadata = JSON.parse((row['metadata_json'] as string) || '{}') as Record<string, unknown>;
  } catch {
    metadata = {};
  }
  return {
    id: row['id'] as number,
    content: row['content'] as string,
    type: row['type'] as ClipType,
    source: (row['source'] as string | null) ?? null,
    created_at: row['created_at'] as number,
    is_pinned: row['is_pinned'] as number,
    tags,
    use_count: Number(row['use_count'] ?? 0),
    metadata,
  };
}

@Injectable({ providedIn: 'root' })
export class ClipService {
  constructor(
    private readonly store: ClipsStore,
    private readonly router: Router
  ) {}

  async bootstrap() {
    await this.refreshSearch(this.store.searchQuery());
  }

  async refreshSearch(query: string, context?: 'overlay' | 'main') {
    const filter = this.store.activeFilter();
    const typeFilter = filter === 'all' ? 'all' : filter;
    const opts: ClipSearchOptions = {};
    const tags = this.store.selectedTags();
    if (tags.length) opts.tagNames = tags;
    const df = this.store.dateFrom();
    const dt = this.store.dateTo();
    if (df != null) opts.dateFrom = df;
    if (dt != null) opts.dateTo = dt;
    const src = this.store.sourceAppFilter().trim();
    if (src) opts.sourceApp = src;

    const ctx =
      context ?? (this.router.url.includes('overlay') ? 'overlay' : 'main');
    const settings = await window.devclip.settingsGet();
    if (
      ctx === 'overlay' &&
      settings['overlayFuzzySearch'] === '1' &&
      query.trim().length > 0
    ) {
      opts.fuzzy = true;
    }

    const rows = (await window.devclip.searchClips(query, typeFilter, opts)) as Record<
      string,
      unknown
    >[];
    this.store.selectedIndex.set(0);
    this.store.setClips(rows.map(mapClipRow));
  }

  async reloadFromServer() {
    await this.refreshSearch(this.store.searchQuery());
  }

  async togglePin(id: number) {
    await window.devclip.togglePin(id);
    await this.reloadFromServer();
  }

  async deleteClip(id: number) {
    await window.devclip.deleteClip(id);
    await this.reloadFromServer();
  }

  async clearAllHistory() {
    await window.devclip.clearAllClips();
    await this.reloadFromServer();
  }

  async vaultAddFromClip(clipId: number, titleHint = '') {
    const r = await window.devclip.vaultAddFromClip(clipId, titleHint);
    if (r.ok) {
      await this.reloadFromServer();
    }
    return r;
  }

  async copyContent(text: string, id: number, type?: ClipType) {
    await window.devclip.incrementClipUse(id);
    if (type === 'image' && text.startsWith('data:image/')) {
      await window.devclip.copyImageToClipboard(text);
    } else {
      await window.devclip.copyToClipboard(text);
    }
    this.store.flashCopy(id);
  }

  async tagClip(clipId: number, tagName: string) {
    await window.devclip.tagClip(clipId, tagName);
    await this.reloadFromServer();
  }

  async untagClip(clipId: number, tagName: string) {
    await window.devclip.untagClip(clipId, tagName);
    await this.reloadFromServer();
  }

  subscribeNewClips() {
    return window.devclip.onNewClip(() => {
      void this.reloadFromServer();
    });
  }
}
