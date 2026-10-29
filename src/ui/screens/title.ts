import { DAILY_ATTEMPTS } from '../../core/constants';
import { h } from '../dom';
import type { App } from '../context';
import type { ScreenInstance } from '../router';

export function titleScreen(app: App): ScreenInstance {
  const d = app.store.data;
  const daily = app.daily();
  const best = d.bests.classic.rounds;
  const streak = d.streak;
  const todayStreak = streak.lastDate === daily.date || streak.lastDate === '' ? streak.current : streak.current;

  const dailyLabel =
    daily.attemptsLeft > 0
      ? `Daily #${daily.number}  (${daily.attemptsLeft} of ${DAILY_ATTEMPTS} left)`
      : `Daily #${daily.number}  (done, practice only)`;

  const el = h(
    'div',
    { class: 'panel title' },
    h('h1', { class: 'logo' }, 'ECHO'),
    h('p', { class: 'tag' }, 'Survive 10 seconds. Your past runs are the enemy.'),
    h(
      'p',
      { class: 'stats-line' },
      best > 0 ? `Best: ${best} round${best === 1 ? '' : 's'}` : 'No runs yet',
      todayStreak > 0 ? `   Streak: ${todayStreak} day${todayStreak === 1 ? '' : 's'}` : null,
    ),
    h(
      'div',
      { class: 'menu' },
      h('button', { class: 'btn primary', 'data-autofocus': true, onclick: () => app.showModeSelect() }, 'Play'),
      h('button', { class: 'btn', onclick: () => app.startDaily() }, dailyLabel),
      h('button', { class: 'btn', onclick: () => app.showStats() }, 'Stats'),
      h('button', { class: 'btn', onclick: () => app.showSettings(() => app.showTitle()) }, 'Settings'),
      h('button', { class: 'btn', onclick: () => app.showHowTo(false) }, 'How to play'),
    ),
  );
  return { el };
}
