/* =============================================================
   dashboard.js — Dashboard personale del pilota (protetta)
   ============================================================= */
import api from '../core/api.js';
import { guard } from '../core/auth.js';
import { mountChrome, avatarUrl } from '../core/components.js';
import { $, esc, loader, fmtDate, flagEmoji, ordinal, countdownParts } from '../core/ui.js';
import { lineChart } from '../core/charts.js';

let cdTimer;

function statCard(label, value, ic, extra = '') {
  return `<div class="stat-card"><span class="stat-ic">${ic}</span><div class="stat-label">${label}</div><div class="stat-value">${value}</div>${extra}</div>`;
}

function miniStandingRow(d, meId) {
  const me = d.user_id === meId;
  return `
    <tr class="${me ? 'row-me' : ''}">
      <td><span class="pos ${d.position <= 3 ? 'p' + d.position : ''}">${d.position}</span></td>
      <td>
        <a href="/driver.html?id=${d.user_id}" class="driver-cell">
          <img src="${avatarUrl(d)}" onerror="this.src='/images/avatars/default.svg'" alt="">
          <div class="dc-name">${esc(d.display_name)}${me ? ' <span class="badge red">Tu</span>' : ''}</div>
        </a>
      </td>
      <td><span class="team-tag"><span class="dot" style="background:${d.team_color || '#e10600'}"></span>${esc(d.team_name || '—')}</span></td>
      <td class="num pts">${d.points}</td>
    </tr>`;
}

function nextRaceCard(race) {
  if (!race) return `<div class="card"><div class="eyebrow">Prossimo GP</div><div class="empty" style="padding:30px">Stagione conclusa 🏁</div></div>`;
  return `
    <div class="card next-race">
      <div class="eyebrow">Prossimo Gran Premio</div>
      <div class="flex items-center gap-3" style="margin:12px 0">
        <span style="font-size:2.6rem">${flagEmoji(race.country_code)}</span>
        <div>
          <div class="text-hi" style="font-size:1.3rem;font-weight:900;line-height:1.1">${esc(race.name.replace('Gran Premio ', 'GP '))}</div>
          <div class="text-lo">${esc(race.circuit_name)} · ${fmtDate(race.race_date)}</div>
        </div>
      </div>
      <div class="countdown" id="countdown"></div>
      <a href="/race.html?id=${race.id}" class="btn outline sm block" style="margin-top:16px">Dettagli gara →</a>
    </div>`;
}

function startCountdown(iso) {
  const box = $('#countdown');
  if (!box || !iso) return;
  const tick = () => {
    const c = countdownParts(iso);
    if (c.past) { box.innerHTML = '<div class="live-dot"></div> In corso o in attesa risultati'; clearInterval(cdTimer); return; }
    box.innerHTML = [['g', c.d], ['h', c.h], ['m', c.m], ['s', c.s]]
      .map(([u, v]) => `<div class="cd"><b>${String(v).padStart(2, '0')}</b><span>${u}</span></div>`).join('');
  };
  tick();
  cdTimer = setInterval(tick, 1000);
}

function render(data, me) {
  const s = data.myStats;
  const st = data.myStanding;
  const hasRaces = s && s.races > 0;

  const heroStats = st
    ? `${statCard('Posizione', ordinal(st.position), '📍')}
       ${statCard('Punti', st.points, '🏆')}
       ${statCard('Vittorie', st.wins, '🥇')}
       ${statCard('Podi', st.podiums, '🍾')}`
    : `<div class="card" style="grid-column:1/-1"><div class="empty" style="padding:24px">Non hai ancora punti in classifica. Partecipa a un GP per apparire qui!</div></div>`;

  $('#dash-main').innerHTML = `
    <div class="page-head" style="margin-bottom:24px">
      <div class="eyebrow">Stagione ${data.season?.year ?? ''}</div>
      <div class="flex items-center gap-4 wrap">
        <img src="${avatarUrl(me)}" onerror="this.src='/images/avatars/default.svg'" class="avatar lg" style="border-color:${me.team_color || 'var(--f1-red)'}">
        <div>
          <h1 style="margin:0">Ciao, ${esc(me.display_name || me.username)}</h1>
          <p class="text-lo" style="margin:4px 0 0">Ecco il riepilogo della tua stagione.</p>
        </div>
        <a href="/profile.html" class="btn ghost sm" style="margin-left:auto">Modifica profilo</a>
      </div>
    </div>

    <div class="grid grid-auto stagger" style="margin-bottom:32px">${heroStats}</div>

    <div class="grid grid-2" style="margin-bottom:32px;align-items:start">
      ${nextRaceCard(data.nextRace)}
      ${hasRaces ? `<div class="card"><div class="eyebrow" style="margin-bottom:10px">La tua progressione punti</div><div class="chart-box sm"><canvas id="my-chart"></canvas></div></div>`
        : `<div class="card"><div class="eyebrow">Statistiche</div><div class="empty" style="padding:30px">I grafici appariranno dopo la tua prima gara.</div></div>`}
    </div>

    <div class="grid grid-2" style="align-items:start">
      <div>
        <h2 class="section-title">Classifica piloti</h2>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Pos</th><th>Pilota</th><th>Team</th><th class="num">Pt</th></tr></thead>
            <tbody>${(data.driverStandings || []).map((d) => miniStandingRow(d, me.id)).join('') || '<tr><td colspan="4"><div class="empty">Nessun dato.</div></td></tr>'}</tbody>
          </table>
        </div>
        <a href="/standings.html" class="btn ghost sm" style="margin-top:12px">Classifica completa →</a>
      </div>
      <div>
        <div class="flex items-center justify-between">
          <h2 class="section-title" style="margin:0">Dalla bacheca</h2>
          <a href="/feed.html" class="btn ghost sm">Apri →</a>
        </div>
        <div class="flex" style="flex-direction:column;gap:12px;margin-top:12px">
          ${(data.posts || []).slice(0, 5).map((p) => {
            const text = (p.body || '').trim();
            const media = p.media_url ? `<div class="text-lo" style="font-size:0.8rem;margin-top:4px">${p.media_type === 'video' ? '🎬 Video' : '📷 Foto'}</div>` : '';
            const tags = p.tags?.length ? ` · 🏷️ ${p.tags.map((t) => '@' + esc(t.username)).join(' ')}` : '';
            return `
            <a href="/feed.html" class="card" style="padding:16px;text-decoration:none;display:block">
              <div class="text-lo" style="font-size:0.78rem">${esc(p.author_name || '')} · ${fmtDate(p.created_at)}${tags}</div>
              ${text ? `<p class="text-mid" style="margin:6px 0 0;font-size:0.9rem">${esc(text.slice(0, 120))}${text.length > 120 ? '…' : ''}</p>` : ''}
              ${media}
            </a>`;
          }).join('') || '<div class="empty">Ancora nessun post. <a href="/feed.html" class="text-red">Pubblica il primo!</a></div>'}
        </div>
      </div>
    </div>
  `;

  if (data.nextRace) startCountdown(data.nextRace.race_date);

  if (hasRaces && s.history?.length) {
    const labels = s.history.map((h) => `R${h.round}`);
    let cum = 0;
    lineChart($('#my-chart'), {
      labels,
      datasets: [{ label: 'Punti', color: me.team_color || '#e10600', data: s.history.map((h) => (cum += h.points)) }],
    }, { legend: false, fill: true });
  }
}

(async function init() {
  const me = await guard();
  if (!me) return;
  mountChrome();
  try {
    const data = await api.get('/dashboard/me');
    document.title = `Dashboard · ${me.display_name || me.username} · Lega F1`;
    render(data, { ...me, ...(data.myStanding || {}) });
  } catch (e) {
    console.error(e);
    $('#dash-main').innerHTML = `<div class="empty" style="padding:80px"><div class="em-ic">⚠️</div>${esc(e.message)}</div>`;
  } finally {
    loader.hide();
  }
})();
