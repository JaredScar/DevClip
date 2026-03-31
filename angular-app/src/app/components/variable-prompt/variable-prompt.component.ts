import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-variable-prompt',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (keys.length) {
      <div class="rounded-lg border border-white/10 bg-black/40 p-3">
        <div class="mb-2 text-xs font-semibold text-zinc-400">Fill variables</div>
        @for (k of keys; track k) {
          <label class="mb-2 block text-[11px] text-zinc-500">
            {{ k }}
            <input
              class="mt-1 w-full rounded border border-white/10 bg-[#2a2a2a] px-2 py-1 text-sm text-white"
              [(ngModel)]="values[k]"
            />
          </label>
        }
        <div class="mt-2 flex gap-2">
          <button
            type="button"
            class="rounded-md bg-devclip-accent px-3 py-1.5 text-xs font-semibold text-black"
            (click)="apply.emit(values)"
          >
            Apply &amp; copy
          </button>
          <button
            type="button"
            class="rounded-md border border-white/10 px-3 py-1.5 text-xs text-zinc-400"
            (click)="cancel.emit()"
          >
            Cancel
          </button>
        </div>
      </div>
    }
  `,
})
export class VariablePromptComponent implements OnChanges {
  @Input() keys: string[] = [];
  @Input() values: Record<string, string> = {};
  @Output() apply = new EventEmitter<Record<string, string>>();
  @Output() cancel = new EventEmitter<void>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['keys'] && this.keys.length) {
      this.values = Object.fromEntries(this.keys.map((k) => [k, this.values[k] ?? '']));
    }
  }
}
