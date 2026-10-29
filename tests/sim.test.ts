import { describe, expect, it } from 'vitest';
import { ROUND_TICKS, SHIELD_TICKS } from '../src/core/constants';
import { beginRound, createRun, ghostPos, nextRound, step, type RunState } from '../src/core/sim';
import { generateMap } from '../src/map/generate';
import { clearance } from '../src/map/geometry';

const map = generateMap(42, 'open');

/** Drive the player straight at the coin, then idle, so the round is cleared. */
function playRound(s: RunState, path?: (s: RunState, t: number) => [number, number]) {
  for (let t = 0; t < ROUND_TICKS && s.status === 'playing'; t++) {
    const [ix, iy] = path ? path(s, t) : towardCoin(s);
    step(s, ix, iy);
  }
}

function towardCoin(s: RunState): [number, number] {
  if (s.coinTaken) return [0, 0];
  const dx = s.coin.x - s.x;
  const dy = s.coin.y - s.y;
  const d = Math.hypot(dx, dy) || 1;
  return [dx / d, dy / d];
}

describe('simulation', () => {
  it('clears a round by taking the coin, and the path becomes a ghost', () => {
    const s = createRun(map);
    playRound(s);
    expect(s.status).toBe('roundEnd');
    expect(s.roundsCleared).toBe(1);
    expect(s.ghosts).toHaveLength(1);
    expect(s.points).toBeGreaterThanOrEqual(100);
  });

  it('standing still without the coin ends the run', () => {
    const s = createRun(map);
    playRound(s, () => [0, 0]);
    expect(s.status).toBe('dead');
    expect(s.deathCause).toBe('coin');
    expect(s.roundsCleared).toBe(0);
  });

  it('is deterministic: same inputs give the same run', () => {
    const run = () => {
      const s = createRun(map);
      playRound(s, (st, t) => [Math.sin(t / 20), Math.cos(t / 33)]);
      return Array.from(s.rec.slice(0, 40)).concat([s.x, s.y, s.points]);
    };
    expect(run()).toEqual(run());
  });

  it('a recorded path replays exactly: re-simulating the stored inputs reproduces every position', () => {
    const s = createRun(map);
    playRound(s);
    const inputs = s.roundInputs[0];
    const ghost = s.ghosts[0];
    const again = createRun(map);
    for (let t = 0; t < ROUND_TICKS; t++) step(again, inputs[t * 2] / 127, inputs[t * 2 + 1] / 127);
    expect(Array.from(again.ghosts[0])).toEqual(Array.from(ghost));
  });

  it('next round starts where the last one ended, with a ghost that starts at the first spawn', () => {
    const s = createRun(map);
    playRound(s);
    const endX = s.x;
    const endY = s.y;
    nextRound(s);
    expect(s.round).toBe(2);
    expect([s.x, s.y]).toEqual([endX, endY]);
    const g = ghostPos(s.ghosts[0], 0, { x: 0, y: 0 });
    expect(Math.hypot(g.x - map.spawn.x, g.y - map.spawn.y)).toBeLessThan(10);
  });

  it('touching a ghost after the shield ends the run, and names the killer', () => {
    const s = createRun(map);
    playRound(s);
    nextRound(s);
    // Walk straight into where ghost 0 will be once the shield is over.
    let died = false;
    for (let t = 0; t < ROUND_TICKS && s.status === 'playing'; t++) {
      const g = ghostPos(s.ghosts[0], t + 10, { x: 0, y: 0 });
      const dx = g.x - s.x;
      const dy = g.y - s.y;
      const d = Math.hypot(dx, dy) || 1;
      step(s, dx / d, dy / d);
      if ((s.status as string) === 'dead') died = true;
    }
    expect(died).toBe(true);
    expect(s.deathCause).toBe('ghost');
    expect(s.killer).toBe(0);
  });

  it('the spawn shield protects the first moments of a round', () => {
    const s = createRun(map);
    playRound(s);
    nextRound(s);
    // Put the first ghost right on top of the player for the shield window.
    s.ghosts[0].fill(0);
    for (let t = 0; t < ROUND_TICKS; t++) {
      s.ghosts[0][t * 2] = s.x;
      s.ghosts[0][t * 2 + 1] = s.y;
    }
    for (let t = 0; t < SHIELD_TICKS; t++) step(s, 0, 0);
    expect(s.status).toBe('playing');
    step(s, 0, 0);
    expect(s.status).toBe('dead');
  });

  it('harmless runs (practice, tutorial) ignore ghosts and missed coins', () => {
    const s = createRun(map, true);
    playRound(s, () => [0, 0]);
    expect(s.status).toBe('roundEnd');
    nextRound(s);
    s.ghosts[0].fill(300);
    playRound(s, () => [0, 0]);
    expect(s.status).toBe('roundEnd');
    expect(s.roundsCleared).toBe(2);
  });

  it('stays inside walls on every shape and tier', () => {
    for (const tier of ['open', 'standard', 'tight'] as const) {
      for (let seed = 1; seed <= 30; seed++) {
        const m = generateMap(seed * 31, tier);
        const s = createRun(m, true);
        for (let t = 0; t < ROUND_TICKS; t++) {
          // Run hard in a rotating direction to rub against walls and obstacles.
          const a = (t / 40) * Math.PI;
          step(s, Math.cos(a), Math.sin(a));
          expect(clearance(m, s.x, s.y)).toBeGreaterThan(8.5);
        }
      }
    }
  });

  it('coin spawns far from the start and away from ghost starts', () => {
    const s = createRun(map);
    for (let r = 0; r < 6; r++) {
      expect(Math.hypot(s.coin.x - s.startX, s.coin.y - s.startY)).toBeGreaterThanOrEqual(150);
      playRound(s);
      if (s.status !== 'roundEnd') break;
      nextRound(s);
    }
    expect(s.roundsCleared).toBeGreaterThanOrEqual(4);
  });

  it('beginRound resets the round without losing ghosts', () => {
    const s = createRun(map);
    playRound(s);
    nextRound(s);
    for (let t = 0; t < 30; t++) step(s, 1, 0);
    beginRound(s);
    expect(s.tick).toBe(0);
    expect(s.ghosts).toHaveLength(1);
  });
});
