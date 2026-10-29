import { describe, expect, it } from 'vitest';
import { COIN_COUNT, checkFair, generateMap } from '../src/map/generate';
import { clearance } from '../src/map/geometry';
import { decodeSeed, encodeSeed } from '../src/map/seedcode';
import { TIERS } from '../src/map/types';
import { PLAYER_R } from '../src/core/constants';

describe('map generation', () => {
  it('builds an identical map from the same seed, 50 times over', () => {
    for (const tier of TIERS) {
      const first = JSON.stringify(generateMap(123456, tier));
      for (let i = 0; i < 50; i++) expect(JSON.stringify(generateMap(123456, tier))).toBe(first);
    }
  });

  it('never produces a map that fails the fairness checks', () => {
    for (const tier of TIERS) {
      for (let seed = 1; seed <= 250; seed++) {
        const map = generateMap(seed * 7919, tier);
        expect(checkFair(map), `seed ${seed * 7919} ${tier} ${map.shape}`).toBe(true);
      }
    }
  });

  it('puts spawn and all coins on open floor', () => {
    for (const tier of TIERS) {
      for (let seed = 1; seed <= 60; seed++) {
        const map = generateMap(seed * 104729, tier);
        expect(map.coins).toHaveLength(COIN_COUNT);
        expect(clearance(map, map.spawn.x, map.spawn.y)).toBeGreaterThan(PLAYER_R);
        for (const c of map.coins) expect(clearance(map, c.x, c.y)).toBeGreaterThanOrEqual(PLAYER_R * 3 - 4);
      }
    }
  });

  it('respects tiers: open has no obstacles, tight usually has several', () => {
    let tightWithObstacles = 0;
    for (let seed = 1; seed <= 100; seed++) {
      expect(generateMap(seed, 'open').obstacles).toHaveLength(0);
      if (generateMap(seed, 'tight').obstacles.length >= 2) tightWithObstacles++;
    }
    expect(tightWithObstacles).toBeGreaterThan(40);
  });

  it('uses every shape across seeds', () => {
    const shapes = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) shapes.add(generateMap(seed, 'standard').shape);
    expect(shapes.size).toBe(5);
  });
});

describe('seed codes', () => {
  it('round trips seed and tier', () => {
    for (const tier of TIERS) {
      for (const seed of [0, 1, 31, 32, 123456789, 0x3fffffff]) {
        const code = encodeSeed(seed, tier);
        expect(decodeSeed(code)).toEqual({ seed, tier });
      }
    }
  });

  it('is forgiving about case, spaces and lookalike letters', () => {
    const code = encodeSeed(98765, 'standard');
    expect(decodeSeed(code.toLowerCase().replace('-', ' '))).toEqual({ seed: 98765, tier: 'standard' });
  });

  it('rejects junk', () => {
    expect(decodeSeed('')).toBeNull();
    expect(decodeSeed('9-ABCDEF')).toBeNull();
    expect(decodeSeed('2-ABC')).toBeNull();
    expect(decodeSeed('2-ABCDEU')).toBeNull();
  });
});
