import { Injectable } from '@angular/core';
import type { ClipType } from '../models/clip.model';
import type { ClipAction } from '../models/action.model';

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/gi;

function supports(action: ClipAction, type: ClipType): boolean {
  if (action.supportedTypes === 'all') return true;
  return action.supportedTypes.includes(type);
}

function wordsFromLine(line: string): string[] {
  return line
    .trim()
    .split(/[\s_\-/.]+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean);
}

function toCamelCaseSegment(s: string): string {
  if (!s) return '';
  return s[0]!.toUpperCase() + s.slice(1).toLowerCase();
}

function lineCaseTransform(
  content: string,
  mode: 'camel' | 'snake' | 'pascal' | 'scream' | 'kebab' | 'title'
): string {
  return content
    .split('\n')
    .map((line) => {
      const w = wordsFromLine(line);
      if (w.length === 0) return line;
      switch (mode) {
        case 'camel':
          return (
            w[0]!.toLowerCase() +
            w
              .slice(1)
              .map(toCamelCaseSegment)
              .join('')
          );
        case 'pascal':
          return w.map(toCamelCaseSegment).join('');
        case 'snake':
        case 'scream':
          const snake = w.map((x) => x.toLowerCase()).join('_');
          return mode === 'scream' ? snake.toUpperCase() : snake;
        case 'kebab':
          return w.map((x) => x.toLowerCase()).join('-');
        case 'title':
          return w.map((x) => x[0]!.toUpperCase() + x.slice(1).toLowerCase()).join(' ');
        default:
          return line;
      }
    })
    .join('\n');
}

function b64UrlDecode(segment: string): string {
  let s = segment.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  try {
    return decodeURIComponent(
      Array.from(bin)
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  } catch {
    return bin;
  }
}

function parseTimestampInput(c: string): { label: string; iso: string; unixSec: number } | null {
  const t = c.trim();
  if (!t) return null;
  const num = /^-?\d+(\.\d+)?$/.test(t) ? parseFloat(t) : NaN;
  let ms: number;
  if (Number.isFinite(num)) {
    ms = num < 1e12 ? num * 1000 : num;
  } else {
    const d = Date.parse(t);
    if (Number.isNaN(d)) return null;
    ms = d;
  }
  const d = new Date(ms);
  return {
    label: d.toString(),
    iso: d.toISOString(),
    unixSec: Math.floor(ms / 1000),
  };
}

function parseNumberForBases(c: string): bigint | null {
  const t = c.trim();
  if (!t) return null;
  try {
    if (/^0x[0-9a-f]+$/i.test(t)) return BigInt(t);
    if (/^0b[01]+$/i.test(t)) return BigInt(t);
    if (/^0o[0-7]+$/i.test(t)) return BigInt(t);
    if (/^-?\d+$/.test(t)) return BigInt(t);
  } catch {
    return null;
  }
  return null;
}

@Injectable({ providedIn: 'root' })
export class ActionService {
  readonly all: ClipAction[] = [
    {
      id: 'format-json',
      name: 'Format JSON',
      description: 'Pretty-print JSON',
      supportedTypes: ['json'],
      run: (c) => JSON.stringify(JSON.parse(c), null, 2),
    },
    {
      id: 'minify-json',
      name: 'Minify JSON',
      description: 'Single-line JSON',
      supportedTypes: ['json'],
      run: (c) => JSON.stringify(JSON.parse(c)),
    },
    {
      id: 'base64-encode',
      name: 'Base64 encode',
      description: 'Encode as Base64',
      supportedTypes: 'all',
      run: (c) => btoa(unescape(encodeURIComponent(c))),
    },
    {
      id: 'base64-decode',
      name: 'Base64 decode',
      description: 'Decode Base64',
      supportedTypes: 'all',
      run: (c) => decodeURIComponent(escape(atob(c.trim()))),
    },
    {
      id: 'url-encode',
      name: 'URL encode',
      description: 'encodeURIComponent',
      supportedTypes: 'all',
      run: (c) => encodeURIComponent(c),
    },
    {
      id: 'url-decode',
      name: 'URL decode',
      description: 'decodeURIComponent',
      supportedTypes: 'all',
      run: (c) => decodeURIComponent(c),
    },
    {
      id: 'extract-urls',
      name: 'Extract URLs',
      description: 'List URLs in text',
      supportedTypes: 'all',
      run: (c) => {
        const m = c.match(URL_RE);
        return m ? [...new Set(m)].join('\n') : '';
      },
    },
    {
      id: 'extract-emails',
      name: 'Extract emails',
      description: 'List email addresses',
      supportedTypes: 'all',
      run: (c) => {
        const m = c.match(EMAIL_RE);
        return m ? [...new Set(m)].join('\n') : '';
      },
    },
    {
      id: 'trim-whitespace',
      name: 'Trim & collapse spaces',
      description: 'Trim ends and collapse internal whitespace to single spaces',
      supportedTypes: 'all',
      run: (c) => c.trim().replace(/\s+/g, ' '),
    },
    {
      id: 'normalize-line-endings',
      name: 'Normalize line endings',
      description: 'Convert CRLF and CR to LF',
      supportedTypes: 'all',
      run: (c) => c.replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
    },
    {
      id: 'sort-lines',
      name: 'Sort lines (A–Z)',
      description: 'Sort all lines alphabetically',
      supportedTypes: 'all',
      run: (c) =>
        c
          .split('\n')
          .sort((a, b) => a.localeCompare(b))
          .join('\n'),
    },
    {
      id: 'dedupe-lines',
      name: 'Remove duplicate lines',
      description: 'Preserve first occurrence order',
      supportedTypes: 'all',
      run: (c) => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const line of c.split('\n')) {
          if (seen.has(line)) continue;
          seen.add(line);
          out.push(line);
        }
        return out.join('\n');
      },
    },
    {
      id: 'count-stats',
      name: 'Word / char / line count',
      description: 'Summary counts',
      supportedTypes: 'all',
      run: (c) => {
        const lines = c.length ? c.split('\n').length : 0;
        const words = c.trim() ? c.trim().split(/\s+/).length : 0;
        const chars = c.length;
        const noSpace = c.replace(/\s/g, '').length;
        return [`Lines: ${lines}`, `Words: ${words}`, `Characters: ${chars}`, `Non-space: ${noSpace}`].join(
          '\n'
        );
      },
    },
    {
      id: 'escape-html',
      name: 'Escape HTML entities',
      description: '& < > " \'',
      supportedTypes: 'all',
      run: (c) =>
        c
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;'),
    },
    {
      id: 'unescape-html',
      name: 'Unescape HTML entities',
      description: 'Common named and numeric entities',
      supportedTypes: 'all',
      run: (c) => {
        const ta = document.createElement('textarea');
        ta.innerHTML = c;
        return ta.value;
      },
    },
    {
      id: 'escape-json-string',
      name: 'Escape JSON string',
      description: 'Wrap as JSON string literal',
      supportedTypes: 'all',
      run: (c) => JSON.stringify(c),
    },
    {
      id: 'unescape-json-string',
      name: 'Unescape JSON string',
      description: 'Parse JSON string literal (or raw text as quoted string)',
      supportedTypes: 'all',
      run: (c) => {
        const t = c.trim();
        try {
          const v = JSON.parse(t);
          return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
        } catch {
          try {
            return String(JSON.parse(`"${t.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`));
          } catch {
            return '(invalid JSON string)';
          }
        }
      },
    },
    {
      id: 'jwt-decode',
      name: 'Decode JWT payload',
      description: 'Header + payload (no verification)',
      supportedTypes: 'all',
      run: (c) => {
        const parts = c.trim().split('.');
        if (parts.length < 2) return '(not a JWT)';
        try {
          const header = JSON.stringify(JSON.parse(b64UrlDecode(parts[0]!)), null, 2);
          const payload = JSON.stringify(JSON.parse(b64UrlDecode(parts[1]!)), null, 2);
          return `--- Header ---\n${header}\n\n--- Payload ---\n${payload}`;
        } catch {
          return '(could not decode JWT segments)';
        }
      },
    },
    {
      id: 'timestamp-convert',
      name: 'Timestamp convert',
      description: 'Unix ↔ ISO (paste number or ISO/date string)',
      supportedTypes: 'all',
      run: (c) => {
        const p = parseTimestampInput(c);
        if (!p) return '(unrecognized timestamp)';
        return [
          `Local: ${p.label}`,
          `ISO UTC: ${p.iso}`,
          `Unix seconds: ${p.unixSec}`,
          `Unix ms: ${p.unixSec * 1000}`,
        ].join('\n');
      },
    },
    {
      id: 'number-bases',
      name: 'Number bases',
      description: 'Decimal ↔ hex ↔ binary ↔ octal (integer)',
      supportedTypes: 'all',
      run: (c) => {
        const n = parseNumberForBases(c);
        if (n === null) return '(use integer, 0x.., 0b.., or 0o..)';
        if (n < 0n) return '(negative not supported)';
        return [
          `Decimal: ${n.toString(10)}`,
          `Hex: 0x${n.toString(16)}`,
          `Binary: 0b${n.toString(2)}`,
          `Octal: 0o${n.toString(8)}`,
        ].join('\n');
      },
    },
    {
      id: 'diff-blocks',
      name: 'Diff two blocks',
      description: 'Second clip from list, or split selected clip by a line with only ---',
      supportedTypes: 'all',
      run: (c, extra) => {
        let a: string;
        let b: string;
        const second = extra?.diffSecondText?.trim();
        if (second) {
          a = c;
          b = second;
        } else {
          const parts = c.split(/\n---\s*\n/);
          if (parts.length < 2) {
            return 'Pick a second clip below, or use a line with only --- between left and right in one clip.';
          }
          a = parts[0] ?? '';
          b = parts.slice(1).join('\n---\n');
        }
        const la = a.split('\n');
        const lb = b.split('\n');
        const max = Math.max(la.length, lb.length);
        const out: string[] = [];
        for (let i = 0; i < max; i++) {
          const left = la[i] ?? '';
          const right = lb[i] ?? '';
          if (left === right) {
            out.push(`  ${left}`);
          } else {
            out.push(`< ${left}`);
            out.push(`> ${right}`);
          }
        }
        return out.join('\n');
      },
    },
    {
      id: 'diff-two-clips',
      name: 'Diff two clips (split)',
      description: 'Pick a second clip; side-by-side line diff in preview; copy unified diff',
      supportedTypes: 'all',
      run: (c, extra) => {
        const second = extra?.diffSecondText?.trim();
        if (!second) {
          return 'Select a second clip from the list. The preview shows a side-by-side line diff.';
        }
        const la = c.split('\n');
        const lb = second.split('\n');
        const max = Math.max(la.length, lb.length);
        const out: string[] = [];
        for (let i = 0; i < max; i++) {
          const left = la[i] ?? '';
          const right = lb[i] ?? '';
          if (left === right) {
            out.push(`  ${left}`);
          } else {
            out.push(`< ${left}`);
            out.push(`> ${right}`);
          }
        }
        return out.join('\n');
      },
    },
    {
      id: 'expand-shortcode',
      name: 'Expand snippet shortcode',
      description: 'Resolve :name or shortcode to snippet body',
      supportedTypes: 'all',
      run: async (c) => {
        const token = c.trim().replace(/^:/, '').trim();
        if (!token) return c;
        const row = await window.devclip.resolveSnippetShortcode(token);
        if (row && typeof row['content'] === 'string') return row['content'];
        return `(no snippet for "${token}")`;
      },
    },
    {
      id: 'hash-md5',
      name: 'MD5 hash',
      description: 'Hex digest (UTF-8)',
      supportedTypes: 'all',
      run: (c) => window.devclip.cryptoDigest('md5', c),
    },
    {
      id: 'hash-sha1',
      name: 'SHA-1 hash',
      description: 'Hex digest (UTF-8)',
      supportedTypes: 'all',
      run: (c) => window.devclip.cryptoDigest('sha1', c),
    },
    {
      id: 'hash-sha256',
      name: 'SHA-256 hash',
      description: 'Hex digest (UTF-8)',
      supportedTypes: 'all',
      run: (c) => window.devclip.cryptoDigest('sha256', c),
    },
    {
      id: 'case-camel',
      name: 'camelCase (per line)',
      description: 'Words → camelCase',
      supportedTypes: 'all',
      run: (c) => lineCaseTransform(c, 'camel'),
    },
    {
      id: 'case-snake',
      name: 'snake_case (per line)',
      description: 'Words → snake_case',
      supportedTypes: 'all',
      run: (c) => lineCaseTransform(c, 'snake'),
    },
    {
      id: 'case-pascal',
      name: 'PascalCase (per line)',
      description: 'Words → PascalCase',
      supportedTypes: 'all',
      run: (c) => lineCaseTransform(c, 'pascal'),
    },
    {
      id: 'case-scream',
      name: 'SCREAMING_SNAKE (per line)',
      description: 'Words → UPPER_SNAKE',
      supportedTypes: 'all',
      run: (c) => lineCaseTransform(c, 'scream'),
    },
    {
      id: 'case-kebab',
      name: 'kebab-case (per line)',
      description: 'Words → kebab-case',
      supportedTypes: 'all',
      run: (c) => lineCaseTransform(c, 'kebab'),
    },
    {
      id: 'case-title',
      name: 'Title Case (per line)',
      description: 'Words → Title Case',
      supportedTypes: 'all',
      run: (c) => lineCaseTransform(c, 'title'),
    },
    {
      id: 'regex-replace',
      name: 'Regex replace',
      description: 'Find/replace with regex',
      supportedTypes: 'all',
      run: (c, extra) => {
        const find = extra?.find ?? '';
        const re = new RegExp(find, 'g');
        return c.replace(re, extra?.replace ?? '');
      },
    },
  ];

  forType(type: ClipType): ClipAction[] {
    return this.all.filter((a) => supports(a, type));
  }
}
