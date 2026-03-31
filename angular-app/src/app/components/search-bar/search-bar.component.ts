import { Component, ElementRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClipsStore } from '../../store/clips.store';
import { ClipboardService } from '../../services/clipboard.service';

@Component({
  selector: 'app-search-bar',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div
      class="flex items-center gap-3 rounded-full border border-white/10 bg-[#2a2a2a]/90 px-4 py-2.5 shadow-inner backdrop-blur"
    >
      <svg
        class="h-5 w-5 shrink-0 text-zinc-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z"
        />
      </svg>
      <input
        #searchInput
        class="min-w-0 flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 outline-none"
        type="search"
        placeholder="Search clips…"
        [ngModel]="store.searchQuery()"
        (ngModelChange)="onQuery($event)"
        autocomplete="off"
        spellcheck="false"
      />
      <span
        class="hidden shrink-0 rounded-md border border-white/10 bg-black/30 px-2 py-0.5 text-[10px] font-medium text-zinc-400 sm:inline"
        >⌘ K</span
      >
    </div>
  `,
})
export class SearchBarComponent {
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  constructor(
    readonly store: ClipsStore,
    private readonly clipboard: ClipboardService
  ) {}

  onQuery(value: string) {
    this.store.setSearchQuery(value);
    this.clipboard.notifySearchInput(value);
  }

  focusInput() {
    queueMicrotask(() => this.searchInput?.nativeElement.focus());
  }
}
