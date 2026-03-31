import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Clip } from '../../models/clip.model';
import type { ClipAction } from '../../models/action.model';
import { ActionService } from '../../services/action.service';

@Component({
  selector: 'app-actions-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (open && clip) {
      <div class="mt-3 rounded-lg border border-devclip-accent/30 bg-black/50 p-3">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-xs font-semibold text-devclip-accent">Actions</span>
          <button type="button" class="text-[10px] text-zinc-500" (click)="close.emit()">Close</button>
        </div>
        <div class="mb-2 flex flex-wrap gap-1">
          @for (a of actions; track a.id) {
            <button
              type="button"
              class="rounded-full border px-2 py-0.5 text-[10px]"
              [ngClass]="{
                'border-devclip-accent bg-emerald-500/20': selected?.id === a.id,
                'border-white/10': selected?.id !== a.id
              }"
              (click)="select(a)"
            >
              {{ a.name }}
            </button>
          }
        </div>
        @if (selected?.id === 'regex-replace') {
          <div class="mb-2 flex gap-2">
            <input
              class="min-w-0 flex-1 rounded border border-white/10 bg-[#2a2a2a] px-2 py-1 text-[11px] text-white"
              placeholder="Regex"
              [(ngModel)]="findPattern"
              (ngModelChange)="runPreview()"
            />
            <input
              class="min-w-0 flex-1 rounded border border-white/10 bg-[#2a2a2a] px-2 py-1 text-[11px] text-white"
              placeholder="Replace"
              [(ngModel)]="replaceWith"
              (ngModelChange)="runPreview()"
            />
          </div>
        }
        <textarea
          readonly
          class="mb-2 h-28 w-full rounded border border-white/10 bg-black/40 p-2 font-mono text-[11px] text-zinc-200"
          [value]="preview"
        ></textarea>
        <button
          type="button"
          class="rounded-md bg-devclip-accent px-3 py-1.5 text-xs font-semibold text-black"
          (click)="runApply()"
        >
          Apply &amp; copy
        </button>
      </div>
    }
  `,
})
export class ActionsPanelComponent implements OnChanges {
  private readonly actionSvc = inject(ActionService);

  @Input() open = false;
  @Input() clip: Clip | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() applied = new EventEmitter<string>();

  actions: ClipAction[] = [];
  selected: ClipAction | null = null;
  preview = '';
  findPattern = '';
  replaceWith = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['clip'] || changes['open']) {
      if (this.clip && this.open) {
        this.actions = this.actionSvc.forType(this.clip.type);
        this.selected = this.actions[0] ?? null;
        this.runPreview();
      }
    }
  }

  runPreview(): void {
    if (!this.clip || !this.selected) {
      this.preview = '';
      return;
    }
    try {
      const extra =
        this.selected.id === 'regex-replace'
          ? { find: this.findPattern, replace: this.replaceWith }
          : undefined;
      const out = this.selected.run(this.clip.content, extra);
      if (typeof out === 'string') {
        this.preview = out;
      } else {
        void out.then((t) => (this.preview = t)).catch(() => (this.preview = '(error)'));
      }
    } catch {
      this.preview = '(error)';
    }
  }

  select(a: ClipAction) {
    this.selected = a;
    this.runPreview();
  }

  runApply() {
    if (!this.clip || !this.selected) return;
    try {
      const extra =
        this.selected.id === 'regex-replace'
          ? { find: this.findPattern, replace: this.replaceWith }
          : undefined;
      const out = this.selected.run(this.clip.content, extra);
      if (typeof out === 'string') {
        this.applied.emit(out);
      } else {
        void out.then((t) => this.applied.emit(t));
      }
    } catch {
      /* ignore */
    }
  }
}
