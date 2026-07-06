/* =============================================================
   admin/sections/circuits.js — CRUD circuiti
   ============================================================= */
import api from '../../../core/api.js';
import { esc, toast, flagEmoji } from '../../../core/ui.js';
import { state, loadRefs, sectionHead, formModal, empty } from '../shared.js';

const FIELDS = [
  { name: 'name', label: 'Nome circuito', required: true, placeholder: 'Es. Monza' },
  { name: 'country', label: 'Paese', required: true, placeholder: 'Italia' },
  { name: 'country_code', label: 'Codice paese (ISO 2)', placeholder: 'IT', max: 2 },
  { name: 'city', label: 'Città', placeholder: 'Monza' },
  { name: 'length_km', label: 'Lunghezza (km)', type: 'number', step: '0.001', min: 0 },
  { name: 'laps_default', label: 'Giri di default', type: 'number', min: 1 },
];

function row(c) {
  return `
    <tr>
      <td>${flagEmoji(c.country_code)} <span class="text-hi" style="font-weight:700">${esc(c.name)}</span></td>
      <td>${esc(c.country || '—')}</td>
      <td>${esc(c.city || '—')}</td>
      <td class="num">${c.length_km ?? '—'}</td>
      <td class="num">${c.laps_default ?? '—'}</td>
      <td style="text-align:right"><button class="btn ghost sm" data-edit="${c.id}">Modifica</button></td>
    </tr>`;
}

async function render(root) {
  const list = state.circuits;
  root.innerHTML = sectionHead('Circuiti', 'Le piste disponibili per il calendario.',
    '<button class="btn primary sm" id="new-circuit">+ Nuovo circuito</button>') +
    (list.length ? `
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Circuito</th><th>Paese</th><th>Città</th><th class="num">Km</th><th class="num">Giri</th><th></th></tr></thead>
          <tbody>${list.map(row).join('')}</tbody>
        </table>
      </div>` : empty('📍', 'Nessun circuito. Aggiungine uno.'));

  root.querySelector('#new-circuit').addEventListener('click', async () => {
    const ok = await formModal({
      title: 'Nuovo circuito', fields: FIELDS, values: { country_code: 'IT' },
      onSubmit: (v) => api.post('/circuits', v),
    });
    if (ok) { toast.success('Circuito creato.'); await loadRefs(); render(root); }
  });

  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => {
    const c = list.find((x) => x.id === Number(b.dataset.edit));
    const ok = await formModal({
      title: 'Modifica circuito', fields: FIELDS, values: c,
      onSubmit: (v) => api.put(`/circuits/${c.id}`, v),
    });
    if (ok) { toast.success('Circuito aggiornato.'); await loadRefs(); render(root); }
  }));
}

export default { render };
