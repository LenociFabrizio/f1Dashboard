/* =============================================================
   views/_shared.js — Helper comuni alle viste della app mobile
   (formattazione, colori team, riepilogo, avatar, stato errore).
   Non è una vista: non va registrato in views/index.js.
   ============================================================= */
import api from '../../core/api.js';
import { esc } from '../../core/ui.js';
import { icon } from '../icons.js';

export const DEFAULT_AVATAR = '/images/avatars/default.svg';

/** Chiave e fetcher del riepilogo: gli stessi usati dalla shell. */
export const SUMMARY_KEY = 'summary';

/** Riepilogo aggiornato dallo store (immediato se in cache). */
export const getSummary = (ctx) => ctx.store.get(SUMMARY_KEY, () => api.get('/dashboard/mobile'));

/** Punti con al massimo un decimale (i punti possono essere frazionari). */
export const pts = (n) =>
  (n == null || isNaN(n) ? '0' : Number(n).toLocaleString('it-IT', { maximumFractionDigits: 1 }));

/** Colore team solo se esadecimale valido (finisce in un attributo style). */
export const teamColor = (c, fallback = 'var(--text-dim)') =>
  (/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : fallback);

/** Nome GP compatto per il telefono. */
export const gpName = (n) => String(n || '').replace(/^Gran Premio /i, 'GP ');

/** Etichetta della stagione ("Stagione 2026" se manca il nome). */
export const seasonLabel = (season) =>
  (season ? season.name || `Stagione ${season.year ?? ''}`.trim() : '');

export const reduceMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Avatar mancanti o rotti → immagine di default (niente handler inline). */
export function bindAvatarFallback(root, selector = 'img') {
  root.querySelectorAll(selector).forEach((img) =>
    img.addEventListener('error', () => {
      if (!img.src.endsWith(DEFAULT_AVATAR)) img.src = DEFAULT_AVATAR;
    }, { once: true })
  );
}

/**
 * Blocco di errore con pulsante "Riprova".
 * @param {string} msg  titolo dell'errore
 * @param {() => void} onRetry
 * @param {string} [detail]  dettaglio (es. messaggio dell'API)
 * @returns {HTMLElement}
 */
export function errorBlock(msg, onRetry, detail = '') {
  const box = document.createElement('div');
  box.className = 'mx-card mx-empty';
  box.setAttribute('role', 'alert');
  box.innerHTML = `
    <span class="mx-empty-icon">${icon('alert', 28)}</span>
    <p class="mx-empty-title">${esc(msg)}</p>
    ${detail ? `<p>${esc(detail)}</p>` : ''}
    <button type="button" class="mx-btn">${icon('refresh', 18)}<span>Riprova</span></button>`;
  const btn = box.querySelector('button');
  btn.addEventListener('click', () => {
    btn.disabled = true;
    onRetry();
  }, { once: true });
  return box;
}
