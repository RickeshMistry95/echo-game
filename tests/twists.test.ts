import { describe, expect, it } from 'vitest';
import {
  BOOST_TICKS,
  COIN_POINTS,
  COMBO_MAX_MULT,
  COMBO_STEP,
  COMBO_WINDOW,
  FLICKER_PERIOD,
  FLICKER_SOLID,
  ROUND_TICKS,
  SLOW_CLONE,
} from '../src/core/constants';
import {
  createRun,
  drainEvents,
  ghostKindFor,
  ghostPos,
  ghostPosK,
  ghostSolid,
  nextRound,
  roundModifier,
  step,
  type RunState,
} from '../src/core/sim';
import { generateMap } from '../src/map/generate';
import { clearance } from '../src/map/geometry';

const map = generateMap(42, 'open');

function chase(s: RunState): [number, number] {
  const dx = s.coin.x - s.x;
  const dy = s.coin.y - s.y;
  const d = Math.hypot(dx, dy) || 1;
  return [dx / d, dy / d];
}

/** A clone that stands still at a point for the whole round. */
function parked(x: number, y: number): Float32Array {
  const g = new Float32Array(ROUND_TICKS * 2);
  for (let t = 0; t < ROUND_TICKS; t++) {
    g[t * 2] = x;
    g[t * 2 + 1] = y;
  }
  return g;
}

describe('combo', () => {
  it('raises the multiplier every few coins in a chain and pays more for it', () => {
    const s = createRun(map, true);
    const coins: { bonus: number; mult: number; combo: number; risky: boolean }[] = [];
    for (let r = 0; r < 2; r++) {
      for (let t = 0; t < ROUND_TICKS && s.status === 'playing'; t++) {
        step(s, ...chase(s));
        for (const ev of drainEvents(s)) if (ev.type === 'coin') coins.push(ev);
      }
      nextRound(s);
    }
    expect(coins.length).toBeGreaterThan(COMBO_STEP * 2);
    coins.forEach((c, i) => {
      expect(c.combo).toBe(i + 1);
      expect(c.mult).toBe(Math.min(COMBO_MAX_MULT, 1 + Math.floor((i + 1) / COMBO_STEP)));
      expect(c.bonus).toBe(COIN_POINTS * c.mult * (c.risky ? 3 : 1));
    });
  });

  it('resets when you stop collecting for too long', () => {
    const s = createRun(map, true);
    while (s.coinsTotal === 0) step(s, ...chase(s));
    expect(s.combo).toBe(1);
    let lost = false;
    for (let t = 0; t < COMBO_WINDOW + 5 && s.status === 'playing'; t++) {
      step(s, 0, 0);
      if (drainEvents(s).some((e) => e.type === 'comboLost')) lost = true;
    }
    expect(lost).toBe(true);
    expect(s.combo).toBe(0);
  });
});

describe('clone behaviours', () => {
  it('are decided by the map seed and the clone number, and early clones are plain', () => {
    for (let i = 0; i < 40; i++) expect(ghostKindFor(99, i)).toBe(ghostKindFor(99, i));
    expect(ghostKindFor(99, 0)).toBe('echo');
    expect(ghostKindFor(99, 1)).toBe('echo');
    const kinds = new Set<string>();
    for (let i = 2; i < 400; i++) kinds.add(ghostKindFor(7, i));
    expect([...kinds].sort()).toEqual(['echo', 'flicker', 'mirror', 'slow']);
  });

  it('slow clones cover ground at a fraction of the speed', () => {
    const g = new Float32Array(ROUND_TICKS * 2);
    for (let t = 0; t < ROUND_TICKS; t++) g[t * 2] = t;
    expect(ghostPosK(g, 'slow', 100, { x: 0, y: 0 }).x).toBeCloseTo(100 * SLOW_CLONE, 3);
  });

  it('mirror clones are the replay reflected through the centre', () => {
    const g = parked(100, 200);
    const p = ghostPosK(g, 'mirror', 10, { x: 0, y: 0 });
    expect(p.x).toBeCloseTo(500);
    expect(p.y).toBeCloseTo(400);
  });

  it('flicker clones are harmless for part of each cycle', () => {
    expect(ghostSolid('flicker', 0)).toBe(true);
    expect(ghostSolid('flicker', FLICKER_SOLID + 1)).toBe(false);
    expect(ghostSolid('flicker', FLICKER_PERIOD + 1)).toBe(true);
    expect(ghostSolid('echo', FLICKER_SOLID + 1)).toBe(true);
    const s = createRun(map);
    s.ghosts.push(parked(s.x, s.y));
    s.ghostKinds.push('flicker');
    nextRound(s);
    s.ghosts[0] = parked(s.x, s.y);
    // Standing on the clone is safe while it is faint...
    s.tick = FLICKER_SOLID + 1;
    step(s, 0, 0);
    expect(s.status).toBe('playing');
    // ...and fatal once it turns solid again.
    s.tick = FLICKER_PERIOD;
    step(s, 0, 0);
    expect(s.status).toBe('dead');
  });
});

describe('round modifiers', () => {
  it('are fixed per map and round, with round 1 always plain', () => {
    expect(roundModifier(5, 1)).toBe('normal');
    const seen = new Set<string>();
    for (let r = 2; r < 200; r++) {
      expect(roundModifier(5, r)).toBe(roundModifier(5, r));
      seen.add(roundModifier(5, r));
    }
    expect([...seen].sort()).toEqual(['double', 'normal', 'sluggish', 'swift']);
  });

  it('change how fast you move', () => {
    const run = (mod: 'normal' | 'swift' | 'sluggish') => {
      const s = createRun(map);
      s.modifier = mod;
      for (let t = 0; t < 30; t++) step(s, 1, 0);
      return s.x - s.startX;
    };
    expect(run('swift')).toBeGreaterThan(run('normal'));
    expect(run('sluggish')).toBeLessThan(run('normal'));
  });

  it('are off in harmless runs such as the tutorial', () => {
    const s = createRun(map, true);
    for (let r = 0; r < 6; r++) {
      expect(s.modifier).toBe('normal');
      nextRound(s);
    }
  });
});

describe('risky coins and boosts', () => {
  it('risky coins appear on open floor and pay triple', () => {
    let risky = 0;
    for (const seed of [3, 11, 29]) {
      const m = generateMap(seed, 'open');
      const s = createRun(m, true);
      for (let r = 0; r < 5; r++) {
        for (let t = 0; t < ROUND_TICKS; t++) {
          step(s, ...chase(s));
          for (const ev of drainEvents(s)) {
            if (ev.type === 'coin' && ev.risky) {
              risky++;
              expect(ev.bonus % (COIN_POINTS * 3)).toBe(0);
            }
          }
          if (s.coinRisky) expect(clearance(m, s.coin.x, s.coin.y)).toBeGreaterThanOrEqual(23);
        }
        nextRound(s);
      }
    }
    expect(risky).toBeGreaterThan(0);
  });

  it('a near miss gives a speed boost', () => {
    const s = createRun(map);
    nextRound(s);
    // A clone parked 20 units away: close enough for a near miss, too far to touch.
    s.ghosts = [parked(s.x + 22, s.y)];
    s.ghostKinds = ['echo'];
    for (let t = 0; t < 60; t++) step(s, 0, 0);
    expect(s.nearTotal).toBeGreaterThan(0);
    expect(s.boostTicks).toBeGreaterThan(0);
    expect(s.boostTicks).toBeLessThanOrEqual(BOOST_TICKS);
  });

  it('keeps ghost paths intact when replayed', () => {
    const g = parked(120, 340);
    expect(ghostPos(g, 50, { x: 0, y: 0 })).toEqual({ x: 120, y: 340 });
  });
});
