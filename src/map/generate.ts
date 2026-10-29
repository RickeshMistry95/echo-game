import { ARENA, PLAYER_R } from '../core/constants';
import { SEED_MASK, mix, mulberry32 } from '../core/rng';
import { arenaSdf, clearance } from './geometry';
import type { GameMap, Obstacle, Point, Shape, Tier } from './types';

export const GRID = 40;
export const CELL = ARENA / GRID;
/** Gaps must be at least 3 player widths wide, so a cell needs this much clearance. */
export const WIDE_CLEARANCE = PLAYER_R * 3;
export const COIN_COUNT = 100;
const MAX_ATTEMPTS = 20;

const TIER_SALT: Record<Tier, number> = { open: 1, standard: 2, tight: 3 };
const SHAPES: Shape[] = ['square', 'circle', 'octagon', 'plus', 'ring'];
const MAX_CLEARANCE: Record<Shape, number> = { square: 270, circle: 270, octagon: 262, plus: 100, ring: 92 };

export interface GridInfo {
  clr: Float32Array;
  open: Uint8Array;
  wide: Uint8Array;
  best: number;
  maxClear: number;
  fair: boolean;
}

function cellCenter(i: number): Point {
  return { x: ((i % GRID) + 0.5) * CELL, y: (Math.floor(i / GRID) + 0.5) * CELL };
}

function flood(mask: Uint8Array, start: number): number {
  if (!mask[start]) return 0;
  const seen = new Uint8Array(mask.length);
  const queue = [start];
  seen[start] = 1;
  let count = 0;
  while (queue.length) {
    const i = queue.pop() as number;
    count++;
    const cx = i % GRID;
    const cy = (i - cx) / GRID;
    const next = [cx > 0 ? i - 1 : -1, cx < GRID - 1 ? i + 1 : -1, cy > 0 ? i - GRID : -1, cy < GRID - 1 ? i + GRID : -1];
    for (const n of next) {
      if (n >= 0 && mask[n] && !seen[n]) {
        seen[n] = 1;
        queue.push(n);
      }
    }
  }
  return count;
}

function sum(mask: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < mask.length; i++) n += mask[i];
  return n;
}

/** Rasterise the arena onto a grid and run the fairness checks. */
export function analyze(shape: Shape, obstacles: Obstacle[]): GridInfo {
  const n = GRID * GRID;
  const clr = new Float32Array(n);
  const open = new Uint8Array(n);
  const wide = new Uint8Array(n);
  let best = 0;
  let maxClear = -Infinity;
  const m = { shape, obstacles };
  for (let i = 0; i < n; i++) {
    const c = cellCenter(i);
    const v = clearance(m, c.x, c.y);
    clr[i] = v;
    if (v >= PLAYER_R) open[i] = 1;
    if (v >= WIDE_CLEARANCE) wide[i] = 1;
    if (v > maxClear) {
      maxClear = v;
      best = i;
    }
  }
  // Every open cell must be connected, and every wide cell must be reachable through wide cells,
  // otherwise some gap is narrower than 3 player widths and cuts the arena in two.
  const fair = flood(open, best) === sum(open) && flood(wide, best) === sum(wide) && wide[best] === 1;
  return { clr, open, wide, best, maxClear, fair };
}

function pickShape(rng: () => number, tier: Tier): Shape {
  if (tier === 'open') return rng() < 0.5 ? 'square' : 'circle';
  return SHAPES[Math.floor(rng() * SHAPES.length)];
}

function rotateL(prims: Obstacle[], k: number): Obstacle[] {
  let out = prims;
  for (let r = 0; r < k; r++) {
    out = out.map((p) => {
      if (p.kind !== 'rect') return p;
      return { kind: 'rect', x: -p.y, y: p.x, hw: p.hh, hh: p.hw };
    });
  }
  return out;
}

function makeObstacle(x: number, y: number, rng: () => number): { prims: Obstacle[]; extent: number } {
  const roll = rng();
  if (roll < 0.5) {
    const r = 22 + rng() * 16;
    return { prims: [{ kind: 'circle', x, y, r }], extent: r };
  }
  if (roll < 0.8) {
    const long = 50 + rng() * 35;
    const thick = 9 + rng() * 4;
    const horizontal = rng() < 0.5;
    return {
      prims: [{ kind: 'rect', x, y, hw: horizontal ? long : thick, hh: horizontal ? thick : long }],
      extent: long,
    };
  }
  // L shape: two bars sharing a corner, rotated by a multiple of 90 degrees.
  const base: Obstacle[] = [
    { kind: 'rect', x: 0, y: 0, hw: 50, hh: 11 },
    { kind: 'rect', x: -39, y: 39, hw: 11, hh: 50 },
  ];
  const rotated = rotateL(base, Math.floor(rng() * 4)).map((p) =>
    p.kind === 'rect' ? ({ ...p, x: p.x + x, y: p.y + y } as Obstacle) : p,
  );
  return { prims: rotated, extent: 70 };
}

function placeObstacles(shape: Shape, tier: Tier, attempt: number, rng: () => number): Obstacle[] {
  let count = tier === 'standard' ? 1 + (rng() < 0.5 ? 1 : 0) : 3 + (rng() < 0.5 ? 1 : 0);
  // Later attempts ask for fewer obstacles so a fair layout is always findable.
  if (attempt >= 10) count -= 1;
  if (attempt >= 15) count -= 1;
  count = Math.max(1, count);
  const minClear = Math.min(120, 0.75 * MAX_CLEARANCE[shape]);
  const out: Obstacle[] = [];
  const centers: Point[] = [];
  for (let i = 0; i < count; i++) {
    for (let tries = 0; tries < 60; tries++) {
      const x = 60 + rng() * (ARENA - 120);
      const y = 60 + rng() * (ARENA - 120);
      if (-arenaSdf(shape, x, y) < minClear) continue;
      if (centers.some((c) => Math.hypot(c.x - x, c.y - y) < 140)) continue;
      const { prims } = makeObstacle(x, y, rng);
      out.push(...prims);
      centers.push({ x, y });
      break;
    }
  }
  return out;
}

/** Build the whole map from a seed. Same seed and tier always give the same map. */
export function generateMap(seedIn: number, tier: Tier): GameMap {
  const seed = (seedIn & SEED_MASK) >>> 0;
  const salt = TIER_SALT[tier];
  const shape = pickShape(mulberry32(mix(seed, salt)), tier);

  let obstacles: Obstacle[] = [];
  let attempt = 0;
  if (tier !== 'open') {
    let found = false;
    for (attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const rng = mulberry32(mix(seed, 100 + attempt * 7 + salt));
      const cand = placeObstacles(shape, tier, attempt, rng);
      if (analyze(shape, cand).fair) {
        obstacles = cand;
        found = true;
        break;
      }
    }
    if (!found) {
      obstacles = [];
      attempt = MAX_ATTEMPTS;
    }
  }

  const info = analyze(shape, obstacles);

  // Spawn: somewhere well away from every wall and obstacle.
  const spawnRng = mulberry32(mix(seed, 5000 + salt));
  const roomy: number[] = [];
  for (let i = 0; i < info.clr.length; i++) if (info.clr[i] >= 0.8 * info.maxClear) roomy.push(i);
  const spawn = cellCenter(roomy[Math.floor(spawnRng() * roomy.length)] ?? info.best);

  // Coins: 100 spots on wide, reachable floor, each far from the one before it.
  const coinRng = mulberry32(mix(seed, 9000 + salt));
  const candidates: number[] = [];
  for (let i = 0; i < info.wide.length; i++) if (info.wide[i]) candidates.push(i);
  const coins: Point[] = [];
  let prev = spawn;
  for (let k = 0; k < COIN_COUNT; k++) {
    let pick = cellCenter(candidates[Math.floor(coinRng() * candidates.length)]);
    for (let tries = 0; tries < 30 && Math.hypot(pick.x - prev.x, pick.y - prev.y) < 150; tries++) {
      pick = cellCenter(candidates[Math.floor(coinRng() * candidates.length)]);
    }
    const jx = (coinRng() - 0.5) * 8;
    const jy = (coinRng() - 0.5) * 8;
    const p = { x: pick.x + jx, y: pick.y + jy };
    const final = clearance({ shape, obstacles }, p.x, p.y) >= WIDE_CLEARANCE - 4 ? p : pick;
    coins.push(final);
    prev = final;
  }

  return { seed, tier, shape, obstacles, spawn, coins, attempt };
}

/** Re-run the fairness checks on a finished map (used by tests). */
export function checkFair(map: GameMap): boolean {
  return analyze(map.shape, map.obstacles).fair;
}

