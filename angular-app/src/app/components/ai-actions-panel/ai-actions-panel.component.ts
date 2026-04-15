import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClipService } from '../../services/clip.service';
import { FeatureFlagService } from '../../services/feature-flag.service';
import { ClipsStore } from '../../store/clips.store';

type AiActionId =
  | 'summarize'
  | 'explain'
  | 'fix_improve'
  | 'translate'
  | 'rewrite'
  | 'gen_regex'
  | 'gen_test'
  | 'ask';

@Component({
  selector: 'app-ai-actions-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="relative flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-1">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-lg">&#10024;</span>
        <h2 class="text-sm font-semibold text-white lite:text-zinc-900">AI Actions</h2>
        <span class="rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-300">
          PRO
        </span>
      </div>

      @if (!flags.isProUnlocked()) {
        <div class="absolute inset-0 z-20 flex flex-col gap-3 bg-black/15 p-4 text-xs backdrop-blur lite:bg-zinc-100/10">
          <div
            class="w-full max-w-[560px] rounded-xl border border-amber-500/30 bg-amber-500/10/70 p-4 text-xs text-amber-200 lite:border-amber-400/40 lite:bg-amber-100/70 lite:text-amber-900"
          >
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-lg">✨</span>
              <h2 class="text-sm font-semibold">AI Actions</h2>
              <span class="rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-300">PRO</span>
            </div>
            <p class="mt-2">
              Unlock Pro to run AI on your clips. Configure API keys under Settings → AI Actions.
            </p>
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

      <p class="text-xs text-zinc-500 lite:text-zinc-600">
        Select a text clip in History or paste below. Keys and provider live in Settings. Outputs can be
        appended to history (toggle below or in Settings).
      </p>

      @if (blockedImage()) {
        <p class="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          The selected clip is an image. Paste text in the box below or choose a text clip.
        </p>
      }

      <label class="flex cursor-pointer items-center gap-2 text-xs text-zinc-400 lite:text-zinc-600">
        <input type="checkbox" [(ngModel)]="appendOutput" />
        <span>Append result to clipboard history</span>
      </label>

      <div class="rounded-xl border border-white/10 bg-[#121212] p-3 lite:border-zinc-200 lite:bg-zinc-50">
        <div class="mb-1 text-[10px] font-semibold uppercase text-zinc-500 lite:text-zinc-600">Input</div>
        @if (selected(); as sel) {
          <p class="mb-2 text-[10px] text-zinc-600 lite:text-zinc-500">
            Selected: <span class="font-mono">{{ sel.type }}</span> ·
            {{ sel.content.length > 120 ? (sel.content.slice(0, 120) + '…') : sel.content }}
          </p>
        } @else {
          <p class="mb-2 text-[10px] text-zinc-600">No clip selected — paste into the box below.</p>
        }
        <textarea
          class="h-28 w-full rounded-lg border border-white/10 bg-black/40 p-2 font-mono text-[11px] text-zinc-200 lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
          [(ngModel)]="manualOverride"
          placeholder="Optional: overrides selected clip (plain text)"
        ></textarea>
      </div>

      <div class="grid gap-2 sm:grid-cols-2">
        <div class="rounded-xl border border-white/10 bg-[#1a1a1a] p-3 lite:border-zinc-200 lite:bg-white">
          <div class="mb-2 text-[10px] font-semibold uppercase text-zinc-500">Quick actions</div>
          <div class="flex flex-wrap gap-1.5">
            <button
              type="button"
              class="rounded-lg bg-devclip-accent px-2 py-1.5 text-[10px] font-semibold text-black disabled:opacity-40"
              [disabled]="running() || !canRun()"
              (click)="run('summarize')"
            >
              Summarize
            </button>
            <button
              type="button"
              class="rounded-lg bg-devclip-accent px-2 py-1.5 text-[10px] font-semibold text-black disabled:opacity-40"
              [disabled]="running() || !canRun()"
              (click)="run('explain')"
            >
              Explain
            </button>
            <button
              type="button"
              class="rounded-lg bg-devclip-accent px-2 py-1.5 text-[10px] font-semibold text-black disabled:opacity-40"
              [disabled]="running() || !canRun()"
              (click)="run('fix_improve')"
            >
              Fix / improve
            </button>
            <button
              type="button"
              class="rounded-lg bg-devclip-accent px-2 py-1.5 text-[10px] font-semibold text-black disabled:opacity-40"
              [disabled]="running() || !canRun()"
              (click)="run('gen_test')"
            >
              Generate tests
            </button>
          </div>
        </div>

        <div class="rounded-xl border border-white/10 bg-[#1a1a1a] p-3 lite:border-zinc-200 lite:bg-white">
          <div class="mb-2 text-[10px] font-semibold uppercase text-zinc-500">Rewrite tone</div>
          <div class="flex flex-wrap gap-1.5">
            <button
              type="button"
              class="rounded-lg border border-white/15 px-2 py-1.5 text-[10px] text-zinc-300 disabled:opacity-40 lite:border-zinc-300 lite:text-zinc-800"
              [disabled]="running() || !canRun()"
              (click)="run('rewrite', 'formal')"
            >
              Formal
            </button>
            <button
              type="button"
              class="rounded-lg border border-white/15 px-2 py-1.5 text-[10px] text-zinc-300 disabled:opacity-40 lite:border-zinc-300 lite:text-zinc-800"
              [disabled]="running() || !canRun()"
              (click)="run('rewrite', 'casual')"
            >
              Casual
            </button>
            <button
              type="button"
              class="rounded-lg border border-white/15 px-2 py-1.5 text-[10px] text-zinc-300 disabled:opacity-40 lite:border-zinc-300 lite:text-zinc-800"
              [disabled]="running() || !canRun()"
              (click)="run('rewrite', 'technical')"
            >
              Technical
            </button>
          </div>
        </div>
      </div>

      <div class="rounded-xl border border-white/10 bg-[#1a1a1a] p-3 lite:border-zinc-200 lite:bg-white">
        <div class="mb-2 text-[10px] font-semibold uppercase text-zinc-500">Translate</div>
        <div class="flex flex-wrap items-end gap-2">
          <select
            class="rounded border border-white/10 bg-[#2a2a2a] p-2 text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
            [(ngModel)]="translateLang"
          >
            <option value="Spanish">Spanish</option>
            <option value="French">French</option>
            <option value="German">German</option>
            <option value="Japanese">Japanese</option>
            <option value="Simplified Chinese">Simplified Chinese</option>
            <option value="Portuguese">Portuguese</option>
            <option value="Korean">Korean</option>
            <option value="Italian">Italian</option>
          </select>
          <button
            type="button"
            class="rounded-lg bg-devclip-accent px-3 py-2 text-xs font-semibold text-black disabled:opacity-40"
            [disabled]="running() || !canRun()"
            (click)="run('translate', translateLang)"
          >
            Translate
          </button>
        </div>
      </div>

        <div class="rounded-xl border border-white/10 bg-[#1a1a1a] p-3 lite:border-zinc-200 lite:bg-white">
          <div class="mb-2 text-[10px] font-semibold uppercase text-zinc-500">Regex from English</div>
          <input
            class="mb-2 w-full rounded border border-white/10 bg-[#2a2a2a] p-2 text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
            [(ngModel)]="regexDescription"
            placeholder="e.g. match IPv4 addresses"
          />
          <button
            type="button"
            class="rounded-lg bg-devclip-accent px-3 py-2 text-xs font-semibold text-black disabled:opacity-40"
            [disabled]="running() || !canRegexRun()"
            (click)="run('gen_regex', regexDescription)"
          >
            Generate regex
          </button>
        </div>

        <div class="rounded-xl border border-white/10 bg-[#1a1a1a] p-3 lite:border-zinc-200 lite:bg-white">
          <div class="mb-2 text-[10px] font-semibold uppercase text-zinc-500">Ask anything</div>
          <textarea
            class="mb-2 h-16 w-full rounded border border-white/10 bg-[#2a2a2a] p-2 text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
            [(ngModel)]="askQuestion"
            placeholder="Question (uses selected clip / pasted text as context)"
          ></textarea>
          <button
            type="button"
            class="rounded-lg bg-devclip-accent px-3 py-2 text-xs font-semibold text-black disabled:opacity-40"
            [disabled]="running() || !canAskRun()"
            (click)="run('ask', askQuestion)"
          >
            Ask
          </button>
        </div>

        @if (running()) {
          <p class="text-xs text-zinc-500">Running…</p>
        }
        @if (err()) {
          <p class="whitespace-pre-wrap rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            {{ err() }}
          </p>
        }
        @if (out()) {
          <div class="rounded-xl border border-white/10 bg-[#0d0d0d] p-3 lite:border-zinc-200 lite:bg-zinc-100">
            <div class="mb-2 flex flex-wrap items-center gap-2">
              <span class="text-[10px] font-semibold uppercase text-zinc-500">Result</span>
              <button
                type="button"
                class="rounded border border-white/15 px-2 py-0.5 text-[10px] text-zinc-300 lite:border-zinc-300 lite:text-zinc-800"
                (click)="copyOut()"
              >
                Copy
              </button>
            </div>
            <pre
              class="max-h-80 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-zinc-200 lite:text-zinc-900"
              >{{ out() }}</pre
            >
          </div>
        }
      <!-- rest of UI continues unchanged -->
    </div>
  `,
})
export class AiActionsPanelComponent implements OnInit {
  readonly flags = inject(FeatureFlagService);
  private readonly store = inject(ClipsStore);
  private readonly clips = inject(ClipService);

  readonly lockedActions: string[] = [
    'Summarize',
    'Explain',
    'Fix / improve',
    'Generate tests',
    'Rewrite tone',
    'Translate',
    'Regex from English',
    'Ask anything',
  ];

  readonly running = signal(false);
  readonly out = signal('');
  readonly err = signal('');

  manualOverride = '';
  translateLang = 'Spanish';
  regexDescription = '';
  askQuestion = '';
  appendOutput = true;

  async ngOnInit(): Promise<void> {
    if (!this.flags.isProUnlocked()) {
      return;
    }
    try {
      const s = await window.devclip.settingsGet();
      this.appendOutput = s['aiAppendToHistory'] !== '0';
    } catch {
      /* ignore */
    }
  }

  selected() {
    return this.store.selectedClip();
  }

  blockedImage(): boolean {
    const manual = this.manualOverride.trim();
    if (manual) {
      return false;
    }
    const c = this.store.selectedClip();
    return !!c && c.type === 'image';
  }

  effectiveContent(): string {
    const m = this.manualOverride.trim();
    if (m) {
      return m;
    }
    return this.store.selectedClip()?.content ?? '';
  }

  effectiveType(): string | undefined {
    if (this.manualOverride.trim()) {
      return 'text';
    }
    return this.store.selectedClip()?.type;
  }

  canRun(): boolean {
    if (this.blockedImage()) {
      return false;
    }
    return !!this.effectiveContent().trim();
  }

  canRegexRun(): boolean {
    return !!this.regexDescription.trim();
  }

  canAskRun(): boolean {
    if (!this.askQuestion.trim()) {
      return false;
    }
    if (this.blockedImage()) {
      return false;
    }
    return !!this.effectiveContent().trim();
  }

  async run(action: AiActionId, extra?: string): Promise<void> {
    this.err.set('');
    this.out.set('');
    this.running.set(true);
    try {
      const r = await window.devclip.aiRunAction({
        action,
        clipContent: this.effectiveContent(),
        clipType: this.effectiveType(),
        extra,
        appendToHistory: this.appendOutput,
      });
      if (r.ok) {
        this.out.set(r.text);
        void this.clips.reloadFromServer();
      } else {
        this.err.set(r.error);
      }
    } catch (e) {
      this.err.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.running.set(false);
    }
  }

  copyOut(): void {
    const t = this.out();
    if (t) {
      void window.devclip.copyToClipboard(t);
    }
  }
}
