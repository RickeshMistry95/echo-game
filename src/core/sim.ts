import { pushOut } from '../map/geometry';
import type { GameMap, Point } from '../map/types';
import {
  ACCEL_K,
  COIN_BONUS_MAX,
  COIN_GHOST_CLEAR,
  COIN_MIN_START_DIST,
  COIN_R,
  DT,
  HIT_DIST,
  NEAR_CAP,
  NEAR_DIST,
  NEAR_POINTS,
  NEAR_RESET,
  PLAYER_R,
  ROUND_POINTS,
  ROUND_TICKS,
  SHIELD_TICKS,
  SPEED,
} from './constants';

/*
 * The simulation core. It is deterministic: no clock, no Math.random(), no DOM.
 * Given a map and the same sequence of quantised inputs it always produces the same run,
 * which is what makes ghosts exact, the daily map fair, and server-side verification possible later.
 */

export type Mode = 'classic' | 'daily' | 'seed' | 'practice' | 'tutorial';
export type RunStatus = 'playing' | 'roundEnd' | 'dead';
export type DeathCause = 'ghost' | 'coin';

export type SimEvent =
  | { type: 'coin'; x: number; y: number; bonus: number }
  | { type: 'near'; x: number; y: number }
  | { type: 'clear' }
  | { type: 'dead'; cause: DeathCause; x: number; y: number; ghost: number };

export interface RunState {
  map: GameMap;
  /** Practice and tutorial runs: ghosts cannot hurt you and a missed coin is fine. */
  harmless: boolean;
  /** 1 based number of the round being played. */
  round: number;
  /** Ticks elapsed in the current round, 0..ROUND_TICKS. */
  tick: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  prevX: number;
  prevY: number;
  startX: number;
  startY: number;
  /** One recorded path per cleared round: x,y pairs, one pair per tick. */
  ghosts: Float32Array[];
  /** Positions recorded so far in the current round. */
  rec: Float32Array;
  /** Quantised inputs for the current round (-127..127 pairs). */
  inputRec: Int8Array;
  /** Inputs of every cleared round, for later verification. */
  roundInputs: Int8Array[];
  coin: Point;
  coinTaken: boolean;
  nearFlags: Uint8Array;
  nearThisRound: number;
  points: number;
  roundsCleared: number;
  coinsTotal: number;
  nearTotal: number;
  /** Ghost encounters survived: for each cleared round, the number of ghosts that were out. */
  ghostsDodged: number;
  /** Total ticks of play across the run. */
  playTicks: number;
  status: RunStatus;
  deathCause: DeathCause | null;
  /** Index of the ghost that caught the player, or -1. */
  killer: number;
  events: SimEvent[];
}

export function createRun(map: GameMap, harmless = false): RunState {
  const s: RunState = {
    map,
    harmless,
    round: 1,
    tick: 0,
    x: map.spawn.x,
    y: map.spawn.y,
    vx: 0,
    vy: 0,
    prevX: map.spawn.x,
    prevY: map.spawn.y,
    startX: map.spawn.x,
    startY: map.spawn.y,
    ghosts: [],
    rec: new Float32Array(ROUND_TICKS * 2),
    inputRec: new Int8Array(ROUND_TICKS * 2),
    roundInputs: [],
    coin: { x: 0, y: 0 },
    coinTaken: false,
    nearFlags: new Uint8Array(0),
    nearThisRound: 0,
    points: 0,
    roundsCleared: 0,
    coinsTotal: 0,
    nearTotal: 0,
    ghostsDodged: 0,
    playTicks: 0,
    status: 'playing',
    deathCause: null,
    killer: -1,
    events: [],
  };
  beginRound(s);
  return s;
}

/** Where a ghost is at a (possibly fractional) tick. Ghosts hold their last spot if a path runs out. */
export function ghostPos(g: Float32Array, t: number, out: Point): Point {
  const last = g.length / 2 - 1;
  const tt = t < 0 ? 0 : t > last ? last : t;
  const i0 = Math.floor(tt);
  const i1 = i0 < last ? i0 + 1 : i0;
  const f = tt - i0;
  out.x = g[i0 * 2] + (g[i1 * 2] - g[i0 * 2]) * f;
  out.y = g[i0 * 2 + 1] + (g[i1 * 2 + 1] - g[i0 * 2 + 1]) * f;
  return out;
}

function pickCoin(s: RunState): Point {
  const coins = s.map.coins;
  let fallback = coins[(s.round - 1) % coins.length];
  let fallbackDist = -1;
  for (let k = 0; k < coins.length; k++) {
    const c = coins[(s.round - 1 + k) % coins.length];
    const dStart = Math.hypot(c.x - s.startX, c.y - s.startY);
    if (dStart > fallbackDist) {
      fallbackDist = dStart;
      fallback = c;
    }
    if (dStart < COIN_MIN_START_DIST) continue;
    let blocked = false;
    for (const g of s.ghosts) {
      if (Math.hypot(c.x - g[0], c.y - g[1]) < COIN_GHOST_CLEAR) {
        blocked = true;
        break;
      }
    }
    if (!blocked) return c;
  }
  return fallback;
}

/** Set up the current round: player at the start point, fresh recording, this round's coin. */
export function beginRound(s: RunState): void {
  s.tick = 0;
  s.x = s.startX;
  s.y = s.startY;
  s.prevX = s.x;
  s.prevY = s.y;
  s.vx = 0;
  s.vy = 0;
  s.coinTaken = false;
  s.nearThisRound = 0;
  s.nearFlags = new Uint8Array(s.ghosts.length);
  s.rec = new Float32Array(ROUND_TICKS * 2);
  s.inputRec = new Int8Array(ROUND_TICKS * 2);
  s.coin = pickCoin(s);
  s.status = 'playing';
  s.deathCause = null;
  s.killer = -1;
}

/** Move on after a cleared round: the next round starts where this one ended. */
export function nextRound(s: RunState): void {
  s.startX = s.x;
  s.startY = s.y;
  s.round += 1;
  beginRound(s);
}

/** Tutorial helper: try the same round again with the same ghosts. */
export function restartRound(s: RunState): void {
  beginRound(s);
}

function quantise(v: number): number {
  const c = v < -1 ? -1 : v > 1 ? 1 : v;
  return Math.round(c * 127);
}

const tmp = { x: 0, y: 0, vx: 0, vy: 0 };
const gp: Point = { x: 0, y: 0 };

/** Advance exactly one tick (1/60 s). Input components are in -1..1. */
export function step(s: RunState, ix: number, iy: number): void {
  if (s.status !== 'playing') return;
  const t = s.tick;
  const qx = quantise(ix);
  const qy = quantise(iy);
  s.inputRec[t * 2] = qx;
  s.inputRec[t * 2 + 1] = qy;

  let ux = qx / 127;
  let uy = qy / 127;
  const m = Math.hypot(ux, uy);
  if (m > 1) {
    ux /= m;
    uy /= m;
  }

  s.prevX = s.x;
  s.prevY = s.y;
  s.vx += (ux * SPEED - s.vx) * ACCEL_K;
  s.vy += (uy * SPEED - s.vy) * ACCEL_K;
  tmp.x = s.x + s.vx * DT;
  tmp.y = s.y + s.vy * DT;
  tmp.vx = s.vx;
  tmp.vy = s.vy;
  pushOut(s.map, tmp, s.prevX, s.prevY, PLAYER_R);
  s.x = tmp.x;
  s.y = tmp.y;
  s.vx = tmp.vx;
  s.vy = tmp.vy;

  s.rec[t * 2] = s.x;
  s.rec[t * 2 + 1] = s.y;
  s.playTicks++;

  // Coin pickup.
  if (!s.coinTaken && Math.hypot(s.x - s.coin.x, s.y - s.coin.y) < PLAYER_R + COIN_R) {
    s.coinTaken = true;
    s.coinsTotal++;
    const bonus = Math.round((COIN_BONUS_MAX * (ROUND_TICKS - t)) / ROUND_TICKS);
    s.points += bonus;
    s.events.push({ type: 'coin', x: s.coin.x, y: s.coin.y, bonus });
  }

  // Ghost contact and near misses.
  const shield = t < SHIELD_TICKS;
  for (let gi = 0; gi < s.ghosts.length; gi++) {
    ghostPos(s.ghosts[gi], t, gp);
    const d = Math.hypot(s.x - gp.x, s.y - gp.y);
    if (shield) {
      if (d < NEAR_DIST) s.nearFlags[gi] = 1;
      continue;
    }
    if (d < HIT_DIST && !s.harmless) {
      s.status = 'dead';
      s.deathCause = 'ghost';
      s.killer = gi;
      s.tick = t + 1;
      s.events.push({ type: 'dead', cause: 'ghost', x: s.x, y: s.y, ghost: gi });
      return;
    }
    if (d < NEAR_DIST) {
      if (!s.nearFlags[gi] && d >= HIT_DIST) {
        s.nearFlags[gi] = 1;
        s.nearTotal++;
        if (s.nearThisRound < NEAR_CAP) s.points += NEAR_POINTS;
        s.nearThisRound++;
        s.events.push({ type: 'near', x: (s.x + gp.x) / 2, y: (s.y + gp.y) / 2 });
      }
    } else if (d > NEAR_RESET) {
      s.nearFlags[gi] = 0;
    }
  }

  s.tick = t + 1;
  if (s.tick >= ROUND_TICKS) {
    if (s.coinTaken || s.harmless) {
      s.points += ROUND_POINTS;
      s.roundsCleared++;
      s.ghostsDodged += s.ghosts.length;
      s.ghosts.push(s.rec);
      s.roundInputs.push(s.inputRec);
      s.status = 'roundEnd';
      s.events.push({ type: 'clear' });
    } else {
      s.status = 'dead';
      s.deathCause = 'coin';
      s.killer = -1;
      s.events.push({ type: 'dead', cause: 'coin', x: s.x, y: s.y, ghost: -1 });
    }
  }
}

/** Take (and clear) the events produced since the last call. */
export function drainEvents(s: RunState): SimEvent[] {
  if (s.events.length === 0) return s.events;
  const out = s.events;
  s.events = [];
  return out;
}

