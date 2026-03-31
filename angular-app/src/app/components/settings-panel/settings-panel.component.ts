import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ThemeSetting } from '../../services/theme.service';
import { ThemeService } from '../../services/theme.service';
import { FeatureFlagService } from '../../services/feature-flag.service';

@Component({
  selector: 'app-settings-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1 text-sm">
      <section class="rounded-lg border border-white/10 p-3 lite:border-zinc-200">
        <h3 class="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500 lite:text-zinc-600">
          License &amp; account
        </h3>
        <p class="mb-2 text-xs text-zinc-500 lite:text-zinc-600">
          Tier:
          <span class="font-mono text-zinc-300 lite:text-zinc-800">{{ licenseTier }}</span>
          @if (licenseExpires) {
            <span> · Valid until {{ licenseExpires }}</span>
          }
          @if (licenseDevices != null) {
            <span> · Devices (cached): {{ licenseDevices }}</span>
          }
          @if (licenseDevices == null && flags.hasLicenseKey()) {
            <span> · Devices: — (shown when license server returns a count)</span>
          }
        </p>
        <label class="mb-2 flex flex-col gap-1 text-zinc-300 lite:text-zinc-800">
          <span>Account dashboard URL</span>
          <input
            class="rounded border border-white/10 bg-[#2a2a2a] p-2 font-mono text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
            [(ngModel)]="accountDashboardUrl"
            (blur)="persistKey('accountDashboardUrl', accountDashboardUrl.trim())"
            placeholder="https://devclip.app/account"
          />
        </label>
        <label class="mb-2 flex flex-col gap-1 text-zinc-300 lite:text-zinc-800">
          <span>License server URL (optional, Enterprise / self-hosted)</span>
          <input
            class="rounded border border-white/10 bg-[#2a2a2a] p-2 font-mono text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
            [(ngModel)]="licenseServerUrl"
            (blur)="onLicenseServerBlur()"
            placeholder="https://…"
          />
        </label>
        <label class="mb-2 flex flex-col gap-1 text-zinc-300 lite:text-zinc-800">
          <span>API key</span>
          <input
            type="password"
            class="rounded border border-white/10 bg-[#2a2a2a] p-2 font-mono text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
            [(ngModel)]="licenseKeyInput"
            autocomplete="off"
            placeholder="Paste key (stored encrypted when OS allows)"
          />
        </label>
        <div class="mb-2 flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-lg bg-devclip-accent px-3 py-1.5 text-xs font-semibold text-black"
            (click)="saveLicenseKey()"
          >
            Save key
          </button>
          <button
            type="button"
            class="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-300 lite:border-zinc-400 lite:text-zinc-800"
            (click)="clearLicenseKey()"
          >
            Remove key on this device
          </button>
          <button
            type="button"
            class="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-300 lite:border-zinc-400 lite:text-zinc-800"
            (click)="openAccountDashboard()"
          >
            Open account in browser
          </button>
        </div>
        @if (licenseUiMessage) {
          <p class="text-xs text-zinc-500 lite:text-zinc-600">{{ licenseUiMessage }}</p>
        }
      </section>

      <section class="rounded-lg border border-white/10 p-3 lite:border-zinc-200">
        <h3 class="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500 lite:text-zinc-600">
          Clipboard
        </h3>
        @if (!flags.isProUnlocked()) {
          <label class="mb-2 flex flex-col gap-1 text-zinc-300 lite:text-zinc-800">
            <span>History limit ({{ historyLimit }} items, {{ hlMin }}–{{ hlMax }})</span>
            <input
              type="range"
              class="w-full accent-devclip-accent"
              [min]="hlMin"
              [max]="hlMax"
              [step]="50"
              [(ngModel)]="historyLimit"
              (change)="persistKey('historyLimit', '' + historyLimit)"
            />
          </label>
        } @else {
          <label class="mb-2 flex flex-col gap-1 text-zinc-300 lite:text-zinc-800">
            <span>Pro history cap ({{ proHistoryCapDisplay }} stored clips; pinned items are not pruned)</span>
            <input
              type="number"
              class="w-full rounded border border-white/10 bg-[#2a2a2a] p-2 font-mono text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
              min="0"
              max="10000000"
              step="1000"
              [(ngModel)]="proHistoryCapInput"
              (change)="persistProCap()"
            />
            <span class="text-[10px] text-zinc-600 lite:text-zinc-500">0 = default cap (~2M).</span>
          </label>
        }
        <label class="mb-2 flex flex-col gap-1 text-zinc-300 lite:text-zinc-800">
          <span>Poll interval ({{ clipboardPollMs }} ms, 100–5000)</span>
          <input
            type="range"
            class="w-full accent-devclip-accent"
            min="100"
            max="5000"
            step="50"
            [(ngModel)]="clipboardPollMs"
            (change)="persistKey('clipboardPollMs', '' + clipboardPollMs)"
          />
        </label>
        <label class="flex cursor-pointer items-center gap-2 text-zinc-300 lite:text-zinc-800">
          <input type="checkbox" [(ngModel)]="autoClearOnExit" (change)="persistBool('autoClearHistoryOnExit', autoClearOnExit)" />
          Auto-clear history on app exit
        </label>
      </section>

      <section class="rounded-lg border border-white/10 p-3 lite:border-zinc-200">
        <h3 class="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500 lite:text-zinc-600">
          Overlay
        </h3>
        <label class="mb-2 flex flex-col gap-1 text-zinc-300 lite:text-zinc-800">
          <span>Global shortcut (Electron accelerator, empty = defaults)</span>
          <input
            class="rounded border border-white/10 bg-[#2a2a2a] p-2 font-mono text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
            [(ngModel)]="overlayShortcut"
            (blur)="persistKey('overlayShortcut', overlayShortcut.trim())"
            placeholder="CommandOrControl+Shift+V"
          />
        </label>
        <label class="mb-2 flex flex-col gap-1 text-zinc-300 lite:text-zinc-800">
          <span>Overlay position</span>
          <select
            class="rounded border border-white/10 bg-[#2a2a2a] p-2 text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
            [(ngModel)]="overlayPosition"
            (change)="persistKey('overlayPosition', overlayPosition)"
          >
            <option value="center">Center</option>
            <option value="top">Top</option>
            <option value="bottom">Bottom</option>
          </select>
        </label>
        <label class="flex cursor-pointer items-center gap-2 text-zinc-300 lite:text-zinc-800">
          <input type="checkbox" [(ngModel)]="overlayFuzzySearch" (change)="persistBool('overlayFuzzySearch', overlayFuzzySearch)" />
          Fuzzy search in overlay (subsequence match)
        </label>
      </section>

      <section class="rounded-lg border border-white/10 p-3 lite:border-zinc-200">
        <h3 class="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500 lite:text-zinc-600">
          Appearance
        </h3>
        <label class="mb-2 flex flex-col gap-1 text-zinc-300 lite:text-zinc-800">
          <span>Theme</span>
          <select
            class="rounded border border-white/10 bg-[#2a2a2a] p-2 text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
            [(ngModel)]="theme"
            (change)="onThemeChange()"
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="system">System</option>
          </select>
        </label>
        <label class="mb-2 flex flex-col gap-1 text-zinc-300 lite:text-zinc-800">
          <span>Font scale ({{ uiFontScale }}%)</span>
          <input
            type="range"
            class="w-full accent-devclip-accent"
            min="80"
            max="140"
            step="5"
            [(ngModel)]="uiFontScale"
            (change)="onFontScaleChange()"
          />
        </label>
        <label class="flex flex-col gap-1 text-zinc-300 lite:text-zinc-800">
          <span>Density</span>
          <select
            class="rounded border border-white/10 bg-[#2a2a2a] p-2 text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
            [(ngModel)]="uiDensity"
            (change)="onDensityChange()"
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </label>
      </section>

      <section class="rounded-lg border border-white/10 p-3 lite:border-zinc-200">
        <h3 class="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500 lite:text-zinc-600">
          Startup
        </h3>
        <label class="flex cursor-pointer items-center gap-2 text-zinc-300 lite:text-zinc-800">
          <input type="checkbox" [(ngModel)]="launchAtLogin" (change)="persistBool('launchAtLogin', launchAtLogin)" />
          Launch at system startup
        </label>
      </section>

      <section class="rounded-lg border border-white/10 p-3 lite:border-zinc-200">
        <h3 class="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500 lite:text-zinc-600">
          Privacy
        </h3>
        <label class="mb-2 flex cursor-pointer items-center gap-2 text-zinc-300 lite:text-zinc-800">
          <input
            type="checkbox"
            [(ngModel)]="secureDeleteOnRemove"
            (change)="persistBool('secureDeleteOnRemove', secureDeleteOnRemove)"
          />
          Secure delete (overwrite clip text before removing from the database)
        </label>
        <label class="mb-2 flex cursor-pointer items-center gap-2 text-zinc-300 lite:text-zinc-800">
          <input type="checkbox" [(ngModel)]="privateMode" (change)="persistBool('privateMode', privateMode)" />
          Private mode (do not save clipboard to history)
        </label>
        <div>
          <div class="mb-1 text-xs font-semibold text-zinc-500 lite:text-zinc-600">
            Ignore apps (JSON array of substrings)
          </div>
          <textarea
            class="h-20 w-full rounded border border-white/10 bg-[#2a2a2a] p-2 font-mono text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
            [(ngModel)]="ignoreAppsJson"
            (blur)="persistJsonKey('ignoreApps', ignoreAppsJson)"
          ></textarea>
        </div>
        <div class="mt-2">
          <div class="mb-1 text-xs font-semibold text-zinc-500 lite:text-zinc-600">
            Ignore patterns (JSON array of regex strings)
          </div>
          <textarea
            class="h-20 w-full rounded border border-white/10 bg-[#2a2a2a] p-2 font-mono text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
            [(ngModel)]="ignorePatternsJson"
            (blur)="persistJsonKey('ignorePatterns', ignorePatternsJson)"
          ></textarea>
        </div>
      </section>

      <section class="rounded-lg border border-white/10 p-3 lite:border-zinc-200">
        <h3 class="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500 lite:text-zinc-600">
          App lock
        </h3>
        <p class="mb-2 text-xs text-zinc-500 lite:text-zinc-600">
          Require a PIN when opening the app. Session resets when you disable lock or restart with lock off.
        </p>
        <label class="mb-2 flex flex-col gap-1 text-zinc-300 lite:text-zinc-800">
          <span>New PIN (min 4 characters)</span>
          <input
            type="password"
            class="rounded border border-white/10 bg-[#2a2a2a] p-2 font-mono text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
            [(ngModel)]="lockPinNew"
            autocomplete="new-password"
          />
        </label>
        <label class="mb-2 flex flex-col gap-1 text-zinc-300 lite:text-zinc-800">
          <span>Confirm PIN</span>
          <input
            type="password"
            class="rounded border border-white/10 bg-[#2a2a2a] p-2 font-mono text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
            [(ngModel)]="lockPinConfirm"
            autocomplete="new-password"
          />
        </label>
        <div class="mb-2 flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-lg bg-devclip-accent px-3 py-1.5 text-xs font-semibold text-black"
            (click)="setAppLockPin()"
          >
            Save PIN &amp; enable lock
          </button>
          <button
            type="button"
            class="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-300 lite:border-zinc-400 lite:text-zinc-800"
            (click)="clearAppLockPin()"
          >
            Disable lock
          </button>
        </div>
        @if (lockUiMessage) {
          <p class="text-xs text-zinc-500 lite:text-zinc-600">{{ lockUiMessage }}</p>
        }
      </section>

      @if (flags.isProUnlocked()) {
        <section class="rounded-lg border border-white/10 p-3 lite:border-zinc-200">
          <h3 class="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500 lite:text-zinc-600">
            AI Actions
          </h3>
          <p class="mb-2 text-xs text-zinc-500 lite:text-zinc-600">
            Provider keys are stored on this device (OS secure storage when available). Requests go directly to
            the vendor API, or to your hosted OpenAI-compatible base URL.
          </p>
          <label class="mb-2 flex flex-col gap-1 text-zinc-300 lite:text-zinc-800">
            <span>Provider</span>
            <select
              class="rounded border border-white/10 bg-[#2a2a2a] p-2 text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
              [(ngModel)]="aiProvider"
              (change)="onAiProviderChange()"
            >
              <option value="openai">OpenAI (BYOK)</option>
              <option value="anthropic">Anthropic (BYOK)</option>
              <option value="hosted">Hosted / OpenAI-compatible proxy</option>
            </select>
          </label>
          <label class="mb-2 flex flex-col gap-1 text-zinc-300 lite:text-zinc-800">
            <span>Model name</span>
            <input
              class="rounded border border-white/10 bg-[#2a2a2a] p-2 font-mono text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
              [(ngModel)]="aiModel"
              (blur)="persistKey('aiModel', aiModel.trim())"
              placeholder="e.g. gpt-4o-mini or claude-3-5-haiku-20241022"
            />
          </label>
          @if (aiProvider === 'hosted') {
            <label class="mb-2 flex flex-col gap-1 text-zinc-300 lite:text-zinc-800">
              <span>Base URL (OpenAI-compatible, include /v1)</span>
              <input
                class="rounded border border-white/10 bg-[#2a2a2a] p-2 font-mono text-xs text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
                [(ngModel)]="aiHostedBaseUrl"
                (blur)="persistKey('aiHostedBaseUrl', aiHostedBaseUrl.trim())"
                placeholder="https://api.example.com/v1"
              />
            </label>
          }
          <label class="mb-3 flex cursor-pointer items-start gap-2 text-zinc-300 lite:text-zinc-800">
            <input type="checkbox" [(ngModel)]="aiAppendToHistory" (change)="onAiAppendChange()" />
            <span>Append AI output to clipboard history as new clips</span>
          </label>
          <div class="mb-2 grid gap-2 sm:grid-cols-3">
            <div class="rounded border border-white/10 p-2 lite:border-zinc-200">
              <div class="mb-1 text-[10px] font-semibold uppercase text-zinc-500">OpenAI</div>
              @if (aiKeyOpenai) {
                <span class="text-[10px] text-emerald-500">Key stored</span>
              } @else {
                <span class="text-[10px] text-zinc-600">Not set</span>
              }
              <input
                type="password"
                class="mt-1 w-full rounded border border-white/10 bg-[#2a2a2a] p-1.5 font-mono text-[10px] text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
                [(ngModel)]="aiKeyOpenaiInput"
                autocomplete="off"
                placeholder="sk-…"
              />
              <button
                type="button"
                class="mt-1 w-full rounded bg-zinc-700 py-1 text-[10px] text-white lite:bg-zinc-200 lite:text-zinc-900"
                (click)="saveAiKey('openai')"
              >
                Save
              </button>
            </div>
            <div class="rounded border border-white/10 p-2 lite:border-zinc-200">
              <div class="mb-1 text-[10px] font-semibold uppercase text-zinc-500">Anthropic</div>
              @if (aiKeyAnthropic) {
                <span class="text-[10px] text-emerald-500">Key stored</span>
              } @else {
                <span class="text-[10px] text-zinc-600">Not set</span>
              }
              <input
                type="password"
                class="mt-1 w-full rounded border border-white/10 bg-[#2a2a2a] p-1.5 font-mono text-[10px] text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
                [(ngModel)]="aiKeyAnthropicInput"
                autocomplete="off"
              />
              <button
                type="button"
                class="mt-1 w-full rounded bg-zinc-700 py-1 text-[10px] text-white lite:bg-zinc-200 lite:text-zinc-900"
                (click)="saveAiKey('anthropic')"
              >
                Save
              </button>
            </div>
            <div class="rounded border border-white/10 p-2 lite:border-zinc-200">
              <div class="mb-1 text-[10px] font-semibold uppercase text-zinc-500">Hosted</div>
              @if (aiKeyHosted) {
                <span class="text-[10px] text-emerald-500">Key stored</span>
              } @else {
                <span class="text-[10px] text-zinc-600">Not set</span>
              }
              <input
                type="password"
                class="mt-1 w-full rounded border border-white/10 bg-[#2a2a2a] p-1.5 font-mono text-[10px] text-white lite:border-zinc-300 lite:bg-white lite:text-zinc-900"
                [(ngModel)]="aiKeyHostedInput"
                autocomplete="off"
              />
              <button
                type="button"
                class="mt-1 w-full rounded bg-zinc-700 py-1 text-[10px] text-white lite:bg-zinc-200 lite:text-zinc-900"
                (click)="saveAiKey('hosted')"
              >
                Save
              </button>
            </div>
          </div>
          @if (aiKeyMessage) {
            <p class="text-xs text-zinc-500 lite:text-zinc-600">{{ aiKeyMessage }}</p>
          }
        </section>
      }

      @if (flags.isProUnlocked()) {
        <section class="rounded-lg border border-white/10 p-3 lite:border-zinc-200">
          <h3 class="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500 lite:text-zinc-600">
            Vault
          </h3>
          <p class="mb-2 text-xs text-zinc-500 lite:text-zinc-600">
            Auto-move secret clips only runs while the vault is unlocked in this session (separate vault PIN).
          </p>
          <label class="mb-2 flex cursor-pointer items-start gap-2 text-zinc-300 lite:text-zinc-800">
            <input type="checkbox" [(ngModel)]="vaultAutoSecret" (change)="onVaultAutoSecretChange()" />
            <span
              >Automatically move detected <code class="rounded bg-white/5 px-1 text-[10px]">secret</code> clips
              into the encrypted vault</span
            >
          </label>
          <label class="flex cursor-pointer items-start gap-2 text-zinc-300 lite:text-zinc-800">
            <input type="checkbox" [(ngModel)]="vaultRemoveOnAdd" (change)="onVaultRemoveOnAddChange()" />
            <span>Remove clips from history after adding them to the vault from History</span>
          </label>
        </section>
      }

      <p class="text-[10px] text-zinc-600 lite:text-zinc-500">
        Shortcut, poll interval, overlay position, and launch-at-login apply within a few seconds in the main
        process.
      </p>
    </div>
  `,
})
export class SettingsPanelComponent implements OnInit {
  private readonly themeSvc = inject(ThemeService);
  readonly flags = inject(FeatureFlagService);

  readonly hlMin = 100;
  readonly hlMax = 1000;

  privateMode = false;
  ignoreAppsJson = '[]';
  ignorePatternsJson = '[]';
  historyLimit = 1000;
  overlayShortcut = '';
  clipboardPollMs = 500;
  theme: ThemeSetting = 'dark';
  launchAtLogin = false;
  overlayPosition = 'center';
  uiFontScale = 100;
  uiDensity: 'comfortable' | 'compact' = 'comfortable';
  overlayFuzzySearch = false;
  autoClearOnExit = false;
  secureDeleteOnRemove = false;

  licenseTier = 'free';
  licenseExpires = '';
  licenseDevices: number | null = null;
  licenseServerUrl = '';
  accountDashboardUrl = 'https://devclip.app/account';
  licenseKeyInput = '';
  licenseUiMessage = '';

  proHistoryCapInput = 0;

  lockPinNew = '';
  lockPinConfirm = '';
  lockUiMessage = '';

  vaultAutoSecret = false;
  vaultRemoveOnAdd = true;

  aiProvider: 'openai' | 'anthropic' | 'hosted' = 'openai';
  aiModel = 'gpt-4o-mini';
  aiHostedBaseUrl = '';
  aiAppendToHistory = true;
  aiKeyOpenai = false;
  aiKeyAnthropic = false;
  aiKeyHosted = false;
  aiKeyOpenaiInput = '';
  aiKeyAnthropicInput = '';
  aiKeyHostedInput = '';
  aiKeyMessage = '';

  get proHistoryCapDisplay(): string {
    const n = this.proHistoryCapInput;
    if (!Number.isFinite(n) || n <= 0) return 'default (~2M)';
    return String(n);
  }

  async ngOnInit() {
    const s = await window.devclip.settingsGet();
    this.privateMode = s['privateMode'] === '1';
    this.ignoreAppsJson = s['ignoreApps'] ?? '[]';
    this.ignorePatternsJson = s['ignorePatterns'] ?? '[]';
    this.historyLimit = this.clampHl(parseInt(s['historyLimit'] ?? '1000', 10));
    this.overlayShortcut = s['overlayShortcut'] ?? '';
    this.clipboardPollMs = this.clampPoll(parseInt(s['clipboardPollMs'] ?? '500', 10));
    const th = (s['theme'] ?? 'dark').trim();
    this.theme = th === 'light' || th === 'system' ? th : 'dark';
    this.launchAtLogin = s['launchAtLogin'] === '1';
    this.overlayPosition = s['overlayPosition'] ?? 'center';
    this.uiFontScale = this.clampFont(parseInt(s['uiFontScale'] ?? '100', 10));
    const d = (s['uiDensity'] ?? 'comfortable').trim();
    this.uiDensity = d === 'compact' ? 'compact' : 'comfortable';
    this.overlayFuzzySearch = s['overlayFuzzySearch'] === '1';
    this.autoClearOnExit = s['autoClearHistoryOnExit'] === '1';
    this.secureDeleteOnRemove = s['secureDeleteOnRemove'] === '1';
    this.licenseServerUrl = s['licenseServerUrl'] ?? '';
    this.accountDashboardUrl = (s['accountDashboardUrl'] ?? '').trim() || 'https://devclip.app/account';
    const cap = parseInt(s['proHistoryCap'] ?? '0', 10);
    this.proHistoryCapInput = Number.isFinite(cap) ? cap : 0;
    this.vaultAutoSecret = s['vaultAutoSecret'] === '1';
    this.vaultRemoveOnAdd = s['vaultRemoveFromHistoryOnAdd'] !== '0';
    const ap = (s['aiProvider'] ?? 'openai').trim();
    this.aiProvider =
      ap === 'anthropic' ? 'anthropic' : ap === 'hosted' || ap === 'devclip' || ap === 'proxy' ? 'hosted' : 'openai';
    this.aiModel = (s['aiModel'] ?? 'gpt-4o-mini').trim() || 'gpt-4o-mini';
    this.aiHostedBaseUrl = (s['aiHostedBaseUrl'] ?? '').trim();
    this.aiAppendToHistory = s['aiAppendToHistory'] !== '0';
    await this.refreshAiKeyStatus();
    await this.themeSvc.hydrateFromSettings();
    await this.flags.refresh();
    await this.hydrateLicenseDisplay();
  }

  async hydrateLicenseDisplay(): Promise<void> {
    try {
      const st = await window.devclip.licenseGetStatus();
      this.licenseTier = st.tier ?? 'free';
      this.licenseExpires = st.expiresAt ? String(st.expiresAt) : '';
      const dc = st.deviceCount;
      this.licenseDevices =
        typeof dc === 'number' && Number.isFinite(dc) ? dc : null;
    } catch {
      this.licenseTier = 'free';
      this.licenseExpires = '';
      this.licenseDevices = null;
    }
  }

  async onLicenseServerBlur(): Promise<void> {
    await this.persistKey('licenseServerUrl', this.licenseServerUrl.trim());
    await this.flags.refresh();
    await this.hydrateLicenseDisplay();
  }

  async saveLicenseKey(): Promise<void> {
    this.licenseUiMessage = '';
    await window.devclip.licenseSetKey(this.licenseKeyInput.trim());
    this.licenseKeyInput = '';
    await this.flags.refresh();
    await this.hydrateLicenseDisplay();
    this.licenseUiMessage = 'License key saved.';
  }

  async clearLicenseKey(): Promise<void> {
    this.licenseUiMessage = '';
    await window.devclip.licenseClear();
    await this.flags.refresh();
    await this.hydrateLicenseDisplay();
    this.licenseUiMessage = 'Key removed from this device.';
  }

  openAccountDashboard(): void {
    const u = this.accountDashboardUrl.trim();
    if (!u) return;
    void window.devclip.openExternalUrl(u);
  }

  async persistProCap(): Promise<void> {
    let n = Math.round(Number(this.proHistoryCapInput));
    if (!Number.isFinite(n) || n < 0) n = 0;
    if (n > 10_000_000) n = 10_000_000;
    if (n > 0 && n < 1000) n = 1000;
    this.proHistoryCapInput = n;
    await window.devclip.settingsSet('proHistoryCap', String(n));
  }

  async setAppLockPin(): Promise<void> {
    this.lockUiMessage = '';
    if (this.lockPinNew !== this.lockPinConfirm) {
      this.lockUiMessage = 'PINs do not match.';
      return;
    }
    const res = await window.devclip.lockSetPin(this.lockPinNew);
    if (res.ok) {
      this.lockPinNew = '';
      this.lockPinConfirm = '';
      this.lockUiMessage = 'App lock enabled.';
    } else {
      this.lockUiMessage = res.error ?? 'Could not set PIN.';
    }
  }

  async clearAppLockPin(): Promise<void> {
    this.lockUiMessage = '';
    await window.devclip.lockClearPin();
    this.lockPinNew = '';
    this.lockPinConfirm = '';
    this.lockUiMessage = 'App lock disabled.';
  }

  async onVaultAutoSecretChange(): Promise<void> {
    await this.persistKey('vaultAutoSecret', this.vaultAutoSecret ? '1' : '0');
  }

  async onVaultRemoveOnAddChange(): Promise<void> {
    await this.persistKey('vaultRemoveFromHistoryOnAdd', this.vaultRemoveOnAdd ? '1' : '0');
  }

  async refreshAiKeyStatus(): Promise<void> {
    try {
      const st = await window.devclip.aiGetKeyStatus();
      this.aiKeyOpenai = st.openai;
      this.aiKeyAnthropic = st.anthropic;
      this.aiKeyHosted = st.hosted;
    } catch {
      this.aiKeyOpenai = false;
      this.aiKeyAnthropic = false;
      this.aiKeyHosted = false;
    }
  }

  async onAiProviderChange(): Promise<void> {
    await this.persistKey('aiProvider', this.aiProvider);
  }

  async onAiAppendChange(): Promise<void> {
    await this.persistKey('aiAppendToHistory', this.aiAppendToHistory ? '1' : '0');
  }

  async saveAiKey(slot: 'openai' | 'anthropic' | 'hosted'): Promise<void> {
    this.aiKeyMessage = '';
    const raw =
      slot === 'openai'
        ? this.aiKeyOpenaiInput
        : slot === 'anthropic'
          ? this.aiKeyAnthropicInput
          : this.aiKeyHostedInput;
    const res = await window.devclip.aiSetApiKey(slot, raw);
    if (res.ok) {
      if (slot === 'openai') {
        this.aiKeyOpenaiInput = '';
      } else if (slot === 'anthropic') {
        this.aiKeyAnthropicInput = '';
      } else {
        this.aiKeyHostedInput = '';
      }
      this.aiKeyMessage = 'API key saved on this device.';
      await this.refreshAiKeyStatus();
    } else {
      this.aiKeyMessage = res.error ?? 'Could not save key.';
    }
  }

  private clampHl(n: number): number {
    if (Number.isNaN(n)) return 1000;
    return Math.min(this.hlMax, Math.max(this.hlMin, n));
  }

  private clampPoll(n: number): number {
    if (Number.isNaN(n)) return 500;
    return Math.min(5000, Math.max(100, n));
  }

  private clampFont(n: number): number {
    if (Number.isNaN(n)) return 100;
    return Math.min(140, Math.max(80, n));
  }

  async persistKey(key: string, value: string) {
    await window.devclip.settingsSet(key, value);
  }

  async persistBool(key: string, v: boolean) {
    await window.devclip.settingsSet(key, v ? '1' : '0');
  }

  async persistJsonKey(key: string, raw: string) {
    try {
      JSON.parse(raw);
      await window.devclip.settingsSet(key, raw);
    } catch {
      /* keep previous */
    }
  }

  async onThemeChange() {
    await this.persistKey('theme', this.theme);
    this.themeSvc.setTheme(this.theme);
  }

  async onFontScaleChange() {
    await this.persistKey('uiFontScale', String(this.uiFontScale));
    document.documentElement.style.fontSize = `${this.uiFontScale}%`;
  }

  async onDensityChange() {
    await this.persistKey('uiDensity', this.uiDensity);
    document.documentElement.classList.toggle('devclip-density-compact', this.uiDensity === 'compact');
  }
}
