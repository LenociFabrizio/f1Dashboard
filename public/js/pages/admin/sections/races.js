/* =============================================================
   admin/sections/races.js — CRUD calendario gare
   ============================================================= */
import api from '../../../core/api.js';
import { $, esc, toast, confirmDialog, fmtDate, flagEmoji } from '../../../core/ui.js';
import { state, loadRefs, sectionHead, formModal, opts, empty } from '../shared.js';

/** Converte una data ISO in valore per <input type="datetime-local">. */
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fields() {
  // Nome, meteo e distanza non sono richiesti: il nome del GP viene
  // impostato automaticamente dal tracciato selezionato.
  return [
    { name: 'round', label: 'Round', type: 'number', required: true, min: 1 },
    { name: 'circuit_id', label: 'Circuito', type: 'select', required: true, options: opts.circuits() },
    { name: 'race_date', label: 'Data e ora', type: 'datetime-local' },
    { name: 'distance_pct', label: 'Distanza gara (%)', type: 'select', options: [
      { value: '', label: 'Personalizzata (giri manuali)' },
      { value: '25', label: '25%' },
      { value: '35', label: '35%' },
      { value: '50', label: '50%' },
      { value: '100', label: '100% (gara piena)' },
    ], hint: 'Scegli una percentuale per calcolare i giri dal tracciato' },
    { name: 'laps', label: 'Giri', type: 'number', min: 1, hint: 'Impostati dalla % o modificabili a mano' },
    { name: 'status', label: 'Stato', type: 'select', options: [
      { value: 'scheduled', label: 'In programma' }, { value: 'completed', label: 'Conclusa' },
    ] },
  ];
}

/** Collega la % distanza ai giri: laps = round(giri_pieni_tracciato * % / 100). */
function wireLapPercent(form) {
  const circuitSel = form.querySelector('[name="circuit_id"]');
  const pctSel = form.querySelector('[name="distance_pct"]');
  const lapsInput = form.querySelector('[name="laps"]');
  if (!circuitSel || !pctSel || !lapsInput) return;
  const fullLaps = () => {
    const c = state.circuits.find((x) => x.id === Number(circuitSel.value));
    return c && c.laps_default ? Number(c.laps_default) : null;
  };
  const apply = () => {
    const pct = Number(pctSel.value), full = fullLaps();
    if (pct && full) lapsInput.value = Math.max(1, Math.round((full * pct) / 100));
  };
  // Preseleziona la % se i giri attuali corrispondono a una percentuale nota.
  const full = fullLaps(), cur = Number(lapsInput.value);
  if (full && cur && !pctSel.value) {
    const match = ['100', '50', '35', '25'].find((p) => Math.round((full * Number(p)) / 100) === cur);
    if (match) pctSel.value = match;
  }
  pctSel.addEventListener('change', apply);
  circuitSel.addEventListener('change', () => { if (Number(pctSel.value)) apply(); });
}

/** Nome GP derivato dal tracciato selezionato. */
function raceNameFromCircuit(circuitId) {
  const c = state.circuits.find((x) => x.id === Number(circuitId));
  return c ? c.name : 'Gran Premio';
}

function row(r) {
  return `
    <tr>
      <td class="num text-lo">${r.round}</td>
      <td>${flagEmoji(r.country_code)} <span class="text-hi" style="font-weight:700">${esc(r.name)}</span></td>
      <td class="text-lo">${esc(r.circuit_name)}</td>
      <td class="text-lo">${fmtDate(r.race_date)}</td>
      <td>${r.status === 'completed' ? '<span class="badge green">Conclusa</span>' : '<span class="badge gray">Programma</span>'}</td>
      <td style="text-align:right;white-space:nowrap">
        <a class="btn ghost sm" href="#results?race=${r.id}">Risultati</a>
        <button class="btn ghost sm" data-edit="${r.id}">Modifica</button>
        ${r.status === 'completed' ? `<button class="btn ghost sm" data-clear="${r.id}" style="color:var(--warning,#e0955e)">Svuota</button>` : ''}
        <button class="btn ghost sm" data-del="${r.id}" style="color:var(--danger)">Elimina</button>
      </td>
    </tr>`;
}

async function render(root) {
  if (!state.season) { root.innerHTML = empty('📅', 'Crea prima una stagione.'); return; }
  const seasonSelect = `
    <select class="select" id="season-switch" style="min-width:200px">
      ${opts.seasons().map((o) => `<option value="${o.value}" ${o.value === state.season.id ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
    </select>`;

  const races = await api.get('/races', { season_id: state.season.id });
  root.innerHTML = sectionHead('Gare / Calendario', `${races.length} gare in ${state.season.name}`,
    `${seasonSelect}<button class="btn primary sm" id="new-race">+ Nuova gara</button>`) +
    (races.length ? `
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Round</th><th>Gran Premio</th><th>Circuito</th><th>Data</th><th>Stato</th><th></th></tr></thead>
          <tbody>${races.map(row).join('')}</tbody>
        </table>
      </div>` : empty('🏁', 'Nessuna gara. Aggiungi la prima del calendario.'));

  $('#season-switch', root).addEventListener('change', (e) => {
    state.season = state.seasons.find((s) => s.id === Number(e.target.value));
    render(root);
  });

  if (!state.circuits.length) {
    root.querySelector('#new-race').addEventListener('click', () =>
      toast.warning('Aggiungi prima almeno un circuito.'));
  } else {
    root.querySelector('#new-race').addEventListener('click', async () => {
      const nextRound = races.length ? Math.max(...races.map((r) => r.round)) + 1 : 1;
      const ok = await formModal({
        title: 'Nuova gara', fields: fields(),
        values: { round: nextRound, status: 'scheduled' },
        onRender: (form) => wireLapPercent(form),
        onSubmit: (v) => {
          delete v.distance_pct; // solo ausilio UI per calcolare i giri
          return api.post('/races', {
            ...v,
            season_id: state.season.id,
            name: raceNameFromCircuit(v.circuit_id), // nome = tracciato scelto
          });
        },
      });
      if (ok) { toast.success('Gara creata.'); render(root); }
    });
  }

  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => {
    const r = races.find((x) => x.id === Number(b.dataset.edit));
    const ok = await formModal({
      title: `Modifica: ${r.name}`, fields: fields(),
      values: { ...r, race_date: toLocalInput(r.race_date) },
      onRender: (form) => wireLapPercent(form),
      // Riallinea il nome al tracciato (eventualmente cambiato).
      onSubmit: (v) => {
        delete v.distance_pct; // solo ausilio UI per calcolare i giri
        return api.put(`/races/${r.id}`, { ...v, name: raceNameFromCircuit(v.circuit_id) });
      },
    });
    if (ok) { toast.success('Gara aggiornata.'); render(root); }
  }));

  root.querySelectorAll('[data-clear]').forEach((b) => b.addEventListener('click', async () => {
    const r = races.find((x) => x.id === Number(b.dataset.clear));
    if (!(await confirmDialog({
      title: 'Svuotare i dati della gara?',
      message: `Risultati, qualifiche, tempi sul giro e traiettorie di "${r.name}" verranno rimossi e la gara tornerà "in programma". Il GP resta nel calendario. Operazione irreversibile.`,
      danger: true, confirmText: 'Svuota dati',
    }))) return;
    try { await api.post(`/races/${r.id}/clear`); toast.success('Dati della gara svuotati.'); render(root); }
    catch (e) { toast.error(e.message); }
  }));

  root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const r = races.find((x) => x.id === Number(b.dataset.del));
    if (!(await confirmDialog({ title: 'Eliminare la gara?', message: `"${r.name}" e i suoi risultati verranno rimossi.`, danger: true, confirmText: 'Elimina' }))) return;
    try { await api.del(`/races/${r.id}`); toast.success('Gara eliminata.'); render(root); }
    catch (e) { toast.error(e.message); }
  }));
}

export default { render };
