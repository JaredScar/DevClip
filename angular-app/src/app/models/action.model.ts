import type { ClipType } from './clip.model';

export type SupportedTypes = ClipType[] | 'all';

export interface ClipAction {
  id: string;
  name: string;
  description: string;
  supportedTypes: SupportedTypes;
  run: (
    content: string,
    extra?: { find?: string; replace?: string; diffSecondText?: string }
  ) => string | Promise<string>;
}
