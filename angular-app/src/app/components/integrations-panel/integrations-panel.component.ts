import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClipsStore } from '../../store/clips.store';
import { FeatureFlagService } from '../../services/feature-flag.service';

@Component({
  selector: 'app-integrations-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="relative flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1 text-sm text-white lite:text-zinc-900">
      @if (!flags.isProUnlocked()) {
        <div class="absolute inset-0 z-20 flex flex-col gap-3 bg-black/40 p-4 text-xs backdrop-blur lite:bg-zinc-100/20">
          <div class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200 lite:border-amber-400/40 lite:bg-amber-100 lite:text-amber-900">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-lg">🔌</span>
              <h2 class="text-sm font-semibold">Integrations</h2>
              <span class="rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-300">PRO</span>
            </div>
            <p class="mt-2">Unlock Pro to configure outbound webhooks and Notion/Slack/GitHub/Jira integrations.</p>
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
      <div>
        <h2 class="mb-1 text-sm font-semibold">Integrations</h2>
        <p class="text-xs text-zinc-500 lite:text-zinc-600">
          Outbound webhooks on new clips, plus optional Notion, Slack, GitHub Gist, and Jira (Cloud) actions. Secrets
          use OS keychain when available (same pattern as AI keys).
        </p>
      </div>

      <section class="rounded-xl border border-white/10 bg-[#1a1a1a] p-4 lite:border-zinc-200 lite:bg-white">
        <h3 class="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500 lite:text-zinc-600">
          Outbound webhook (Zapier / Make / custom)
        </h3>
        <p class="mb-3 text-xs text-zinc-500 lite:text-zinc-600">
          <strong>Zapier / Make</strong> format includes <code class="text-zinc-300 lite:text-zinc-800">hook</code>,
          <code class="text-zinc-300 lite:text-zinc-800">timestamp</code>, <code class="text-zinc-300 lite:text-zinc-800">clip</code>, and
          <code class="text-zinc-300 lite:text-zinc-800">text</code> preview. Legacy
          <code class="text-zinc-300 lite:text-zinc-800">devclip.new_clip</code> matches Automation rules webhooks.
        </p>
        <label class="mb-2 flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            [checked]="outboundEnabled"
            (change)="onOutboundEnabled($any($event.target).checked)"
          />
          POST on every new clip
        </label>
        <input
          type="url"
          class="mb-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white lite:border-zinc-300 lite:bg-zinc-50 lite:text-zinc-900"
          placeholder="https://hooks.zapier.com/… or your HTTPS URL"
          [(ngModel)]="outboundUrl"
          (blur)="persistOutbound()"
        />
        <label class="mb-2 block text-[10px] font-semibold uppercase text-zinc-500 lite:text-zinc-600">Payload</label>
        <select
          class="mb-3 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white lite:border-zinc-300 lite:bg-zinc-50 lite:text-zinc-900"
          [(ngModel)]="payloadFormat"
          (ngModelChange)="persistOutbound()"
        >
          <option value="zapier">Zapier / Make (recommended)</option>
          <option value="devclip">DevClip legacy (automation-compatible)</option>
        </select>
        <label class="mb-1 block text-[10px] font-semibold uppercase text-zinc-500 lite:text-zinc-600">
          HMAC secret (optional)
        </label>
        <input
          type="password"
          autocomplete="off"
          class="mb-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white lite:border-zinc-300 lite:bg-zinc-50 lite:text-zinc-900"
          placeholder="Adds X-DevClip-Signature: sha256=…"
          [(ngModel)]="hmacInput"
          (blur)="saveHmac()"
        />
        <button
          type="button"
          class="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-zinc-200 lite:border-zinc-300 lite:text-zinc-800"
          [disabled]="busy()"
          (click)="testWebhook()"
        >
          Send test payload
        </button>
      </section>

      <section class="rounded-xl border border-white/10 bg-[#1a1a1a] p-4 lite:border-zinc-200 lite:bg-white">
        <h3 class="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500 lite:text-zinc-600">Notion</h3>
        <p class="mb-2 text-xs text-zinc-500 lite:text-zinc-600">
          Internal integration token + page (or block) ID to append paragraphs. Grant your integration access to the
          page.
        </p>
        <input
          type="password"
          autocomplete="off"
          class="mb-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white lite:border-zinc-300 lite:bg-zinc-50 lite:text-zinc-900"
          placeholder="Notion integration secret"
          [(ngModel)]="notionTokenInput"
          (blur)="saveNotionToken()"
        />
        <input
          type="text"
          class="mb-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white lite:border-zinc-300 lite:bg-zinc-50 lite:text-zinc-900"
          placeholder="Page URL or UUID"
          [(ngModel)]="notionPageId"
          (blur)="persistNotionPage()"
        />
        <label class="mb-2 flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            [checked]="notionOnCapture"
            (change)="toggleNotionCapture($any($event.target).checked)"
          />
          Also append on new clip capture
        </label>
        <button
          type="button"
          class="rounded-lg bg-devclip-accent px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-40"
          [disabled]="busy()"
          (click)="sendNotion()"
        >
          Append selected clip
        </button>
      </section>

      <section class="rounded-xl border border-white/10 bg-[#1a1a1a] p-4 lite:border-zinc-200 lite:bg-white">
        <h3 class="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500 lite:text-zinc-600">Slack</h3>
        <p class="mb-2 text-xs text-zinc-500 lite:text-zinc-600">Incoming webhook URL (Workspace → Apps → Incoming Webhooks).</p>
        <input
          type="url"
          class="mb-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white lite:border-zinc-300 lite:bg-zinc-50 lite:text-zinc-900"
          placeholder="https://hooks.slack.com/services/…"
          [(ngModel)]="slackUrl"
          (blur)="persistSlack()"
        />
        <label class="mb-2 flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            [checked]="slackOnCapture"
            (change)="toggleSlackCapture($any($event.target).checked)"
          />
          Also post on new clip capture
        </label>
        <button
          type="button"
          class="rounded-lg bg-devclip-accent px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-40"
          [disabled]="busy()"
          (click)="sendSlack()"
        >
          Post selected clip
        </button>
      </section>

      <section class="rounded-xl border border-white/10 bg-[#1a1a1a] p-4 lite:border-zinc-200 lite:bg-white">
        <h3 class="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500 lite:text-zinc-600">GitHub Gist</h3>
        <p class="mb-2 text-xs text-zinc-500 lite:text-zinc-600">
          Fine-grained or classic PAT with <code class="text-zinc-300 lite:text-zinc-800">gist</code> scope.
        </p>
        <input
          type="password"
          autocomplete="off"
          class="mb-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white lite:border-zinc-300 lite:bg-zinc-50 lite:text-zinc-900"
          placeholder="GitHub token"
          [(ngModel)]="githubTokenInput"
          (blur)="saveGithubToken()"
        />
        <label class="mb-2 flex cursor-pointer items-center gap-2 text-xs">
          <input type="checkbox" [(ngModel)]="gistPublic" />
          Public gist
        </label>
        <input
          type="text"
          class="mb-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white lite:border-zinc-300 lite:bg-zinc-50 lite:text-zinc-900"
          placeholder="Filename base (optional)"
          [(ngModel)]="gistFilename"
        />
        <button
          type="button"
          class="rounded-lg bg-devclip-accent px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-40"
          [disabled]="busy()"
          (click)="createGist()"
        >
          Create gist from selected clip
        </button>
      </section>

      <section class="rounded-xl border border-white/10 bg-[#1a1a1a] p-4 lite:border-zinc-200 lite:bg-white">
        <h3 class="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500 lite:text-zinc-600">Jira Cloud</h3>
        <p class="mb-2 text-xs text-zinc-500 lite:text-zinc-600">
          Site URL, Atlassian account email, and API token (Account settings → Security → API tokens). Adds a comment
          with clip text (ADF).
        </p>
        <input
          type="url"
          class="mb-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white lite:border-zinc-300 lite:bg-zinc-50 lite:text-zinc-900"
          placeholder="https://your-domain.atlassian.net"
          [(ngModel)]="jiraSite"
          (blur)="persistJira()"
        />
        <input
          type="email"
          class="mb-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white lite:border-zinc-300 lite:bg-zinc-50 lite:text-zinc-900"
          placeholder="Email"
          [(ngModel)]="jiraEmail"
          (blur)="persistJira()"
        />
        <input
          type="password"
          autocomplete="off"
          class="mb-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white lite:border-zinc-300 lite:bg-zinc-50 lite:text-zinc-900"
          placeholder="Jira API token"
          [(ngModel)]="jiraTokenInput"
          (blur)="saveJiraToken()"
        />
        <label class="mb-1 block text-[10px] font-semibold uppercase text-zinc-500 lite:text-zinc-600">
          Issue key for capture automation
        </label>
        <input
          type="text"
          class="mb-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white lite:border-zinc-300 lite:bg-zinc-50 lite:text-zinc-900"
          placeholder="PROJ-123"
          [(ngModel)]="jiraCaptureKey"
          (blur)="persistJiraCaptureKey()"
        />
        <label class="mb-2 flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            [checked]="jiraOnCapture"
            (change)="toggleJiraCapture($any($event.target).checked)"
          />
          Comment on new clip capture (uses issue key above)
        </label>
        <label class="mb-1 block text-[10px] font-semibold uppercase text-zinc-500 lite:text-zinc-600">
          Manual send — issue key
        </label>
        <input
          type="text"
          class="mb-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white lite:border-zinc-300 lite:bg-zinc-50 lite:text-zinc-900"
          placeholder="PROJ-456"
          [(ngModel)]="jiraManualKey"
        />
        <button
          type="button"
          class="rounded-lg bg-devclip-accent px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-40"
          [disabled]="busy()"
          (click)="sendJira()"
        >
          Add comment (selected clip)
        </button>
      </section>
    </div>
  `,
})
export class IntegrationsPanelComponent implements OnInit {
  private readonly store = inject(ClipsStore);
  readonly flags = inject(FeatureFlagService);
  readonly busy = signal(false);

  outboundEnabled = false;
  outboundUrl = '';
  payloadFormat: 'zapier' | 'devclip' = 'zapier';
  hmacInput = '';

  notionTokenInput = '';
  notionPageId = '';
  notionOnCapture = false;

  slackUrl = '';
  slackOnCapture = false;

  githubTokenInput = '';
  gistPublic = false;
  gistFilename = '';

  jiraSite = '';
  jiraEmail = '';
  jiraTokenInput = '';
  jiraCaptureKey = '';
  jiraOnCapture = false;
  jiraManualKey = '';

  readonly lockedActions: string[] = ['Outbound webhooks', 'Notion', 'Slack', 'GitHub Gist', 'Jira Cloud'];

  async ngOnInit(): Promise<void> {
    await this.hydrate();
  }

  private async hydrate(): Promise<void> {
    const s = await window.devclip.integrationsGetStatus();
    this.outboundEnabled = s.outboundEnabled;
    this.outboundUrl = s.outboundUrl;
    this.payloadFormat = s.payloadFormat === 'devclip' ? 'devclip' : 'zapier';
    this.notionPageId = s.notionPageId;
    this.notionOnCapture = s.notionOnCapture;
    this.slackUrl = s.slackWebhookUrl;
    this.slackOnCapture = s.slackOnCapture;
    this.jiraSite = s.jiraSite;
    this.jiraEmail = s.jiraEmail;
    this.jiraCaptureKey = s.jiraCaptureIssueKey;
    this.jiraOnCapture = s.jiraOnCapture;
    this.hmacInput = '';
    this.notionTokenInput = '';
    this.githubTokenInput = '';
    this.jiraTokenInput = '';
  }

  onOutboundEnabled(v: boolean): void {
    this.outboundEnabled = v;
    void window.devclip.integrationsSaveSettings({
      integrationsOutboundEnabled: v ? '1' : '0',
    });
  }

  persistOutbound(): void {
    void window.devclip.integrationsSaveSettings({
      integrationsOutboundUrl: this.outboundUrl.trim(),
      integrationsPayloadFormat: this.payloadFormat,
    });
  }

  async saveHmac(): Promise<void> {
    await window.devclip.integrationsSetSecret('webhook_hmac', this.hmacInput);
    await this.hydrate();
  }

  async saveNotionToken(): Promise<void> {
    await window.devclip.integrationsSetSecret('notion', this.notionTokenInput);
    this.notionTokenInput = '';
    await this.hydrate();
  }

  persistNotionPage(): void {
    void window.devclip.integrationsSaveSettings({
      integrationsNotionPageId: this.notionPageId.trim(),
    });
  }

  toggleNotionCapture(v: boolean): void {
    this.notionOnCapture = v;
    void window.devclip.integrationsSaveSettings({
      integrationsNotionOnCapture: v ? '1' : '0',
    });
  }

  persistSlack(): void {
    void window.devclip.integrationsSaveSettings({
      integrationsSlackWebhookUrl: this.slackUrl.trim(),
    });
  }

  toggleSlackCapture(v: boolean): void {
    this.slackOnCapture = v;
    void window.devclip.integrationsSaveSettings({
      integrationsSlackOnCapture: v ? '1' : '0',
    });
  }

  async saveGithubToken(): Promise<void> {
    await window.devclip.integrationsSetSecret('github', this.githubTokenInput);
    this.githubTokenInput = '';
    await this.hydrate();
  }

  persistJira(): void {
    void window.devclip.integrationsSaveSettings({
      integrationsJiraSite: this.jiraSite.trim(),
      integrationsJiraEmail: this.jiraEmail.trim(),
    });
  }

  async saveJiraToken(): Promise<void> {
    await window.devclip.integrationsSetSecret('jira', this.jiraTokenInput);
    this.jiraTokenInput = '';
    await this.hydrate();
  }

  persistJiraCaptureKey(): void {
    void window.devclip.integrationsSaveSettings({
      integrationsJiraCaptureIssueKey: this.jiraCaptureKey.trim().toUpperCase(),
    });
  }

  toggleJiraCapture(v: boolean): void {
    this.jiraOnCapture = v;
    void window.devclip.integrationsSaveSettings({
      integrationsJiraOnCapture: v ? '1' : '0',
    });
  }

  private selectedId(): number | null {
    const c = this.store.selectedClip();
    return c?.id ?? null;
  }

  async testWebhook(): Promise<void> {
    this.busy.set(true);
    try {
      const r = await window.devclip.integrationsTestWebhook();
      alert(r.ok ? 'Test sent OK' : r.error);
    } finally {
      this.busy.set(false);
    }
  }

  async sendNotion(): Promise<void> {
    const id = this.selectedId();
    if (id == null) {
      alert('Select a clip in History first.');
      return;
    }
    this.busy.set(true);
    try {
      const r = await window.devclip.integrationsSendNotion(id);
      alert(r.ok ? 'Appended to Notion' : r.error);
    } finally {
      this.busy.set(false);
    }
  }

  async sendSlack(): Promise<void> {
    const id = this.selectedId();
    if (id == null) {
      alert('Select a clip in History first.');
      return;
    }
    this.busy.set(true);
    try {
      const r = await window.devclip.integrationsSendSlack(id);
      alert(r.ok ? 'Posted to Slack' : r.error);
    } finally {
      this.busy.set(false);
    }
  }

  async createGist(): Promise<void> {
    const id = this.selectedId();
    if (id == null) {
      alert('Select a clip in History first.');
      return;
    }
    this.busy.set(true);
    try {
      const r = await window.devclip.integrationsCreateGist({
        clipId: id,
        isPublic: this.gistPublic,
        filename: this.gistFilename.trim() || undefined,
      });
      if (r.ok) {
        const open = confirm(`Gist created.\n${r.url}\n\nOpen in browser?`);
        if (open) void window.devclip.openExternalUrl(r.url);
      } else {
        alert(r.error);
      }
    } finally {
      this.busy.set(false);
    }
  }

  async sendJira(): Promise<void> {
    const id = this.selectedId();
    if (id == null) {
      alert('Select a clip in History first.');
      return;
    }
    const key = this.jiraManualKey.trim();
    if (!key) {
      alert('Enter a Jira issue key.');
      return;
    }
    this.busy.set(true);
    try {
      const r = await window.devclip.integrationsJiraComment({ clipId: id, issueKey: key });
      alert(r.ok ? 'Comment added' : r.error);
    } finally {
      this.busy.set(false);
    }
  }
}
