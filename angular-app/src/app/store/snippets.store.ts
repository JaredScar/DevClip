import { Injectable, signal } from '@angular/core';
import type { Snippet } from '../models/snippet.model';

@Injectable({ providedIn: 'root' })
export class SnippetsStore {
  readonly snippets = signal<Snippet[]>([]);
  readonly selectedIndex = signal(0);
  readonly editingId = signal<number | null>(null);
  readonly searchQuery = signal('');

  setSnippets(rows: Snippet[]) {
    this.snippets.set(rows);
    this.clamp();
  }

  moveSelection(delta: number) {
    const rows = this.snippets();
    if (rows.length === 0) return;
    const next = Math.max(0, Math.min(rows.length - 1, this.selectedIndex() + delta));
    this.selectedIndex.set(next);
  }

  selectedSnippet(): Snippet | null {
    const rows = this.snippets();
    return rows[this.selectedIndex()] ?? null;
  }

  clamp() {
    const rows = this.snippets();
    if (rows.length === 0) {
      this.selectedIndex.set(0);
      return;
    }
    if (this.selectedIndex() > rows.length - 1) {
      this.selectedIndex.set(rows.length - 1);
    }
  }
}
