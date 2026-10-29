import { DAILY_ATTEMPTS } from '../core/constants';
import { dailyMapParams, dailyNumber, localDate } from '../core/daily';
import { Game, type GameOverInfo, type RunConfig } from '../game';
import { encodeSeed } from '../map/seedcode';
import type { SavedMode } from '../storage/schema';
import type { App, DailyInfo, PreviewOptions } from './context';
import type { Router } from './router';
import { gameOverScreen } from './screens/gameOver';
import { howToPlayScreen, tutorialDoneScreen } from './screens/howToPlay';
import { mapPreviewScreen } from './screens/mapPreview';
import { modeSelectScreen } from './screens/modeSelect';
import { pauseScreen } from './screens/pause';
import { replayScreen } from './screens/replay';
import { seedEntryScreen } from './screens/seedEntry';
import { settingsScreen } from './screens/settings';
import { statsScreen } from './screens/stats';
import { titleScreen } from './screens/title';
import type { AudioEngine } from '../audio/synth';
import type { Store } from '../storage/store';

export function createApp(game: Game, store: Store, audio: AudioEngine, router: Router): App {
  const toastEl = document.getElementById('toast');
  let toastTimer = 0;

  const app: App = {
    game,
    store,
    audio,
    router,

    toast(msg: string): void {
      if (!toastEl) return;
      toastEl.textContent = msg;
      toastEl.classList.add('show');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 2200);
    },

    daily(): DailyInfo {
      const date = localDate();
      const { seed, tier } = dailyMapParams(date);
      const day = store.dailyFor(date);
      const used = day?.attempts ?? 0;
      return {
        date,
        number: dailyNumber(date),
        seed,
        tier,
        code: encodeSeed(seed, tier),
        attemptsUsed: used,
        attemptsLeft: Math.max(0, DAILY_ATTEMPTS - used),
        best: day && day.attempts > 0 ? { rounds: day.rounds, points: day.points } : null,
      };
    },

    showTitle: () => router.show(titleScreen(app)),
    showModeSelect: () => router.show(modeSelectScreen(app)),
    showMapPreview: (opts: PreviewOptions) => router.show(mapPreviewScreen(app, opts)),
    showSeedEntry: () => router.show(seedEntryScreen(app)),
    showStats: () => router.show(statsScreen(app)),
    showSettings: (back) => router.show(settingsScreen(app, back)),
    showHowTo: (firstTime) => router.show(howToPlayScreen(app, firstTime)),
    showPause: () => router.show(pauseScreen(app)),
    showGameOver: (info: GameOverInfo) => router.show(gameOverScreen(app, info)),
    showTutorialDone(): void {
      void store.updateSettings({ tutorialDone: true });
      router.show(tutorialDoneScreen(app));
    },
    showReplay(mode: SavedMode): void {
      if (game.replayBest(mode)) router.show(replayScreen(app, mode));
      else app.toast('No replay saved yet');
    },

    startDaily(): void {
      const d = app.daily();
      const practice = d.attemptsLeft === 0;
      app.showMapPreview({
        mode: practice ? 'practice' : 'daily',
        seed: d.seed,
        tier: d.tier,
        lockSeed: true,
        lockTier: true,
        title: `Daily #${d.number}`,
        note: practice
          ? 'You have used all attempts today, so this is practice and does not count.'
          : `${d.attemptsLeft} of ${DAILY_ATTEMPTS} attempts left. Your best attempt counts.`,
        date: d.date,
        back: () => app.showTitle(),
      });
    },

    startTutorial(): void {
      void app.begin({ mode: 'tutorial', seed: 7, tier: 'open' });
    },

    async begin(config: RunConfig): Promise<void> {
      router.hide();
      if (config.mode !== 'tutorial' && !store.data.settings.tutorialDone) void store.updateSettings({ tutorialDone: true });
      await game.start(config);
    },

    resume(): void {
      router.hide();
      game.resume();
    },

    async restart(): Promise<void> {
      const c = game.config;
      if (!c) return;
      router.hide();
      await game.quitToMenu();
      if (c.mode === 'classic') await game.start(Game.newClassicConfig(c.tier));
      else if (c.mode === 'daily') {
        const left = app.daily().attemptsLeft > 0;
        await game.start(left ? { ...c } : { mode: 'practice', seed: c.seed, tier: c.tier });
      } else await game.start({ ...c });
    },

    async retry(info: GameOverInfo, sameMap: boolean): Promise<void> {
      const c = info.config;
      router.hide();
      if (c.mode === 'classic') {
        await game.start(sameMap ? { ...c } : Game.newClassicConfig(c.tier));
      } else if (c.mode === 'daily') {
        const left = app.daily().attemptsLeft > 0;
        await game.start(left ? { ...c } : { mode: 'practice', seed: c.seed, tier: c.tier });
      } else {
        await game.start({ ...c });
      }
    },

    async quitToMenu(): Promise<void> {
      router.hide();
      await game.quitToMenu();
      app.showTitle();
    },
  };

  game.hooks = {
    onPauseRequest: () => app.showPause(),
    onGameOver: (info) => app.showGameOver(info),
    onTutorialComplete: () => app.showTutorialDone(),
  };

  // Browsers only start audio after a gesture.
  const unlock = (): void => {
    audio.unlock();
    audio.startMusic();
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  // Pause with Esc or P while a run is on screen with no menu open.
  window.addEventListener('keydown', (e) => {
    if (router.current) return;
    if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) game.requestPause();
  });

  return app;
}
