/* =============================================================
   components.js — Componenti condivisi: navbar, footer, menu
   utente. Da montare in ogni pagina.
   ============================================================= */
import auth from './auth.js';
import { $, $$, el, esc } from './ui.js';
import { mountCookieBanner } from './cookies.js';

/** URL avatar con fallback al default. */
export function avatarUrl(user) {
  const a = (user && (user.avatar || user.avatar_url)) || '';
  return a && a.trim() ? a : '/images/avatars/default.svg';
}

/* Voci di navigazione principali */
const NAV = [
  { href: '/index.html', label: 'Home', match: ['/', '/index.html'] },
  { href: '/standings.html', label: 'Classifiche' },
  { href: '/races.html', label: 'Calendario' },
  { href: '/stats.html', label: 'Statistiche' },
  // Bacheca nascosta (non eliminata): voce di menu disattivata.
  // { href: '/feed.html', label: 'Bacheca' },
  { href: '/dashboard.html', label: 'Dashboard', auth: true },
];

function isActive(item) {
  const path = location.pathname;
  if (item.match) return item.match.includes(path);
  return path === item.href;
}

/**
 * Monta la navbar in #navbar-mount (o in cima al body).
 */
export function mountNavbar() {
  const user = auth.user;
  const logged = auth.isLogged();

  const links = NAV.filter((n) => !n.auth || logged)
    .map((n) => `<a href="${n.href}" class="${isActive(n) ? 'active' : ''}">${n.label}</a>`)
    .join('');

  const authArea = logged
    ? `
      <div class="nav-user" id="nav-user">
        <img src="${avatarUrl(user)}" alt="" onerror="this.src='/images/avatars/default.svg'">
        <span class="nu-name">${esc(user?.display_name || user?.username || 'Pilota')}</span>
      </div>
      <div class="nav-dropdown" id="nav-dropdown">
        <a href="/profile.html">👤 Il mio profilo</a>
        <a href="/dashboard.html">📊 Dashboard</a>
        <a href="/driver.html?id=${user?.id}">🏎️ La mia pagina</a>
        ${auth.isAdmin() ? '<hr><a href="/admin.html">⚙️ Area Admin</a>' : ''}
        <hr>
        <button id="logout-btn">🚪 Esci</button>
      </div>`
    : `
      <a href="/login.html" class="btn btn-outline btn-sm">Accedi</a>
      <a href="/register.html" class="btn btn-primary btn-sm">Registrati</a>`;

  const nav = el('nav', { class: 'navbar' });
  nav.innerHTML = `
    <div class="container">
      <a href="/index.html" class="brand">
        <span class="brand-mark">F1</span>
        <span>LEGA<span class="accent">F1</span></span>
      </a>
      <button class="nav-toggle" id="nav-toggle" aria-label="Menu" aria-expanded="false">☰</button>
      <div class="nav-panel" id="nav-panel">
        <div class="nav-links" id="nav-links">${links}</div>
        <div class="nav-actions" id="nav-actions" style="position:relative">${authArea}</div>
      </div>
    </div>`;

  const mount = $('#navbar-mount');
  if (mount) mount.replaceWith(nav); else document.body.prepend(nav);

  // Interazioni: drawer laterale (mobile)
  const toggle = $('#nav-toggle');
  const panel = $('#nav-panel');
  let backdrop = $('.nav-backdrop');
  if (!backdrop) { backdrop = el('div', { class: 'nav-backdrop' }); document.body.appendChild(backdrop); }
  const setMenu = (open) => {
    panel.classList.toggle('open', open);
    backdrop.classList.toggle('show', open);
    toggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  toggle?.addEventListener('click', () => setMenu(!panel.classList.contains('open')));
  backdrop.addEventListener('click', () => setMenu(false));
  // Su mobile: chiudi il menu quando si tocca un link
  panel?.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMenu(false)));

  const navUser = $('#nav-user');
  const dropdown = $('#nav-dropdown');
  navUser?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });
  document.addEventListener('click', () => dropdown?.classList.remove('open'));

  $('#logout-btn')?.addEventListener('click', () => auth.logout());

  // Ombra allo scroll
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Banner cookie (mostrato una volta, su tutte le pagine con navbar)
  mountCookieBanner();
}

/**
 * Monta il footer in #footer-mount (o in fondo al body).
 */
export function mountFooter() {
  const year = 2025;
  const foot = el('footer', { class: 'footer' });
  foot.innerHTML = `
    <div class="container">
      <div>
        <div class="foot-brand">LEGA<span class="text-red">F1</span></div>
        <small>Il portale ufficiale del nostro campionato F1&nbsp;25.</small>
      </div>
      <div class="foot-links">
        <a href="/standings.html">Classifiche</a>
        <a href="/races.html">Calendario</a>
        <a href="/stats.html">Statistiche</a>
        <a href="/privacy.html">Privacy &amp; Cookie</a>
      </div>
      <small>© ${year} Lega F1 · Progetto amatoriale non affiliato a Formula 1® o EA Sports.</small>
    </div>`;
  const mount = $('#footer-mount');
  if (mount) mount.replaceWith(foot); else document.body.append(foot);
}

/** Monta navbar + footer + reveal. Chiamata unica per pagina pubblica. */
export function mountChrome() {
  mountNavbar();
  mountFooter();
}
