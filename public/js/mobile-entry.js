/* =============================================================
   mobile-entry.js — Ingresso nella vista app da telefono.
   Script CLASSICO (non modulo) caricato in <head> per evitare il
   flash della pagina classica:
   - telefono + loggato + nessuna preferenza "classic" → /app.html
   - telefono + loggato + preferenza "classic" → pillola in basso
     "Passa alla vista app" che rimuove la preferenza.
   ============================================================= */
(function () {
  try {
    var isPhone = window.matchMedia && window.matchMedia('(max-width: 720px)').matches;
    if (!isPhone) return;
    var ls = window.localStorage;
    if (!ls || !ls.getItem('f1_token')) return;

    if (ls.getItem('f1_view') !== 'classic') {
      location.replace('/app.html');
      return;
    }

    var addPill = function () {
      try {
        if (document.getElementById('mx-entry-pill')) return;
        var b = document.createElement('button');
        b.type = 'button';
        b.id = 'mx-entry-pill';
        b.textContent = 'Passa alla vista app';
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
      } catch (e) {}
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addPill);
    else addPill();
  } catch (e) {}
})();
