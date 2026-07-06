/**
 * auth.js (middleware)
 * ------------------------------------------------------------
 * Autenticazione (JWT) e autorizzazione (ruoli).
 * ------------------------------------------------------------
 */
import { verifyToken } from '../utils/jwt.js';
import { HttpError } from '../utils/helpers.js';
import db from '../database/db.js';
import { ROLES } from '../utils/constants.js';

/** Estrae il token da header Authorization o cookie. */
function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  if (req.cookies && req.cookies.token) return req.cookies.token;
  return null;
}

/**
 * Richiede un utente autenticato. Popola req.user con il record dal DB.
 */
export async function requireAuth(req, _res, next) {
  const token = extractToken(req);
  if (!token) return next(new HttpError(401, 'Autenticazione richiesta'));
  try {
    const payload = verifyToken(token);
    const user = await db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(payload.id);
    if (!user) return next(new HttpError(401, 'Utente non valido'));
    req.user = user;
    next();
  } catch {
    next(new HttpError(401, 'Token non valido o scaduto'));
  }
}

/**
 * Autenticazione opzionale: se il token è presente e valido popola req.user,
 * altrimenti prosegue senza errore. Utile per endpoint pubblici arricchiti.
 */
export async function optionalAuth(req, _res, next) {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const payload = verifyToken(token);
    const user = await db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(payload.id);
    if (user) req.user = user;
  } catch {
    /* ignora token invalido in modalità opzionale */
  }
  next();
}

/** Richiede il ruolo admin (usare dopo requireAuth). */
export function requireAdmin(req, _res, next) {
  if (!req.user || req.user.role !== ROLES.ADMIN) {
    return next(new HttpError(403, 'Accesso riservato agli amministratori'));
  }
  next();
}
