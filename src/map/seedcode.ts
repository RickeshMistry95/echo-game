import { SEED_MASK } from '../core/rng';
import type { Tier } from './types';

// Crockford base 32: no I, L, O or U, so codes are easy to read aloud and type.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIER_DIGIT: Record<Tier, string> = { open: '1', standard: '2', tight: '3' };
const DIGIT_TIER: Record<string, Tier> = { '1': 'open', '2': 'standard', '3': 'tight' };

/** A map is identified by its tier digit plus a 30 bit seed, e.g. "2-K7QX24". */
export function encodeSeed(seed: number, tier: Tier): string {
  let n = seed & SEED_MASK;
  let s = '';
  for (let i = 0; i < 6; i++) {
    s = ALPHABET[n & 31] + s;
    n >>>= 5;
  }
  return `${TIER_DIGIT[tier]}-${s}`;
}

export function decodeSeed(code: string): { seed: number; tier: Tier } | null {
  const clean = code
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (clean.length !== 7) return null;
  const tier = DIGIT_TIER[clean[0]];
  if (!tier) return null;
  let seed = 0;
  for (let i = 1; i < 7; i++) {
    const v = ALPHABET.indexOf(clean[i]);
    if (v < 0) return null;
    seed = seed * 32 + v;
  }
  return { seed, tier };
}
