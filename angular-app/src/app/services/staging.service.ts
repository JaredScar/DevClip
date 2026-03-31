import { Injectable, inject } from '@angular/core';
import type { Clip, ClipType } from '../models/clip.model';
import { StagingStore } from '../store/staging.store';

export interface StagingPresetItem {
  content: string;
  type: ClipType;
  source: string | null;
}

export interface StagingPreset {
  name: string;
  items: StagingPresetItem[];
}

@Injectable({ providedIn: 'root' })
export class StagingService {
  private readonly store = inject(StagingStore);

  add(clip: Clip) {
    this.store.add(clip);
  }

  remove(id: number) {
    this.store.remove(id);
  }

  clear() {
    this.store.clear();
  }

  moveUp(index: number) {
    if (index <= 0) return;
    this.store.move(index, index - 1);
  }

  moveDown(index: number) {
    const n = this.store.staged().length;
    if (index >= n - 1) return;
    this.store.move(index, index + 1);
  }

  async pasteAll(): Promise<string> {
    const joined = this.store
      .staged()
      .map((c) => c.content)
      .join('\n---\n');
    await window.devclip.copyToClipboard(joined);
    return joined;
  }

  async pasteNext(): Promise<string | null> {
    const first = this.store.shiftFirst();
    if (!first) return null;
    if (first.type === 'image' && first.content.startsWith('data:image/')) {
      await window.devclip.copyImageToClipboard(first.content);
    } else {
      await window.devclip.copyToClipboard(first.content);
    }
    return first.content;
  }

  private async loadPresetsRaw(): Promise<StagingPreset[]> {
    const s = await window.devclip.settingsGet();
    try {
      const v = JSON.parse(s['stagingPresetsJson'] ?? '[]') as unknown;
      if (!Array.isArray(v)) return [];
      return v
        .filter((x): x is StagingPreset => {
          if (!x || typeof x !== 'object') return false;
          const o = x as Record<string, unknown>;
          return typeof o['name'] === 'string' && Array.isArray(o['items']);
        })
        .map((p) => ({
          name: String((p as StagingPreset).name),
          items: ((p as StagingPreset).items ?? []).filter(
            (it) => it && typeof it.content === 'string' && typeof it.type === 'string'
          ) as StagingPresetItem[],
        }));
    } catch {
      return [];
    }
  }

  async listPresets(): Promise<StagingPreset[]> {
    return this.loadPresetsRaw();
  }

  private async savePresets(list: StagingPreset[]): Promise<void> {
    await window.devclip.settingsSet('stagingPresetsJson', JSON.stringify(list));
  }

  async saveCurrentAsPreset(name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    const items: StagingPresetItem[] = this.store.staged().map((c) => ({
      content: c.content,
      type: c.type,
      source: c.source,
    }));
    const list = await this.loadPresetsRaw();
    const next = list.filter((p) => p.name.toLowerCase() !== trimmed.toLowerCase());
    next.push({ name: trimmed, items });
    await this.savePresets(next);
  }

  async loadPreset(name: string): Promise<void> {
    const list = await this.loadPresetsRaw();
    const p = list.find((x) => x.name === name);
    if (!p) return;
    let id = -Date.now();
    const valid: ClipType[] = [
      'sql',
      'json',
      'url',
      'code',
      'text',
      'email',
      'stack-trace',
      'secret',
      'image',
      'file-path',
    ];
    const clips: Clip[] = p.items.map((it) => ({
      id: id--,
      content: it.content,
      type: valid.includes(it.type) ? it.type : 'text',
      source: it.source,
      created_at: 0,
      is_pinned: 0,
      tags: [],
      use_count: 0,
      metadata: {},
    }));
    this.store.clear();
    for (const c of clips) {
      this.store.add(c);
    }
  }

  async deletePreset(name: string): Promise<void> {
    const list = await this.loadPresetsRaw();
    const next = list.filter((p) => p.name.toLowerCase() !== name.trim().toLowerCase());
    await this.savePresets(next);
  }
}
