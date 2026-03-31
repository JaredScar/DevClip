import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { DevClipApi } from '../../../types/devclip';

type PeriodPreset = '7d' | '30d' | '90d' | 'month';

type Summary = Awaited<ReturnType<DevClipApi['getInsightsSummary']>>;

@Component({
  selector: 'app-insights-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-1">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-sm font-semibold text-white lite:text-zinc-900">Usage insights</h2>
        <span class="rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-300">
          PRO
        </span>
        <select
          class="ml-auto rounded-lg border border-white/10 bg-[#2a2a2a] px-2 py-1.5 text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
          [(ngModel)]="period"
          (ngModelChange)="reload()"
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="month">This calendar month</option>
        </select>
        <button
          type="button"
          class="rounded-lg border border-white/15 px-2 py-1.5 text-xs text-zinc-300 hover:bg-white/5 lite:border-zinc-300 lite:text-zinc-800"
          (click)="reload()"
        >
          Refresh
        </button>
      </div>

      @if (error()) {
        <p class="text-sm text-red-400">{{ error() }}</p>
      } @else if (loading()) {
        <p class="text-sm text-zinc-500">Loading…</p>
      } @else if (data()) {
        @let s = data()!;

        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div class="rounded-xl border border-white/10 bg-[#1a1a1a] p-4 lite:border-zinc-200 lite:bg-white">
            <div class="mb-1 text-2xl">📋</div>
            <div class="text-xl font-bold text-white lite:text-zinc-900">{{ s.captures }}</div>
            <div class="text-xs text-zinc-500">New captures (window)</div>
          </div>
          <div class="rounded-xl border border-white/10 bg-[#1a1a1a] p-4 lite:border-zinc-200 lite:bg-white">
            <div class="mb-1 text-2xl">🔁</div>
            <div class="text-xl font-bold text-white lite:text-zinc-900">{{ reuseLabel() }}</div>
            <div class="text-xs text-zinc-500">Avg re-copy / clip (in window)</div>
          </div>
          <div class="rounded-xl border border-white/10 bg-[#1a1a1a] p-4 lite:border-zinc-200 lite:bg-white">
            <div class="mb-1 text-2xl">🧩</div>
            <div class="text-xl font-bold text-white lite:text-zinc-900">{{ s.snippetCount }}</div>
            <div class="text-xs text-zinc-500">Snippets in library</div>
          </div>
          <div class="rounded-xl border border-white/10 bg-[#1a1a1a] p-4 lite:border-zinc-200 lite:bg-white">
            <div class="mb-1 text-2xl">📈</div>
            <div class="text-xl font-bold text-white lite:text-zinc-900">{{ productivityScore() }}</div>
            <div class="text-xs text-zinc-500">Activity score (0–100)</div>
          </div>
        </div>

        <div class="rounded-xl border border-white/10 bg-[#1a1a1a] p-4 lite:border-zinc-200 lite:bg-white">
          <div class="mb-2 text-sm font-medium text-white lite:text-zinc-900">Last 7 days (captures)</div>
          <div class="flex h-28 items-end gap-1">
            @for (d of s.last7Days; track d.day) {
              <div class="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                <div
                  class="w-full min-h-[2px] rounded-t bg-violet-500/90"
                  [style.height.%]="barPct(d.count, maxLast7())"
                ></div>
                <span class="max-w-full truncate text-[9px] text-zinc-600">{{ shortDay(d.day) }}</span>
              </div>
            }
          </div>
        </div>

        <div class="grid gap-4 lg:grid-cols-2">
          <div class="rounded-xl border border-white/10 bg-[#1a1a1a] p-4 lite:border-zinc-200 lite:bg-white">
            <div class="mb-3 text-sm font-medium text-white lite:text-zinc-900">By hour (captures in window)</div>
            @if (s.peakHour != null) {
              <p class="mb-2 text-xs text-zinc-500">
                Peak local hour:
                <span class="font-mono text-zinc-300 lite:text-zinc-800">{{ s.peakHour }}:00</span>
              </p>
            }
            <div class="flex h-20 items-end gap-px">
              @for (h of hours24(); track h.hour) {
                <div
                  class="min-w-0 flex-1 rounded-t bg-sky-600/70"
                  [style.height.%]="barPct(h.count, maxHour())"
                  [title]="h.hour + ':00 — ' + h.count"
                ></div>
              }
            </div>
          </div>

          <div class="rounded-xl border border-white/10 bg-[#1a1a1a] p-4 lite:border-zinc-200 lite:bg-white">
            <div class="mb-3 text-sm font-medium text-white lite:text-zinc-900">Content types (window)</div>
            @for (t of s.types; track t.type) {
              <div class="mb-2">
                <div class="mb-1 flex justify-between text-xs">
                  <span class="text-zinc-300 lite:text-zinc-800">{{ t.type }}</span>
                  <span class="text-zinc-500">{{ t.count }}</span>
                </div>
                <div class="h-1.5 overflow-hidden rounded-full bg-zinc-800 lite:bg-zinc-200">
                  <div
                    class="h-full rounded-full bg-emerald-500/70"
                    [style.width.%]="typePct(t.count)"
                  ></div>
                </div>
              </div>
            } @empty {
              <p class="text-xs text-zinc-500">No typed captures in this range.</p>
            }
          </div>
        </div>

        <div class="rounded-xl border border-white/10 bg-[#1a1a1a] p-4 lite:border-zinc-200 lite:bg-white">
          <div class="mb-3 text-sm font-medium text-white lite:text-zinc-900">Top source apps (window)</div>
          @for (src of s.topSources; track src.source) {
            <div class="mb-2">
              <div class="mb-1 flex justify-between text-xs">
                <span class="truncate text-zinc-300 lite:text-zinc-800">{{ src.source }}</span>
                <span class="shrink-0 text-zinc-500">{{ src.count }}</span>
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-zinc-800 lite:bg-zinc-200">
                <div
                  class="h-full rounded-full bg-amber-500/70"
                  [style.width.%]="sourcePct(src.count)"
                ></div>
              </div>
            </div>
          } @empty {
            <p class="text-xs text-zinc-500">No source data for this range.</p>
          }
        </div>

        <div class="grid gap-4 lg:grid-cols-2">
          <div class="rounded-xl border border-white/10 bg-[#1a1a1a] p-4 lite:border-zinc-200 lite:bg-white">
            <div class="mb-3 text-sm font-medium text-white lite:text-zinc-900">Most re-used clips (all time)</div>
            @for (c of s.topClips; track c.id) {
              <div class="mb-3 border-b border-white/5 pb-2 last:border-0 lite:border-zinc-100">
                <div class="mb-1 flex justify-between text-xs">
                  <span class="text-zinc-500">{{ c.type }} · {{ c.use_count }}×</span>
                </div>
                <div class="line-clamp-2 font-mono text-[11px] text-zinc-400">{{ c.preview || '(empty)' }}</div>
              </div>
            } @empty {
              <p class="text-xs text-zinc-500">No clips yet.</p>
            }
          </div>

          <div class="rounded-xl border border-white/10 bg-[#1a1a1a] p-4 lite:border-zinc-200 lite:bg-white">
            <div class="mb-3 text-sm font-medium text-white lite:text-zinc-900">Snippets by paste count</div>
            <p class="mb-2 text-[10px] text-zinc-600">Counted when you copy from the Snippets panel.</p>
            @for (sn of s.topSnippets; track sn.id) {
              <div class="mb-2">
                <div class="mb-1 flex justify-between text-xs">
                  <span class="truncate text-zinc-300 lite:text-zinc-800">{{ sn.title }}</span>
                  <span class="shrink-0 text-zinc-500">{{ sn.use_count }} pastes</span>
                </div>
                <div class="h-1.5 overflow-hidden rounded-full bg-zinc-800 lite:bg-zinc-200">
                  <div
                    class="h-full rounded-full bg-fuchsia-500/60"
                    [style.width.%]="snippetPct(sn.use_count)"
                  ></div>
                </div>
              </div>
            } @empty {
              <p class="text-xs text-zinc-500">No snippets yet.</p>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class InsightsPanelComponent implements OnInit {
  period: PeriodPreset = '30d';

  readonly loading = signal(false);
  readonly error = signal('');
  readonly data = signal<Summary | null>(null);

  readonly maxLast7 = computed(() => {
    const s = this.data();
    if (!s?.last7Days?.length) return 1;
    return Math.max(1, ...s.last7Days.map((d) => d.count));
  });

  readonly maxHour = computed(() => {
    const s = this.data();
    if (!s?.hourCounts?.length) return 1;
    return Math.max(1, ...s.hourCounts.map((h) => h.count));
  });

  readonly maxTypeCount = computed(() => {
    const s = this.data();
    if (!s?.types?.length) return 1;
    return Math.max(1, ...s.types.map((t) => t.count));
  });

  readonly maxSourceCount = computed(() => {
    const s = this.data();
    if (!s?.topSources?.length) return 1;
    return Math.max(1, ...s.topSources.map((t) => t.count));
  });

  readonly maxSnippetUse = computed(() => {
    const s = this.data();
    if (!s?.topSnippets?.length) return 1;
    return Math.max(1, ...s.topSnippets.map((t) => t.use_count));
  });

  readonly hours24 = computed(() => {
    const s = this.data();
    const map = new Map<number, number>();
    if (s) {
      for (const h of s.hourCounts) {
        map.set(h.hour, h.count);
      }
    }
    const out: { hour: number; count: number }[] = [];
    for (let hour = 0; hour < 24; hour++) {
      out.push({ hour, count: map.get(hour) ?? 0 });
    }
    return out;
  });

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.error.set('');
    this.loading.set(true);
    try {
      const { start, end } = this.computeRange(this.period);
      const raw = await window.devclip.getInsightsSummary(start, end);
      this.data.set(raw);
    } catch {
      this.error.set('Could not load insights.');
      this.data.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  reuseLabel(): string {
    const s = this.data();
    if (!s || s.captures <= 0) return '—';
    return s.avgUseCountCaptured.toFixed(2);
  }

  productivityScore(): string {
    const s = this.data();
    if (!s) return '—';
    const score = Math.min(
      100,
      Math.round(s.captures * 0.4 + s.sumUseCountCaptured * 0.15 + s.snippetCount * 2)
    );
    return String(score);
  }

  barPct(value: number, max: number): number {
    if (max <= 0) return 2;
    const v = Number(value) || 0;
    return Math.max(4, Math.round((v / max) * 100));
  }

  typePct(count: number): number {
    const m = this.maxTypeCount();
    if (m <= 0) return 0;
    return Math.min(100, Math.round(((Number(count) || 0) / m) * 100));
  }

  sourcePct(count: number): number {
    const m = this.maxSourceCount();
    if (m <= 0) return 0;
    return Math.min(100, Math.round(((Number(count) || 0) / m) * 100));
  }

  snippetPct(use: number): number {
    const m = this.maxSnippetUse();
    if (m <= 0) return 0;
    return Math.min(100, Math.round(((Number(use) || 0) / m) * 100));
  }

  shortDay(ymd: string): string {
    const p = ymd.split('-');
    return p.length === 3 ? `${p[1]}/${p[2]}` : ymd;
  }

  private computeRange(p: PeriodPreset): { start: number; end: number } {
    const now = new Date();
    const end = Math.floor(now.getTime() / 1000);
    if (p === 'month') {
      const y = now.getFullYear();
      const mo = now.getMonth();
      const startMs = new Date(y, mo, 1, 0, 0, 0, 0).getTime();
      const endMs = new Date(y, mo + 1, 0, 23, 59, 59, 999).getTime();
      return { start: Math.floor(startMs / 1000), end: Math.floor(endMs / 1000) };
    }
    const days = p === '7d' ? 7 : p === '30d' ? 30 : 90;
    return { start: end - days * 86400, end };
  }
}
