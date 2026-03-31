/** Text transforms for automation rules (subset of in-app Actions; runs in main process). */

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
          return w[0]!.toLowerCase() + w.slice(1).map(toCamelCaseSegment).join('');
        case 'pascal':
          return w.map(toCamelCaseSegment).join('');
        case 'snake':
        case 'scream': {
          const snake = w.map((x) => x.toLowerCase()).join('_');
          return mode === 'scream' ? snake.toUpperCase() : snake;
        }
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

export function runAutomationTransform(
  transformId: string,
  content: string,
  pattern?: string,
  replacement?: string
): string {
  const id = transformId.trim();
  switch (id) {
    case 'trim-whitespace':
      return content
        .split('\n')
        .map((l) => l.trim())
        .join('\n')
        .trim();
    case 'normalize-line-endings':
      return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    case 'uppercase':
      return content.toUpperCase();
    case 'lowercase':
      return content.toLowerCase();
    case 'format-json':
      return JSON.stringify(JSON.parse(content), null, 2);
    case 'minify-json':
      return JSON.stringify(JSON.parse(content));
    case 'base64-encode':
      return Buffer.from(content, 'utf8').toString('base64');
    case 'base64-decode':
      return Buffer.from(content.trim(), 'base64').toString('utf8');
    case 'url-encode':
      return encodeURIComponent(content);
    case 'url-decode':
      return decodeURIComponent(content);
    case 'case-camel':
      return lineCaseTransform(content, 'camel');
    case 'case-snake':
      return lineCaseTransform(content, 'snake');
    case 'case-pascal':
      return lineCaseTransform(content, 'pascal');
    case 'case-scream':
      return lineCaseTransform(content, 'scream');
    case 'case-kebab':
      return lineCaseTransform(content, 'kebab');
    case 'case-title':
      return lineCaseTransform(content, 'title');
    case 'regex-replace': {
      const p = pattern ?? '';
      const rep = replacement ?? '';
      if (!p) return content;
      return content.replace(new RegExp(p, 'g'), rep);
    }
    default:
      throw new Error(`Unknown transform: ${id}`);
  }
}
