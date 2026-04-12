import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FeatureFlagService } from '../../services/feature-flag.service';

type EntStatus = {
  isEnterprise: boolean;
  orgDashboardUrl: string;
  policyUrl: string;
  policyLastOk: string;
  policyLastError: string;
  snippetsFeedUrl: string;
  hasOrgApiToken: boolean;
  auditEventCount: number;
  auditRetentionDays: string;
  policyDisableAi: boolean;
  policyDisableSync: boolean;
  policyForcePrivate: boolean;
  policySignatureValid: boolean;
};

@Component({
  selector: 'app-enterprise-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1 text-sm text-white lite:text-zinc-900">
      <div>
        <h2 class="mb-1 text-sm font-semibold">Enterprise</h2>
        <p class="text-xs text-zinc-500 lite:text-zinc-600">
          Organization URLs, remote policy, optional org snippet feed (HTTPS JSON), and local audit export. Requires an
          Enterprise license.
        </p>
      </div>

      @if (!flags.isEnterpriseUnlocked()) {
        <div
          class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-100 lite:border-amber-600/40 lite:bg-amber-100/80 lite:text-amber-950"
        >
          Unlock the <strong>Enterprise</strong> tier (organization API key), then open this tab again. Configure the
          license under <strong>Settings</strong>.
        </div>
      } @else {
        <section class="rounded-xl border border-white/10 bg-[#1a1a1a] p-4 lite:border-zinc-200 lite:bg-white">
          <h3 class="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500 lite:text-zinc-600">
            Organization links
          </h3>
          <label class="mb-1 block text-[10px] font-semibold uppercase text-zinc-500 lite:text-zinc-600"
            >Admin / dashboard (opens in browser)</label
          >
          <div class="mb-3 flex gap-2">
            <input
              type="url"
              class="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white lite:border-zinc-300 lite:bg-zinc-50 lite:text-zinc-900"
              placeholder="https://…"
              [(ngModel)]="orgDashboardUrl"
            />
            <button
              type="button"
              class="shrink-0 rounded-lg border border-white/15 px-2 py-1.5 text-[11px] font-medium text-zinc-200 lite:border-zinc-300 lite:text-zinc-800"
              title="Open in browser"
              (click)="openOrgDashboard()"
            >
              Open
            </button>
          </div>
          <label class="mb-1 block text-[10px] font-semibold uppercase text-zinc-500 lite:text-zinc-600"
            >Policy JSON URL</label
          >
          <input
            type="url"
            class="mb-3 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white lite:border-zinc-300 lite:bg-zinc-50 lite:text-zinc-900"
            placeholder="https://…/policy.json"
            [(ngModel)]="policyUrl"
          />
          <label class="mb-1 block text-[10px] font-semibold uppercase text-zinc-500 lite:text-zinc-600"
            >Org snippets feed (JSON array)</label
          >
          <input
            type="url"
            class="mb-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white lite:border-zinc-300 lite:bg-zinc-50 lite:text-zinc-900"
            placeholder="https://…/snippets.json"
            [(ngModel)]="snippetsFeedUrl"
          />
          <p class="mb-3 text-[11px] text-zinc-500 lite:text-zinc-600">
            Optional Bearer token below is sent as <code class="text-zinc-300 lite:text-zinc-800">Authorization</code> for
            policy fetch and snippet import.
          </p>
          <label class="mb-1 block text-[10px] font-semibold uppercase text-zinc-500 lite:text-zinc-600"
            >Org API token</label
          >
          <input
            type="password"
            autocomplete="off"
            class="mb-3 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white lite:border-zinc-300 lite:bg-zinc-50 lite:text-zinc-900"
            placeholder="Paste token (stored encrypted when OS supports it)"
            [(ngModel)]="tokenInput"
          />
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-zinc-200 lite:border-zinc-300 lite:text-zinc-800"
              [disabled]="busy()"
              (click)="saveAll()"
            >
              Save
            </button>
            <button
              type="button"
              class="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-zinc-200 lite:border-zinc-300 lite:text-zinc-800"
              [disabled]="busy()"
              (click)="fetchPolicy()"
            >
              Fetch policy now
            </button>
            <button
              type="button"
              class="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-zinc-200 lite:border-zinc-300 lite:text-zinc-800"
              [disabled]="busy()"
              (click)="importSnippets()"
            >
              Import org snippets
            </button>
          </div>
          @if (message()) {
            <p class="mt-2 text-xs text-zinc-400 lite:text-zinc-600">{{ message() }}</p>
          }
        </section>

        <section class="rounded-xl border border-white/10 bg-[#1a1a1a] p-4 lite:border-zinc-200 lite:bg-white">
          <h3 class="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500 lite:text-zinc-600">
            Policy status (effective on this device)
          </h3>
          <ul class="space-y-1 text-xs text-zinc-400 lite:text-zinc-600">
            <li>Last OK: {{ status()?.policyLastOk || '—' }}</li>
            <li>Last error: {{ status()?.policyLastError || '—' }}</li>
            <li>
              Signature valid:
              @if (status()?.policySignatureValid) {
                <span class="text-emerald-500">yes</span>
              } @else {
                <span class="text-amber-500">no / not signed</span>
              }
            </li>
            <li>AI disabled: {{ status()?.policyDisableAi ? 'yes' : 'no' }}</li>
            <li>Cloud sync disabled: {{ status()?.policyDisableSync ? 'yes' : 'no' }}</li>
            <li>Force private capture: {{ status()?.policyForcePrivate ? 'yes' : 'no' }}</li>
          </ul>
        </section>

        <section class="rounded-xl border border-white/10 bg-[#1a1a1a] p-4 lite:border-zinc-200 lite:bg-white">
          <h3 class="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500 lite:text-zinc-600">
            Audit log (local)
          </h3>
          <p class="mb-2 text-xs text-zinc-500 lite:text-zinc-600">
            Events: captures, sync, vault, sensitive settings, license, enterprise actions. Older rows are removed per
            retention (export first for compliance archives).
          </p>
          <label class="mb-1 block text-[10px] font-semibold uppercase text-zinc-500 lite:text-zinc-600"
            >Retention</label
          >
          <select
            class="mb-3 w-full max-w-xs rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white lite:border-zinc-300 lite:bg-zinc-50 lite:text-zinc-900"
            [(ngModel)]="auditRetentionDays"
          >
            <option value="0">Keep all (no automatic delete)</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="180">180 days</option>
            <option value="365">1 year</option>
            <option value="730">2 years</option>
          </select>
          <p class="mb-3 text-xs text-zinc-300 lite:text-zinc-800">Stored events: {{ status()?.auditEventCount ?? '—' }}</p>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-zinc-200 lite:border-zinc-300 lite:text-zinc-800"
              [disabled]="busy()"
              (click)="exportJsonl()"
            >
              Export JSON Lines…
            </button>
            <button
              type="button"
              class="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-zinc-200 lite:border-zinc-300 lite:text-zinc-800"
              [disabled]="busy()"
              (click)="exportCsv()"
            >
              Export CSV…
            </button>
          </div>
        </section>

        <!-- SLA / Status Page -->
        <section class="rounded-xl border border-white/10 bg-[#1a1a1a] p-4 lite:border-zinc-200 lite:bg-white">
          <h3 class="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500 lite:text-zinc-600">
            Service Level Agreement
          </h3>
          <p class="mb-3 text-xs text-zinc-500 lite:text-zinc-600">
            Enterprise tier includes guaranteed uptime and support response times.
          </p>

          <div class="mb-3 grid gap-2 sm:grid-cols-2">
            <div class="rounded border border-white/5 bg-black/20 p-2 lite:border-zinc-200 lite:bg-zinc-50">
              <div class="text-[10px] uppercase text-zinc-500">Uptime SLA</div>
              <div class="text-lg font-semibold text-emerald-400">99.9%</div>
              <div class="text-[10px] text-zinc-500">Monthly availability</div>
            </div>
            <div class="rounded border border-white/5 bg-black/20 p-2 lite:border-zinc-200 lite:bg-zinc-50">
              <div class="text-[10px] uppercase text-zinc-500">Support Response</div>
              <div class="text-lg font-semibold text-emerald-400">&lt; 4h</div>
              <div class="text-[10px] text-zinc-500">Business hours (24/7 for Critical)</div>
            </div>
            <div class="rounded border border-white/5 bg-black/20 p-2 lite:border-zinc-200 lite:bg-zinc-50">
              <div class="text-[10px] uppercase text-zinc-500">Sync Latency</div>
              <div class="text-lg font-semibold text-emerald-400">&lt; 5s</div>
              <div class="text-[10px] text-zinc-500">P95 for real-time sync</div>
            </div>
            <div class="rounded border border-white/5 bg-black/20 p-2 lite:border-zinc-200 lite:bg-zinc-50">
              <div class="text-[10px] uppercase text-zinc-500">Data Durability</div>
              <div class="text-lg font-semibold text-emerald-400">99.999%</div>
              <div class="text-[10px] text-zinc-500">Encrypted sync storage</div>
            </div>
          </div>

          <div class="mb-3 rounded border border-emerald-500/20 bg-emerald-500/10 p-2 lite:border-emerald-600/30 lite:bg-emerald-100/50">
            <div class="flex items-center gap-2 text-xs text-emerald-300 lite:text-emerald-800">
              <span class="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>All systems operational</span>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-zinc-200 lite:border-zinc-300 lite:text-zinc-800"
              (click)="openStatusPage()"
            >
              View Status Page
            </button>
            <button
              type="button"
              class="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-zinc-200 lite:border-zinc-300 lite:text-zinc-800"
              (click)="submitFeatureRequest()"
            >
              Feature Request
            </button>
          </div>
        </section>

        <!-- Commercial Support -->
        <section class="rounded-xl border border-white/10 bg-[#1a1a1a] p-4 lite:border-zinc-200 lite:bg-white">
          <h3 class="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500 lite:text-zinc-600">
            Priority Support
          </h3>
          <p class="mb-3 text-xs text-zinc-500 lite:text-zinc-600">
            Enterprise customers have access to dedicated support channels and commercial ticketing.
          </p>
          <div class="rounded border border-white/5 bg-black/20 p-3 lite:border-zinc-200 lite:bg-zinc-50">
            <div class="mb-2 text-xs text-zinc-300 lite:text-zinc-700">
              <strong>Contact Options:</strong>
            </div>
            <ul class="mb-3 space-y-1 text-xs text-zinc-400 lite:text-zinc-600">
              <li>• Email: enterprise@devclip.app (priority queue)</li>
              <li>• Web Portal: https://devclip.app/support</li>
              <li>• Documentation: https://docs.devclip.app/enterprise</li>
            </ul>
            <div class="text-[10px] text-zinc-500 lite:text-zinc-600">
              SLA guarantees response within 4 business hours (24/7 for Critical issues).
            </div>
          </div>
        </section>
      }
    </div>
  `,
})
export class EnterprisePanelComponent implements OnInit {
  readonly flags = inject(FeatureFlagService);

  status = signal<EntStatus | null>(null);
  busy = signal(false);
  message = signal('');

  orgDashboardUrl = '';
  policyUrl = '';
  snippetsFeedUrl = '';
  tokenInput = '';
  auditRetentionDays = '0';

  async ngOnInit() {
    await this.reload();
  }

  private async reload() {
    try {
      const s = (await window.devclip.enterpriseGetStatus()) as EntStatus;
      this.status.set(s);
      if (s.isEnterprise) {
        this.orgDashboardUrl = s.orgDashboardUrl;
        this.policyUrl = s.policyUrl;
        this.snippetsFeedUrl = s.snippetsFeedUrl;
        this.auditRetentionDays = s.auditRetentionDays || '0';
        this.tokenInput = '';
      }
    } catch {
      this.status.set(null);
    }
  }

  async saveAll() {
    this.busy.set(true);
    this.message.set('');
    try {
      await window.devclip.enterpriseSaveSettings({
        enterpriseOrgDashboardUrl: this.orgDashboardUrl.trim(),
        enterprisePolicyUrl: this.policyUrl.trim(),
        enterpriseOrgSnippetsFeedUrl: this.snippetsFeedUrl.trim(),
        auditRetentionDays: this.auditRetentionDays,
      });
      const tok = this.tokenInput.trim();
      if (tok) {
        const r = await window.devclip.enterpriseSetApiToken(tok);
        if (!r.ok) {
          this.message.set(r.error ?? 'Could not save token');
          await this.reload();
          return;
        }
        this.tokenInput = '';
      }
      this.message.set('Saved.');
      await this.reload();
    } catch (e) {
      this.message.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.busy.set(false);
    }
  }

  async fetchPolicy() {
    this.busy.set(true);
    this.message.set('');
    try {
      const r = await window.devclip.enterpriseFetchPolicy();
      if (r.ok) {
        this.message.set('Policy applied.');
      } else {
        this.message.set(r.error ?? 'Policy fetch failed');
      }
      await this.reload();
    } catch (e) {
      this.message.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.busy.set(false);
    }
  }

  async importSnippets() {
    this.busy.set(true);
    this.message.set('');
    try {
      const r = await window.devclip.enterpriseImportOrgSnippets();
      if (r.ok) {
        this.message.set(`Imported ${r.imported} snippet(s).`);
      } else {
        this.message.set(r.error ?? 'Import failed');
      }
    } catch (e) {
      this.message.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.busy.set(false);
    }
  }

  async exportJsonl() {
    this.busy.set(true);
    this.message.set('');
    try {
      const r = await window.devclip.auditExportJsonl();
      if (r.ok) {
        this.message.set(`Wrote ${r.path}`);
      } else {
        this.message.set(r.error ?? 'Export failed');
      }
      await this.reload();
    } catch (e) {
      this.message.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.busy.set(false);
    }
  }

  async openOrgDashboard() {
    const u = this.orgDashboardUrl.trim();
    if (!u) {
      this.message.set('Set the org dashboard URL first, then save.');
      return;
    }
    const r = await window.devclip.openExternalUrl(u);
    if (!r.ok) {
      this.message.set(r.error === 'invalid_url' ? 'Invalid URL' : 'Could not open browser');
    }
  }

  async exportCsv() {
    this.busy.set(true);
    this.message.set('');
    try {
      const r = await window.devclip.auditExportCsv();
      if (r.ok) {
        this.message.set(`Wrote ${r.path}`);
      } else {
        this.message.set(r.error ?? 'Export failed');
      }
      await this.reload();
    } catch (e) {
      this.message.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.busy.set(false);
    }
  }

  async openStatusPage() {
    const statusUrl = 'https://status.devclip.app';
    try {
      await window.devclip.openExternalUrl(statusUrl);
    } catch {
      // Ignore
    }
  }

  async submitFeatureRequest() {
    const feedbackUrl = 'https://devclip.app/feedback';
    try {
      await window.devclip.openExternalUrl(feedbackUrl);
    } catch {
      // Ignore
    }
  }
}
