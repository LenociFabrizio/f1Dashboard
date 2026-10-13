/* =============================================================
   profilo.js — Vista app mobile: profilo del pilota loggato in
   sola lettura. La modifica resta sulla pagina classica.
   ============================================================= */
import api from '../../core/api.js';
import { esc, fmtNum, flagEmoji } from '../../core/ui.js';
import { avatarUrl } from '../../core/components.js';

const PLATFORM_LABEL = { steam: 'Steam', playstation: 'PlayStation', xbox: 'Xbox', origin: 'EA / Origin' };

/** Colore team solo se esadecimale valido (finisce in un attributo style). */
const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : 'var(--bg-300)');

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
  const teamColor = safeColor(u.team_color || team?.team_color);
  const nat = typeof u.nationality === 'string' && /^[a-z]{2}$/i.test(u.nationality) ? u.nationality : null;
  const platforms = Array.isArray(u.platforms) ? u.platforms : [];

  const teamCard = teamName
    ? `
      <section class="mx-card mx-prof-team" aria-label="Scuderia">
        <span class="mx-team-bar" style="--team:${teamColor}"></span>
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
    : `<section class="mx-card mx-prof-team"><span class="mx-prof-label">Scuderia</span><span class="mx-row-sub">Nessuna scuderia assegnata</span></section>`;

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
    const userId = ctx.user?.id ?? ctx.summary?.me?.id;
    const key = `user:${userId}`;

    root.innerHTML = `
      <section class="mx-view mx-prof">
        <h1 class="mx-title">Profilo</h1>
        <div class="mx-prof-body" aria-live="polite"></div>
      </section>`;
    const body = root.querySelector('.mx-prof-body');

    const showError = (err) => {
      body.innerHTML = `
        <div class="mx-empty" role="alert">
          <p>${esc(err?.message || 'Impossibile caricare il profilo.')}</p>
          <button type="button" class="mx-btn mx-prof-retry">Riprova</button>
        </div>`;
      body.querySelector('.mx-prof-retry').addEventListener('click', () => {
        ctx.store?.clear?.(key);
        load();
      });
    };

    async function load() {
      if (!userId) {
        body.innerHTML = '<div class="mx-empty"><p>Accedi per vedere il tuo profilo.</p></div>';
        return;
      }
      body.innerHTML = skeleton();
      try {
        const fetcher = () => api.get(`/users/${encodeURIComponent(userId)}`);
        const u = ctx.store ? await ctx.store.get(key, fetcher) : await fetcher();
        if (!alive) return;
        body.innerHTML = content(u || {}, ctx.summary);
        // Avatar rotto → default
        const img = body.querySelector('.mx-prof-avatar');
        img?.addEventListener('error', () => { img.src = '/images/avatars/default.svg'; }, { once: true });
      } catch (err) {
        if (alive) showError(err);
      }
    }

    await load();

    return () => { alive = false; };
  },
};
