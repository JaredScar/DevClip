import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OverlayStore } from '../../store/overlay.store';
import { SnippetsStore } from '../../store/snippets.store';
import { extractVariablesFromContent, SnippetService } from '../../services/snippet.service';
import type { Snippet } from '../../models/snippet.model';
import { SnippetEditorComponent } from '../snippet-editor/snippet-editor.component';
import { VariablePromptComponent } from '../variable-prompt/variable-prompt.component';

@Component({
  selector: 'app-snippets-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, SnippetEditorComponent, VariablePromptComponent],
  template: `
    <div class="flex flex-col gap-2">
      <div class="flex flex-wrap gap-2">
        <input
          class="min-w-0 flex-1 rounded-full border border-white/10 bg-[#2a2a2a] px-3 py-2 text-sm text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
          placeholder="Search snippets…"
          [(ngModel)]="q"
          (ngModelChange)="onSearch($event)"
        />
        <button
          type="button"
          class="shrink-0 rounded-full bg-devclip-accent px-3 py-2 text-xs font-semibold text-black"
          (click)="startNew()"
        >
          New
        </button>
        <button
          type="button"
          class="shrink-0 rounded-full border border-white/20 px-3 py-2 text-xs text-zinc-300 lite:border-zinc-300 lite:text-zinc-800"
          (click)="exportSnippets()"
        >
          Export JSON
        </button>
        <button
          type="button"
          class="shrink-0 rounded-full border border-white/20 px-3 py-2 text-xs text-zinc-300 lite:border-zinc-300 lite:text-zinc-800"
          (click)="fileInput.click()"
        >
          Import JSON
        </button>
        <input #fileInput type="file" accept="application/json,.json" class="hidden" (change)="onImportFile($event)" />
      </div>

      @if (overlay.snippetEditorOpen()) {
        <app-snippet-editor
          [editingId]="editingId"
          [snippet]="editingSnippet"
          (save)="onSave($event)"
          (close)="closeEditor()"
        />
      }

      @if (promptKeys.length) {
        <app-variable-prompt
          [keys]="promptKeys"
          [values]="promptValues"
          (apply)="onVariableApply($event)"
          (cancel)="cancelPrompt()"
        />
      }

      <div
        class="devclip-scroll max-h-[min(50vh,360px)] overflow-y-auto rounded-xl border border-white/5 bg-black/20"
      >
        @if (store.snippets().length === 0) {
          <div class="px-4 py-6 text-center text-sm text-zinc-500">No snippets yet.</div>
        }
        @for (s of store.snippets(); track s.id; let i = $index) {
          <div
            class="flex cursor-pointer gap-2 border-b border-white/5 px-3 py-2 text-sm"
            [ngClass]="{ 'bg-white/5': store.selectedIndex() === i }"
            (click)="store.selectedIndex.set(i)"
            (dblclick)="pasteSnippet(s)"
          >
            <div class="min-w-0 flex-1">
              <div class="truncate font-medium text-white lite:text-zinc-900">{{ s.title }}</div>
              @if (s.category || s.shortcode) {
                <div class="truncate text-[10px] text-zinc-500 lite:text-zinc-600">
                  @if (s.category) {
                    <span class="mr-2 rounded bg-white/10 px-1 py-0.5 lite:bg-zinc-200">{{ s.category }}</span>
                  }
                  @if (s.shortcode) {
                    <span class="font-mono text-devclip-accent">:{{ s.shortcode }}</span>
                  }
                </div>
              }
              <div class="truncate font-mono text-[11px] text-zinc-500 lite:text-zinc-600">{{ s.content }}</div>
            </div>
            <div class="flex shrink-0 flex-col gap-1">
              <button
                type="button"
                class="text-[10px] text-zinc-500 hover:text-white"
                (click)="edit(s); $event.stopPropagation()"
              >
                Edit
              </button>
              <button
                type="button"
                class="text-[10px] text-zinc-500 hover:text-devclip-accent"
                (click)="togglePin(s.id); $event.stopPropagation()"
              >
                Pin
              </button>
              <button
                type="button"
                class="text-[10px] text-red-400 hover:text-red-300"
                (click)="remove(s.id); $event.stopPropagation()"
              >
                Del
              </button>
            </div>
          </div>
        }
      </div>
      <p class="text-[10px] text-zinc-600">Double-click a snippet to copy. Variables open a prompt.</p>
    </div>
  `,
})
export class SnippetsPanelComponent implements OnInit {
  readonly store = inject(SnippetsStore);
  readonly overlay = inject(OverlayStore);
  private readonly snippets = inject(SnippetService);

  q = '';
  editingId: number | null = null;
  editingSnippet: Snippet | null = null;
  promptKeys: string[] = [];
  promptValues: Record<string, string> = {};
  private promptSnippet: Snippet | null = null;

  async ngOnInit() {
    await this.snippets.loadAll();
  }

  onSearch(value: string) {
    void this.snippets.search(value);
  }

  startNew() {
    this.editingId = null;
    this.editingSnippet = null;
    this.overlay.snippetEditorOpen.set(true);
  }

  edit(s: Snippet) {
    this.editingId = s.id;
    this.editingSnippet = s;
    this.overlay.snippetEditorOpen.set(true);
  }

  closeEditor() {
    this.overlay.snippetEditorOpen.set(false);
    this.editingId = null;
    this.editingSnippet = null;
  }

  async onSave(payload: {
    title: string;
    content: string;
    tags: string[];
    category: string;
    shortcode: string | null;
  }) {
    if (this.editingId != null) {
      await this.snippets.update(this.editingId, payload);
    } else {
      await this.snippets.saveNew(payload);
    }
    this.closeEditor();
  }

  async exportSnippets() {
    const json = await window.devclip.exportSnippetsJson();
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `devclip-snippets-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async onImportFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const text = await file.text();
    const res = await window.devclip.importSnippetsJson(text);
    await this.snippets.loadAll();
    if (res.errors.length) {
      console.warn('Snippet import warnings', res.errors);
    }
  }

  async togglePin(id: number) {
    await this.snippets.togglePin(id);
  }

  async remove(id: number) {
    await this.snippets.remove(id);
  }

  pasteSnippet(s: Snippet) {
    const vars =
      s.variables.length > 0 ? s.variables : extractVariablesFromContent(s.content);
    if (vars.length === 0) {
      void window.devclip.copyToClipboard(s.content).then(() => {
        void window.devclip.incrementSnippetUse(s.id);
      });
      return;
    }
    this.promptSnippet = s;
    this.promptKeys = vars;
    this.promptValues = Object.fromEntries(vars.map((k) => [k, '']));
  }

  async onVariableApply(values: Record<string, string>) {
    if (!this.promptSnippet) return;
    const out = this.snippets.applyVariables(this.promptSnippet.content, values);
    const id = this.promptSnippet.id;
    await window.devclip.copyToClipboard(out);
    void window.devclip.incrementSnippetUse(id);
    this.cancelPrompt();
  }

  cancelPrompt() {
    this.promptKeys = [];
    this.promptValues = {};
    this.promptSnippet = null;
  }
}
