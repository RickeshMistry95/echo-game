import { DAILY_ATTEMPTS } from '../../core/constants';
import { Game } from '../../game';
import { h } from '../dom';
import type { App } from '../context';
import type { ScreenInstance } from '../router';

export function modeSelectScreen(app: App): ScreenInstance {
  const daily = app.daily();
  const back = (): void => app.showTitle();

  const mode = (name: string, desc: string, onclick: () => void, autofocus = false) =>
    h(
      'button',
      { class: 'btn mode', 'data-autofocus': autofocus, onclick },
      h('span', { class: 'mode-name' }, name),
      h('span', { class: 'mode-desc' }, desc),
    );

  const el = h(
    'div',
    { class: 'panel' },
    h('h2', null, 'Choose a mode'),
    h(
      'div',
      { class: 'menu' },
      mode(
        'Classic',
        'A new map every run. How many rounds can you survive?',
        () => {
          const cfg = Game.newClassicConfig('standard');
          app.showMapPreview({
            mode: 'classic',
            seed: cfg.seed,
            tier: cfg.tier,
            lockSeed: false,
            lockTier: false,
            title: 'Classic',
            back: () => app.showModeSelect(),
          });
        },
        true,
      ),
      mode(
        `Daily #${daily.number}`,
        daily.attemptsLeft > 0
          ? `Same map for everyone today. ${daily.attemptsLeft} of ${DAILY_ATTEMPTS} attempts left.`
          : 'Attempts used. You can still practise today\'s map.',
        () => app.startDaily(),
      ),
      mode('Seed', 'Type a map code to replay a map you saw.', () => app.showSeedEntry()),
      mode('Practice', 'Ghosts cannot hurt you. Learn the maps and test paths.', () => {
        const cfg = Game.newClassicConfig('standard');
        app.showMapPreview({
          mode: 'practice',
          seed: cfg.seed,
          tier: cfg.tier,
          lockSeed: false,
          lockTier: false,
          title: 'Practice',
          note: 'Nothing is saved in practice.',
          back: () => app.showModeSelect(),
        });
      }),
    ),
    h('button', { class: 'btn ghost', onclick: back }, 'Back'),
  );
  return { el, onBack: back };
}
