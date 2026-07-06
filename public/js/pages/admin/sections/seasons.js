/* =============================================================
   admin/sections/seasons.js — CRUD stagioni
   ============================================================= */
import api from '../../../core/api.js';
import { $$, esc, toast } from '../../../core/ui.js';
import { state, loadRefs, sectionHead, formModal, empty } from '../shared.js';

const FIELDS = [
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

  $$('#new-season', root).forEach((b) => b.addEventListener('click', async () => {
    const ok = await formModal({
      title: 'Nuova stagione', fields: FIELDS, values: { game: 'F1 25', is_active: 1 },
      onSubmit: (v) => api.post('/seasons', v),
    });
    if (ok) { toast.success('Stagione creata.'); await loadRefs(); render(root); }
  }));

  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => {
    const s = list.find((x) => x.id === Number(b.dataset.edit));
    const ok = await formModal({
      title: 'Modifica stagione', fields: FIELDS, values: s,
      onSubmit: (v) => api.put(`/seasons/${s.id}`, v),
    });
    if (ok) { toast.success('Stagione aggiornata.'); await loadRefs(); render(root); }
  }));
}

export default { render };
