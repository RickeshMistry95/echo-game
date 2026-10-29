import type { Tier } from '../map/types';

export const SAVE_VERSION = 1;
export const MAX_RUNS = 200;
export const MAX_SEED_BESTS = 300;

export type SavedMode = 'classic' | 'daily' | 'seed';
export type ControlScheme = 'auto' | 'keyboard' | 'mouse' | 'touch';

export interface Settings {
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
  muted: boolean;
  controls: ControlScheme;
  touchSensitivity: number; // 0.5..2
  reducedMotion: boolean;
  highContrast: boolean;
  largerDots: boolean;
  tutorialDone: boolean;
}

export interface Score {
  rounds: number;
  points: number;
}

export interface RunRecord {
  id: string;
  /** ISO timestamp of when the run ended. */
  at: string;
  mode: SavedMode;
  tier: Tier;
  /** Seed code such as "2-K7QX24". */
  code: string;
  rounds: number;
  points: number;
  coins: number;
  nearMisses: number;
  ms: number;
  ghostsDodged: number;
  cause: 'ghost' | 'coin' | 'quit';
}

export interface DailyResult {
  rounds: number;
  points: number;
  attempts: number;
  nearMisses: number;
  ghostsDodged: number;
  code: string;
}

export interface BestReplay {
  code: string;
  rounds: number;
  points: number;
  /** Each ghost path packed as base64 of Int16 pairs (position x 10). */
  ghosts: string[];
}

export interface SaveData {
  version: number;
  settings: Settings;
  bests: Record<SavedMode, Score>;
  bySeed: Record<string, Score>;
  runs: RunRecord[];
  daily: Record<string, DailyResult>;
  streak: { current: number; longest: number; lastDate: string };
  lifetime: { runs: number; rounds: number; coins: number; nearMisses: number; ms: number };
  replays: Partial<Record<SavedMode, BestReplay>>;
}

export function defaultSettings(): Settings {
  return {
    musicVolume: 0.6,
    sfxVolume: 0.8,
    muted: false,
    controls: 'auto',
    touchSensitivity: 1,
    reducedMotion: false,
    highContrast: false,
    largerDots: false,
    tutorialDone: false,
  };
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    settings: defaultSettings(),
    bests: {
      classic: { rounds: 0, points: 0 },
      daily: { rounds: 0, points: 0 },
      seed: { rounds: 0, points: 0 },
    },
    bySeed: {},
    runs: [],
    daily: {},
    streak: { current: 0, longest: 0, lastDate: '' },
    lifetime: { runs: 0, rounds: 0, coins: 0, nearMisses: 0, ms: 0 },
    replays: {},
  };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function score(v: unknown): Score {
  const o = isObj(v) ? v : {};
  return { rounds: num(o.rounds, 0, 0), points: num(o.points, 0, 0) };
}

/**
 * Turn anything parsed from storage or an import file into a valid SaveData.
 * Unknown or damaged sections fall back to defaults, so a bad save never crashes the game.
 * New versions add a migration step here.
 */
export function sanitize(raw: unknown): SaveData {
  const d = defaultSave();
  if (!isObj(raw)) return d;

  if (isObj(raw.settings)) {
    const s = raw.settings;
    const controls = s.controls;
    d.settings = {
      musicVolume: num(s.musicVolume, d.settings.musicVolume, 0, 1),
      sfxVolume: num(s.sfxVolume, d.settings.sfxVolume, 0, 1),
      muted: bool(s.muted, false),
      controls: controls === 'keyboard' || controls === 'mouse' || controls === 'touch' ? controls : 'auto',
      touchSensitivity: num(s.touchSensitivity, 1, 0.5, 2),
      reducedMotion: bool(s.reducedMotion, false),
      highContrast: bool(s.highContrast, false),
      largerDots: bool(s.largerDots, false),
      tutorialDone: bool(s.tutorialDone, false),
    };
  }

  if (isObj(raw.bests)) {
    d.bests = { classic: score(raw.bests.classic), daily: score(raw.bests.daily), seed: score(raw.bests.seed) };
  }

  if (isObj(raw.bySeed)) {
    const entries = Object.entries(raw.bySeed).slice(-MAX_SEED_BESTS);
    for (const [k, v] of entries) d.bySeed[k] = score(v);
  }

  if (Array.isArray(raw.runs)) {
    for (const r of raw.runs.slice(-MAX_RUNS)) {
      if (!isObj(r)) continue;
      const mode = r.mode === 'daily' || r.mode === 'seed' ? r.mode : 'classic';
      const tier = r.tier === 'open' || r.tier === 'tight' ? r.tier : 'standard';
      const cause = r.cause === 'coin' || r.cause === 'quit' ? r.cause : 'ghost';
      d.runs.push({
        id: typeof r.id === 'string' ? r.id : String(d.runs.length),
        at: typeof r.at === 'string' ? r.at : new Date(0).toISOString(),
        mode,
        tier,
        code: typeof r.code === 'string' ? r.code : '',
        rounds: num(r.rounds, 0, 0),
        points: num(r.points, 0, 0),
        coins: num(r.coins, 0, 0),
        nearMisses: num(r.nearMisses, 0, 0),
        ms: num(r.ms, 0, 0),
        ghostsDodged: num(r.ghostsDodged, 0, 0),
        cause,
      });
    }
  }

  if (isObj(raw.daily)) {
    for (const [date, v] of Object.entries(raw.daily)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isObj(v)) continue;
      d.daily[date] = {
        rounds: num(v.rounds, 0, 0),
        points: num(v.points, 0, 0),
        attempts: num(v.attempts, 0, 0, 1000),
        nearMisses: num(v.nearMisses, 0, 0),
        ghostsDodged: num(v.ghostsDodged, 0, 0),
        code: typeof v.code === 'string' ? v.code : '',
      };
    }
  }

  if (isObj(raw.streak)) {
    d.streak = {
      current: num(raw.streak.current, 0, 0),
      longest: num(raw.streak.longest, 0, 0),
      lastDate: typeof raw.streak.lastDate === 'string' ? raw.streak.lastDate : '',
    };
  }

  if (isObj(raw.lifetime)) {
    const l = raw.lifetime;
    d.lifetime = {
      runs: num(l.runs, 0, 0),
      rounds: num(l.rounds, 0, 0),
      coins: num(l.coins, 0, 0),
      nearMisses: num(l.nearMisses, 0, 0),
      ms: num(l.ms, 0, 0),
    };
  }

  if (isObj(raw.replays)) {
    for (const mode of ['classic', 'daily', 'seed'] as const) {
      const r = raw.replays[mode];
      if (!isObj(r) || !Array.isArray(r.ghosts)) continue;
      d.replays[mode] = {
        code: typeof r.code === 'string' ? r.code : '',
        rounds: num(r.rounds, 0, 0),
        points: num(r.points, 0, 0),
        ghosts: r.ghosts.filter((g): g is string => typeof g === 'string'),
      };
    }
  }

  return d;
}

/** Pack a ghost path (x,y floats) into a compact base64 string. */
export function packPath(path: Float32Array): string {
  const ints = new Int16Array(path.length);
  for (let i = 0; i < path.length; i++) ints[i] = Math.round(path[i] * 10);
  const bytes = new Uint8Array(ints.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function unpackPath(s: string): Float32Array {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ints = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
  const out = new Float32Array(ints.length);
  for (let i = 0; i < ints.length; i++) out[i] = ints[i] / 10;
  return out;
}
