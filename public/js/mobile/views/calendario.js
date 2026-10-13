/* =============================================================
   calendario.js — Vista "Calendario" della SPA mobile: elenco GP
   per round, gare concluse attenuate, prossima gara evidenziata e
   portata in vista automaticamente.
   ============================================================= */
import api from '../../core/api.js';
import { esc, fmtDate, flagEmoji } from '../../core/ui.js';

/** Nome GP compatto per il telefono. */
const gpName = (n) => String(n || '').replace(/^Gran Premio /i, 'GP ');

function raceRow(r, isNext) {
  const done = r.status === 'completed';
  const cls = ['mx-row', 'mx-cal-row', done ? 'mx-cal-row--done' : '', isNext ? 'mx-cal-row--next' : '']
    .filter(Boolean).join(' ');
  // Data sempre visibile: si accorcia solo il nome del circuito
  const where = `${r.circuit_name ? `<span class="mx-cal-circuit">${esc(r.circuit_name)}</span><span aria-hidden="true">·</span>` : ''}`
    + `<span class="mx-cal-date mx-num">${esc(fmtDate(r.race_date))}</span>`;
  const state = isNext
    ? '<span class="mx-cal-badge">Prossima</span>'
    : done ? '<span class="mx-cal-sr">, conclusa</span>' : '';
  return `
    <li>
      <a class="${cls}" href="/race.html?id=${encodeURIComponent(r.id)}"${isNext ? ' aria-current="date" data-next' : ''}>
        <span class="mx-num mx-cal-round">R${esc(r.round)}</span>
        <span class="mx-cal-flag" aria-hidden="true">${flagEmoji(r.country_code)}</span>
        <span class="mx-row-main mx-cal-main">
          <span class="mx-cal-name"><span class="mx-cal-title">${esc(gpName(r.name))}</span>${state}</span>
          <span class="mx-row-sub mx-cal-sub">${where}</span>
          ${done && r.mvp_name ? `<span class="mx-row-sub mx-cal-mvp">MVP · ${esc(r.mvp_name)}</span>` : ''}
        </span>
      </a>
    </li>`;
}

const skeleton = () => `
  <div aria-hidden="true">
    ${Array.from({ length: 6 }, () => '<div class="mx-skeleton mx-cal-sk"></div>').join('')}
  </div>`;

export default {
  route: 'calendario',
  title: 'Calendario',
  async render(root, ctx) {
    const seasonId = ctx.season?.id ?? ctx.summary?.season?.id ?? null;
    const seasonLabel = ctx.summary?.season
      ? esc(ctx.summary.season.name || `Stagione ${ctx.summary.season.year ?? ''}`)
      : '';
    const state = { disposed: false, raf: 0, timeout: 0 };

    root.innerHTML = `
      <div class="mx-view mx-cal">
        <p class="mx-kicker" data-kicker${seasonLabel ? '' : ' hidden'}>${seasonLabel}</p>
        <h1 class="mx-title" tabindex="-1">Calendario</h1>
        <div class="mx-cal-body" aria-live="polite"></div>
      </div>`;
    const body = root.querySelector('.mx-cal-body');
    const kicker = root.querySelector('[data-kicker]');

    const load = async () => {
      if (!seasonId) {
        body.innerHTML = '<div class="mx-card mx-empty"><p>Nessuna stagione attiva</p></div>';
        return;
      }
      body.setAttribute('aria-busy', 'true');
      body.innerHTML = skeleton();
      let races;
      try {
        const fetcher = () => api.get('/races', { season_id: seasonId });
        races = ctx.store?.get ? await ctx.store.get(`races:${seasonId}`, fetcher) : await fetcher();
      } catch (e) {
        if (state.disposed) return;
        body.removeAttribute('aria-busy');
        body.innerHTML = `
          <div class="mx-card mx-empty">
            <p>Impossibile caricare il calendario.</p>
            <p class="mx-cal-muted">${esc(e?.message || '')}</p>
            <button type="button" class="mx-btn" data-retry>Riprova</button>
          </div>`;
        body.querySelector('[data-retry]').addEventListener('click', load);
        return;
      }
      if (state.disposed) return;
      body.removeAttribute('aria-busy');

      const list = (Array.isArray(races) ? races : []).slice().sort((a, b) => (a.round || 0) - (b.round || 0));
      if (!list.length) {
        body.innerHTML = '<div class="mx-card mx-empty"><p>Nessuna gara in calendario.</p></div>';
        return;
      }

      const next = list.find((r) => r.status !== 'completed');
      const done = list.filter((r) => r.status === 'completed').length;
      kicker.hidden = false;
      kicker.innerHTML = `${seasonLabel ? `${seasonLabel} · ` : ''}<span class="mx-num">${done}/${list.length}</span> concluse`;

      body.innerHTML = `
        <ol class="mx-list mx-cal-list" aria-label="Gare della stagione">
          ${list.map((r) => raceRow(r, r === next)).join('')}
        </ol>`;

      // Porta in vista la prossima gara, dopo che la shell ha dato il focus al titolo
      const target = body.querySelector('[data-next]');
      if (target && next.round > 1) {
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        state.raf = requestAnimationFrame(() => {
          state.timeout = setTimeout(() => {
            if (state.disposed || !target.isConnected) return;
            target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
          }, 120);
        });
      }
    };

    await load();

    return () => {
      state.disposed = true;
      cancelAnimationFrame(state.raf);
      clearTimeout(state.timeout);
    };
  },
};
