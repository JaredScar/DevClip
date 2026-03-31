import { CommonModule } from '@angular/common';
import { Component, OnInit, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { FilterTab } from '../../models/clip.model';
import { ClipService } from '../../services/clip.service';
import { ClipsStore } from '../../store/clips.store';

@Component({
  selector: 'app-filter-tabs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="mt-3 flex flex-wrap gap-2">
      @for (tab of tabs; track tab.id) {
        <button
          type="button"
          class="rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-150"
          [class.bg-devclip-accent]="store.activeFilter() === tab.id"
          [class.text-black]="store.activeFilter() === tab.id"
          [class.text-zinc-500]="store.activeFilter() !== tab.id"
          [class.hover:text-zinc-300]="store.activeFilter() !== tab.id"
          (click)="select(tab.id)"
        >
          {{ tab.label }}
        </button>
      }
    </div>
    <div class="mt-2 flex flex-wrap gap-2 text-[11px]">
      <input
        class="min-w-[120px] flex-1 rounded-full border border-white/10 bg-[#2a2a2a] px-3 py-1.5 text-zinc-200"
        placeholder="Filter by source app…"
        [(ngModel)]="sourceApp"
        (ngModelChange)="onSourceChange($event)"
      />
      <input
        class="rounded-full border border-white/10 bg-[#2a2a2a] px-2 py-1.5 text-zinc-200"
        type="date"
        [(ngModel)]="dateFromStr"
        (ngModelChange)="onDateChange()"
      />
      <input
        class="rounded-full border border-white/10 bg-[#2a2a2a] px-2 py-1.5 text-zinc-200"
        type="date"
        [(ngModel)]="dateToStr"
        (ngModelChange)="onDateChange()"
      />
      <button
        type="button"
        class="rounded-full border border-white/10 px-2 py-1 text-zinc-500 hover:text-white"
        (click)="clearAdvanced()"
      >
        Clear filters
      </button>
    </div>
    @if (allTags.length) {
      <div class="mt-2 flex flex-wrap gap-1">
        @for (t of allTags; track t.id) {
          <button
            type="button"
            class="rounded-full px-2 py-0.5 text-[10px]"
            [ngClass]="
              isTagActive(t.name)
                ? 'bg-devclip-accent text-black'
                : 'bg-white/5 text-zinc-500'
            "
            (click)="toggleTag(t.name)"
          >
            {{ t.name }}
          </button>
        }
      </div>
    }
  `,
})
export class FilterTabsComponent implements OnInit {
  readonly tabs: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'sql', label: 'SQL' },
    { id: 'json', label: 'JSON' },
    { id: 'url', label: 'URL' },
    { id: 'code', label: 'Code' },
    { id: 'text', label: 'Text' },
    { id: 'email', label: 'Email' },
    { id: 'stack-trace', label: 'Trace' },
    { id: 'secret', label: 'Secret' },
    { id: 'image', label: 'Image' },
    { id: 'file-path', label: 'Path' },
  ];

  allTags: { id: number; name: string }[] = [];
  sourceApp = '';
  dateFromStr = '';
  dateToStr = '';

  constructor(
    readonly store: ClipsStore,
    private readonly clips: ClipService
  ) {
    effect(() => {
      const df = this.store.dateFrom();
      const dt = this.store.dateTo();
      this.dateFromStr = df != null ? this.unixToYmd(df) : '';
      this.dateToStr = dt != null ? this.unixToYmd(dt) : '';
    });
  }

  private unixToYmd(sec: number): string {
    const d = new Date(sec * 1000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  async ngOnInit() {
    await this.loadTags();
  }

  async loadTags() {
    try {
      this.allTags = await window.devclip.listTags();
    } catch {
      this.allTags = [];
    }
  }

  isTagActive(name: string): boolean {
    return this.store
      .selectedTags()
      .some((t) => t.toLowerCase() === name.toLowerCase());
  }

  toggleTag(name: string) {
    this.store.toggleTagFilter(name);
    void this.clips.refreshSearch(this.store.searchQuery());
  }

  onSourceChange(v: string) {
    this.store.sourceAppFilter.set(v);
    void this.clips.refreshSearch(this.store.searchQuery());
  }

  onDateChange() {
    this.store.dateFrom.set(this.toStartOfDayUnix(this.dateFromStr));
    this.store.dateTo.set(this.toEndOfDayUnix(this.dateToStr));
    void this.clips.refreshSearch(this.store.searchQuery());
  }

  clearAdvanced() {
    this.sourceApp = '';
    this.dateFromStr = '';
    this.dateToStr = '';
    this.store.sourceAppFilter.set('');
    this.store.dateFrom.set(null);
    this.store.dateTo.set(null);
    this.store.clearTagFilters();
    void this.clips.refreshSearch(this.store.searchQuery());
  }

  private toStartOfDayUnix(s: string): number | null {
    if (!s?.trim()) return null;
    const d = new Date(s + 'T00:00:00');
    return Math.floor(d.getTime() / 1000);
  }

  private toEndOfDayUnix(s: string): number | null {
    if (!s?.trim()) return null;
    const d = new Date(s + 'T23:59:59');
    return Math.floor(d.getTime() / 1000);
  }

  select(tab: FilterTab) {
    this.store.setActiveFilter(tab);
    void this.clips.refreshSearch(this.store.searchQuery());
  }
}
