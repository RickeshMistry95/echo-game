import { DAILY_EPOCH } from './constants';
import { SEED_MASK, hashString, mulberry32 } from './rng';
import type { Tier } from '../map/types';

const pad = (n: number): string => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD. */
export function localDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  // Noon avoids daylight saving edge cases when adding whole days.
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function addDays(date: string, days: number): string {
  const d = parse(date);
  d.setDate(d.getDate() + days);
  return localDate(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);
}

/** Daily puzzle number, starting at 1 on the launch day. */
export function dailyNumber(date: string): number {
  return Math.max(1, daysBetween(DAILY_EPOCH, date) + 1);
}

/** Everyone gets the same map on the same local date. */
export function dailyMapParams(date: string): { seed: number; tier: Tier } {
  const seed = hashString(`echo-daily-${date}`) & SEED_MASK;
  const tier: Tier = mulberry32(seed)() < 0.3 ? 'tight' : 'standard';
  return { seed, tier };
}

export function shareText(date: string, rounds: number, ghostsDodged: number, nearMisses: number): string {
  return `Echo Daily #${dailyNumber(date)}: ${rounds} round${rounds === 1 ? '' : 's'}\nGhosts dodged: ${ghostsDodged} | Near misses: ${nearMisses}`;
}
