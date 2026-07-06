/* =============================================================
   home.js — Homepage: hero, prossima gara, top 5, calendario, news
   ============================================================= */
import api from '../core/api.js';
import { mountChrome, avatarUrl } from '../core/components.js';
import { $, el, esc, loader, fmtDate, flagEmoji, initReveal, countdownParts } from '../core/ui.js';

mountChrome();

const raceStatusBadge = (s) =>
  s === 'completed'
    ? '<span class="badge green">Conclusa</span>'
    : '<span class="badge gray">In programma</span>';

function driverRow(d) {
  return `
    <tr>
      <td><span class="pos ${d.position <= 3 ? 'p' + d.position : ''}">${d.position}</span></td>
      <td>
        <div class="driver-cell">
          <img src="${avatarUrl(d)}" onerror="this.src='/images/avatars/default.svg'" alt="">
          <div>
            <div class="dc-name">${esc(d.display_name)}</div>
            <div class="dc-sub">${esc(d.team_name || '—')}</div>
          </div>
        </div>
      </td>
      <td class="num pts">${d.points}</td>
    </tr>`;
}

function constructorRow(c) {
  return `
    <tr>
      <td><span class="pos ${c.position <= 3 ? 'p' + c.position : ''}">${c.position}</span></td>
      <td><span class="team-tag"><span class="dot" style="background:${c.team_color || '#e10600'}"></span>${esc(c.team_name)}</span></td>
      <td class="num pts">${c.points}</td>
    </tr>`;
}

function renderNextRace(race) {
  const box = $('#next-race-body');
  if (!race) { box.innerHTML = '<div class="empty">Nessuna gara in programma. Stagione conclusa! 🏆</div>'; return; }
  const cd = countdownParts(race.race_date);
  box.innerHTML = `
    <div class="flex items-center gap-3" style="margin-bottom:12px">
      <span style="font-size:2rem">${flagEmoji(race.country_code)}</span>
      <div>
        <div class="text-hi" style="font-size:1.3rem;font-weight:900">${esc(race.name)}</div>
        <div class="text-lo">${esc(race.circuit_name)} · ${esc(race.country)}</div>
      </div>
    </div>
    <div class="text-lo" style="margin-bottom:6px">📅 ${fmtDate(race.race_date, { withTime: true })} · ${race.laps || '—'} giri</div>
    <div class="countdown" id="cd-home">
      ${['d', 'h', 'm', 's'].map((k) => `<div class="cd"><b data-k="${k}">${String(cd[k]).padStart(2, '0')}</b><span>${{ d: 'giorni', h: 'ore', m: 'min', s: 'sec' }[k]}</span></div>`).join('')}
    </div>
    <a href="/race.html?id=${race.id}" class="btn btn-outline btn-sm" style="margin-top:16px">Dettagli gara →</a>`;

  // Countdown live
  const tick = () => {
    const p = countdownParts(race.race_date);
    if (p.past) return;
    ['d', 'h', 'm', 's'].forEach((k) => {
      const n = box.querySelector(`[data-k="${k}"]`);
      if (n) n.textContent = String(p[k]).padStart(2, '0');
    });
  };
  clearInterval(window.__cd); window.__cd = setInterval(tick, 1000);
}

function renderLastResults(race, results) {
  const box = $('#last-results-body');
  if (!race || !results?.length) { box.innerHTML = '<div class="empty">Ancora nessun risultato.</div>'; return; }
  const head = $('#last-results-card .card-head h3');
  if (head) head.textContent = `${race.name} · Top 5`;
  box.innerHTML = results.map((r, i) => {
    const pos = r.dnf ? 'DNF' : (r.position ?? '—');
    const cls = !r.dnf && r.position <= 3 ? 'p' + r.position : '';
    return `
      <div class="flex items-center gap-3" style="padding:9px 0;border-bottom:1px solid var(--border)">
        <span class="pos ${cls}">${pos}</span>
        <img class="avatar" style="width:30px;height:30px" src="${avatarUrl(r)}" onerror="this.src='/images/avatars/default.svg'" alt="">
        <span class="grow text-hi" style="font-weight:600">${esc(r.display_name)}</span>
        <span class="team-tag"><span class="dot" style="background:${r.team_color || '#e10600'}"></span></span>
        <span class="pts">${r.points} pt</span>
      </div>`;
  }).join('');
}

function renderCalendar(cal) {
  const box = $('#calendar-strip');
  if (!cal?.length) { box.innerHTML = '<div class="empty">Calendario non ancora pubblicato.</div>'; return; }
  box.innerHTML = cal.slice(0, 8).map((r) => `
    <a href="/race.html?id=${r.id}" class="card hover" style="padding:16px">
      <div class="flex items-center justify-between" style="margin-bottom:8px">
        <span class="badge gray">R${r.round}</span>
        ${raceStatusBadge(r.status)}
      </div>
      <div style="font-size:1.6rem">${flagEmoji(r.country_code)}</div>
      <div class="text-hi" style="font-weight:700;margin-top:4px">${esc(r.name.replace('Gran Premio ', 'GP '))}</div>
      <div class="text-lo" style="font-size:0.82rem">${fmtDate(r.race_date)}</div>
    </a>`).join('');
}

function renderNews(news) {
  const box = $('#news-grid');
  if (!news?.length) { box.innerHTML = '<div class="empty">Nessuna notizia.</div>'; return; }
  box.innerHTML = news.map((n) => `
    <article class="card hover">
      <div class="badge red" style="margin-bottom:10px">News</div>
      <h4 style="margin-bottom:8px">${esc(n.title)}</h4>
      <p style="font-size:0.9rem;color:var(--text-lo)">${esc((n.body || '').slice(0, 130))}${(n.body || '').length > 130 ? '…' : ''}</p>
      <small class="text-lo" style="display:block;margin-top:12px">${fmtDate(n.published_at)} · ${esc(n.author_name || 'Redazione')}</small>
    </article>`).join('');
}

function renderStrip(data) {
  const drivers = data.drivers || [];
  const leader = drivers[0];
  const items = [
    { b: data.calendar?.length || 0, s: 'Gran Premi' },
    { b: (data.calendar || []).filter((r) => r.status === 'completed').length, s: 'Disputati' },
    { b: leader ? esc(leader.display_name) : '—', s: 'Leader' },
    { b: data.constructors?.[0] ? esc(data.constructors[0].team_name) : '—', s: 'Team di testa' },
  ];
  $('#hero-strip').innerHTML = items.map((i) => `<div class="hs"><b>${i.b}</b><span>${i.s}</span></div>`).join('');
}

(async function init() {
  try {
    const data = await api.get('/dashboard/home', {}, { auth: false });
    if (!data.season) {
      $('main.container').innerHTML = '<div class="empty" style="padding:80px"><div class="em-ic">🏁</div>Nessuna stagione attiva. Torna presto!</div>';
      loader.hide();
      return;
    }
    $('#hero-season').textContent = data.season.year;
    renderStrip(data);
    renderNextRace(data.nextRace);
    renderLastResults(data.lastRace, data.lastResults);
    $('#top-drivers').innerHTML = (data.drivers || []).map(driverRow).join('') || '<tr><td colspan="3" class="empty">Nessun dato</td></tr>';
    $('#top-constructors').innerHTML = (data.constructors || []).map(constructorRow).join('') || '<tr><td colspan="3" class="empty">Nessun dato</td></tr>';
    renderCalendar(data.calendar);
    renderNews(data.news);
    initReveal();
  } catch (e) {
    console.error(e);
    $('main.container').innerHTML = `<div class="empty" style="padding:80px"><div class="em-ic">⚠️</div>Errore di caricamento: ${esc(e.message)}</div>`;
  } finally {
    loader.hide();
  }
})();
