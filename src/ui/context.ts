import type { AudioEngine } from '../audio/synth';
import type { Game, GameOverInfo, RunConfig } from '../game';
import type { SavedMode } from '../storage/schema';
import type { Store } from '../storage/store';
import type { Router } from './router';

/** Today's board. The map seed is derived from the date and is never shown to the player. */
export interface TodayInfo {
  date: string;
  number: number;
  attempts: number;
  best: { rounds: number; points: number } | null;
}

/** Everything a screen is allowed to do. Screens never reach into each other. */
export interface App {
  game: Game;
  store: Store;
  audio: AudioEngine;
  router: Router;
  toast(msg: string): void;
  today(): TodayInfo;
  showTitle(): void;
  showStats(): void;
  showSettings(back: () => void): void;
  showHowTo(firstTime: boolean): void;
  showPause(): void;
  showGameOver(info: GameOverInfo): void;
  showTutorialDone(): void;
  showReplay(mode: SavedMode): void;
  play(): Promise<void>;
  startTutorial(): void;
  begin(config: RunConfig): Promise<void>;
  resume(): void;
  restart(): Promise<void>;
  retry(): Promise<void>;
  quitToMenu(): Promise<void>;
}
