import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from '../src/storage/adapters';
import { defaultSave, packPath, sanitize, unpackPath } from '../src/storage/schema';
import { Store } from '../src/storage/store';
import { addDays, dailyMapParams, dailyNumber, shareText } from '../src/core/daily';

const rec = (over: Partial<Parameters<Store['recordRun']>[0]> = {}) => ({
  at: new Date().toISOString(),
  mode: 'classic' as const,
  tier: 'standard' as const,
  code: '2-ABCDEF',
  rounds: 4,
  points: 450,
  coins: 4,
  nearMisses: 2,
  ms: 40000,
  ghostsDodged: 6,
  cause: 'ghost' as const,
  ...over,
});

describe('store', () => {
  it('survives a reload: data written through one store is read by the next', async () => {
    const adapter = new MemoryAdapter();
    const a = new Store(adapter);
    await a.init();
    await a.recordRun(rec(), [new Float32Array(1200).fill(100)], '2026-10-29');
    const b = new Store(adapter);
    await b.init();
    expect(b.data.bests.classic).toEqual({ rounds: 4, points: 450 });
    expect(b.data.runs).toHaveLength(1);
    expect(b.data.replays.classic?.ghosts).toHaveLength(1);
  });

  it('reports new bests and keeps the better score', async () => {
    const s = new Store(new MemoryAdapter());
    await s.init();
    expect((await s.recordRun(rec({ rounds: 3, points: 300 }), [], 'x')).newBest).toBe(true);
    expect((await s.recordRun(rec({ rounds: 2, points: 900 }), [], 'x')).newBest).toBe(false);
    expect((await s.recordRun(rec({ rounds: 3, points: 350 }), [], 'x')).newBest).toBe(true);
    expect(s.data.bests.classic).toEqual({ rounds: 3, points: 350 });
    expect(s.data.lifetime.runs).toBe(3);
  });

  it('keeps only the last 200 runs', async () => {
    const s = new Store(new MemoryAdapter());
    await s.init();
    for (let i = 0; i < 230; i++) await s.recordRun(rec({ rounds: 1, code: `2-${String(i).padStart(6, '0')}` }), [], 'x');
    expect(s.data.runs).toHaveLength(200);
  });

  it('tracks daily attempts and a consecutive day streak', async () => {
    const s = new Store(new MemoryAdapter());
    await s.init();
    await s.startDailyAttempt('2026-10-29', '2-AAAAAA');
    await s.startDailyAttempt('2026-10-29', '2-AAAAAA');
    expect(s.dailyFor('2026-10-29')?.attempts).toBe(2);
    expect(s.data.streak.current).toBe(1);
    await s.startDailyAttempt('2026-10-30', '2-BBBBBB');
    expect(s.data.streak.current).toBe(2);
    await s.startDailyAttempt('2026-11-02', '2-CCCCCC');
    expect(s.data.streak.current).toBe(1);
    expect(s.data.streak.longest).toBe(2);
  });

  it('records the best daily attempt only', async () => {
    const s = new Store(new MemoryAdapter());
    await s.init();
    await s.startDailyAttempt('2026-10-29', '2-AAAAAA');
    await s.recordRun(rec({ mode: 'daily', rounds: 5, points: 600 }), [], '2026-10-29');
    await s.startDailyAttempt('2026-10-29', '2-AAAAAA');
    await s.recordRun(rec({ mode: 'daily', rounds: 3, points: 900 }), [], '2026-10-29');
    expect(s.dailyFor('2026-10-29')).toMatchObject({ rounds: 5, points: 600, attempts: 2 });
  });

  it('does not crash on corrupt or hostile saves', async () => {
    for (const raw of ['{not json', 'null', '[]', '{"version":1,"settings":{"musicVolume":"loud"},"runs":"x","bests":5}']) {
      const s = new Store(new MemoryAdapter(raw));
      await s.init();
      expect(s.data.version).toBe(1);
      expect(s.data.settings.musicVolume).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(s.data.runs)).toBe(true);
    }
  });

  it('exports and imports a save', async () => {
    const a = new Store(new MemoryAdapter());
    await a.init();
    await a.recordRun(rec({ rounds: 9, points: 999 }), [], 'x');
    const text = await a.exportSave();
    const b = new Store(new MemoryAdapter());
    await b.init();
    expect(await b.importSave(text)).toBe(true);
    expect(b.data.bests.classic.rounds).toBe(9);
    expect(await b.importSave('nope')).toBe(false);
    expect(await b.importSave('{"hello":1}')).toBe(false);
  });

  it('resets to defaults', async () => {
    const s = new Store(new MemoryAdapter());
    await s.init();
    await s.recordRun(rec(), [], 'x');
    await s.reset();
    expect(s.data).toEqual(defaultSave());
  });

  it('packs ghost paths to a compact string and back within 0.05 units', () => {
    const path = new Float32Array(1200);
    for (let i = 0; i < path.length; i++) path[i] = 30 + ((i * 7.31) % 540);
    const back = unpackPath(packPath(path));
    expect(back).toHaveLength(path.length);
    for (let i = 0; i < path.length; i++) expect(Math.abs(back[i] - path[i])).toBeLessThan(0.051);
  });

  it('clamps out of range settings', () => {
    const d = sanitize({ version: 1, settings: { musicVolume: 9, touchSensitivity: -4, controls: 'telepathy' } });
    expect(d.settings.musicVolume).toBe(1);
    expect(d.settings.touchSensitivity).toBe(0.5);
    expect(d.settings.controls).toBe('auto');
  });
});

describe('daily helpers', () => {
  it('gives the same daily map for the same date and different ones for different dates', () => {
    expect(dailyMapParams('2026-10-29')).toEqual(dailyMapParams('2026-10-29'));
    expect(dailyMapParams('2026-10-29').seed).not.toBe(dailyMapParams('2026-10-30').seed);
  });

  it('numbers puzzles from the launch day and does month math right', () => {
    expect(dailyNumber('2026-10-29')).toBe(1);
    expect(dailyNumber('2026-11-01')).toBe(4);
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('formats the share text from the plan', () => {
    expect(shareText('2026-10-29', 11, 55, 9)).toBe('Echo Daily #1: 11 rounds\nGhosts dodged: 55 | Near misses: 9');
  });
});
