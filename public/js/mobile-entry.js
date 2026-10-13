/* =============================================================
   mobile-entry.js — Ingresso nella vista app da telefono.
   Script CLASSICO (non modulo) caricato in <head> per evitare il
   flash della pagina classica. "Telefono" = schermo stretto E
   touch senza hover (un desktop con finestra stretta non conta);
   "loggato" = JWT presente e non scaduto (exp letto dal payload,
   senza verifica della firma: la decide comunque il server).
   Modalità predefinita (index, dashboard):
   - nessuna preferenza "classic" → /app.html
   - preferenza "classic" → pillola "Passa alla vista app"
   Modalità solo-pillola (data-mode="pill" sul tag script, pagine
   interne): mai redirect, pillola "Torna all'app".
   Il tap sulla pillola rimuove la preferenza e apre /app.html.
   La pillola resta nascosta finché c'è il banner cookie, per non
   coprirne i bottoni.
   ============================================================= */
(function () {
  try {
    var script = document.currentScript;
    var pillOnly = !!(script && script.dataset && script.dataset.mode === 'pill');

    var isPhone = window.matchMedia &&
      window.matchMedia('(max-width: 720px) and (hover: none) and (pointer: coarse)').matches;
    if (!isPhone) return;

    var ls = window.localStorage;
    if (!ls || !tokenValid(ls.getItem('f1_token'))) return;

    if (!pillOnly && ls.getItem('f1_view') !== 'classic') {
      location.replace('/app.html');
      return;
    }

    var label = pillOnly ? 'Torna all’app' : 'Passa alla vista app';
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { addPill(label); });
    } else {
      addPill(label);
    }
  } catch (e) {}

  /* exp del JWT (secondi) ancora nel futuro; payload illeggibile = non valido */
  function tokenValid(t) {
    try {
      if (!t) return false;
      var part = t.split('.')[1];
      if (!part) return false;
      var b64 = part.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      var payload = JSON.parse(atob(b64));
      return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now();
    } catch (e) {
      return false;
    }
  }

  function addPill(label) {
    try {
      if (document.getElementById('mx-entry-pill')) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.id = 'mx-entry-pill';
      b.textContent = label;
      b.style.cssText = [
        'position:fixed',
        'left:50%',
        'transform:translateX(-50%)',
        'bottom:calc(16px + env(safe-area-inset-bottom, 0px))',
        'z-index:9999',
        'min-height:44px',
        'padding:10px 20px',
        'border-radius:999px',
        'border:1px solid rgba(255,255,255,0.14)',
        'background:rgba(22,22,28,0.78)',
        '-webkit-backdrop-filter:blur(14px)',
        'backdrop-filter:blur(14px)',
        'color:#fff',
        "font:700 0.92rem/1 'Titillium Web',system-ui,sans-serif",
        'letter-spacing:0.02em',
        'white-space:nowrap',
        'box-shadow:0 18px 50px rgba(0,0,0,0.55)',
        'cursor:pointer',
      ].join(';');
      b.addEventListener('click', function () {
        try { localStorage.removeItem('f1_view'); } catch (e) {}
        location.href = '/app.html';
      });
      document.body.appendChild(b);

      // Banner cookie (figlio diretto del body, rimosso alla chiusura):
      // finché esiste la pillola resta nascosta
      var sync = function () { b.hidden = !!document.querySelector('body > .cookie-banner'); };
      sync();
      if (window.MutationObserver) new MutationObserver(sync).observe(document.body, { childList: true });
    } catch (e) {}
  }
})();
