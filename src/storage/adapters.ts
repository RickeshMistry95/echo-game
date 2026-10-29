/**
 * Storage adapters move one JSON string in and out of some backing store.
 * The game only ever talks to Store (store.ts), so a server adapter can replace these later
 * without touching game code.
 */
export interface StorageAdapter {
  /** True when data survives a page reload. */
  readonly persistent: boolean;
  load(): Promise<string | null>;
  save(raw: string): Promise<void>;
  clear(): Promise<void>;
}

export const SAVE_KEY = 'echo.save.v1';

/** Browser localStorage. Every access is guarded: private windows and blocked storage must not crash the game. */
export class LocalAdapter implements StorageAdapter {
  persistent = true;
  private fallback: string | null = null;

  async load(): Promise<string | null> {
    try {
      return window.localStorage.getItem(SAVE_KEY);
    } catch {
      this.persistent = false;
      return this.fallback;
    }
  }

  async save(raw: string): Promise<void> {
    this.fallback = raw;
    try {
      window.localStorage.setItem(SAVE_KEY, raw);
    } catch {
      this.persistent = false;
    }
  }

  async clear(): Promise<void> {
    this.fallback = null;
    try {
      window.localStorage.removeItem(SAVE_KEY);
    } catch {
      this.persistent = false;
    }
  }
}

/** In-memory adapter for tests, and the automatic fallback when nothing else works. */
export class MemoryAdapter implements StorageAdapter {
  persistent = false;
  private value: string | null = null;

  constructor(initial: string | null = null) {
    this.value = initial;
  }

  async load(): Promise<string | null> {
    return this.value;
  }

  async save(raw: string): Promise<void> {
    this.value = raw;
  }

  async clear(): Promise<void> {
    this.value = null;
  }
}
