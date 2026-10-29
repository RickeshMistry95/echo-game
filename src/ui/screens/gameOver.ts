import { DAILY_ATTEMPTS } from '../../core/constants';
import { shareText } from '../../core/daily';
import type { GameOverInfo } from '../../game';
import { copyText, fmtTime, h } from '../dom';
import type { App } from '../context';
import type { ScreenInstance } from '../router';

export function gameOverScreen(app: App, info: GameOverInfo): ScreenInstance {
  const cfg = info.config;
  const isDaily = cfg.mode === 'daily';
  const daily = isDaily ? app.daily() : null;
  const attemptsLeft = daily ? Math.max(0, DAILY_ATTEMPTS - (app.store.dailyFor(daily.date)?.attempts ?? 0)) : 0;

  const headline = info.cause === 'ghost' ? 'Caught' : 'Out of time';
  const detail =
    info.cause === 'ghost'
      ? `Caught by your Round ${info.killerRound ?? '?'} self.`
      : `You missed the coin in round ${info.rounds + 1}.`;

  const retry = (): void => void app.retry(info, false);
  const toMenu = (): void => void app.quitToMenu();

  let retryLabel = 'Retry';
  if (isDaily) retryLabel = attemptsLeft > 0 ? `Retry (${attemptsLeft} left)` : 'Practice this map';

  const stat = (label: string, value: string | number) =>
    h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, String(value)), h('span', { class: 'stat-label' }, label));

  const el = h(
    'div',
    { class: 'panel over' },
    h('h2', { class: info.cause === 'ghost' ? 'danger' : '' }, headline),
    h('p', { class: 'muted' }, detail),
    h('div', { class: 'big-score' }, h('span', { class: 'big' }, String(info.rounds)), h('span', { class: 'big-label' }, info.rounds === 1 ? 'round survived' : 'rounds survived')),
    info.newBest ? h('p', { class: 'badge' }, 'New best!') : null,
    h(
      'div',
      { class: 'stat-row' },
      stat('points', info.points),
      stat('coins', info.coins),
      stat('near misses', info.nearMisses),
      stat('time', fmtTime(info.ms)),
    ),
    h('p', { class: 'muted small' }, 'Map ', h('code', null, info.code)),
    isDaily && daily
      ? h(
          'p',
          { class: 'muted small' },
          attemptsLeft > 0
            ? `${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left today`
            : `Daily done. Best today: ${app.store.dailyFor(daily.date)?.rounds ?? info.rounds} rounds`,
        )
      : null,
    cfg.mode === 'practice' ? h('p', { class: 'muted small' }, 'Practice runs are not saved.') : null,
    h(
      'div',
      { class: 'menu' },
      h('button', { class: 'btn primary', 'data-autofocus': true, onclick: retry }, retryLabel),
      cfg.mode === 'classic' ? h('button', { class: 'btn', onclick: () => void app.retry(info, true) }, 'Same map') : null,
      isDaily && daily
        ? h(
            'button',
            {
              class: 'btn',
              onclick: async () => {
                const best = app.store.dailyFor(daily.date);
                const text = shareText(daily.date, best?.rounds ?? info.rounds, best?.ghostsDodged ?? info.ghostsDodged, best?.nearMisses ?? info.nearMisses);
                app.toast((await copyText(text)) ? 'Result copied' : 'Could not copy');
              },
            },
            'Share',
          )
        : null,
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
