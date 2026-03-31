import { Injectable, signal } from '@angular/core';

export type MainTab =
  | 'history'
  | 'snippets'
  | 'actions'
  | 'ai-actions'
  | 'staging'
  | 'automation'
  | 'collections'
  | 'timeline'
  | 'vault'
  | 'sync'
  | 'integrations'
  | 'insights'
  | 'enterprise'
  | 'settings';

@Injectable({ providedIn: 'root' })
export class MainStore {
  readonly activeTab = signal<MainTab>('history');

  setTab(tab: MainTab): void {
    this.activeTab.set(tab);
  }
}
