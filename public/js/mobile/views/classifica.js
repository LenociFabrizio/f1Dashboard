/* =============================================================
   classifica.js — Vista "Classifica" della SPA mobile: piloti e
   costruttori con selettore segmentato. Su telefono mostra solo
   posizione, pilota/team e punti (Regola della Classifica Leggibile).
   ============================================================= */
import api from '../../core/api.js';
import { esc } from '../../core/ui.js';
import { avatarUrl } from '../../core/components.js';
import { handleAuthError } from '../session.js';
import { pts, teamColor, seasonLabel, getSummary, bindAvatarFallback, errorBlock } from './_shared.js';

const TAB_KEY = 'mx:classifica:tab';

const posClass = (p) => (p >= 1 && p <= 3 ? ` p${p}` : '');

function readTab() {
  try { return sessionStorage.getItem(TAB_KEY) === 'constructors' ? 'constructors' : 'drivers'; }
  catch { return 'drivers'; }
}
function saveTab(tab) {
  try { sessionStorage.setItem(TAB_KEY, tab); } catch { /* storage non disponibile */ }
}

function driverRow(d, meId) {
  const me = meId != null && d.user_id === meId;
  const sub = [d.handle ? `@${esc(d.handle)}` : '', esc(d.team_name || '')].filter(Boolean).join(' · ');
  const bot = d.bot_rounds?.length
    ? `<span class="mx-std-bot" title="Il bot di riserva ha corso al posto del pilota">BOT in ${esc(d.bot_rounds.map((b) => `R${b.round}`).join(', '))}</span>`
    : '';
  return `
    <li>
      <a class="mx-row mx-std-row${me ? ' mx-row--me' : ''}" href="/driver.html?id=${encodeURIComponent(d.user_id)}"${me ? ' aria-current="true"' : ''}>
        <span class="mx-pos${posClass(d.position)}">${esc(d.position)}</span>
        <img class="mx-std-avatar" src="${esc(avatarUrl(d))}" alt="" width="32" height="32" loading="lazy">
        <span class="mx-row-main mx-std-main">
          <span class="mx-std-name">${esc(d.display_name || d.handle || 'Pilota')}${me ? '<span class="sr-only"> (tu)</span>' : ''}</span>
          <span class="mx-row-sub mx-std-sub">
            ${d.team_name ? `<span class="mx-team-bar mx-std-dot" style="--team:${teamColor(d.team_color)}" aria-hidden="true"></span>` : ''}
            <span class="mx-std-subtext">${sub || '—'}</span>
          </span>
          ${bot}
        </span>
        <span class="mx-num mx-std-pts">${pts(d.points)}<small> pt</small></span>
      </a>
    </li>`;
}

function constructorRow(c, myTeamId) {
  const me = myTeamId != null && c.team_id === myTeamId;
  const sub = [
    c.wins ? `${esc(c.wins)} ${c.wins === 1 ? 'vittoria' : 'vittorie'}` : '',
    c.podiums ? `${esc(c.podiums)} ${c.podiums === 1 ? 'podio' : 'podi'}` : '',
  ].filter(Boolean).join(' · ');
  return `
    <li>
      <div class="mx-row mx-std-row${me ? ' mx-row--me' : ''}"${me ? ' aria-current="true"' : ''}>
        <span class="mx-pos${posClass(c.position)}">${esc(c.position)}</span>
        <span class="mx-team-bar mx-std-bar" style="--team:${teamColor(c.team_color)}" aria-hidden="true"></span>
        <span class="mx-row-main mx-std-main">
          <span class="mx-std-name">${esc(c.team_name || 'Scuderia')}${me ? '<span class="sr-only"> (la tua scuderia)</span>' : ''}</span>
          ${sub ? `<span class="mx-row-sub mx-std-sub"><span class="mx-std-subtext">${sub}</span></span>` : ''}
        </span>
        <span class="mx-num mx-std-pts">${pts(c.points)}<small> pt</small></span>
      </div>
    </li>`;
}

const skeleton = () => `
  <div class="mx-std-skeleton" aria-hidden="true">
    ${Array.from({ length: 8 }, () => '<div class="mx-skeleton mx-std-sk"></div>').join('')}
  </div>`;

export default {
  route: 'classifica',
  title: 'Classifica',
  async render(root, ctx) {
    const state = { tab: readTab(), req: 0, disposed: false };

    root.innerHTML = `
      <div class="mx-std">
        <p class="mx-kicker" data-kicker hidden></p>
        <h1 class="mx-title" tabindex="-1">Classifica</h1>
        <div class="mx-segmented mx-std-seg" role="group" aria-label="Tipo di classifica">
          <button type="button" data-tab="drivers">Piloti</button>
          <button type="button" data-tab="constructors">Costruttori</button>
        </div>
        <div class="mx-std-body" aria-live="polite"></div>
      </div>`;

    const body = root.querySelector('.mx-std-body');
    const kicker = root.querySelector('[data-kicker]');
    const buttons = [...root.querySelectorAll('[data-tab]')];

    const fetchList = (tab, seasonId) => {
      const path = tab === 'drivers' ? '/standings/drivers' : '/standings/constructors';
      return ctx.store.get(`standings:${tab}:${seasonId}`, () => api.get(path, { season_id: seasonId }));
    };

    const show = async (tab) => {
      state.tab = tab;
      saveTab(tab);
      buttons.forEach((b) => {
        const on = b.dataset.tab === tab;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
      });

      const req = ++state.req;
      body.setAttribute('aria-busy', 'true');
      body.innerHTML = skeleton();
      let summary;
      let list;
      try {
        // Stagione, utente e scuderia dal riepilogo aggiornato (ctx.summary può essere datato)
        summary = await getSummary(ctx);
        const seasonId = summary?.season?.id ?? ctx.season?.id ?? null;
        if (seasonId != null) list = await fetchList(tab, seasonId);
      } catch (e) {
        if (state.disposed || req !== state.req || handleAuthError(e)) return;
        body.removeAttribute('aria-busy');
        body.replaceChildren(errorBlock('Impossibile caricare la classifica.', () => show(state.tab), e?.message));
        return;
      }
      if (state.disposed || req !== state.req) return;
      body.removeAttribute('aria-busy');

      const label = seasonLabel(summary?.season);
      kicker.textContent = label;
      kicker.hidden = !label;

      if (list === undefined) {
        body.innerHTML = '<div class="mx-card mx-empty"><p>Nessuna stagione attiva</p></div>';
        return;
      }

      const meId = ctx.user?.id ?? summary?.me?.id ?? null;
      const myTeamId = summary?.team?.team_id ?? null;
      list = Array.isArray(list) ? list : [];
      if (!list.length) {
        body.innerHTML = `<div class="mx-card mx-empty"><p>${tab === 'drivers'
          ? 'Nessun risultato ancora registrato.'
          : 'Nessun dato costruttori.'}</p></div>`;
        return;
      }

      body.innerHTML = `
        <ol class="mx-list mx-std-list" aria-label="${tab === 'drivers' ? 'Classifica piloti' : 'Classifica costruttori'}">
          ${list.map((x) => (tab === 'drivers' ? driverRow(x, meId) : constructorRow(x, myTeamId))).join('')}
        </ol>`;
      bindAvatarFallback(body, 'img.mx-std-avatar');
    };

    buttons.forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.tab !== state.tab || !body.querySelector('.mx-std-list')) show(b.dataset.tab);
    }));

    await show(state.tab);

    return () => { state.disposed = true; };
  },
};
