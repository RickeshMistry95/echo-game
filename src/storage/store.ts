import { addDays } from '../core/daily';
import type { StorageAdapter } from './adapters';
import {
  MAX_RUNS,
  MAX_SEED_BESTS,
  defaultSave,
  packPath,
  sanitize,
  type DailyResult,
  type RunRecord,
  type SaveData,
  type SavedMode,
  type Score,
  type Settings,
} from './schema';

export interface RecordResult {
  newBest: boolean;
  previousBest: Score;
}

export function isBetter(a: Score, b: Score): boolean {
  return a.rounds > b.rounds || (a.rounds === b.rounds && a.points > b.points);
}

/**
 * The only thing the game talks to for saving. Every method is async so a server-backed
 * adapter can be dropped in later. `data` is a synchronous cache for rendering menus.
 */
export class Store {
  data: SaveData = defaultSave();

  constructor(private adapter: StorageAdapter) {}

  get persistent(): boolean {
    return this.adapter.persistent;
  }

  async init(): Promise<void> {
    try {
      const raw = await this.adapter.load();
      this.data = raw ? sanitize(JSON.parse(raw)) : defaultSave();
    } catch {
      // Corrupt JSON or blocked storage: start fresh rather than crash.
      this.data = defaultSave();
    }
  }

  private async commit(): Promise<void> {
    try {
      await this.adapter.save(JSON.stringify(this.data));
    } catch {
      // Saving is best effort. The game keeps working from memory.
    }
  }

  async updateSettings(patch: Partial<Settings>): Promise<void> {
    this.data.settings = { ...this.data.settings, ...patch };
    await this.commit();
  }

  dailyFor(date: string): DailyResult | undefined {
    return this.data.daily[date];
  }

  /** Count an attempt on today's map and update the streak. Returns the updated day entry. */
  async startDailyAttempt(date: string, code: string): Promise<DailyResult> {
    const day: DailyResult = this.data.daily[date] ?? {
      rounds: 0,
      points: 0,
      attempts: 0,
      nearMisses: 0,
      ghostsDodged: 0,
      code,
    };
    if (day.attempts === 0) {
      const st = this.data.streak;
      st.current = st.lastDate === addDays(date, -1) ? st.current + 1 : 1;
      st.longest = Math.max(st.longest, st.current);
      st.lastDate = date;
    }
    day.attempts += 1;
    day.code = code;
    this.data.daily[date] = day;
    await this.commit();
    return day;
  }

  async recordRun(
    rec: Omit<RunRecord, 'id'>,
    ghosts: Float32Array[],
    date: string,
  ): Promise<RecordResult> {
    const d = this.data;
    const run: RunRecord = { ...rec, id: `${Date.now().toString(36)}${d.runs.length}` };
    d.runs.push(run);
    if (d.runs.length > MAX_RUNS) d.runs.splice(0, d.runs.length - MAX_RUNS);

    d.lifetime.runs += 1;
    d.lifetime.rounds += rec.rounds;
    d.lifetime.coins += rec.coins;
    d.lifetime.nearMisses += rec.nearMisses;
    d.lifetime.ms += rec.ms;

    const score: Score = { rounds: rec.rounds, points: rec.points };
    const mode: SavedMode = rec.mode;
    const previousBest = { ...d.bests[mode] };
    const newBest = rec.rounds > 0 && isBetter(score, previousBest);
    if (newBest) {
      d.bests[mode] = score;
      if (ghosts.length > 0) {
        d.replays[mode] = { code: rec.code, rounds: rec.rounds, points: rec.points, ghosts: ghosts.map(packPath) };
      }
    }

    const prevSeed = d.bySeed[rec.code];
    if (!prevSeed || isBetter(score, prevSeed)) {
      delete d.bySeed[rec.code];
      d.bySeed[rec.code] = score;
      const keys = Object.keys(d.bySeed);
      for (const k of keys.slice(0, Math.max(0, keys.length - MAX_SEED_BESTS))) delete d.bySeed[k];
    }

    if (mode === 'daily') {
      const day = d.daily[date];
      if (day && isBetter(score, { rounds: day.rounds, points: day.points })) {
        day.rounds = rec.rounds;
        day.points = rec.points;
        day.nearMisses = rec.nearMisses;
        day.ghostsDodged = rec.ghostsDodged;
      }
    }

    await this.commit();
    return { newBest, previousBest };
  }

  async exportSave(): Promise<string> {
    return JSON.stringify(this.data, null, 2);
  }

  async importSave(text: string): Promise<boolean> {
    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null || !('version' in parsed)) return false;
      this.data = sanitize(parsed);
      await this.commit();
      return true;
    } catch {
      return false;
    }
  }

  async reset(): Promise<void> {
    this.data = defaultSave();
    try {
      await this.adapter.clear();
    } catch {
      // ignore
    }
  }
}
