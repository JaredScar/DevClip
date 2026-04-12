import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClipService } from '../../services/clip.service';
import { FeatureFlagService } from '../../services/feature-flag.service';

const CLIP_TYPES = [
  'text',
  'code',
  'json',
  'url',
  'email',
  'sql',
  'stack-trace',
  'secret',
  'image',
  'file-path',
] as const;

interface SyncCategories {
  clips: boolean;
  snippets: boolean;
  collections: boolean;
  automation: boolean;
  settings: boolean;
  vault: boolean;
  clipTypesAll: boolean;
  clipTypes: string[];
}

@Component({
  selector: 'app-sync-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex min-h-0 flex-1 flex-col overflow-y-auto text-white lite:text-zinc-900">
      <div class="mb-6 flex items-center gap-2">
        <h2 class="text-sm font-semibold">Cloud Sync</h2>
        <span
          class="rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-300 lite:bg-zinc-300 lite:text-zinc-700"
        >
          PRO
        </span>
      </div>

      <p class="mb-4 text-xs text-zinc-500 lite:text-zinc-600">
        End-to-end encrypted bundles (AES-256-GCM, PBKDF2). Your sync passphrase derives the key locally;
        the remote server only sees ciphertext. Use any HTTPS URL that supports GET + PUT of the same blob
        (e.g. presigned object storage), or encrypted file backup below.
      </p>

      @if (!flags.isProUnlocked()) {
        <div class="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200 lite:border-amber-400/40 lite:bg-amber-100 lite:text-amber-900">
          Add a Pro or Enterprise key in Settings to enable cloud push/pull. File backup/import still works for
          offline merge.
        </div>
      }

      <div class="mb-4 rounded-xl border border-white/10 bg-[#1a1a1a] p-4 lite:border-zinc-200 lite:bg-white">
        <div class="mb-3 flex items-center justify-between gap-3">
          <div>
            <div class="text-sm font-medium">Enable cloud sync</div>
            <div class="text-xs text-zinc-500 lite:text-zinc-600">Push / pull merged state to remote URL</div>
          </div>
          <label class="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              class="peer sr-only"
              [disabled]="!flags.isProUnlocked()"
              [ngModel]="syncEnabled()"
              (ngModelChange)="onToggleEnabled($event)"
            />
            <div
              class="peer h-6 w-11 rounded-full bg-zinc-600 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:bg-devclip-accent peer-checked:after:translate-x-5 peer-disabled:opacity-40"
            ></div>
          </label>
        </div>
        <label class="mb-2 block text-[10px] font-semibold uppercase text-zinc-500 lite:text-zinc-600">
          Sync URL (GET + PUT)
        </label>
        <input
          type="url"
          class="mb-3 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white lite:border-zinc-300 lite:bg-zinc-50 lite:text-zinc-900"
          placeholder="https://…"
          [ngModel]="remoteUrl()"
          (ngModelChange)="remoteUrl.set($event)"
          (blur)="persistRemoteUrl()"
        />
        <label class="mb-2 block text-[10px] font-semibold uppercase text-zinc-500 lite:text-zinc-600">
          Device label (optional)
        </label>
        <input
          type="text"
          class="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white lite:border-zinc-300 lite:bg-zinc-50 lite:text-zinc-900"
          placeholder="Work laptop"
          [disabled]="!flags.isProUnlocked()"
          [ngModel]="deviceLabel()"
          (ngModelChange)="deviceLabel.set($event)"
          (blur)="persistDeviceLabel()"
        />
      </div>

      <div class="mb-4 rounded-xl border border-white/10 bg-[#1a1a1a] p-4 lite:border-zinc-200 lite:bg-white">
        <h3 class="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 lite:text-zinc-600">
          Selective sync
        </h3>
        <div class="flex flex-col gap-2 text-xs">
          @for (row of categoryRows; track row.key) {
            <label class="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                [checked]="categories()[row.key]"
                (change)="toggleCategory(row.key, $any($event.target).checked)"
              />
              {{ row.label }}
            </label>
          }
        </div>
        @if (categories().clips) {
          <div class="mt-3 border-t border-white/10 pt-3 lite:border-zinc-200">
            <label class="mb-2 flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                [checked]="categories().clipTypesAll"
                (change)="toggleClipTypesAll($any($event.target).checked)"
              />
              All clip types
            </label>
            @if (!categories().clipTypesAll) {
              <div class="flex flex-wrap gap-2">
                @for (t of clipTypes; track t) {
                  <label class="flex cursor-pointer items-center gap-1 text-[11px] text-zinc-400 lite:text-zinc-600">
                    <input
                      type="checkbox"
                      [checked]="categories().clipTypes.includes(t)"
                      (change)="toggleClipType(t, $any($event.target).checked)"
                    />
                    {{ t }}
                  </label>
                }
              </div>
            }
          </div>
        }
      </div>

      <div class="mb-4 rounded-xl border border-white/10 bg-[#1a1a1a] p-4 lite:border-zinc-200 lite:bg-white">
        <h3 class="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 lite:text-zinc-600">
          Passphrase
        </h3>
        <p class="mb-2 text-xs text-zinc-500 lite:text-zinc-600">
          Same passphrase on every device. Not your DevClip account password unless you choose it to be — never
          sent to our servers.
        </p>
        <input
          type="password"
          autocomplete="off"
          class="mb-3 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white lite:border-zinc-300 lite:bg-zinc-50 lite:text-zinc-900"
          placeholder="Min 8 characters"
          [(ngModel)]="passphrase"
        />
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-lg bg-devclip-accent px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-40"
            [disabled]="busy() || !flags.isProUnlocked()"
            (click)="onPush()"
          >
            Push merge
          </button>
          <button
            type="button"
            class="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-white lite:border-zinc-300 lite:bg-zinc-100 lite:text-zinc-900"
            [disabled]="busy() || !flags.isProUnlocked()"
            (click)="onPull()"
          >
            Pull merge
          </button>
          <button
            type="button"
            class="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-white lite:border-zinc-300 lite:bg-zinc-100 lite:text-zinc-900"
            [disabled]="busy()"
            (click)="onExportFile()"
          >
            Export .dcs
          </button>
          <button
            type="button"
            class="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-white lite:border-zinc-300 lite:bg-zinc-100 lite:text-zinc-900"
            [disabled]="busy()"
            (click)="onImportFile()"
          >
            Import .dcs
          </button>
          <button
            type="button"
            class="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-white lite:border-zinc-300 lite:bg-zinc-100 lite:text-zinc-900"
            [disabled]="busy() || !flags.isProUnlocked()"
            (click)="onRetryOutbox()"
          >
            Retry outbox
          </button>
        </div>
      </div>

      <div class="mb-4 rounded-xl border border-white/10 bg-[#1a1a1a] p-4 lite:border-zinc-200 lite:bg-white">
        <div class="flex flex-wrap items-center gap-3 text-xs">
          <span
            class="inline-flex items-center gap-1.5"
            [class.text-emerald-400]="status()?.online"
            [class.text-zinc-500]="!status()?.online"
          >
            <span
              class="h-2 w-2 rounded-full"
              [class.bg-emerald-500]="status()?.online"
              [class.bg-zinc-600]="!status()?.online"
            ></span>
            {{ status()?.online ? 'Online' : 'Offline' }}
          </span>
          @if (status()?.lastSyncAt) {
            <span class="text-zinc-400 lite:text-zinc-600">Last: {{ status()!.lastSyncAt }}</span>
          }
          @if ((status()?.pendingOutbox ?? 0) > 0) {
            <span class="text-amber-400">Outbox: {{ status()!.pendingOutbox }}</span>
          }
          @if ((status()?.deviceCount ?? 0) > 5) {
            <span class="text-amber-400">Device slots &gt; 5 — oldest labels pruned on next push</span>
          }
        </div>
        @if (status()?.lastError) {
          <p class="mt-2 text-xs text-red-400 lite:text-red-700">{{ status()!.lastError }}</p>
        }
      </div>

      <p class="text-center text-[11px] text-zinc-600 lite:text-zinc-500">
        Conflicts resolve by last-write-wins using per-item timestamps (clips: sync_lm, snippets: updated_at, etc.).
      </p>
    </div>
  `,
})
export class SyncPanelComponent implements OnInit, OnDestroy {
  readonly flags = inject(FeatureFlagService);
  private readonly clips = inject(ClipService);

  readonly clipTypes = CLIP_TYPES;
  readonly categoryRows: { key: keyof SyncCategories; label: string }[] = [
    { key: 'clips', label: 'Clipboard history (clips)' },
    { key: 'snippets', label: 'Snippets' },
    { key: 'collections', label: 'Collections' },
    { key: 'automation', label: 'Automation rules' },
    { key: 'settings', label: 'Settings (safe subset)' },
    { key: 'vault', label: 'Vault entries (requires vault unlocked at sync time)' },
  ];

  readonly status = signal<Awaited<ReturnType<typeof window.devclip.syncGetStatus>> | null>(null);
  readonly busy = signal(false);
  readonly syncEnabled = signal(false);
  readonly remoteUrl = signal('');
  readonly deviceLabel = signal('');
  readonly categories = signal<SyncCategories>({
    clips: true,
    snippets: true,
    collections: true,
    automation: true,
    settings: true,
    vault: false,
    clipTypesAll: true,
    clipTypes: [],
  });

  passphrase = '';
  private poll?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    void this.refresh();
    this.poll = setInterval(() => void this.refresh(), 18_000);
  }

  ngOnDestroy(): void {
    if (this.poll) clearInterval(this.poll);
  }

  async refresh(): Promise<void> {
    try {
      const s = await window.devclip.syncGetStatus();
      this.status.set(s);
      this.syncEnabled.set(s.enabled);
      this.remoteUrl.set(s.remoteUrl);
      const st = await window.devclip.settingsGet();
      this.deviceLabel.set(st['syncDeviceLabel'] ?? '');
      try {
        const c = JSON.parse(s.categoriesJson || '{}') as Partial<SyncCategories>;
        this.categories.set({
          clips: c.clips !== false,
          snippets: c.snippets !== false,
          collections: c.collections !== false,
          automation: c.automation !== false,
          settings: c.settings !== false,
          vault: c.vault === true,
          clipTypesAll: c.clipTypesAll !== false,
          clipTypes: Array.isArray(c.clipTypes) ? c.clipTypes.map(String) : [],
        });
      } catch {
        /* keep defaults */
      }
    } catch {
      this.status.set(null);
    }
  }

  private persistCategories(): void {
    void window.devclip.syncSaveConfig({ syncCategoriesJson: JSON.stringify(this.categories()) });
  }

  onToggleEnabled(v: boolean): void {
    this.syncEnabled.set(v);
    void window.devclip.syncSaveConfig({ syncEnabled: v ? '1' : '0' });
  }

  persistRemoteUrl(): void {
    void window.devclip.syncSaveConfig({ syncRemoteUrl: this.remoteUrl().trim() });
  }

  persistDeviceLabel(): void {
    void window.devclip.syncSaveConfig({ syncDeviceLabel: this.deviceLabel().trim() });
  }

  toggleCategory(key: keyof SyncCategories, checked: boolean): void {
    if (key === 'clipTypesAll' || key === 'clipTypes') return;
    this.categories.update((c) => ({ ...c, [key]: checked }));
    this.persistCategories();
  }

  isVaultRow(key: keyof SyncCategories): boolean {
    return key === 'vault';
  }

  toggleClipTypesAll(v: boolean): void {
    this.categories.update((c) => ({ ...c, clipTypesAll: v }));
    this.persistCategories();
  }

  toggleClipType(t: string, on: boolean): void {
    this.categories.update((c) => {
      const set = new Set(c.clipTypes);
      if (on) set.add(t);
      else set.delete(t);
      return { ...c, clipTypes: [...set] };
    });
    this.persistCategories();
  }

  async onPush(): Promise<void> {
    this.busy.set(true);
    try {
      const r = await window.devclip.syncPush(this.passphrase);
      if (!r.ok) {
        alert(r.error);
      }
      await this.refresh();
      await this.clips.reloadFromServer();
    } finally {
      this.busy.set(false);
    }
  }

  async onPull(): Promise<void> {
    this.busy.set(true);
    try {
      const r = await window.devclip.syncPull(this.passphrase);
      if (!r.ok) {
        alert(r.error);
      }
      await this.refresh();
      await this.clips.reloadFromServer();
    } finally {
      this.busy.set(false);
    }
  }

  async onExportFile(): Promise<void> {
    this.busy.set(true);
    try {
      const r = await window.devclip.syncExportBackup(this.passphrase);
      if (!r.ok && r.error !== 'Cancelled') {
        alert(r.error);
      }
    } finally {
      this.busy.set(false);
    }
  }

  async onImportFile(): Promise<void> {
    this.busy.set(true);
    try {
      const r = await window.devclip.syncImportBackup(this.passphrase);
      if (!r.ok && r.error !== 'Cancelled') {
        alert(r.error);
      }
      await this.refresh();
      await this.clips.reloadFromServer();
    } finally {
      this.busy.set(false);
    }
  }

  async onRetryOutbox(): Promise<void> {
    await window.devclip.syncProcessOutbox();
    await this.refresh();
  }
}
