import { Injectable, signal } from '@angular/core';

export type ThemeSetting = 'dark' | 'light' | 'system';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly themeSetting = signal<ThemeSetting>('dark');
  private mediaQuery?: MediaQueryList;
  private boundMq?: () => void;

  async hydrateFromSettings(): Promise<void> {
    const s = await window.devclip.settingsGet();
    const raw = (s['theme'] ?? 'dark').trim() as ThemeSetting;
    const t: ThemeSetting = raw === 'light' || raw === 'system' ? raw : 'dark';
    this.themeSetting.set(t);
    this.applyTheme(t);
    this.attachSystemListener(t);
    const scale = parseInt(s['uiFontScale'] ?? '100', 10);
    if (!Number.isNaN(scale) && scale >= 80 && scale <= 140) {
      document.documentElement.style.fontSize = `${scale}%`;
    }
    const density = (s['uiDensity'] ?? 'comfortable').trim();
    document.documentElement.classList.toggle('devclip-density-compact', density === 'compact');
  }

  setTheme(t: ThemeSetting): void {
    this.themeSetting.set(t);
    this.applyTheme(t);
    this.attachSystemListener(t);
  }

  private applyTheme(t: ThemeSetting): void {
    const root = document.documentElement;
    const prefersDark =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const effectiveDark = t === 'dark' || (t === 'system' && prefersDark);
    root.classList.toggle('dark', effectiveDark);
    root.classList.toggle('devclip-light', !effectiveDark);
    root.style.colorScheme = effectiveDark ? 'dark' : 'light';
  }

  private attachSystemListener(t: ThemeSetting): void {
    if (this.mediaQuery && this.boundMq) {
      this.mediaQuery.removeEventListener('change', this.boundMq);
    }
    if (t !== 'system') {
      this.mediaQuery = undefined;
      this.boundMq = undefined;
      return;
    }
    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.boundMq = () => this.applyTheme('system');
    this.mediaQuery.addEventListener('change', this.boundMq);
  }
}
