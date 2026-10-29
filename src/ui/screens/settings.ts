import type { ControlScheme, Settings } from '../../storage/schema';
import { h } from '../dom';
import type { App } from '../context';
import type { ScreenInstance } from '../router';

export function settingsScreen(app: App, back: () => void): ScreenInstance {
  const s = app.store.data.settings;

  const apply = (patch: Partial<Settings>): void => {
    void app.store.updateSettings(patch);
    Object.assign(s, patch);
    app.game.applySettings();
  };

  const row = (label: string, control: HTMLElement, hint?: string) =>
    h('div', { class: 'row' }, h('div', { class: 'row-label' }, h('span', null, label), hint ? h('span', { class: 'muted small' }, hint) : null), control);

  const slider = (value: number, min: number, max: number, step: number, label: string, onchange: (v: number) => void) =>
    h('input', {
      type: 'range',
      class: 'slider',
      min,
      max,
      step,
      value,
      'aria-label': label,
      oninput: (e: Event) => onchange(Number((e.target as HTMLInputElement).value)),
    });

  const toggle = (value: boolean, label: string, onchange: (v: boolean) => void) => {
    const btn = h('button', { class: 'switch', role: 'switch', 'aria-checked': String(value), 'aria-label': label }, value ? 'On' : 'Off');
    btn.addEventListener('click', () => {
      const next = btn.getAttribute('aria-checked') !== 'true';
      btn.setAttribute('aria-checked', String(next));
      btn.textContent = next ? 'On' : 'Off';
      onchange(next);
    });
    return btn;
  };

  const controls = h(
    'select',
    {
      class: 'select',
      'aria-label': 'Control scheme',
      onchange: (e: Event) => apply({ controls: (e.target as HTMLSelectElement).value as ControlScheme }),
    },
    ...(
      [
        ['auto', 'Automatic'],
        ['keyboard', 'Keyboard only'],
        ['mouse', 'Mouse only'],
        ['touch', 'Touch only'],
      ] as const
    ).map(([v, l]) => h('option', { value: v, selected: s.controls === v }, l)),
  );

  // Reset needs two clicks so a stray tap cannot wipe a save.
  let resetArmed = false;
  const resetBtn = h('button', { class: 'btn danger' }, 'Reset save');
  resetBtn.addEventListener('click', async () => {
    if (!resetArmed) {
      resetArmed = true;
      resetBtn.textContent = 'Really reset? Click again';
      window.setTimeout(() => {
        resetArmed = false;
        resetBtn.textContent = 'Reset save';
      }, 4000);
      return;
    }
    await app.store.reset();
    app.game.applySettings();
    app.toast('Save reset');
    app.showSettings(back);
  });

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, 'aria-label': 'Import save file' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const ok = await app.store.importSave(await file.text());
    app.game.applySettings();
    app.toast(ok ? 'Save imported' : 'That file is not an Echo save');
    if (ok) app.showSettings(back);
  });

  const exportSave = async (): Promise<void> => {
    const text = await app.store.exportSave();
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = h('a', { href: url, download: 'echo-save.json' });
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const el = h(
    'div',
    { class: 'panel wide settings' },
    h('h2', null, 'Settings'),
    !app.store.persistent
      ? h('p', { class: 'note' }, 'Saving is unavailable in this browser, so progress is lost when you close the page.')
      : null,
    h('h3', null, 'Sound'),
    row('Music', slider(s.musicVolume, 0, 1, 0.05, 'Music volume', (v) => apply({ musicVolume: v }))),
    row('Effects', slider(s.sfxVolume, 0, 1, 0.05, 'Effects volume', (v) => apply({ sfxVolume: v }))),
    row('Mute all', toggle(s.muted, 'Mute all sound', (v) => apply({ muted: v }))),
    h('h3', null, 'Controls'),
    row('Control scheme', controls),
    row('Touch sensitivity', slider(s.touchSensitivity, 0.5, 2, 0.1, 'Touch sensitivity', (v) => apply({ touchSensitivity: v }))),
    h('h3', null, 'Accessibility'),
    row('Reduced motion', toggle(s.reducedMotion, 'Reduced motion', (v) => apply({ reducedMotion: v })), 'No shake, slow motion or flashes'),
    row('High contrast', toggle(s.highContrast, 'High contrast', (v) => apply({ highContrast: v })), 'Brighter outlines'),
    row('Larger dots', toggle(s.largerDots, 'Larger dots', (v) => apply({ largerDots: v })), 'Visual only, hitboxes do not change'),
    h('h3', null, 'Your save'),
    h(
      'div',
      { class: 'menu row-menu' },
      h('button', { class: 'btn', onclick: () => void exportSave() }, 'Export save'),
      h('button', { class: 'btn', onclick: () => fileInput.click() }, 'Import save'),
      resetBtn,
      fileInput,
    ),
    h('div', { class: 'menu' }, h('button', { class: 'btn primary', 'data-autofocus': true, onclick: back }, 'Back')),
  );
  return { el, onBack: back };
}
