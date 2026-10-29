import { CENTER } from '../core/constants';
import type { GameMap, Obstacle, Shape } from './types';

// Signed distance helpers. Negative means inside. All arenas are centred on (CENTER, CENTER).

function sdBox(u: number, v: number, hx: number, hy: number): number {
  const qx = Math.abs(u) - hx;
  const qy = Math.abs(v) - hy;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
}

const SQ = Math.SQRT1_2;

export const SHAPE = {
  squareHalf: 270,
  circleR: 270,
  octagonInradius: 262,
  plusLong: 275,
  plusShort: 100,
  ringOuter: 275,
  ringInner: 95,
} as const;

export function arenaSdf(shape: Shape, x: number, y: number): number {
  const u = x - CENTER;
  const v = y - CENTER;
  switch (shape) {
    case 'square':
      return sdBox(u, v, SHAPE.squareHalf, SHAPE.squareHalf);
    case 'circle':
      return Math.hypot(u, v) - SHAPE.circleR;
    case 'octagon': {
      const a = SHAPE.octagonInradius;
      return Math.max(sdBox(u, v, a, a), sdBox((u + v) * SQ, (u - v) * SQ, a, a));
    }
    case 'plus':
      return Math.min(sdBox(u, v, SHAPE.plusLong, SHAPE.plusShort), sdBox(u, v, SHAPE.plusShort, SHAPE.plusLong));
    case 'ring': {
      const r = Math.hypot(u, v);
      return Math.max(r - SHAPE.ringOuter, SHAPE.ringInner - r);
    }
  }
}

function obstacleSdf(o: Obstacle, x: number, y: number): number {
  if (o.kind === 'circle') return Math.hypot(x - o.x, y - o.y) - o.r;
  return sdBox(x - o.x, y - o.y, o.hw, o.hh);
}

/** Signed distance to the walkable space boundary: negative means open floor. */
export function sdfFree(shape: Shape, obstacles: readonly Obstacle[], x: number, y: number): number {
  let d = arenaSdf(shape, x, y);
  let obs = Infinity;
  for (const o of obstacles) obs = Math.min(obs, obstacleSdf(o, x, y));
  if (obs !== Infinity) d = Math.max(d, -obs);
  return d;
}

/** Distance from the point to the nearest wall or obstacle (positive on open floor). */
export function clearance(map: Pick<GameMap, 'shape' | 'obstacles'>, x: number, y: number): number {
  return -sdfFree(map.shape, map.obstacles, x, y);
}

const EPS = 0.5;

export interface Resolved {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * Push a circle of radius r out of walls and obstacles, sliding along them.
 * Mutates and returns `out`.
 */
export function pushOut(
  map: Pick<GameMap, 'shape' | 'obstacles'>,
  out: Resolved,
  prevX: number,
  prevY: number,
  r: number,
): Resolved {
  for (let i = 0; i < 4; i++) {
    const d = sdfFree(map.shape, map.obstacles, out.x, out.y);
    const pen = d + r;
    if (pen <= 0) return out;
    const gx = sdfFree(map.shape, map.obstacles, out.x + EPS, out.y) - sdfFree(map.shape, map.obstacles, out.x - EPS, out.y);
    const gy = sdfFree(map.shape, map.obstacles, out.x, out.y + EPS) - sdfFree(map.shape, map.obstacles, out.x, out.y - EPS);
    const len = Math.hypot(gx, gy);
    if (len < 1e-6) {
      out.x = prevX;
      out.y = prevY;
      out.vx = 0;
      out.vy = 0;
      return out;
    }
    const nx = gx / len;
    const ny = gy / len;
    out.x -= nx * pen;
    out.y -= ny * pen;
    const into = out.vx * nx + out.vy * ny;
    if (into > 0) {
      out.vx -= into * nx;
      out.vy -= into * ny;
    }
  }
  return out;
}
