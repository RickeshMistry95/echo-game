import { randomSeed } from '../../core/rng';
import { generateMap } from '../../map/generate';
import { encodeSeed } from '../../map/seedcode';
import { TIERS, TIER_LABEL, type Tier } from '../../map/types';
import { drawMapThumb } from '../../render/draw';
import { copyText, h } from '../dom';
import type { App, PreviewOptions } from '../context';
import type { ScreenInstance } from '../router';

const SHAPE_LABEL = { square: 'Square', circle: 'Circle', octagon: 'Octagon', plus: 'Plus', ring: 'Ring' } as const;

export function mapPreviewScreen(app: App, opts: PreviewOptions): ScreenInstance {
  let seed = opts.seed;
  let tier: Tier = opts.tier;

  const thumb = h('canvas', { class: 'thumb', 'aria-label': 'Map preview' });
  const code = h('code', { class: 'code' });
  const info = h('p', { class: 'muted' });
  const best = h('p', { class: 'muted' });
  const tierRow = h('div', { class: 'seg', role: 'group', 'aria-label': 'Map tier' });
  const tierButtons = new Map<Tier, HTMLButtonElement>();

  const refresh = (): void => {
    const map = generateMap(seed, tier);
    const c = encodeSeed(seed, tier);
    code.textContent = c;
    const obs = map.obstacles.length;
    info.textContent = `${SHAPE_LABEL[map.shape]} arena, ${tier === 'open' ? 'no obstacles' : `${obs} obstacle piece${obs === 1 ? '' : 's'}`}`;
    const b = app.store.data.bySeed[c];
    best.textContent = b ? `Your best here: ${b.rounds} round${b.rounds === 1 ? '' : 's'}, ${b.points} points` : 'Not played yet';
    for (const [t, btn] of tierButtons) btn.setAttribute('aria-pressed', String(t === tier));
    drawMapThumb(thumb, map);
  };

  if (!opts.lockTier) {
    for (const t of TIERS) {
      const btn = h(
        'button',
        {
          class: 'seg-btn',
          'aria-pressed': String(t === tier),
          onclick: () => {
            tier = t;
            refresh();
          },
        },
        TIER_LABEL[t],
      );
      tierButtons.set(t, btn);
      tierRow.append(btn);
    }
  } else {
    tierRow.append(h('span', { class: 'pill' }, `${TIER_LABEL[tier]} tier`));
  }

  const start = (): void => {
    void app.begin({ mode: opts.mode, seed, tier, date: opts.date });
  };

  const el = h(
    'div',
    { class: 'panel preview' },
    h('h2', null, opts.title),
    thumb,
    h('div', { class: 'code-row' }, code, h('button', {
      class: 'btn small',
      'aria-label': 'Copy map code',
      onclick: async () => app.toast((await copyText(code.textContent ?? '')) ? 'Map code copied' : 'Could not copy'),
    }, 'Copy')),
    info,
    best,
    opts.note ? h('p', { class: 'note' }, opts.note) : null,
    tierRow,
    h(
      'div',
      { class: 'menu' },
      h('button', { class: 'btn primary', 'data-autofocus': true, onclick: start }, 'Start'),
      !opts.lockSeed
        ? h('button', {
            class: 'btn',
            onclick: () => {
              seed = randomSeed();
              refresh();
            },
          }, 'New map')
        : null,
      h('button', { class: 'btn ghost', onclick: opts.back }, 'Back'),
    ),
  );

  requestAnimationFrame(refresh);
  return { el, onBack: opts.back };
}
