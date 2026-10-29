import type { AudioEngine } from '../audio/synth';
import type { Game, GameOverInfo, RunConfig } from '../game';
import type { SavedMode } from '../storage/schema';
import type { Store } from '../storage/store';
import type { Tier } from '../map/types';
import type { Router } from './router';

export interface PreviewOptions {
  mode: RunConfig['mode'];
  seed: number;
  tier: Tier;
  lockSeed: boolean;
  lockTier: boolean;
  title: string;
  note?: string;
  date?: string;
  back: () => void;
}

export interface DailyInfo {
  date: string;
  number: number;
  seed: number;
  tier: Tier;
  code: string;
  attemptsUsed: number;
  attemptsLeft: number;
  best: { rounds: number; points: number } | null;
}

/** Everything a screen is allowed to do. Screens never reach into each other. */
export interface App {
  game: Game;
  store: Store;
  audio: AudioEngine;
  router: Router;
  toast(msg: string): void;
  daily(): DailyInfo;
  showTitle(): void;
  showModeSelect(): void;
  showMapPreview(opts: PreviewOptions): void;
  showSeedEntry(): void;
  showStats(): void;
  showSettings(back: () => void): void;
  showHowTo(firstTime: boolean): void;
  showPause(): void;
  showGameOver(info: GameOverInfo): void;
  showTutorialDone(): void;
  showReplay(mode: SavedMode): void;
  startDaily(): void;
  startTutorial(): void;
  begin(config: RunConfig): Promise<void>;
  resume(): void;
  restart(): Promise<void>;
  retry(info: GameOverInfo, sameMap: boolean): Promise<void>;
  quitToMenu(): Promise<void>;
}
