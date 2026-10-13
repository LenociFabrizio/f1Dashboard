/* =============================================================
   profilo.js — Vista app mobile: profilo del pilota loggato.
   Gli aiuti alla guida si modificano qui; il resto del profilo
   resta sulla pagina classica.
   ============================================================= */
import api from '../../core/api.js';
import { auth } from '../../core/auth.js';
import { esc, fmtNum, flagEmoji, toast } from '../../core/ui.js';
import { avatarUrl } from '../../core/components.js';
import { handleAuthError } from '../session.js';
import { teamColor as safeTeamColor, getSummary, bindAvatarFallback, errorBlock } from './_shared.js';

const PLATFORM_LABEL = { steam: 'Steam', playstation: 'PlayStation', xbox: 'Xbox', origin: 'EA / Origin' };

/** Nome del paese in italiano dal codice ISO, se il browser lo supporta. */
function countryName(code) {
  try { return new Intl.DisplayNames(['it'], { type: 'region' }).of(code.toUpperCase()) || code; }
  catch { return code; }
}

/* Aiuti alla guida: stessi valori della pagina profilo classica */
const ASSISTS = [
  { key: 'assist_abs', label: 'ABS', options: [['0', 'Off'], ['1', 'On']] },
  { key: 'assist_tc', label: 'Controllo trazione', options: [['off', 'Off'], ['medium', 'Medio'], ['full', 'Pieno']] },
  { key: 'assist_gearbox', label: 'Cambio', options: [['auto', 'Automatico'], ['manual', 'Manuale']] },
];

/** Valori correnti normalizzati (stessa logica di profile.js). */
function assistValues(u) {
  return {
    assist_abs: u.assist_abs ? '1' : '0',
    assist_tc: ['off', 'medium', 'full'].includes(u.assist_tc) ? u.assist_tc : 'off',
    assist_gearbox: u.assist_gearbox === 'manual' ? 'manual' : 'auto',
  };
}

function assistsCard(values) {
  return `
    <section class="mx-card mx-prof-assists" aria-labelledby="mx-prof-assists-h">
      <h2 class="mx-kicker" id="mx-prof-assists-h">Aiuti alla guida</h2>
      <p class="mx-row-sub mx-prof-assists-hint">Usati in campionato, compaiono accanto al tuo giro veloce.</p>
      ${ASSISTS.map((a) => `
        <div class="mx-prof-assist">
          <span class="mx-prof-label" id="mx-prof-${a.key}">${esc(a.label)}</span>
          <div class="mx-segmented" role="group" aria-labelledby="mx-prof-${a.key}" data-assist="${a.key}">
            ${a.options.map(([v, l]) => `<button type="button" data-val="${v}" aria-pressed="${values[a.key] === v}" class="${values[a.key] === v ? 'active' : ''}">${esc(l)}</button>`).join('')}
          </div>
        </div>`).join('')}
      <button type="button" class="mx-btn mx-btn--primary mx-btn--block mx-prof-assists-save" disabled>Salva aiuti</button>
    </section>`;
}

/** Collega i segmented degli aiuti e il salvataggio su PUT /users/me. */
function bindAssists(body, u, ctx, userId) {
  const card = body.querySelector('.mx-prof-assists');
  if (!card) return;
  const saved = assistValues(u);
  const current = { ...saved };
  const saveBtn = card.querySelector('.mx-prof-assists-save');
  const dirty = () => ASSISTS.some((a) => current[a.key] !== saved[a.key]);

  card.querySelectorAll('.mx-segmented[data-assist]').forEach((grp) => {
    const key = grp.dataset.assist;
    grp.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-val]');
      if (!btn) return;
      current[key] = btn.dataset.val;
      grp.querySelectorAll('button[data-val]').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      saveBtn.disabled = !dirty();
    });
  });

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvataggio…';
    try {
      const updated = await api.put('/users/me', {
        assist_abs: current.assist_abs === '1' ? 1 : 0,
        assist_tc: current.assist_tc,
        assist_gearbox: current.assist_gearbox,
      });
      Object.assign(saved, current);
      ctx.store.clear(`user:${userId}`);
      if (auth.user && updated) auth.user = { ...auth.user, ...updated };
      toast('Aiuti alla guida salvati.', 'success');
    } catch (err) {
      if (handleAuthError(err)) return;
      toast(err?.message || 'Salvataggio non riuscito.', 'error');
    } finally {
      saveBtn.textContent = 'Salva aiuti';
      saveBtn.disabled = !dirty();
    }
  });
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
    ${assistsCard(assistValues(u))}
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
        <h1 class="mx-title sr-only">Profilo</h1>
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
        bindAssists(body, u || {}, ctx, userId);
      } catch (err) {
        if (!alive || handleAuthError(err)) return;
        body.replaceChildren(errorBlock('Impossibile caricare il profilo.', load, err?.message));
      }
    }

    await load();

    return () => { alive = false; };
  },
};
