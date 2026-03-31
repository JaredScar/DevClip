import { app } from 'electron';
import { getCachedTier } from '../database/licenseCache';
import { getSettingsMap } from '../database/db';
import { readAiSecret, type AiSecretId } from './aiSecretStore';
import { completeChat, type AiProviderKind } from './aiProvider';

export type AiActionId =
  | 'summarize'
  | 'explain'
  | 'fix_improve'
  | 'translate'
  | 'rewrite'
  | 'gen_regex'
  | 'gen_test'
  | 'ask';

const MAX_CLIP_CHARS = 120_000;

function assertPro(): void {
  const t = getCachedTier();
  if (t !== 'pro' && t !== 'enterprise') {
    throw new Error('AI Actions require a Pro or Enterprise license');
  }
}

function truncateClip(text: string): string {
  if (text.length <= MAX_CLIP_CHARS) {
    return text;
  }
  return `${text.slice(0, MAX_CLIP_CHARS)}\n\n[…truncated for API size limit]`;
}

function resolveSecretId(kind: AiProviderKind): AiSecretId {
  if (kind === 'hosted') {
    return 'hosted';
  }
  return kind;
}

function getApiKey(userData: string, kind: AiProviderKind): string {
  const id = resolveSecretId(kind);
  const k = readAiSecret(userData, id);
  if (!k?.trim()) {
    const label = kind === 'hosted' ? 'hosted / DevClip proxy' : kind;
    throw new Error(`No API key stored for ${label}. Add it in Settings → AI.`);
  }
  return k.trim();
}

function parseProvider(raw: string | undefined): AiProviderKind {
  const v = (raw ?? 'openai').trim().toLowerCase();
  if (v === 'anthropic') {
    return 'anthropic';
  }
  if (v === 'hosted' || v === 'devclip' || v === 'proxy') {
    return 'hosted';
  }
  return 'openai';
}

export function buildPrompts(
  action: AiActionId,
  clipContent: string,
  clipType: string | undefined,
  extra: string | undefined
): { system: string; user: string } {
  const body = truncateClip(clipContent);
  const typeLine = clipType ? `Content type (hint): ${clipType}\n\n` : '';

  switch (action) {
    case 'summarize':
      return {
        system:
          'You summarize text clearly. Output concise bullet points unless the input is very short, then a short paragraph.',
        user: `${typeLine}---\n${body}\n---\nSummarize the above.`,
      };
    case 'explain':
      return {
        system:
          'You explain technical content in plain English. Cover intent, important details, and caveats. Use short sections or bullets when helpful.',
        user: `${typeLine}---\n${body}\n---\nExplain this for a developer audience.`,
      };
    case 'fix_improve':
      return {
        system:
          'You suggest concrete improvements: bugs, style, performance, security. Output fixed or improved code/text when applicable, plus brief notes.',
        user: `${typeLine}---\n${body}\n---\nSuggest fixes and improvements.`,
      };
    case 'translate': {
      const lang = (extra ?? 'Spanish').trim() || 'Spanish';
      return {
        system: `You translate faithfully, preserving code blocks, identifiers, and URLs. Target language: ${lang}.`,
        user: `${typeLine}---\n${body}\n---\nTranslate into ${lang}.`,
      };
    }
    case 'rewrite': {
      const tone = (extra ?? 'formal').trim().toLowerCase();
      const t =
        tone === 'casual'
          ? 'casual, friendly'
          : tone === 'technical'
            ? 'precise and technical'
            : 'formal and professional';
      return {
        system: `You rewrite text in a ${t} tone. Preserve meaning and technical accuracy.`,
        user: `${typeLine}---\n${body}\n---\nRewrite with a ${t} tone.`,
      };
    }
    case 'gen_regex':
      return {
        system:
          'You output a regular expression and a one-line explanation. Prefer common regex flavors (PCRE/JavaScript). If ambiguous, state assumptions.',
        user: `${typeLine}Requirement: ${(extra ?? '').trim() || 'Describe the pattern in natural language'}\n\nContext (optional):\n---\n${body}\n---`,
      };
    case 'gen_test':
      return {
        system:
          'You write minimal, runnable unit tests appropriate to the language implied by the code. Use a common test framework for that language. Output only code and brief file hints as comments if needed.',
        user: `${typeLine}---\n${body}\n---\nGenerate tests for the above.`,
      };
    case 'ask': {
      const q = (extra ?? '').trim();
      return {
        system:
          'You answer using the provided context. If the question is unrelated, answer from general knowledge but say when context does not apply.',
        user: `${typeLine}Context:\n---\n${body}\n---\n\nQuestion: ${q || 'What is this?'}`,
      };
    }
    default:
      return {
        system: 'You are a helpful assistant.',
        user: body,
      };
  }
}

export async function runAiCompletion(input: {
  action: AiActionId;
  clipContent: string;
  clipType?: string;
  extra?: string;
}): Promise<string> {
  assertPro();
  const userData = app.getPath('userData');
  const settings = getSettingsMap();
  const kind = parseProvider(settings['aiProvider']);
  const model = (settings['aiModel'] ?? '').trim();
  const hostedBase = (settings['aiHostedBaseUrl'] ?? '').trim();

  const apiKey = getApiKey(userData, kind);
  const { system, user } = buildPrompts(
    input.action,
    input.clipContent,
    input.clipType,
    input.extra
  );

  return completeChat({
    kind,
    apiKey,
    model,
    hostedBaseUrl: hostedBase,
    system,
    user,
  });
}
