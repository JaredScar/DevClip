import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClipService } from '../../services/clip.service';
import { ClipsStore } from '../../store/clips.store';
import { MainStore } from '../../store/main.store';
import { FeatureFlagService } from '../../services/feature-flag.service';

type PeriodPreset = '7d' | '30d' | '90d' | 'month';

@Component({
  selector: 'app-timeline-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="relative flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-1">
      @if (!flags.isProUnlocked()) {
        <div class="absolute inset-0 z-20 flex flex-col gap-3 bg-black/40 p-4 text-xs backdrop-blur lite:bg-zinc-100/20">
          <div class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200 lite:border-amber-400/40 lite:bg-amber-100 lite:text-amber-900">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-lg">📅</span>
              <h2 class="text-sm font-semibold">Timeline</h2>
              <span class="rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-300">PRO</span>
            </div>
            <p class="mt-2">Unlock Pro to view clipboard activity timeline and jump filters into History.</p>
            <div class="mt-2 flex flex-wrap gap-1.5">
              @for (a of lockedActions; track a) {
                <button
                  type="button"
                  class="cursor-not-allowed rounded-lg bg-white/10 px-2 py-1.5 text-[10px] font-semibold text-zinc-200"
                  disabled
                >
                  {{ a }}
                </button>
              }
            </div>
            <p class="mt-2">No interaction is allowed until Pro is unlocked.</p>
          </div>
        </div>
      }
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-sm font-semibold text-white lite:text-zinc-900">Timeline</h2>
        <span class="rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-300">
          PRO
        </span>
        <select
          class="ml-auto rounded-lg border border-white/10 bg-[#2a2a2a] px-2 py-1.5 text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
          [(ngModel)]="period"
          (ngModelChange)="onPeriodChange()"
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
        <p class="text-sm text-zinc-500">Loading activity…</p>
      } @else if (rows().length === 0) {
        <p class="text-sm text-zinc-500">
          No clipboard captures in this range. Copy something or widen the period.
        </p>
      } @else {
        <div class="rounded-xl border border-white/10 bg-[#141414] p-3 text-xs text-zinc-400 lite:border-zinc-200 lite:bg-zinc-50 lite:text-zinc-600">
          <span class="text-zinc-300 lite:text-zinc-800">{{ totalClips() }}</span> captures across
          <span class="text-zinc-300 lite:text-zinc-800">{{ activeDays() }}</span> active days · peak
          <span class="text-zinc-300 lite:text-zinc-800">{{ peakLabel() }}</span>
        </div>

        <div>
          <div class="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Volume by day
          </div>
          <div class="flex h-28 items-end gap-px overflow-x-auto rounded-lg border border-white/10 bg-black/20 p-2 lite:border-zinc-200 lite:bg-zinc-100">
            @for (r of rows(); track r.day) {
              <button
                type="button"
                class="group flex min-w-[10px] flex-1 flex-col items-center justify-end gap-1"
                [title]="r.day + ': ' + r.count + ' clips'"
                (click)="jumpToDay(r.day)"
              >
                <div
                  class="w-full min-h-[2px] rounded-t bg-emerald-500/90 transition group-hover:bg-devclip-accent"
                  [style.height.%]="barHeightPercent(r.count)"
                ></div>
              </button>
            }
          </div>
          <p class="mt-1 text-[10px] text-zinc-600">Click a bar to open History filtered to that day.</p>
        </div>

        <div>
          <div class="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Heatmap (oldest → newest, 7 columns per row)
          </div>
          <div class="flex flex-wrap gap-1">
            @for (c of heatmapCells(); track c.day) {
              <div
                class="h-3 w-3 shrink-0 rounded-sm transition hover:ring-1 hover:ring-devclip-accent"
                [ngClass]="heatmapClass(c.count)"
                [title]="c.day + (c.count ? ': ' + c.count : ': 0')"
              ></div>
            }
          </div>
        </div>

        <div>
          <div class="mb-2 flex items-center justify-between">
            <span class="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">By date</span>
            <button
              type="button"
              class="text-[10px] text-devclip-accent hover:underline"
              (click)="jumpToRange()"
            >
              Show full range in History
            </button>
          </div>
          <div class="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-white/10 lite:border-zinc-200">
            @for (r of rowsReversed(); track r.day) {
              <div
                class="flex items-center justify-between gap-2 border-b border-white/5 px-2 py-1.5 text-xs last:border-0 lite:border-zinc-100"
              >
                <span class="font-mono text-zinc-300 lite:text-zinc-800">{{ r.day }}</span>
                <span class="text-zinc-500">{{ r.count }}</span>
                <button
                  type="button"
                  class="shrink-0 text-[10px] text-devclip-accent hover:underline"
                  (click)="jumpToDay(r.day)"
                >
                  History
                </button>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class TimelinePanelComponent implements OnInit {
  private readonly clipsStore = inject(ClipsStore);
  private readonly main = inject(MainStore);
  private readonly clipSvc = inject(ClipService);
  readonly flags = inject(FeatureFlagService);

  readonly lockedActions: string[] = ['Volume by day', 'Heatmap activity', 'History jumps'];

  period: PeriodPreset = '30d';

  readonly loading = signal(false);
  readonly error = signal('');
  readonly rows = signal<{ day: string; count: number }[]>([]);
  readonly rangeStart = signal(0);
  readonly rangeEnd = signal(0);

  readonly totalClips = computed(() => this.rows().reduce((s, r) => s + r.count, 0));

  readonly activeDays = computed(() => this.rows().length);

  readonly peakLabel = computed(() => {
    const rs = this.rows();
    if (!rs.length) return '—';
    let best = rs[0]!;
    for (const r of rs) {
      if (r.count > best.count) best = r;
    }
    return `${best.day} (${best.count})`;
  });

  readonly maxCount = computed(() => {
    const rs = this.rows();
    if (!rs.length) return 0;
    return Math.max(...rs.map((r) => r.count));
  });

  readonly rowsReversed = computed(() => [...this.rows()].reverse());

  /** Fill every calendar day in range for heatmap (0 = no clips). */
  readonly heatmapCells = computed(() => {
    const start = this.rangeStart();
    const end = this.rangeEnd();
    const map = new Map(this.rows().map((r) => [r.day, r.count]));
    const out: { day: string; count: number }[] = [];
    const d = new Date(start * 1000);
    d.setHours(0, 0, 0, 0);
    const endMs = end * 1000;
    while (d.getTime() <= endMs) {
      const key = this.toYmd(d);
      out.push({ day: key, count: map.get(key) ?? 0 });
      d.setDate(d.getDate() + 1);
    }
    return out;
  });

  ngOnInit(): void {
    void this.reload();
  }

  onPeriodChange(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.error.set('');
    this.loading.set(true);
    try {
      const { start, end } = this.computeRange(this.period);
      this.rangeStart.set(start);
      this.rangeEnd.set(end);
      const data = (await window.devclip.getClipActivityByDay(start, end)) as {
        day: string;
        count: number;
      }[];
      this.rows.set(
        data.map((r) => ({
          day: String(r.day),
          count: Number(r.count) || 0,
        }))
      );
    } catch {
      this.error.set('Could not load activity.');
      this.rows.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  barHeightPercent(count: number): number {
    const m = this.maxCount();
    if (m <= 0 || count <= 0) return 2;
    return Math.max(6, Math.round((count / m) * 100));
  }

  heatmapClass(count: number): string {
    const m = this.maxCount();
    if (count <= 0 || m <= 0) return 'bg-zinc-800 lite:bg-zinc-200';
    const r = count / m;
    if (r < 0.2) return 'bg-emerald-900/70 lite:bg-emerald-200';
    if (r < 0.4) return 'bg-emerald-700/80 lite:bg-emerald-300';
    if (r < 0.7) return 'bg-emerald-500/85 lite:bg-emerald-400';
    return 'bg-devclip-accent';
  }

  jumpToDay(dayYmd: string): void {
    const from = Math.floor(new Date(dayYmd + 'T00:00:00').getTime() / 1000);
    const to = Math.floor(new Date(dayYmd + 'T23:59:59').getTime() / 1000);
    this.applyHistoryFilter(from, to);
  }

  jumpToRange(): void {
    this.applyHistoryFilter(this.rangeStart(), this.rangeEnd());
  }

  private applyHistoryFilter(from: number, to: number): void {
    this.clipsStore.clearTagFilters();
    this.clipsStore.sourceAppFilter.set('');
    this.clipsStore.setSearchQuery('');
    this.clipsStore.dateFrom.set(from);
    this.clipsStore.dateTo.set(to);
    this.main.setTab('history');
    void this.clipSvc.refreshSearch('');
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

  private toYmd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
