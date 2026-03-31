export type AiProviderKind = 'openai' | 'anthropic' | 'hosted';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

function trimBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, '');
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown
): Promise<unknown> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    parsed = null;
  }
  if (!r.ok) {
    const msg =
      parsed && typeof parsed === 'object' && parsed !== null && 'error' in parsed
        ? JSON.stringify((parsed as { error?: unknown }).error)
        : text.slice(0, 400);
    throw new Error(`Request failed (${r.status}): ${msg}`);
  }
  return parsed;
}

function extractOpenAiText(data: unknown): string {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid API response');
  }
  const choices = (data as { choices?: { message?: { content?: string } }[] }).choices;
  const c0 = choices?.[0]?.message?.content;
  if (typeof c0 !== 'string' || !c0.trim()) {
    throw new Error('Empty model response');
  }
  return c0.trim();
}

function extractAnthropicText(data: unknown): string {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid API response');
  }
  const content = (data as { content?: { type?: string; text?: string }[] }).content;
  const block = content?.find((b) => b?.type === 'text');
  const t = block?.text;
  if (typeof t !== 'string' || !t.trim()) {
    throw new Error('Empty model response');
  }
  return t.trim();
}

export async function completeChat(input: {
  kind: AiProviderKind;
  apiKey: string;
  model: string;
  hostedBaseUrl?: string;
  system: string;
  user: string;
}): Promise<string> {
  const model = input.model.trim() || (input.kind === 'anthropic' ? 'claude-3-5-haiku-20241022' : 'gpt-4o-mini');

  if (input.kind === 'anthropic') {
    const data = await postJson(
      ANTHROPIC_URL,
      {
        'x-api-key': input.apiKey,
        'anthropic-version': '2023-06-01',
      },
      {
        model,
        max_tokens: 8192,
        system: input.system,
        messages: [{ role: 'user', content: input.user }],
      }
    );
    return extractAnthropicText(data);
  }

  const url =
    input.kind === 'hosted'
      ? `${trimBaseUrl(input.hostedBaseUrl ?? '')}/chat/completions`
      : OPENAI_URL;

  if (input.kind === 'hosted' && !input.hostedBaseUrl?.trim()) {
    throw new Error('Set a hosted base URL (OpenAI-compatible /v1 root) in Settings');
  }

  const data = await postJson(
    url,
    { Authorization: `Bearer ${input.apiKey}` },
    {
      model,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
      max_tokens: 8192,
    }
  );
  return extractOpenAiText(data);
}
