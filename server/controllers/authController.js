/**
 * authController.js
 * ------------------------------------------------------------
 * Registrazione, login classico, login OAuth mock (PSN/EA),
 * "password dimenticata" (mock), profilo corrente.
 *
 * NOTA OAUTH: le funzioni loginPsn/loginEa simulano il flusso.
 * In futuro basterà sostituire la generazione mock con lo scambio
 * reale del code OAuth (vedi commenti "TODO OAuth reale").
 * ------------------------------------------------------------
 */
import bcrypt from 'bcryptjs';
import db from '../database/db.js';
import { signToken } from '../utils/jwt.js';
import { asyncHandler, HttpError, sanitizeUser } from '../utils/helpers.js';
import { ROLES, PROVIDERS } from '../utils/constants.js';

/** Crea la risposta standard con token + utente. */
function authResponse(res, user) {
  const token = signToken({ id: user.id, role: user.role });
  res.json({ token, user: sanitizeUser(user) });
}

/** POST /api/auth/register */
export const register = asyncHandler(async (req, res) => {
  const { username, display_name, email, password, team_id, reserve_driver } = req.body;
  if (!username || !password || !email) {
    throw new HttpError(400, 'Username, email e password sono obbligatori');
  }
  if (!team_id || !reserve_driver) {
    throw new HttpError(400, 'Scuderia e pilota di riserva (BOT) sono obbligatori');
  }
  const exists = await db
    .prepare('SELECT id FROM users WHERE username = ? OR email = ?')
    .get(username, email);
  if (exists) throw new HttpError(409, 'Username o email già registrati');

  // Il pilota di riserva (BOT) è assegnabile a un solo utente
  const reservedBy = await db
    .prepare('SELECT id FROM users WHERE reserve_driver = ?')
    .get(reserve_driver);
  if (reservedBy) throw new HttpError(409, 'Questo pilota di riserva è già stato scelto da un altro utente');

  const hash = await bcrypt.hash(password, 10);
  const info = await db
    .prepare(
      `INSERT INTO users (username, display_name, email, password_hash, role, provider, team_id, reserve_driver)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(username, display_name || username, email, hash, ROLES.PILOTA, PROVIDERS.LOCAL, team_id || null, reserve_driver || null);

  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  authResponse(res, user);
});

/** POST /api/auth/login  (email/username + password) */
export const login = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body; // identifier = email o username
  if (!identifier || !password) throw new HttpError(400, 'Credenziali mancanti');

  const user = await db
    .prepare('SELECT * FROM users WHERE (email = ? OR username = ?) AND is_active = 1')
    .get(identifier, identifier);

  if (!user || !user.password_hash) throw new HttpError(401, 'Credenziali non valide');
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw new HttpError(401, 'Credenziali non valide');

  authResponse(res, user);
});

/**
 * Login OAuth simulato. Crea/riusa un utente collegato al provider.
 * @param {string} provider 'psn' | 'ea'
 */
function mockOAuthLogin(provider) {
  return asyncHandler(async (req, res) => {
    // TODO OAuth reale: qui riceveremmo `code`, lo scambieremmo per un
    // access_token presso Sony/EA e recupereremmo il profilo utente.
    const { handle } = req.body; // il "gamertag" mock scelto dall'utente
    const gamertag = (handle || `${provider}_player`).trim();
    const providerId = `${provider}:${gamertag.toLowerCase()}`;

    let user = await db
      .prepare('SELECT * FROM users WHERE provider = ? AND provider_id = ?')
      .get(provider, providerId);

    if (!user) {
      // Genera username unico
      let username = gamertag.replace(/[^a-z0-9_]/gi, '').toLowerCase() || `${provider}user`;
      const clash = await db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (clash) username = `${username}_${Date.now().toString().slice(-4)}`;

      const info = await db
        .prepare(
          `INSERT INTO users (username, display_name, role, provider, provider_id, avatar)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(username, gamertag, ROLES.PILOTA, provider, providerId, '/images/avatars/default.svg');
      user = await db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    }

    authResponse(res, user);
  });
}

/** POST /api/auth/psn */
export const loginPsn = mockOAuthLogin(PROVIDERS.PSN);
/** POST /api/auth/ea */
export const loginEa = mockOAuthLogin(PROVIDERS.EA);

/** POST /api/auth/forgot-password (mock) */
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  // In un sistema reale invieremmo un'email con un token di reset.
  // Qui rispondiamo sempre 200 per non rivelare l'esistenza dell'account.
  res.json({
    message:
      'Se l\'indirizzo è associato a un account, riceverai le istruzioni per il reset. (Simulazione)',
    demo_hint: email ? `Reset simulato per ${email}` : undefined,
  });
});

/** GET /api/auth/me */
export const me = asyncHandler(async (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});
