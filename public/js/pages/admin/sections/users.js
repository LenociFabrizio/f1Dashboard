/* =============================================================
   admin/sections/users.js — Gestione piloti / utenti
   ============================================================= */
import api from '../../../core/api.js';
import { avatarUrl } from '../../../core/components.js';
import { esc, toast, confirmDialog, fmtDate } from '../../../core/ui.js';
import { state, loadRefs, sectionHead, formModal, opts, empty } from '../shared.js';
import { driversForTeamName } from '../../../core/f1data.js';

/* -------- Richieste di reset password (flusso senza email) -------- */
const resetLink = (token) => `${location.origin}/reset-password.html?token=${token}`;

function resetPanel(list) {
  const rows = (list || []).map((r) => `
    <div class="flex items-center justify-between gap-3" data-req="${r.id}"
         style="padding:10px 12px;border:1px solid var(--border,#333);border-radius:8px;margin-bottom:8px;flex-wrap:wrap">
      <div style="min-width:200px">
        <div class="text-hi" style="font-weight:700">${esc(r.display_name || r.username)}
          <span class="text-lo" style="font-weight:400">@${esc(r.username)}</span></div>
        <div class="text-lo" style="font-size:.82rem">${esc(r.email || '—')} · richiesto il ${fmtDate(r.created_at, { withTime: true })}</div>
      </div>
      <div class="flex items-center gap-2">
        <button class="btn primary sm" data-copy="${esc(r.token)}">📋 Copia link</button>
        <button class="btn ghost sm" data-done="${r.id}" title="Rimuovi richiesta">✓ Fatto</button>
      </div>
    </div>`).join('');
  return `
    <div class="card" style="margin-bottom:22px;padding:16px">
      <h3 style="margin:0 0 4px">🔑 Richieste di reset password ${list && list.length ? `(${list.length})` : ''}</h3>
      <p class="hint" style="margin:0 0 14px">Copia il link e invialo al pilota (WhatsApp/Discord). È valido 1 ora e usabile una sola volta. Dopo l'invio premi “Fatto”.</p>
      ${list && list.length ? rows : '<div class="hint">Nessuna richiesta in sospeso.</div>'}
    </div>`;
}

function wireResetPanel(root, rerender) {
  root.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    const link = resetLink(b.dataset.copy);
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copiato negli appunti.');
    } catch {
      // Clipboard non disponibile (es. contesto non sicuro): mostralo da copiare a mano.
      window.prompt('Copia il link di reset:', link);
    }
  }));
  root.querySelectorAll('[data-done]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await api.del(`/users/reset-requests/${b.dataset.done}`);
      toast.success('Richiesta rimossa.');
      rerender();
    } catch (e) { toast.error(e.message); }
  }));
}

function driversForTeamId(teamId) {
  const team = state.teams.find((t) => t.id === Number(teamId));
  return team ? driversForTeamName(team.name) : [];
}

function commonFields(isNew) {
  return [
    ...(isNew ? [{ name: 'username', label: 'Username', required: true, placeholder: 'username' }] : []),
    { name: 'first_name', label: 'Nome', placeholder: 'Mario' },
    { name: 'last_name', label: 'Cognome', placeholder: 'Rossi' },
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
        <button class="btn ghost sm" data-del="${u.id}" style="color:var(--danger)">Elimina</button>
      </td>
    </tr>`;
}

async function render(root) {
  const list = state.users;
  let resets = [];
  try { resets = await api.get('/users/reset-requests'); } catch { /* non bloccare la sezione */ }

  root.innerHTML = sectionHead('Piloti / Utenti', 'Crea account, assegna team e ruoli.',
    '<button class="btn primary sm" id="new-user">+ Nuovo pilota</button>') +
    resetPanel(resets) +
    (list.length ? `
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Pilota</th><th>Team</th><th>Ruolo</th><th></th></tr></thead>
          <tbody>${list.map(row).join('')}</tbody>
        </table>
      </div>` : empty('👤', 'Nessun utente.'));

  wireResetPanel(root, () => render(root));

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
    if (!(await confirmDialog({
      title: 'Eliminare l\'utente?',
      message: `"${u.display_name || u.username}" e TUTTI i suoi dati (risultati, qualifiche, statistiche) verranno rimossi definitivamente. Operazione irreversibile.`,
      danger: true, confirmText: 'Elimina definitivamente',
    }))) return;
    try { await api.del(`/users/${u.id}`); toast.success('Utente eliminato.'); await loadRefs(); render(root); }
    catch (e) { toast.error(e.message); }
  }));
}

export default { render };
