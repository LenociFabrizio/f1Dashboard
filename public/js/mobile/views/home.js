/* =============================================================
   home.js — Vista "Home" della SPA mobile: posizione del pilota,
   scuderia, prossimo GP con countdown live.
   Dati: riepilogo dallo store (GET /api/dashboard/mobile, chiave
   'summary'), ogni blocco può essere null.
   ============================================================= */
import { esc, fmtDate, parseDbDate, flagEmoji, countdownParts } from '../../core/ui.js';
import { handleAuthError } from '../session.js';
import { pts, teamColor, gpName, seasonLabel, getSummary, errorBlock } from './_shared.js';

function seasonKicker(season) {
  const label = seasonLabel(season);
  const total = season.total_rounds || 0;
  const done = season.completed_rounds || 0;
  // Round corrente = il prossimo da correre, fermo all'ultimo a stagione finita
  const current = total ? Math.min(done + 1, total) : 0;
  return `${esc(label)}${total ? ` · Round ${current}/${total}` : ''}`;
}

function lastResultLine(last) {
  const r = last?.my_result;
  if (!r) return '';
  const res = r.dnf ? '<span class="mx-home-dnf">DNF</span>' : `P${esc(r.position)}`;
  const gained = r.points ? ` · +${pts(r.points)} pt` : '';
  return `
    <span class="mx-home-last">
      <span class="mx-home-last-label">Ultimo GP</span>
      <span class="mx-home-flag" aria-hidden="true">${flagEmoji(last.country_code)}</span>
      <span class="mx-home-last-val mx-num">${res}${gained}</span>
    </span>`;
}

function driverCard(s) {
  const d = s.driver;
  if (!d) {
    const ld = s.leaders?.driver;
    return `
      <section class="mx-card mx-home-card" aria-labelledby="mx-home-drv-h">
        <h2 class="mx-home-label" id="mx-home-drv-h">Classifica piloti</h2>
        <p class="mx-home-empty-msg">Non sei ancora in classifica</p>
        ${ld ? `
          <button type="button" class="mx-home-leader" data-go="classifica">
            <span class="mx-home-leader-label">Leader</span>
            <span class="mx-home-leader-name">${esc(ld.display_name || ld.handle || 'Pilota')}</span>
            <span class="mx-num mx-home-leader-pts">${pts(ld.points)} pt</span>
          </button>` : ''}
      </section>`;
  }

  const gaps = [];
  if (d.gap_to_leader > 0) gaps.push(`<span class="mx-num">−${pts(d.gap_to_leader)}</span> dal leader`);
  else gaps.push('Leader del campionato');
  if (d.gap_to_ahead != null && d.position > 1) {
    gaps.push(`<span class="mx-num">−${pts(d.gap_to_ahead)}</span> da P${esc(d.position - 1)}`);
  }

  return `
    <button type="button" class="mx-card mx-home-card mx-home-tap mx-home-driver" data-go="classifica">
      <span class="mx-home-label">La tua posizione</span>
      <span class="mx-home-hero">
        <span class="mx-home-pos ${d.position <= 3 ? 'mx-home-pos--p' + d.position : ''}"><small>P</small>${esc(d.position)}</span>
        <span class="mx-home-of mx-num">/ ${esc(d.total)}</span>
      </span>
      <span class="mx-home-points"><b class="mx-num">${pts(d.points)}</b> punti</span>
      <span class="mx-home-gaps">${gaps.map((g) => `<span>${g}</span>`).join('')}</span>
      ${lastResultLine(s.last_race)}
      <span class="sr-only">Apri la classifica</span>
    </button>`;
}

function teamCard(s) {
  const t = s.team;
  if (!t) {
    const lt = s.leaders?.team;
    return `
      <section class="mx-card mx-home-card" aria-labelledby="mx-home-team-h">
        <h2 class="mx-home-label" id="mx-home-team-h">Scuderia</h2>
        <p class="mx-home-empty-msg">Nessuna scuderia assegnata</p>
        ${lt ? `
          <div class="mx-home-leader">
            <span class="mx-home-leader-label">Leader</span>
            <span class="mx-team-bar" style="--team:${teamColor(lt.team_color)}" aria-hidden="true"></span>
            <span class="mx-home-leader-name">${esc(lt.team_name)}</span>
            <span class="mx-num mx-home-leader-pts">${pts(lt.points)} pt</span>
          </div>` : ''}
      </section>`;
  }
  const pos = t.position != null
    ? `<span class="mx-num mx-home-team-pos">P${esc(t.position)}<small> / ${esc(t.total)}</small></span>`
    : '<span class="mx-home-team-pos mx-home-muted">—</span>';
  return `
    <section class="mx-card mx-home-card mx-home-team" aria-labelledby="mx-home-team-h">
      <h2 class="mx-home-label" id="mx-home-team-h">La tua scuderia</h2>
      <div class="mx-home-team-row">
        <span class="mx-team-bar" style="--team:${teamColor(t.team_color)}" aria-hidden="true"></span>
        <span class="mx-home-team-name">${esc(t.team_name)}</span>
        ${pos}
      </div>
      <div class="mx-home-points"><b class="mx-num">${pts(t.points)}</b> punti</div>
    </section>`;
}

function nextRaceCard(s) {
  const r = s.next_race;
  if (!r) {
    return `
      <section class="mx-card mx-home-card" aria-labelledby="mx-home-next-h">
        <h2 class="mx-home-label" id="mx-home-next-h">Prossimo GP</h2>
        <p class="mx-home-empty-msg">Stagione conclusa</p>
      </section>`;
  }
  return `
    <button type="button" class="mx-card mx-card--accent mx-home-card mx-home-tap mx-home-next" data-go="calendario">
      <span class="mx-home-label mx-home-label--red">Prossimo GP · R${esc(r.round)}</span>
      <span class="mx-home-next-head">
        <span class="mx-home-next-flag" aria-hidden="true">${flagEmoji(r.country_code)}</span>
        <span class="mx-home-next-text">
          <span class="mx-home-next-name">${esc(gpName(r.name))}</span>
          ${r.circuit_name ? `<span class="mx-home-next-sub">${esc(r.circuit_name)}</span>` : ''}
          <span class="mx-home-next-sub mx-home-next-date mx-num">${esc(fmtDate(r.race_date, { withTime: true }))}</span>
        </span>
      </span>
      <span class="mx-home-cd" role="timer" data-cd></span>
      <span class="sr-only">Apri il calendario</span>
    </button>`;
}

/** Avvia il countdown live; restituisce l'id dell'intervallo (o null). */
function startCountdown(box, raceDate) {
  if (!box || !raceDate) return null;
  const target = parseDbDate(raceDate);
  if (isNaN(target)) { box.remove(); return null; }
  const iso = target.toISOString();
  let timer = null;
  const tick = () => {
    if (!box.isConnected) { clearInterval(timer); return; }
    const c = countdownParts(iso);
    if (c.past) {
      box.innerHTML = '<span class="mx-home-cd-live"><span class="mx-home-live-dot" aria-hidden="true"></span>In corso o in attesa dei risultati</span>';
      clearInterval(timer);
      return;
    }
    box.innerHTML = [['g', c.d], ['h', c.h], ['m', c.m], ['s', c.s]]
      .map(([u, v]) => `<span class="mx-home-cd-cell"><b class="mx-num">${String(v).padStart(2, '0')}</b><span>${u}</span></span>`)
      .join('');
  };
  tick();
  timer = setInterval(tick, 1000);
  return timer;
}

function renderError(root, message, retry) {
  root.innerHTML = `
    <div class="mx-home">
      <h1 class="mx-title sr-only" tabindex="-1">Home</h1>
    </div>`;
  root.firstElementChild.append(errorBlock('Impossibile caricare il riepilogo.', retry, message));
}

/** Disegna la vista con il riepilogo; restituisce l'id del timer countdown. */
function draw(root, s, ctx) {
  if (!s?.season) {
    root.innerHTML = `
      <div class="mx-home">
        <h1 class="mx-title sr-only" tabindex="-1">Home</h1>
        <div class="mx-card mx-empty mx-home-state"><p>Nessuna stagione attiva</p></div>
      </div>`;
    return null;
  }

  root.innerHTML = `
    <div class="mx-home">
      <p class="mx-kicker">${seasonKicker(s.season)}</p>
      <h1 class="mx-title sr-only" tabindex="-1">Home</h1>
      ${driverCard(s)}
      ${teamCard(s)}
      ${nextRaceCard(s)}
    </div>`;

  root.querySelectorAll('[data-go]').forEach((b) =>
    b.addEventListener('click', () => ctx.navigate(b.dataset.go))
  );

  return s.next_race ? startCountdown(root.querySelector('[data-cd]'), s.next_race.race_date) : null;
}

export default {
  route: 'home',
  title: 'Home',
  async render(root, ctx) {
    // Stato condiviso fra primo caricamento e "Riprova": il cleanup restituito
    // alla shell ferma sempre il timer corrente.
    const state = { timer: null, disposed: false };

    const load = async () => {
      root.innerHTML = `
        <div class="mx-home" aria-busy="true">
          <h1 class="mx-title sr-only" tabindex="-1">Home</h1>
          <div class="mx-skeleton mx-home-sk mx-home-sk--lg"></div>
          <div class="mx-skeleton mx-home-sk"></div>
          <div class="mx-skeleton mx-home-sk"></div>
        </div>`;
      try {
        // Sempre dallo store: ctx.summary può essere datato, la cache risponde subito
        const s = await getSummary(ctx);
        if (!state.disposed) state.timer = draw(root, s, ctx);
      } catch (e) {
        if (state.disposed || handleAuthError(e)) return;
        renderError(root, e?.message, load);
      }
    };

    await load();

    return () => {
      state.disposed = true;
      if (state.timer) clearInterval(state.timer);
    };
  },
};
