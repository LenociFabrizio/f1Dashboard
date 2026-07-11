/* =============================================================
   practice.js — "I miei tempi"
   Sezione personale del pilota: prove a tempo e gare tra amici
   raccolte dal collector (token personale) e importate in automatico.
   Mostra i propri tempi per tracciato, l'andamento nel tempo e il
   confronto con gli altri piloti. Pagina protetta (richiede login).
   ============================================================= */
import api from '../core/api.js';
import { guard } from '../core/auth.js';
import auth from '../core/auth.js';
import { mountChrome, avatarUrl } from '../core/components.js';
import { $, esc, loader, toast, fmtLapTime, fmtSector, fmtDate, flagEmoji, confirmDialog } from '../core/ui.js';
import { lineChart } from '../core/charts.js';

let tracks = [];
let currentTrackId = null; // valore del <select> (stringa; '' = tracciato sconosciuto)
let progressChart = null;

const SESSION_LABEL = {
  time_trial: '🕒 Prova a tempo', race: '🏁 Gara', sprint: '⚡ Sprint',
  qualifying: '⏱️ Qualifica', practice: '🔧 Prove', unknown: '❔',
};

const trackLabel = (t) =>
  t.circuit_name
    ? `${t.circuit_name}${t.country_code ? ` ${flagEmoji(t.country_code)}` : ''}`
    : (t.track_id != null ? `Tracciato #${t.track_id}` : 'Tracciato sconosciuto');

const trackKey = (t) => (t.track_id != null ? String(t.track_id) : '');

/* ---------------- Card token collector ---------------- */
function tokenCard(token) {
  return `
    <div class="card" style="margin-bottom:20px">
      <div class="flex items-center gap-2 wrap" style="margin-bottom:6px">
        <strong>🎮 Collega il tuo collector</strong>
      </div>
      <p class="text-mid" style="margin:0 0 12px">
        Incolla questo <strong>token personale</strong> nel collector (te lo chiede al primo avvio,
        oppure mettilo in <code>config.json</code>). Da quel momento le tue <strong>prove a tempo</strong>
        e le <strong>gare tra amici</strong> arrivano qui in automatico. Non condividerlo con nessuno.
      </p>
      <div class="flex items-center gap-2 wrap">
        <input id="tok" class="input mono" readonly value="${esc(token)}" style="flex:1;min-width:240px">
        <button class="btn btn-outline btn-sm" id="tok-copy">Copia</button>
        <button class="btn ghost btn-sm" id="tok-regen" title="Genera un nuovo token (il vecchio smette di funzionare)">Rigenera</button>
      </div>
      <div class="hint" style="margin-top:8px">
        Non hai ancora il collector? <a href="/collector.html">Scaricalo qui</a> (PS5 / Xbox / PC).
      </div>
    </div>`;
}

function wireTokenCard(root) {
  $('#tok-copy', root)?.addEventListener('click', async () => {
    const val = $('#tok', root).value;
    try { await navigator.clipboard.writeText(val); toast.success('Token copiato.'); }
    catch { $('#tok', root).select(); toast.info('Seleziona e copia il token.'); }
  });
  $('#tok-regen', root)?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Rigenerare il token?',
      message: 'Il token attuale smetterà di funzionare: dovrai aggiornarlo nel collector.',
      danger: true, confirmText: 'Rigenera',
    });
    if (!ok) return;
    try {
      const { token } = await api.post('/personal/token/regenerate');
      $('#tok', root).value = token;
      toast.success('Nuovo token generato. Aggiornalo nel collector.');
    } catch (e) { toast.error(e.message); }
  });
}

/* ---------------- Andamento (grafico best per sessione) ---------------- */
function renderProgress(sessions) {
  const canvas = $('#progress-canvas');
  if (!canvas) return;
  if (progressChart) { progressChart.destroy(); progressChart = null; }

  const pts = sessions
    .filter((s) => s.best_ms > 0)
    .map((s) => ({ x: s.session_at, ms: s.best_ms }));
  if (pts.length < 2) { canvas.parentElement.innerHTML = '<div class="hint">Servono almeno due sessioni per vedere l\'andamento.</div>'; return; }

  progressChart = lineChart(
    canvas,
    {
      labels: pts.map((p) => fmtDate(p.x)),
      datasets: [{ label: 'Miglior giro', color: '#22c55e', data: pts.map((p) => +(p.ms / 1000).toFixed(3)) }],
    },
    {
      legend: false,
      chart: {
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#8a8a99' } },
          y: {
            beginAtZero: false,
            grid: { color: 'rgba(255,255,255,0.06)' },
            ticks: { color: '#8a8a99', callback: (v) => fmtLapTime(v * 1000) },
          },
        },
        plugins: {
          tooltip: { callbacks: { label: (c) => fmtLapTime(c.parsed.y * 1000) } },
        },
      },
    }
  );
}

/* ---------------- I miei giri (tabella per sessione) ---------------- */
function minValid(laps, key, needValid) {
  let best = Infinity;
  for (const l of laps) {
    const v = l[key];
    if (v > 0 && (!needValid || l.valid)) best = Math.min(best, v);
  }
  return best === Infinity ? 0 : best;
}
const timeClass = (v, overall, personal) =>
  v && v === overall ? 'style="color:#b466ff;font-weight:700"'
    : v && v === personal ? 'style="color:#22c55e;font-weight:700"' : '';

function renderMyLaps(sessions) {
  if (!sessions.length) {
    return '<div class="empty"><div class="em-ic">⏱️</div>Nessun tuo tempo su questo tracciato.</div>';
  }
  const allLaps = sessions.flatMap((s) => s.laps);
  const ob = {
    lap: minValid(allLaps, 'lap_time_ms', true),
    s1: minValid(allLaps, 'sector1_ms', false),
    s2: minValid(allLaps, 'sector2_ms', false),
    s3: minValid(allLaps, 'sector3_ms', false),
  };
  // Sessioni più recenti in cima.
  const ordered = [...sessions].reverse();
  return ordered
    .map((s, i) => {
      const pb = {
        lap: minValid(s.laps, 'lap_time_ms', true),
        s1: minValid(s.laps, 'sector1_ms', false),
        s2: minValid(s.laps, 'sector2_ms', false),
        s3: minValid(s.laps, 'sector3_ms', false),
      };
      const rows = s.laps
        .map((l) => `
          <tr class="${l.valid ? '' : 'row-dnf'}">
            <td class="num">${l.lap}</td>
            <td class="num mono" ${timeClass(l.sector1_ms, ob.s1, pb.s1)}>${fmtSector(l.sector1_ms)}</td>
            <td class="num mono" ${timeClass(l.sector2_ms, ob.s2, pb.s2)}>${fmtSector(l.sector2_ms)}</td>
            <td class="num mono" ${timeClass(l.sector3_ms, ob.s3, pb.s3)}>${fmtSector(l.sector3_ms)}</td>
            <td class="num mono" ${timeClass(l.valid ? l.lap_time_ms : 0, ob.lap, pb.lap)}>${fmtLapTime(l.lap_time_ms)}${l.valid ? '' : ' <span class="text-dim" title="Giro non valido">✗</span>'}</td>
          </tr>`)
        .join('');
      return `
        <details class="card" style="padding:0;margin-bottom:12px" ${i === 0 ? 'open' : ''}>
          <summary style="padding:14px 16px;cursor:pointer;display:flex;align-items:center;gap:10px">
            <span>${SESSION_LABEL[s.session_type] || SESSION_LABEL.unknown}</span>
            <span class="text-lo" style="font-size:.85rem">${fmtDate(s.session_at, { withTime: true })}</span>
            <span class="text-lo" style="margin-left:auto;font-size:.85rem">Best: <span class="mono">${fmtLapTime(pb.lap)}</span> · ${s.laps.length} giri</span>
          </summary>
          <div class="table-wrap" style="padding:0 8px 8px">
            <table class="data compact">
              <thead><tr><th class="num">Giro</th><th class="num">S1</th><th class="num">S2</th><th class="num">S3</th><th class="num">Tempo</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </details>`;
    })
    .join('') +
    `<div class="hint" style="margin-top:6px"><span style="color:#b466ff;font-weight:700">viola</span> = tuo miglior tempo assoluto · <span style="color:#22c55e;font-weight:700">verde</span> = miglior tempo della sessione</div>`;
}

/* ---------------- Classifica tracciato (best per pilota) ---------------- */
function renderLeaderboard(rows, meId) {
  if (!rows.length) return '<div class="empty"><div class="em-ic">🏁</div>Nessun tempo registrato su questo tracciato.</div>';
  const leaderMs = rows[0].best_ms;
  const body = rows
    .map((r, i) => {
      const gap = i === 0 ? '' : `+${fmtSector(r.best_ms - leaderMs)}`;
      const isMe = r.user_id === meId;
      return `
        <tr ${isMe ? 'style="background:rgba(34,197,94,0.08)"' : ''}>
          <td class="num pos ${i < 3 ? 'p' + (i + 1) : ''}">${i + 1}</td>
          <td>
            <div class="flex items-center gap-2">
              <img src="${avatarUrl(r)}" onerror="this.src='/images/avatars/default.svg'" class="avatar sm" alt="">
              <span class="text-hi" style="font-weight:${isMe ? 700 : 500}">${esc(r.display_name)}${isMe ? ' <span class="text-dim">(tu)</span>' : ''}</span>
            </div>
          </td>
          <td class="num mono">${fmtLapTime(r.best_ms)}</td>
          <td class="num mono text-dim">${gap}</td>
          <td class="num text-dim">${r.laps}</td>
        </tr>`;
    })
    .join('');
  return `
    <div class="table-wrap"><table class="data">
      <thead><tr><th class="num">#</th><th>Pilota</th><th class="num">Miglior giro</th><th class="num">Distacco</th><th class="num">Giri</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>`;
}

/* ---------------- Caricamento dettaglio tracciato ---------------- */
async function loadTrack(trackId) {
  currentTrackId = trackId;
  const box = $('#track-detail');
  box.innerHTML = '<div style="padding:40px;text-align:center"><span class="spinner"></span></div>';
  try {
    const [sessions, leaderboard] = await Promise.all([
      api.get('/personal/laps', { track_id: trackId }),
      api.get('/personal/leaderboard', { track_id: trackId }),
    ]);
    const myBest = minValid(sessions.flatMap((s) => s.laps), 'lap_time_ms', true);
    box.innerHTML = `
      <div class="grid grid-2" style="align-items:start;gap:20px">
        <div>
          <div class="card" style="margin-bottom:16px">
            <div class="stat-label">Il tuo miglior giro</div>
            <div class="stat-value mono" style="font-size:2rem;color:#22c55e">${myBest ? fmtLapTime(myBest) : '—'}</div>
            <div class="hint">Andamento del tuo miglior giro per sessione</div>
            <div class="chart-box sm" style="margin-top:10px"><canvas id="progress-canvas"></canvas></div>
          </div>
          ${renderMyLaps(sessions)}
        </div>
        <div class="card">
          <strong>Classifica tracciato</strong>
          <div class="text-lo" style="font-size:.85rem;margin-bottom:10px">Miglior giro di ogni pilota — per capire il tuo andamento.</div>
          ${renderLeaderboard(leaderboard, auth.user?.id)}
        </div>
      </div>`;
    renderProgress(sessions);
  } catch (e) {
    box.innerHTML = `<div class="empty">Errore nel caricamento: ${esc(e.message)}</div>`;
  }
}

/* ---------------- Shell della pagina ---------------- */
function renderShell(token) {
  const main = $('#practice-main');
  const hasData = tracks.length > 0;

  const selector = hasData
    ? `<div class="field" style="max-width:420px;margin:0 0 18px">
         <label>Tracciato</label>
         <select class="select" id="track-select">
           ${tracks.map((t) => `<option value="${trackKey(t)}">${esc(trackLabel(t))} · best ${t.best_ms ? fmtLapTime(t.best_ms) : '—'}</option>`).join('')}
         </select>
       </div>`
    : '';

  main.innerHTML = `
    <div class="page-head">
      <div class="eyebrow">🕒 Prove a tempo & gare tra amici</div>
      <h1>I miei tempi</h1>
      <p class="lead">I tuoi giri raccolti dal collector, per tracciato, con il confronto con gli altri piloti. L'import è automatico: nessun passaggio dall'amministratore.</p>
    </div>
    ${tokenCard(token)}
    ${selector}
    <div id="track-detail">${hasData ? '' : emptyState()}</div>`;

  wireTokenCard(main);
  if (hasData) {
    const sel = $('#track-select', main);
    sel.addEventListener('change', () => loadTrack(sel.value));
    loadTrack(sel.value);
  }
}

function emptyState() {
  return `
    <div class="empty" style="padding:60px 20px">
      <div class="em-ic">📡</div>
      <p>Ancora nessun tempo. Avvia il collector con il tuo token, gira una <strong>prova a tempo</strong>
      (o una gara privata) su F1&nbsp;25 e i tuoi giri compariranno qui in automatico.</p>
      <p class="hint">Le prove a tempo vengono inviate quando esci al menu.</p>
    </div>`;
}

/* ---------------- Ingresso pagina ---------------- */
(async function init() {
  const me = await guard();
  if (!me) return;
  mountChrome();
  try {
    const [{ token }, tk] = await Promise.all([
      api.get('/personal/token'),
      api.get('/personal/tracks'),
    ]);
    tracks = tk || [];
    document.title = 'I miei tempi · Lega F1';
    renderShell(token);
  } catch (e) {
    $('#practice-main').innerHTML = `<div class="empty" style="padding:80px">Errore: ${esc(e.message)}</div>`;
  } finally {
    loader.hide();
  }
})();
