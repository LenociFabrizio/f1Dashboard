/* =============================================================
   router.js — Router hash della vista app (#/home, #/classifica…).
   Ad ogni cambio rotta: cleanup della vista precedente, render
   della nuova in un contenitore .mx-view, scroll in cima, focus
   sull'h1 e notifica al chrome (stato attivo).
   ============================================================= */
import { el, esc } from '../core/ui.js';
import { icon } from './icons.js';

export const DEFAULT_ROUTE = 'home';

/* Le sezioni dell'island entrano dall'alto, il resto dal basso. */
const FROM_TOP = new Set(['classifica', 'calendario']);

const reduceMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** '#/classifica?x=1' → 'classifica' */
export function parseHash(hash = location.hash) {
  const m = /^#\/?([a-z0-9-]*)/i.exec(hash || '');
  return (m && m[1] ? m[1] : '').toLowerCase();
}

/**
 * @param {object} opts
 * @param {Record<string, object>} opts.views   registro VIEWS
 * @param {HTMLElement} opts.outlet             contenitore delle viste
 * @param {(route:string) => object} opts.context  costruisce il ctx per la vista
 * @param {(route:string, prev:string|null) => void} [opts.onChange]
 */
export function createRouter({ views, outlet, context, onChange }) {
  let current = null;      // rotta attiva
  let cleanup = null;      // funzione restituita dal render corrente
  let token = 0;           // invalida i render asincroni superati
  let transition = null;   // view transition in corso
  let first = true;

  const known = (r) => Object.prototype.hasOwnProperty.call(views, r);

  function navigate(route) {
    const target = known(route) ? route : DEFAULT_ROUTE;
    if (target === current && parseHash() === target) return;
    location.hash = `#/${target}`; // → hashchange → render
  }

  function runCleanup() {
    const fn = cleanup;
    cleanup = null;
    if (typeof fn === 'function') {
      try { fn(); } catch (err) { console.error('[router] cleanup', err); }
    }
  }

  function errorState(section, route, err) {
    section.innerHTML = `
      <h1 class="mx-title">Qualcosa è andato storto</h1>
      <div class="mx-empty" role="alert">
        <span class="mx-empty-icon">${icon('alert', 28)}</span>
        <p class="mx-empty-title">Impossibile mostrare questa sezione</p>
        <p>${esc(err?.message || 'Errore inatteso.')}</p>
        <button type="button" class="mx-btn" data-mx-retry>${icon('refresh', 18)}<span>Riprova</span></button>
      </div>`;
    section.querySelector('[data-mx-retry]')?.addEventListener('click', () => render(route, { force: true }));
  }

  function focusTitle(section) {
    const h = section.querySelector('h1, .mx-title');
    if (!h) return;
    if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
    h.focus({ preventScroll: true });
  }

  /** Avvia il render della vista nel contenitore (non attende i dati). */
  function mount(section, route, myToken, focus) {
    const view = views[route];
    const ctx = context(route);
    let result;
    try {
      result = Promise.resolve(view.render(section, ctx));
    } catch (err) {
      result = Promise.reject(err);
    }
    result.then(
      (fn) => {
        if (myToken !== token) {
          // Navigazione superata mentre la vista caricava: pulizia immediata
          if (typeof fn === 'function') { try { fn(); } catch { /* ignora */ } }
          return;
        }
        cleanup = typeof fn === 'function' ? fn : null;
        if (focus) focusTitle(section);
      },
      (err) => {
        if (myToken !== token) return;
        console.error(`[router] render ${route}`, err);
        errorState(section, route, err);
        if (focus) focusTitle(section);
      }
    );
  }

  function render(route, { force = false } = {}) {
    if (!force && route === current) return;
    const prev = current;
    const myToken = ++token;
    const focus = !first;
    first = false;

    runCleanup();
    current = route;

    const view = views[route];
    document.title = `${view.title || 'App'} · Lega F1`;

    const section = el('section', {
      class: 'mx-view',
      'data-route': route,
      'data-enter': FROM_TOP.has(route) ? 'top' : 'bottom',
    });

    const swap = () => {
      if (myToken !== token) return; // superata da una navigazione più recente
      outlet.replaceChildren(section);
      window.scrollTo(0, 0);
      mount(section, route, myToken, focus);
    };

    onChange?.(route, prev);

    // View Transition solo come miglioramento: il CSS gestisce comunque l'entrata
    const canVT = typeof document.startViewTransition === 'function' && prev && !reduceMotion();
    if (canVT) {
      try { transition?.skipTransition(); } catch { /* ignora */ }
      try {
        transition = document.startViewTransition(swap);
        transition.finished.finally(() => { if (transition && myToken === token) transition = null; });
        return;
      } catch {
        transition = null; // fallback sotto
      }
    }
    swap();
  }

  function sync() {
    const route = parseHash();
    if (!known(route)) {
      // Rotta vuota o sconosciuta → home, senza aggiungere voci alla history
      history.replaceState(null, '', `${location.pathname}${location.search}#/${DEFAULT_ROUTE}`);
      render(DEFAULT_ROUTE);
      return;
    }
    render(route);
  }

  return {
    start() {
      if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
      window.addEventListener('hashchange', sync);
      sync();
    },
    stop() {
      window.removeEventListener('hashchange', sync);
      runCleanup();
      token++;
    },
    navigate,
    /** Ri-esegue il render della rotta corrente (es. dopo un refresh dati). */
    reload() { if (current) render(current, { force: true }); },
    get current() { return current; },
  };
}

export default createRouter;
