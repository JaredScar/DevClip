import { Injectable } from '@angular/core';
import type { Snippet } from '../models/snippet.model';
import { SnippetsStore } from '../store/snippets.store';

function mapSnippet(row: Record<string, unknown>): Snippet {
  let variables: string[] = [];
  let tags: string[] = [];
  try {
    variables = JSON.parse((row['variables'] as string) || '[]') as string[];
  } catch {
    variables = [];
  }
  try {
    tags = JSON.parse((row['tags'] as string) || '[]') as string[];
  } catch {
    tags = [];
  }
  return {
    id: row['id'] as number,
    title: row['title'] as string,
    content: row['content'] as string,
    variables,
    tags,
    category: String(row['category'] ?? ''),
    shortcode: row['shortcode'] != null ? String(row['shortcode']) : null,
    created_at: row['created_at'] as number,
    updated_at: row['updated_at'] as number,
    is_pinned: row['is_pinned'] as number,
    use_count: Number(row['use_count'] ?? 0),
  };
}

export function extractVariablesFromContent(content: string): string[] {
  const keys = new Set<string>();
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m[1]) keys.add(m[1]);
  }
  return [...keys];
}

@Injectable({ providedIn: 'root' })
export class SnippetService {
  constructor(private readonly store: SnippetsStore) {}

  async loadAll() {
    const rows = (await window.devclip.getSnippets()) as Record<string, unknown>[];
    this.store.setSnippets(rows.map(mapSnippet));
  }

  async search(q: string) {
    this.store.searchQuery.set(q);
    const rows = (await window.devclip.searchSnippets(q)) as Record<string, unknown>[];
    this.store.setSnippets(rows.map(mapSnippet));
  }

  async saveNew(input: {
    title: string;
    content: string;
    tags: string[];
    category?: string;
    shortcode?: string | null;
  }) {
    const vars = extractVariablesFromContent(input.content);
    await window.devclip.saveSnippet({
      title: input.title,
      content: input.content,
      variables: JSON.stringify(vars),
      tags: JSON.stringify(input.tags),
      category: input.category ?? '',
      shortcode: input.shortcode ?? null,
    });
    await this.loadAll();
  }

  async update(
    id: number,
    input: {
      title: string;
      content: string;
      tags: string[];
      category?: string;
      shortcode?: string | null;
    }
  ) {
    const vars = extractVariablesFromContent(input.content);
    await window.devclip.updateSnippet({
      id,
      title: input.title,
      content: input.content,
      variables: JSON.stringify(vars),
      tags: JSON.stringify(input.tags),
      category: input.category ?? '',
      shortcode: input.shortcode ?? null,
    });
    await this.loadAll();
  }

  async remove(id: number) {
    await window.devclip.deleteSnippet(id);
    await this.loadAll();
  }

  async togglePin(id: number) {
    await window.devclip.toggleSnippetPin(id);
    await this.loadAll();
  }

  applyVariables(content: string, values: Record<string, string>): string {
    return content.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => values[key] ?? '');
  }
}
