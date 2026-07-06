/* =============================================================
   admin/sections/seasons.js — CRUD stagioni + generazione calendario
   ============================================================= */
import api from '../../../core/api.js';
import { $, $$, esc, toast, modal, el } from '../../../core/ui.js';
import { state, loadRefs, sectionHead, formModal, empty } from '../shared.js';

// Campi per la MODIFICA (semplice)
const EDIT_FIELDS = [
  { name: 'name', label: 'Nome', required: true, placeholder: 'Es. Campionato 2025' },
  { name: 'year', label: 'Anno', type: 'number', required: true, min: 2020, max: 2099 },
  { name: 'game', label: 'Gioco', value: 'F1 25' },
  { name: 'description', label: 'Descrizione', type: 'textarea', full: true },
  { name: 'is_active', label: 'Attiva', type: 'checkbox', checkLabel: 'Imposta come stagione attiva', full: true },
];

function row(s) {
  return `
    <tr>
      <td class="text-hi" style="font-weight:700">${esc(s.name)}</td>
      <td class="num">${s.year}</td>
      <td>${esc(s.game || '—')}</td>
      <td>${s.is_active ? '<span class="badge green">Attiva</span>' : '<span class="badge gray">Archivio</span>'}</td>
      <td style="text-align:right;white-space:nowrap">
        <button class="btn ghost sm" data-edit="${s.id}">Modifica</button>
      </td>
    </tr>`;
}

/* ---- Modale di creazione con opzioni calendario ---- */
function openNewSeason(root) {
  const circuits = state.circuits;
  const checks = circuits.map((c) =>
    `<label class="checkbox"><input type="checkbox" value="${c.id}"> ${esc(c.name)} <span class="text-dim">(${c.laps_default ?? '—'} giri)</span></label>`
  ).join('');

  const content = `
    <div class="form-grid">
      <div class="field"><label>Nome *</label><input class="input" id="s-name" placeholder="Es. Campionato 2025"></div>
      <div class="field"><label>Anno *</label><input class="input" type="number" id="s-year" min="2020" max="2099" value="2025"></div>
      <div class="field"><label>Gioco</label><input class="input" id="s-game" value="F1 25"></div>
      <div class="field full"><label>Descrizione</label><textarea class="textarea" id="s-desc" rows="2"></textarea></div>
      <div class="field full"><label class="checkbox"><input type="checkbox" id="s-active" checked> Imposta come stagione attiva</label></div>
    </div>

    <div style="border-top:1px solid var(--border);margin:6px 0 16px"></div>
    <div class="section-title" style="font-size:1rem">Calendario</div>

    <div class="field">
      <label>Tracciati da includere</label>
      <select class="select" id="s-mode">
        <option value="all">Tutti i tracciati (${circuits.length})</option>
        <option value="random">Casuali</option>
        <option value="custom">Personalizzati</option>
      </select>
    </div>

    <div class="field" id="s-count-wrap" style="display:none">
      <label>Quanti tracciati (casuale)</label>
      <input class="input" type="number" id="s-count" min="1" max="${circuits.length}" placeholder="tutti (${circuits.length})">
    </div>

    <div class="field" id="s-custom-wrap" style="display:none">
      <label>Scegli i tracciati</label>
      <div id="s-custom" style="display:grid;grid-template-columns:1fr 1fr;gap:2px 16px;max-height:220px;overflow:auto;border:1px solid var(--border);border-radius:var(--r-sm);padding:10px">${checks || '<span class="text-lo">Nessun circuito. Aggiungine prima.</span>'}</div>
    </div>

    <div class="field">
      <label>Percentuale giri: <b id="s-pct-val" class="text-red">100%</b></label>
      <input type="range" id="s-pct" min="10" max="100" step="5" value="100" style="width:100%">
      <div class="hint">100% = giri reali 2025 di ogni pista. Riducendo la percentuale si riducono i giri di ogni gara in proporzione.</div>
    </div>
  `;

  const btn = el('button', { class: 'btn primary', text: 'Crea campionato' });
  const m = modal({ title: 'Nuova stagione', content, footer: [btn], size: 'lg' });
  const q = (sel) => m.body.querySelector(sel);

  // Mostra/nascondi campi in base alla modalità
  const modeSel = q('#s-mode');
  const sync = () => {
    q('#s-count-wrap').style.display = modeSel.value === 'random' ? '' : 'none';
    q('#s-custom-wrap').style.display = modeSel.value === 'custom' ? '' : 'none';
  };
  modeSel.addEventListener('change', sync);
  q('#s-pct').addEventListener('input', (e) => { q('#s-pct-val').textContent = `${e.target.value}%`; });

  btn.addEventListener('click', async () => {
    const name = q('#s-name').value.trim();
    const year = Number(q('#s-year').value);
    if (!name || !year) { toast.warning('Nome e anno sono obbligatori.'); return; }

    const mode = modeSel.value;
    const payload = {
      name,
      year,
      game: q('#s-game').value.trim() || 'F1 25',
      description: q('#s-desc').value.trim(),
      is_active: q('#s-active').checked ? 1 : 0,
      circuit_mode: mode,
      laps_percentage: Number(q('#s-pct').value),
    };
    if (mode === 'random') {
      const n = q('#s-count').value;
      if (n) payload.random_count = Number(n);
    }
    if (mode === 'custom') {
      const ids = $$('#s-custom input:checked', m.body).map((i) => Number(i.value));
      if (!ids.length) { toast.warning('Seleziona almeno un tracciato.'); return; }
      payload.circuit_ids = ids;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner sm"></span> Creazione…';
    try {
      const res = await api.post('/seasons', payload);
      m.close();
      toast.success(`Campionato creato con ${res.races_created} gare nel calendario.`, { title: 'Fatto' });
      await loadRefs();
      render(root);
    } catch (err) {
      toast.error(err.message || 'Creazione fallita.');
      btn.disabled = false;
      btn.textContent = 'Crea campionato';
    }
  });
}

async function render(root) {
  const list = state.seasons;
  root.innerHTML = sectionHead('Stagioni', 'Crea e gestisci i campionati. Solo una può essere attiva.',
    '<button class="btn primary sm" id="new-season">+ Nuova stagione</button>') +
    (list.length ? `
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Nome</th><th class="num">Anno</th><th>Gioco</th><th>Stato</th><th></th></tr></thead>
          <tbody>${list.map(row).join('')}</tbody>
        </table>
      </div>` : empty('📅', 'Nessuna stagione. Creane una per iniziare.'));

  $('#new-season', root).addEventListener('click', () => openNewSeason(root));

  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => {
    const s = list.find((x) => x.id === Number(b.dataset.edit));
    const ok = await formModal({
      title: 'Modifica stagione', fields: EDIT_FIELDS, values: s,
      onSubmit: (v) => api.put(`/seasons/${s.id}`, v),
    });
    if (ok) { toast.success('Stagione aggiornata.'); await loadRefs(); render(root); }
  }));
}

export default { render };
