/* =============================================================
   icons.js — Icone SVG inline della vista app (stile iOS/SF):
   griglia 24×24, tratto 1.75px, stroke="currentColor", nessun
   riempimento. Decorative per default (aria-hidden).
   Uso: icon('trophy', 22) → stringa SVG da inserire via innerHTML.
   ============================================================= */

/* Solo il contenuto interno dell'<svg>: il wrapper è comune. */
const PATHS = {
  trophy:
    '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>' +
    '<path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>' +
    '<path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>' +
    '<path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  calendar:
    '<rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M8 2.5v4"/><path d="M16 2.5v4"/>' +
    '<path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/>' +
    '<path d="M8 17.5h.01"/><path d="M12 17.5h.01"/>',
  chart:
    '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  gear:
    '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>' +
    '<circle cx="12" cy="12" r="3"/>',
  home:
    '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9"/><path d="M10 21v-6h4v6"/>',
  user:
    '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  flag:
    '<path d="M4 22V4"/><path d="M4 4c3-2 6 2 9 0s6 2 7 1v10c-1 1-4-3-7-1s-6-2-9 0"/>',
  clock:
    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin:
    '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  refresh:
    '<path d="M20 11a8 8 0 1 0-2.34 5.66"/><path d="M20 4v7h-7"/>',
  alert:
    '<path d="M10.3 3.9 2.5 17.5A2 2 0 0 0 4.2 20.5h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>' +
    '<path d="M12 9.5v4"/><path d="M12 17h.01"/>',
  logout:
    '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  close: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
  external:
    '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
};

/**
 * Restituisce l'SVG dell'icona richiesta come stringa.
 * @param {string} name  chiave di PATHS
 * @param {number} [size=22] lato in px
 * @param {{label?:string, cls?:string}} [opts] label → icona significativa (role="img")
 */
export function icon(name, size = 22, { label = '', cls = '' } = {}) {
  const inner = PATHS[name];
  if (!inner) return '';
  const a11y = label
    ? `role="img" aria-label="${String(label).replaceAll('"', '&quot;')}"`
    : 'aria-hidden="true" focusable="false"';
  return (
    `<svg class="mx-ic${cls ? ' ' + cls : ''}" ${a11y} width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    'fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' +
    inner +
    '</svg>'
  );
}

export default icon;
