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

/**
 * Whitelist dei campi utente esponibili PUBBLICAMENTE (profilo pilota).
 * Approccio a whitelist: ogni nuova colonna di `users` resta privata finché
 * non viene aggiunta qui esplicitamente. Mai email, credenziali o campi interni.
 * Gli aiuti alla guida (assist_*) sono pubblici per scelta: GET /api/races/:id
 * li mostra già come badge accanto al giro veloce.
 */
export const PUBLIC_USER_FIELDS = [
  'id', 'handle', 'display_name', 'first_name', 'last_name', 'avatar',
  'nationality', 'favorite_number', 'favorite_driver', 'reserve_driver',
  'biography', 'role', 'team_id', 'team_name', 'team_color', 'team_logo',
  'assist_abs', 'assist_tc', 'assist_gearbox',
  'platforms', 'created_at',
];

/** Campi aggiuntivi visibili solo al diretto interessato o a un admin. */
export const PRIVATE_USER_FIELDS = ['email'];

/**
 * Proietta una riga utente sui soli campi pubblici.
 * Con { includePrivate: true } aggiunge anche PRIVATE_USER_FIELDS
 * (da usare solo se il richiedente è lo stesso utente o un admin).
 */
export function toPublicUser(row, { includePrivate = false } = {}) {
  if (!row) return null;
  const fields = includePrivate ? [...PUBLIC_USER_FIELDS, ...PRIVATE_USER_FIELDS] : PUBLIC_USER_FIELDS;
  const out = {};
  for (const f of fields) if (row[f] !== undefined) out[f] = row[f];
  return out;
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
