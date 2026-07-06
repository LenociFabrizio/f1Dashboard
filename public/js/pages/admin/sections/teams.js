/* =============================================================
   admin/sections/teams.js — CRUD team / costruttori
   ============================================================= */
import api from '../../../core/api.js';
import { esc, toast, confirmDialog } from '../../../core/ui.js';
import { state, loadRefs, sectionHead, formModal, empty } from '../shared.js';

const FIELDS = [
  { name: 'name', label: 'Nome', required: true, placeholder: 'Es. Scuderia Rossa' },
  { name: 'full_name', label: 'Nome completo', placeholder: 'Es. Scuderia Rossa F1 Team' },
  { name: 'color', label: 'Colore (hex)', type: 'color', value: '#e10600' },
  { name: 'base', label: 'Base', placeholder: 'Maranello, Italia' },
  { name: 'power_unit', label: 'Power Unit', placeholder: 'Ferrari' },
];

function row(t) {
  return `
    <tr>
      <td><span class="team-tag"><span class="dot" style="background:${t.color || '#e10600'};height:20px"></span><strong class="text-hi">${esc(t.name)}</strong></span></td>
      <td class="text-lo">${esc(t.full_name || '—')}</td>
      <td class="text-lo">${esc(t.power_unit || '—')}</td>
      <td class="num">${(t.drivers || []).length}</td>
      <td style="text-align:right;white-space:nowrap">
        <button class="btn ghost sm" data-edit="${t.id}">Modifica</button>
        <button class="btn ghost sm" data-del="${t.id}" style="color:var(--danger)">Elimina</button>
      </td>
    </tr>`;
}

async function render(root) {
  const list = state.teams;
  root.innerHTML = sectionHead('Team', 'I costruttori del campionato.',
    '<button class="btn primary sm" id="new-team">+ Nuovo team</button>') +
    (list.length ? `
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Team</th><th>Nome completo</th><th>Power Unit</th><th class="num">Piloti</th><th></th></tr></thead>
          <tbody>${list.map(row).join('')}</tbody>
        </table>
      </div>` : empty('🏎️', 'Nessun team. Creane uno.'));

  root.querySelector('#new-team').addEventListener('click', async () => {
    const ok = await formModal({
      title: 'Nuovo team', fields: FIELDS, values: { color: '#e10600' },
      onSubmit: (v) => api.post('/teams', v),
    });
    if (ok) { toast.success('Team creato.'); await loadRefs(); render(root); }
  });

  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => {
    const t = list.find((x) => x.id === Number(b.dataset.edit));
    const ok = await formModal({
      title: 'Modifica team', fields: FIELDS, values: t,
      onSubmit: (v) => api.put(`/teams/${t.id}`, v),
    });
    if (ok) { toast.success('Team aggiornato.'); await loadRefs(); render(root); }
  }));

  root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const t = list.find((x) => x.id === Number(b.dataset.del));
    if (!(await confirmDialog({ title: 'Eliminare il team?', message: `"${t.name}" verrà disattivato.`, danger: true, confirmText: 'Elimina' }))) return;
    try { await api.del(`/teams/${t.id}`); toast.success('Team eliminato.'); await loadRefs(); render(root); }
    catch (e) { toast.error(e.message); }
  }));
}

export default { render };
