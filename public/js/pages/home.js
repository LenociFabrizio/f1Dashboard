/* =============================================================
   home.js — Homepage: hero, prossima gara, top 5, calendario
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
        <a href="/driver.html?id=${d.user_id}" class="driver-cell">
          <img src="${avatarUrl(d)}" onerror="this.src='/images/avatars/default.svg'" alt="">
          <div>
            <div class="dc-name">${esc(d.display_name)}</div>
            <div class="dc-sub">${esc(d.team_name || '—')}</div>
          </div>
        </a>
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
  if (head) head.textContent = '🏁 Ultima gara · Top 5';

  // Intestazione che chiarisce di quale gara si tratta (l'ultima disputata).
  const raceHeader = `
    <a href="/race.html?id=${race.id}" class="flex items-center gap-2 wrap" style="text-decoration:none;padding-bottom:10px;margin-bottom:6px;border-bottom:1px solid var(--border)">
      <span class="badge red">Ultima gara</span>
      <span style="font-size:1.25rem">${flagEmoji(race.country_code)}</span>
      <span class="text-hi" style="font-weight:800">${esc(race.name.replace('Gran Premio ', 'GP '))}</span>
      <span class="text-lo" style="font-size:0.82rem">· ${fmtDate(race.race_date)}</span>
    </a>`;

  const rows = results.map((r) => {
    const pos = r.dnf ? 'DNF' : (r.position ?? '—');
    const cls = !r.dnf && r.position <= 3 ? 'p' + r.position : '';
    return `
      <a href="/driver.html?id=${r.user_id}" class="flex items-center gap-3" style="padding:9px 0;border-bottom:1px solid var(--border);text-decoration:none">
        <span class="pos ${cls}">${pos}</span>
        <img class="avatar" style="width:30px;height:30px" src="${avatarUrl(r)}" onerror="this.src='/images/avatars/default.svg'" alt="">
        <span class="grow text-hi" style="font-weight:600">${esc(r.display_name)}</span>
        <span class="team-tag"><span class="dot" style="background:${r.team_color || '#e10600'}"></span></span>
        <span class="pts">${r.points} pt</span>
      </a>`;
  }).join('');

  box.innerHTML = raceHeader + rows;
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

function renderPosts(posts) {
  const box = $('#posts-grid');
  if (!box) return; // bacheca nascosta: nessun blocco da popolare
  if (!posts?.length) {
    box.innerHTML = '<div class="empty">Ancora nessun post. <a href="/feed.html" class="text-red">Apri la bacheca</a> e pubblica il primo!</div>';
    return;
  }
  box.innerHTML = posts.map((p) => {
    const media = p.media_url
      ? (p.media_type === 'video'
          ? `<div class="post-thumb">🎬 Video</div>`
          : `<div class="post-thumb" style="background-image:url('${esc(p.media_url)}')"></div>`)
      : '';
    const tags = p.tags?.length ? `<div class="text-lo" style="font-size:0.8rem;margin-top:6px">🏷️ ${p.tags.map((t) => '@' + esc(t.handle || t.display_name)).join(' ')}</div>` : '';
    const text = (p.body || '').trim();
    return `
      <a href="/feed.html" class="card hover" style="text-decoration:none">
        ${media}
        ${text ? `<p style="font-size:0.92rem;color:var(--text-mid);margin:${media ? '10px 0 0' : '0'}">${esc(text.slice(0, 140))}${text.length > 140 ? '…' : ''}</p>` : ''}
        ${tags}
        <small class="text-lo" style="display:block;margin-top:12px">${fmtDate(p.created_at)} · ${esc(p.author_name || '')}</small>
      </a>`;
  }).join('');
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
    renderPosts(data.posts);
    initReveal();
  } catch (e) {
    console.error(e);
    $('main.container').innerHTML = `<div class="empty" style="padding:80px"><div class="em-ic">⚠️</div>Errore di caricamento: ${esc(e.message)}</div>`;
  } finally {
    loader.hide();
  }
})();
