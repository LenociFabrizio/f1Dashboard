/* =============================================================
   statistiche.js — Vista app mobile: statistiche del pilota loggato
   nella stagione attiva, con selettore segmentato:
   - Personali: tile, forma ultime 5, grafico punti per gara;
   - Squadra: confronto testa a testa con il compagno di scuderia.
   ============================================================= */
import api from '../../core/api.js';
import { esc, fmtNum } from '../../core/ui.js';
import { lineChart } from '../../core/charts.js';
import { avatarUrl } from '../../core/components.js';
import { handleAuthError } from '../session.js';
import { pts, teamColor, gpName, seasonLabel, getSummary, bindAvatarFallback, errorBlock } from './_shared.js';

const RED = '#e10600';
const MATE = '#8a8a99'; // grigio-pitlane (--text-lo): Chart.js vuole un esadecimale
const TAB_KEY = 'mx:statistiche:tab';

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

/* Righe del confronto: [chiave, etichetta, migliore ('high' | 'low' | null), decimali] */
const CMP_ROWS = [
  ['points', 'Punti', 'high', null],
  ['wins', 'Vittorie', 'high', 0],
  ['podiums', 'Podi', 'high', 0],
  ['poles', 'Pole', 'high', 0],
  ['fastest_laps', 'Giri veloci', 'high', 0],
  ['avg_position', 'Media arrivo', 'low', 1],
  ['avg_quali', 'Media qualifica', 'low', 1],
  ['dnf', 'DNF', 'low', 0],
  ['races', 'Gare', null, 0],
];

function readTab() {
  try { return sessionStorage.getItem(TAB_KEY) === 'team' ? 'team' : 'personal'; }
  catch { return 'personal'; }
}
function saveTab(tab) {
  try { sessionStorage.setItem(TAB_KEY, tab); } catch { /* storage non disponibile */ }
}

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

function personalContent(s) {
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

/* ---------------- Confronto con il compagno di squadra ---------------- */

/**
 * Testa a testa sui round corsi da entrambi. In gara vince chi arriva
 * davanti (il ritiro perde, doppio ritiro non conta); in qualifica la
 * posizione migliore.
 */
function headToHead(a, b) {
  const byRound = new Map((b.history || []).map((h) => [h.round, h]));
  const h2h = { race: [0, 0], quali: [0, 0] };
  for (const ha of a.history || []) {
    const hb = byRound.get(ha.round);
    if (!hb) continue;
    const pa = ha.dnf ? null : ha.position;
    const pb = hb.dnf ? null : hb.position;
    if (pa != null || pb != null) {
      if (pb == null || (pa != null && pa < pb)) h2h.race[0] += 1;
      else h2h.race[1] += 1;
    }
    if (ha.quali && hb.quali) h2h.quali[ha.quali < hb.quali ? 0 : 1] += 1;
  }
  return h2h;
}

const cmpFmt = (v, dec) => (v == null ? '—' : dec == null ? pts(v) : fmtNum(v, dec));

function cmpRow([key, label, better, dec], a, b) {
  const va = a[key];
  const vb = b[key];
  let win = 0; // 1 = io, 2 = compagno
  if (better && va != null && vb != null && va !== vb) {
    win = (better === 'high' ? va > vb : va < vb) ? 1 : 2;
  }
  // Barra di proporzione solo per i conteggi "più è meglio"
  const total = (Number(va) || 0) + (Number(vb) || 0);
  const bar = better === 'high' && total > 0
    ? `<span class="mx-cmp-bar" aria-hidden="true"><i style="width:${Math.round(((Number(va) || 0) / total) * 100)}%"></i></span>`
    : '';
  return `
    <li class="mx-cmp-row">
      <span class="mx-cmp-val mx-num${win === 1 ? ' is-best' : ''}">${esc(cmpFmt(va, dec))}</span>
      <span class="mx-cmp-mid">
        <span class="mx-cmp-label">${esc(label)}</span>
        ${bar}
      </span>
      <span class="mx-cmp-val mx-cmp-val--mate mx-num${win === 2 ? ' is-best' : ''}">${esc(cmpFmt(vb, dec))}</span>
    </li>`;
}

function h2hBlock(label, [x, y]) {
  return `
    <div class="mx-cmp-h2h-item">
      <span class="mx-cmp-h2h-score mx-num">
        <b class="${x > y ? 'is-best' : ''}">${esc(x)}</b><span aria-hidden="true">–</span><b class="${y > x ? 'is-best' : ''}">${esc(y)}</b>
      </span>
      <span class="mx-stat-label">${esc(label)}</span>
    </div>`;
}

function driverHead(d, sub, mate) {
  return `
    <div class="mx-cmp-driver${mate ? ' mx-cmp-driver--mate' : ''}">
      <img class="mx-cmp-avatar" src="${esc(avatarUrl(d))}" alt="" width="48" height="48" loading="lazy">
      <span class="mx-cmp-name">${esc(d.display_name || d.handle || 'Pilota')}</span>
      <span class="mx-cmp-sub">${esc(sub)}</span>
    </div>`;
}

function teamContent(team, me, mate, mates, mateId) {
  const h2h = headToHead(me, mate);
  const picker = mates.length > 1
    ? `<div class="mx-segmented mx-cmp-pick" role="group" aria-label="Compagno da confrontare">
        ${mates.map((m) => `<button type="button" data-mate="${esc(m.user_id)}" class="${m.user_id === mateId ? 'active' : ''}" aria-pressed="${m.user_id === mateId}">${esc(m.display_name || m.handle || 'Pilota')}</button>`).join('')}
      </div>`
    : '';
  const meName = me.display_name || me.handle || 'Tu';
  const mateName = mate.display_name || mate.handle || 'Compagno';
  return `
    ${picker}
    <section class="mx-card mx-cmp-head" style="--team:${teamColor(team.team_color)}" aria-labelledby="mx-cmp-h">
      <h2 class="mx-kicker mx-cmp-team" id="mx-cmp-h">
        <span class="mx-team-bar" aria-hidden="true"></span>${esc(team.team_name || 'La tua scuderia')}
      </h2>
      <div class="mx-cmp-drivers">
        ${driverHead(me, 'Tu', false)}
        <span class="mx-cmp-vs" aria-hidden="true">VS</span>
        ${driverHead(mate, 'Compagno', true)}
      </div>
      <div class="mx-cmp-h2h">
        ${h2hBlock('Gare', h2h.race)}
        ${h2hBlock('Qualifiche', h2h.quali)}
      </div>
      <p class="sr-only">Testa a testa in gara: ${esc(meName)} ${esc(h2h.race[0])}, ${esc(mateName)} ${esc(h2h.race[1])}.
        In qualifica: ${esc(meName)} ${esc(h2h.quali[0])}, ${esc(mateName)} ${esc(h2h.quali[1])}.</p>
    </section>
    <section class="mx-card" aria-labelledby="mx-cmp-stats-h">
      <h2 class="mx-kicker" id="mx-cmp-stats-h">Confronto stagione</h2>
      <ul class="mx-cmp-list" aria-label="Valori: a sinistra ${esc(meName)}, a destra ${esc(mateName)}">
        ${CMP_ROWS.map((r) => cmpRow(r, me, mate)).join('')}
      </ul>
    </section>
    <section class="mx-card" aria-labelledby="mx-cmp-chart-h">
      <h2 class="mx-kicker" id="mx-cmp-chart-h">Punti cumulati</h2>
      <div class="mx-stat-chart"><canvas aria-label="Grafico dei punti cumulati tuoi e del compagno di squadra" role="img"></canvas></div>
    </section>`;
}

/** Serie dei punti cumulati sui round corsi da almeno uno dei due. */
function cumulative(a, b) {
  const rounds = [...new Set([...(a.history || []), ...(b.history || [])].map((h) => h.round))].sort((x, y) => x - y);
  const series = (s) => {
    const byRound = new Map((s.history || []).map((h) => [h.round, Number(h.points) || 0]));
    let acc = 0;
    return rounds.map((r) => (acc += byRound.get(r) || 0));
  };
  return { labels: rounds.map((r) => `R${r}`), a: series(a), b: series(b) };
}

export default {
  route: 'statistiche',
  title: 'Statistiche',

  async render(root, ctx) {
    const state = { tab: readTab(), mateId: null, req: 0, alive: true };
    let chart = null;

    root.innerHTML = `
      <div class="mx-stat">
        <p class="mx-kicker" data-kicker>Stagione</p>
        <h1 class="mx-title sr-only">Statistiche</h1>
        <div class="mx-segmented mx-stat-seg" role="group" aria-label="Tipo di statistiche">
          <button type="button" data-tab="personal">Personali</button>
          <button type="button" data-tab="team">Squadra</button>
        </div>
        <div class="mx-stat-body" aria-live="polite"></div>
      </div>`;
    const body = root.querySelector('.mx-stat-body');
    const kicker = root.querySelector('[data-kicker]');
    const buttons = [...root.querySelectorAll('[data-tab]')];

    const destroyChart = () => { if (chart) { chart.destroy(); chart = null; } };

    const showEmpty = (msg) => {
      body.innerHTML = `<div class="mx-empty"><p>${esc(msg)}</p></div>`;
    };

    const drawChart = (labels, datasets, titles) => {
      destroyChart();
      const canvas = body.querySelector('.mx-stat-chart canvas');
      if (!canvas || !window.Chart) return;
      chart = lineChart(canvas, { labels, datasets }, {
        legend: datasets.length > 1,
        fill: datasets.length === 1,
        chart: {
          plugins: {
            legend: { display: datasets.length > 1, position: 'bottom' },
            tooltip: { callbacks: { title: (items) => titles?.[items[0].dataIndex] || labels[items[0].dataIndex] || '' } },
          },
        },
      });
    };

    const fetchDriver = (userId, seasonId) => ctx.store.get(`stats:driver:${userId}:${seasonId}`,
      () => api.get(`/stats/driver/${encodeURIComponent(userId)}`, { season_id: seasonId }));

    async function renderPersonal(userId, season, req) {
      const s = await fetchDriver(userId, season.id);
      if (!state.alive || req !== state.req) return;
      if (!s || !s.races) {
        // Distingue la stagione senza gare concluse dal pilota che non ha ancora corso
        showEmpty(season.completed_rounds === 0
          ? 'La stagione non ha ancora gare concluse.'
          : 'Non hai ancora disputato gare in questa stagione.');
        return;
      }
      body.innerHTML = personalContent(s);
      const history = Array.isArray(s.history) ? s.history : [];
      drawChart(history.map((h) => `R${h.round}`),
        [{ label: 'Punti', color: RED, data: history.map((h) => Number(h.points) || 0) }],
        history.map((h) => h.race || ''));
    }

    async function renderTeam(userId, season, summary, req) {
      const team = summary?.team;
      const mates = Array.isArray(team?.teammates) ? team.teammates : [];
      if (!team) { showEmpty('Non sei assegnato a una scuderia.'); return; }
      if (!mates.length) { showEmpty('Nella tua scuderia non c’è ancora un compagno di squadra.'); return; }
      if (!mates.some((m) => m.user_id === state.mateId)) state.mateId = mates[0].user_id;
      const mateId = state.mateId;

      const [me, mate] = await Promise.all([fetchDriver(userId, season.id), fetchDriver(mateId, season.id)]);
      if (!state.alive || req !== state.req) return;
      if (!me?.races && !mate?.races) {
        showEmpty(season.completed_rounds === 0
          ? 'La stagione non ha ancora gare concluse.'
          : 'Nessuna gara disputata dalla tua scuderia in questa stagione.');
        return;
      }
      const mateInfo = mates.find((m) => m.user_id === mateId);
      const a = { ...me, display_name: summary.me?.display_name, handle: summary.me?.handle, avatar: summary.me?.avatar };
      const b = { ...mate, ...mateInfo };
      body.innerHTML = teamContent(team, a, b, mates, mateId);
      bindAvatarFallback(body, 'img.mx-cmp-avatar');
      body.querySelectorAll('[data-mate]').forEach((btn) => btn.addEventListener('click', () => {
        const id = Number(btn.dataset.mate);
        if (id !== state.mateId) { state.mateId = id; load(); }
      }));

      const c = cumulative(a, b);
      drawChart(c.labels, [
        { label: a.display_name || 'Tu', color: RED, data: c.a },
        { label: b.display_name || 'Compagno', color: MATE, data: c.b },
      ]);
    }

    async function load() {
      const req = ++state.req;
      buttons.forEach((b) => {
        const on = b.dataset.tab === state.tab;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      destroyChart();
      body.innerHTML = skeleton();
      try {
        // Utente e stagione dal riepilogo aggiornato (ctx.summary può essere datato)
        const summary = await getSummary(ctx);
        if (!state.alive || req !== state.req) return;
        const season = summary?.season ?? ctx.season ?? null;
        kicker.textContent = seasonLabel(season) || 'Stagione';
        const userId = ctx.user?.id ?? summary?.me?.id;
        if (!userId) { showEmpty('Accedi per vedere le tue statistiche.'); return; }
        if (season?.id == null) { showEmpty('Nessuna stagione attiva.'); return; }

        if (state.tab === 'team') await renderTeam(userId, season, summary, req);
        else await renderPersonal(userId, season, req);
      } catch (err) {
        if (!state.alive || req !== state.req || handleAuthError(err)) return;
        body.replaceChildren(errorBlock('Impossibile caricare le statistiche.', load, err?.message));
      }
    }

    buttons.forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.tab === state.tab) return;
      state.tab = b.dataset.tab;
      saveTab(state.tab);
      load();
    }));

    await load();

    return () => { state.alive = false; destroyChart(); };
  },
};
