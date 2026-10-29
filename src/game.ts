import { AudioEngine } from './audio/synth';
import { ARENA, DT, ROUND_POINTS, ROUND_TICKS } from './core/constants';
import { randomSeed } from './core/rng';
import {
  createRun,
  drainEvents,
  nextRound,
  restartRound,
  step,
  type Mode,
  type RunState,
  type SimEvent,
} from './core/sim';
import { Input } from './input/input';
import { generateMap } from './map/generate';
import { decodeSeed, encodeSeed } from './map/seedcode';
import type { GameMap, Tier } from './map/types';
import { COLORS, drawScene, type Scene } from './render/draw';
import { Effects } from './render/effects';
import { unpackPath, type SavedMode, type Score } from './storage/schema';
import type { Store } from './storage/store';
import { localDate } from './core/daily';

export interface RunConfig {
  mode: Mode;
  seed: number;
  tier: Tier;
  /** Local date for daily runs (YYYY-MM-DD). */
  date?: string;
}

export interface GameOverInfo {
  config: RunConfig;
  code: string;
  rounds: number;
  points: number;
  coins: number;
  nearMisses: number;
  ghostsDodged: number;
  ms: number;
  cause: 'ghost' | 'coin';
  /** Round number of the ghost that caught you, or null. */
  killerRound: number | null;
  newBest: boolean;
  previousBest: Score | null;
}

export interface GameHooks {
  onPauseRequest(): void;
  onGameOver(info: GameOverInfo): void;
  onTutorialComplete(): void;
}

type Phase = 'menu' | 'countdown' | 'playing' | 'roundclear' | 'dying' | 'over' | 'paused' | 'replay';

const COUNTDOWN_FIRST = 1.5;
const COUNTDOWN_NEXT = 1.0;
const CLEAR_TIME = 0.6;
const DYING_TIME = 0.45;
const SLOW_MO = 0.35;
const TUTORIAL_ROUNDS = 3;

const TUTORIAL_TIPS = [
  'Move with WASD, the arrow keys, your mouse, or by dragging. Grab the amber coin before time runs out.',
  'Your last round is now a ghost. Touching it ends a real run, so stay out of its way.',
  'Ghosts pile up. Plan your paths so you leave room for later rounds. Clear this round to finish.',
];

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

/** Slow looping paths that drift around the title screen. */
function makeDemoGhosts(): Float32Array[] {
  const specs = [
    { a: 1, b: 2, ax: 190, ay: 150, p: 0 },
    { a: 2, b: 1, ax: 160, ay: 200, p: 1.3 },
    { a: 1, b: 3, ax: 210, ay: 120, p: 2.2 },
    { a: 3, b: 2, ax: 120, ay: 170, p: 0.7 },
    { a: 2, b: 3, ax: 230, ay: 90, p: 4.1 },
    { a: 1, b: 1, ax: 140, ay: 140, p: 3.3 },
  ];
  return specs.map((s) => {
    const g = new Float32Array(ROUND_TICKS * 2);
    for (let t = 0; t < ROUND_TICKS; t++) {
      const u = (t / ROUND_TICKS) * Math.PI * 2;
      g[t * 2] = ARENA / 2 + s.ax * Math.sin(s.a * u + s.p);
      g[t * 2 + 1] = ARENA / 2 + s.ay * Math.sin(s.b * u + s.p * 0.6);
    }
    return g;
  });
}

export class Game {
  hooks: GameHooks = {
    onPauseRequest: () => undefined,
    onGameOver: () => undefined,
    onTutorialComplete: () => undefined,
  };

  readonly effects = new Effects();
  phase: Phase = 'menu';
  run: RunState | null = null;
  config: RunConfig | null = null;

  private ctx: CanvasRenderingContext2D;
  private phaseT = 0;
  private prevPhase: Phase = 'menu';
  private acc = 0;
  private lastAlpha = 0;
  private time = 0;
  private lastNow = 0;
  private viewTick = 0;
  private finished = false;
  private lastDigit = '';
  private menuMap: GameMap = generateMap(11, 'open');
  private demoGhosts = makeDemoGhosts();
  private replay: { map: GameMap; ghosts: Float32Array[] } | null = null;
  private pendingStart = false;

  private hud = $('hud');
  private hudRound = $('hud-round');
  private hudFill = $('hud-timer-fill');
  private hudCoin = $('hud-coin');
  private hudGhostN = $('hud-ghost-n');
  private hudGhostWord = $('hud-ghost-word');
  private hudPoints = $('hud-points');
  private banner = $('banner');
  private hudCache = { round: '', ghosts: '', points: '', low: false, taken: false };

  constructor(
    private canvas: HTMLCanvasElement,
    private store: Store,
    private audio: AudioEngine,
    private input: Input,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.input.onPause = () => this.requestPause();
    window.addEventListener('resize', () => this.layout());
    window.addEventListener('blur', () => this.requestPause());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.requestPause();
    });
    $('hud-pause').addEventListener('click', () => this.requestPause());
    this.layout();
    this.applySettings();
    requestAnimationFrame((t) => {
      this.lastNow = t;
      this.frame(t);
    });
  }

  // ---- setup ---------------------------------------------------------------

  applySettings(): void {
    const s = this.store.data.settings;
    this.input.scheme = s.controls;
    this.input.sensitivity = s.touchSensitivity;
    this.effects.reducedMotion = s.reducedMotion;
    this.audio.setVolumes(s.musicVolume, s.sfxVolume, s.muted);
    document.body.classList.toggle('high-contrast', s.highContrast);
    document.body.classList.toggle('reduced-motion', s.reducedMotion);
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    $('hud-pause').hidden = !coarse;
  }

  layout(): void {
    const app = $('app');
    const size = Math.max(240, Math.floor(Math.min(window.innerWidth - 16, window.innerHeight - 72, 780)));
    app.style.setProperty('--size', `${size}px`);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.round(size * dpr);
    this.canvas.height = Math.round(size * dpr);
  }

  // ---- public controls -------------------------------------------------------

  /** Map used for a run configuration. */
  static mapFor(config: Pick<RunConfig, 'seed' | 'tier'>): GameMap {
    return generateMap(config.seed, config.tier);
  }

  static newClassicConfig(tier: Tier): RunConfig {
    return { mode: 'classic', seed: randomSeed(), tier };
  }

  async start(config: RunConfig): Promise<void> {
    if (this.pendingStart) return;
    this.pendingStart = true;
    try {
      const map = Game.mapFor(config);
      const code = encodeSeed(config.seed, config.tier);
      if (config.mode === 'daily') {
        config.date ??= localDate();
        await this.store.startDailyAttempt(config.date, code);
      }
      this.config = config;
      this.run = createRun(map, config.mode === 'practice');
      this.finished = false;
      this.replay = null;
      this.effects.clear();
      this.audio.setGhostCount(0);
      this.audio.startMusic();
      this.beginCountdown();
      this.setHudVisible(true);
    } finally {
      this.pendingStart = false;
    }
  }

  /** Stop the current run and go back to the title backdrop. Saves progress if the run had begun. */
  async quitToMenu(): Promise<void> {
    if (this.run && this.config && !this.finished) await this.finishRun('quit');
    this.run = null;
    this.config = null;
    this.replay = null;
    this.phase = 'menu';
    this.setBanner(null);
    this.setHudVisible(false);
    this.audio.setGhostCount(0);
    this.effects.clear();
  }

  requestPause(): void {
    if (this.phase !== 'countdown' && this.phase !== 'playing') return;
    this.prevPhase = this.phase;
    this.phase = 'paused';
    this.input.reset();
    this.hooks.onPauseRequest();
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    this.phase = this.prevPhase;
    this.acc = 0;
  }

  replayBest(mode: SavedMode): boolean {
    const r = this.store.data.replays[mode];
    const parsed = r ? decodeSeed(r.code) : null;
    if (!r || !parsed || r.ghosts.length === 0) return false;
    this.replay = { map: generateMap(parsed.seed, parsed.tier), ghosts: r.ghosts.map(unpackPath) };
    this.viewTick = 0;
    this.phase = 'replay';
    this.setHudVisible(false);
    this.audio.startMusic();
    this.audio.setGhostCount(r.ghosts.length);
    return true;
  }

  stopReplay(): void {
    this.replay = null;
    this.phase = 'menu';
    this.audio.setGhostCount(0);
  }

  get inRun(): boolean {
    return this.run !== null && this.phase !== 'menu' && this.phase !== 'replay';
  }

  // ---- phases ----------------------------------------------------------------

  private setHudVisible(on: boolean): void {
    this.hud.classList.toggle('off', !on);
  }

  private setBanner(text: string | null): void {
    this.banner.hidden = text === null;
    if (text !== null) this.banner.textContent = text;
  }

  private beginCountdown(): void {
    this.phase = 'countdown';
    this.phaseT = 0;
    this.lastDigit = '';
    this.acc = 0;
    if (this.run) this.audio.setGhostCount(this.run.ghosts.length);
    if (this.config?.mode === 'tutorial' && this.run) {
      this.setBanner(TUTORIAL_TIPS[Math.min(this.run.round, TUTORIAL_TIPS.length) - 1]);
    } else {
      this.setBanner(null);
    }
  }

  private countdownTotal(): number {
    return this.run && this.run.round === 1 ? COUNTDOWN_FIRST : COUNTDOWN_NEXT;
  }

  private handleEvents(events: SimEvent[]): void {
    for (const ev of events) {
      if (ev.type === 'coin') {
        this.effects.burst(ev.x, ev.y, COLORS.coin, 16, 150);
        this.effects.ring(ev.x, ev.y, COLORS.coin, 50, 0.45);
        if (ev.bonus > 0) this.effects.text(ev.x, ev.y - 14, `+${ev.bonus}`, COLORS.coin);
        this.audio.coin();
      } else if (ev.type === 'near') {
        this.effects.burst(ev.x, ev.y, '#9fd0ff', 7, 90);
        this.audio.near();
      }
    }
  }

  private onRoundCleared(): void {
    const r = this.run;
    if (!r) return;
    this.phase = 'roundclear';
    this.phaseT = 0;
    this.effects.ring(r.x, r.y, '#ffffff', 90, 0.6);
    this.effects.burst(r.x, r.y, '#5db3ff', 14, 140);
    this.effects.text(r.x, r.y - 18, `+${ROUND_POINTS}`, '#ffffff');
    this.effects.addFlash(0.5);
    this.audio.clear();
    this.audio.setGhostCount(r.ghosts.length);
  }

  private onDeath(): void {
    const r = this.run;
    if (!r) return;
    this.phase = 'dying';
    this.phaseT = 0;
    this.viewTick = Math.max(0, r.tick - 1);
    if (r.deathCause === 'ghost') {
      this.effects.burst(r.x, r.y, COLORS.danger, 26, 190);
      this.effects.ring(r.x, r.y, COLORS.danger, 80, 0.6);
      this.effects.addShake(10);
    } else {
      this.effects.ring(r.coin.x, r.coin.y, COLORS.danger, 70, 0.7);
    }
    this.effects.addFlash(0.4);
    this.audio.death();
  }

  private async finishRun(cause: 'ghost' | 'coin' | 'quit'): Promise<GameOverInfo | null> {
    const r = this.run;
    const c = this.config;
    if (!r || !c || this.finished) return null;
    this.finished = true;
    const code = encodeSeed(c.seed, c.tier);
    const info: GameOverInfo = {
      config: c,
      code,
      rounds: r.roundsCleared,
      points: r.points,
      coins: r.coinsTotal,
      nearMisses: r.nearTotal,
      ghostsDodged: r.ghostsDodged,
      ms: Math.round((r.playTicks * 1000) / 60),
      cause: cause === 'quit' ? 'ghost' : cause,
      killerRound: r.killer >= 0 ? r.killer + 1 : null,
      newBest: false,
      previousBest: null,
    };
    // Quitting before clearing a single round is not worth a history entry.
    const worthSaving = cause !== 'quit' || info.rounds > 0;
    if (worthSaving && (c.mode === 'classic' || c.mode === 'daily' || c.mode === 'seed')) {
      const saved = await this.store.recordRun(
        {
          at: new Date().toISOString(),
          mode: c.mode,
          tier: c.tier,
          code,
          rounds: info.rounds,
          points: info.points,
          coins: info.coins,
          nearMisses: info.nearMisses,
          ms: info.ms,
          ghostsDodged: info.ghostsDodged,
          cause,
        },
        r.ghosts,
        c.date ?? localDate(),
      );
      info.newBest = saved.newBest;
      info.previousBest = saved.previousBest;
    }
    return info;
  }

  private async endRun(): Promise<void> {
    const r = this.run;
    const c = this.config;
    if (!r || !c) return;
    if (c.mode === 'tutorial') {
      // A caught tutorial round is simply replayed.
      restartRound(r);
      this.beginCountdown();
      this.setBanner('Caught! Try that round again.');
      return;
    }
    const cause = r.deathCause === 'coin' ? 'coin' : 'ghost';
    this.phase = 'over';
    const info = await this.finishRun(cause);
    if (info) this.hooks.onGameOver(info);
  }

  // ---- frame loop ------------------------------------------------------------

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, Math.max(0, (now - this.lastNow) / 1000));
    this.lastNow = now;
    this.time += dt;
    this.effects.update(dt);

    const run = this.run;
    let alpha = this.lastAlpha;

    switch (this.phase) {
      case 'menu':
      case 'replay':
        this.viewTick = (this.viewTick + dt * 60) % (ROUND_TICKS - 1);
        break;

      case 'countdown': {
        if (!run) break;
        this.phaseT += dt;
        const total = this.countdownTotal();
        const idx = Math.min(2, Math.floor((this.phaseT / total) * 3));
        const digit = String(3 - idx);
        if (digit !== this.lastDigit) {
          this.lastDigit = digit;
          this.audio.tick(false);
        }
        if (this.phaseT >= total) {
          this.phase = 'playing';
          this.acc = 0;
          this.audio.tick(true);
        }
        this.updateHud(run);
        break;
      }

      case 'playing': {
        if (!run) break;
        this.acc = Math.min(this.acc + dt, 0.25);
        while (this.acc >= DT && run.status === 'playing') {
          const [ix, iy] = this.input.vector(run.x, run.y);
          step(run, ix, iy);
          this.handleEvents(drainEvents(run));
          this.acc -= DT;
        }
        alpha = this.acc / DT;
        this.updateHud(run);
        if (run.status === 'roundEnd') this.onRoundCleared();
        else if (run.status === 'dead') this.onDeath();
        break;
      }

      case 'roundclear': {
        if (!run) break;
        this.phaseT += dt;
        if (this.phaseT >= CLEAR_TIME) {
          if (this.config?.mode === 'tutorial' && run.roundsCleared >= TUTORIAL_ROUNDS) {
            this.phase = 'over';
            this.viewTick = ROUND_TICKS - 1;
            this.hooks.onTutorialComplete();
            break;
          }
          nextRound(run);
          this.beginCountdown();
        }
        break;
      }

      case 'dying': {
        if (!run) break;
        this.phaseT += dt;
        const slow = this.effects.reducedMotion ? 1 : SLOW_MO;
        this.viewTick = (this.viewTick + dt * 60 * slow) % (ROUND_TICKS - 1);
        const wait = this.effects.reducedMotion ? 0.1 : DYING_TIME;
        if (this.phaseT >= wait) void this.endRun();
        break;
      }

      case 'over':
        this.viewTick = (this.viewTick + dt * 60) % (ROUND_TICKS - 1);
        break;

      case 'paused':
        break;
    }

    this.lastAlpha = alpha;
    this.render(alpha);
  };

  private updateHud(r: RunState): void {
    const c = this.hudCache;
    const label = this.config?.mode === 'practice' ? `Practice ${r.round}` : this.config?.mode === 'tutorial' ? `Tutorial ${r.round}/${TUTORIAL_ROUNDS}` : `Round ${r.round}`;
    if (label !== c.round) {
      c.round = label;
      this.hudRound.textContent = label;
    }
    const left = 1 - r.tick / ROUND_TICKS;
    this.hudFill.style.transform = `scaleX(${Math.max(0, left).toFixed(4)})`;
    const low = left < 0.3 && !r.coinTaken && !r.harmless;
    if (low !== c.low) {
      c.low = low;
      this.hudFill.classList.toggle('low', low);
    }
    if (r.coinTaken !== c.taken) {
      c.taken = r.coinTaken;
      this.hudCoin.classList.toggle('taken', r.coinTaken);
    }
    const ghosts = String(r.ghosts.length);
    if (ghosts !== c.ghosts) {
      c.ghosts = ghosts;
      this.hudGhostN.textContent = ghosts;
      this.hudGhostWord.textContent = r.ghosts.length === 1 ? ' ghost' : ' ghosts';
    }
    const pts = String(r.points);
    if (pts !== c.points) {
      c.points = pts;
      this.hudPoints.textContent = pts;
    }
  }

  // ---- rendering ---------------------------------------------------------------

  private render(alpha: number): void {
    const s = this.store.data.settings;
    const options = { highContrast: s.highContrast, largerDots: s.largerDots };
    const scale = this.canvas.width / ARENA;
    this.ctx.setTransform(scale, 0, 0, scale, 0, 0);

    const phase = this.phase === 'paused' ? this.prevPhase : this.phase;
    const run = this.run;
    let scene: Scene;

    if ((phase === 'menu' || phase === 'replay') || !run) {
      const useReplay = phase === 'replay' && this.replay;
      scene = {
        map: useReplay ? this.replay!.map : this.menuMap,
        ghosts: useReplay ? this.replay!.ghosts : this.demoGhosts,
        ghostTick: this.viewTick,
        player: null,
        coin: null,
        killer: -1,
        time: this.time,
        countdown: null,
        dim: 0,
        options,
        effects: this.effects,
      };
    } else {
      let ghostTick = 0;
      let player: Scene['player'] = null;
      let coin: Scene['coin'] = run.coinTaken ? null : run.coin;
      let countdown: string | null = null;
      switch (phase) {
        case 'countdown': {
          const total = this.countdownTotal();
          const idx = Math.min(2, Math.floor((this.phaseT / total) * 3));
          countdown = String(3 - idx);
          player = { x: run.x, y: run.y, shield: false };
          coin = run.coin;
          break;
        }
        case 'playing':
          ghostTick = Math.max(0, run.tick - 2 + alpha);
          player = {
            x: run.prevX + (run.x - run.prevX) * alpha,
            y: run.prevY + (run.y - run.prevY) * alpha,
            shield: run.tick < 45,
          };
          break;
        case 'roundclear':
          ghostTick = ROUND_TICKS - 1;
          player = this.phaseT < 0.12 ? { x: run.x, y: run.y, shield: false } : null;
          coin = null;
          break;
        case 'dying':
        case 'over':
          ghostTick = this.viewTick;
          player = null;
          break;
      }
      scene = {
        map: run.map,
        ghosts: run.ghosts,
        ghostTick,
        player,
        coin,
        killer: phase === 'dying' || phase === 'over' ? run.killer : -1,
        time: this.time,
        countdown,
        dim: this.phase === 'paused' ? 0.45 : phase === 'over' ? 0.35 : 0,
        options,
        effects: this.effects,
      };
    }
    drawScene(this.ctx, scene);
  }
}

