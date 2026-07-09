/* =============================================================
   ui.js — Utility di interfaccia: toast, modali, loader, DOM
   helpers, formattatori (date, numeri, bandiere), escape HTML.
   ============================================================= */

/* ---------------- DOM helpers ---------------- */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(c));
  }
  return node;
}

/** Escape per prevenire XSS negli inserimenti innerHTML. */
export function esc(str) {
  if (str == null) return '';
  return String(str)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/* ---------------- Loader di pagina ---------------- */
export const loader = {
  hide() {
    const l = $('#app-loader');
    if (!l) return;
    l.classList.add('hide');
    setTimeout(() => l.remove(), 600);
  },
};

/* ---------------- Toast ---------------- */
const TOAST_ICONS = { success: '✓', error: '✕', warning: '!', info: 'i' };
function toastStack() {
  let s = $('.toast-stack');
  if (!s) { s = el('div', { class: 'toast-stack' }); document.body.append(s); }
  return s;
}
export function toast(message, type = 'info', { title, duration = 4200 } = {}) {
  const stack = toastStack();
  const node = el('div', { class: `toast ${type}` }, [
    el('div', { class: 't-ic', text: TOAST_ICONS[type] || 'i' }),
    el('div', { class: 't-body' }, [
      title ? el('div', { class: 't-title', text: title }) : null,
      el('div', { class: 't-msg', text: message }),
    ]),
    el('button', { class: 't-close', html: '&times;', onClick: () => remove() }),
  ]);
  function remove() {
    node.classList.add('leaving');
    setTimeout(() => node.remove(), 300);
  }
  stack.append(node);
  if (duration) setTimeout(remove, duration);
  return remove;
}
toast.success = (m, o) => toast(m, 'success', o);
toast.error = (m, o) => toast(m, 'error', o);
toast.warning = (m, o) => toast(m, 'warning', o);
toast.info = (m, o) => toast(m, 'info', o);

/* ---------------- Modal ---------------- */
/**
 * Apre una modale. content può essere una stringa HTML o un nodo.
 * @returns {{close: fn, root: HTMLElement}}
 */
export function modal({ title = '', content = '', footer = null, size = '', onClose } = {}) {
  const overlay = el('div', { class: 'modal-overlay' });
  const body = typeof content === 'string' ? el('div', { class: 'modal-body', html: content }) : el('div', { class: 'modal-body' }, [content]);
  const modalEl = el('div', { class: `modal ${size}` }, [
    el('div', { class: 'modal-head' }, [
      el('h3', { text: title }),
      el('button', { class: 'modal-close', html: '&times;', onClick: () => close() }),
    ]),
    body,
  ]);
  if (footer) {
    const foot = el('div', { class: 'modal-foot' });
    if (typeof footer === 'string') foot.innerHTML = footer; else foot.append(...[].concat(footer));
    modalEl.append(foot);
  }
  overlay.append(modalEl);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  document.body.append(overlay);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => overlay.classList.add('open'));

  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);

  function close() {
    overlay.classList.remove('open');
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
    setTimeout(() => overlay.remove(), 300);
    onClose?.();
  }
  return { close, root: modalEl, body };
}

/* ---------------- Lightbox (zoom immagine) ---------------- */
/**
 * Mostra un'immagine a schermo intero su sfondo scuro. Si chiude cliccando
 * ovunque, con il tasto ✕ o con ESC.
 * @param {string} src URL immagine
 * @param {{alt?:string}} [opts]
 */
export function lightbox(src, { alt = '' } = {}) {
  const overlay = el('div', {
    class: 'lightbox-overlay',
    style: 'position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.85);backdrop-filter:blur(4px);cursor:zoom-out;opacity:0;transition:opacity .2s;padding:24px',
  });
  const img = el('img', {
    src, alt,
    style: 'max-width:92vw;max-height:88vh;border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.6)',
  });
  const closeBtn = el('button', {
    class: 'lightbox-close', html: '&times;', 'aria-label': 'Chiudi',
    style: 'position:absolute;top:16px;right:22px;font-size:2.4rem;line-height:1;background:none;border:none;color:#fff;cursor:pointer;opacity:.85',
  });
  function close() {
    overlay.style.opacity = '0';
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
    setTimeout(() => overlay.remove(), 200);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  overlay.addEventListener('click', close); // click ovunque (immagine inclusa) chiude
  document.addEventListener('keydown', onKey);
  overlay.append(img, closeBtn);
  document.body.append(overlay);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => (overlay.style.opacity = '1'));
  return { close };
}

/* ---------------- Celebrazione (coriandoli / stelle) ---------------- */
/**
 * Breve animazione a schermo intero (~2s). kind: 'confetti' | 'stars'.
 * Canvas leggero, nessuna dipendenza. Non blocca l'interazione.
 */
export function celebrate(kind = 'confetti', { duration = 2200 } = {}) {
  if (typeof document === 'undefined' || !window.requestAnimationFrame) return;
  // Rispetta chi preferisce meno animazioni.
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = el('canvas', { 'aria-hidden': 'true', style: 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2000' });
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = () => window.innerWidth, H = () => window.innerHeight;
  const resize = () => { canvas.width = W() * dpr; canvas.height = H() * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  resize();
  window.addEventListener('resize', resize);

  const COLORS = ['#e10600', '#ffd54a', '#27F4D2', '#3671C6', '#52E252', '#ff7b76', '#ffffff'];
  const stars = kind === 'stars';
  const N = stars ? 70 : 130;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const parts = Array.from({ length: N }, () => ({
    x: rnd(0, W()), y: rnd(-H() * 0.5, 0),
    vx: rnd(-2.5, 2.5), vy: rnd(2, 6),
    rot: rnd(0, Math.PI * 2), vr: rnd(-0.25, 0.25),
    size: stars ? rnd(9, 20) : rnd(5, 11),
    color: stars ? (Math.random() < 0.5 ? '#ffd54a' : '#fff3b0') : COLORS[(Math.random() * COLORS.length) | 0],
  }));

  function drawStar(x, y, r, rot, color) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.restore();
  }

  const start = performance.now();
  function frame(now) {
    const t = now - start;
    const alpha = t > duration - 500 ? Math.max(0, (duration - t) / 500) : 1;
    ctx.clearRect(0, 0, W(), H());
    ctx.globalAlpha = alpha;
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.rot += p.vr;
      if (stars) {
        drawStar(p.x, p.y, p.size, p.rot, p.color);
      } else {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
    }
    if (t < duration) requestAnimationFrame(frame);
    else { window.removeEventListener('resize', resize); canvas.remove(); }
  }
  requestAnimationFrame(frame);
}

/**
 * Breve animazione con la medaglia della posizione (1/2/3): la medaglia
 * "poppa" al centro con un bagliore e sfuma (~2s). Non blocca l'interazione.
 */
export function medalReveal(position, { duration = 2000 } = {}) {
  if (typeof document === 'undefined' || !('animate' in Element.prototype)) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const META = {
    1: { e: '🥇', c: '#ffd54a', label: '1° posto!' },
    2: { e: '🥈', c: '#c9ced4', label: '2° posto!' },
    3: { e: '🥉', c: '#e0955e', label: '3° posto!' },
  }[position];
  if (!META) return;

  const overlay = el('div', { 'aria-hidden': 'true', style: 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:2000' });
  const glow = el('div', { style: `position:absolute;width:300px;height:300px;border-radius:50%;background:radial-gradient(circle, ${META.c}66, transparent 68%);filter:blur(4px)` });
  const medal = el('div', { text: META.e, style: 'font-size:8.5rem;line-height:1;filter:drop-shadow(0 10px 26px rgba(0,0,0,.55))' });
  const label = el('div', { text: META.label, style: `position:absolute;top:calc(50% + 90px);font-weight:900;font-size:1.35rem;letter-spacing:.02em;color:${META.c};text-shadow:0 2px 10px rgba(0,0,0,.6)` });
  overlay.append(glow, medal, label);
  document.body.append(overlay);

  medal.animate([
    { transform: 'scale(0.2) rotate(-25deg)', opacity: 0 },
    { transform: 'scale(1.18) rotate(8deg)', opacity: 1, offset: 0.35 },
    { transform: 'scale(1) rotate(0deg)', opacity: 1, offset: 0.55 },
    { transform: 'scale(1)', opacity: 1, offset: 0.82 },
    { transform: 'scale(0.9)', opacity: 0 },
  ], { duration, easing: 'cubic-bezier(.2,.8,.2,1)' });
  glow.animate([{ opacity: 0 }, { opacity: 1, offset: 0.4 }, { opacity: 1, offset: 0.82 }, { opacity: 0 }], { duration });
  label.animate([
    { opacity: 0, transform: 'translateY(12px)' },
    { opacity: 0, offset: 0.4 },
    { opacity: 1, transform: 'translateY(0)', offset: 0.6 },
    { opacity: 1, offset: 0.82 },
    { opacity: 0 },
  ], { duration });

  setTimeout(() => overlay.remove(), duration + 80);
  // Un tocco di coriandoli per il gradino più alto.
  if (position === 1) celebrate('confetti', { duration: 1600 });
}

/** Dialog di conferma. Ritorna Promise<boolean>. */
export function confirmDialog({ title = 'Confermi?', message = '', confirmText = 'Conferma', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const btnOk = el('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, text: confirmText });
    const btnNo = el('button', { class: 'btn btn-outline', text: 'Annulla' });
    const m = modal({
      title,
      content: `<p style="color:var(--text-mid)">${esc(message)}</p>`,
      footer: [btnNo, btnOk],
      onClose: () => { if (!done) resolve(false); },
    });
    btnNo.addEventListener('click', () => { done = true; m.close(); resolve(false); });
    btnOk.addEventListener('click', () => { done = true; m.close(); resolve(true); });
  });
}

/* ---------------- Formattatori ---------------- */
const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

export function fmtDate(iso, { withTime = false } = {}) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  const s = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (!withTime) return s;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${s}, ${hh}:${mm}`;
}

export function fmtNum(n, dec = 0) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/** Bandiera emoji da codice ISO a due lettere. */
export function flagEmoji(code) {
  if (!code || code.length !== 2) return '🏁';
  const cc = code.toUpperCase();
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/**
 * Badge degli aiuti alla guida dichiarati dal pilota (ABS · controllo di
 * trazione · cambio). Ritorna una stringa HTML (può essere vuota se l'utente
 * non ha dichiarato aiuti). Pensato per essere mostrato accanto al giro veloce.
 */
export function assistBadges(u) {
  if (!u) return '';
  const out = [];
  // Mostriamo un badge solo quando l'aiuto è ATTIVO.
  if (Number(u.assist_abs)) {
    out.push('<span class="badge gray" title="ABS attivo">🛞 ABS</span>');
  }
  const tc = u.assist_tc;
  if (tc === 'medium' || tc === 'full') {
    out.push(`<span class="badge gray" title="Controllo di trazione: ${tc === 'full' ? 'pieno' : 'medio'}">🎛️ TC${tc === 'full' ? '+' : ''}</span>`);
  }
  // Il cambio automatico è un aiuto; il manuale no → badge solo se automatico.
  if (u.assist_gearbox !== 'manual') {
    out.push('<span class="badge gray" title="Cambio automatico">⚙️ Cambio auto</span>');
  }
  return out.join(' ');
}

/**
 * Collega i controlli `.segmented[data-assist]` ai rispettivi input nascosti
 * (name = data-assist). Inizializza lo stato attivo dal valore corrente
 * dell'input e lo aggiorna al click. Riusato da registrazione e profilo.
 */
export function wireAssists(root = document) {
  root.querySelectorAll('.segmented[data-assist]').forEach((grp) => {
    const name = grp.dataset.assist;
    const hidden = root.querySelector(`input[name="${name}"]`);
    const buttons = [...grp.querySelectorAll('button[data-val]')];
    const sync = (val) => buttons.forEach((b) => b.classList.toggle('active', b.dataset.val === String(val)));
    if (hidden) sync(hidden.value);
    buttons.forEach((b) =>
      b.addEventListener('click', () => {
        if (hidden) hidden.value = b.dataset.val;
        sync(b.dataset.val);
      })
    );
  });
}

/** Ordinale di posizione (1 → 1°). */
export const ordinal = (n) => (n == null ? '—' : `${n}°`);

/** Iniziali per fallback avatar. */
export function initials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

/* ---------------- Query string ---------------- */
export const qs = {
  get: (key, def = null) => new URLSearchParams(location.search).get(key) ?? def,
  set: (obj) => {
    const p = new URLSearchParams(location.search);
    for (const [k, v] of Object.entries(obj)) {
      if (v == null || v === '') p.delete(k); else p.set(k, v);
    }
    history.replaceState(null, '', `${location.pathname}?${p}`);
  },
};

/* ---------------- Reveal on scroll ---------------- */
export function initReveal() {
  const items = $$('.reveal');
  if (!items.length || !('IntersectionObserver' in window)) {
    items.forEach((i) => i.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  items.forEach((i) => io.observe(i));
}

/* ---------------- Debounce ---------------- */
export function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ---------------- Countdown ---------------- */
/** Restituisce {d,h,m,s,past} verso una data ISO. */
export function countdownParts(iso) {
  const target = new Date(iso).getTime();
  const diff = target - Date.now();
  if (isNaN(target)) return { d: 0, h: 0, m: 0, s: 0, past: true };
  if (diff <= 0) return { d: 0, h: 0, m: 0, s: 0, past: true };
  const s = Math.floor(diff / 1000);
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
    past: false,
  };
}
