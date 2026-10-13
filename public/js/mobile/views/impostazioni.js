/* =============================================================
   impostazioni.js — Vista app mobile: lista raggruppata stile iOS
   (vista classica, area admin, privacy) e uscita dall'account.
   ============================================================= */
import auth from '../../core/auth.js';
import { esc, confirmDialog } from '../../core/ui.js';

const APP_VERSION = 'v1';

const CHEVRON = `<svg class="mx-set-chevron" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
  <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const row = ({ href, action, label, sub }) => `
  <li><a class="mx-set-row" href="${esc(href)}"${action ? ` data-action="${esc(action)}"` : ''}>
    <span class="mx-set-row-main">
      <span class="mx-set-row-label">${esc(label)}</span>
      ${sub ? `<span class="mx-set-row-sub">${esc(sub)}</span>` : ''}
    </span>${CHEVRON}
  </a></li>`;

const group = (title, rows) => `
  <section class="mx-set-group" aria-label="${esc(title)}">
    <h2 class="mx-set-group-title">${esc(title)}</h2>
    <ul class="mx-card mx-set-list">${rows.map(row).join('')}</ul>
  </section>`;

/* Azioni delle righe che non sono semplici link */
const ACTIONS = {
  classic() {
    try { localStorage.setItem('f1_view', 'classic'); } catch {}
    location.href = '/index.html';
  },
};

export default {
  route: 'impostazioni',
  title: 'Impostazioni',

  async render(root, ctx) {
    const user = ctx.user || {};
    const name = user.display_name || ctx.summary?.me?.display_name || 'Pilota';

    const groups = [
      group('Vista', [{ href: '/index.html', action: 'classic', label: 'Versione completa del sito', sub: 'Apri il portale classico' }]),
    ];
    if (user.role === 'admin') {
      groups.push(group('Amministrazione', [{ href: '/admin.html', label: 'Area Admin' }]));
    }
    groups.push(group('Informazioni', [{ href: '/privacy.html', label: 'Privacy' }]));

    root.innerHTML = `
      <div class="mx-set">
        <h1 class="mx-title">Impostazioni</h1>
        <div class="mx-card mx-set-info">
          <span class="mx-set-info-name">${esc(name)}</span>
          <span class="mx-set-info-ver">Lega F1 app ${esc(APP_VERSION)}</span>
        </div>
        ${groups.join('')}
        <button type="button" class="mx-btn mx-btn--danger mx-set-logout">Esci</button>
      </div>`;

    const onClick = (e) => {
      const a = e.target.closest('[data-action]');
      if (!a || !root.contains(a) || !ACTIONS[a.dataset.action]) return;
      e.preventDefault();
      ACTIONS[a.dataset.action]();
    };
    root.addEventListener('click', onClick);

    const logoutBtn = root.querySelector('.mx-set-logout');
    const onLogout = async () => {
      logoutBtn.disabled = true;
      const ok = await confirmDialog({
        title: 'Esci',
        message: 'Vuoi uscire dal tuo account?',
        confirmText: 'Esci',
        danger: true,
      });
      if (!ok) { logoutBtn.disabled = false; return; }
      auth.logout(false);
      location.replace('/login.html');
    };
    logoutBtn.addEventListener('click', onLogout);

    return () => {
      root.removeEventListener('click', onClick);
      logoutBtn.removeEventListener('click', onLogout);
    };
  },
};
