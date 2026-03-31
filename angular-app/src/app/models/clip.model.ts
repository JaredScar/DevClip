export type ClipType =
  | 'sql'
  | 'json'
  | 'url'
  | 'code'
  | 'text'
  | 'email'
  | 'stack-trace'
  | 'secret'
  | 'image'
  | 'file-path';

export interface Clip {
  id: number;
  content: string;
  type: ClipType;
  source: string | null;
  created_at: number;
  is_pinned: number;
  tags: string[];
  use_count: number;
  metadata?: Record<string, unknown>;
}

export type FilterTab = 'all' | ClipType;

export type LicenseTier = 'free' | 'pro' | 'enterprise';

export interface ClipSearchOptions {
  tagNames?: string[];
  dateFrom?: number;
  dateTo?: number;
  sourceApp?: string;
  fuzzy?: boolean;
}
