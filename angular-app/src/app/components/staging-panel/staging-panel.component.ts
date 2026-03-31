import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StagingStore } from '../../store/staging.store';
import { StagingService, type StagingPreset } from '../../services/staging.service';

@Component({
  selector: 'app-staging-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex flex-col gap-2">
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-full bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20 lite:bg-zinc-200 lite:text-zinc-900 lite:hover:bg-zinc-300"
          (click)="pasteAll()"
        >
          Paste all (joined)
        </button>
        <button
          type="button"
          class="rounded-full bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20 lite:bg-zinc-200 lite:text-zinc-900 lite:hover:bg-zinc-300"
          (click)="pasteNext()"
        >
          Paste next
        </button>
        <button
          type="button"
          class="rounded-full border border-red-500/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
          (click)="staging.clear()"
        >
          Clear
        </button>
      </div>

      <div
        class="rounded-lg border border-white/10 p-2 text-xs lite:border-zinc-200"
      >
        <div class="mb-1 font-semibold text-zinc-400 lite:text-zinc-600">Named presets</div>
        <div class="flex flex-wrap items-center gap-2">
          <input
            class="min-w-[8rem] flex-1 rounded border border-white/10 bg-[#2a2a2a] px-2 py-1 text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
            placeholder="Preset name"
            [(ngModel)]="presetName"
          />
          <button
            type="button"
            class="rounded-full bg-devclip-accent px-3 py-1 font-semibold text-black"
            (click)="savePreset()"
          >
            Save queue
          </button>
        </div>
        @if (presets.length) {
          <div class="mt-2 flex flex-wrap gap-2">
            @for (p of presets; track p.name) {
              <div class="flex items-center gap-1 rounded-full bg-white/5 pl-2 lite:bg-zinc-200">
                <button
                  type="button"
                  class="py-1 text-[11px] text-devclip-accent"
                  (click)="loadPreset(p.name)"
                >
                  {{ p.name }}
                </button>
                <button
                  type="button"
                  class="px-2 py-1 text-[10px] text-zinc-500 hover:text-red-400"
                  (click)="removePreset(p.name)"
                >
                  ×
                </button>
              </div>
            }
          </div>
        }
      </div>

      <div
        class="devclip-scroll max-h-[min(50vh,360px)] overflow-y-auto rounded-xl border border-white/5 bg-black/20 lite:border-zinc-200 lite:bg-zinc-50"
      >
        @if (staging.staged().length === 0) {
          <div class="px-4 py-6 text-center text-sm text-zinc-500 lite:text-zinc-600">
            Staging is empty. Press S on a clip in History.
          </div>
        }
        @for (c of staging.staged(); track c.id; let i = $index) {
          <div class="flex items-start gap-2 border-b border-white/5 px-3 py-2 text-sm lite:border-zinc-200">
            <div class="min-w-0 flex-1 font-mono text-[11px] text-zinc-300 lite:text-zinc-800">
              <span class="text-[10px] text-zinc-600 lite:text-zinc-500">#{{ i + 1 }}</span>
              {{ (c.content | slice: 0 : 120) }}{{ c.content.length > 120 ? '…' : '' }}
            </div>
            <div class="flex shrink-0 flex-col gap-1">
              <button type="button" class="text-[10px] text-zinc-500" (click)="svc.moveUp(i)">Up</button>
              <button type="button" class="text-[10px] text-zinc-500" (click)="svc.moveDown(i)">Down</button>
              <button type="button" class="text-[10px] text-red-400" (click)="staging.remove(c.id)">Remove</button>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class StagingPanelComponent implements OnInit {
  readonly staging = inject(StagingStore);
  readonly svc = inject(StagingService);

  presets: StagingPreset[] = [];
  presetName = '';

  async ngOnInit() {
    await this.refreshPresets();
  }

  async refreshPresets() {
    this.presets = await this.svc.listPresets();
  }

  async pasteAll() {
    await this.svc.pasteAll();
  }

  async pasteNext() {
    await this.svc.pasteNext();
  }

  async savePreset() {
    await this.svc.saveCurrentAsPreset(this.presetName);
    this.presetName = '';
    await this.refreshPresets();
  }

  async loadPreset(name: string) {
    await this.svc.loadPreset(name);
  }

  async removePreset(name: string) {
    await this.svc.deletePreset(name);
    await this.refreshPresets();
  }
}
