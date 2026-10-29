import { h } from '../dom';
import type { App } from '../context';
import type { ScreenInstance } from '../router';

export function pauseScreen(app: App): ScreenInstance {
  const mode = app.game.config?.mode;
  const daily = app.daily();
  const canRestart = mode !== 'daily' || daily.attemptsLeft > 0;
  const resume = (): void => app.resume();

  const el = h(
    'div',
    { class: 'panel' },
    h('h2', null, 'Paused'),
    h(
      'div',
      { class: 'menu' },
      h('button', { class: 'btn primary', 'data-autofocus': true, onclick: resume }, 'Resume'),
      canRestart
        ? h('button', { class: 'btn', onclick: () => void app.restart() }, mode === 'daily' ? 'Restart (uses an attempt)' : 'Restart')
        : null,
      h('button', { class: 'btn', onclick: () => app.showSettings(() => app.showPause()) }, 'Settings'),
      h('button', { class: 'btn', onclick: () => void app.quitToMenu() }, 'Quit to menu'),
    ),
  );
  return {
    el,
    onBack: resume,
    onKey: (e) => {
      if (e.code === 'KeyP') {
        resume();
        return true;
      }
      return false;
    },
  };
}
