/* =============================================================
   statistiche.js — Vista app mobile: statistiche personali del
   pilota loggato nella stagione attiva (tile, forma ultime 5,
   grafico punti per gara).
   ============================================================= */
import api from '../../core/api.js';
import { esc, fmtNum } from '../../core/ui.js';
import { lineChart } from '../../core/charts.js';
import { handleAuthError } from '../session.js';
import { gpName, seasonLabel, getSummary, errorBlock } from './_shared.js';

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

/** Tile della forma da una voce di history: DNF solo se ritirato, "—" se manca la posizione. */
function formTile(h) {
  const race = h.race ? `, ${esc(gpName(h.race))}` : '';
  const tile = (cls, text, sr) =>
    `<li class="mx-stat-form-tile${cls ? ` ${cls}` : ''}"><span aria-hidden="true">${text}</span><span class="sr-only">${sr}${race}</span></li>`;
  if (h.dnf) return tile('dnf', 'DNF', 'Ritirato');
  const pos = h.position;
  if (pos == null) return tile('', '—', 'Posizione non disponibile');
  const cls = pos === 1 ? 'p1' : pos === 2 ? 'p2' : pos === 3 ? 'p3' : '';
  return tile(cls, `P${esc(pos)}`, `Posizione ${esc(pos)}`);
}

function content(s) {
  const tiles = TILES.map(([k, label, fmt]) => `
    <div class="mx-stat-tile">
      <span class="mx-stat-value mx-num">${esc(fmt(s[k]))}</span>
      <span class="mx-stat-label">${esc(label)}</span>
    </div>`).join('');

  const last5 = (Array.isArray(s.history) ? s.history : []).slice(-5);
  const best = s.best_result
    ? `<p class="mx-stat-note">Miglior risultato: <strong class="mx-num">P${esc(s.best_result.position)}</strong> · ${esc(s.best_result.race || '')}</p>`
    : '';

  return `
    <div class="mx-stat-grid">${tiles}</div>
    ${best}
    <section class="mx-card" aria-labelledby="mx-stat-form-h">
      <h2 class="mx-kicker" id="mx-stat-form-h">Forma · ${last5.length === 1 ? 'ultima gara' : `ultime ${last5.length} gare`}</h2>
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

    root.innerHTML = `
      <div class="mx-stat">
        <p class="mx-kicker" data-kicker>Stagione</p>
        <h1 class="mx-title sr-only">Statistiche</h1>
        <div class="mx-stat-body" aria-live="polite"></div>
      </div>`;
    const body = root.querySelector('.mx-stat-body');
    const kicker = root.querySelector('[data-kicker]');

    const destroyChart = () => { if (chart) { chart.destroy(); chart = null; } };

    const showEmpty = (msg) => {
      body.innerHTML = `<div class="mx-empty"><p>${esc(msg)}</p></div>`;
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
      destroyChart();
      body.innerHTML = skeleton();
      try {
        // Utente e stagione dal riepilogo aggiornato (ctx.summary può essere datato)
        const summary = await getSummary(ctx);
        if (!alive) return;
        const season = summary?.season ?? ctx.season ?? null;
        kicker.textContent = seasonLabel(season) || 'Stagione';
        const userId = ctx.user?.id ?? summary?.me?.id;
        if (!userId) { showEmpty('Accedi per vedere le tue statistiche.'); return; }
        if (season?.id == null) { showEmpty('Nessuna stagione attiva.'); return; }

        const s = await ctx.store.get(`stats:driver:${userId}:${season.id}`,
          () => api.get(`/stats/driver/${encodeURIComponent(userId)}`, { season_id: season.id }));
        if (!alive) return;
        if (!s || !s.races) {
          // Distingue la stagione senza gare concluse dal pilota che non ha ancora corso
          showEmpty(season.completed_rounds === 0
            ? 'La stagione non ha ancora gare concluse.'
            : 'Non hai ancora disputato gare in questa stagione.');
          return;
        }
        body.innerHTML = content(s);
        drawChart(Array.isArray(s.history) ? s.history : []);
      } catch (err) {
        if (!alive || handleAuthError(err)) return;
        body.replaceChildren(errorBlock('Impossibile caricare le statistiche.', load, err?.message));
      }
    }

    await load();

    return () => { alive = false; destroyChart(); };
  },
};
