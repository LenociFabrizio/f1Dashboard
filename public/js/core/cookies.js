/* =============================================================
   cookies.js — Banner informativo cookie/archiviazione tecnica.
   Il sito usa solo storage tecnico necessario (JWT di sessione,
   cache profilo): non c'è profilazione, quindi il banner è
   informativo con un semplice "Accetto".
   ============================================================= */
const KEY = 'f1_cookie_consent';

export function hasCookieConsent() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

/** Mostra il banner cookie se non è già stato accettato. */
export function mountCookieBanner() {
  if (hasCookieConsent()) return;
  if (document.getElementById('cookie-banner')) return;

  const bar = document.createElement('div');
  bar.className = 'cookie-banner';
  bar.id = 'cookie-banner';
  bar.setAttribute('role', 'dialog');
  bar.setAttribute('aria-label', 'Informativa cookie');
  bar.innerHTML = `
    <div class="cookie-inner">
      <div class="cookie-text">
        🍪 Usiamo solo cookie e archiviazione tecnica <strong>necessari</strong> per il login e il
        funzionamento del sito. Nessun tracciamento pubblicitario o di profilazione.
        Leggi la <a href="/privacy.html">Privacy &amp; Cookie Policy</a>.
      </div>
      <div class="cookie-actions">
        <a href="/privacy.html" class="btn btn-outline btn-sm">Dettagli</a>
        <button class="btn btn-primary btn-sm" id="cookie-accept" type="button">Accetto</button>
      </div>
    </div>`;
  document.body.appendChild(bar);
  requestAnimationFrame(() => bar.classList.add('show'));

  const close = () => { bar.classList.remove('show'); setTimeout(() => bar.remove(), 300); };
  bar.querySelector('#cookie-accept').addEventListener('click', () => {
    try { localStorage.setItem(KEY, new Date().toISOString()); } catch { /* storage non disponibile */ }
    close();
  });
}

export default mountCookieBanner;
