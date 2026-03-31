import { Component, inject } from '@angular/core';
import { ClipItemComponent } from '../clip-item/clip-item.component';
import { ClipsStore } from '../../store/clips.store';

@Component({
  selector: 'app-clip-list',
  standalone: true,
  imports: [ClipItemComponent],
  template: `
    <div
      class="devclip-scroll mt-2 max-h-[min(60vh,420px)] overflow-y-auto rounded-xl border border-white/5 bg-black/20"
    >
      @if (store.visibleClips().length === 0) {
        <div class="px-4 py-8 text-center text-sm text-zinc-500">No clips yet. Copy something to get started.</div>
      }
      @for (clip of store.visibleClips(); track clip.id; let i = $index) {
        @if (showSeparator(i)) {
          <div
            class="sticky top-0 z-10 border-b border-white/10 bg-[#141414]/95 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 backdrop-blur"
          >
            Unpinned
          </div>
        }
        <app-clip-item [clip]="clip" [itemIndex]="i" [selected]="store.selectedIndex() === i" />
      }
    </div>
  `,
})
export class ClipListComponent {
  readonly store = inject(ClipsStore);

  showSeparator(index: number): boolean {
    const rows = this.store.visibleClips();
    if (index === 0) return false;
    const prev = rows[index - 1];
    const cur = rows[index];
    return prev.is_pinned === 1 && cur.is_pinned === 0;
  }
}
