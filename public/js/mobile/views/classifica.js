/* =============================================================
   classifica.js — Vista "Classifica" della SPA mobile: piloti e
   costruttori con selettore segmentato. Su telefono mostra solo
   posizione, pilota/team e punti (Regola della Classifica Leggibile).
   ============================================================= */
import api from '../../core/api.js';
import { esc } from '../../core/ui.js';
import { avatarUrl } from '../../core/components.js';

const TAB_KEY = 'mx:classifica:tab';
const DEFAULT_AVATAR = '/images/avatars/default.svg';

/** Punti con al massimo un decimale. */
const pts = (n) => (n == null || isNaN(n) ? '0' : Number(n).toLocaleString('it-IT', { maximumFractionDigits: 1 }));

/** Colore team solo se esadecimale valido, altrimenti grigio neutro. */
const teamColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : 'var(--text-dim)');

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
          <span class="mx-std-name">${esc(d.display_name || d.handle || 'Pilota')}${me ? '<span class="mx-std-sr"> (tu)</span>' : ''}</span>
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
          <span class="mx-std-name">${esc(c.team_name || 'Scuderia')}${me ? '<span class="mx-std-sr"> (la tua scuderia)</span>' : ''}</span>
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
    const seasonId = ctx.season?.id ?? ctx.summary?.season?.id ?? null;
    const meId = ctx.user?.id ?? ctx.summary?.me?.id ?? null;
    const myTeamId = ctx.summary?.team?.team_id ?? null;
    const state = { tab: readTab(), req: 0, disposed: false };

    root.innerHTML = `
      <div class="mx-view mx-std">
        ${ctx.summary?.season ? `<p class="mx-kicker">${esc(ctx.summary.season.name || `Stagione ${ctx.summary.season.year ?? ''}`)}</p>` : ''}
        <h1 class="mx-title" tabindex="-1">Classifica</h1>
        <div class="mx-segmented mx-std-seg" role="group" aria-label="Tipo di classifica">
          <button type="button" data-tab="drivers">Piloti</button>
          <button type="button" data-tab="constructors">Costruttori</button>
        </div>
        <div class="mx-std-body" aria-live="polite"></div>
      </div>`;

    const body = root.querySelector('.mx-std-body');
    const buttons = [...root.querySelectorAll('[data-tab]')];

    const fetchList = (tab) => {
      const path = tab === 'drivers' ? '/standings/drivers' : '/standings/constructors';
      const fetcher = () => api.get(path, { season_id: seasonId });
      return ctx.store?.get ? ctx.store.get(`standings:${tab}:${seasonId}`, fetcher) : fetcher();
    };

    const show = async (tab) => {
      state.tab = tab;
      saveTab(tab);
      buttons.forEach((b) => {
        const on = b.dataset.tab === tab;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
      });

      if (!seasonId) {
        body.innerHTML = '<div class="mx-card mx-empty"><p>Nessuna stagione attiva</p></div>';
        return;
      }

      const req = ++state.req;
      body.setAttribute('aria-busy', 'true');
      body.innerHTML = skeleton();
      let list;
      try {
        list = await fetchList(tab);
      } catch (e) {
        if (state.disposed || req !== state.req) return;
        body.removeAttribute('aria-busy');
        body.innerHTML = `
          <div class="mx-card mx-empty">
            <p>Impossibile caricare la classifica.</p>
            <p class="mx-std-muted">${esc(e?.message || '')}</p>
            <button type="button" class="mx-btn" data-retry>Riprova</button>
          </div>`;
        body.querySelector('[data-retry]').addEventListener('click', () => show(state.tab));
        return;
      }
      if (state.disposed || req !== state.req) return;
      body.removeAttribute('aria-busy');

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

      // Avatar mancanti → immagine di default (niente handler inline)
      body.querySelectorAll('img.mx-std-avatar').forEach((img) =>
        img.addEventListener('error', () => {
          if (!img.src.endsWith(DEFAULT_AVATAR)) img.src = DEFAULT_AVATAR;
        }, { once: true })
      );
    };

    buttons.forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.tab !== state.tab || !body.querySelector('.mx-std-list')) show(b.dataset.tab);
    }));

    await show(state.tab);

    return () => { state.disposed = true; };
  },
};
