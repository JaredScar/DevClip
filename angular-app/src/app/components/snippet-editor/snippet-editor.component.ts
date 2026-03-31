import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Snippet } from '../../models/snippet.model';
import { extractVariablesFromContent } from '../../services/snippet.service';

@Component({
  selector: 'app-snippet-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="rounded-lg border border-white/10 bg-black/30 p-3">
      <div class="mb-2 flex items-center justify-between gap-2">
        <span class="text-sm font-semibold text-white">{{ editingId ? 'Edit snippet' : 'New snippet' }}</span>
        <button type="button" class="text-xs text-zinc-500 hover:text-white" (click)="close.emit()">Close</button>
      </div>
      <input
        class="mb-2 w-full rounded border border-white/10 bg-[#2a2a2a] px-2 py-1.5 text-sm text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
        placeholder="Title"
        [(ngModel)]="title"
      />
      <div class="mb-2 grid grid-cols-2 gap-2">
        <input
          class="w-full rounded border border-white/10 bg-[#2a2a2a] px-2 py-1.5 text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
          placeholder="Category / folder"
          [(ngModel)]="category"
        />
        <input
          class="w-full rounded border border-white/10 bg-[#2a2a2a] px-2 py-1.5 font-mono text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
          placeholder="Shortcode (e.g. api-key)"
          [(ngModel)]="shortcode"
        />
      </div>
      <textarea
        class="mb-2 min-h-[120px] w-full rounded border border-white/10 bg-[#2a2a2a] px-2 py-1.5 font-mono text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
        [attr.placeholder]="contentPlaceholder"
        [(ngModel)]="content"
        (ngModelChange)="onContentChange()"
      ></textarea>
      <input
        class="mb-2 w-full rounded border border-white/10 bg-[#2a2a2a] px-2 py-1.5 text-sm text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
        placeholder="Tags (comma-separated)"
        [(ngModel)]="tagsRaw"
      />
      @if (detectedVars.length) {
        <p class="mb-2 text-[10px] text-zinc-500">Variables: {{ detectedVars.join(', ') }}</p>
      }
      <button
        type="button"
        class="rounded-md bg-devclip-accent px-3 py-1.5 text-xs font-semibold text-black"
        (click)="
          save.emit({
            title,
            content,
            tags: parseTags(tagsRaw),
            category: category.trim(),
            shortcode: shortcode.trim() || null,
          })
        "
      >
        Save
      </button>
    </div>
  `,
})
export class SnippetEditorComponent implements OnChanges {
  readonly contentPlaceholder = 'Content — use {{variable_name}} for placeholders';

  @Input() editingId: number | null = null;
  @Input() snippet: Snippet | null = null;
  @Output() save = new EventEmitter<{
    title: string;
    content: string;
    tags: string[];
    category: string;
    shortcode: string | null;
  }>();
  @Output() close = new EventEmitter<void>();

  title = '';
  content = '';
  category = '';
  shortcode = '';
  tagsRaw = '';
  detectedVars: string[] = [];

  ngOnChanges(_changes: SimpleChanges): void {
    if (this.snippet) {
      this.title = this.snippet.title;
      this.content = this.snippet.content;
      this.category = this.snippet.category ?? '';
      this.shortcode = this.snippet.shortcode ?? '';
      this.tagsRaw = this.snippet.tags.join(', ');
      this.detectedVars = this.snippet.variables.length
        ? this.snippet.variables
        : extractVariablesFromContent(this.snippet.content);
    } else {
      this.title = '';
      this.content = '';
      this.category = '';
      this.shortcode = '';
      this.tagsRaw = '';
      this.detectedVars = [];
    }
  }

  onContentChange() {
    this.detectedVars = extractVariablesFromContent(this.content);
  }

  parseTags(raw: string): string[] {
    return raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }
}
