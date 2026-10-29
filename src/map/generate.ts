import { ARENA, CENTER, PLAYER_R } from '../core/constants';
import { SEED_MASK, mix, mulberry32 } from '../core/rng';
import { arenaSdf, clearance } from './geometry';
import type { GameMap, Obstacle, Point, Shape, Tier } from './types';

export const GRID = 40;
export const CELL = ARENA / GRID;
/** Gaps must be at least 3 player widths wide, so a cell needs this much clearance. */
export const WIDE_CLEARANCE = PLAYER_R * 3;
export const COIN_COUNT = 100;
const MAX_ATTEMPTS = 60;

const TIER_SALT: Record<Tier, number> = { open: 1, standard: 2, tight: 3 };
const SHAPES: Shape[] = ['square', 'circle', 'octagon', 'plus', 'ring'];

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

type Rect = Extract<Obstacle, { kind: 'rect' }>;

/** Rotate a layout by k quarter turns about the arena centre. */
function rotate(prims: Obstacle[], k: number): Obstacle[] {
  let out = prims;
  for (let r = 0; r < k; r++) {
    out = out.map((p) => {
      const x = CENTER - (p.y - CENTER);
      const y = CENTER + (p.x - CENTER);
      if (p.kind === 'circle') return { kind: 'circle', x, y, r: p.r };
      return { kind: 'rect', x, y, hw: p.hh, hh: p.hw };
    });
  }
  return out;
}

/** Repeat a layout 2 or 4 times around the centre so it reads as designed rather than random. */
function fold(base: Obstacle[], times: 1 | 2 | 4): Obstacle[] {
  if (times === 1) return base;
  const out: Obstacle[] = [...base];
  const turns = times === 2 ? [2] : [1, 2, 3];
  for (const k of turns) out.push(...rotate(base, k));
  return out;
}

const circ = (dx: number, dy: number, r: number): Obstacle => ({ kind: 'circle', x: CENTER + dx, y: CENTER + dy, r });
const rect = (dx: number, dy: number, hw: number, hh: number): Rect => ({ kind: 'rect', x: CENTER + dx, y: CENTER + dy, hw, hh });
const between = (rng: () => number, lo: number, hi: number): number => lo + rng() * (hi - lo);
const pickOne = <T>(rng: () => number, items: T[]): T => items[Math.floor(rng() * items.length)];

/** A ring of pillars, sometimes with a big one in the middle. */
function pillars(rng: () => number): Obstacle[] {
  const n = 3 + Math.floor(rng() * 4);
  const R = between(rng, 120, 190);
  const r = between(rng, 26, 40);
  const a0 = rng() * Math.PI * 2;
  const out: Obstacle[] = [];
  for (let k = 0; k < n; k++) {
    const a = a0 + (k * Math.PI * 2) / n;
    out.push(circ(Math.cos(a) * R, Math.sin(a) * R, r));
  }
  if (rng() < 0.4) out.push(circ(0, 0, between(rng, 38, 52)));
  return out;
}

/** Two crossing walls with doorways, splitting the arena into four rooms. */
function cross(rng: () => number): Obstacle[] {
  const door = between(rng, 48, 70);
  const end = between(rng, 190, 250);
  const t = between(rng, 13, 19);
  const half = (end - door) / 2;
  const mid = door + half;
  const base = [rect(mid, 0, half, t), rect(-mid, 0, half, t)];
  return rng() < 0.5 ? [...base, ...rotate(base, 1)] : base;
}

/** City blocks: rectangles placed symmetrically with streets between them. */
function blocks(rng: () => number): Obstacle[] {
  const gx = between(rng, 120, 175);
  const gy = between(rng, 120, 175);
  const hw = between(rng, 40, 80);
  const hh = between(rng, 40, 80);
  const base = [rect(gx, gy, hw, hh)];
  return fold(base, pickOne(rng, [2, 4, 4]));
}

/** Staggered horizontal bars forming a zig zag path. */
function lanes(rng: () => number): Obstacle[] {
  const rows = rng() < 0.5 ? 3 : 4;
  const gap = between(rng, 95, 125);
  const hw = between(rng, 120, 190);
  const t = between(rng, 13, 19);
  const shift = between(rng, 70, 120);
  const out: Obstacle[] = [];
  for (let i = 0; i < rows; i++) {
    const y = (i - (rows - 1) / 2) * gap;
    out.push(rect(i % 2 === 0 ? -shift : shift, y, hw, t));
  }
  return rng() < 0.3 ? rotate(out, 1) : out;
}

/** A square or offset grid of small posts. */
function grid(rng: () => number): Obstacle[] {
  const s = between(rng, 120, 175);
  const r = between(rng, 22, 32);
  const out: Obstacle[] = [];
  if (rng() < 0.5) {
    for (const dx of [-s / 2, s / 2]) for (const dy of [-s / 2, s / 2]) out.push(circ(dx, dy, r));
  } else {
    for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) out.push(circ(dx, dy, r));
  }
  return out;
}

/** A big central block with satellites orbiting it. */
function fortress(rng: () => number): Obstacle[] {
  const out: Obstacle[] = [];
  const big = rng() < 0.5;
  const core = between(rng, 55, 90);
  out.push(big ? circ(0, 0, core) : rect(0, 0, core, core * between(rng, 0.6, 1)));
  const n = pickOne(rng, [2, 4, 4, 6]);
  const R = core + between(rng, 95, 125);
  const r = between(rng, 22, 32);
  const a0 = rng() * Math.PI;
  for (let k = 0; k < n; k++) {
    const a = a0 + (k * Math.PI * 2) / n;
    out.push(circ(Math.cos(a) * R, Math.sin(a) * R, r));
  }
  return out;
}

/** The old look: a few loose obstacles, optionally mirrored. */
function scatter(rng: () => number): Obstacle[] {
  const base: Obstacle[] = [];
  const n = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const dx = between(rng, 60, 190) * (rng() < 0.5 ? -1 : 1);
    const dy = between(rng, 60, 190) * (rng() < 0.5 ? -1 : 1);
    const roll = rng();
    if (roll < 0.5) base.push(circ(dx, dy, between(rng, 32, 52)));
    else if (roll < 0.8) {
      const long = between(rng, 70, 120);
      const thick = between(rng, 12, 17);
      base.push(rng() < 0.5 ? rect(dx, dy, long, thick) : rect(dx, dy, thick, long));
    } else {
      base.push(rect(dx, dy, 50, 11), rect(dx - 39, dy + 39, 11, 50));
    }
  }
  return fold(base, pickOne(rng, [1, 2, 4]));
}

/** A walled room in the middle with a doorway on every side, sometimes with a pillar inside. */
function rooms(rng: () => number): Obstacle[] {
  const H = between(rng, 115, 160);
  const door = between(rng, 42, 58);
  const t = between(rng, 13, 18);
  const half = (H + t - door) / 2;
  const mid = door + half;
  const side = [rect(mid, -H, half, t), rect(-mid, -H, half, t)];
  const out = fold(side, 4);
  if (rng() < 0.5) out.push(circ(0, 0, between(rng, 22, 34)));
  return out;
}

/** Four chunky blocks at the compass points, good for ring shaped arenas. */
function compass(rng: () => number): Obstacle[] {
  const R = between(rng, 150, 200);
  const radial = between(rng, 24, 38);
  const tangent = between(rng, 45, 75);
  return fold([rect(R, 0, radial, tangent)], 4);
}

const TEMPLATES: ((rng: () => number) => Obstacle[])[] = [pillars, cross, blocks, lanes, grid, fortress, scatter, rooms, rooms, compass, compass];

/** Every corner of an obstacle must sit inside the arena, so nothing is drawn out in the void. */
function fits(shape: Shape, o: Obstacle): boolean {
  const pad = 14;
  if (o.kind === 'circle') return arenaSdf(shape, o.x, o.y) < -(o.r + pad);
  const pts: [number, number][] = [
    [o.x, o.y],
    [o.x - o.hw, o.y - o.hh],
    [o.x + o.hw, o.y - o.hh],
    [o.x - o.hw, o.y + o.hh],
    [o.x + o.hw, o.y + o.hh],
  ];
  return pts.every(([x, y]) => arenaSdf(shape, x, y) < -pad);
}

/** True when two obstacles are comfortably separated, judged by their bounding circles. */
function apart(a: Obstacle, b: Obstacle): boolean {
  const ra = a.kind === 'circle' ? a.r : Math.hypot(a.hw, a.hh);
  const rb = b.kind === 'circle' ? b.r : Math.hypot(b.hw, b.hh);
  return Math.hypot(a.x - b.x, a.y - b.y) > ra + rb + 70;
}

/** One candidate layout, or null when it spills outside the arena. Later attempts ask for less. */
function placeObstacles(shape: Shape, tier: Tier, attempt: number, rng: () => number): Obstacle[] | null {
  const template = pickOne(rng, TEMPLATES);
  const out = template(rng);
  // Tight maps, and some standard ones, layer a second layout on top of the first.
  if (tier === 'tight' || rng() < 0.35) {
    if (attempt < 25) {
      const extra = pickOne(rng, [pillars, grid, blocks, scatter])(rng);
      if (extra.every((e) => out.every((o) => apart(e, o)))) out.push(...extra);
    }
  }
  if (out.length === 0 || !out.every((o) => fits(shape, o))) return null;
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
      if (cand && analyze(shape, cand).fair) {
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

