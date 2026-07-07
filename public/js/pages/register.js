/* =============================================================
   register.js — Registrazione nuovo pilota con validazione
   ============================================================= */
import api from '../core/api.js';
import auth from '../core/auth.js';
import { $, $$, esc, toast } from '../core/ui.js';
import { driversForTeamName } from '../core/f1data.js';
import { compressImage } from '../core/media.js';

if (auth.isLogged()) location.href = '/dashboard.html';

const form = $('#register-form');
const submitBtn = $('#submit-btn');

/* ---- Avatar (opzionale): selezione + anteprima + compressione ---- */
let avatarFile = null; // File compresso pronto per l'upload post-registrazione
const avatarInput = $('#avatar-input');
const avatarPreview = $('#avatar-preview');
let previewUrl = null;

avatarInput.addEventListener('change', async () => {
  const file = avatarInput.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image')) { toast.error('Seleziona un\'immagine.'); avatarInput.value = ''; return; }
  try {
    avatarFile = await compressImage(file, { maxDim: 512, quality: 0.85 });
  } catch { avatarFile = file; }
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(avatarFile);
  avatarPreview.src = previewUrl;
});

/* ---- Scuderia + pilota di riserva (BOT) con controllo disponibilità ---- */
let teams = [];
let takenDrivers = new Set(); // BOT già assegnati ad altri utenti
const teamSelect = $('#team-select');
const reserveSelect = $('#reserve-select');

/** Ricarica dal server i BOT già occupati (controllo in tempo reale). */
async function refreshTaken() {
  try {
    const list = await api.get('/users/reserved', {}, { auth: false });
    takenDrivers = new Set(list);
  } catch { /* in caso di errore la verifica finale la fa il server */ }
}

function fillReserve() {
  const team = teams.find((t) => t.id === Number(teamSelect.value));
  const drivers = team ? driversForTeamName(team.name) : [];
  const current = reserveSelect.value;
  reserveSelect.innerHTML =
    '<option value="">— Scegli un pilota —</option>' +
    drivers.map((d) => {
      const occ = takenDrivers.has(d);
      return `<option value="${esc(d)}" ${occ ? 'disabled' : ''}>${esc(d)}${occ ? ' — occupato' : ''}</option>`;
    }).join('');
  reserveSelect.disabled = drivers.length === 0;
  if (current && drivers.includes(current) && !takenDrivers.has(current)) reserveSelect.value = current;
}

// Al cambio scuderia ricontrolla la disponibilità in tempo reale
teamSelect.addEventListener('change', async () => { await refreshTaken(); fillReserve(); });
// Aggiorna la disponibilità anche quando si apre il menu dei BOT
reserveSelect.addEventListener('focus', async () => { await refreshTaken(); fillReserve(); });

(async function loadTeams() {
  await refreshTaken();
  try {
    teams = await api.get('/teams', {}, { auth: false });
    teamSelect.innerHTML =
      '<option value="">— Scegli un team —</option>' +
      teams.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
    fillReserve();
  } catch { /* /teams non raggiungibile */ }
})();

function markInvalid(name, invalid) {
  const input = form.querySelector(`[name="${name}"]`);
  const field = input?.closest('.field');
  field?.classList.toggle('invalid', invalid);
}

function validate(fd) {
  let ok = true;
  const req = (name, cond) => { markInvalid(name, !cond); if (!cond) ok = false; };
  req('first_name', !!fd.get('first_name')?.trim());
  req('last_name', !!fd.get('last_name')?.trim());
  req('username', !!fd.get('username')?.trim());
  req('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fd.get('email') || ''));
  req('password', (fd.get('password') || '').length >= 6);
  req('password2', fd.get('password') === fd.get('password2'));
  req('team_id', !!fd.get('team_id'));
  req('reserve_driver', !!fd.get('reserve_driver'));
  return ok;
}

$$('#register-form input, #register-form select').forEach((inp) => {
  const clear = () => inp.closest('.field')?.classList.remove('invalid');
  inp.addEventListener('input', clear);
  inp.addEventListener('change', clear);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  if (!fd.get('terms')) { toast.warning('Devi accettare le regole della lega.'); return; }
  if (!validate(fd)) { toast.error('Controlla i campi evidenziati.'); return; }

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner sm"></span> Creazione…';
  try {
    const user = await auth.register({
      username: fd.get('username').trim(),
      first_name: fd.get('first_name').trim(),
      last_name: fd.get('last_name').trim(),
      email: fd.get('email').trim(),
      password: fd.get('password'),
      team_id: fd.get('team_id') ? Number(fd.get('team_id')) : undefined,
      reserve_driver: fd.get('reserve_driver') || undefined,
    });
    // Avatar (opzionale): ora l'utente è autenticato, carichiamo il file
    if (avatarFile) {
      submitBtn.innerHTML = '<span class="spinner sm"></span> Caricamento avatar…';
      try {
        const fd = new FormData();
        fd.append('avatar', avatarFile, avatarFile.name || 'avatar.jpg');
        const { avatar } = await api.upload('/users/me/avatar', fd);
        auth.user = { ...auth.user, avatar };
      } catch (e) {
        // La registrazione è comunque riuscita: non blocchiamo l'utente
        toast.warning('Account creato, ma l\'avatar non è stato caricato. Riprova dal profilo.');
      }
    }
    toast.success(`Benvenuto in pista, ${user.display_name || user.username}!`, { title: 'Account creato' });
    setTimeout(() => (location.href = '/profile.html'), 600);
  } catch (err) {
    toast.error(err.message || 'Registrazione fallita.', { title: 'Errore' });
    // Se il BOT è stato preso nel frattempo, aggiorna la disponibilità
    if (err.status === 409) { await refreshTaken(); fillReserve(); }
    submitBtn.disabled = false;
    submitBtn.textContent = 'Crea account';
  }
});
