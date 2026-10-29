import { ARENA, CENTER, COIN_R, GHOST_R, PLAYER_R } from '../core/constants';
import { ghostKindFor, ghostPosK, ghostSolid, type GhostKind } from '../core/sim';
import { SHAPE } from '../map/geometry';
import type { GameMap, Point } from '../map/types';
import type { Effects } from './effects';

export const COLORS = {
  bg: '#05060b',
  arena: '#0b0f1e',
  border: '#4a7dff',
  obstacle: '#1b2136',
  obstacleEdge: '#8393c9',
  player: '#ffffff',
  ghost: '93, 179, 255',
  ghostHC: '0, 240, 255',
  risky: '#ff7a45',
  coin: '#ffb703',
  danger: '#ff5d73',
};

export interface DrawOptions {
  highContrast: boolean;
  largerDots: boolean;
}

export interface Scene {
  map: GameMap;
  ghosts: Float32Array[];
  /** Fractional tick used to place ghosts. */
  ghostTick: number;
  player: { x: number; y: number; shield: boolean; boost: boolean } | null;
  coin: Point | null;
  /** The coin sits on a clone's future path and pays triple. */
  coinRisky: boolean;
  /** Ghost to highlight in red, or -1. */
  killer: number;
  /** Seconds, for animations. */
  time: number;
  countdown: string | null;
  /** 0..1 darkening of the whole arena. */
  dim: number;
  options: DrawOptions;
  effects: Effects | null;
}

function arenaPath(ctx: CanvasRenderingContext2D, shape: GameMap['shape']): void {
  ctx.beginPath();
  const c = CENTER;
  switch (shape) {
    case 'square': {
      const h = SHAPE.squareHalf;
      ctx.rect(c - h, c - h, h * 2, h * 2);
      break;
    }
    case 'circle':
      ctx.arc(c, c, SHAPE.circleR, 0, Math.PI * 2);
      break;
    case 'octagon': {
      const r = SHAPE.octagonInradius / Math.cos(Math.PI / 8);
      for (let k = 0; k < 8; k++) {
        const a = Math.PI / 8 + (k * Math.PI) / 4;
        const x = c + Math.cos(a) * r;
        const y = c + Math.sin(a) * r;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    }
    case 'plus': {
      const L = SHAPE.plusLong;
      const S = SHAPE.plusShort;
      const pts: [number, number][] = [
        [-S, -L], [S, -L], [S, -S], [L, -S], [L, S], [S, S], [S, L], [-S, L], [-S, S], [-L, S], [-L, -S], [-S, -S],
      ];
      pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(c + x, c + y) : ctx.lineTo(c + x, c + y)));
      ctx.closePath();
      break;
    }
    case 'ring':
      ctx.arc(c, c, SHAPE.ringOuter, 0, Math.PI * 2);
      ctx.moveTo(c + SHAPE.ringInner, c);
      ctx.arc(c, c, SHAPE.ringInner, 0, Math.PI * 2, true);
      break;
  }
}

/** Draw the arena floor, its glowing border and the obstacles. The context must already be in world units. */
export function drawArena(ctx: CanvasRenderingContext2D, map: GameMap, highContrast: boolean, glow = true): void {
  ctx.save();
  arenaPath(ctx, map.shape);
  ctx.fillStyle = COLORS.arena;
  ctx.fill('evenodd');
  ctx.lineJoin = 'round';
  ctx.strokeStyle = highContrast ? '#ffffff' : COLORS.border;
  ctx.lineWidth = highContrast ? 4 : 2.5;
  if (glow) {
    ctx.shadowColor = highContrast ? '#ffffff' : COLORS.border;
    ctx.shadowBlur = 16;
  }
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.lineJoin = 'round';
  for (const o of map.obstacles) {
    ctx.beginPath();
    if (o.kind === 'circle') ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
    else ctx.rect(o.x - o.hw, o.y - o.hh, o.hw * 2, o.hh * 2);
    ctx.fillStyle = highContrast ? '#3a4260' : COLORS.obstacle;
    ctx.fill();
    ctx.strokeStyle = highContrast ? '#ffffff' : COLORS.obstacleEdge;
    ctx.lineWidth = highContrast ? 3 : 2;
    ctx.stroke();
  }
  ctx.restore();
}

function drawCoin(ctx: CanvasRenderingContext2D, coin: Point, time: number, risky: boolean): void {
  const color = risky ? COLORS.risky : COLORS.coin;
  const spin = Math.abs(Math.cos(time * 2.6));
  const hw = Math.max(2, (COIN_R + 1) * spin);
  const hh = COIN_R + 3;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = risky ? 22 : 14;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(coin.x, coin.y - hh);
  ctx.lineTo(coin.x + hw, coin.y);
  ctx.lineTo(coin.x, coin.y + hh);
  ctx.lineTo(coin.x - hw, coin.y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Soft pulse so the coin is easy to find among ghosts.
  ctx.save();
  ctx.globalAlpha = 0.35 * (0.5 + 0.5 * Math.sin(time * 4));
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(coin.x, coin.y, 18 + 3 * Math.sin(time * 4), 0, Math.PI * 2);
  ctx.stroke();
  if (risky) {
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(coin.x, coin.y, 27 + 3 * Math.sin(time * 6), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** RGB triple per clone behaviour: echo blue, slow violet, flicker green, mirror pink. */
function kindColor(kind: GhostKind, hc: boolean): string {
  if (hc) return kind === 'echo' ? COLORS.ghostHC : kind === 'slow' ? '255, 255, 0' : kind === 'flicker' ? '0, 255, 120' : '255, 120, 255';
  switch (kind) {
    case 'slow':
      return '182, 140, 255';
    case 'flicker':
      return '110, 235, 190';
    case 'mirror':
      return '255, 130, 200';
    default:
      return COLORS.ghost;
  }
}

const tmp: Point = { x: 0, y: 0 };

/** Draw one full frame of the game into a context already scaled to world units. */
export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { map, ghosts, options } = scene;
  const vis = options.largerDots ? 1.35 : 1;
  const hc = options.highContrast;

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, ARENA, ARENA);

  ctx.save();
  if (scene.effects) {
    const o = scene.effects.shakeOffset();
    ctx.translate(o.x, o.y);
  }

  drawArena(ctx, map, hc);
  if (scene.coin) drawCoin(ctx, scene.coin, scene.time, scene.coinRisky);

  const n = ghosts.length;
  for (let gi = 0; gi < n; gi++) {
    const g = ghosts[gi];
    const kind = ghostKindFor(map.seed, gi);
    const rgb = kindColor(kind, hc);
    const solid = ghostSolid(kind, scene.ghostTick);
    const age = n - 1 - gi;
    const alpha = Math.max(0.4, 1 - 0.06 * age) * (solid ? 1 : 0.35);
    ghostPosK(g, kind, scene.ghostTick, tmp);
    const gx = tmp.x;
    const gy = tmp.y;

    // Where this clone is about to go: a dashed line fading out over the next second.
    if (solid) {
      let px = gx;
      let py = gy;
      ctx.lineCap = 'round';
      ctx.lineWidth = 2 * vis;
      ctx.setLineDash([3, 5]);
      for (let k = 1; k <= 8; k++) {
        ghostPosK(g, kind, scene.ghostTick + k * 6, tmp);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(tmp.x, tmp.y);
        ctx.strokeStyle = `rgba(${rgb}, ${0.4 * alpha * (1 - k / 9)})`;
        ctx.stroke();
        px = tmp.x;
        py = tmp.y;
      }
      ctx.setLineDash([]);
    }

    // Short fading tail so you can read each ghost's direction at a glance.
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    for (let k = 1; k <= 6; k++) {
      const t = scene.ghostTick - k * 2;
      if (t < 0) break;
      ghostPosK(g, kind, t, tmp);
      ctx.lineTo(tmp.x, tmp.y);
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3 * vis;
    ctx.strokeStyle = `rgba(${rgb}, ${0.22 * alpha})`;
    ctx.stroke();

    const isKiller = gi === scene.killer;
    ctx.beginPath();
    ctx.arc(gx, gy, GHOST_R * vis, 0, Math.PI * 2);
    ctx.fillStyle = isKiller ? 'rgba(255, 93, 115, 0.35)' : `rgba(${rgb}, ${(hc ? 0.35 : 0.14) * alpha})`;
    ctx.fill();
    ctx.lineWidth = (hc ? 3 : 2) * (isKiller ? 1.4 : 1);
    ctx.strokeStyle = isKiller ? COLORS.danger : `rgba(${rgb}, ${alpha})`;
    ctx.stroke();

    if (kind === 'slow') {
      // Slow clones wear a second ring.
      ctx.beginPath();
      ctx.arc(gx, gy, (GHOST_R + 4) * vis, 0, Math.PI * 2);
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${rgb}, ${0.6 * alpha})`;
      ctx.stroke();
    } else if (kind === 'mirror') {
      // Mirror clones have a cross hair.
      ctx.beginPath();
      ctx.moveTo(gx - 5 * vis, gy);
      ctx.lineTo(gx + 5 * vis, gy);
      ctx.moveTo(gx, gy - 5 * vis);
      ctx.lineTo(gx, gy + 5 * vis);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `rgba(${rgb}, ${0.8 * alpha})`;
      ctx.stroke();
    }

    if (isKiller) {
      ctx.beginPath();
      ctx.arc(gx, gy, (15 + 4 * Math.sin(scene.time * 8)) * vis, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255, 93, 115, 0.7)';
      ctx.stroke();
    }
  }

  if (scene.player) {
    const p = scene.player;
    ctx.save();
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 14;
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_R * vis, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (p.boost) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = '#9fffd8';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#9fffd8';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(p.x, p.y, (PLAYER_R + 5) * vis, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (p.shield) {
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(scene.time * 30);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, (PLAYER_R + 6) * vis, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  scene.effects?.draw(ctx);
  ctx.restore();

  if (scene.dim > 0) {
    ctx.fillStyle = `rgba(5, 6, 12, ${scene.dim})`;
    ctx.fillRect(0, 0, ARENA, ARENA);
  }

  if (scene.effects && scene.effects.flash > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.35, scene.effects.flash * 0.35)})`;
    ctx.fillRect(0, 0, ARENA, ARENA);
  }

  if (scene.countdown) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 150px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.fillText(scene.countdown, CENTER, CENTER);
    ctx.restore();
  }
}

/** Small preview of a map for the menus: arena, obstacles and the spawn point. */
export function drawMapThumb(canvas: HTMLCanvasElement, map: GameMap): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const size = canvas.clientWidth || 160;
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  ctx.setTransform((canvas.width / ARENA), 0, 0, (canvas.height / ARENA), 0, 0);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, ARENA, ARENA);
  drawArena(ctx, map, false, false);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(map.spawn.x, map.spawn.y, 14, 0, Math.PI * 2);
  ctx.fill();
}
