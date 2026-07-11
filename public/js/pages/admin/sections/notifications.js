/* =============================================================
   admin/sections/notifications.js — Centro notifiche admin
   Aggrega: richieste di cambio team/riserva (da approvare) e
   richieste di reset password. Campanella/badge aggiornati dopo
   ogni azione.
   ============================================================= */
import api from '../../../core/api.js';
import { esc, toast, confirmDialog, fmtDate } from '../../../core/ui.js';
import { updateBellBadge } from '../../../core/components.js';
import { refreshNotifBadge } from '../index.js';
import { loadRefs } from '../shared.js';

const resetLink = (token) => `${location.origin}/reset-password.html?token=${token}`;

/** Riallinea i badge (campanella navbar + voce sidebar). */
function bumpBadges() {
  updateBellBadge();
  refreshNotifBadge();
}

/* ---------- Richieste di cambio team / pilota di riserva ---------- */
function changeRow(cr) {
  const lines = [];
  if (cr.requested_team_id) {
    lines.push(`🏎️ Scuderia: <span class="text-lo">${esc(cr.current_team_name || '—')}</span> → <strong>${esc(cr.requested_team_name || '—')}</strong>`);
  }
  if (cr.requested_reserve) {
    lines.push(`🤖 Riserva: <span class="text-lo">${esc(cr.current_reserve || '—')}</span> → <strong>${esc(cr.requested_reserve)}</strong>`);
  }
  return `
    <div class="flex items-center justify-between gap-3" data-cr="${cr.id}"
         style="padding:12px;border:1px solid var(--border,#333);border-radius:8px;margin-bottom:8px;flex-wrap:wrap">
      <div style="min-width:220px">
        <div class="text-hi" style="font-weight:700">${esc(cr.display_name || '—')}
          ${cr.handle ? `<span class="text-lo" style="font-weight:400">@${esc(cr.handle)}</span>` : ''}</div>
        <div class="text-lo" style="font-size:.9rem;margin-top:4px">${lines.join(' · ')}</div>
        <div class="text-lo" style="font-size:.8rem;margin-top:2px">Richiesto il ${fmtDate(cr.created_at, { withTime: true })}</div>
      </div>
      <div class="flex items-center gap-2">
        <button class="btn primary sm" data-approve="${cr.id}">✓ Approva</button>
        <button class="btn ghost sm" data-reject="${cr.id}" style="color:var(--danger)">✕ Rifiuta</button>
      </div>
    </div>`;
}

function changePanel(list) {
  const rows = (list || []).map(changeRow).join('');
  return `
    <div class="card" style="margin-bottom:22px;padding:16px">
      <h3 style="margin:0 0 4px">🔄 Richieste di cambio team / riserva ${list && list.length ? `(${list.length})` : ''}</h3>
      <p class="hint" style="margin:0 0 14px">Approvando, il cambio viene applicato subito al pilota. Rifiutando, resta tutto invariato.</p>
      ${list && list.length ? rows : '<div class="hint">Nessuna richiesta in sospeso.</div>'}
    </div>`;
}

/* ---------- Richieste di reset password ---------- */
function resetPanel(list) {
  const rows = (list || []).map((r) => `
    <div class="flex items-center justify-between gap-3" data-req="${r.id}"
         style="padding:10px 12px;border:1px solid var(--border,#333);border-radius:8px;margin-bottom:8px;flex-wrap:wrap">
      <div style="min-width:200px">
        <div class="text-hi" style="font-weight:700">${esc(r.display_name || '—')}
          ${r.handle ? `<span class="text-lo" style="font-weight:400">@${esc(r.handle)}</span>` : ''}</div>
        <div class="text-lo" style="font-size:.82rem">${esc(r.email || '—')} · richiesto il ${fmtDate(r.created_at, { withTime: true })}</div>
      </div>
      <div class="flex items-center gap-2">
        <button class="btn primary sm" data-copy="${esc(r.token)}">📋 Copia link</button>
        <button class="btn ghost sm" data-done="${r.id}" title="Rimuovi richiesta">✓ Fatto</button>
      </div>
    </div>`).join('');
  return `
    <div class="card" style="padding:16px">
      <h3 style="margin:0 0 4px">🔑 Richieste di reset password ${list && list.length ? `(${list.length})` : ''}</h3>
      <p class="hint" style="margin:0 0 14px">Copia il link e invialo al pilota (WhatsApp/Discord). È valido 1 ora e usabile una sola volta. Dopo l'invio premi “Fatto”.</p>
      ${list && list.length ? rows : '<div class="hint">Nessuna richiesta in sospeso.</div>'}
    </div>`;
}

async function render(root) {
  let data = { changeRequests: [], resetRequests: [] };
  try { data = await api.get('/notifications'); } catch (e) { toast.error(e.message); }

  root.innerHTML =
    '<div class="flex justify-between items-center wrap gap-3" style="margin-bottom:24px">' +
      '<div><h1 style="margin:0;font-size:1.8rem">🔔 Notifiche</h1>' +
      '<p class="text-lo" style="margin:4px 0 0">Richieste dei piloti in attesa di gestione.</p></div></div>' +
    changePanel(data.changeRequests) +
    resetPanel(data.resetRequests);

  // -- Azioni: cambi team/riserva --
  root.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      await api.post(`/change-requests/${b.dataset.approve}/approve`, {});
      toast.success('Richiesta approvata: cambio applicato.');
      await loadRefs(); // il pilota ora ha team/riserva aggiornati
      bumpBadges();
      render(root);
    } catch (e) { toast.error(e.message); b.disabled = false; }
  }));
  root.querySelectorAll('[data-reject]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog({ title: 'Rifiutare la richiesta?', message: 'Il pilota manterrà i valori attuali.', confirmText: 'Rifiuta', danger: true }))) return;
    try {
      await api.post(`/change-requests/${b.dataset.reject}/reject`, {});
      toast.success('Richiesta rifiutata.');
      bumpBadges();
      render(root);
    } catch (e) { toast.error(e.message); }
  }));

  // -- Azioni: reset password --
  root.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    const link = resetLink(b.dataset.copy);
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copiato negli appunti.');
    } catch {
      window.prompt('Copia il link di reset:', link);
    }
  }));
  root.querySelectorAll('[data-done]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await api.del(`/users/reset-requests/${b.dataset.done}`);
      toast.success('Richiesta rimossa.');
      bumpBadges();
      render(root);
    } catch (e) { toast.error(e.message); }
  }));
}

export default { render };
