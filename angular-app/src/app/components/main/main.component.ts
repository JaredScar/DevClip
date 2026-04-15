import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { ActionsTabComponent } from '../actions-tab/actions-tab.component';
import { AiActionsPanelComponent } from '../ai-actions-panel/ai-actions-panel.component';
import { AutomationPanelComponent } from '../automation-panel/automation-panel.component';
import { ClipListComponent } from '../clip-list/clip-list.component';
import { CollectionsPanelComponent } from '../collections-panel/collections-panel.component';
import { FilterTabsComponent } from '../filter-tabs/filter-tabs.component';
import { InsightsPanelComponent } from '../insights-panel/insights-panel.component';
import { EnterprisePanelComponent } from '../enterprise-panel/enterprise-panel.component';
import { IntegrationsPanelComponent } from '../integrations-panel/integrations-panel.component';
import { SearchBarComponent } from '../search-bar/search-bar.component';
import { SettingsPanelComponent } from '../settings-panel/settings-panel.component';
import { SnippetsPanelComponent } from '../snippets-panel/snippets-panel.component';
import { StagingPanelComponent } from '../staging-panel/staging-panel.component';
import { SyncPanelComponent } from '../sync-panel/sync-panel.component';
import { TimelinePanelComponent } from '../timeline-panel/timeline-panel.component';
import { VaultPanelComponent } from '../vault-panel/vault-panel.component';
import { ClipService } from '../../services/clip.service';
import { FeatureFlagService } from '../../services/feature-flag.service';
import { HotkeyService } from '../../services/hotkey.service';
import { ThemeService } from '../../services/theme.service';
import { StagingService } from '../../services/staging.service';
import { ClipsStore } from '../../store/clips.store';
import { MainStore, type MainTab } from '../../store/main.store';

interface NavItem {
  id: MainTab;
  label: string;
  pro?: boolean;
  enterpriseOnly?: boolean;
}

@Component({
  selector: 'app-main',
  standalone: true,
  imports: [
    CommonModule,
    SearchBarComponent,
    FilterTabsComponent,
    ClipListComponent,
    ActionsTabComponent,
    AiActionsPanelComponent,
    SnippetsPanelComponent,
    StagingPanelComponent,
    SettingsPanelComponent,
    AutomationPanelComponent,
    CollectionsPanelComponent,
    TimelinePanelComponent,
    VaultPanelComponent,
    SyncPanelComponent,
    IntegrationsPanelComponent,
    InsightsPanelComponent,
    EnterprisePanelComponent,
  ],
  host: {
    class:
      'flex h-full min-h-0 flex-col bg-[#0d0d0d] outline-none lite:bg-zinc-100 lite:text-zinc-900',
    tabindex: '0',
    '(keydown)': 'onKey($event)',
  },
  template: `
    <header
      class="flex h-9 shrink-0 items-center border-b border-white/10 bg-[#0a0a0a] px-3 lite:border-zinc-200 lite:bg-zinc-200"
    >
      <img
        src="devclip_icon_transparent.svg"
        alt="DevClip"
        class="h-6 w-6 shrink-0 object-contain"
        width="24"
        height="24"
      />
      @if (syncHeader().text) {
        <button
          type="button"
          class="ml-auto flex max-w-[140px] items-center gap-1.5 truncate rounded px-2 py-0.5 text-[10px] font-medium text-zinc-400 hover:bg-white/10 hover:text-white lite:text-zinc-600 lite:hover:bg-zinc-300 lite:hover:text-zinc-900"
          title="Open Sync"
          (click)="main.setTab('sync')"
        >
          <span
            class="h-1.5 w-1.5 shrink-0 rounded-full"
            [ngClass]="{
              'bg-emerald-500': syncHeader().tone === 'ok',
              'bg-amber-500': syncHeader().tone === 'warn',
              'bg-zinc-500': syncHeader().tone === 'idle'
            }"
          ></span>
          {{ syncHeader().text }}
        </button>
      }
    </header>

    <div class="flex min-h-0 flex-1 flex-row">
      <aside
        class="flex w-56 shrink-0 flex-col border-r border-white/10 bg-[#0a0a0a] lite:border-zinc-200 lite:bg-zinc-200"
      >
        <div class="flex items-center gap-2 border-b border-white/5 px-3 py-3">
          <span
            class="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-devclip-accent/10"
          >
            <img
              src="devclip_icon_transparent.svg"
              alt=""
              class="h-full w-full object-contain"
              width="32"
              height="32"
            />
          </span>
          <span class="text-sm font-semibold text-white lite:text-zinc-900">DevClip</span>
        </div>

        <nav class="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
          @for (item of navItems; track item.id) {
            @if (!item.enterpriseOnly || featureFlags.isEnterpriseUnlocked()) {
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition"
              [ngClass]="
                main.activeTab() === item.id
                  ? 'bg-white text-black lite:bg-zinc-800 lite:text-white'
                  : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200 lite:text-zinc-600 lite:hover:bg-zinc-300 lite:hover:text-zinc-900'
              "
              (click)="main.setTab(item.id)"
            >
              <span class="nav-icon flex h-5 w-5 shrink-0 items-center justify-center" [attr.data-tab]="item.id"></span>
              <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
              @if (showProBadge(item)) {
                <span
                  class="shrink-0 rounded bg-zinc-700 px-1 py-0.5 text-[9px] font-bold uppercase leading-none text-zinc-300"
                >
                  PRO
                </span>
              }
            </button>
            }
          }
        </nav>
      </aside>

      <main class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-4 lite:bg-zinc-100">
        @switch (main.activeTab()) {
          @case ('history') {
            <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
              <app-search-bar #searchBar />
              <app-filter-tabs />
              <app-clip-list />
            </div>
          }
          @case ('snippets') {
            <app-snippets-panel />
          }
          @case ('actions') {
            <app-actions-tab />
          }
          @case ('ai-actions') {
            <app-ai-actions-panel />
          }
          @case ('staging') {
            <app-staging-panel />
          }
          @case ('automation') {
            <app-automation-panel />
          }
          @case ('collections') {
            <app-collections-panel />
          }
          @case ('timeline') {
            <app-timeline-panel />
          }
          @case ('vault') {
            <app-vault-panel />
          }
          @case ('sync') {
            <app-sync-panel />
          }
          @case ('integrations') {
            <app-integrations-panel />
          }
          @case ('insights') {
            <app-insights-panel />
          }
          @case ('enterprise') {
            <app-enterprise-panel />
          }
          @case ('settings') {
            <app-settings-panel />
          }
        }
      </main>
    </div>
  `,
  styles: [
    `
      .nav-icon[data-tab='history']::before {
        content: '';
        display: block;
        width: 16px;
        height: 16px;
        background: currentColor;
        mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6a7 7 0 0 1 7-7V3z'/%3E%3C/svg%3E")
          center/contain no-repeat;
      }
      .nav-icon[data-tab='snippets']::before {
        content: '';
        display: block;
        width: 16px;
        height: 16px;
        background: currentColor;
        mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z'/%3E%3C/svg%3E")
          center/contain no-repeat;
      }
      .nav-icon[data-tab='actions']::before {
        content: '';
        display: block;
        width: 16px;
        height: 16px;
        background: currentColor;
        mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M7 2v11h3v9l7-12h-4l4-8z'/%3E%3C/svg%3E")
          center/contain no-repeat;
      }
      .nav-icon[data-tab='ai-actions']::before {
        content: '\u2728';
        font-size: 14px;
        line-height: 16px;
      }
      .nav-icon[data-tab='staging']::before {
        content: '';
        display: block;
        width: 16px;
        height: 16px;
        background: currentColor;
        mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M12 16.5l9-5-9-5-9 5 9 5zm0 2.5l-9-5v5l9 5 9-5v-5l-9 5z'/%3E%3C/svg%3E")
          center/contain no-repeat;
      }
      .nav-icon[data-tab='automation']::before {
        content: '';
        display: block;
        width: 16px;
        height: 16px;
        background: currentColor;
        mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M7 2v11h3v9l7-12h-4l4-8z'/%3E%3C/svg%3E")
          center/contain no-repeat;
      }
      .nav-icon[data-tab='collections']::before {
        content: '';
        display: block;
        width: 16px;
        height: 16px;
        background: currentColor;
        mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z'/%3E%3C/svg%3E")
          center/contain no-repeat;
      }
      .nav-icon[data-tab='timeline']::before {
        content: '';
        display: block;
        width: 16px;
        height: 16px;
        background: currentColor;
        mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z'/%3E%3C/svg%3E")
          center/contain no-repeat;
      }
      .nav-icon[data-tab='vault']::before {
        content: '';
        display: block;
        width: 16px;
        height: 16px;
        background: currentColor;
        mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z'/%3E%3C/svg%3E")
          center/contain no-repeat;
      }
      .nav-icon[data-tab='sync']::before {
        content: '';
        display: block;
        width: 16px;
        height: 16px;
        background: currentColor;
        mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z'/%3E%3C/svg%3E")
          center/contain no-repeat;
      }
      .nav-icon[data-tab='integrations']::before {
        content: '\u{1F50C}';
        font-size: 13px;
        line-height: 16px;
      }
      .nav-icon[data-tab='insights']::before {
        content: '';
        display: block;
        width: 16px;
        height: 16px;
        background: currentColor;
        mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z'/%3E%3C/svg%3E")
          center/contain no-repeat;
      }
      .nav-icon[data-tab='settings']::before {
        content: '';
        display: block;
        width: 16px;
        height: 16px;
        background: currentColor;
        mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.52-.4-1.08-.73-1.69-.98l-.36-2.54a.484.484 0 0 0-.48-.42h-3.84c-.24 0-.43.17-.47.42l-.36 2.54c-.61.25-1.17.59-1.69.98l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.52.4 1.08.73 1.69.98l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.42l.36-2.54c.61-.25 1.17-.59 1.69-.98l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z'/%3E%3C/svg%3E")
          center/contain no-repeat;
      }
      .nav-icon[data-tab='enterprise']::before {
        content: '';
        display: block;
        width: 16px;
        height: 16px;
        background: currentColor;
        mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z'/%3E%3C/svg%3E")
          center/contain no-repeat;
      }
    `,
  ],
})
export class MainComponent implements OnInit, OnDestroy {
  @ViewChild('searchBar') searchBar?: SearchBarComponent;

  readonly store = inject(ClipsStore);
  readonly main = inject(MainStore);
  private readonly clips = inject(ClipService);
  private readonly hotkeys = inject(HotkeyService);
  private readonly staging = inject(StagingService);
  private readonly themeSvc = inject(ThemeService);
  readonly featureFlags = inject(FeatureFlagService);

  readonly syncHeader = signal<{ text: string; tone: 'ok' | 'warn' | 'idle' }>({
    text: '',
    tone: 'idle',
  });
  private syncPoll?: ReturnType<typeof setInterval>;

  readonly navItems: NavItem[] = [
    { id: 'history', label: 'History' },
    { id: 'snippets', label: 'Snippets' },
    { id: 'actions', label: 'Actions' },
    { id: 'ai-actions', label: 'AI Actions', pro: true },
    { id: 'staging', label: 'Staging' },
    { id: 'automation', label: 'Automation', pro: true },
    { id: 'collections', label: 'Collections', pro: true },
    { id: 'timeline', label: 'Timeline', pro: true },
    { id: 'vault', label: 'Vault', pro: true },
    { id: 'sync', label: 'Sync', pro: true },
    { id: 'integrations', label: 'Integrations', pro: true },
    { id: 'insights', label: 'Insights', pro: true },
    { id: 'enterprise', label: 'Enterprise', enterpriseOnly: true },
    { id: 'settings', label: 'Settings' },
  ];

  private unsubNew?: () => void;

  showProBadge(item: NavItem): boolean {
    return !!item.pro && !this.featureFlags.isProUnlocked();
  }

  async ngOnInit() {
    await this.themeSvc.hydrateFromSettings();
    await this.featureFlags.refresh();
    await this.clips.bootstrap();
    this.unsubNew = this.clips.subscribeNewClips();
    queueMicrotask(() => this.searchBar?.focusInput());
    this.refreshSyncHeader();
    this.syncPoll = setInterval(() => this.refreshSyncHeader(), 20_000);
  }


  ngOnDestroy() {
    this.unsubNew?.();
    if (this.syncPoll) {
      clearInterval(this.syncPoll);
    }
  }

  private refreshSyncHeader(): void {
    void window.devclip
      .syncGetStatus()
      .then((s) => {
        if (!s.tierOk) {
          this.syncHeader.set({ text: '', tone: 'idle' });
          return;
        }
        if (!s.enabled) {
          this.syncHeader.set({ text: 'Sync off', tone: 'idle' });
          return;
        }
        if (s.pendingOutbox > 0) {
          this.syncHeader.set({ text: `Outbox ${s.pendingOutbox}`, tone: 'warn' });
          return;
        }
        if (s.lastError) {
          this.syncHeader.set({ text: 'Sync error', tone: 'warn' });
          return;
        }
        if (s.lastSyncAt) {
          this.syncHeader.set({ text: 'Synced', tone: 'ok' });
          return;
        }
        this.syncHeader.set({ text: 'Sync on', tone: 'idle' });
      })
      .catch(() => this.syncHeader.set({ text: '', tone: 'idle' }));
  }

  onKey(ev: KeyboardEvent) {
    const tab = this.main.activeTab();

    if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && ev.key.toLowerCase() === 'p') {
      ev.preventDefault();
      this.main.setTab('staging');
      return;
    }

    this.hotkeys.handleOverlayKeydown(ev, {
      focusSearch: () => this.searchBar?.focusInput(),
      onArrow: (d) => {
        if (tab === 'history') this.store.moveSelection(d);
      },
      onEnter: () => {
        if (tab === 'history') this.copySelected();
      },
      onEscape: () => {
        /* main window: no overlay to close */
      },
      onTabFilter: () => {
        if (tab === 'history') {
          this.store.cycleFilter();
          void this.clips.refreshSearch(this.store.searchQuery());
        }
      },
      onStage: () => {
        if (tab === 'history') {
          const c = this.store.selectedClip();
          if (c) this.staging.add(c);
        }
      },
      onActions: () => {
        if (tab === 'history') {
          this.main.setTab('actions');
        }
      },
    });
  }

  private copySelected() {
    const c = this.store.selectedClip();
    if (c) {
      void this.clips.copyContent(c.content, c.id, c.type);
    }
  }
}
