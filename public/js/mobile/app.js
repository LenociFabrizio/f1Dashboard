/* =============================================================
   app.js — Bootstrap della vista app mobile (public/app.html).
   Sequenza: guardia di accesso → riepilogo /dashboard/mobile
   (con stato di errore e "Riprova") → chrome → router.
   ============================================================= */
import api from '../core/api.js';
import auth, { guard } from '../core/auth.js';
import { $, loader, esc } from '../core/ui.js';
import store from './store.js';
import { createRouter } from './router.js';
import { mountChrome } from './chrome.js';
import { icon } from './icons.js';
import VIEWS from './views/index.js';
import { LOGIN_URL, handleAuthError } from './session.js';

const main = $('#mx-main');

// Stessa chiave e stesso fetcher della Home: la cache (TTL 60s) è condivisa
const loadSummary = () => store.get('summary', () => api.get('/dashboard/mobile'));

/* Utente per il chrome: avatar aggiornato da auth (profilo) o dal riepilogo */
const chromeUser = (summary) => ({
  ...(summary?.me || {}),
  ...(auth.user || {}),
  avatar: auth.user?.avatar || summary?.me?.avatar || '',
});

function showError(err, retry) {
  const offline = err?.status === 0;
  main.innerHTML = `
    <section class="mx-view mx-view--solo" data-enter="bottom">
      <p class="mx-kicker">Lega F1</p>
      <h1 class="mx-title" tabindex="-1">Dati non disponibili</h1>
      <div class="mx-card mx-empty" role="alert">
        <span class="mx-empty-icon">${icon('alert', 28)}</span>
        <p class="mx-empty-title">${offline ? 'Sei offline o il server non risponde' : 'Non è stato possibile caricare il riepilogo'}</p>
        <p>${esc(err?.message || 'Errore inatteso.')}</p>
        <button type="button" class="mx-btn mx-btn--primary" data-mx-retry>${icon('refresh', 18)}<span>Riprova</span></button>
      </div>
    </section>`;
  const btn = main.querySelector('[data-mx-retry]');
  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.lastElementChild.textContent = 'Caricamento…';
    retry();
  });
  main.querySelector('.mx-title')?.focus({ preventScroll: true });
}

async function start() {
  let summary;
  try {
    summary = await loadSummary();
  } catch (err) {
    if (handleAuthError(err)) return;
    showError(err, () => { store.clear('summary'); start(); });
    loader.hide();
    return;
  }

  main.replaceChildren();

  let router = null;
  const navigate = (route) => router?.navigate(route);

  const chrome = mountChrome({
    main,
    navigate,
    current: () => router?.current ?? null,
    user: chromeUser(summary),
  });

  // A ogni cambio rotta il riepilogo viene richiesto di nuovo (dalla cache
  // finché valida): ctx.summary resta l'ultimo valore senza bloccare il render
  const refreshSummary = () => {
    loadSummary().then(
      (s) => { summary = s; chrome.setUser(chromeUser(summary)); },
      (err) => { if (!handleAuthError(err)) console.warn('[app] riepilogo', err); }
    );
  };

  router = createRouter({
    views: VIEWS,
    outlet: main,
    context: () => ({
      user: auth.user,
      summary,
      season: summary?.season ?? null,
      store,
      navigate,
    }),
    onChange: (route) => {
      chrome.setActive(route);
      chrome.setUser(chromeUser(summary)); // l'avatar può cambiare dal profilo
      refreshSummary();
    },
  });

  router.start();
  loader.hide();
}

async function boot() {
  // Il redirect lo facciamo noi: next sempre verso la app, senza hash
  if (!auth.isLogged()) { location.replace(LOGIN_URL); return; }
  const user = await guard();
  if (!user) return; // guard ha già reindirizzato
  await start();
}

boot().catch((err) => {
  console.error('[app] avvio', err);
  showError(err, () => location.reload());
  loader.hide();
});
