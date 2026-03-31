import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClipsStore } from '../../store/clips.store';
import type { Clip } from '../../models/clip.model';

interface CollectionRow {
  id: number;
  name: string;
  is_smart: number;
  query: string | null;
  created_at: string;
  clip_count: number;
}

@Component({
  selector: 'app-collections-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-sm font-semibold text-white lite:text-zinc-900">Collections</h2>
        <span class="rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-300">
          PRO
        </span>
      </div>

      <div class="rounded-lg border border-white/10 bg-[#141414] p-3 lite:border-zinc-200 lite:bg-zinc-50">
        <div class="mb-2 text-[10px] font-semibold uppercase text-zinc-500">New collection</div>
        <label class="mb-2 flex flex-col gap-1 text-xs text-zinc-400">
          Name
          <input
            class="rounded border border-white/10 bg-[#1a1a1a] p-2 text-sm text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
            [(ngModel)]="newName"
            (keydown.enter)="createCollection()"
          />
        </label>
        <label class="mb-2 flex cursor-pointer items-center gap-2 text-xs text-zinc-300 lite:text-zinc-800">
          <input type="checkbox" [(ngModel)]="newIsSmart" />
          <span>Smart collection (auto membership from query)</span>
        </label>
        @if (newIsSmart) {
          <div class="mb-2 grid gap-2 sm:grid-cols-2">
            <label class="flex flex-col gap-1 text-[11px] text-zinc-400">
              Type
              <select
                class="rounded border border-white/10 bg-[#2a2a2a] p-2 text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
                [(ngModel)]="smartType"
              >
                <option value="all">All types</option>
                <option value="text">text</option>
                <option value="code">code</option>
                <option value="json">json</option>
                <option value="url">url</option>
                <option value="sql">sql</option>
                <option value="email">email</option>
                <option value="secret">secret</option>
                <option value="stack-trace">stack-trace</option>
                <option value="image">image</option>
              </select>
            </label>
            <label class="flex flex-col gap-1 text-[11px] text-zinc-400">
              Tag (optional)
              <input
                class="rounded border border-white/10 bg-[#2a2a2a] p-2 text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
                [(ngModel)]="smartTag"
                placeholder="must have tag"
              />
            </label>
            <label class="sm:col-span-2 flex flex-col gap-1 text-[11px] text-zinc-400">
              Content contains (optional)
              <input
                class="rounded border border-white/10 bg-[#2a2a2a] p-2 font-mono text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
                [(ngModel)]="smartContains"
              />
            </label>
            <label class="sm:col-span-2 flex flex-col gap-1 text-[11px] text-zinc-400">
              Source contains (optional)
              <input
                class="rounded border border-white/10 bg-[#2a2a2a] p-2 text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
                [(ngModel)]="smartSource"
              />
            </label>
          </div>
        }
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-lg bg-devclip-accent px-3 py-2 text-xs font-semibold text-black"
            (click)="createCollection()"
          >
            Create
          </button>
          <button
            type="button"
            class="rounded-lg border border-white/15 px-3 py-2 text-xs text-zinc-300 lite:border-zinc-400 lite:text-zinc-800"
            (click)="exportJson()"
          >
            Export JSON
          </button>
          <label
            class="cursor-pointer rounded-lg border border-white/15 px-3 py-2 text-xs text-zinc-300 lite:border-zinc-400 lite:text-zinc-800"
          >
            Import JSON
            <input type="file" accept="application/json,.json" class="hidden" (change)="onImportFile($event)" />
          </label>
        </div>
      </div>

      @if (message()) {
        <p class="text-xs text-zinc-500">{{ message() }}</p>
      }

      <div class="flex flex-wrap items-end gap-2 rounded-lg border border-white/10 bg-[#141414] p-3 lite:border-zinc-200 lite:bg-zinc-50">
        <span class="text-xs text-zinc-500">Add selected History clip to:</span>
        <select
          class="rounded border border-white/10 bg-[#2a2a2a] p-2 text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
          [(ngModel)]="addTargetIdStr"
        >
          <option value="">— Choose collection —</option>
          @for (c of collections(); track c.id) {
            <option [value]="'' + c.id">{{ c.name }} ({{ c.clip_count }})</option>
          }
        </select>
        <button
          type="button"
          class="rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-white lite:bg-zinc-200 lite:text-zinc-900"
          [disabled]="!selectedClip() || !addTargetIdStr"
          (click)="addSelectedToCollection()"
        >
          Add clip
        </button>
      </div>

      <div class="space-y-2">
        <div class="text-[10px] font-semibold uppercase text-zinc-500">Collections — drop clips here</div>
        @for (c of collections(); track c.id) {
          <div
            class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-white/15 bg-[#1a1a1a] px-4 py-3 transition-colors lite:border-zinc-300 lite:bg-white"
            [class.ring-1]="dragOverId() === c.id"
            [class.ring-devclip-accent]="dragOverId() === c.id"
            (dragover)="onDragOver($event, c.id)"
            (dragleave)="onDragLeave($event, c.id)"
            (drop)="onDrop($event, c.id)"
          >
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="truncate text-sm font-medium text-white lite:text-zinc-900">{{ c.name }}</span>
                @if (c.is_smart) {
                  <span
                    class="rounded bg-violet-600/30 px-1.5 py-0.5 text-[9px] font-bold uppercase text-violet-200"
                    >Smart</span
                  >
                }
              </div>
              <div class="text-xs text-zinc-500">{{ c.clip_count }} clips</div>
            </div>
            @if (c.is_smart) {
              <button
                type="button"
                class="text-xs text-zinc-400 hover:text-white lite:hover:text-zinc-900"
                (click)="refreshSmart(c.id)"
              >
                Refresh members
              </button>
            }
            <button
              type="button"
              class="text-xs text-red-400 hover:text-red-300"
              (click)="deleteCollection(c.id)"
            >
              Delete
            </button>
          </div>
        } @empty {
          <p class="text-sm text-zinc-500">No collections yet.</p>
        }
      </div>

      <div class="rounded-lg border border-white/10 bg-[#141414] p-3 lite:border-zinc-200 lite:bg-zinc-50">
        <div class="mb-2 text-[10px] font-semibold uppercase text-zinc-500">
          Recent clips — drag onto a collection
        </div>
        <div class="flex max-h-40 flex-col gap-1 overflow-y-auto">
          @for (cl of recentClips(); track cl.id) {
            <div
              class="cursor-grab rounded border border-white/5 bg-black/20 px-2 py-1.5 font-mono text-[10px] text-zinc-400 active:cursor-grabbing lite:border-zinc-200 lite:bg-zinc-100 lite:text-zinc-700"
              draggable="true"
              (dragstart)="onDragStart($event, cl.id)"
            >
              <span class="text-zinc-600">{{ cl.type }}</span>
              {{ previewClip(cl) }}
            </div>
          } @empty {
            <p class="text-[11px] text-zinc-600">Loading…</p>
          }
        </div>
      </div>
    </div>
  `,
})
export class CollectionsPanelComponent implements OnInit {
  private readonly clipsStore = inject(ClipsStore);

  readonly collections = signal<CollectionRow[]>([]);
  readonly recentClips = signal<Clip[]>([]);
  readonly message = signal('');
  readonly dragOverId = signal<number | null>(null);

  newName = '';
  newIsSmart = false;
  smartType = 'all';
  smartContains = '';
  smartTag = '';
  smartSource = '';
  addTargetIdStr = '';

  async ngOnInit(): Promise<void> {
    await this.reload();
    await this.loadRecentClips();
  }

  selectedClip() {
    return this.clipsStore.selectedClip();
  }

  previewClip(c: Clip): string {
    const t = c.content.replace(/\s+/g, ' ').trim();
    return t.length > 72 ? t.slice(0, 72) + '…' : t || '(empty)';
  }

  buildSmartQueryJson(): string {
    const o: Record<string, string> = {};
    if (this.smartType && this.smartType !== 'all') {
      o['type'] = this.smartType;
    } else {
      o['type'] = 'all';
    }
    if (this.smartContains.trim()) {
      o['contains'] = this.smartContains.trim();
    }
    if (this.smartTag.trim()) {
      o['tag'] = this.smartTag.trim();
    }
    if (this.smartSource.trim()) {
      o['sourceContains'] = this.smartSource.trim();
    }
    return JSON.stringify(o);
  }

  async loadRecentClips(): Promise<void> {
    try {
      const rows = (await window.devclip.searchClips('', 'all', {})) as Record<string, unknown>[];
      const mapped = rows.slice(0, 30).map((row) => this.mapClip(row));
      this.recentClips.set(mapped);
    } catch {
      this.recentClips.set([]);
    }
  }

  private mapClip(row: Record<string, unknown>): Clip {
    let tags: string[] = [];
    try {
      const t = JSON.parse(String(row['tags_json'] ?? '[]'));
      tags = Array.isArray(t) ? t.map(String) : [];
    } catch {
      tags = [];
    }
    let metadata: Record<string, unknown> = {};
    try {
      metadata = JSON.parse(String(row['metadata_json'] ?? '{}')) as Record<string, unknown>;
    } catch {
      metadata = {};
    }
    return {
      id: row['id'] as number,
      content: String(row['content'] ?? ''),
      type: row['type'] as Clip['type'],
      source: (row['source'] as string | null) ?? null,
      created_at: row['created_at'] as number,
      is_pinned: row['is_pinned'] as number,
      tags,
      use_count: Number(row['use_count'] ?? 0),
      metadata,
    };
  }

  onDragStart(ev: DragEvent, clipId: number): void {
    ev.dataTransfer?.setData('application/x-devclip-clip-id', String(clipId));
    ev.dataTransfer?.setData('text/plain', String(clipId));
    ev.dataTransfer!.effectAllowed = 'copy';
  }

  onDragOver(ev: DragEvent, collectionId: number): void {
    ev.preventDefault();
    ev.dataTransfer!.dropEffect = 'copy';
    this.dragOverId.set(collectionId);
  }

  onDragLeave(ev: DragEvent, collectionId: number): void {
    const related = ev.relatedTarget as Node | null;
    if (related && (ev.currentTarget as HTMLElement).contains(related)) {
      return;
    }
    if (this.dragOverId() === collectionId) {
      this.dragOverId.set(null);
    }
  }

  async onDrop(ev: DragEvent, collectionId: number): Promise<void> {
    ev.preventDefault();
    this.dragOverId.set(null);
    const raw =
      ev.dataTransfer?.getData('application/x-devclip-clip-id') ||
      ev.dataTransfer?.getData('text/plain');
    const clipId = parseInt(raw ?? '', 10);
    if (!Number.isFinite(clipId) || clipId <= 0) {
      return;
    }
    this.message.set('');
    try {
      await window.devclip.collectionsAddClip(collectionId, clipId);
      await this.reload();
      this.message.set('Clip added to collection.');
    } catch {
      this.message.set('Drop failed.');
    }
  }

  async reload(): Promise<void> {
    try {
      const rows = (await window.devclip.collectionsList()) as CollectionRow[];
      this.collections.set(
        rows.map((r) => ({ ...r, clip_count: Number(r.clip_count) ?? 0 }))
      );
    } catch {
      this.collections.set([]);
    }
  }

  async createCollection(): Promise<void> {
    const n = this.newName.trim();
    if (!n) return;
    this.message.set('');
    try {
      if (this.newIsSmart) {
        await window.devclip.collectionsCreate(n, {
          isSmart: true,
          query: this.buildSmartQueryJson(),
        });
      } else {
        await window.devclip.collectionsCreate(n);
      }
      this.newName = '';
      await this.reload();
      await this.loadRecentClips();
    } catch {
      this.message.set('Could not create collection.');
    }
  }

  async refreshSmart(id: number): Promise<void> {
    this.message.set('');
    try {
      await window.devclip.collectionsRefreshSmart(id);
      await this.reload();
      this.message.set('Smart collection refreshed.');
    } catch {
      this.message.set('Refresh failed.');
    }
  }

  async deleteCollection(id: number): Promise<void> {
    if (!window.confirm('Delete this collection? Clips stay in history.')) return;
    this.message.set('');
    try {
      await window.devclip.collectionsDelete(id);
      await this.reload();
    } catch {
      this.message.set('Could not delete.');
    }
  }

  async addSelectedToCollection(): Promise<void> {
    const clip = this.selectedClip();
    const id = parseInt(this.addTargetIdStr, 10);
    if (!clip || !Number.isFinite(id)) return;
    this.message.set('');
    try {
      await window.devclip.collectionsAddClip(id, clip.id);
      await this.reload();
      this.message.set('Clip added to collection.');
    } catch {
      this.message.set('Could not add clip.');
    }
  }

  async exportJson(): Promise<void> {
    try {
      const json = await window.devclip.collectionsExportJson();
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'devclip-collections.json';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      this.message.set('Export failed.');
    }
  }

  async onImportFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.message.set('');
    try {
      const text = await file.text();
      await window.devclip.collectionsImportJson(text);
      await this.reload();
      this.message.set('Import finished.');
    } catch {
      this.message.set('Import failed.');
    }
  }
}
