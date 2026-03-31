import { Injectable } from '@angular/core';
import type { BundledLanguage, BundledTheme, Highlighter } from 'shiki';
import type { ClipType } from '../models/clip.model';

@Injectable({ providedIn: 'root' })
export class ShikiService {
  private highlighter: Highlighter | null = null;
  private initPromise: Promise<void> | null = null;

  private ensureHighlighter(): Promise<void> {
    if (this.highlighter) {
      return Promise.resolve();
    }
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const { createHighlighter } = await import('shiki');
        this.highlighter = await createHighlighter({
          themes: ['github-dark'],
          langs: ['sql', 'json', 'typescript', 'javascript', 'tsx', 'jsx', 'html', 'css', 'bash'],
        });
      })();
    }
    return this.initPromise;
  }

  async highlightToHtml(content: string, type: ClipType): Promise<string> {
    if (type === 'image' && content.startsWith('data:image/')) {
      const safe = content
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
      return `<div class="devclip-img-preview"><img src="${safe}" alt="" class="max-h-28 max-w-full rounded border border-white/10 object-contain" loading="lazy" /></div>`;
    }
    await this.ensureHighlighter();
    const h = this.highlighter!;
    const lang = this.mapLang(type);
    const theme: BundledTheme = 'github-dark';
    try {
      return h.codeToHtml(content, {
        lang: lang as BundledLanguage,
        theme,
      });
    } catch {
      return h.codeToHtml(content, { lang: 'plaintext', theme });
    }
  }

  private mapLang(type: ClipType): string {
    switch (type) {
      case 'sql':
        return 'sql';
      case 'json':
        return 'json';
      case 'url':
        return 'plaintext';
      case 'code':
        return 'typescript';
      case 'image':
      case 'file-path':
      case 'email':
      case 'secret':
      case 'stack-trace':
      case 'text':
      default:
        return 'plaintext';
    }
  }
}
