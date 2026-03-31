import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ClipAction } from '../../models/action.model';
import { ActionService } from '../../services/action.service';
import { ClipService } from '../../services/clip.service';
import { ClipsStore } from '../../store/clips.store';

type ActionGroupId =
  | 'FORMAT'
  | 'EXTRACT'
  | 'ENCODE'
  | 'TRANSFORM'
  | 'HASH'
  | 'CASE'
  | 'TEXT'
  | 'COUNT'
  | 'ESCAPE'
  | 'UTIL';

export const ACTIONS_TAB_GROUP_ORDER: ActionGroupId[] = [
  'FORMAT',
  'EXTRACT',
  'ENCODE',
  'TRANSFORM',
  'HASH',
  'CASE',
  'TEXT',
  'COUNT',
  'ESCAPE',
  'UTIL',
];

const GROUP_LABELS: Record<ActionGroupId, string> = {
  FORMAT: 'FORMAT',
  EXTRACT: 'EXTRACT',
  ENCODE: 'ENCODE / DECODE',
  TRANSFORM: 'TRANSFORM',
  HASH: 'HASH',
  CASE: 'CASE',
  TEXT: 'TEXT / LINES',
  COUNT: 'COUNT',
  ESCAPE: 'ESCAPE',
  UTIL: 'UTILITIES',
};

function groupForAction(id: string): ActionGroupId | null {
  if (id === 'format-json' || id === 'minify-json') return 'FORMAT';
  if (id === 'extract-urls' || id === 'extract-emails') return 'EXTRACT';
  if (
    id === 'base64-encode' ||
    id === 'base64-decode' ||
    id === 'url-encode' ||
    id === 'url-decode'
  ) {
    return 'ENCODE';
  }
  if (id === 'regex-replace' || id === 'trim-whitespace') return 'TRANSFORM';
  if (id.startsWith('hash-')) return 'HASH';
  if (id.startsWith('case-')) return 'CASE';
  if (
    id === 'normalize-line-endings' ||
    id === 'sort-lines' ||
    id === 'dedupe-lines'
  ) {
    return 'TEXT';
  }
  if (id === 'count-stats') return 'COUNT';
  if (
    id === 'escape-html' ||
    id === 'unescape-html' ||
    id === 'escape-json-string' ||
    id === 'unescape-json-string'
  ) {
    return 'ESCAPE';
  }
  if (
    id === 'jwt-decode' ||
    id === 'timestamp-convert' ||
    id === 'number-bases' ||
    id === 'diff-blocks' ||
    id === 'diff-two-clips' ||
    id === 'expand-shortcode'
  ) {
    return 'UTIL';
  }
  return null;
}

@Component({
  selector: 'app-actions-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex min-h-0 flex-1 gap-4">
      <div
        class="flex min-h-0 w-[min(420px,45%)] flex-col overflow-y-auto rounded-xl border border-white/10 bg-[#121212] p-4 lite:border-zinc-200 lite:bg-zinc-50"
      >
        <h2 class="mb-1 text-sm font-semibold text-white lite:text-zinc-900">Available Actions</h2>
        <p class="mb-4 text-xs text-zinc-500 lite:text-zinc-600">
          Select a clip from History first, then run an action.
        </p>

        @for (g of GROUP_ORDER; track g) {
          @if (grouped()[g].length > 0) {
            <div class="mb-4">
              <div class="mb-2 text-[10px] font-bold tracking-wider text-zinc-500 lite:text-zinc-600">
                {{ GROUP_LABELS[g] }}
              </div>
              @for (a of grouped()[g]; track a.id) {
                <button
                  type="button"
                  class="mb-2 flex w-full items-start gap-3 rounded-lg border p-3 text-left transition"
                  [ngClass]="
                    selected()?.id === a.id
                      ? 'border-devclip-accent bg-emerald-500/10'
                      : 'border-white/10 hover:border-white/20 lite:border-zinc-300 lite:hover:border-zinc-400'
                  "
                  (click)="select(a)"
                >
                  <span
                    class="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-zinc-400 lite:bg-zinc-200 lite:text-zinc-600"
                  >
                    @if (a.id.includes('json')) {
                      <span class="font-mono text-xs">{{ jsonBraces }}</span>
                    } @else if (a.id.includes('url') || a.id.includes('extract')) {
                      <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                        <path
                          d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"
                        />
                      </svg>
                    } @else if (a.id.includes('base64')) {
                      <span class="font-mono text-[10px]">64</span>
                    } @else {
                      <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                        <path
                          d="M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.42L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z"
                        />
                      </svg>
                    }
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-sm font-medium text-white lite:text-zinc-900">{{ a.name }}</span>
                    <span class="mt-0.5 block text-xs text-zinc-500 lite:text-zinc-600">{{ a.description }}</span>
                  </span>
                  <span class="shrink-0 self-center text-devclip-accent">
                    <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                </button>
              }
            </div>
          }
        }
      </div>

      <div
        class="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-white/10 bg-[#121212] p-4 lite:border-zinc-200 lite:bg-zinc-50"
      >
        <h2 class="mb-3 text-sm font-semibold text-white lite:text-zinc-900">Preview</h2>

        @if (!clip()) {
          <div class="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <span class="inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-red-400">
              <svg class="h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
                <path
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
                />
              </svg>
            </span>
            <p class="max-w-xs text-sm text-zinc-400 lite:text-zinc-600">
              No clipboard item selected. Go to History and select an item first.
            </p>
          </div>
        } @else {
          @if (selected()?.id === 'regex-replace') {
            <div class="mb-3 flex gap-2">
              <input
                class="min-w-0 flex-1 rounded border border-white/10 bg-[#2a2a2a] px-2 py-1.5 text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
                placeholder="Regex"
                [(ngModel)]="findPattern"
                (ngModelChange)="runPreview()"
              />
              <input
                class="min-w-0 flex-1 rounded border border-white/10 bg-[#2a2a2a] px-2 py-1.5 text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
                placeholder="Replace"
                [(ngModel)]="replaceWith"
                (ngModelChange)="runPreview()"
              />
            </div>
          }
          @if (selected()?.id === 'diff-blocks' || selected()?.id === 'diff-two-clips') {
            <div class="mb-3 flex flex-col gap-1">
              <span class="text-xs text-zinc-500 lite:text-zinc-600">
                @if (selected()?.id === 'diff-two-clips') {
                  Second clip (required for split view)
                } @else {
                  Second clip (optional)
                }
              </span>
              <select
                class="rounded border border-white/10 bg-[#2a2a2a] p-2 text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
                [(ngModel)]="diffSecondClipIdStr"
                (ngModelChange)="runPreview()"
              >
                <option value="">
                  @if (selected()?.id === 'diff-two-clips') {
                    — Choose second clip —
                  } @else {
                    — Use only selected clip (--- separator) —
                  }
                </option>
                @for (o of diffOtherClips(); track o.id) {
                  <option [value]="'' + o.id">
                    {{ o.type }} · {{ previewOneLine(o.content) }}
                  </option>
                }
              </select>
            </div>
          }
          @if (selected()?.id === 'diff-two-clips') {
            @if (!diffSecondClipIdStr.trim()) {
              <p class="mb-3 text-xs text-amber-400">Select a second clip for side-by-side diff.</p>
            } @else {
              <div
                class="mb-3 grid min-h-[220px] max-h-[min(50vh,28rem)] grid-cols-2 gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 font-mono text-[11px] lite:border-zinc-300 lite:bg-zinc-300"
              >
                <div class="flex min-h-0 flex-col bg-[#0a0a0a] lite:bg-white">
                  <div
                    class="shrink-0 border-b border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase text-zinc-500 lite:border-zinc-200 lite:bg-zinc-100 lite:text-zinc-600"
                  >
                    Clip A (selected)
                  </div>
                  <div class="min-h-0 max-h-[min(48vh,26rem)] overflow-auto">
                    @for (row of splitDiffRows(); track $index) {
                      <div
                        class="whitespace-pre-wrap break-all px-2 py-0.5 leading-snug"
                        [ngClass]="{ 'bg-rose-900/25': !row.same, 'lite:bg-rose-100': !row.same }"
                      >
                        {{ row.left || ' ' }}
                      </div>
                    }
                  </div>
                </div>
                <div class="flex min-h-0 flex-col bg-[#0a0a0a] lite:bg-white">
                  <div
                    class="shrink-0 border-b border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase text-zinc-500 lite:border-zinc-200 lite:bg-zinc-100 lite:text-zinc-600"
                  >
                    Clip B
                  </div>
                  <div class="min-h-0 max-h-[min(48vh,26rem)] overflow-auto">
                    @for (row of splitDiffRows(); track $index) {
                      <div
                        class="whitespace-pre-wrap break-all px-2 py-0.5 leading-snug"
                        [ngClass]="{ 'bg-rose-900/25': !row.same, 'lite:bg-rose-100': !row.same }"
                      >
                        {{ row.right || ' ' }}
                      </div>
                    }
                  </div>
                </div>
              </div>
            }
          }
          <textarea
            readonly
            class="mb-3 min-h-[200px] flex-1 resize-none rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs text-zinc-200 lite:border-zinc-300 lite:bg-white lite:text-zinc-800"
            [class.hidden]="selected()?.id === 'diff-two-clips' && !!diffSecondClipIdStr.trim()"
            [value]="preview()"
          ></textarea>
          <button
            type="button"
            class="shrink-0 rounded-lg bg-devclip-accent px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
            [disabled]="!selected()"
            (click)="applyAndCopy()"
          >
            Apply &amp; copy to clipboard
          </button>
        }
      </div>
    </div>
  `,
})
export class ActionsTabComponent {
  readonly GROUP_ORDER = ACTIONS_TAB_GROUP_ORDER;
  readonly GROUP_LABELS = GROUP_LABELS;
  /** Avoid literal `{}` in template (breaks Angular control-flow parsing). */
  readonly jsonBraces = '{}';

  private readonly actionSvc = inject(ActionService);
  private readonly clips = inject(ClipService);
  private readonly store = inject(ClipsStore);

  readonly clip = computed(() => this.store.selectedClip());

  readonly grouped = computed(() => {
    const c = this.clip();
    const buckets: Record<ActionGroupId, ClipAction[]> = {
      FORMAT: [],
      EXTRACT: [],
      ENCODE: [],
      TRANSFORM: [],
      HASH: [],
      CASE: [],
      TEXT: [],
      COUNT: [],
      ESCAPE: [],
      UTIL: [],
    };
    if (!c) return buckets;
    for (const a of this.actionSvc.forType(c.type)) {
      const g = groupForAction(a.id);
      if (g) buckets[g].push(a);
    }
    return buckets;
  });

  readonly selected = signal<ClipAction | null>(null);
  readonly preview = signal('');
  findPattern = '';
  replaceWith = '';
  /** Empty = single-clip `---` mode; otherwise clip id string. */
  diffSecondClipIdStr = '';

  readonly diffOtherClips = computed(() => {
    const c = this.clip();
    if (!c) return [];
    return this.store.visibleClips().filter((x) => x.id !== c.id);
  });

  constructor() {
    effect(() => {
      const c = this.clip();
      const g = this.grouped();
      if (!c) {
        this.selected.set(null);
        this.preview.set('');
        return;
      }
      const list = this.actionSvc.forType(c.type);
      const cur = this.selected();
      const stillValid = cur !== null && list.some((x) => x.id === cur.id);
      if (!stillValid) {
        let first: ClipAction | null = null;
        for (const gid of ACTIONS_TAB_GROUP_ORDER) {
          const arr = g[gid];
          if (arr.length > 0) {
            first = arr[0] ?? null;
            break;
          }
        }
        this.selected.set(first);
      }
      this.diffSecondClipIdStr = '';
      this.runPreview();
    });
  }

  previewOneLine(s: string): string {
    const t = s.replace(/\s+/g, ' ').trim();
    if (t.length > 72) return t.slice(0, 69) + '…';
    return t || '(empty)';
  }

  private buildActionExtra(): { find?: string; replace?: string; diffSecondText?: string } | undefined {
    const sel = this.selected();
    if (!sel) return undefined;
    if (sel.id === 'regex-replace') {
      return { find: this.findPattern, replace: this.replaceWith };
    }
    if (
      (sel.id === 'diff-blocks' || sel.id === 'diff-two-clips') &&
      this.diffSecondClipIdStr.trim()
    ) {
      const id = parseInt(this.diffSecondClipIdStr, 10);
      const other = this.store.visibleClips().find((x) => x.id === id);
      if (other) return { diffSecondText: other.content };
    }
    return undefined;
  }

  splitDiffRows(): { left: string; right: string; same: boolean }[] {
    const c = this.clip();
    const sel = this.selected();
    if (!c || sel?.id !== 'diff-two-clips') return [];
    const idStr = this.diffSecondClipIdStr.trim();
    if (!idStr) return [];
    const id = parseInt(idStr, 10);
    const other = this.store.visibleClips().find((x) => x.id === id);
    if (!other) return [];
    const la = c.content.split('\n');
    const lb = other.content.split('\n');
    const max = Math.max(la.length, lb.length);
    const rows: { left: string; right: string; same: boolean }[] = [];
    for (let i = 0; i < max; i++) {
      const left = la[i] ?? '';
      const right = lb[i] ?? '';
      rows.push({ left, right, same: left === right });
    }
    return rows;
  }

  select(a: ClipAction): void {
    this.selected.set(a);
    this.runPreview();
  }

  runPreview(): void {
    const c = this.clip();
    const sel = this.selected();
    if (!c || !sel) {
      this.preview.set('');
      return;
    }
    try {
      const extra = this.buildActionExtra();
      const out = sel.run(c.content, extra);
      if (typeof out === 'string') {
        this.preview.set(out);
      } else {
        void out.then((t) => this.preview.set(t)).catch(() => this.preview.set('(error)'));
      }
    } catch {
      this.preview.set('(error)');
    }
  }

  applyAndCopy(): void {
    const c = this.clip();
    const sel = this.selected();
    if (!c || !sel) return;
    try {
      const extra = this.buildActionExtra();
      const out = sel.run(c.content, extra);
      const apply = (text: string) => {
        void this.clips.copyContent(text, c.id, c.type);
      };
      if (typeof out === 'string') {
        apply(out);
      } else {
        void out.then(apply);
      }
    } catch {
      /* ignore */
    }
  }
}
