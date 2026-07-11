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

/** Compone il nome visualizzato "Nome Cognome" da parti separate. */
export function fullName(first, last) {
  return [first, last].map((s) => (s || '').trim()).filter(Boolean).join(' ');
}

/**
 * Frammenti SQL riutilizzabili per esporre il nome pubblico "@handle",
 * cioè il nickname di gioco PRIMARIO dell'utente (game_identities.is_primary).
 * Uso: `SELECT ..., ${HANDLE_SELECT} FROM users u ${PRIMARY_HANDLE_JOIN}`.
 * Richiede che la tabella utenti sia aliasata come `u`.
 */
export const PRIMARY_HANDLE_JOIN =
  'LEFT JOIN game_identities gph ON gph.user_id = u.id AND gph.is_primary = 1';
export const HANDLE_SELECT = 'gph.handle AS handle';

/** Arrotonda a n decimali restituendo un numero. */
export function round(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) return 0;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
