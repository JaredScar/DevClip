import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FeatureFlagService } from '../../services/feature-flag.service';

@Component({
  selector: 'app-vault-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="relative flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-1">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-lg">🛡</span>
        <h2 class="text-sm font-semibold text-white lite:text-zinc-900">Vault</h2>
        <span class="rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-300">
          PRO
        </span>
      </div>

      @if (!flags.isProUnlocked()) {
        <div class="absolute inset-0 z-20 flex flex-col gap-3 bg-black/40 p-4 text-xs backdrop-blur lite:bg-zinc-100/20">
          <div
            class="w-full max-w-[520px] rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200 lite:border-amber-400/40 lite:bg-amber-100 lite:text-amber-900"
          >
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-lg">🛡</span>
              <h2 class="text-sm font-semibold">Vault</h2>
              <span class="rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-300">PRO</span>
            </div>
            <p class="mt-2">Unlock Pro to use the encrypted local vault (AES-256-GCM, separate PIN).</p>
            <p class="mt-2">No interaction is allowed until Pro is unlocked.</p>
          </div>
        </div>
      }

      <p class="text-xs text-zinc-500 lite:text-zinc-600">
        Sensitive clips are encrypted at rest with a vault PIN (independent of app lock). Unlock to view
        entries; copy decrypts to the clipboard only in memory.
      </p>

        @if (state(); as st) {
          <div class="flex flex-wrap items-center gap-2 text-xs text-zinc-400 lite:text-zinc-600">
            <span>Items: {{ st.entryCount }}</span>
            @if (st.configured) {
              <span>·</span>
              <span>{{ st.unlocked ? 'Unlocked' : 'Locked' }}</span>
            }
            <button
              type="button"
              class="ml-auto rounded-lg border border-white/15 px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/5 lite:border-zinc-300 lite:text-zinc-800"
              (click)="refreshAll()"
            >
              Refresh
            </button>
          </div>
        }

        @if (msg()) {
          <p class="text-xs text-amber-400">{{ msg() }}</p>
        }

        @if (!state()?.configured) {
          <div class="rounded-xl border border-white/10 bg-[#1a1a1a] p-4 lite:border-zinc-200 lite:bg-white">
            <h3 class="mb-2 text-sm font-medium text-white lite:text-zinc-900">Create vault</h3>
            <p class="mb-3 text-xs text-zinc-500">
              Choose a vault PIN (min 4 characters). This derives the encryption key; it is not stored.
            </p>
            <label class="mb-2 flex flex-col gap-1 text-xs text-zinc-300 lite:text-zinc-800">
              <span>Vault PIN</span>
              <input
                type="password"
                class="rounded border border-white/10 bg-[#2a2a2a] p-2 font-mono text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
                [(ngModel)]="setupPin"
                autocomplete="new-password"
              />
            </label>
            <label class="mb-3 flex flex-col gap-1 text-xs text-zinc-300 lite:text-zinc-800">
              <span>Confirm</span>
              <input
                type="password"
                class="rounded border border-white/10 bg-[#2a2a2a] p-2 font-mono text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
                [(ngModel)]="setupPin2"
                autocomplete="new-password"
              />
            </label>
            <button
              type="button"
              class="rounded-lg bg-devclip-accent px-3 py-2 text-xs font-semibold text-black"
              [disabled]="loading()"
              (click)="onSetup()"
            >
              Create encrypted vault
            </button>
          </div>
        } @else if (!state()?.unlocked) {
          <div class="rounded-xl border border-white/10 bg-[#1a1a1a] p-4 lite:border-zinc-200 lite:bg-white">
            <h3 class="mb-2 text-sm font-medium text-white lite:text-zinc-900">Unlock vault</h3>
            <label class="mb-3 flex flex-col gap-1 text-xs text-zinc-300 lite:text-zinc-800">
              <span>Vault PIN</span>
              <input
                type="password"
                class="rounded border border-white/10 bg-[#2a2a2a] p-2 font-mono text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
                [(ngModel)]="unlockPin"
                (keyup.enter)="onUnlock()"
                autocomplete="current-password"
              />
            </label>
            <button
              type="button"
              class="rounded-lg bg-devclip-accent px-3 py-2 text-xs font-semibold text-black"
              [disabled]="loading()"
              (click)="onUnlock()"
            >
              Unlock
            </button>
          </div>
        } @else {
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5 lite:border-zinc-300 lite:text-zinc-800"
              (click)="onLock()"
            >
              Lock vault
            </button>
          </div>

          <div class="rounded-xl border border-white/10 bg-[#1a1a1a] p-4 lite:border-zinc-200 lite:bg-white">
            <h3 class="mb-2 text-sm font-medium text-white lite:text-zinc-900">Add item</h3>
            <label class="mb-2 flex flex-col gap-1 text-xs text-zinc-300 lite:text-zinc-800">
              <span>Optional label (stored in plain text)</span>
              <input
                class="rounded border border-white/10 bg-[#2a2a2a] p-2 text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
                [(ngModel)]="manualTitle"
              />
            </label>
            <label class="mb-2 flex flex-col gap-1 text-xs text-zinc-300 lite:text-zinc-800">
              <span>Type</span>
              <select
                class="rounded border border-white/10 bg-[#2a2a2a] p-2 text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
                [(ngModel)]="manualType"
              >
                <option value="secret">secret</option>
                <option value="text">text</option>
                <option value="code">code</option>
                <option value="url">url</option>
              </select>
            </label>
            <label class="mb-2 flex flex-col gap-1 text-xs text-zinc-300 lite:text-zinc-800">
              <span>Content (encrypted)</span>
              <textarea
                class="h-24 w-full rounded border border-white/10 bg-[#2a2a2a] p-2 font-mono text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
                [(ngModel)]="manualContent"
              ></textarea>
            </label>
            <button
              type="button"
              class="rounded-lg bg-devclip-accent px-3 py-2 text-xs font-semibold text-black"
              [disabled]="loading()"
              (click)="onAddManual()"
            >
              Encrypt &amp; save
            </button>
          </div>

          <div class="rounded-xl border border-white/10 bg-[#1a1a1a] p-4 lite:border-zinc-200 lite:bg-white">
            <h3 class="mb-2 text-sm font-medium text-white lite:text-zinc-900">Entries</h3>
            @if (entries().length === 0) {
              <p class="text-xs text-zinc-500">No items yet. Use “Vault” on a history clip or add above.</p>
            } @else {
              <ul class="space-y-2">
                @for (e of entries(); track e.id) {
                  <li
                    class="flex flex-wrap items-center gap-2 border-b border-white/5 py-2 last:border-0 lite:border-zinc-100"
                  >
                    <div class="min-w-0 flex-1">
                      <div class="text-xs font-medium text-zinc-200 lite:text-zinc-800">
                        {{ e.title_hint || 'Untitled' }}
                        <span class="ml-2 font-mono text-[10px] text-zinc-500">{{ e.type }}</span>
                      </div>
                      <div class="text-[10px] text-zinc-600">{{ rel(e.created_at) }}</div>
                    </div>
                    <button
                      type="button"
                      class="rounded border border-white/10 px-2 py-1 text-[10px] text-zinc-300 hover:bg-white/5 lite:border-zinc-300 lite:text-zinc-800"
                      (click)="onCopy(e.id)"
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      class="rounded border border-red-500/30 px-2 py-1 text-[10px] text-red-400 hover:bg-red-500/10"
                      (click)="onDelete(e.id)"
                    >
                      Delete
                    </button>
                  </li>
                }
              </ul>
            }
          </div>

          <div class="rounded-xl border border-white/10 bg-[#1a1a1a] p-4 lite:border-zinc-200 lite:bg-white">
            <h3 class="mb-2 text-sm font-medium text-white lite:text-zinc-900">Change vault PIN</h3>
            <p class="mb-2 text-[10px] text-zinc-600">Re-encrypts all entries.</p>
            <input
              type="password"
              placeholder="Current PIN"
              class="mb-2 w-full rounded border border-white/10 bg-[#2a2a2a] p-2 font-mono text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
              [(ngModel)]="changeOld"
            />
            <input
              type="password"
              placeholder="New PIN"
              class="mb-2 w-full rounded border border-white/10 bg-[#2a2a2a] p-2 font-mono text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
              [(ngModel)]="changeNew"
            />
            <input
              type="password"
              placeholder="Confirm new PIN"
              class="mb-2 w-full rounded border border-white/10 bg-[#2a2a2a] p-2 font-mono text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
              [(ngModel)]="changeNew2"
            />
            <button
              type="button"
              class="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-300 lite:border-zinc-300 lite:text-zinc-800"
              [disabled]="loading()"
              (click)="onChangePin()"
            >
              Update PIN
            </button>
          </div>

          <div class="rounded-xl border border-red-500/20 bg-[#1a1a1a] p-4 lite:border-red-200 lite:bg-white">
            <h3 class="mb-2 text-sm font-medium text-red-300 lite:text-red-800">Disable vault</h3>
            <p class="mb-2 text-xs text-zinc-500">Deletes all encrypted items and vault settings.</p>
            <input
              type="password"
              placeholder="Vault PIN to confirm"
              class="mb-2 w-full rounded border border-white/10 bg-[#2a2a2a] p-2 font-mono text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
              [(ngModel)]="disablePin"
            />
            <button
              type="button"
              class="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
              [disabled]="loading()"
              (click)="onDisable()"
            >
              Disable and wipe vault
            </button>
          </div>
        }

        <div class="rounded-xl border border-white/10 bg-[#1a1a1a] p-4 lite:border-zinc-200 lite:bg-white">
          <h3 class="mb-2 text-sm font-medium text-white lite:text-zinc-900">External integrations</h3>
          <p class="mb-2 text-xs text-zinc-500">
            Hooks for password managers and team secret stores (planned; not active yet).
          </p>
          <ul class="text-xs text-zinc-400">
            @for (h of hooks(); track h.id) {
              <li class="flex justify-between gap-2 border-b border-white/5 py-1 last:border-0 lite:border-zinc-100">
                <span>{{ h.label }}</span>
                <span class="font-mono text-[10px] text-zinc-600">{{ h.status }}</span>
              </li>
            }
          </ul>
        </div>
      <!-- end vault -->
    </div>
  `,
})
export class VaultPanelComponent implements OnInit {
  readonly flags = inject(FeatureFlagService);

  readonly state = signal<{ configured: boolean; unlocked: boolean; entryCount: number } | null>(null);
  readonly entries = signal<{ id: number; created_at: number; type: string; title_hint: string }[]>([]);
  readonly hooks = signal<{ id: string; label: string; status: 'planned' }[]>([]);
  readonly msg = signal('');
  readonly loading = signal(false);

  setupPin = '';
  setupPin2 = '';
  unlockPin = '';
  changeOld = '';
  changeNew = '';
  changeNew2 = '';
  disablePin = '';
  manualContent = '';
  manualTitle = '';
  manualType = 'secret';

  async ngOnInit(): Promise<void> {
    if (!this.flags.isProUnlocked()) {
      return;
    }
    await this.refreshHooks();
    await this.refreshAll();
  }

  async refreshHooks(): Promise<void> {
    try {
      this.hooks.set(await window.devclip.vaultListExternalHooks());
    } catch {
      this.hooks.set([]);
    }
  }

  async refreshAll(): Promise<void> {
    this.msg.set('');
    try {
      const st = await window.devclip.vaultGetState();
      this.state.set(st);
      if (st.unlocked) {
        this.entries.set(await window.devclip.vaultListMeta());
      } else {
        this.entries.set([]);
      }
    } catch {
      this.msg.set('Could not read vault state.');
    }
  }

  rel(ts: number): string {
    const sec = Math.max(0, Math.floor(Date.now() / 1000) - ts);
    if (sec < 60) return `${sec}s ago`;
    const m = Math.floor(sec / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  async onSetup(): Promise<void> {
    this.msg.set('');
    if (this.setupPin !== this.setupPin2) {
      this.msg.set('PINs do not match.');
      return;
    }
    this.loading.set(true);
    try {
      const r = await window.devclip.vaultSetup(this.setupPin);
      if (r.ok) {
        this.setupPin = '';
        this.setupPin2 = '';
        await this.refreshAll();
      } else {
        this.msg.set(r.error ?? 'Setup failed.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  async onUnlock(): Promise<void> {
    this.msg.set('');
    this.loading.set(true);
    try {
      const r = await window.devclip.vaultUnlock(this.unlockPin);
      if (r.ok) {
        this.unlockPin = '';
        await this.refreshAll();
      } else {
        this.msg.set(r.error ?? 'Unlock failed.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  async onLock(): Promise<void> {
    await window.devclip.vaultLock();
    await this.refreshAll();
  }

  async onAddManual(): Promise<void> {
    this.msg.set('');
    this.loading.set(true);
    try {
      const r = await window.devclip.vaultAddManual({
        type: this.manualType,
        titleHint: this.manualTitle,
        content: this.manualContent,
      });
      if (r.ok) {
        this.manualContent = '';
        this.manualTitle = '';
        await this.refreshAll();
      } else {
        this.msg.set(r.error ?? 'Could not save.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  async onCopy(id: number): Promise<void> {
    const r = await window.devclip.vaultCopyEntry(id);
    if (!r.ok) {
      this.msg.set(r.error ?? 'Copy failed.');
    }
  }

  async onDelete(id: number): Promise<void> {
    if (!window.confirm('Delete this vault entry permanently?')) {
      return;
    }
    const r = await window.devclip.vaultDeleteEntry(id);
    if (!r.ok) {
      this.msg.set(r.error ?? 'Delete failed.');
      return;
    }
    await this.refreshAll();
  }

  async onChangePin(): Promise<void> {
    this.msg.set('');
    if (this.changeNew !== this.changeNew2) {
      this.msg.set('New PINs do not match.');
      return;
    }
    this.loading.set(true);
    try {
      const r = await window.devclip.vaultChangePin(this.changeOld, this.changeNew);
      if (r.ok) {
        this.changeOld = '';
        this.changeNew = '';
        this.changeNew2 = '';
        await this.refreshAll();
      } else {
        this.msg.set(r.error ?? 'Could not change PIN.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  async onDisable(): Promise<void> {
    this.msg.set('');
    if (!window.confirm('This deletes every vault item. Continue?')) {
      return;
    }
    this.loading.set(true);
    try {
      const r = await window.devclip.vaultDisable(this.disablePin);
      if (r.ok) {
        this.disablePin = '';
        await this.refreshAll();
      } else {
        this.msg.set(r.error ?? 'Could not disable vault.');
      }
    } finally {
      this.loading.set(false);
    }
  }
}
