/* =============================================================
   register.js — Registrazione nuovo pilota con validazione
   ============================================================= */
import auth from '../core/auth.js';
import { $, $$, toast } from '../core/ui.js';

if (auth.isLogged()) location.href = '/dashboard.html';

const form = $('#register-form');
const submitBtn = $('#submit-btn');

function markInvalid(name, invalid) {
  const input = form.querySelector(`[name="${name}"]`);
  const field = input?.closest('.field');
  field?.classList.toggle('invalid', invalid);
}

function validate(fd) {
  let ok = true;
  const req = (name, cond) => { markInvalid(name, !cond); if (!cond) ok = false; };
  req('username', !!fd.get('username')?.trim());
  req('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fd.get('email') || ''));
  req('password', (fd.get('password') || '').length >= 6);
  req('password2', fd.get('password') === fd.get('password2'));
  return ok;
}

$$('#register-form input').forEach((inp) =>
  inp.addEventListener('input', () => inp.closest('.field')?.classList.remove('invalid'))
);

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
      display_name: fd.get('display_name')?.trim() || undefined,
      email: fd.get('email').trim(),
      password: fd.get('password'),
    });
    toast.success(`Benvenuto in pista, ${user.display_name || user.username}!`, { title: 'Account creato' });
    setTimeout(() => (location.href = '/profile.html'), 600);
  } catch (err) {
    toast.error(err.message || 'Registrazione fallita.', { title: 'Errore' });
    submitBtn.disabled = false;
    submitBtn.textContent = 'Crea account';
  }
});
