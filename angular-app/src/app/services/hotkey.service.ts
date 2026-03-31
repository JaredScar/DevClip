import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class HotkeyService {
  handleOverlayKeydown(
    ev: KeyboardEvent,
    ctx: {
      focusSearch: () => void;
      onArrow: (d: 1 | -1) => void;
      onEnter: () => void;
      onEscape: () => void;
      onTabFilter: () => void;
      onStage?: () => void;
      onActions?: () => void;
    }
  ) {
    const target = ev.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();
    const inField = tag === 'input' || tag === 'textarea';

    if (ev.key === 'a' || ev.key === 'A') {
      if (!inField && !ev.ctrlKey && !ev.metaKey) {
        ev.preventDefault();
        ctx.onActions?.();
        return;
      }
    }

    if (ev.key === 's' || ev.key === 'S') {
      if (!inField && !ev.ctrlKey && !ev.metaKey) {
        ev.preventDefault();
        ctx.onStage?.();
        return;
      }
    }

    const isModK = (ev.ctrlKey || ev.metaKey) && (ev.key === 'k' || ev.key === 'K');
    if (isModK) {
      ev.preventDefault();
      ctx.focusSearch();
      return;
    }

    if (ev.key === 'Escape') {
      ev.preventDefault();
      ctx.onEscape();
      return;
    }

    if (ev.key === 'Tab') {
      ev.preventDefault();
      ctx.onTabFilter();
      return;
    }

    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      ctx.onArrow(1);
      return;
    }

    if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      ctx.onArrow(-1);
      return;
    }

    if (ev.key === 'Enter') {
      const inInput = tag === 'input' || tag === 'textarea';
      if (inInput && !ev.shiftKey) {
        ev.preventDefault();
        ctx.onEnter();
        return;
      }
      if (!inInput) {
        ev.preventDefault();
        ctx.onEnter();
      }
    }
  }
}
