/* =============================================================
   driver.js — Pagina pilota: profilo, statistiche, storico, grafici
   ============================================================= */
import api from '../core/api.js';
import { mountChrome, avatarUrl } from '../core/components.js';
import { $, esc, loader, fmtDate, flagEmoji, assistBadges } from '../core/ui.js';
import { lineChart, barChart } from '../core/charts.js';

mountChrome();

const userId = new URLSearchParams(location.search).get('id');

function statCard(label, value, ic) {
  return `<div class="stat-card"><span class="stat-ic">${ic}</span><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`;
}

function last5Dots(last5) {
  return last5.map((p) => {
    const cls = p === null ? 'dnf' : p === 1 ? 'p1' : p <= 3 ? 'p3' : '';
    return `<span class="form-dot ${cls}" title="${p === null ? 'DNF' : 'P' + p}">${p === null ? '×' : p}</span>`;
  }).join('');
}

function historyRow(h) {
  const posCell = h.dnf
    ? '<span class="badge red">DNF</span>'
    : `<span class="pos ${h.position <= 3 ? 'p' + h.position : ''}">${h.position ?? '—'}</span>`;
  const tags = [];
  if (h.pole) tags.push('<span class="badge gold">POLE</span>');
  if (h.fastest_lap) tags.push('<span class="badge blue">GV</span>');
  return `
    <tr>
      <td class="num text-lo">R${h.round}</td>
      <td><a href="#" class="text-hi" style="font-weight:700">${flagEmoji(h.country_code)} ${esc(h.race)}</a></td>
      <td class="text-lo">${esc(h.circuit)}</td>
      <td class="num text-lo">${h.grid ?? '—'}</td>
      <td>${posCell}</td>
      <td style="white-space:nowrap">${tags.join(' ') || '—'}</td>
      <td class="num pts">${h.points}</td>
    </tr>`;
}

function render(user, stats) {
  const teamColor = user.team_color || '#e10600';
  const hasRaces = stats && stats.races > 0;

  const statsGrid = hasRaces ? `
    <div class="grid grid-auto stagger" style="margin-bottom:40px">
      ${statCard('Punti', stats.points, '🏆')}
      ${statCard('Gare', stats.races, '🏁')}
      ${statCard('Vittorie', stats.wins, '🥇')}
      ${statCard('Podi', stats.podiums, '🍾')}
      ${statCard('Pole', stats.poles, '⏱️')}
      ${statCard('Giri veloci', stats.fastest_laps, '⚡')}
      ${statCard('Sorpassi', stats.overtakes, '🔀')}
      ${statCard('DNF', stats.dnf, '💥')}
      ${statCard('Media pos.', stats.avg_position ?? '—', '📊')}
      ${statCard('Media quali', stats.avg_quali ?? '—', '🎯')}
    </div>` : '';

  const ratesGrid = hasRaces ? `
    <div class="grid grid-3" style="margin-bottom:40px">
      <div class="card"><div class="stat-label">Tasso vittorie</div><div class="stat-value" style="color:var(--gold)">${stats.win_rate}%</div><div class="bar" style="margin-top:10px"><i style="width:${Math.min(stats.win_rate, 100)}%"></i></div></div>
      <div class="card"><div class="stat-label">Tasso podi</div><div class="stat-value" style="color:var(--silver)">${stats.podium_rate}%</div><div class="bar" style="margin-top:10px"><i style="width:${Math.min(stats.podium_rate, 100)}%"></i></div></div>
      <div class="card"><div class="stat-label">Tasso ritiri</div><div class="stat-value" style="color:var(--danger)">${stats.dnf_rate}%</div><div class="bar" style="margin-top:10px"><i style="width:${Math.min(stats.dnf_rate, 100)}%;background:var(--danger)"></i></div></div>
    </div>` : '';

  const bestWorst = hasRaces ? `
    <div class="grid grid-2" style="margin-bottom:40px">
      ${stats.best_result ? `<div class="card"><div class="stat-label">Miglior risultato</div><div class="text-hi" style="font-size:1.2rem;font-weight:800;margin-top:6px">P${stats.best_result.position} · ${esc(stats.best_result.race)}</div></div>` : ''}
      ${stats.best_circuit ? `<div class="card"><div class="stat-label">Circuito preferito</div><div class="text-hi" style="font-size:1.2rem;font-weight:800;margin-top:6px">${esc(stats.best_circuit.name)} <span class="text-lo" style="font-size:0.9rem">(media P${stats.best_circuit.avg})</span></div></div>` : ''}
    </div>` : '';

  const chartsBlock = hasRaces && stats.history.length ? `
    <h2 class="section-title">Andamento stagione</h2>
    <div class="grid grid-2" style="margin-bottom:40px">
      <div class="card"><div class="eyebrow" style="margin-bottom:10px">Punti cumulati</div><div class="chart-box sm"><canvas id="pts-chart"></canvas></div></div>
      <div class="card"><div class="eyebrow" style="margin-bottom:10px">Punti per gara</div><div class="chart-box sm"><canvas id="perrace-chart"></canvas></div></div>
    </div>` : '';

  const ls = hasRaces ? stats.lapStats : null;
  const hasLapStats = ls && (ls.best_lap || ls.laps_recorded);
  const lapsBlock = hasLapStats ? `
    <h2 class="section-title">Telemetria — giri & settori</h2>
    <div class="grid grid-auto stagger" style="margin-bottom:40px">
      ${statCard('Miglior giro', ls.best_lap ?? '—', '⏱️')}
      ${statCard('Miglior S1', ls.best_s1 ?? '—', '🟩')}
      ${statCard('Miglior S2', ls.best_s2 ?? '—', '🟨')}
      ${statCard('Miglior S3', ls.best_s3 ?? '—', '🟪')}
      ${statCard('Giri registrati', ls.laps_recorded, '📈')}
    </div>` : '';

  const historyBlock = hasRaces && stats.history.length ? `
    <h2 class="section-title">Storico gare</h2>
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>Round</th><th>Gran Premio</th><th>Circuito</th><th class="num">Grid</th><th>Pos</th><th>Note</th><th class="num">Punti</th></tr></thead>
        <tbody>${stats.history.map(historyRow).join('')}</tbody>
      </table>
    </div>` : `<div class="empty"><div class="em-ic">🏁</div>Questo pilota non ha ancora disputato gare in questa stagione.</div>`;

  $('#driver-main').innerHTML = `
    <a href="/standings.html" class="btn ghost sm" style="margin-bottom:20px">← Classifiche</a>

    <div class="hero" style="padding-block:2rem 2.5rem;margin-bottom:20px">
      <div class="hero-strip" style="border:0;padding:0;margin:0"></div>
      <div class="flex items-center gap-4 wrap">
        <img src="${avatarUrl(user)}" onerror="this.src='/images/avatars/default.svg'" class="avatar xl" style="border:3px solid ${teamColor}">
        <div style="flex:1;min-width:220px">
          ${user.favorite_number ? `<div style="font-size:3rem;font-weight:900;color:${teamColor};line-height:1">#${user.favorite_number}</div>` : ''}
          <h1 style="margin:2px 0">${esc(user.display_name)}</h1>
          <div class="flex items-center gap-3 wrap text-lo">
            <span class="team-tag"><span class="dot" style="background:${teamColor}"></span>${esc(user.team_name || 'Nessun team')}</span>
            <span>@${esc(user.username)}</span>
            <span class="role-pill ${user.role === 'admin' ? 'admin' : ''}">${user.role === 'admin' ? 'Admin' : 'Pilota'}</span>
          </div>
          ${user.favorite_driver ? `<div class="text-lo" style="margin-top:8px">Idolo: <strong class="text-mid">${esc(user.favorite_driver)}</strong></div>` : ''}
          ${user.reserve_driver ? `<div class="text-lo" style="margin-top:4px">🤖 Riserva (bot): <strong class="text-mid">${esc(user.reserve_driver)}</strong></div>` : ''}
          <div class="flex items-center gap-2 wrap text-lo" style="margin-top:10px">
            <span style="font-size:.82rem;text-transform:uppercase;letter-spacing:.06em">Aiuti attuali</span>
            ${assistBadges(user)}
          </div>
        </div>
        ${hasRaces ? `<div style="text-align:center"><div class="text-lo" style="font-size:0.8rem;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Ultime 5</div><div class="flex gap-2">${last5Dots(stats.last5)}</div></div>` : ''}
      </div>
      ${user.biography ? `<p class="text-mid" style="margin-top:20px;max-width:70ch;line-height:1.7">${esc(user.biography)}</p>` : ''}
    </div>

    ${statsGrid}
    ${ratesGrid}
    ${bestWorst}
    ${chartsBlock}
    ${lapsBlock}
    ${historyBlock}
  `;

  // Charts
  if (hasRaces && stats.history.length) {
    const labels = stats.history.map((h) => `R${h.round}`);
    let cum = 0;
    const cumData = stats.history.map((h) => (cum += h.points));
    lineChart($('#pts-chart'), { labels, datasets: [{ label: 'Punti', color: teamColor, data: cumData }] }, { legend: false, fill: true });
    barChart($('#perrace-chart'), { labels, values: stats.history.map((h) => h.points), color: teamColor }, { label: 'Punti' });
  }
}

(async function init() {
  if (!userId) { location.href = '/standings.html'; return; }
  try {
    const [user, season] = await Promise.all([
      api.get(`/users/${userId}`, {}, { auth: false }),
      api.get('/seasons/active', {}, { auth: false }),
    ]);
    document.title = `${user.display_name} · Lega F1`;
    let stats = null;
    if (season) {
      try { stats = await api.get(`/stats/driver/${userId}`, { season_id: season.id }, { auth: false }); }
      catch { stats = null; }
    }
    render(user, stats);
  } catch (e) {
    console.error(e);
    $('#driver-main').innerHTML = `<div class="empty" style="padding:80px"><div class="em-ic">🚫</div>${esc(e.message || 'Pilota non trovato')}</div>`;
  } finally {
    loader.hide();
  }
})();
