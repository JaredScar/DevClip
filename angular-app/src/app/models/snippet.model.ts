export interface Snippet {
  id: number;
  title: string;
  content: string;
  variables: string[];
  tags: string[];
  category: string;
  shortcode: string | null;
  created_at: number;
  updated_at: number;
  is_pinned: number;
  /** Times copied from Snippets panel (double-click / variable paste). */
  use_count: number;
}
