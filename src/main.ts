import './style.css';
import { AudioEngine } from './audio/synth';
import { Game } from './game';
import { Input } from './input/input';
import { LocalAdapter } from './storage/adapters';
import { Store } from './storage/store';
import { createApp } from './ui/app';
import { Router } from './ui/router';

async function boot(): Promise<void> {
  const store = new Store(new LocalAdapter());
  await store.init();

  const canvas = document.getElementById('game');
  const overlay = document.getElementById('overlay');
  if (!(canvas instanceof HTMLCanvasElement) || !overlay) throw new Error('Page is missing the game canvas');

  const audio = new AudioEngine();
  const input = new Input(canvas);
  const game = new Game(canvas, store, audio, input);
  const router = new Router(overlay, audio);
  const app = createApp(game, store, audio, router);

  if (store.data.settings.tutorialDone) app.showTitle();
  else app.showHowTo(true);

  // Handy for debugging and automated play tests: open the page with ?debug
  if (new URLSearchParams(location.search).has('debug')) {
    (window as unknown as { __echo: unknown }).__echo = { game, store, app };
  }
}

void boot();
