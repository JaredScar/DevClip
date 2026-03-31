import { animate, style, transition, trigger } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { ActionsPanelComponent } from '../actions-panel/actions-panel.component';
import { ClipListComponent } from '../clip-list/clip-list.component';
import { FilterTabsComponent } from '../filter-tabs/filter-tabs.component';
import { SearchBarComponent } from '../search-bar/search-bar.component';
import { SettingsPanelComponent } from '../settings-panel/settings-panel.component';
import { SnippetsPanelComponent } from '../snippets-panel/snippets-panel.component';
import { StagingPanelComponent } from '../staging-panel/staging-panel.component';
import { ClipService } from '../../services/clip.service';
import { HotkeyService } from '../../services/hotkey.service';
import { ThemeService } from '../../services/theme.service';
import { StagingService } from '../../services/staging.service';
import { formatAcceleratorLabel } from '../../utils/accelerator-label';
import { ClipsStore } from '../../store/clips.store';
import { OverlayStore, type OverlayTab } from '../../store/overlay.store';

@Component({
  selector: 'app-overlay',
  standalone: true,
  imports: [
    CommonModule,
    SearchBarComponent,
    FilterTabsComponent,
    ClipListComponent,
    ActionsPanelComponent,
    SnippetsPanelComponent,
    StagingPanelComponent,
    SettingsPanelComponent,
  ],
  animations: [
    trigger('backdrop', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('150ms ease-out', style({ opacity: 1 })),
      ]),
      transition(':leave', [animate('100ms ease-in', style({ opacity: 0 }))]),
    ]),
    trigger('card', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.95)' }),
        animate('150ms ease-out', style({ opacity: 1, transform: 'scale(1)' })),
      ]),
      transition(':leave', [
        animate('100ms ease-in', style({ opacity: 0, transform: 'scale(0.95)' })),
      ]),
    ]),
  ],
  host: {
    class: 'fixed inset-0 flex items-center justify-center outline-none',
    tabindex: '0',
    '(keydown)': 'onKey($event)',
  },
  template: `
    <div
      @backdrop
      class="absolute inset-0 bg-black/55 backdrop-blur-md"
      (click)="onBackdrop($event)"
    ></div>
    <div
      @card
      class="relative z-10 w-[min(760px,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-[#0d0d0d]/95 p-4 shadow-overlay backdrop-blur-xl lite:border-zinc-200 lite:bg-white/95 lite:shadow-xl"
      (click)="$event.stopPropagation()"
    >
      <header class="mb-3 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <span
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-devclip-accent/15 text-devclip-accent"
          >
            <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 16H5V5h2v3h10V5h2v14z"
              />
            </svg>
          </span>
          <span class="text-lg font-bold tracking-tight text-white lite:text-zinc-900">DevClip</span>
        </div>
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="text-xs font-medium text-devclip-accent hover:underline"
            (click)="openMainApp()"
          >
            Open full app
          </button>
          <span class="max-w-[14rem] truncate text-right text-xs text-zinc-500 lite:text-zinc-600">{{
            shortcutHint()
          }}</span>
        </div>
      </header>

      <nav class="mb-3 flex flex-wrap gap-1 border-b border-white/10 pb-2 lite:border-zinc-200">
        @for (t of tabDefs; track t.id) {
          <button
            type="button"
            class="rounded-md px-3 py-1.5 text-xs font-medium transition"
            [ngClass]="
              overlay.activeTab() === t.id
                ? 'bg-white/10 text-white lite:bg-zinc-200 lite:text-zinc-900'
                : 'text-zinc-500 lite:text-zinc-600'
            "
            (click)="overlay.setTab(t.id)"
          >
            {{ t.label }}
          </button>
        }
      </nav>

      @if (overlay.activeTab() === 'history') {
        <app-search-bar #searchBar />
        <app-filter-tabs />
        <app-actions-panel
          [open]="overlay.actionsOpen()"
          [clip]="actionClip()"
          (close)="overlay.closeActions()"
          (applied)="onActionApplied($event)"
        />
        <app-clip-list />
      } @else if (overlay.activeTab() === 'snippets') {
        <app-snippets-panel />
      } @else if (overlay.activeTab() === 'staging') {
        <app-staging-panel />
      } @else {
        <app-settings-panel />
      }
    </div>
  `,
})
export class OverlayComponent implements OnInit, OnDestroy {
  @ViewChild('searchBar') searchBar?: SearchBarComponent;

  readonly store = inject(ClipsStore);
  readonly overlay = inject(OverlayStore);
  private readonly clips = inject(ClipService);
  private readonly hotkeys = inject(HotkeyService);
  private readonly staging = inject(StagingService);
  private readonly themeSvc = inject(ThemeService);

  readonly shortcutHint = signal('Default: Ctrl/Cmd + Shift + V');

  readonly tabDefs: { id: OverlayTab; label: string }[] = [
    { id: 'history', label: 'History' },
    { id: 'snippets', label: 'Snippets' },
    { id: 'staging', label: 'Staging' },
    { id: 'settings', label: 'Settings' },
  ];

  readonly actionClip = computed(() => {
    const t = this.overlay.actionTargetClip();
    if (t) return t;
    return this.store.selectedClip();
  });

  private unsubNew?: () => void;

  async ngOnInit() {
    await this.themeSvc.hydrateFromSettings();
    const s = await window.devclip.settingsGet();
    const custom = (s['overlayShortcut'] ?? '').trim();
    this.shortcutHint.set(
      custom ? formatAcceleratorLabel(custom) : 'Default: Ctrl/Cmd + Shift + V'
    );
    await this.clips.bootstrap();
    this.unsubNew = this.clips.subscribeNewClips();
    queueMicrotask(() => this.searchBar?.focusInput());
  }

  ngOnDestroy() {
    this.unsubNew?.();
  }

  openMainApp(): void {
    void window.devclip.showMain();
    void window.devclip.hideOverlay();
  }

  onBackdrop(ev: MouseEvent) {
    ev.preventDefault();
    void window.devclip.hideOverlay();
  }

  async onActionApplied(text: string) {
    await window.devclip.copyToClipboard(text);
    this.overlay.closeActions();
  }

  onKey(ev: KeyboardEvent) {
    const tab = this.overlay.activeTab();

    if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && ev.key.toLowerCase() === 'p') {
      ev.preventDefault();
      this.overlay.setTab('staging');
      return;
    }

    if (ev.key >= '1' && ev.key <= '4' && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      const map: Record<string, OverlayTab> = {
        '1': 'history',
        '2': 'snippets',
        '3': 'staging',
        '4': 'settings',
      };
      const next = map[ev.key];
      if (next) {
        const t = ev.target as HTMLElement;
        if (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA') {
          ev.preventDefault();
          this.overlay.setTab(next);
          return;
        }
      }
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
        if (this.overlay.actionsOpen()) {
          this.overlay.closeActions();
        } else {
          void window.devclip.hideOverlay();
        }
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
          const c = this.store.selectedClip();
          if (c) this.overlay.openActionsFor(c);
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
