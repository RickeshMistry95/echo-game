import { h } from '../dom';
import type { App } from '../context';
import type { ScreenInstance } from '../router';

export function howToPlayScreen(app: App, firstTime: boolean): ScreenInstance {
  const back = (): void => {
    // Skipping the welcome screen counts as done, so it does not nag on every visit.
    if (firstTime) void app.store.updateSettings({ tutorialDone: true });
    app.showTitle();
  };
  const el = h(
    'div',
    { class: 'panel' },
    h('h2', null, firstTime ? 'Welcome to Echo' : 'How to play'),
    h(
      'ol',
      { class: 'rules' },
      h('li', null, 'Each round lasts 10 seconds. Grab the amber coin before the timer runs out.'),
      h('li', null, 'Your path from every round you survive comes back as a ghost, replaying your exact moves.'),
      h('li', null, 'Touch a ghost and the run is over. Miss the coin and it is over too.'),
      h('li', null, 'Each new round starts where the last one ended. Leave yourself room.'),
    ),
    h('p', { class: 'muted' }, 'Move with WASD or arrow keys, the mouse, or by dragging on a touch screen. Pause with Esc or P.'),
    h(
      'div',
      { class: 'menu' },
      h('button', { class: 'btn primary', 'data-autofocus': true, onclick: () => app.startTutorial() }, 'Try a 3 round tutorial'),
      h('button', { class: 'btn ghost', onclick: back }, firstTime ? 'Skip' : 'Back'),
    ),
  );
  return { el, onBack: back };
}

export function tutorialDoneScreen(app: App): ScreenInstance {
  const toTitle = (): void => void app.quitToMenu().then(() => app.showTitle());
  const el = h(
    'div',
    { class: 'panel' },
    h('h2', null, 'You are ready'),
    h('p', { class: 'muted' }, 'In a real run, a ghost touch ends everything. Every round you survive adds one more.'),
    h(
      'div',
      { class: 'menu' },
      h('button', { class: 'btn primary', 'data-autofocus': true, onclick: () => void app.quitToMenu().then(() => app.showModeSelect()) }, 'Play'),
      h('button', { class: 'btn ghost', onclick: toTitle }, 'Menu'),
    ),
  );
  return { el, onBack: toTitle };
}
