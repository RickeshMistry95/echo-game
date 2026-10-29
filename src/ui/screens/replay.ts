import type { SavedMode } from '../../storage/schema';
import { h } from '../dom';
import type { App } from '../context';
import type { ScreenInstance } from '../router';

export function replayScreen(app: App, mode: SavedMode): ScreenInstance {
  const r = app.store.data.replays[mode];
  const back = (): void => {
    app.game.stopReplay();
    app.showStats();
  };
  const el = h(
    'div',
    { class: 'panel dock' },
    h('p', { class: 'muted' }, `Your best run: ${r?.rounds ?? 0} rounds, every ghost at once.`),
    h('button', { class: 'btn primary', 'data-autofocus': true, onclick: back }, 'Back'),
  );
  return { el, onBack: back };
}
