/* =============================================================
   admin/sections/results.js — Inserimento risultati, qualifiche,
   MVP, cronaca e screenshot per una gara. Alla conferma le
   classifiche/statistiche si ricalcolano automaticamente.
   ============================================================= */
import api from '../../../core/api.js';
import { $, $$, esc, toast, flagEmoji } from '../../../core/ui.js';
import { state, sectionHead, empty } from '../shared.js';

let race;      // gara selezionata (con results/qualifying)
let races = []; // elenco gare della stagione

/* ---------- Selettore gara ---------- */
function raceSelect() {
  return `
    <select class="select" id="race-picker" style="min-width:260px">
      ${races.map((r) => `<option value="${r.id}" ${race && r.id === race.id ? 'selected' : ''}>R${r.round} · ${esc(r.name)}${r.status === 'completed' ? ' ✓' : ''}</option>`).join('')}
    </select>`;
}

/* ---------- Griglia RISULTATI ---------- */
function resultRowInput(u) {
  const ex = (race.results || []).find((r) => r.user_id === u.id) || {};
  const inGara = ex.user_id != null;
  const bot = (u.reserve_driver || '').trim();
  const byBot = !!(ex.bot_driver && ex.bot_driver.trim());
  // Selettore "chi ha guidato": il titolare oppure il bot di riserva (se assegnato).
  const driverSelect = bot
    ? `<select class="r-driver dc-sub" style="margin-top:4px;max-width:190px;font-size:.8rem">
         <option value="" ${byBot ? '' : 'selected'}>👤 ${esc(u.display_name || u.handle)} (titolare)</option>
         <option value="${esc(bot)}" ${byBot ? 'selected' : ''}>🤖 ${esc(bot)} (bot sostituto)</option>
       </select>`
    : `<div class="dc-sub text-dim" title="Nessun bot di riserva assegnato">nessun bot</div>`;
  return `
    <tr data-uid="${u.id}" data-team="${u.team_id ?? ''}">
      <td><input type="checkbox" class="r-in" ${inGara ? 'checked' : ''}></td>
      <td><span class="text-hi">${esc(u.display_name || u.handle)}</span><div class="dc-sub">${esc(u.team_name || '—')}</div>${driverSelect}</td>
      <td><input class="input sm r-grid" type="number" min="1" max="30" value="${ex.grid_position ?? ''}" style="width:56px"></td>
      <td><input class="input sm r-pos" type="number" min="1" max="30" value="${ex.position ?? ''}" style="width:56px"></td>
      <td><input class="input sm r-gap" placeholder="+0.000" value="${esc(ex.gap ?? '')}" style="width:90px"></td>
      <td style="text-align:center"><input type="checkbox" class="r-pole" ${ex.pole ? 'checked' : ''}></td>
      <td style="text-align:center"><input type="checkbox" class="r-fl" ${ex.fastest_lap ? 'checked' : ''}></td>
      <td style="text-align:center"><input type="checkbox" class="r-dnf" ${ex.dnf ? 'checked' : ''}></td>
      <td><input class="input sm r-ov" type="number" min="0" value="${ex.overtakes ?? 0}" style="width:60px"></td>
      <td><input class="input sm r-pen" type="number" min="0" value="${ex.penalty_seconds ?? 0}" style="width:60px"></td>
      <td><input class="input sm r-notes" placeholder="Note / motivo DNF" value="${esc(ex.dnf_reason || ex.notes || '')}" style="width:150px"></td>
    </tr>`;
}

function collectResults() {
  return $$('#results-body tr').filter((tr) => tr.querySelector('.r-in').checked).map((tr) => ({
    user_id: Number(tr.dataset.uid),
    team_id: tr.dataset.team ? Number(tr.dataset.team) : null,
    grid_position: tr.querySelector('.r-grid').value || null,
    position: tr.querySelector('.r-pos').value || null,
    gap: tr.querySelector('.r-gap').value || null,
    pole: tr.querySelector('.r-pole').checked,
    fastest_lap: tr.querySelector('.r-fl').checked,
    dnf: tr.querySelector('.r-dnf').checked,
    overtakes: tr.querySelector('.r-ov').value || 0,
    penalty_seconds: tr.querySelector('.r-pen').value || 0,
    dnf_reason: tr.querySelector('.r-dnf').checked ? tr.querySelector('.r-notes').value : '',
    notes: tr.querySelector('.r-dnf').checked ? '' : tr.querySelector('.r-notes').value,
    bot_driver: tr.querySelector('.r-driver')?.value || '',
  }));
}

/* ---------- Griglia QUALIFICHE ---------- */
function qualiRowInput(u) {
  const ex = (race.qualifying || []).find((q) => q.user_id === u.id) || {};
  return `
    <tr data-uid="${u.id}">
      <td><input type="checkbox" class="q-in" ${ex.user_id != null ? 'checked' : ''}></td>
      <td><span class="text-hi">${esc(u.display_name || u.handle)}</span></td>
      <td><input class="input sm q-pos" type="number" min="1" max="30" value="${ex.position ?? ''}" style="width:56px"></td>
      <td><input class="input sm q-time" placeholder="1:23.456" value="${esc(ex.best_time ?? '')}" style="width:110px"></td>
      <td><input class="input sm q-gap" placeholder="+0.123" value="${esc(ex.gap ?? '')}" style="width:90px"></td>
    </tr>`;
}

function collectQualifying() {
  return $$('#quali-body tr').filter((tr) => tr.querySelector('.q-in').checked).map((tr) => ({
    user_id: Number(tr.dataset.uid),
    position: tr.querySelector('.q-pos').value || null,
    best_time: tr.querySelector('.q-time').value || null,
    gap: tr.querySelector('.q-gap').value || null,
  }));
}

/* ---------- Rendering pagina ---------- */
function renderEditor(root) {
  const users = state.users.filter((u) => u.role !== 'disabled');
  const mvpOpts = [{ value: '', label: '— Nessuno —' }, ...users.map((u) => ({ value: u.id, label: u.display_name || u.handle }))];

  root.innerHTML = sectionHead(
    'Risultati & Qualifiche',
    `${flagEmoji(race.country_code)} ${race.name} · R${race.round} — ${race.circuit_name}`,
    `${raceSelect()}<a class="btn ghost sm" href="/race.html?id=${race.id}" target="_blank">Anteprima ↗</a>`
  ) + `
    <div class="tabs">
      <button class="tab active" data-tab="res">Risultati gara</button>
      <button class="tab" data-tab="qua">Qualifiche</button>
      <button class="tab" data-tab="ext">Cronaca / MVP / Media</button>
    </div>

    <!-- RISULTATI -->
    <section id="tab-res">
      <div class="hint" style="margin-bottom:12px">Spunta i piloti in gara. I punti sono calcolati automaticamente (posizione + giro veloce). Per un DNF, spunta DNF e scrivi il motivo nelle note. Sotto ogni pilota puoi indicare se ha corso il <strong>bot di riserva</strong> al posto del titolare: i punti restano comunque assegnati al titolare.</div>
      <div class="table-wrap">
        <table class="data compact">
          <thead><tr>
            <th>In gara</th><th>Pilota</th><th>Grid</th><th>Pos</th><th>Gap</th>
            <th>Pole</th><th>GV</th><th>DNF</th><th>Sorp.</th><th>Pen.(s)</th><th>Note</th>
          </tr></thead>
          <tbody id="results-body">${users.map(resultRowInput).join('')}</tbody>
        </table>
      </div>
      <div class="flex items-center gap-3 wrap" style="margin-top:16px">
        <label class="checkbox"><input type="checkbox" id="mark-completed" ${race.status === 'completed' ? 'checked' : ''}> Segna la gara come <strong>conclusa</strong></label>
        <button class="btn primary" id="save-results" style="margin-left:auto">Salva risultati & aggiorna classifiche</button>
      </div>
    </section>

    <!-- QUALIFICHE -->
    <section id="tab-qua" class="hidden">
      <div class="hint" style="margin-bottom:12px">Griglia di qualifica: posizione, miglior tempo e distacco.</div>
      <div class="table-wrap">
        <table class="data compact">
          <thead><tr><th>Presente</th><th>Pilota</th><th>Pos</th><th>Miglior tempo</th><th>Gap</th></tr></thead>
          <tbody id="quali-body">${users.map(qualiRowInput).join('')}</tbody>
        </table>
      </div>
      <div class="flex" style="margin-top:16px"><button class="btn primary" id="save-quali" style="margin-left:auto">Salva qualifiche</button></div>
    </section>

    <!-- EXTRA -->
    <section id="tab-ext" class="hidden">
      <div class="grid grid-2" style="align-items:start">
        <div class="card">
          <div class="field">
            <label>MVP della gara</label>
            <select class="select" id="mvp-select">
              ${mvpOpts.map((o) => `<option value="${o.value}" ${String(o.value) === String(race.mvp_user_id ?? '') ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Cronaca / commento</label>
            <textarea class="textarea" id="race-comment" rows="6" placeholder="Il racconto del Gran Premio…">${esc(race.comment || '')}</textarea>
          </div>
          <button class="btn primary" id="save-extra">Salva cronaca & MVP</button>
        </div>
        <div class="card">
          <label class="field" style="display:block"><span class="field-label">Screenshot risultati</span></label>
          ${race.screenshot ? `<img src="${esc(race.screenshot)}" style="width:100%;border-radius:var(--r-md);margin-bottom:12px">` : '<div class="empty" style="padding:30px">Nessuno screenshot.</div>'}
          <label class="btn outline sm block" style="cursor:pointer">
            Carica screenshot<input type="file" id="ss-input" accept="image/*" hidden>
          </label>
          <div class="hint" style="margin-top:8px">Immagine della classifica/risultati dal gioco.</div>
        </div>
      </div>
    </section>
  `;

  bindEditor(root);
}

function bindEditor(root) {
  // Tabs
  const map = { res: '#tab-res', qua: '#tab-qua', ext: '#tab-ext' };
  $$('.tab', root).forEach((t) => t.addEventListener('click', () => {
    $$('.tab', root).forEach((x) => x.classList.toggle('active', x === t));
    Object.entries(map).forEach(([k, sel]) => $(sel, root).classList.toggle('hidden', k !== t.dataset.tab));
  }));

  // Cambio gara
  $('#race-picker', root).addEventListener('change', (e) => loadRace(root, Number(e.target.value)));

  // Salva risultati
  $('#save-results', root).addEventListener('click', async (e) => {
    const rows = collectResults();
    if (!rows.length) { toast.warning('Seleziona almeno un pilota in gara.'); return; }
    const btn = e.currentTarget;
    btn.disabled = true; btn.innerHTML = '<span class="spinner sm"></span> Salvataggio…';
    try {
      await api.put(`/races/${race.id}/results`, {
        results: rows,
        mark_completed: $('#mark-completed', root).checked,
      });
      toast.success('Risultati salvati. Classifiche aggiornate!', { title: 'Fatto' });
      await loadRace(root, race.id);
    } catch (err) {
      toast.error(err.message || 'Salvataggio fallito.');
      btn.disabled = false; btn.textContent = 'Salva risultati & aggiorna classifiche';
    }
  });

  // Salva qualifiche
  $('#save-quali', root).addEventListener('click', async (e) => {
    const rows = collectQualifying();
    const btn = e.currentTarget;
    btn.disabled = true; btn.innerHTML = '<span class="spinner sm"></span> Salvataggio…';
    try {
      await api.put(`/races/${race.id}/qualifying`, { qualifying: rows });
      toast.success('Qualifiche salvate.');
      await loadRace(root, race.id);
    } catch (err) {
      toast.error(err.message);
      btn.disabled = false; btn.textContent = 'Salva qualifiche';
    }
  });

  // Salva cronaca/MVP
  $('#save-extra', root).addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true; btn.innerHTML = '<span class="spinner sm"></span> Salvataggio…';
    try {
      await api.put(`/races/${race.id}`, {
        comment: $('#race-comment', root).value,
        mvp_user_id: $('#mvp-select', root).value ? Number($('#mvp-select', root).value) : null,
      });
      toast.success('Cronaca e MVP salvati.');
      await loadRace(root, race.id);
    } catch (err) {
      toast.error(err.message);
      btn.disabled = false; btn.textContent = 'Salva cronaca & MVP';
    }
  });

  // Upload screenshot
  $('#ss-input', root).addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('screenshot', file);
    try {
      await api.upload(`/races/${race.id}/screenshot`, fd);
      toast.success('Screenshot caricato.');
      await loadRace(root, race.id);
    } catch (err) { toast.error(err.message); }
  });
}

async function loadRace(root, id) {
  // Aggiorna l'hash senza far ripartire il router (evita doppio render)
  history.replaceState(null, '', `#results?race=${id}`);
  race = await api.get(`/races/${id}`, {}, { auth: false });
  renderEditor(root);
}

async function render(root) {
  if (!state.season) { root.innerHTML = empty('📅', 'Crea prima una stagione e una gara.'); return; }
  races = await api.get('/races', { season_id: state.season.id });
  if (!races.length) { root.innerHTML = sectionHead('Risultati & Qualifiche', 'Nessuna gara') + empty('🏁', 'Crea prima una gara nel calendario.'); return; }

  // Gara da hash ?race=, altrimenti prima non conclusa, altrimenti l'ultima
  const hashRace = Number((location.hash.split('?')[1] || '').replace('race=', ''));
  const target = races.find((r) => r.id === hashRace)
    || races.find((r) => r.status !== 'completed')
    || races[races.length - 1];
  race = await api.get(`/races/${target.id}`, {}, { auth: false });
  renderEditor(root);
}

export default { render };
