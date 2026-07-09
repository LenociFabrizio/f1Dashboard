/* =============================================================
   login.js — Login classico (email/username) + reset mock
   ============================================================= */
import api from '../core/api.js';
import auth from '../core/auth.js';
import { $, toast, modal, el, qs } from '../core/ui.js';
import { mountCookieBanner } from '../core/cookies.js';

// Se già loggato → dashboard
if (auth.isLogged()) location.href = '/dashboard.html';

mountCookieBanner();

const nextUrl = () => {
  const n = qs.get('next');
  return n && n.startsWith('/') ? n : '/dashboard.html';
};

const form = $('#login-form');
const submitBtn = $('#submit-btn');

function setLoading(btn, loading, label) {
  btn.disabled = loading;
  btn.innerHTML = loading ? '<span class="spinner sm"></span> Attendere…' : label;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const identifier = fd.get('identifier')?.trim();
  const password = fd.get('password');
  if (!identifier || !password) { toast.warning('Compila tutti i campi.'); return; }

  setLoading(submitBtn, true, 'Accedi');
  try {
    const user = await auth.login(identifier, password);
    toast.success(`Bentornato, ${user.display_name || user.username}!`, { title: 'Accesso riuscito' });
    setTimeout(() => (location.href = nextUrl()), 500);
  } catch (err) {
    toast.error(err.message || 'Credenziali non valide.', { title: 'Accesso fallito' });
    setLoading(submitBtn, false, 'Accedi');
  }
});

/* ---- Password dimenticata ---- */
$('#forgot-link').addEventListener('click', (e) => {
  e.preventDefault();
  const input = el('input', { class: 'input', type: 'email', placeholder: 'La tua email', autocomplete: 'email' });
  const go = el('button', { class: 'btn btn-primary', text: 'Invia istruzioni' });
  const m = modal({
    title: 'Recupera password',
    content: el('div', {}, [
      el('p', { class: 'text-lo', text: 'Inserisci la tua email: ti invieremo un link per reimpostare la password.', style: 'margin-bottom:14px' }),
      el('div', { class: 'field' }, [input]),
    ]),
    footer: [go],
  });
  input.focus();
  go.addEventListener('click', async () => {
    const email = input.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.warning('Inserisci un\'email valida.'); return; }
    go.disabled = true;
    try {
      const r = await api.post('/auth/forgot-password', { email }, { auth: false });
      m.close();
      toast.info(r.message || 'Se l\'email è registrata, riceverai il link per il reset.', { title: 'Reset password', duration: 7000 });
      // In sviluppo, se l'invio email non è configurato, il server restituisce
      // il link diretto: lo apriamo così il flusso è testabile senza provider.
      if (r.dev_reset_url) {
        toast.warning('Email non configurata (dev): apro il link di reset.', { duration: 5000 });
        setTimeout(() => (location.href = r.dev_reset_url), 800);
      }
    } catch (err) {
      toast.error(err.message);
      go.disabled = false;
    }
  });
});
