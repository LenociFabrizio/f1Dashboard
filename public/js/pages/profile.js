/* =============================================================
   profile.js — Modifica del proprio profilo + upload avatar
   ============================================================= */
import api from '../core/api.js';
import auth, { guard } from '../core/auth.js';
import { mountChrome, avatarUrl } from '../core/components.js';
import { $, esc, loader, toast, modal, confirmDialog, wireAssists, lightbox } from '../core/ui.js';
import { cropAvatar } from '../core/avatar-crop.js';

const form = $('#profile-form');
const saveBtn = $('#save-btn');
let me;

/** Aggiorna lo stato attivo dei controlli segmentati dagli input nascosti. */
function syncAssists() {
  form.querySelectorAll('.segmented[data-assist]').forEach((grp) => {
    const val = form.elements[grp.dataset.assist]?.value;
    grp.querySelectorAll('button[data-val]').forEach((b) =>
      b.classList.toggle('active', b.dataset.val === String(val)));
  });
}

function fillForm(u) {
  form.first_name.value = u.first_name || '';
  form.last_name.value = u.last_name || '';
  if (form.username) form.username.value = u.username || '';
  form.email.value = u.email || '';
  // Aiuti alla guida
  form.elements.assist_abs.value = String(u.assist_abs ? 1 : 0);
  form.elements.assist_tc.value = ['off', 'medium', 'full'].includes(u.assist_tc) ? u.assist_tc : 'off';
  form.elements.assist_gearbox.value = u.assist_gearbox === 'manual' ? 'manual' : 'auto';
  syncAssists();
  $('#avatar-preview').src = avatarUrl(u);
  $('#pv-name').textContent = u.display_name || u.username;
  $('#pv-team').textContent = u.team_name || 'Nessun team';
}

async function loadTeams(selectedId) {
  try {
    const teams = await api.get('/teams', {}, { auth: false });
    $('#team-select').innerHTML =
      '<option value="">— Nessun team —</option>' +
      teams.map((t) => `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  } catch { /* team opzionale */ }
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

function renderHandles(list) {
  const box = $('#handles-list');
  if (!box) return;
  if (!list.length) {
    box.innerHTML = '<div class="hint">Nessun handle ancora. Aggiungine uno qui sotto.</div>';
    return;
  }
  box.innerHTML = list
    .map(
      (h) => `
      <div class="flex items-center justify-between gap-3" style="padding:8px 12px;border:1px solid var(--border,#333);border-radius:8px;margin-bottom:8px">
        <div><span class="text-hi" style="font-weight:700">${esc(h.handle)}</span>
          <span class="text-lo" style="font-size:.85rem"> · ${esc(PLATFORM_LABEL[h.platform] || h.platform || 'Qualsiasi')}${h.source === 'alias' ? ' · rilevato in gara' : ''}</span></div>
        <button class="btn ghost sm" data-del-handle="${h.id}" title="Rimuovi">✕</button>
      </div>`
    )
    .join('');
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

/* ---- Salvataggio profilo ---- */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="spinner sm"></span> Salvataggio…';
  const payload = {
    first_name: form.first_name.value.trim(),
    last_name: form.last_name.value.trim(),
    email: form.email.value.trim(),
    team_id: form.team_id.value ? Number(form.team_id.value) : null,
  };
  if (form.username) payload.username = form.username.value.trim();
  payload.assist_abs = Number(form.elements.assist_abs.value) ? 1 : 0;
  payload.assist_tc = form.elements.assist_tc.value || 'off';
  payload.assist_gearbox = form.elements.assist_gearbox.value || 'auto';
  try {
    const updated = await api.put('/users/me', payload);
    auth.user = { ...auth.user, ...updated };
    me = { ...me, ...updated };
    // Ricarica il nome del team per l'anteprima
    const teamOpt = $('#team-select').selectedOptions[0];
    me.team_name = teamOpt && teamOpt.value ? teamOpt.textContent : null;
    fillForm(me);
    toast.success('Profilo aggiornato!', { title: 'Salvato' });
  } catch (err) {
    toast.error(err.message || 'Salvataggio fallito.');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Salva modifiche';
  }
});

(async function init() {
  const user = await guard();
  if (!user) return;
  mountChrome();
  try {
    me = await api.get(`/users/${user.id}`, {}, { auth: false });
    fillForm(me);
    wireAssists(form); // collega i controlli segmentati agli input nascosti
    await loadTeams(me.team_id);
    await loadHandles();
  } catch (e) {
    console.error(e);
    toast.error(e.message);
  } finally {
    loader.hide();
  }
})();
