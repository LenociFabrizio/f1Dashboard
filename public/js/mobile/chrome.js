/* =============================================================
   chrome.js — Cornice della vista app: Dynamic Island (in alto),
   bottom bar flottante e home indicator. Nessuna logica di dati:
   riceve la funzione navigate e aggiorna lo stato attivo.
   ============================================================= */
import { el } from '../core/ui.js';
import { avatarUrl } from '../core/components.js';
import { icon } from './icons.js';

const DEFAULT_AVATAR = '/images/avatars/default.svg';
const SWIPE_UP_PX = -24;

const reduceMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * Monta il chrome attorno al contenitore principale.
 * @param {object} opts
 * @param {HTMLElement} opts.main            <main> delle viste
 * @param {(route:string) => void} opts.navigate
 * @param {() => string|null} opts.current  rotta attiva
 * @param {object|null} opts.user            per l'avatar
 */
export function mountChrome({ main, navigate, current, user }) {
  /* ---------- Dynamic Island ---------- */
  const islandBtn = (route, label, ic) =>
    el('button', {
      type: 'button',
      class: 'mx-island-btn',
      'data-route': route,
      html: `${icon(ic, 18)}<span class="mx-island-label">${label}</span>`,
    });

  const island = el('nav', { class: 'mx-island', 'aria-label': 'Sezioni campionato' }, [
    islandBtn('classifica', 'Classifica', 'trophy'),
    el('span', { class: 'mx-island-sep', 'aria-hidden': 'true' }),
    islandBtn('calendario', 'Calendario', 'calendar'),
  ]);

  /* ---------- Bottom bar ---------- */
  const sideItem = (route, label, ic) =>
    el('a', {
      href: `#/${route}`,
      class: 'mx-bar-item',
      'data-route': route,
      html: `${icon(ic, 22)}<span class="mx-bar-label">${label}</span>`,
    });

  const avatar = el('img', {
    class: 'mx-bar-avatar',
    src: avatarUrl(user),
    alt: '',
    width: '56',
    height: '56',
    decoding: 'async',
  });
  // Fallback senza handler inline
  avatar.addEventListener('error', () => {
    if (!avatar.src.endsWith(DEFAULT_AVATAR)) avatar.src = DEFAULT_AVATAR;
  });

  const profile = el('a', {
    href: '#/profilo',
    class: 'mx-bar-profile',
    'data-route': 'profilo',
    'aria-label': 'Profilo',
  }, [el('span', { class: 'mx-bar-avatar-ring' }, [avatar])]);

  const bar = el('nav', { class: 'mx-bar', 'aria-label': 'Navigazione principale' }, [
    sideItem('statistiche', 'Statistiche', 'chart'),
    profile,
    sideItem('impostazioni', 'Impostazioni', 'gear'),
  ]);

  /* ---------- Home indicator ---------- */
  const indicator = el('button', {
    type: 'button',
    class: 'mx-home-indicator',
    'aria-label': 'Torna alla Home',
    html: '<span class="mx-home-indicator-pill" aria-hidden="true"></span>',
  });

  main.before(island);
  main.after(bar, indicator);

  /* ---------- Comportamento ---------- */
  const goTo = (route) => {
    if (current() === route) {
      // Tocco sulla sezione già attiva: torna in cima, come le tab bar iOS
      window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
      return;
    }
    navigate(route);
  };

  // Micro-espansione dell'island al tocco (riavviabile)
  const pulse = () => {
    if (reduceMotion()) return;
    island.classList.remove('is-pulse');
    void island.offsetWidth; // reflow per riavviare l'animazione
    island.classList.add('is-pulse');
  };
  island.addEventListener('animationend', () => island.classList.remove('is-pulse'));

  island.addEventListener('click', (e) => {
    const btn = e.target.closest('.mx-island-btn');
    if (!btn) return;
    pulse();
    goTo(btn.dataset.route);
  });

  bar.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-route]');
    if (!a) return;
    e.preventDefault();
    goTo(a.dataset.route);
  });

  // Home indicator: tocco/tastiera (click) oppure swipe verso l'alto
  let startY = null;
  let swiped = false;
  const goHome = () => { if (current() !== 'home') navigate('home'); };

  indicator.addEventListener('pointerdown', (e) => {
    startY = e.clientY;
    swiped = false;
    try { indicator.setPointerCapture(e.pointerId); } catch { /* ignora */ }
  });
  indicator.addEventListener('pointerup', (e) => {
    if (startY === null) return;
    const dy = e.clientY - startY;
    startY = null;
    if (dy < SWIPE_UP_PX) {
      swiped = true;
      setTimeout(() => { swiped = false; }, 400); // il click potrebbe non arrivare
      goHome();
    }
  });
  indicator.addEventListener('pointercancel', () => { startY = null; });
  indicator.addEventListener('click', () => {
    if (swiped) { swiped = false; return; } // già gestito dallo swipe
    goHome();
  });

  /* ---------- API ---------- */
  const routed = [...island.querySelectorAll('[data-route]'), ...bar.querySelectorAll('[data-route]')];

  function setActive(route) {
    for (const node of routed) {
      const on = node.dataset.route === route;
      node.classList.toggle('active', on);
      if (on) node.setAttribute('aria-current', 'page');
      else node.removeAttribute('aria-current');
    }
    const atHome = route === 'home';
    indicator.classList.toggle('is-home', atHome);
    if (atHome) indicator.setAttribute('aria-disabled', 'true');
    else indicator.removeAttribute('aria-disabled');
  }

  function setUser(u) {
    const src = avatarUrl(u);
    if (avatar.getAttribute('src') !== src) avatar.src = src;
  }

  return {
    setActive,
    setUser,
    destroy() { island.remove(); bar.remove(); indicator.remove(); },
  };
}

export default mountChrome;
