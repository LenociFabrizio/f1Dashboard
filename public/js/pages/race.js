/* =============================================================
   race.js — Dettaglio Gran Premio: risultati, qualifiche, info
   ============================================================= */
import api from '../core/api.js';
import { mountChrome, avatarUrl } from '../core/components.js';
import { $, $$, esc, loader, toast, fmtDate, flagEmoji, qs, assistBadges } from '../core/ui.js';

mountChrome();

const raceId = qs.get('id');

function posCell(r, idx) {
  if (r.dnf) return '<span class="pos" style="color:var(--danger)">DNF</span>';
  const p = r.position ?? idx + 1;
  return `<span class="pos ${p <= 3 ? 'p' + p : ''}">${p}</span>`;
}

function resultRow(r, idx) {
  const badges = [];
  if (r.pole) badges.push('<span class="badge gold" title="Pole position">POLE</span>');
  if (r.fastest_lap) {
    badges.push('<span class="badge blue" title="Giro veloce">GV</span>');
    // Aiuti alla guida del pilota, mostrati sul giro veloce.
    const assists = assistBadges(r);
    if (assists) badges.push(assists);
  }
  const penalty = r.penalty_seconds
    ? `<div class="dc-sub text-red" title="${esc(r.penalty_note || 'Penalità')}">+${r.penalty_seconds}s pen.</div>`
    : '';
  const gap = r.dnf
    ? `<span class="text-lo">${esc(r.dnf_reason || 'Ritirato')}</span>`
    : idx === 0
      ? `<span class="mono text-hi">${esc(r.finish_time || '—')}</span>`
      : `<span class="mono text-lo">${r.gap ? '+' + esc(r.gap) : '—'}</span>`;

  return `
    <tr class="${r.dnf ? 'row-dnf' : ''}">
      <td>${posCell(r, idx)}</td>
      <td>
        <a href="/driver.html?id=${r.user_id}" class="driver-cell">
          <img src="${avatarUrl(r)}" onerror="this.src='/images/avatars/default.svg'" alt="">
          <div>
            <div class="dc-name">${esc(r.display_name)}</div>
            ${r.bot_driver && r.bot_driver.trim()
              ? `<div class="dc-sub" title="Ha corso il bot di riserva al posto del titolare">🤖 ${esc(r.bot_driver)} <span class="text-dim">(sostituto)</span></div>`
              : penalty || `<div class="dc-sub">@${esc(r.username)}</div>`}
          </div>
        </a>
      </td>
      <td class="hide-sm"><span class="team-tag"><span class="dot" style="background:${r.team_color || '#e10600'}"></span>${esc(r.team_name || '—')}</span></td>
      <td class="num text-lo hide-sm">${r.grid_position ?? '—'}</td>
      <td>${gap}</td>
      <td class="num hide-sm">${r.overtakes || 0}</td>
      <td style="white-space:nowrap">${badges.join(' ') || '<span class="text-dim">—</span>'}</td>
      <td class="num pts">${r.points || 0}</td>
    </tr>`;
}

function qualiRow(q) {
  return `
    <tr>
      <td><span class="pos ${q.position <= 3 ? 'p' + q.position : ''}">${q.position}</span></td>
      <td>
        <div class="driver-cell">
          <img src="${avatarUrl(q)}" onerror="this.src='/images/avatars/default.svg'" alt="">
          <div class="dc-name">${esc(q.display_name)}</div>
        </div>
      </td>
      <td class="num mono text-hi">${esc(q.best_time || '—')}</td>
      <td class="num mono text-lo">${q.gap ? '+' + esc(q.gap) : '—'}</td>
    </tr>`;
}

function infoTile(label, value) {
  return `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value" style="font-size:1.4rem">${value}</div></div>`;
}

/* ---------------- Tempi sul giro & settori (telemetria) ---------------- */
const fmtLap = (ms) => {
  if (!ms || ms <= 0) return '—';
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), mm = ms % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(mm).padStart(3, '0')}`;
};
const fmtSector = (ms) => {
  if (!ms || ms <= 0) return '—';
  return ms >= 60000 ? fmtLap(ms) : (ms / 1000).toFixed(3);
};
// Migliore assoluto = viola, migliore personale = verde.
const timeClass = (v, overallBest, driverBest) =>
  v && v === overallBest ? 'style="color:#b466ff;font-weight:700"'
    : v && v === driverBest ? 'style="color:#22c55e;font-weight:700"' : '';

function minValid(laps, key, needValid) {
  let best = Infinity;
  for (const l of laps) {
    const v = l[key];
    if (v > 0 && (!needValid || l.valid)) best = Math.min(best, v);
  }
  return best === Infinity ? 0 : best;
}

function renderLaps(drivers) {
  if (!drivers.length) {
    return '<div class="empty"><div class="em-ic">⏱️</div>Nessun tempo sul giro disponibile (importa la gara dalla telemetria).</div>';
  }
  // Migliori assoluti di sessione
  const all = drivers.flatMap((d) => d.laps);
  const ob = {
    lap: minValid(all, 'lap_time_ms', true),
    s1: minValid(all, 'sector1_ms', false),
    s2: minValid(all, 'sector2_ms', false),
    s3: minValid(all, 'sector3_ms', false),
  };

  return drivers
    .map((d, i) => {
      const db = {
        lap: minValid(d.laps, 'lap_time_ms', true),
        s1: minValid(d.laps, 'sector1_ms', false),
        s2: minValid(d.laps, 'sector2_ms', false),
        s3: minValid(d.laps, 'sector3_ms', false),
      };
      const rows = d.laps
        .map(
          (l) => `
          <tr class="${l.valid ? '' : 'row-dnf'}">
            <td class="num">${l.lap}</td>
            <td class="num mono" ${timeClass(l.sector1_ms, ob.s1, db.s1)}>${fmtSector(l.sector1_ms)}</td>
            <td class="num mono" ${timeClass(l.sector2_ms, ob.s2, db.s2)}>${fmtSector(l.sector2_ms)}</td>
            <td class="num mono" ${timeClass(l.sector3_ms, ob.s3, db.s3)}>${fmtSector(l.sector3_ms)}</td>
            <td class="num mono" ${timeClass(l.valid ? l.lap_time_ms : 0, ob.lap, db.lap)}>${fmtLap(l.lap_time_ms)}${l.valid ? '' : ' <span class="text-dim" title="Giro non valido">✗</span>'}</td>
          </tr>`
        )
        .join('');
      return `
        <details class="card" style="padding:0;margin-bottom:12px" ${i === 0 ? 'open' : ''}>
          <summary style="padding:14px 16px;cursor:pointer;display:flex;align-items:center;gap:10px">
            <img src="${avatarUrl(d)}" onerror="this.src='/images/avatars/default.svg'" class="avatar sm" alt="">
            <span class="text-hi" style="font-weight:700">${esc(d.display_name)}</span>
            <span class="text-lo" style="margin-left:auto;font-size:.85rem">Best: <span class="mono">${fmtLap(db.lap)}</span> · ${d.laps.length} giri</span>
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
    `<div class="hint" style="margin-top:6px"><span style="color:#b466ff;font-weight:700">viola</span> = miglior tempo assoluto · <span style="color:#22c55e;font-weight:700">verde</span> = miglior tempo personale</div>`;
}

let lapsLoaded = false;
async function loadLaps() {
  if (lapsLoaded) return;
  lapsLoaded = true;
  const box = $('#laps-box');
  try {
    const drivers = await api.get(`/races/${raceId}/laps`, {}, { auth: false });
    box.innerHTML = renderLaps(drivers);
  } catch (e) {
    lapsLoaded = false;
    box.innerHTML = `<div class="empty">Errore nel caricamento dei tempi: ${esc(e.message)}</div>`;
  }
}

/* ---------------- Traiettorie (linea di gara del giro veloce) ---------------- */
// La mappa è disegnata dai punti reali (Motion packet): niente asset esterni.
// Piano orizzontale = (x, z); l'asse verticale SVG è invertito (z verso l'alto).
function renderMap(drivers) {
  const withPts = (drivers || []).filter((d) => Array.isArray(d.points) && d.points.length > 1);
  if (!withPts.length) {
    return '<div class="empty"><div class="em-ic">🗺️</div>Nessuna traiettoria disponibile (importa la gara con il collector aggiornato).</div>';
  }

  // Bounding box su TUTTI i punti (così le linee sono in scala comune)
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const d of withPts) {
    for (const p of d.points) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minZ) minZ = p[1];
      if (p[1] > maxZ) maxZ = p[1];
    }
  }
  const w = Math.max(1, maxX - minX), h = Math.max(1, maxZ - minZ);
  const pad = Math.max(w, h) * 0.05;
  const vbW = (w + pad * 2).toFixed(1), vbH = (h + pad * 2).toFixed(1);
  const tx = (x) => (x - minX + pad).toFixed(1);
  const ty = (z) => (maxZ - z + pad).toFixed(1); // inverte l'asse verticale

  const polylines = withPts
    .map((d) => {
      const pts = d.points.map((p) => `${tx(p[0])},${ty(p[1])}`).join(' ');
      const color = d.team_color || '#e10600';
      return `<polyline data-uid="${d.user_id}" points="${pts}" fill="none" stroke="${color}"
        stroke-width="2" stroke-linejoin="round" stroke-linecap="round"
        vector-effect="non-scaling-stroke" style="opacity:.9"/>`;
    })
    .join('');

  const legend = withPts
    .map((d) => {
      const color = d.team_color || '#e10600';
      return `<button type="button" class="trace-leg active" data-uid="${d.user_id}"
        style="display:inline-flex;align-items:center;gap:8px;min-width:190px;padding:6px 12px;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:transparent;color:inherit;cursor:pointer">
        <span class="dot" style="background:${color}"></span>
        <span class="text-hi">${esc(d.display_name)}</span>
        <span class="mono text-lo" style="margin-left:auto">${fmtLap(d.best_lap_time_ms)}</span>
      </button>`;
    })
    .join('');

  return `
    <div class="card" style="padding:12px">
      <div style="width:100%;aspect-ratio:16/10;background:rgba(255,255,255,0.03);border-radius:var(--r-md);overflow:hidden">
        <svg viewBox="0 0 ${vbW} ${vbH}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block">
          ${polylines}
        </svg>
      </div>
      <div class="trace-legend" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">${legend}</div>
      <div class="hint" style="margin-top:8px">Traiettoria del <b>giro veloce</b> di ogni pilota (dati reali di gioco) · clicca un nome per mostrarla o nasconderla</div>
    </div>`;
}

function wireMap(box) {
  box.querySelectorAll('.trace-leg').forEach((btn) => {
    btn.addEventListener('click', () => {
      const on = btn.classList.toggle('active');
      const line = box.querySelector(`polyline[data-uid="${btn.dataset.uid}"]`);
      if (line) line.style.display = on ? '' : 'none';
      btn.style.opacity = on ? '' : '.4';
    });
  });
}

let mapLoaded = false;
async function loadMap() {
  if (mapLoaded) return;
  mapLoaded = true;
  const box = $('#map-box');
  try {
    const drivers = await api.get(`/races/${raceId}/traces`, {}, { auth: false });
    box.innerHTML = renderMap(drivers);
    wireMap(box);
  } catch (e) {
    mapLoaded = false;
    box.innerHTML = `<div class="empty">Errore nel caricamento delle traiettorie: ${esc(e.message)}</div>`;
  }
}

function render(race) {
  const done = race.status === 'completed';
  const winner = done ? race.results.find((r) => !r.dnf && r.position === 1) : null;
  const shortName = race.name.replace('Gran Premio ', 'GP ');

  const infoTiles = [
    infoTile('Round', race.round),
    race.laps ? infoTile('Giri', race.laps) : '',
    winner ? infoTile('Vincitore', `🏆 ${esc(winner.display_name)}`) : '',
    race.mvp_name ? infoTile('MVP', `⭐ ${esc(race.mvp_name)}`) : '',
  ].filter(Boolean).join('');

  const resultsSection = done && race.results.length
    ? `
      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th>Pos</th><th>Pilota</th><th class="hide-sm">Team</th>
              <th class="num hide-sm">Grid</th><th>Tempo / Gap</th>
              <th class="num hide-sm">Sorp.</th><th>Note</th><th class="num">Punti</th>
            </tr>
          </thead>
          <tbody>${race.results.map(resultRow).join('')}</tbody>
        </table>
      </div>`
    : `<div class="empty"><div class="em-ic">⏳</div>${done ? 'Nessun risultato registrato per questa gara.' : 'Gara non ancora disputata. I risultati appariranno qui al termine del Gran Premio.'}</div>`;

  const qualiSection = race.qualifying.length
    ? `
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Pos</th><th>Pilota</th><th class="num">Miglior tempo</th><th class="num">Gap</th></tr></thead>
          <tbody>${race.qualifying.map(qualiRow).join('')}</tbody>
        </table>
      </div>`
    : `<div class="empty"><div class="em-ic">⏱️</div>Griglia di qualifica non disponibile.</div>`;

  $('#race-main').innerHTML = `
    <a href="/races.html" class="btn ghost sm" style="margin-bottom:20px">← Calendario</a>

    <div class="hero" style="margin-bottom:32px">
      <div class="hero-strip"></div>
      <div class="flex items-center gap-4 wrap">
        <span style="font-size:4rem;line-height:1">${flagEmoji(race.country_code)}</span>
        <div>
          <div class="kicker">Round ${race.round} · ${esc(race.country || '')}</div>
          <h1 style="margin:4px 0">${esc(shortName)}</h1>
          <div class="text-lo flex items-center gap-3 wrap">
            <span>🏁 ${esc(race.circuit_name)}${race.city ? ', ' + esc(race.city) : ''}</span>
            <span>📅 ${fmtDate(race.race_date, { withTime: true })}</span>
            ${done ? '<span class="badge green">Conclusa</span>' : '<span class="badge gray">In programma</span>'}
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-auto stagger" style="margin-bottom:32px">${infoTiles}</div>

    <div class="tabs">
      <button class="tab active" data-tab="results">Risultati</button>
      <button class="tab" data-tab="quali">Qualifiche</button>
      ${done ? '<button class="tab" data-tab="laps">Giri & Settori</button>' : ''}
      ${done ? '<button class="tab" data-tab="map">Traiettorie</button>' : ''}
      ${race.screenshot ? '<button class="tab" data-tab="media">Screenshot</button>' : ''}
    </div>

    <section id="tab-results">${resultsSection}</section>
    <section id="tab-quali" class="hidden">${qualiSection}</section>
    ${done ? '<section id="tab-laps" class="hidden"><div id="laps-box"><div style="padding:40px;text-align:center"><span class="spinner"></span></div></div></section>' : ''}
    ${done ? '<section id="tab-map" class="hidden"><div id="map-box"><div style="padding:40px;text-align:center"><span class="spinner"></span></div></div></section>' : ''}
    ${race.screenshot ? `<section id="tab-media" class="hidden"><div class="card" style="padding:12px"><img src="${esc(race.screenshot)}" alt="Screenshot risultati" style="width:100%;border-radius:var(--r-md);display:block"></div></section>` : ''}

    ${race.comment ? `<div class="card glass" style="margin-top:28px"><div class="eyebrow">Cronaca</div><p class="text-mid" style="margin:8px 0 0;line-height:1.7">${esc(race.comment)}</p></div>` : ''}
  `;

  // Tab switching
  const sections = { results: '#tab-results', quali: '#tab-quali', laps: '#tab-laps', map: '#tab-map', media: '#tab-media' };
  $$('.tab').forEach((t) =>
    t.addEventListener('click', () => {
      $$('.tab').forEach((x) => x.classList.toggle('active', x === t));
      Object.entries(sections).forEach(([k, sel]) => {
        const node = $(sel);
        if (node) node.classList.toggle('hidden', k !== t.dataset.tab);
      });
      if (t.dataset.tab === 'laps') loadLaps(); // caricamento pigro
      if (t.dataset.tab === 'map') loadMap();
    })
  );
}

(async function init() {
  if (!raceId) { location.href = '/races.html'; return; }
  try {
    const race = await api.get(`/races/${raceId}`, {}, { auth: false });
    document.title = `${race.name.replace('Gran Premio ', 'GP ')} · Lega F1`;
    render(race);
  } catch (e) {
    console.error(e);
    $('#race-main').innerHTML = `<div class="empty" style="padding:80px"><div class="em-ic">🚫</div>${esc(e.message || 'Gara non trovata')}</div>`;
  } finally {
    loader.hide();
  }
})();
