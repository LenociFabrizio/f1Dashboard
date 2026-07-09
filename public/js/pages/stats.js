/* =============================================================
   stats.js — Record di campionato, progressione punti, confronto
   ============================================================= */
import api from '../core/api.js';
import { mountChrome } from '../core/components.js';
import { $, esc, loader, toast } from '../core/ui.js';
import { lineChart, radarChart, colorFor } from '../core/charts.js';

mountChrome();

let season, standings = [], progChart, cmpChart;

const LEADER_META = {
  most_points: { ic: '🏆', label: 'Più punti' },
  most_wins: { ic: '🥇', label: 'Più vittorie' },
  most_podiums: { ic: '🍾', label: 'Più podi' },
  most_poles: { ic: '⏱️', label: 'Più pole' },
  most_fastest_laps: { ic: '⚡', label: 'Più giri veloci' },
  most_overtakes: { ic: '🔀', label: 'Più sorpassi' },
  best_avg_position: { ic: '📊', label: 'Miglior media' },
  most_consistent: { ic: '🎯', label: 'Più costante' },
  biggest_comeback: { ic: '🚀', label: 'Miglior rimonta' },
  fastest_lap: { ic: '💨', label: 'Giro più veloce' },
  best_sector1: { ic: '🟩', label: 'Miglior Settore 1' },
  best_sector2: { ic: '🟨', label: 'Miglior Settore 2' },
  best_sector3: { ic: '🟪', label: 'Miglior Settore 3' },
};

function leaderCard(key, d) {
  const m = LEADER_META[key];
  const val = key === 'most_consistent' ? `σ${d.std}` : d.value;
  return `
    <div class="leader-card">
      <div class="lc-ic">${m.ic}</div>
      <div>
        <div class="lc-label">${m.label}</div>
        <div class="lc-name">${esc(d.name)}</div>
        ${d.team ? `<div class="dc-sub">${esc(d.team)}</div>` : ''}
        ${d.context ? `<div class="dc-sub">🏁 ${esc(d.context)}</div>` : ''}
      </div>
      <div class="lc-value">${val}</div>
    </div>`;
}

function renderLeaders(leaders) {
  const cards = Object.entries(leaders)
    .filter(([, v]) => v)
    .map(([k, v]) => leaderCard(k, v))
    .join('');
  $('#leaders-grid').innerHTML = cards ||
    '<div class="empty" style="grid-column:1/-1"><div class="em-ic">📊</div>Nessun dato: servono gare concluse.</div>';
}

async function renderProgression() {
  const data = await api.get('/standings/progression', { season_id: season.id }, { auth: false });
  if (!data.labels.length) {
    $('#progression-chart').closest('.card').innerHTML =
      '<div class="empty"><div class="em-ic">📈</div>La progressione apparirà dopo la prima gara.</div>';
    return;
  }
  const datasets = data.datasets.map((d, i) => ({ ...d, color: d.color || colorFor(i) }));
  progChart = lineChart($('#progression-chart'), { labels: data.labels, datasets });
}

const RADAR_AXES = [
  { key: 'points', label: 'Punti' },
  { key: 'wins', label: 'Vittorie' },
  { key: 'podiums', label: 'Podi' },
  { key: 'poles', label: 'Pole' },
  { key: 'fastest_laps', label: 'Giri veloci' },
  { key: 'overtakes', label: 'Sorpassi' },
];

function compareTable(a, b) {
  const rows = RADAR_AXES.concat([{ key: 'avg_position', label: 'Media pos.' }]).map((ax) => {
    const av = a[ax.key] ?? '—', bv = b[ax.key] ?? '—';
    const better = ax.key === 'avg_position'
      ? (a[ax.key] ?? 99) < (b[ax.key] ?? 99)
      : (a[ax.key] ?? 0) > (b[ax.key] ?? 0);
    const worse = ax.key === 'avg_position'
      ? (a[ax.key] ?? 99) > (b[ax.key] ?? 99)
      : (a[ax.key] ?? 0) < (b[ax.key] ?? 0);
    return `
      <tr>
        <td class="num ${better ? 'pts' : ''}">${av}</td>
        <td class="text-lo" style="text-align:center;font-size:0.82rem;text-transform:uppercase;letter-spacing:0.05em">${ax.label}</td>
        <td class="num ${worse ? 'pts' : ''}" style="text-align:right">${bv}</td>
      </tr>`;
  }).join('');
  return `
    <table class="data" style="width:100%">
      <thead><tr>
        <th>${esc(a.display_name)}</th><th style="text-align:center">vs</th>
        <th style="text-align:right">${esc(b.display_name)}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

async function renderCompare() {
  const ida = $('#cmp-a').value, idb = $('#cmp-b').value;
  if (!ida || !idb || ida === idb) {
    $('#compare-table').innerHTML = '<div class="empty" style="padding:30px">Seleziona due piloti diversi.</div>';
    if (cmpChart) { cmpChart.destroy(); cmpChart = null; }
    return;
  }
  try {
    const { drivers } = await api.get('/stats/compare', { season_id: season.id, users: `${ida},${idb}` }, { auth: false });
    if (drivers.length < 2) return;
    const [a, b] = drivers;
    // Normalizza i valori sul massimo di ciascun asse per un radar leggibile
    const maxes = RADAR_AXES.map((ax) => Math.max(a[ax.key] || 0, b[ax.key] || 0, 1));
    const norm = (d) => RADAR_AXES.map((ax, i) => Math.round(((d[ax.key] || 0) / maxes[i]) * 100));
    if (cmpChart) cmpChart.destroy();
    cmpChart = radarChart($('#compare-chart'), {
      labels: RADAR_AXES.map((x) => x.label),
      datasets: [
        { label: a.display_name, color: colorFor(0), data: norm(a) },
        { label: b.display_name, color: colorFor(1), data: norm(b) },
      ],
    });
    $('#compare-table').innerHTML = compareTable(a, b);
  } catch (e) {
    toast.error(e.message);
  }
}

function fillSelects() {
  const opts = standings.map((s) => `<option value="${s.user_id}">${esc(s.display_name)}</option>`).join('');
  $('#cmp-a').innerHTML = opts;
  $('#cmp-b').innerHTML = opts;
  if (standings[0]) $('#cmp-a').value = standings[0].user_id;
  if (standings[1]) $('#cmp-b').value = standings[1].user_id;
  $('#cmp-a').addEventListener('change', renderCompare);
  $('#cmp-b').addEventListener('change', renderCompare);
}

(async function init() {
  try {
    season = await api.get('/seasons/active', {}, { auth: false });
    if (!season) { $('main').innerHTML = '<div class="empty" style="padding:80px">Nessuna stagione attiva.</div>'; return; }
    $('#season-label').textContent = season.year;

    const champ = await api.get('/stats/championship', { season_id: season.id }, { auth: false });
    standings = champ.standings || [];
    renderLeaders(champ.leaders || {});
    await renderProgression();

    if (standings.length >= 2) {
      fillSelects();
      await renderCompare();
    } else {
      $('#compare-table').closest('.card').innerHTML =
        '<div class="empty"><div class="em-ic">⚖️</div>Servono almeno due piloti con risultati per il confronto.</div>';
    }
  } catch (e) {
    console.error(e);
    $('main').insertAdjacentHTML('beforeend', `<div class="empty">Errore: ${esc(e.message)}</div>`);
  } finally {
    loader.hide();
  }
})();
