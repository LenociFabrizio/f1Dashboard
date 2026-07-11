/* =============================================================
   profile.js — Modifica del proprio profilo + upload avatar
   Sezioni separate: dati pilota, aiuti alla guida, squadra/riserva
   (con approvazione admin) e handle di gioco (nome pubblico @handle).
   ============================================================= */
import api from '../core/api.js';
import auth, { guard } from '../core/auth.js';
import { mountChrome, avatarUrl } from '../core/components.js';
import { $, esc, loader, toast, modal, confirmDialog, wireAssists, lightbox } from '../core/ui.js';
import { cropAvatar } from '../core/avatar-crop.js';
import { driversForTeamName } from '../core/f1data.js';

const form = $('#profile-form');
const saveBtn = $('#save-btn');
const assistsForm = $('#assists-form');
const teamForm = $('#team-form');
let me;
let teams = [];
let pendingChange = null; // richiesta di cambio in sospeso (o null)

function fillForm(u) {
  form.first_name.value = u.first_name || '';
  form.last_name.value = u.last_name || '';
  form.email.value = u.email || '';
  // Aiuti alla guida
  assistsForm.elements.assist_abs.value = String(u.assist_abs ? 1 : 0);
  assistsForm.elements.assist_tc.value = ['off', 'medium', 'full'].includes(u.assist_tc) ? u.assist_tc : 'off';
  assistsForm.elements.assist_gearbox.value = u.assist_gearbox === 'manual' ? 'manual' : 'auto';
  wireAssists(assistsForm);
  $('#avatar-preview').src = avatarUrl(u);
  $('#pv-name').textContent = u.display_name || '';
  $('#pv-handle').textContent = u.handle ? `@${u.handle}` : '';
  $('#pv-team').textContent = u.team_name || 'Nessun team';
}

/* ---- Squadra + pilota di riserva ---- */
function fillReserve(selected) {
  const teamId = Number(teamForm.team_id.value);
  const team = teams.find((t) => t.id === teamId);
  const drivers = team ? driversForTeamName(team.name) : [];
  const sel = teamForm.reserve_driver;
  sel.innerHTML =
    '<option value="">— Nessuno —</option>' +
    drivers.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join('');
  if (selected && drivers.includes(selected)) sel.value = selected;
}

async function loadTeams(selectedTeamId, selectedReserve) {
  try {
    teams = await api.get('/teams', {}, { auth: false });
    teamForm.team_id.innerHTML =
      '<option value="">— Nessun team —</option>' +
      teams.map((t) => `<option value="${t.id}" ${t.id === selectedTeamId ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
    fillReserve(selectedReserve);
  } catch { /* team opzionale */ }
}

teamForm.team_id.addEventListener('change', () => fillReserve(''));

/** Mostra/nasconde il banner della richiesta in sospeso. */
function renderChangeBanner() {
  const banner = $('#change-banner');
  if (!pendingChange) { banner.style.display = 'none'; return; }
  const parts = [];
  if (pendingChange.requested_team_id) parts.push(`Scuderia → <strong>${esc(pendingChange.requested_team_name || '—')}</strong>`);
  if (pendingChange.requested_reserve) parts.push(`Riserva → <strong>${esc(pendingChange.requested_reserve)}</strong>`);
  $('#change-detail').innerHTML = parts.join(' · ') || 'Nessun dettaglio';
  banner.style.display = '';
}

async function loadChangeRequest() {
  try {
    pendingChange = await api.get('/users/me/change-request');
  } catch { pendingChange = null; }
  renderChangeBanner();
}

/* ---- Upload avatar (con editor: zoom + spostamento) ---- */
$('#avatar-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = ''; // permette di riselezionare lo stesso file
  if (!file) return;
  if (!file.type.startsWith('image')) { toast.error('Seleziona un\'immagine.'); return; }
  if (file.size > 20 * 1024 * 1024) { toast.error('Immagine troppo grande (max 20MB).'); return; }

  let blob;
  try { blob = await cropAvatar(file); }
  catch { toast.error('Immagine non valida.'); return; }
  if (!blob) return; // annullato dall'utente

  const fd = new FormData();
  fd.append('avatar', blob, 'avatar.jpg');
  try {
    const { avatar } = await api.upload('/users/me/avatar', fd);
    $('#avatar-preview').src = avatar + '?t=' + Date.now();
    me.avatar = avatar;
    auth.user = { ...auth.user, avatar };
    toast.success('Avatar aggiornato!');
  } catch (err) {
    toast.error(err.message || 'Upload fallito.');
  }
});

/* ---- Zoom avatar (clic per ingrandire) ---- */
const avatarPreview = $('#avatar-preview');
avatarPreview.style.cursor = 'zoom-in';
avatarPreview.title = 'Clicca per ingrandire';
avatarPreview.addEventListener('click', () => {
  if (avatarPreview.src) lightbox(avatarPreview.src, { alt: 'Avatar' });
});

/* ---- Cambio password ---- */
$('#pwd-btn').addEventListener('click', () => {
  const content = `
    <div class="field"><label>Nuova password</label><input class="input" type="password" id="np1" minlength="6"></div>
    <div class="field"><label>Conferma password</label><input class="input" type="password" id="np2"></div>`;
  const btn = document.createElement('button');
  btn.className = 'btn primary';
  btn.textContent = 'Aggiorna password';
  const m = modal({ title: 'Cambia password', content, footer: [btn] });
  btn.addEventListener('click', async () => {
    const p1 = m.root.querySelector('#np1').value;
    const p2 = m.root.querySelector('#np2').value;
    if (p1.length < 6) { toast.warning('Minimo 6 caratteri.'); return; }
    if (p1 !== p2) { toast.error('Le password non coincidono.'); return; }
    try {
      await api.put('/users/me', { password: p1 });
      m.close();
      toast.success('Password aggiornata.');
    } catch (err) { toast.error(err.message); }
  });
});

/* ---- Handle di gioco F1 25 ---- */
const PLATFORM_LABEL = { steam: 'Steam', playstation: 'PlayStation', xbox: 'Xbox', origin: 'EA / Origin', '': 'Qualsiasi' };

/** Un solo handle per piattaforma: disabilita nel menu quelle già usate. */
function updatePlatformSelect(list) {
  const sel = $('#handle-platform');
  const btn = $('#add-handle-btn');
  if (!sel) return;
  const used = new Set((list || []).map((h) => h.platform || ''));
  let free = 0;
  [...sel.options].forEach((o) => {
    const taken = used.has(o.value);
    o.disabled = taken;
    o.textContent = (PLATFORM_LABEL[o.value] || o.value || 'Qualsiasi') + (taken ? ' — già aggiunta' : '');
    if (!taken) free++;
  });
  // Se l'opzione selezionata è ora disabilitata, passa alla prima libera.
  if (sel.selectedOptions[0]?.disabled) {
    const firstFree = [...sel.options].find((o) => !o.disabled);
    sel.value = firstFree ? firstFree.value : '';
  }
  if (btn) btn.disabled = free === 0;
}

function renderHandles(list) {
  const box = $('#handles-list');
  if (!box) return;
  updatePlatformSelect(list);
  // Aggiorna l'anteprima del nome pubblico con l'handle primario.
  const primary = (list || []).find((h) => h.is_primary);
  $('#pv-handle').textContent = primary ? `@${primary.handle}` : '';
  if (!list.length) {
    box.innerHTML = '<div class="hint">Nessun handle ancora. Aggiungine uno qui sotto.</div>';
    return;
  }
  box.innerHTML = list
    .map(
      (h) => `
      <div class="flex items-center justify-between gap-3" style="padding:8px 12px;border:1px solid var(--border,#333);border-radius:8px;margin-bottom:8px">
        <div><span class="text-hi" style="font-weight:700">${esc(h.handle)}</span>
          ${h.is_primary ? '<span class="role-pill admin" style="margin-left:6px;font-size:.7rem">pubblico</span>' : ''}
          <span class="text-lo" style="font-size:.85rem"> · ${esc(PLATFORM_LABEL[h.platform] || h.platform || 'Qualsiasi')}${h.source === 'alias' ? ' · rilevato in gara' : ''}</span></div>
        <div class="flex items-center gap-2">
          ${h.is_primary ? '' : `<button class="btn ghost sm" data-primary-handle="${h.id}" title="Usa come nome pubblico">★ Rendi pubblico</button>`}
          <button class="btn ghost sm" data-del-handle="${h.id}" title="Rimuovi">✕</button>
        </div>
      </div>`
    )
    .join('');
  box.querySelectorAll('[data-primary-handle]').forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        renderHandles(await api.put(`/users/me/handles/${b.dataset.primaryHandle}/primary`, {}));
        toast.success('Nome pubblico aggiornato.');
      } catch (err) { toast.error(err.message); }
    })
  );
  box.querySelectorAll('[data-del-handle]').forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        await api.del(`/users/me/handles/${b.dataset.delHandle}`);
        await loadHandles();
        toast.success('Handle rimosso.');
      } catch (err) { toast.error(err.message); }
    })
  );
}

async function loadHandles() {
  try {
    renderHandles(await api.get('/users/me/handles'));
  } catch { /* opzionale */ }
}

$('#add-handle-btn')?.addEventListener('click', async () => {
  const handle = $('#handle-input').value.trim();
  const platform = $('#handle-platform').value;
  if (!handle) { toast.warning('Inserisci un nickname.'); return; }
  try {
    renderHandles(await api.post('/users/me/handles', { handle, platform }));
    $('#handle-input').value = '';
    toast.success('Handle aggiunto.');
  } catch (err) { toast.error(err.message || 'Aggiunta fallita.'); }
});

/* ---- Elimina account ---- */
$('#delete-account-btn').addEventListener('click', async () => {
  const ok = await confirmDialog({
    title: 'Eliminare il tuo account?',
    message: 'Il tuo account e tutti i tuoi dati (risultati, qualifiche, statistiche) verranno rimossi definitivamente. Questa operazione è irreversibile.',
    danger: true,
    confirmText: 'Elimina il mio account',
  });
  if (!ok) return;
  try {
    await api.del('/users/me');
    toast.success('Account eliminato. Arrivederci!');
    auth.logout(false);
    setTimeout(() => (location.href = '/index.html'), 800);
  } catch (err) {
    toast.error(err.message || 'Eliminazione fallita.');
  }
});

/* ---- Salvataggio dati anagrafici ---- */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="spinner sm"></span> Salvataggio…';
  const payload = {
    first_name: form.first_name.value.trim(),
    last_name: form.last_name.value.trim(),
    email: form.email.value.trim(),
  };
  try {
    const updated = await api.put('/users/me', payload);
    auth.user = { ...auth.user, ...updated };
    me = { ...me, ...updated };
    fillForm(me);
    await loadHandles(); // riallinea l'anteprima @handle
    toast.success('Profilo aggiornato!', { title: 'Salvato' });
  } catch (err) {
    toast.error(err.message || 'Salvataggio fallito.');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Salva modifiche';
  }
});

/* ---- Salvataggio aiuti alla guida ---- */
assistsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#save-assists-btn');
  btn.disabled = true;
  const payload = {
    assist_abs: Number(assistsForm.elements.assist_abs.value) ? 1 : 0,
    assist_tc: assistsForm.elements.assist_tc.value || 'off',
    assist_gearbox: assistsForm.elements.assist_gearbox.value || 'auto',
  };
  try {
    const updated = await api.put('/users/me', payload);
    me = { ...me, ...updated };
    toast.success('Aiuti alla guida salvati.');
  } catch (err) {
    toast.error(err.message || 'Salvataggio fallito.');
  } finally {
    btn.disabled = false;
  }
});

/* ---- Richiesta cambio squadra / riserva ---- */
teamForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#request-change-btn');
  const teamId = teamForm.team_id.value ? Number(teamForm.team_id.value) : null;
  const reserve = teamForm.reserve_driver.value || '';
  btn.disabled = true;
  try {
    pendingChange = await api.post('/users/me/change-request', { team_id: teamId, reserve_driver: reserve });
    renderChangeBanner();
    toast.success('Richiesta inviata! Un amministratore la esaminerà.', { title: 'In attesa di approvazione' });
    // Ripristina i select ai valori ATTUALI (il cambio non è ancora applicato).
    teamForm.team_id.value = me.team_id || '';
    fillReserve(me.reserve_driver || '');
  } catch (err) {
    toast.error(err.message || 'Invio fallito.');
  } finally {
    btn.disabled = false;
  }
});

$('#cancel-change-btn').addEventListener('click', async () => {
  try {
    await api.del('/users/me/change-request');
    pendingChange = null;
    renderChangeBanner();
    toast.success('Richiesta annullata.');
  } catch (err) { toast.error(err.message); }
});

(async function init() {
  const user = await guard();
  if (!user) return;
  mountChrome();
  try {
    me = await api.get(`/users/${user.id}`, {}, { auth: false });
    fillForm(me);
    await loadTeams(me.team_id, me.reserve_driver);
    await loadHandles();
    await loadChangeRequest();
  } catch (e) {
    console.error(e);
    toast.error(e.message);
  } finally {
    loader.hide();
  }
})();
