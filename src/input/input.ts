import { ARENA } from '../core/constants';
import type { ControlScheme } from '../storage/schema';

type Device = 'keyboard' | 'mouse' | 'touch';

interface Touch {
  id: number;
  ax: number;
  ay: number;
  cx: number;
  cy: number;
}

const UP = new Set(['KeyW', 'ArrowUp']);
const DOWN = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);

/**
 * One movement vector from keyboard, mouse or touch. Every device is capped at the same
 * top speed by the simulation, so no device has an advantage.
 */
export class Input {
  scheme: ControlScheme = 'auto';
  sensitivity = 1;
  /** Called on a two finger tap. */
  onPause: (() => void) | null = null;

  private keys = new Set<string>();
  private last: Device = 'keyboard';
  private mouse: { x: number; y: number } | null = null;
  private touches: Touch[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => this.keyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.reset());
    window.addEventListener('pointerdown', (e) => this.pointerDown(e));
    window.addEventListener('pointermove', (e) => this.pointerMove(e));
    window.addEventListener('pointerup', (e) => this.pointerEnd(e));
    window.addEventListener('pointercancel', (e) => this.pointerEnd(e));
  }

  reset(): void {
    this.keys.clear();
    this.touches = [];
  }

  private allows(d: Device): boolean {
    return this.scheme === 'auto' || this.scheme === d;
  }

  private static isUi(e: Event): boolean {
    const t = e.target;
    return t instanceof Element && t.closest('.panel, button, input, select, textarea, a') !== null;
  }

  private keyDown(e: KeyboardEvent): void {
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
    if (UP.has(e.code) || DOWN.has(e.code) || LEFT.has(e.code) || RIGHT.has(e.code)) {
      if (this.allows('keyboard')) {
        this.keys.add(e.code);
        this.last = 'keyboard';
      }
    }
  }

  private toWorld(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * ARENA, y: ((e.clientY - r.top) / r.height) * ARENA };
  }

  private pointerDown(e: PointerEvent): void {
    if (e.pointerType === 'touch') {
      if (Input.isUi(e) || !this.allows('touch')) return;
      if (this.touches.length >= 1) {
        // A second finger down is the pause gesture.
        this.onPause?.();
        return;
      }
      this.touches.push({ id: e.pointerId, ax: e.clientX, ay: e.clientY, cx: e.clientX, cy: e.clientY });
      this.last = 'touch';
    } else if (this.allows('mouse')) {
      this.mouse = this.toWorld(e);
      this.last = 'mouse';
    }
  }

  private pointerMove(e: PointerEvent): void {
    if (e.pointerType === 'touch') {
      const t = this.touches.find((x) => x.id === e.pointerId);
      if (t) {
        t.cx = e.clientX;
        t.cy = e.clientY;
      }
    } else if (this.allows('mouse')) {
      this.mouse = this.toWorld(e);
      this.last = 'mouse';
    }
  }

  private pointerEnd(e: PointerEvent): void {
    this.touches = this.touches.filter((t) => t.id !== e.pointerId);
  }

  /** Movement vector for a player standing at (px, py). Components are in -1..1. */
  vector(px: number, py: number): [number, number] {
    const device: Device = this.scheme === 'auto' ? this.last : this.scheme;
    if (device === 'keyboard') {
      let x = 0;
      let y = 0;
      for (const k of this.keys) {
        if (UP.has(k)) y -= 1;
        else if (DOWN.has(k)) y += 1;
        else if (LEFT.has(k)) x -= 1;
        else if (RIGHT.has(k)) x += 1;
      }
      const m = Math.hypot(x, y);
      return m > 1 ? [x / m, y / m] : [x, y];
    }
    if (device === 'mouse') {
      if (!this.mouse) return [0, 0];
      const dx = this.mouse.x - px;
      const dy = this.mouse.y - py;
      const d = Math.hypot(dx, dy);
      if (d < 4) return [0, 0];
      const mag = Math.min(1, d / 26);
      return [(dx / d) * mag, (dy / d) * mag];
    }
    const t = this.touches[0];
    if (!t) return [0, 0];
    const dx = t.cx - t.ax;
    const dy = t.cy - t.ay;
    const d = Math.hypot(dx, dy);
    if (d < 8) return [0, 0];
    const mag = Math.min(1, d / (56 / this.sensitivity));
    return [(dx / d) * mag, (dy / d) * mag];
  }

  /** Where to draw the touch joystick hint, in client pixels, or null. */
  touchState(): { ax: number; ay: number; cx: number; cy: number } | null {
    const t = this.touches[0];
    return t ? { ax: t.ax, ay: t.ay, cx: t.cx, cy: t.cy } : null;
  }
}
