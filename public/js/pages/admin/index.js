/* =============================================================
   admin/index.js — Bootstrap del pannello admin: guardia, sidebar,
   router basato su hash, caricamento dati di riferimento.
   ============================================================= */
import { guard } from '../../core/auth.js';
import { mountNavbar } from '../../core/components.js';
import { $, esc, loader, toast } from '../../core/ui.js';
import api from '../../core/api.js';
import { state, loadRefs } from './shared.js';

import overview from './sections/overview.js';
import notifications from './sections/notifications.js';
import seasons from './sections/seasons.js';
import races from './sections/races.js';
import results from './sections/results.js';
import imports from './sections/imports.js';
import users from './sections/users.js';
import teams from './sections/teams.js';
import circuits from './sections/circuits.js';
// Bacheca nascosta (non eliminata): sezione admin disattivata.
// import posts from './sections/posts.js';

const SECTIONS = {
  overview: { icon: '📊', label: 'Panoramica', mod: overview },
  notifications: { icon: '🔔', label: 'Notifiche', mod: notifications },
  seasons: { icon: '📅', label: 'Stagioni', mod: seasons },
  races: { icon: '🏁', label: 'Gare / Calendario', mod: races },
  results: { icon: '🏆', label: 'Risultati & Qualifiche', mod: results },
  imports: { icon: '📡', label: 'Import automatico', mod: imports },
  users: { icon: '👤', label: 'Piloti / Utenti', mod: users },
  teams: { icon: '🏎️', label: 'Team', mod: teams },
  circuits: { icon: '📍', label: 'Circuiti', mod: circuits },
  // Bacheca nascosta (non eliminata):
  // posts: { icon: '📢', label: 'Bacheca', mod: posts },
};

function buildSidebar(active) {
  $('#admin-nav').innerHTML = Object.entries(SECTIONS)
    .map(([key, s]) => `
      <a href="#${key}" class="${key === active ? 'active' : ''}">
        <span class="ic">${s.icon}</span> ${esc(s.label)}
        ${key === 'notifications' ? '<span class="side-badge" id="notif-side-badge" hidden></span>' : ''}
      </a>`)
    .join('');
  refreshNotifBadge();
}

/** Aggiorna il badge "Notifiche" nella sidebar admin. */
export async function refreshNotifBadge() {
  const badge = $('#notif-side-badge');
  if (!badge) return;
  try {
    const { count } = await api.get('/notifications/count');
    if (count > 0) { badge.textContent = count > 99 ? '99+' : String(count); badge.hidden = false; }
    else badge.hidden = true;
  } catch { badge.hidden = true; }
}

async function route() {
  const key = (location.hash.slice(1) || 'overview').split('?')[0];
  const section = SECTIONS[key] || SECTIONS.overview;
  buildSidebar(SECTIONS[key] ? key : 'overview');
  const content = $('#admin-content');
  content.innerHTML = '<div style="padding:60px;text-align:center"><span class="spinner"></span></div>';
  try {
    await section.mod.render(content, { rerender: route });
  } catch (e) {
    console.error(e);
    content.innerHTML = `<div class="empty" style="padding:60px"><div class="em-ic">⚠️</div>${esc(e.message)}</div>`;
  }
}

(async function init() {
  const me = await guard({ admin: true });
  if (!me) return;
  mountNavbar();
  try {
    await loadRefs();
    if (!state.seasons.length) {
      toast.info('Nessuna stagione: creane una per iniziare.', { duration: 6000 });
    }
    window.addEventListener('hashchange', route);
    await route();
  } catch (e) {
    console.error(e);
    $('#admin-content').innerHTML = `<div class="empty" style="padding:60px"><div class="em-ic">⚠️</div>${esc(e.message)}</div>`;
  } finally {
    loader.hide();
  }
})();
