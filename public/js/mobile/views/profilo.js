/* =============================================================
   profilo.js — Vista app mobile: profilo del pilota loggato in
   sola lettura. La modifica resta sulla pagina classica.
   ============================================================= */
import api from '../../core/api.js';
import { esc, fmtNum, flagEmoji } from '../../core/ui.js';
import { avatarUrl } from '../../core/components.js';
import { handleAuthError } from '../session.js';
import { teamColor as safeTeamColor, getSummary, bindAvatarFallback, errorBlock } from './_shared.js';

const PLATFORM_LABEL = { steam: 'Steam', playstation: 'PlayStation', xbox: 'Xbox', origin: 'EA / Origin' };

/** Nome del paese in italiano dal codice ISO, se il browser lo supporta. */
function countryName(code) {
  try { return new Intl.DisplayNames(['it'], { type: 'region' }).of(code.toUpperCase()) || code; }
  catch { return code; }
}

function skeleton() {
  return `
    <div class="mx-prof-head" aria-hidden="true">
      <div class="mx-prof-avatar mx-skeleton"></div>
      <div class="mx-skeleton mx-prof-sk-line"></div>
    </div>
    <div class="mx-card mx-skeleton mx-prof-sk-card" aria-hidden="true"></div>
    <div class="mx-card mx-skeleton mx-prof-sk-card" aria-hidden="true"></div>`;
}

function content(u, summary) {
  const name = u.display_name || summary?.me?.display_name || 'Pilota';
  const handle = u.handle || summary?.me?.handle;
  const team = summary?.team;
  const driver = summary?.driver;
  const teamName = u.team_name || team?.team_name;
  const teamColor = safeTeamColor(u.team_color || team?.team_color, 'var(--bg-300)');
  const nat = typeof u.nationality === 'string' && /^[a-z]{2}$/i.test(u.nationality) ? u.nationality : null;
  const platforms = Array.isArray(u.platforms) ? u.platforms : [];

  const teamCard = teamName
    ? `
      <section class="mx-card mx-prof-team" aria-label="Scuderia">
        <span class="mx-team-bar" style="--team:${teamColor}" aria-hidden="true"></span>
        <div class="mx-prof-team-main">
          <span class="mx-prof-label">Scuderia</span>
          <span class="mx-prof-team-name">${esc(teamName)}</span>
        </div>
        ${team && team.position != null ? `
          <div class="mx-prof-team-pos">
            <span class="mx-num">P${esc(team.position)}</span>
            <span class="mx-prof-label">${esc(fmtNum(team.points, Number.isInteger(Number(team.points)) ? 0 : 1))} pt</span>
          </div>` : ''}
      </section>`
    : `<section class="mx-card mx-prof-team" aria-label="Scuderia"><span class="mx-prof-label">Scuderia</span><span class="mx-row-sub">Nessuna scuderia assegnata</span></section>`;

  const standing = driver && driver.position != null
    ? `
      <section class="mx-card mx-card--accent mx-prof-standing" aria-label="Classifica piloti">
        <div><span class="mx-prof-big mx-num">P${esc(driver.position)}</span><span class="mx-prof-label">Piloti${driver.total ? ` · su ${esc(driver.total)}` : ''}</span></div>
        <div><span class="mx-prof-big mx-num">${esc(fmtNum(driver.points, Number.isInteger(Number(driver.points)) ? 0 : 1))}</span><span class="mx-prof-label">Punti</span></div>
      </section>`
    : '';

  const rows = [];
  if (u.favorite_number != null && u.favorite_number !== '') {
    rows.push(['Numero', `<span class="mx-num mx-prof-value">#${esc(u.favorite_number)}</span>`]);
  }
  if (nat) {
    rows.push(['Nazionalità', `<span class="mx-prof-value"><span aria-hidden="true">${flagEmoji(nat)}</span> ${esc(countryName(nat))}</span>`]);
  }
  if (platforms.length) {
    rows.push(['Piattaforme', `<span class="mx-prof-chips">${platforms.map((p) => `<span class="mx-prof-chip">${esc(PLATFORM_LABEL[p] || p)}</span>`).join('')}</span>`]);
  }
  if (u.reserve_driver) {
    rows.push(['Riserva BOT', `<span class="mx-prof-value">${esc(u.reserve_driver)}</span>`]);
  }

  const details = rows.length
    ? `<section class="mx-card mx-prof-details" aria-label="Dettagli pilota"><dl>
        ${rows.map(([k, v]) => `<div class="mx-prof-detail"><dt class="mx-prof-label">${esc(k)}</dt><dd>${v}</dd></div>`).join('')}
      </dl></section>`
    : '';

  return `
    <div class="mx-prof-head">
      <img class="mx-prof-avatar" src="${esc(avatarUrl(u.avatar ? u : summary?.me))}" alt="" width="96" height="96">
      <p class="mx-prof-name">${esc(name)}</p>
      ${handle ? `<p class="mx-prof-handle">@${esc(handle)}</p>` : ''}
    </div>
    ${standing}
    ${teamCard}
    ${details}
    <a class="mx-btn mx-prof-edit" href="/profile.html">Modifica profilo</a>`;
}

export default {
  route: 'profilo',
  title: 'Profilo',

  async render(root, ctx) {
    let alive = true;

    root.innerHTML = `
      <div class="mx-prof">
        <h1 class="mx-title">Profilo</h1>
        <div class="mx-prof-body" aria-live="polite"></div>
      </div>`;
    const body = root.querySelector('.mx-prof-body');

    async function load() {
      body.innerHTML = skeleton();
      try {
        // Posizione e scuderia dal riepilogo aggiornato (ctx.summary può essere datato)
        const summary = await getSummary(ctx);
        if (!alive) return;
        const userId = ctx.user?.id ?? summary?.me?.id;
        if (!userId) {
          body.innerHTML = '<div class="mx-empty"><p>Accedi per vedere il tuo profilo.</p></div>';
          return;
        }
        const u = await ctx.store.get(`user:${userId}`, () => api.get(`/users/${encodeURIComponent(userId)}`));
        if (!alive) return;
        body.innerHTML = content(u || {}, summary);
        bindAvatarFallback(body, '.mx-prof-avatar');
      } catch (err) {
        if (!alive || handleAuthError(err)) return;
        body.replaceChildren(errorBlock('Impossibile caricare il profilo.', load, err?.message));
      }
    }

    await load();

    return () => { alive = false; };
  },
};
