/* =============================================================
   admin/sections/overview.js — Panoramica del pannello admin
   ============================================================= */
import api from '../../../core/api.js';
import { esc, fmtDate, flagEmoji } from '../../../core/ui.js';
import { state } from '../shared.js';

function stat(label, value, ic) {
  return `<div class="stat-card"><span class="stat-ic">${ic}</span><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`;
}

async function render(root) {
  const data = await api.get('/dashboard/admin');
  const s = data.stats || {};
  const season = data.season;

  root.innerHTML = `
    <div class="flex justify-between items-center wrap gap-3" style="margin-bottom:24px">
      <div>
        <h1 style="margin:0;font-size:1.8rem">Panoramica</h1>
        <p class="text-lo" style="margin:4px 0 0">${season ? `Stagione attiva: <strong class="text-hi">${esc(season.name)} · ${season.year}</strong>` : 'Nessuna stagione attiva'}</p>
      </div>
      <a href="/" class="btn ghost sm" target="_blank">Vedi sito ↗</a>
    </div>

    <div class="grid grid-auto stagger" style="margin-bottom:32px">
      ${stat('Piloti attivi', s.userCount ?? 0, '👤')}
      ${stat('Amministratori', s.adminCount ?? 0, '🛡️')}
      ${stat('Team', s.teamCount ?? 0, '🏎️')}
      ${stat('Gare totali', s.raceCount ?? 0, '🏁')}
      ${stat('Gare concluse', s.completedCount ?? 0, '✓')}
      ${stat('Da disputare', s.remaining ?? 0, '⏳')}
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="eyebrow">Prossima gara</div>
        ${data.nextRace ? `
          <div class="flex items-center gap-3" style="margin-top:12px">
            <span style="font-size:2.4rem">${flagEmoji(data.nextRace.country_code)}</span>
            <div>
              <div class="text-hi" style="font-weight:800">${esc(data.nextRace.name)}</div>
              <div class="text-lo">${esc(data.nextRace.circuit_name)} · ${fmtDate(data.nextRace.race_date)}</div>
            </div>
          </div>
          <a href="#results?race=${data.nextRace.id}" class="btn outline sm" style="margin-top:16px">Inserisci risultati →</a>
        ` : '<div class="empty" style="padding:24px">Nessuna gara programmata.</div>'}
      </div>
      <div class="card">
        <div class="eyebrow">Ultima gara conclusa</div>
        ${data.lastRace ? `
          <div class="flex items-center gap-3" style="margin-top:12px">
            <span style="font-size:2.4rem">${flagEmoji(data.lastRace.country_code)}</span>
            <div>
              <div class="text-hi" style="font-weight:800">${esc(data.lastRace.name)}</div>
              <div class="text-lo">${esc(data.lastRace.circuit_name)} · ${fmtDate(data.lastRace.race_date)}</div>
            </div>
          </div>
          <a href="/race.html?id=${data.lastRace.id}" target="_blank" class="btn ghost sm" style="margin-top:16px">Vedi risultati ↗</a>
        ` : '<div class="empty" style="padding:24px">Nessuna gara conclusa.</div>'}
      </div>
    </div>

    <div class="card glass" style="margin-top:24px">
      <div class="eyebrow">Guida rapida</div>
      <ol class="text-mid" style="margin:12px 0 0;padding-left:20px;line-height:1.9">
        <li>Crea una <strong>Stagione</strong> e impostala come attiva.</li>
        <li>Aggiungi <strong>Circuiti</strong> e <strong>Team</strong>, poi assegna i team ai piloti in <strong>Utenti</strong>.</li>
        <li>Crea le <strong>Gare</strong> del calendario.</li>
        <li>A fine gara inserisci <strong>Qualifiche</strong> e <strong>Risultati</strong>: classifiche e statistiche si aggiornano da sole.</li>
      </ol>
    </div>
  `;
}

export default { render };
