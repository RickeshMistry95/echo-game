import { DAILY_ATTEMPTS } from '../../core/constants';
import { encodeSeed } from '../../map/seedcode';
import { decodeSeed } from '../../map/seedcode';
import type { RunRecord, SavedMode } from '../../storage/schema';
import { fmtDuration, fmtTime, h } from '../dom';
import type { App } from '../context';
import type { ScreenInstance } from '../router';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MODE_LABEL: Record<SavedMode, string> = { classic: 'Classic', daily: 'Daily', seed: 'Seed' };

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** Line chart of rounds survived over the most recent runs. */
function roundsChart(values: number[]): SVGSVGElement {
  const W = 380;
  const H = 130;
  const padL = 30;
  const padR = 12;
  const padT = 10;
  const padB = 20;
  const top = Math.max(5, Math.ceil(Math.max(...values) / 5) * 5);
  const x = (i: number): number => padL + (values.length <= 1 ? (W - padL - padR) / 2 : (i * (W - padL - padR)) / (values.length - 1));
  const y = (v: number): number => padT + (1 - v / top) * (H - padT - padB);

  const root = svg('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'chart',
    role: 'img',
    'aria-label': `Rounds survived over your last ${values.length} runs. Latest: ${values[values.length - 1]}. Best: ${Math.max(...values)}.`,
  });

  for (const v of [0, top / 2, top]) {
    root.append(svg('line', { x1: padL, x2: W - padR, y1: y(v), y2: y(v), class: 'grid' }));
    const label = svg('text', { x: padL - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'axis' });
    label.textContent = String(Math.round(v * 10) / 10);
    root.append(label);
  }
  const xl = svg('text', { x: W - padR, y: H - 4, 'text-anchor': 'end', class: 'axis' });
  xl.textContent = values.length === 1 ? 'latest run' : `last ${values.length} runs, oldest to newest`;
  root.append(xl);

  if (values.length > 1) {
    root.append(svg('polyline', { points: values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '), class: 'line' }));
  }
  values.forEach((v, i) => {
    const last = i === values.length - 1;
    const dot = svg('circle', { cx: x(i), cy: y(v), r: last ? 4.5 : 2.5, class: last ? 'dot last' : 'dot' });
    const title = svg('title', {});
    title.textContent = `${v} round${v === 1 ? '' : 's'}`;
    dot.append(title);
    root.append(dot);
  });
  return root;
}

function when(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function statsScreen(app: App): ScreenInstance {
  const d = app.store.data;
  const back = (): void => app.showTitle();
  const daily = app.daily();
  const today = d.daily[daily.date];

  const tile = (value: string, label: string) =>
    h('div', { class: 'tile' }, h('span', { class: 'tile-value' }, value), h('span', { class: 'tile-label' }, label));

  const tiles = h(
    'div',
    { class: 'tiles' },
    tile(String(d.bests.classic.rounds), 'best rounds (Classic)'),
    tile(today && today.attempts > 0 ? `${today.rounds}` : '-', `Daily #${daily.number} (${today?.attempts ?? 0}/${DAILY_ATTEMPTS} used)`),
    tile(String(d.streak.current), `day streak (best ${d.streak.longest})`),
  );

  const recent: RunRecord[] = d.runs.slice(-50);
  const chartBlock =
    recent.length > 0
      ? h('div', { class: 'chart-wrap' }, h('h3', null, 'Rounds survived'), roundsChart(recent.map((r) => r.rounds)))
      : h('p', { class: 'muted' }, 'Play a run and your progress chart will appear here.');

  const L = d.lifetime;
  const lifetime = h(
    'div',
    { class: 'life' },
    ...[
      ['Runs', L.runs],
      ['Rounds survived', L.rounds],
      ['Coins', L.coins],
      ['Near misses', L.nearMisses],
      ['Time played', fmtDuration(L.ms)],
    ].map(([label, value]) => h('div', { class: 'life-item' }, h('span', { class: 'life-value' }, String(value)), h('span', { class: 'life-label' }, String(label)))),
  );

  const replays = (['classic', 'daily', 'seed'] as const)
    .filter((m) => (d.replays[m]?.ghosts.length ?? 0) > 0)
    .map((m) =>
      h(
        'button',
        { class: 'btn', onclick: () => app.showReplay(m) },
        `Watch best ${MODE_LABEL[m]} run (${d.replays[m]?.rounds} rounds)`,
      ),
    );

  const list = d.runs
    .slice(-20)
    .reverse()
    .map((r) => {
      const parsed = decodeSeed(r.code);
      return h(
        'li',
        { class: 'run' },
        h('div', { class: 'run-main' }, h('strong', null, `${r.rounds} round${r.rounds === 1 ? '' : 's'}`), h('span', { class: 'muted' }, ` ${r.points} pts, ${MODE_LABEL[r.mode]}, ${fmtTime(r.ms)}`)),
        h('div', { class: 'run-sub muted small' }, when(r.at), '  ', h('code', null, r.code || encodeSeed(0, r.tier))),
        parsed
          ? h(
              'button',
              {
                class: 'btn small',
                onclick: () =>
                  app.showMapPreview({
                    mode: 'seed',
                    seed: parsed.seed,
                    tier: parsed.tier,
                    lockSeed: true,
                    lockTier: true,
                    title: 'Play this map',
                    back: () => app.showStats(),
                  }),
              },
              'Play this map',
            )
          : null,
      );
    });

  const el = h(
    'div',
    { class: 'panel wide' },
    h('h2', null, 'Stats'),
    tiles,
    chartBlock,
    lifetime,
    replays.length > 0 ? h('div', { class: 'menu' }, ...replays) : null,
    list.length > 0 ? h('div', null, h('h3', null, 'Recent runs'), h('ul', { class: 'runs' }, ...list)) : null,
    h('div', { class: 'menu' }, h('button', { class: 'btn ghost', 'data-autofocus': true, onclick: back }, 'Back')),
  );
  return { el, onBack: back };
}
