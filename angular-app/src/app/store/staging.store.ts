import { Injectable, signal } from '@angular/core';
import type { Clip } from '../models/clip.model';

@Injectable({ providedIn: 'root' })
export class StagingStore {
  readonly staged = signal<Clip[]>([]);

  add(clip: Clip) {
    if (this.staged().some((c) => c.id === clip.id)) return;
    this.staged.update((arr) => [...arr, clip]);
  }

  remove(id: number) {
    this.staged.update((arr) => arr.filter((c) => c.id !== id));
  }

  clear() {
    this.staged.set([]);
  }

  move(from: number, to: number) {
    this.staged.update((arr) => {
      const next = [...arr];
      const [item] = next.splice(from, 1);
      if (item === undefined) return arr;
      next.splice(to, 0, item);
      return next;
    });
  }

  peekFirst(): Clip | null {
    const a = this.staged();
    return a[0] ?? null;
  }

  shiftFirst(): Clip | null {
    let first: Clip | null = null;
    this.staged.update((arr) => {
      if (arr.length === 0) return arr;
      first = arr[0]!;
      return arr.slice(1);
    });
    return first;
  }
}
