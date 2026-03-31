import { computed, Injectable, signal } from '@angular/core';
import type { Clip, FilterTab } from '../models/clip.model';

@Injectable({ providedIn: 'root' })
export class ClipsStore {
  /** Rows returned from IPC (searchClips / getClips). */
  readonly clips = signal<Clip[]>([]);
  readonly searchQuery = signal('');
  readonly activeFilter = signal<FilterTab>('all');
  readonly selectedIndex = signal(0);
  readonly copyFlashId = signal<number | null>(null);
  /** When non-empty, search requires clips to have ALL selected tags. */
  readonly selectedTags = signal<string[]>([]);
  readonly dateFrom = signal<number | null>(null);
  readonly dateTo = signal<number | null>(null);
  readonly sourceAppFilter = signal('');

  readonly visibleClips = computed(() => this.clips());

  setClips(rows: Clip[]) {
    this.clips.set(rows);
    this.clampSelection();
  }

  setSearchQuery(q: string) {
    this.searchQuery.set(q);
  }

  setActiveFilter(tab: FilterTab) {
    this.activeFilter.set(tab);
  }

  toggleTagFilter(name: string) {
    const n = name.trim();
    if (!n) return;
    this.selectedTags.update((tags) => {
      const i = tags.findIndex((t) => t.toLowerCase() === n.toLowerCase());
      if (i >= 0) {
        return tags.filter((_, j) => j !== i);
      }
      return [...tags, n];
    });
  }

  clearTagFilters() {
    this.selectedTags.set([]);
  }

  cycleFilter() {
    const order: FilterTab[] = [
      'all',
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
    const i = order.indexOf(this.activeFilter());
    const next = order[(i + 1) % order.length]!;
    this.setActiveFilter(next);
  }

  moveSelection(delta: number) {
    const rows = this.visibleClips();
    if (rows.length === 0) return;
    const next = Math.max(0, Math.min(rows.length - 1, this.selectedIndex() + delta));
    this.selectedIndex.set(next);
  }

  selectedClip(): Clip | null {
    const rows = this.visibleClips();
    const i = this.selectedIndex();
    return rows[i] ?? null;
  }

  clampSelection() {
    const rows = this.visibleClips();
    if (rows.length === 0) {
      this.selectedIndex.set(0);
      return;
    }
    if (this.selectedIndex() > rows.length - 1) {
      this.selectedIndex.set(rows.length - 1);
    }
  }

  flashCopy(id: number) {
    this.copyFlashId.set(id);
    window.setTimeout(() => {
      if (this.copyFlashId() === id) {
        this.copyFlashId.set(null);
      }
    }, 450);
  }
}
