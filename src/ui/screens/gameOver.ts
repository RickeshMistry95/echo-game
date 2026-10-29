import { shareText } from '../../core/daily';
import type { GameOverInfo } from '../../game';
import { copyText, fmtTime, h } from '../dom';
import type { App } from '../context';
import type { ScreenInstance } from '../router';

export function gameOverScreen(app: App, info: GameOverInfo): ScreenInstance {
  const today = app.today();
  const retry = (): void => void app.retry();
  const toMenu = (): void => void app.quitToMenu();

  const stat = (label: string, value: string | number) =>
    h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, String(value)), h('span', { class: 'stat-label' }, label));

  const el = h(
    'div',
    { class: 'panel over' },
    h('h2', { class: 'danger' }, 'Caught'),
    h('p', { class: 'muted' }, `Caught by your Round ${info.killerRound ?? '?'} clone.`),
    h(
      'div',
      { class: 'big-score' },
      h('span', { class: 'big' }, String(info.rounds)),
      h('span', { class: 'big-label' }, info.rounds === 1 ? 'clone made' : 'clones made'),
    ),
    info.newBest ? h('p', { class: 'badge' }, 'New best!') : null,
    h(
      'div',
      { class: 'stat-row' },
      stat('points', info.points),
      stat('coins', info.coins),
      stat('near misses', info.nearMisses),
      stat('time', fmtTime(info.ms)),
    ),
    today.best ? h('p', { class: 'muted small' }, `Best today: ${today.best.rounds} clones`) : null,
    h(
      'div',
      { class: 'menu' },
      h('button', { class: 'btn primary', 'data-autofocus': true, onclick: retry }, 'Play again'),
      h(
        'button',
        {
          class: 'btn',
          onclick: async () => {
            const best = app.store.dailyFor(today.date);
            const text = shareText(today.date, best?.rounds ?? info.rounds, best?.ghostsDodged ?? info.ghostsDodged, best?.nearMisses ?? info.nearMisses);
            app.toast((await copyText(text)) ? 'Result copied' : 'Could not copy');
          },
        },
        'Share',
      ),
      h('button', { class: 'btn ghost', onclick: toMenu }, 'Menu'),
    ),
  );

  return {
    el,
    onBack: toMenu,
    onKey: (e) => {
      if (e.code === 'KeyR' && !e.repeat) {
        retry();
        return true;
      }
      return false;
    },
  };
}
