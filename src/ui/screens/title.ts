import { h } from '../dom';
import type { App } from '../context';
import type { ScreenInstance } from '../router';

export function titleScreen(app: App): ScreenInstance {
  const d = app.store.data;
  const today = app.today();
  const best = d.bests.daily.rounds;
  const streak = d.streak.current;

  const el = h(
    'div',
    { class: 'panel title' },
    h('h1', { class: 'logo' }, 'ECHO'),
    h('p', { class: 'tag' }, 'Collect coins. Every round you survive becomes a clone that hunts you.'),
    h(
      'p',
      { class: 'stats-line' },
      best > 0 ? `Best: ${best} clone${best === 1 ? '' : 's'}` : 'No runs yet',
      today.best ? `   Today: ${today.best.rounds}` : null,
      streak > 0 ? `   Streak: ${streak} day${streak === 1 ? '' : 's'}` : null,
    ),
    h(
      'div',
      { class: 'menu' },
      h('button', { class: 'btn primary', 'data-autofocus': true, onclick: () => void app.play() }, 'Play'),
      h('button', { class: 'btn', onclick: () => app.showStats() }, 'Stats'),
      h('button', { class: 'btn', onclick: () => app.showSettings(() => app.showTitle()) }, 'Settings'),
      h('button', { class: 'btn', onclick: () => app.showHowTo(false) }, 'How to play'),
    ),
  );
  return { el };
}
