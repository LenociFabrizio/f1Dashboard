/* =============================================================
   admin/sections/imports.js — Import automatico gare da telemetria F1 25.
   Elenca le sessioni catturate dal collector, ne mostra un'anteprima con
   la mappatura piloti (handle → utente) e le importa nella gara scelta,
   riusando il flusso risultati esistente. L'admin verifica solo le anomalie.
   ============================================================= */
import api from '../../../core/api.js';
import { $, $$, esc, toast, flagEmoji, confirmDialog, parseDbDate } from '../../../core/ui.js';
import { state, sectionHead, empty } from '../shared.js';

let captures = [];
let races = [];

const SESSION_LABEL = {
  race: '🏁 Gara', qualifying: '⏱️ Qualifica', sprint: '⚡ Sprint',
  practice: '🔧 Prove', time_trial: '🕒 Time Trial', unknown: '❔ Sconosciuta',
};

const fmtWhen = (iso) => {
  const d = parseDbDate(iso);
  return isNaN(d) ? '—' : d.toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

/* ---------------- Lista sessioni catturate ---------------- */
function statusBadge(s) {
  const map = {
    pending: ['In attesa', '#eab308'],
    imported: ['Importata', '#22c55e'],
    discarded: ['Scartata', '#71717a'],
  };
  const [label, color] = map[s] || [s, '#888'];
  return `<span class="badge" style="background:${color}22;color:${color};border:1px solid ${color}55">${label}</span>`;
}

function renderList(root) {
  const rows = captures
    .map(
      (c) => `
      <tr data-id="${c.id}">
        <td>${esc(fmtWhen(c.created_at))}</td>
        <td>${SESSION_LABEL[c.session_type] || c.session_type || '—'}</td>
        <td>${statusBadge(c.status)}</td>
        <td>${c.race_name ? `R${c.race_round} · ${esc(c.race_name)}` : '—'}</td>
        <td style="text-align:right">
          ${c.status !== 'discarded' ? `<button class="btn ${c.status === 'imported' ? 'ghost' : 'primary'} sm" data-open="${c.id}">${c.status === 'imported' ? 'Rivedi' : 'Rivedi & importa'}</button>` : ''}
          ${c.status === 'pending' ? `<button class="btn ghost sm" data-discard="${c.id}" title="Scarta">✕</button>` : ''}
        </td>
      </tr>`
    )
    .join('');

  root.innerHTML =
    sectionHead(
      'Import automatico',
      'Sessioni ricevute dal collector telemetria F1 25. Rivedi la mappatura piloti e importa nella gara.',
      `<button class="btn ghost sm" id="refresh-captures">↻ Aggiorna</button>`
    ) +
    (captures.length
      ? `<div class="table-wrap"><table class="data">
           <thead><tr><th>Ricevuta</th><th>Sessione</th><th>Stato</th><th>Gara</th><th></th></tr></thead>
           <tbody>${rows}</tbody></table></div>`
      : empty('📡', 'Nessuna sessione ricevuta. Avvia il collector sul PC di gioco e disputa una gara.'));

  $('#refresh-captures', root)?.addEventListener('click', () => load(root));
  $$('[data-open]', root).forEach((b) => b.addEventListener('click', () => openDetail(root, Number(b.dataset.open))));
  $$('[data-discard]', root).forEach((b) =>
    b.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Scartare la sessione?', message: 'Non verrà importata. Puoi sempre reinviarla dal collector.', danger: true, confirmText: 'Scarta' }))) return;
      try { await api.del(`/admin/captures/${b.dataset.discard}`); await load(root); toast.success('Sessione scartata.'); }
      catch (err) { toast.error(err.message); }
    })
  );
}

/* ---------------- Dettaglio + mappatura + commit ---------------- */
/**
 * Opzioni utente per una tendina, escludendo gli utenti già assegnati ad
 * altre righe (`taken`) — così un pilota non è selezionabile due volte.
 * L'utente attualmente selezionato in QUESTA riga resta sempre disponibile.
 */
function userOptionSet(currentValue, taken) {
  let html = `<option value="">— non mappato —</option>`;
  for (const u of state.users) {
    if (taken.has(u.id) && String(u.id) !== String(currentValue ?? '')) continue;
    html += `<option value="${u.id}" ${String(u.id) === String(currentValue ?? '') ? 'selected' : ''}>${esc(u.display_name || u.handle)}</option>`;
  }
  return html;
}

/** Ricostruisce tutte le tendine escludendo i piloti già scelti altrove. */
function refreshUserSelects(root) {
  const selects = $$('#parts-body .p-user', root);
  const taken = new Set(selects.map((s) => s.value).filter(Boolean).map(Number));
  selects.forEach((s) => {
    const cur = s.value;
    s.innerHTML = userOptionSet(cur, taken);
    s.value = cur;
  });
}

/** Opzioni tendina per l'aggiunta manuale: tutti gli utenti del sito. */
function manualUserOptions() {
  let html = `<option value="">— scegli pilota —</option>`;
  for (const u of state.users) html += `<option value="${u.id}">${esc(u.display_name || u.handle)}</option>`;
  return html;
}

/** Riga per aggiungere a mano un pilota (registrato) non rilevato dal collector. */
function manualRow(isQuali) {
  const extra = isQuali
    ? `<input type="text" class="input sm m-time" placeholder="1:23.456" style="width:120px" title="Miglior tempo (opzionale)">`
    : `<label class="checkbox" style="white-space:nowrap;font-size:.85rem"><input type="checkbox" class="m-dnf"> DNF</label>`;
  return `<div class="manual-row flex items-center gap-2" style="margin-bottom:6px;flex-wrap:wrap">
    <select class="select sm m-user" style="min-width:160px">${manualUserOptions()}</select>
    <input type="number" class="input sm m-pos" min="1" max="30" placeholder="Pos" style="width:72px" title="Posizione finale">
    ${extra}
    <button class="btn ghost sm m-del" type="button" title="Rimuovi">✕</button>
  </div>`;
}

function participantRow(p) {
  const warn = p.nameReliable === false;
  const tag = p.userId && p.matchedBy
    ? `<span class="badge" style="background:#22c55e22;color:#22c55e">${p.matchedBy === 'reserve' ? '🤖 auto (bot)' : 'auto'}</span>`
    : p.aiControlled
    ? `<span class="badge" style="background:#71717a22;color:#a1a1aa">BOT</span>`
    : `<span class="badge" style="background:#eab30822;color:#eab308">da mappare</span>`;
  return `
    <tr data-car="${p.carIndex}">
      <td>
        <span class="text-hi">${esc(p.name || `Car ${p.carIndex}`)}</span>
        ${warn ? ' <span title="Nome online oscurato nel gioco: verifica l\'abbinamento">⚠️</span>' : ''}
        <div class="dc-sub text-dim">${esc(p.platform || '—')}${p.raceNumber != null ? ` · #${p.raceNumber}` : ''}</div>
      </td>
      <td>${tag}</td>
      <td><select class="select sm p-user" style="min-width:200px">${userOptionSet(p.userId, new Set())}</select></td>
    </tr>`;
}

function racePickerOptions(suggestedCircuitId) {
  const suggestedRace = races.find((r) => r.circuit_id === suggestedCircuitId);
  return races
    .map((r) => {
      const sel = suggestedRace && r.id === suggestedRace.id ? 'selected' : '';
      return `<option value="${r.id}" ${sel}>R${r.round} · ${esc(r.name)}${r.status === 'completed' ? ' ✓' : ''}</option>`;
    })
    .join('');
}

async function openDetail(root, id) {
  root.innerHTML = '<div style="padding:60px;text-align:center"><span class="spinner"></span></div>';
  let detail;
  try {
    detail = await api.get(`/admin/captures/${id}`);
  } catch (err) { toast.error(err.message); return load(root); }

  const { participants, skipped, resultRows, qualifyingRows, suggestedCircuitId, weather, totalLaps, capture } = detail;
  const humanParticipants = participants.filter((p) => !p.aiControlled);
  const unmapped = humanParticipants.filter((p) => !p.userId).length;
  const unreliable = participants.some((p) => p.nameReliable === false);
  const alreadyImported = capture.status === 'imported';
  // Qualifica e gara si importano in modo indipendente: la UI e il commit si
  // adattano al tipo di sessione (vedi captureService.sessionKind lato server).
  const isQuali = capture.session_type === 'qualifying';

  root.innerHTML =
    sectionHead(
      `Sessione ${SESSION_LABEL[capture.session_type] || ''}`,
      `Ricevuta ${fmtWhen(capture.created_at)} · ${participants.length} vetture · UID ${capture.session_uid}`,
      `<button class="btn ghost sm" id="back-list">← Elenco</button>`
    ) + `
    <div class="grid grid-2" style="align-items:start;gap:20px">
      <div class="card">
        <div class="flex items-center justify-between wrap gap-2" style="margin-bottom:10px">
          <strong>Mappatura piloti</strong>
          <div class="text-lo" style="font-size:.85rem">${humanParticipants.length - unmapped}/${humanParticipants.length} mappati</div>
        </div>
        ${unreliable ? `<div class="hint" style="background:#eab30818;border-left:3px solid #eab308;padding:8px 10px;margin-bottom:10px">⚠️ In questa sessione alcuni nomi online erano oscurati nel gioco: verifica gli abbinamenti manualmente.</div>` : ''}
        <div class="table-wrap"><table class="data compact">
          <thead><tr><th>Pilota (gioco)</th><th></th><th>Utente del sito</th></tr></thead>
          <tbody id="parts-body">${participants.map(participantRow).join('')}</tbody>
        </table></div>
        <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px">
          <div class="flex items-center justify-between" style="margin-bottom:6px">
            <strong style="font-size:.9rem">Piloti non rilevati</strong>
            <button class="btn ghost sm" id="add-manual" type="button">+ Aggiungi</button>
          </div>
          <div class="hint" style="margin-bottom:8px">Aggiungi a mano i piloti (registrati) che il collector non ha rilevato: scegli l'utente e la posizione ${isQuali ? 'in qualifica' : 'finale'}.</div>
          <div id="manual-body"></div>
        </div>
      </div>

      <div class="card">
        <div class="field">
          <label>Gara di destinazione</label>
          <select class="select" id="race-target">${racePickerOptions(suggestedCircuitId)}</select>
          ${suggestedCircuitId ? '<div class="hint">Circuito suggerito dalla telemetria (verifica).</div>' : ''}
        </div>
        <div class="summary" style="font-size:.9rem;line-height:1.9;margin:6px 0 14px">
          <div>Tipo sessione: <strong>${SESSION_LABEL[capture.session_type] || capture.session_type || '—'}</strong></div>
          ${isQuali ? '' : `<div>Meteo rilevato: <strong>${esc(weather || '—')}</strong></div>
          <div>Giri: <strong>${totalLaps ?? '—'}</strong></div>`}
          ${isQuali
            ? `<div>Tempi di qualifica pronti: <strong>${qualifyingRows.length}</strong></div>`
            : `<div>Risultati pronti: <strong>${resultRows.length}</strong>${skipped.length ? ` · <span style="color:#eab308">${skipped.length} non mappati (esclusi)</span>` : ''}</div>`}
        </div>
        ${isQuali ? '' : `<label class="checkbox" style="margin-bottom:8px"><input type="checkbox" id="opt-completed" checked> Segna la gara come <strong>conclusa</strong></label><br>`}
        <label class="checkbox" style="margin-bottom:14px"><input type="checkbox" id="opt-aliases" checked> Ricorda gli abbinamenti (alias) per le prossime gare</label>
        <button class="btn primary block" id="do-commit" data-quali="${isQuali ? 1 : 0}">${alreadyImported ? (isQuali ? 'Reimporta qualifica' : 'Reimporta nella gara') : (isQuali ? 'Importa qualifica' : 'Importa nella gara')}</button>
        <div class="hint" style="margin-top:8px">${isQuali
          ? "L'import sostituisce solo la griglia di qualifica di questa gara: i risultati restano intatti."
          : "L'import sostituisce solo i risultati di questa gara (la qualifica resta intatta) e ricalcola le classifiche."}</div>
      </div>
    </div>`;

  $('#back-list', root).addEventListener('click', () => load(root));
  $('#do-commit', root).addEventListener('click', () => commit(root, id));

  // Escludi da subito i piloti già assegnati (auto o manuale) dalle altre
  // tendine, e riaggiorna a ogni cambio di selezione.
  refreshUserSelects(root);
  $$('#parts-body .p-user', root).forEach((s) => s.addEventListener('change', () => refreshUserSelects(root)));

  // Aggiunta manuale di piloti non rilevati.
  $('#add-manual', root).addEventListener('click', () => {
    const holder = $('#manual-body', root);
    holder.insertAdjacentHTML('beforeend', manualRow(isQuali));
    const row = holder.lastElementChild;
    row.querySelector('.m-del').addEventListener('click', () => row.remove());
  });
}

/** Raccoglie le righe manuali (piloti non rilevati) come result/qualifying rows. */
function collectManual(root, isQuali) {
  return $$('#manual-body .manual-row', root)
    .map((row) => {
      const user_id = Number(row.querySelector('.m-user').value) || null;
      const position = Number(row.querySelector('.m-pos').value) || null;
      if (!user_id || !position) return null;
      if (isQuali) {
        const best_time = row.querySelector('.m-time')?.value.trim() || null;
        return { user_id, position, best_time };
      }
      return { user_id, position, dnf: row.querySelector('.m-dnf')?.checked ? 1 : 0 };
    })
    .filter(Boolean);
}

/** Raccoglie i mapping carIndex → user_id dalle select. */
function collectMappings(root) {
  return $$('#parts-body tr', root)
    .map((tr) => ({ carIndex: Number(tr.dataset.car), user_id: tr.querySelector('.p-user').value ? Number(tr.querySelector('.p-user').value) : null }))
    .filter((m) => m.user_id);
}

async function commit(root, id) {
  const raceId = Number($('#race-target', root).value);
  if (!raceId) { toast.warning('Scegli la gara di destinazione.'); return; }

  const btn = $('#do-commit', root);
  const isQuali = btn.dataset.quali === '1';
  const completedEl = $('#opt-completed', root); // assente per le qualifiche

  const mappings = collectMappings(root);
  const manual = collectManual(root, isQuali);
  if (!mappings.length && !manual.length) { toast.warning('Mappa almeno un pilota o aggiungine uno manualmente.'); return; }

  // Avviso di sovrascrittura solo per la gara già conclusa: importare la
  // qualifica non tocca i risultati, quindi non serve avvisare.
  const target = races.find((r) => r.id === raceId);
  if (!isQuali && target && target.status === 'completed') {
    const ok = await confirmDialog({
      title: 'Sovrascrivere i risultati?',
      message: `La gara "${target.name}" è già conclusa. L'import sostituirà i risultati esistenti (la qualifica resta intatta).`,
      danger: true, confirmText: 'Sovrascrivi e importa',
    });
    if (!ok) return;
  }

  btn.disabled = true; btn.innerHTML = '<span class="spinner sm"></span> Import…';
  try {
    const res = await api.post(`/admin/captures/${id}/commit`, {
      race_id: raceId,
      mappings,
      manual_results: isQuali ? [] : manual,
      manual_qualifying: isQuali ? manual : [],
      save_aliases: $('#opt-aliases', root).checked,
      mark_completed: completedEl ? completedEl.checked : true,
    });
    const summary = res.sessionType === 'qualifying'
      ? `${res.qualifying} tempi di qualifica importati.`
      : `${res.imported} risultati importati. Classifiche aggiornate!`;
    toast.success(summary, { title: 'Fatto' });
    await load(root);
  } catch (err) {
    toast.error(err.message || 'Import fallito.');
    btn.disabled = false; btn.textContent = isQuali ? 'Importa qualifica' : 'Importa nella gara';
  }
}

/* ---------------- Ingresso sezione ---------------- */
async function load(root) {
  root.innerHTML = '<div style="padding:60px;text-align:center"><span class="spinner"></span></div>';
  captures = await api.get('/admin/captures');
  races = state.season ? await api.get('/races', { season_id: state.season.id }) : [];
  renderList(root);
}

async function render(root) {
  await load(root);
}

export default { render };
