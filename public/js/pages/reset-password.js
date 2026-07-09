/* =============================================================
   reset-password.js — Imposta una nuova password dal link email
   ============================================================= */
import api from '../core/api.js';
import { $, toast, qs } from '../core/ui.js';

const form = $('#reset-form');
const submitBtn = $('#submit-btn');
const token = qs.get('token');

// Senza token il link non è valido: invita a richiederne uno nuovo.
if (!token) {
  toast.error('Link non valido: manca il token. Richiedi un nuovo reset dalla pagina di accesso.', {
    title: 'Reset password', duration: 7000,
  });
  submitBtn.disabled = true;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const p1 = form.password.value;
  const p2 = form.password2.value;
  if (p1.length < 6) { toast.warning('La password deve avere almeno 6 caratteri.'); return; }
  if (p1 !== p2) { toast.error('Le password non coincidono.'); return; }

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner sm"></span> Attendere…';
  try {
    const r = await api.post('/auth/reset-password', { token, password: p1 }, { auth: false });
    toast.success(r.message || 'Password reimpostata!', { title: 'Fatto' });
    setTimeout(() => (location.href = '/login.html'), 1200);
  } catch (err) {
    toast.error(err.message || 'Reset fallito.', { title: 'Errore' });
    submitBtn.disabled = false;
    submitBtn.textContent = 'Reimposta password';
  }
});
