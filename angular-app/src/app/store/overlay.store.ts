import { Injectable, signal } from '@angular/core';
import type { Clip } from '../models/clip.model';

export type OverlayTab = 'history' | 'snippets' | 'staging' | 'settings';

@Injectable({ providedIn: 'root' })
export class OverlayStore {
  readonly activeTab = signal<OverlayTab>('history');
  readonly actionsOpen = signal(false);
  /** When set, Actions panel uses this clip instead of the list selection. */
  readonly actionTargetClip = signal<Clip | null>(null);
  readonly snippetEditorOpen = signal(false);
  readonly variablePromptOpen = signal(false);

  setTab(tab: OverlayTab) {
    this.activeTab.set(tab);
  }

  cycleTabByIndex(i: number) {
    const order: OverlayTab[] = ['history', 'snippets', 'staging', 'settings'];
    const t = order[(i - 1 + order.length) % order.length];
    if (t) this.activeTab.set(t);
  }

  openActionsFor(clip: Clip) {
    this.actionTargetClip.set(clip);
    this.actionsOpen.set(true);
  }

  closeActions() {
    this.actionsOpen.set(false);
    this.actionTargetClip.set(null);
  }
}
