/* =============================================================
   standings.js — Classifiche piloti (ordinabili) e costruttori
   ============================================================= */
import api from '../core/api.js';
import { mountChrome, avatarUrl } from '../core/components.js';
import { $, $$, esc, loader, qs } from '../core/ui.js';

mountChrome();

let season, drivers = [], constructors = [];
let sortKey = 'points', sortDir = -1;

async function loadSeason() {
  season = await api.get('/seasons/active', {}, { auth: false });
  if (season) $('#season-label').textContent = season.year;
  return season;
}

function driverRow(d, idx) {
  return `
    <tr>
      <td><span class="pos ${idx < 3 && sortKey === 'points' ? 'p' + (idx + 1) : ''}">${sortKey === 'points' ? idx + 1 : d.position}</span></td>
      <td>
        <a href="/driver.html?id=${d.user_id}" class="driver-cell">
          <img src="${avatarUrl(d)}" onerror="this.src='/images/avatars/default.svg'" alt="">
          <div>
            <div class="dc-name">${esc(d.display_name)}</div>
            <div class="dc-sub">#${d.favorite_number ?? '—'}</div>
          </div>
        </a>
      </td>
      <td><span class="team-tag"><span class="dot" style="background:${d.team_color || '#e10600'}"></span>${esc(d.team_name || '—')}</span></td>
      <td class="num pts">${d.points}</td>
      <td class="num hide-sm">${d.wins}</td>
      <td class="num hide-sm">${d.podiums}</td>
      <td class="num hide-sm">${d.poles}</td>
      <td class="num hide-sm">${d.fastest_laps}</td>
      <td class="num hide-sm">${d.dnf}</td>
      <td class="num hide-sm">${d.avg_position ?? '—'}</td>
      <td class="num text-lo hide-sm">${d.gap_to_leader > 0 ? '−' + d.gap_to_leader : '—'}</td>
    </tr>`;
}

function renderDrivers() {
  const sorted = [...drivers].sort((a, b) => {
    const av = a[sortKey] ?? (sortDir === 1 ? Infinity : -Infinity);
    const bv = b[sortKey] ?? (sortDir === 1 ? Infinity : -Infinity);
    return (av - bv) * sortDir;
  });
  const body = $('#drivers-body');
  body.innerHTML = sorted.length
    ? sorted.map(driverRow).join('')
    : '<tr><td colspan="11"><div class="empty"><div class="em-ic">🏁</div>Nessun risultato ancora registrato.</div></td></tr>';

  $$('#drivers-table thead th.sortable').forEach((th) => {
    const arrow = th.querySelector('.arrow');
    if (arrow) arrow.remove();
    if (th.dataset.key === sortKey) {
      th.insertAdjacentHTML('beforeend', ` <span class="arrow">${sortDir === -1 ? '▼' : '▲'}</span>`);
    }
  });
}

function renderConstructors() {
  const body = $('#constructors-body');
  body.innerHTML = constructors.length
    ? constructors.map((c) => `
      <tr>
        <td><span class="pos ${c.position <= 3 ? 'p' + c.position : ''}">${c.position}</span></td>
        <td><span class="team-tag"><span class="dot" style="background:${c.team_color || '#e10600'};height:22px"></span><strong class="text-hi">${esc(c.team_name)}</strong></span></td>
        <td class="num pts">${c.points}</td>
        <td class="num hide-sm">${c.wins}</td>
        <td class="num hide-sm">${c.podiums}</td>
        <td class="num hide-sm">${c.poles}</td>
        <td class="num hide-sm">${c.fastest_laps}</td>
        <td class="num hide-sm">${c.avg_points}</td>
      </tr>`).join('')
    : '<tr><td colspan="8"><div class="empty"><div class="em-ic">🏎️</div>Nessun dato costruttori.</div></td></tr>';
}

function initTabs() {
  const target = qs.get('tab') === 'constructors' ? 'constructors' : 'drivers';
  const switchTo = (tab) => {
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    $('#tab-drivers').classList.toggle('hidden', tab !== 'drivers');
    $('#tab-constructors').classList.toggle('hidden', tab !== 'constructors');
    qs.set({ tab: tab === 'drivers' ? '' : tab });
  };
  $$('.tab').forEach((t) => t.addEventListener('click', () => switchTo(t.dataset.tab)));
  switchTo(target);
}

$$('#drivers-table thead th.sortable').forEach((th) =>
  th.addEventListener('click', () => {
    const key = th.dataset.key;
    if (sortKey === key) sortDir *= -1;
    else { sortKey = key; sortDir = (key === 'avg_position' || key === 'dnf') ? 1 : -1; }
    renderDrivers();
  })
);

(async function init() {
  try {
    await loadSeason();
    if (!season) { $('main').innerHTML = '<div class="empty" style="padding:80px"><div class="em-ic">🏁</div>Nessuna stagione attiva.</div>'; return; }
    [drivers, constructors] = await Promise.all([
      api.get('/standings/drivers', { season_id: season.id }, { auth: false }),
      api.get('/standings/constructors', { season_id: season.id }, { auth: false }),
    ]);
    initTabs();
    renderDrivers();
    renderConstructors();
  } catch (e) {
    console.error(e);
    $('main').insertAdjacentHTML('beforeend', `<div class="empty">Errore: ${esc(e.message)}</div>`);
  } finally {
    loader.hide();
  }
})();
