import type { ClipType } from '../database/db';

const SQL_START =
  /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|WITH|MERGE|TRUNCATE)\b/i;

const EMAIL_LINE = /^[\w.+-]+@[\w-]+\.[a-z]{2,}$/i;
const STACK_TRACE = /^\s*at\s+.+:\d+:\d+/m;
const STACK_TRACE_ALT = /(at\s+[\w$.]+\s*\([^)]+\)|Caused by:|Exception in thread)/;

const SECRET_PREFIXES =
  /^(sk_live_|sk_test_|ghp_|gho_|github_pat_|xox[baprs]-|AKIA[0-9A-Z]{16}|Bearer\s+ey)/i;

export interface DetectResult {
  type: ClipType;
  confidence: number;
  language?: string;
}

function tryParseJson(text: string): boolean {
  const t = text.trim();
  if (!t || (t[0] !== '{' && t[0] !== '[')) {
    return false;
  }
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

function isUrl(text: string): boolean {
  const t = text.trim();
  return /^https?:\/\//i.test(t);
}

function isSingleLineEmail(text: string): boolean {
  const t = text.trim();
  return t.length < 320 && !/\n/.test(t) && EMAIL_LINE.test(t);
}

function isStackTrace(text: string): boolean {
  const t = text.trim();
  if (t.length < 40) return false;
  return STACK_TRACE.test(t) || (STACK_TRACE_ALT.test(t) && /:\d+/.test(t));
}

function secretHeuristic(text: string): boolean {
  const t = text.trim();
  if (t.length < 16 || t.length > 4096) return false;
  if (SECRET_PREFIXES.test(t)) return true;
  if (/^[A-Za-z0-9+/=_-]{32,}$/.test(t) && /[A-Z]/.test(t) && /[a-z]/.test(t) && /\d/.test(t)) {
    return true;
  }
  return false;
}

function guessLanguage(text: string): string | undefined {
  const t = text.trim();
  if (/^\s*import\s+/.test(t) || /\bexport\s+/.test(t)) return 'typescript';
  if (/\bdef\s+\w+\s*\(/.test(t)) return 'python';
  if (/\bpackage\s+\w+/.test(t) && /\bfunc\s+/.test(t)) return 'go';
  if (/<\?php/.test(t)) return 'php';
  if (/\bpublic\s+class\s+/.test(t)) return 'java';
  return undefined;
}

function isCodeHeuristic(text: string): boolean {
  const patterns = [
    /=>/,
    /\bfunction\b/,
    /\bconst\s+\w+/,
    /\blet\s+\w+/,
    /\bclass\s+\w+/,
    /\bimport\s+.*\bfrom\b/,
    /\bexport\s+(default\s+)?/,
    /;\s*$/,
    /\{[\s\S]*\}/,
    /\(\)\s*=>/,
  ];
  let score = 0;
  for (const p of patterns) {
    if (p.test(text)) score++;
  }
  return score >= 2 || (text.includes('{') && text.includes('}') && text.includes(';'));
}

function isProbableFilePath(t: string): boolean {
  const s = t.trim();
  if (!s || s.includes('\0') || s.length > 4096 || s.includes('\n')) return false;
  if (/^\\\\[^\s]+\\[^\s]+/i.test(s)) return true;
  if (/^[A-Za-z]:\\[^\n]+/.test(s)) return true;
  if (/^\/(?:Users|home|var|usr|tmp|Volumes)\/[^\n]+/i.test(s)) return true;
  if (/^\.{0,2}\/[\w./-]+\.\w{1,8}$/i.test(s) && s.length < 1024) return true;
  return false;
}

export function detectType(text: string): DetectResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { type: 'text', confidence: 0.5 };
  }

  if (isProbableFilePath(trimmed)) {
    return { type: 'file-path', confidence: 0.82 };
  }

  if (secretHeuristic(trimmed)) {
    return { type: 'secret', confidence: 0.85 };
  }

  if (isSingleLineEmail(trimmed)) {
    return { type: 'email', confidence: 0.95 };
  }

  if (isStackTrace(trimmed)) {
    return { type: 'stack-trace', confidence: 0.88 };
  }

  if (isUrl(trimmed)) {
    return { type: 'url', confidence: 0.95 };
  }

  if (tryParseJson(trimmed)) {
    return { type: 'json', confidence: 0.92 };
  }

  if (SQL_START.test(trimmed)) {
    return { type: 'sql', confidence: 0.9 };
  }

  if (isCodeHeuristic(trimmed)) {
    return { type: 'code', confidence: 0.75, language: guessLanguage(trimmed) };
  }

  return { type: 'text', confidence: 0.6 };
}
