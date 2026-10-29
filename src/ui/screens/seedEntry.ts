import { decodeSeed } from '../../map/seedcode';
import { h } from '../dom';
import type { App } from '../context';
import type { ScreenInstance } from '../router';

export function seedEntryScreen(app: App): ScreenInstance {
  const back = (): void => app.showModeSelect();
  const error = h('p', { class: 'error', role: 'alert' });
  const input = h('input', {
    type: 'text',
    class: 'text-input',
    placeholder: '2-K7QX24',
    maxlength: '12',
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
    'aria-label': 'Map code',
    'data-autofocus': true,
  });

  const go = (): void => {
    const parsed = decodeSeed(input.value);
    if (!parsed) {
      error.textContent = 'That is not a valid map code. Codes look like 2-K7QX24.';
      return;
    }
    error.textContent = '';
    app.showMapPreview({
      mode: 'seed',
      seed: parsed.seed,
      tier: parsed.tier,
      lockSeed: true,
      lockTier: true,
      title: 'Seed',
      back: () => app.showSeedEntry(),
    });
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      go();
    }
  });

  const el = h(
    'div',
    { class: 'panel' },
    h('h2', null, 'Enter a map code'),
    h('p', { class: 'muted' }, 'Every map has a short code, shown on the preview and game over screens.'),
    input,
    error,
    h(
      'div',
      { class: 'menu' },
      h('button', { class: 'btn primary', onclick: go }, 'Go'),
      h('button', { class: 'btn ghost', onclick: back }, 'Back'),
    ),
  );
  return { el, onBack: back };
}
