import { CommonModule } from '@angular/common';
import { Component, effect, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import type { Clip } from '../../models/clip.model';
import { ShikiService } from '../../services/shiki.service';
import { ClipService } from '../../services/clip.service';
import { FeatureFlagService } from '../../services/feature-flag.service';
import { StagingService } from '../../services/staging.service';
import { OverlayStore } from '../../store/overlay.store';
import { ClipsStore } from '../../store/clips.store';

@Component({
  selector: 'app-clip-item',
  standalone: true,
  imports: [CommonModule],
  host: { class: 'block' },
  template: `
    <div
      class="group relative flex gap-3 border-b border-white/5 px-3 py-3 transition-colors duration-150"
      [draggable]="flags.isProUnlocked()"
      (dragstart)="onDragStart($event)"
      [ngClass]="{
        'bg-white/5': selected(),
        'ring-1': selected(),
        'ring-devclip-accent': selected(),
        'border-l-4': clip().is_pinned,
        'border-l-devclip-accent': clip().is_pinned,
        'pl-2': clip().is_pinned
      }"
    >
      <div class="min-w-0 flex-1">
        <div class="mb-1 flex flex-wrap items-center gap-2 text-[11px]">
          <span [class]="badgeClass(clip().type)">{{ displayType(clip().type) }}</span>
          <span class="text-zinc-500">{{ relativeTime(clip().created_at) }}</span>
          @if (clip().source) {
            <span class="text-zinc-600">{{ clip().source }}</span>
          }
          @if (clip().tags.length) {
            <span class="text-[10px] text-zinc-600">{{ clip().tags.join(', ') }}</span>
          }
        </div>
        <div
          class="devclip-preview max-h-[5.25rem] overflow-hidden font-mono text-[12px] leading-snug text-zinc-200 [&_pre]:m-0 [&_pre]:max-h-full [&_pre]:overflow-hidden [&_pre]:bg-transparent [&_pre]:p-0 [&_pre]:font-mono [&_pre]:text-[12px] [&_code]:bg-transparent"
          [innerHTML]="safeHtml()"
        ></div>
      </div>
      <div
        class="flex shrink-0 flex-col gap-1 self-start opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
      >
        <button
          type="button"
          class="rounded-md p-1.5 text-[10px] text-zinc-500 transition hover:bg-white/10 hover:text-white"
          (click)="onStage(); $event.stopPropagation()"
          title="Stage (S when selected)"
        >
          Stage
        </button>
        <button
          type="button"
          class="rounded-md p-1.5 text-[10px] text-zinc-500 transition hover:bg-devclip-accent/20 hover:text-devclip-accent"
          (click)="onActions(); $event.stopPropagation()"
          title="Actions (A)"
        >
          Act
        </button>
        @if (flags.isProUnlocked()) {
          <button
            type="button"
            class="rounded-md p-1.5 text-[10px] text-zinc-500 transition hover:bg-amber-500/15 hover:text-amber-200"
            (click)="onVault(); $event.stopPropagation()"
            title="Add to encrypted vault"
          >
            Vault
          </button>
        }
        <button
          type="button"
          class="rounded-md p-1.5 text-[10px] text-zinc-500 transition hover:bg-white/10 hover:text-white"
          (click)="onAddTag(); $event.stopPropagation()"
          title="Add tag"
        >
          Tag
        </button>
        <button
          type="button"
          class="rounded-md p-1.5 text-zinc-500 transition hover:bg-white/10 hover:text-white"
          [class.text-devclip-accent]="clip().is_pinned"
          (click)="onPin(); $event.stopPropagation()"
          aria-label="Pin"
        >
          <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"
            />
          </svg>
        </button>
        <button
          type="button"
          class="rounded-md p-1.5 text-zinc-500 transition hover:bg-white/10 hover:text-white"
          (click)="onCopy(); $event.stopPropagation()"
          aria-label="Copy"
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        </button>
        <button
          type="button"
          class="rounded-md p-1.5 text-zinc-500 transition hover:bg-red-500/20 hover:text-red-300"
          (click)="onDelete(); $event.stopPropagation()"
          aria-label="Delete"
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>
    </div>
  `,
})
export class ClipItemComponent {
  clip = input.required<Clip>();
  selected = input(false);
  itemIndex = input(0);

  private readonly shiki = inject(ShikiService);
  private readonly clipSvc = inject(ClipService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly staging = inject(StagingService);
  private readonly overlay = inject(OverlayStore);
  private readonly clipsStore = inject(ClipsStore);
  readonly flags = inject(FeatureFlagService);

  readonly safeHtml = signal<SafeHtml>(this.sanitizer.bypassSecurityTrustHtml(''));

  constructor() {
    effect(() => {
      const c = this.clip();
      void this.renderHighlight(c);
    });
  }

  displayType(t: string): string {
    if (t === 'stack-trace') return 'TRACE';
    if (t === 'file-path') return 'PATH';
    return t.toUpperCase();
  }

  private async renderHighlight(c: Clip) {
    const html = await this.shiki.highlightToHtml(c.content, c.type);
    this.safeHtml.set(this.sanitizer.bypassSecurityTrustHtml(html));
  }

  badgeClass(type: string): string {
    const base = 'rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide';
    switch (type) {
      case 'sql':
        return `${base} bg-teal-500/20 text-teal-300`;
      case 'json':
        return `${base} bg-orange-500/20 text-orange-300`;
      case 'url':
        return `${base} bg-purple-500/20 text-purple-300`;
      case 'code':
        return `${base} bg-green-500/20 text-green-400`;
      case 'email':
        return `${base} bg-sky-500/20 text-sky-300`;
      case 'stack-trace':
        return `${base} bg-rose-500/20 text-rose-300`;
      case 'secret':
        return `${base} bg-red-600/30 text-red-300`;
      case 'image':
        return `${base} bg-fuchsia-500/20 text-fuchsia-300`;
      case 'file-path':
        return `${base} bg-amber-500/20 text-amber-200`;
      default:
        return `${base} bg-zinc-600/50 text-zinc-300`;
    }
  }

  relativeTime(ts: number): string {
    const sec = Math.max(0, Math.floor(Date.now() / 1000) - ts);
    if (sec < 60) return `${sec}s ago`;
    const m = Math.floor(sec / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  }

  onStage() {
    this.staging.add(this.clip());
  }

  onActions() {
    this.clipsStore.selectedIndex.set(this.itemIndex());
    this.overlay.openActionsFor(this.clip());
  }

  onPin() {
    void this.clipSvc.togglePin(this.clip().id);
  }

  onCopy() {
    const c = this.clip();
    void this.clipSvc.copyContent(c.content, c.id, c.type);
  }

  onDelete() {
    void this.clipSvc.deleteClip(this.clip().id);
  }

  onAddTag() {
    const name = window.prompt('Tag name');
    if (name?.trim()) {
      void this.clipSvc.tagClip(this.clip().id, name.trim());
    }
  }

  onVault() {
    void this.clipSvc.vaultAddFromClip(this.clip().id).then((r) => {
      if (!r.ok && r.error) {
        window.alert(r.error);
      }
    });
  }

  onDragStart(ev: DragEvent): void {
    if (!this.flags.isProUnlocked()) {
      ev.preventDefault();
      return;
    }
    ev.stopPropagation();
    const id = this.clip().id;
    ev.dataTransfer?.setData('application/x-devclip-clip-id', String(id));
    ev.dataTransfer?.setData('text/plain', String(id));
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'copy';
    }
  }
}

