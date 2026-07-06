/* =============================================================
   admin/sections/users.js — Gestione piloti / utenti
   ============================================================= */
import api from '../../../core/api.js';
import { avatarUrl } from '../../../core/components.js';
import { esc, toast, confirmDialog } from '../../../core/ui.js';
import { state, loadRefs, sectionHead, formModal, opts, empty } from '../shared.js';

/**
 * Line-up reali stagione F1 2025 per scuderia (nome team = chiave, come nel seed).
 * Usati per il campo "Pilota di riserva (BOT)".
 */
const F1_2025_LINEUPS = {
  'Red Bull Racing': ['Max Verstappen', 'Liam Lawson'],
  'Ferrari': ['Charles Leclerc', 'Lewis Hamilton'],
  'Mercedes': ['George Russell', 'Andrea Kimi Antonelli'],
  'McLaren': ['Lando Norris', 'Oscar Piastri'],
  'Aston Martin': ['Fernando Alonso', 'Lance Stroll'],
  'Alpine': ['Pierre Gasly', 'Jack Doohan'],
  'Williams': ['Alexander Albon', 'Carlos Sainz'],
  'RB': ['Yuki Tsunoda', 'Isack Hadjar'],
  'Kick Sauber': ['Nico Hülkenberg', 'Gabriel Bortoleto'],
  'Haas': ['Esteban Ocon', 'Oliver Bearman'],
};

function driversForTeamId(teamId) {
  const team = state.teams.find((t) => t.id === Number(teamId));
  return (team && F1_2025_LINEUPS[team.name]) || [];
}

function commonFields(isNew) {
  return [
    ...(isNew ? [{ name: 'username', label: 'Username', required: true, placeholder: 'username' }] : []),
    { name: 'display_name', label: 'Nome visualizzato', placeholder: 'Nome pilota' },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'password', label: isNew ? 'Password' : 'Nuova password (opzionale)', type: 'password', hint: isNew ? 'Min 6 caratteri' : 'Lascia vuoto per non cambiarla' },
    { name: 'role', label: 'Ruolo', type: 'select', options: [{ value: 'pilota', label: 'Pilota' }, { value: 'admin', label: 'Admin' }] },
    { name: 'team_id', label: 'Team', type: 'select', options: opts.teams() },
    // Le opzioni vengono popolate dinamicamente in base al team (vedi onRender).
    { name: 'reserve_driver', label: 'Pilota di riserva (BOT)', type: 'select', options: [{ value: '', label: '— Nessuno —' }], hint: 'Piloti reali F1 2025 della scuderia selezionata', full: true },
  ];
}

/** Popola il menu "Pilota di riserva" in base al team selezionato nel form. */
function wireReserveDriver(form, currentValue) {
  const teamSel = form.querySelector('[name="team_id"]');
  const resSel = form.querySelector('[name="reserve_driver"]');
  if (!teamSel || !resSel) return;
  const fill = () => {
    const drivers = driversForTeamId(teamSel.value);
    resSel.innerHTML =
      '<option value="">— Nessuno —</option>' +
      drivers.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join('');
    if (currentValue && drivers.includes(currentValue)) resSel.value = currentValue;
  };
  fill();
  teamSel.addEventListener('change', fill);
}

function row(u) {
  return `
    <tr>
      <td>
        <div class="driver-cell">
          <img src="${avatarUrl(u)}" onerror="this.src='/images/avatars/default.svg'" alt="">
          <div>
            <div class="dc-name">${esc(u.display_name || u.username)}</div>
            <div class="dc-sub">@${esc(u.username)}${u.reserve_driver ? ` · 🤖 ${esc(u.reserve_driver)}` : ''}</div>
          </div>
        </div>
      </td>
      <td><span class="team-tag"><span class="dot" style="background:${u.team_color || '#555'}"></span>${esc(u.team_name || '—')}</span></td>
      <td><span class="role-pill ${u.role === 'admin' ? 'admin' : 'pilota'}">${u.role === 'admin' ? 'Admin' : 'Pilota'}</span></td>
      <td style="text-align:right;white-space:nowrap">
        <button class="btn ghost sm" data-edit="${u.id}">Modifica</button>
        <button class="btn ghost sm" data-del="${u.id}" style="color:var(--danger)">Disattiva</button>
      </td>
    </tr>`;
}

async function render(root) {
  const list = state.users;
  root.innerHTML = sectionHead('Piloti / Utenti', 'Crea account, assegna team e ruoli.',
    '<button class="btn primary sm" id="new-user">+ Nuovo pilota</button>') +
    (list.length ? `
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Pilota</th><th>Team</th><th>Ruolo</th><th></th></tr></thead>
          <tbody>${list.map(row).join('')}</tbody>
        </table>
      </div>` : empty('👤', 'Nessun utente.'));

  root.querySelector('#new-user').addEventListener('click', async () => {
    const ok = await formModal({
      title: 'Nuovo pilota', fields: commonFields(true), values: { role: 'pilota' },
      onRender: (form) => wireReserveDriver(form, ''),
      onSubmit: (v) => api.post('/users', v),
    });
    if (ok) { toast.success('Utente creato.'); await loadRefs(); render(root); }
  });

  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => {
    const summary = list.find((x) => x.id === Number(b.dataset.edit));
    // Carica il record COMPLETO (la lista non include email/team_id/reserve_driver):
    // senza questo, salvando si azzererebbero email e team.
    let u;
    try { u = await api.get(`/users/${summary.id}`, {}, { auth: false }); }
    catch { u = summary; }
    const ok = await formModal({
      title: `Modifica: ${u.display_name || u.username}`,
      fields: commonFields(false),
      values: { ...u, password: '' },
      onRender: (form) => wireReserveDriver(form, u.reserve_driver || ''),
      onSubmit: (v) => {
        const body = { ...v };
        if (!body.password) delete body.password;
        return api.put(`/users/${u.id}`, body);
      },
    });
    if (ok) { toast.success('Utente aggiornato.'); await loadRefs(); render(root); }
  }));

  root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const u = list.find((x) => x.id === Number(b.dataset.del));
    if (!(await confirmDialog({ title: 'Disattivare l\'utente?', message: `"${u.display_name || u.username}" non potrà più accedere.`, danger: true, confirmText: 'Disattiva' }))) return;
    try { await api.del(`/users/${u.id}`); toast.success('Utente disattivato.'); await loadRefs(); render(root); }
    catch (e) { toast.error(e.message); }
  }));
}

export default { render };
