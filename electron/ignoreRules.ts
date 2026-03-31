export function shouldIgnore(
  content: string,
  sourceLabel: string | null,
  settings: Record<string, string>
): boolean {
  let ignoreApps: string[] = [];
  let ignorePatterns: string[] = [];
  try {
    ignoreApps = JSON.parse(settings.ignoreApps ?? '[]') as string[];
  } catch {
    ignoreApps = [];
  }
  try {
    const extra = JSON.parse(settings.enterprisePolicyIgnoreApps ?? '[]') as string[];
    if (Array.isArray(extra)) {
      for (const x of extra) {
        if (typeof x === 'string' && x.trim()) ignoreApps.push(x);
      }
    }
  } catch {
    /* ignore */
  }
  try {
    ignorePatterns = JSON.parse(settings.ignorePatterns ?? '[]') as string[];
  } catch {
    ignorePatterns = [];
  }

  const src = (sourceLabel ?? '').toLowerCase();
  for (const app of ignoreApps) {
    if (app && src.includes(String(app).toLowerCase())) {
      return true;
    }
  }

  for (const raw of ignorePatterns) {
    if (!raw || typeof raw !== 'string') continue;
    try {
      const re = new RegExp(raw, 'i');
      if (re.test(content)) {
        return true;
      }
    } catch {
      if (content.includes(raw)) {
        return true;
      }
    }
  }

  return false;
}
