/* =============================================================
   races.js — Griglia del calendario con filtri per stato
   ============================================================= */
import api from '../core/api.js';
import { mountChrome } from '../core/components.js';
import { $, $$, esc, loader, fmtDate, flagEmoji } from '../core/ui.js';
import { setupUrlForRace } from '../core/f1data.js';

mountChrome();

let season, races = [], filter = 'all';

function statusBadge(s) {
  return s === 'completed'
    ? '<span class="badge green">Conclusa</span>'
    : '<span class="badge gray">In programma</span>';
}

function card(r) {
  const done = r.status === 'completed';
  const setupUrl = setupUrlForRace(r);
  const setupBtn = setupUrl
    ? `<a href="${setupUrl}" target="_blank" rel="noopener noreferrer" class="btn outline sm block" style="margin-top:10px" title="Assetti consigliati per questo GP (simracingsetup.com)">🔧 Assetti consigliati ↗</a>`
    : '';
  return `
    <div>
      <a href="/race.html?id=${r.id}" class="card hover accent-top" style="display:block">
        <div class="flex justify-between items-center" style="margin-bottom:14px">
          <span class="badge red">Round ${r.round}</span>
          ${statusBadge(r.status)}
        </div>
        <div class="flex items-center gap-3" style="margin-bottom:10px">
          <span style="font-size:2.4rem;line-height:1">${flagEmoji(r.country_code)}</span>
          <div>
            <div class="text-hi" style="font-weight:900;font-size:1.15rem;line-height:1.1">${esc(r.name.replace('Gran Premio ', 'GP '))}</div>
            <div class="text-lo" style="font-size:0.85rem">${esc(r.circuit_name)}</div>
          </div>
        </div>
        <div class="flex justify-between items-center" style="border-top:1px solid var(--border);padding-top:12px;margin-top:4px">
          <span class="text-lo" style="font-size:0.85rem">📅 ${fmtDate(r.race_date)}</span>
          <span class="text-lo" style="font-size:0.85rem">${r.laps || '—'} giri</span>
        </div>
        ${done ? '<div class="text-red" style="font-size:0.82rem;font-weight:700;margin-top:10px">Vedi risultati →</div>' : '<div class="text-lo" style="font-size:0.82rem;margin-top:10px">Dettagli →</div>'}
      </a>
      ${setupBtn}
    </div>`;
}

function render() {
  const list = races.filter((r) => filter === 'all' || r.status === filter);
  $('#races-grid').innerHTML = list.length
    ? list.map(card).join('')
    : '<div class="empty" style="grid-column:1/-1"><div class="em-ic">🏁</div>Nessuna gara in questa categoria.</div>';
  $('#count-label').textContent = `${list.length} Gran Premi`;
}

$$('#filter button').forEach((b) =>
  b.addEventListener('click', () => {
    filter = b.dataset.f;
    $$('#filter button').forEach((x) => x.classList.toggle('active', x === b));
    render();
  })
);

(async function init() {
  try {
    season = await api.get('/seasons/active', {}, { auth: false });
    if (!season) { $('main').innerHTML = '<div class="empty" style="padding:80px">Nessuna stagione attiva.</div>'; return; }
    $('#season-label').textContent = season.year;
    races = await api.get('/races', { season_id: season.id }, { auth: false });
    render();
  } catch (e) {
    console.error(e);
    $('#races-grid').innerHTML = `<div class="empty">Errore: ${esc(e.message)}</div>`;
  } finally {
    loader.hide();
  }
})();
