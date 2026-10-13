/* =============================================================
   statistiche.js — Vista app mobile: statistiche personali del
   pilota loggato nella stagione attiva (tile, forma ultime 5,
   grafico punti per gara).
   ============================================================= */
import api from '../../core/api.js';
import { esc, fmtNum } from '../../core/ui.js';
import { lineChart } from '../../core/charts.js';

const RED = '#e10600';

/* Tile mostrate in griglia 2 colonne: [chiave, etichetta, formattatore] */
const TILES = [
  ['races', 'Gare', (v) => fmtNum(v)],
  ['points', 'Punti', (v) => fmtNum(v, Number.isInteger(Number(v)) ? 0 : 1)],
  ['wins', 'Vittorie', (v) => fmtNum(v)],
  ['podiums', 'Podi', (v) => fmtNum(v)],
  ['poles', 'Pole', (v) => fmtNum(v)],
  ['fastest_laps', 'Giri veloci', (v) => fmtNum(v)],
  ['dnf', 'DNF', (v) => fmtNum(v)],
  ['avg_position', 'Media arrivo', (v) => (v == null ? '—' : fmtNum(v, 1))],
];

function skeleton() {
  return `
    <div class="mx-stat-grid" aria-hidden="true">
      ${TILES.map(() => '<div class="mx-stat-tile mx-skeleton"></div>').join('')}
    </div>
    <div class="mx-card mx-skeleton mx-stat-sk-form" aria-hidden="true"></div>
    <div class="mx-card mx-skeleton mx-stat-sk-chart" aria-hidden="true"></div>`;
}

function formTile(pos) {
  if (pos == null) return '<li class="mx-stat-form-tile dnf" aria-label="Ritirato">DNF</li>';
  const cls = pos === 1 ? 'p1' : pos === 2 ? 'p2' : pos === 3 ? 'p3' : '';
  return `<li class="mx-stat-form-tile ${cls}" aria-label="Posizione ${esc(pos)}">P${esc(pos)}</li>`;
}

function content(s) {
  const tiles = TILES.map(([k, label, fmt]) => `
    <div class="mx-stat-tile">
      <span class="mx-stat-value mx-num">${esc(fmt(s[k]))}</span>
      <span class="mx-stat-label">${esc(label)}</span>
    </div>`).join('');

  const last5 = Array.isArray(s.last5) ? s.last5 : [];
  const best = s.best_result
    ? `<p class="mx-stat-note">Miglior risultato: <strong class="mx-num">P${esc(s.best_result.position)}</strong> · ${esc(s.best_result.race || '')}</p>`
    : '';

  return `
    <div class="mx-stat-grid">${tiles}</div>
    ${best}
    <section class="mx-card" aria-labelledby="mx-stat-form-h">
      <h2 class="mx-kicker" id="mx-stat-form-h">Forma · ultime ${last5.length} gare</h2>
      <ol class="mx-stat-form">${last5.map(formTile).join('')}</ol>
    </section>
    <section class="mx-card" aria-labelledby="mx-stat-chart-h">
      <h2 class="mx-kicker" id="mx-stat-chart-h">Punti per gara</h2>
      <div class="mx-stat-chart"><canvas aria-label="Grafico dei punti ottenuti in ogni gara" role="img"></canvas></div>
    </section>`;
}

export default {
  route: 'statistiche',
  title: 'Statistiche',

  async render(root, ctx) {
    let alive = true;
    let chart = null;

    const userId = ctx.user?.id ?? ctx.summary?.me?.id;
    const seasonId = ctx.season?.id ?? ctx.summary?.season?.id ?? null;
    const key = `stats:driver:${userId}:${seasonId}`;

    root.innerHTML = `
      <section class="mx-view mx-stat">
        <p class="mx-kicker">${esc(ctx.summary?.season?.name || ctx.season?.name || 'Stagione')}</p>
        <h1 class="mx-title">Statistiche</h1>
        <div class="mx-stat-body" aria-live="polite"></div>
      </section>`;
    const body = root.querySelector('.mx-stat-body');

    const destroyChart = () => { if (chart) { chart.destroy(); chart = null; } };

    const showEmpty = (msg) => {
      body.innerHTML = `<div class="mx-empty"><p>${esc(msg)}</p></div>`;
    };

    const showError = (err) => {
      body.innerHTML = `
        <div class="mx-empty" role="alert">
          <p>${esc(err?.message || 'Impossibile caricare le statistiche.')}</p>
          <button type="button" class="mx-btn mx-stat-retry">Riprova</button>
        </div>`;
      body.querySelector('.mx-stat-retry').addEventListener('click', () => {
        ctx.store?.clear?.(key);
        load();
      });
    };

    const drawChart = (history) => {
      destroyChart();
      const canvas = body.querySelector('.mx-stat-chart canvas');
      if (!canvas || !window.Chart) return;
      chart = lineChart(canvas, {
        labels: history.map((h) => `R${h.round}`),
        datasets: [{ label: 'Punti', color: RED, data: history.map((h) => Number(h.points) || 0) }],
      }, {
        legend: false,
        fill: true,
        chart: {
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { title: (items) => history[items[0].dataIndex]?.race || '' } },
          },
        },
      });
    };

    async function load() {
      if (!userId) { showEmpty('Accedi per vedere le tue statistiche.'); return; }
      if (seasonId == null) { showEmpty('Nessuna stagione attiva.'); return; }
      destroyChart();
      body.innerHTML = skeleton();
      try {
        const fetcher = () => api.get(`/stats/driver/${encodeURIComponent(userId)}`, { season_id: seasonId });
        const s = ctx.store ? await ctx.store.get(key, fetcher) : await fetcher();
        if (!alive) return;
        if (!s || !s.races) { showEmpty('Nessuna gara disputata in questa stagione'); return; }
        body.innerHTML = content(s);
        drawChart(Array.isArray(s.history) ? s.history : []);
      } catch (err) {
        if (alive) showError(err);
      }
    }

    await load();

    return () => { alive = false; destroyChart(); };
  },
};
