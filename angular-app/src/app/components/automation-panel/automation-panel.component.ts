import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FeatureFlagService } from '../../services/feature-flag.service';

interface AutomationRuleRow {
  id: number;
  name: string;
  enabled: number;
  trigger: string;
  conditions: string;
  actions: string;
  created_at: string;
}

interface CollectionOpt {
  id: number;
  name: string;
}

type CondField = 'type' | 'source' | 'content';
type CondOp = 'eq' | 'contains' | 'regex';
type ActKind = 'pin' | 'tag' | 'discard' | 'transform' | 'webhook' | 'collection_add';

interface BuilderCond {
  field: CondField;
  op: CondOp;
  value: string;
}

interface BuilderAct {
  kind: ActKind;
  tagName: string;
  transformId: string;
  pattern: string;
  replacement: string;
  url: string;
  collectionIdStr: string;
}

@Component({
  selector: 'app-automation-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="relative flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      @if (!flags.isProUnlocked()) {
        <div class="absolute inset-0 z-20 flex flex-col gap-3 bg-black/40 p-4 text-xs backdrop-blur lite:bg-zinc-100/20">
          <div class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200 lite:border-amber-400/40 lite:bg-amber-100 lite:text-amber-900">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-lg">⚙️</span>
              <h2 class="text-sm font-semibold">Automation</h2>
              <span class="rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-300">PRO</span>
            </div>
            <p class="mt-2">
              Unlock Pro to create and manage automation rules (conditions + actions) that run on each new clip.
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
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-sm font-semibold text-white lite:text-zinc-900">Automation rules</h2>
        <span class="rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-300">
          PRO
        </span>
        <span class="text-xs text-zinc-500">{{ rules().length }} rules</span>
      </div>

      <p class="text-xs text-zinc-500 lite:text-zinc-600">
        Runs on each new clip. Actions:
        <code class="text-zinc-400">pin</code>,
        <code class="text-zinc-400">tag</code> + <code class="text-zinc-400">name</code>,
        <code class="text-zinc-400">discard</code>,
        <code class="text-zinc-400">transform</code> + <code class="text-zinc-400">id</code> (optional
        <code class="text-zinc-400">pattern</code>/<code class="text-zinc-400">replacement</code> for
        <code class="text-zinc-400">regex-replace</code>),
        <code class="text-zinc-400">webhook</code> + HTTPS <code class="text-zinc-400">url</code> (or
        http://localhost),
        <code class="text-zinc-400">collection_add</code> +
        <code class="text-zinc-400">collectionId</code>.
      </p>

      <label class="flex cursor-pointer items-center gap-2 text-xs text-zinc-400 lite:text-zinc-600">
        <input type="checkbox" [(ngModel)]="useVisualBuilder" />
        <span>Visual builder for new rule (conditions + actions)</span>
      </label>

      @if (useVisualBuilder) {
        <div class="space-y-3 rounded-lg border border-white/10 bg-[#141414] p-3 lite:border-zinc-200 lite:bg-zinc-50">
          <div class="text-[10px] font-semibold uppercase text-zinc-500">Conditions (AND)</div>
          @for (c of builderConds; track $index) {
            <div class="flex flex-wrap items-center gap-2">
              <select
                class="rounded border border-white/10 bg-[#2a2a2a] p-1.5 text-[11px] text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
                [(ngModel)]="c.field"
              >
                <option value="type">type</option>
                <option value="source">source</option>
                <option value="content">content</option>
              </select>
              <select
                class="rounded border border-white/10 bg-[#2a2a2a] p-1.5 text-[11px] text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
                [(ngModel)]="c.op"
              >
                <option value="eq">equals</option>
                <option value="contains">contains</option>
                <option value="regex">regex (content only)</option>
              </select>
              <input
                class="min-w-[8rem] flex-1 rounded border border-white/10 bg-[#2a2a2a] p-1.5 font-mono text-[11px] text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
                [(ngModel)]="c.value"
                placeholder="value"
              />
              <button
                type="button"
                class="text-[11px] text-red-400"
                (click)="removeCond($index)"
              >
                ✕
              </button>
            </div>
          }
          <button
            type="button"
            class="text-[11px] text-devclip-accent"
            (click)="addCond()"
          >
            + Add condition
          </button>

          <div class="text-[10px] font-semibold uppercase text-zinc-500">Actions (in order)</div>
          @for (a of builderActs; track $index) {
            <div class="rounded border border-white/5 p-2 lite:border-zinc-200">
              <div class="mb-2 flex flex-wrap items-center gap-2">
                <select
                  class="rounded border border-white/10 bg-[#2a2a2a] p-1.5 text-[11px] text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
                  [(ngModel)]="a.kind"
                >
                  <option value="pin">Pin</option>
                  <option value="tag">Tag</option>
                  <option value="discard">Discard</option>
                  <option value="transform">Transform text</option>
                  <option value="webhook">Webhook POST</option>
                  <option value="collection_add">Add to collection</option>
                </select>
                <button
                  type="button"
                  class="text-[11px] text-red-400"
                  (click)="removeAct($index)"
                >
                  ✕
                </button>
              </div>
              @if (a.kind === 'tag') {
                <input
                  class="w-full rounded border border-white/10 bg-[#2a2a2a] p-1.5 text-[11px] text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
                  [(ngModel)]="a.tagName"
                  placeholder="Tag name"
                />
              }
              @if (a.kind === 'transform') {
                <select
                  class="mb-1 w-full rounded border border-white/10 bg-[#2a2a2a] p-1.5 text-[11px] text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
                  [(ngModel)]="a.transformId"
                >
                  @for (t of transformIds; track t) {
                    <option [value]="t">{{ t }}</option>
                  }
                </select>
                @if (a.transformId === 'regex-replace') {
                  <input
                    class="mb-1 w-full rounded border border-white/10 bg-[#2a2a2a] p-1.5 font-mono text-[11px] text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
                    [(ngModel)]="a.pattern"
                    placeholder="Regex pattern"
                  />
                  <input
                    class="w-full rounded border border-white/10 bg-[#2a2a2a] p-1.5 font-mono text-[11px] text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
                    [(ngModel)]="a.replacement"
                    placeholder="Replacement"
                  />
                }
              }
              @if (a.kind === 'webhook') {
                <input
                  class="w-full rounded border border-white/10 bg-[#2a2a2a] p-1.5 font-mono text-[11px] text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
                  [(ngModel)]="a.url"
                  placeholder="https://…"
                />
              }
              @if (a.kind === 'collection_add') {
                <select
                  class="w-full rounded border border-white/10 bg-[#2a2a2a] p-1.5 text-[11px] text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
                  [(ngModel)]="a.collectionIdStr"
                >
                  <option value="">— Collection —</option>
                  @for (col of collectionOpts(); track col.id) {
                    <option [value]="'' + col.id">{{ col.name }}</option>
                  }
                </select>
              }
            </div>
          }
          <button
            type="button"
            class="text-[11px] text-devclip-accent"
            (click)="addAct()"
          >
            + Add action
          </button>
          <button
            type="button"
            class="rounded border border-white/15 px-2 py-1 text-[11px] text-zinc-300 lite:border-zinc-300 lite:text-zinc-800"
            (click)="applyBuilderToJson()"
          >
            Copy builder → JSON fields below
          </button>
        </div>
      }

      <div class="space-y-2 rounded-lg border border-white/10 bg-[#141414] p-3 lite:border-zinc-200 lite:bg-zinc-50">
        <label class="flex flex-col gap-1 text-xs text-zinc-400">
          Name
          <input
            class="rounded border border-white/10 bg-[#2a2a2a] p-2 text-sm text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
            [(ngModel)]="newName"
          />
        </label>
        <label class="flex flex-col gap-1 text-xs text-zinc-400">
          Trigger (JSON)
          <input
            class="rounded border border-white/10 bg-[#2a2a2a] p-2 font-mono text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
            [(ngModel)]="newTrigger"
          />
        </label>
        <label class="flex flex-col gap-1 text-xs text-zinc-400">
          Conditions (JSON array)
          <textarea
            class="h-16 w-full rounded border border-white/10 bg-[#2a2a2a] p-2 font-mono text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
            [(ngModel)]="newConditions"
          ></textarea>
        </label>
        <label class="flex flex-col gap-1 text-xs text-zinc-400">
          Actions (JSON array)
          <textarea
            class="h-20 w-full rounded border border-white/10 bg-[#2a2a2a] p-2 font-mono text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
            [(ngModel)]="newActions"
          ></textarea>
        </label>
        <button
          type="button"
          class="rounded-lg bg-devclip-accent px-3 py-2 text-xs font-semibold text-black"
          (click)="addRule()"
        >
          Add rule
        </button>
        @if (formError()) {
          <p class="text-xs text-red-400">{{ formError() }}</p>
        }
      </div>

      @for (r of rules(); track r.id) {
        <div
          class="rounded-xl border border-white/10 bg-[#1a1a1a] p-3 lite:border-zinc-200 lite:bg-white"
          [class.opacity-50]="!r.enabled"
        >
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <span class="text-sm font-medium text-white lite:text-zinc-900">{{ r.name }}</span>
            <button
              type="button"
              class="text-xs text-zinc-400 hover:text-white lite:hover:text-zinc-900"
              (click)="toggleRule(r)"
            >
              {{ r.enabled ? 'Disable' : 'Enable' }}
            </button>
            <button
              type="button"
              class="ml-auto text-xs text-red-400 hover:text-red-300"
              (click)="deleteRule(r.id)"
            >
              Delete
            </button>
          </div>
          <pre
            class="max-h-28 overflow-auto rounded bg-black/30 p-2 font-mono text-[10px] text-zinc-400 lite:bg-zinc-100 lite:text-zinc-700"
            >{{ r.trigger }}
{{ r.conditions }}
{{ r.actions }}</pre
          >
        </div>
      } @empty {
        <p class="text-sm text-zinc-500">No rules. Add one above.</p>
      }
    </div>
  `,
})
export class AutomationPanelComponent implements OnInit {
  readonly flags = inject(FeatureFlagService);

  readonly rules = signal<AutomationRuleRow[]>([]);
  readonly formError = signal('');
  readonly collectionOpts = signal<CollectionOpt[]>([]);

  readonly lockedActions: string[] = ['Pin clips', 'Tag clips', 'Transform text', 'Webhook POST', 'Add to collection'];

  useVisualBuilder = true;

  newName = 'Pin JSON clips';
  newTrigger = '{"kind":"new_clip"}';
  newConditions = '[{"field":"type","op":"eq","value":"json"}]';
  newActions = '[{"kind":"pin"}]';

  builderConds: BuilderCond[] = [{ field: 'type', op: 'eq', value: 'json' }];
  builderActs: BuilderAct[] = [this.emptyAct('pin')];

  readonly transformIds = [
    'trim-whitespace',
    'normalize-line-endings',
    'uppercase',
    'lowercase',
    'format-json',
    'minify-json',
    'base64-encode',
    'base64-decode',
    'url-encode',
    'url-decode',
    'case-camel',
    'case-snake',
    'case-pascal',
    'case-scream',
    'case-kebab',
    'case-title',
    'regex-replace',
  ];

  async ngOnInit(): Promise<void> {
    await this.reload();
    await this.loadCollections();
  }

  emptyAct(kind: ActKind): BuilderAct {
    return {
      kind,
      tagName: '',
      transformId: 'trim-whitespace',
      pattern: '',
      replacement: '',
      url: '',
      collectionIdStr: '',
    };
  }

  addCond(): void {
    this.builderConds.push({ field: 'content', op: 'contains', value: '' });
  }

  removeCond(i: number): void {
    this.builderConds.splice(i, 1);
    if (this.builderConds.length === 0) {
      this.builderConds.push({ field: 'type', op: 'eq', value: '' });
    }
  }

  addAct(): void {
    this.builderActs.push(this.emptyAct('pin'));
  }

  removeAct(i: number): void {
    this.builderActs.splice(i, 1);
    if (this.builderActs.length === 0) {
      this.builderActs.push(this.emptyAct('pin'));
    }
  }

  applyBuilderToJson(): void {
    const conds: { field: string; op: string; value?: string }[] = this.builderConds
      .filter((c) => c.field && c.op && (c.op !== 'regex' || c.value?.trim()))
      .map((c) => {
        const row: { field: string; op: string; value?: string } = {
          field: c.field,
          op: c.op,
        };
        if (c.value.trim() || c.op === 'regex') {
          row.value = c.value;
        }
        return row;
      });
    this.newConditions = JSON.stringify(conds.length ? conds : [], null, 0);

    const acts: Record<string, unknown>[] = [];
    for (const a of this.builderActs) {
      switch (a.kind) {
        case 'pin':
          acts.push({ kind: 'pin' });
          break;
        case 'discard':
          acts.push({ kind: 'discard' });
          break;
        case 'tag':
          if (a.tagName.trim()) {
            acts.push({ kind: 'tag', name: a.tagName.trim() });
          }
          break;
        case 'transform': {
          const o: Record<string, unknown> = { kind: 'transform', id: a.transformId };
          if (a.transformId === 'regex-replace') {
            o['pattern'] = a.pattern;
            o['replacement'] = a.replacement;
          }
          acts.push(o);
          break;
        }
        case 'webhook':
          if (a.url.trim()) {
            acts.push({ kind: 'webhook', url: a.url.trim() });
          }
          break;
        case 'collection_add': {
          const id = parseInt(a.collectionIdStr, 10);
          if (Number.isFinite(id) && id > 0) {
            acts.push({ kind: 'collection_add', collectionId: id });
          }
          break;
        }
      }
    }
    this.newActions = JSON.stringify(acts, null, 0);
  }

  async loadCollections(): Promise<void> {
    try {
      const rows = (await window.devclip.collectionsList()) as {
        id: number;
        name: string;
      }[];
      this.collectionOpts.set(rows.map((r) => ({ id: r.id, name: r.name })));
    } catch {
      this.collectionOpts.set([]);
    }
  }

  async reload(): Promise<void> {
    try {
      const rows = (await window.devclip.automationList()) as AutomationRuleRow[];
      this.rules.set(rows);
    } catch {
      this.rules.set([]);
    }
  }

  async toggleRule(r: AutomationRuleRow): Promise<void> {
    const enabled = r.enabled ? 0 : 1;
    await window.devclip.automationUpdate({
      id: r.id,
      name: r.name,
      enabled,
      trigger: r.trigger,
      conditions: r.conditions,
      actions: r.actions,
    });
    await this.reload();
  }

  async deleteRule(id: number): Promise<void> {
    if (!window.confirm('Delete this rule?')) return;
    await window.devclip.automationDelete(id);
    await this.reload();
  }

  addRule(): void {
    this.formError.set('');
    if (this.useVisualBuilder) {
      this.applyBuilderToJson();
    }
    try {
      JSON.parse(this.newTrigger);
      JSON.parse(this.newConditions);
      JSON.parse(this.newActions);
    } catch {
      this.formError.set('Invalid JSON in trigger, conditions, or actions.');
      return;
    }
    const name = this.newName.trim() || 'Untitled rule';
    void window.devclip
      .automationCreate({
        name,
        trigger: this.newTrigger.trim(),
        conditions: this.newConditions.trim(),
        actions: this.newActions.trim(),
        enabled: 1,
      })
      .then(() => this.reload())
      .catch(() => this.formError.set('Could not create rule.'));
  }
}
