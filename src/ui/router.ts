import type { AudioEngine } from '../audio/synth';
import { clear } from './dom';

export interface ScreenInstance {
  el: HTMLElement;
  /** Escape key and the Back button call this. */
  onBack?: () => void;
  /** Return true if the key was handled. */
  onKey?: (e: KeyboardEvent) => boolean;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]):not([type=file]), select:not([disabled]), [data-nav]';

/** Shows one screen at a time over the canvas and gives every screen keyboard navigation. */
export class Router {
  current: ScreenInstance | null = null;

  constructor(
    private root: HTMLElement,
    private audio: AudioEngine,
  ) {
    window.addEventListener('keydown', (e) => this.keyDown(e));
    root.addEventListener('click', (e) => {
      const t = e.target;
      if (t instanceof Element && t.closest('button')) this.audio.click();
    });
  }

  show(screen: ScreenInstance): void {
    clear(this.root);
    this.root.append(screen.el);
    this.current = screen;
    const auto = screen.el.querySelector<HTMLElement>('[data-autofocus]') ?? screen.el.querySelector<HTMLElement>(FOCUSABLE);
    auto?.focus({ preventScroll: true });
  }

  hide(): void {
    clear(this.root);
    this.current = null;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  private keyDown(e: KeyboardEvent): void {
    const cur = this.current;
    if (!cur) return;
    if (cur.onKey?.(e)) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape' && cur.onBack) {
      e.preventDefault();
      cur.onBack();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const t = e.target;
      if (t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && t.type === 'text')) return;
      const items = Array.from(cur.el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.offsetParent !== null);
      if (items.length === 0) return;
      const i = items.indexOf(document.activeElement as HTMLElement);
      const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[i < 0 ? 0 : next].focus();
      e.preventDefault();
    }
  }
}
