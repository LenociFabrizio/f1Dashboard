/* =============================================================
   race.js — Dettaglio Gran Premio: risultati, qualifiche, info
   ============================================================= */
import api from '../core/api.js';
import { mountChrome, avatarUrl } from '../core/components.js';
import { $, $$, esc, loader, toast, fmtDate, flagEmoji, qs } from '../core/ui.js';

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
  if (r.fastest_lap) badges.push('<span class="badge blue" title="Giro veloce">GV</span>');
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
      ${race.screenshot ? '<button class="tab" data-tab="media">Screenshot</button>' : ''}
    </div>

    <section id="tab-results">${resultsSection}</section>
    <section id="tab-quali" class="hidden">${qualiSection}</section>
    ${race.screenshot ? `<section id="tab-media" class="hidden"><div class="card" style="padding:12px"><img src="${esc(race.screenshot)}" alt="Screenshot risultati" style="width:100%;border-radius:var(--r-md);display:block"></div></section>` : ''}

    ${race.comment ? `<div class="card glass" style="margin-top:28px"><div class="eyebrow">Cronaca</div><p class="text-mid" style="margin:8px 0 0;line-height:1.7">${esc(race.comment)}</p></div>` : ''}
  `;

  // Tab switching
  const sections = { results: '#tab-results', quali: '#tab-quali', media: '#tab-media' };
  $$('.tab').forEach((t) =>
    t.addEventListener('click', () => {
      $$('.tab').forEach((x) => x.classList.toggle('active', x === t));
      Object.entries(sections).forEach(([k, sel]) => {
        const node = $(sel);
        if (node) node.classList.toggle('hidden', k !== t.dataset.tab);
      });
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
