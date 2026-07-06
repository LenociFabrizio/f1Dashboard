/**
 * helpers.js
 * ------------------------------------------------------------
 * Funzioni di utilità generiche lato server.
 * ------------------------------------------------------------
 */

/** Wrapper per gestire errori async nei controller senza try/catch ripetuti. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/** Crea un errore HTTP con status code. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Timestamp ISO corrente (UTC). */
export const now = () => new Date().toISOString();

/** Slugify semplice per URL. */
export function slugify(str = '') {
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Rimuove campi sensibili da un oggetto utente prima di inviarlo al client. */
export function sanitizeUser(user) {
  if (!user) return null;
  const { password_hash, ...safe } = user;
  return safe;
}

/** Arrotonda a n decimali restituendo un numero. */
export function round(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) return 0;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
