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
import crypto from 'node:crypto';
import db from '../database/db.js';
import { signToken } from '../utils/jwt.js';
import { asyncHandler, HttpError, sanitizeUser, fullName } from '../utils/helpers.js';
import { ROLES, PROVIDERS } from '../utils/constants.js';
import { config } from '../config/config.js';
import { sendPasswordResetEmail } from '../utils/mailer.js';

/** SHA-256 (hex) del token di reset: nel DB salviamo solo l'hash. */
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/** Crea la risposta standard con token + utente (con handle pubblico). */
async function authResponse(res, user) {
  const token = signToken({ id: user.id, role: user.role });
  const primary = await db
    .prepare('SELECT handle FROM game_identities WHERE user_id = ? AND is_primary = 1')
    .get(user.id);
  res.json({ token, user: { ...sanitizeUser(user), handle: primary?.handle || null } });
}

/** POST /api/auth/register */
export const register = asyncHandler(async (req, res) => {
  const { first_name, last_name, email, password, team_id, reserve_driver } = req.body;
  // Il nome pubblico "@handle" è il nickname di gioco (F1 25): obbligatorio.
  const handle = String(req.body.handle || '').trim();
  const platform = String(req.body.platform || '').trim();
  if (!handle || !password || !email) {
    throw new HttpError(400, 'Nickname di gioco, email e password sono obbligatori');
  }
  // Aiuti alla guida dichiarati (opzionali): normalizzati a valori noti.
  const assist_abs = req.body.assist_abs ? 1 : 0;
  const assist_tc = ['off', 'medium', 'full'].includes(req.body.assist_tc) ? req.body.assist_tc : 'off';
  const assist_gearbox = req.body.assist_gearbox === 'manual' ? 'manual' : 'auto';
  if (!first_name || !last_name) {
    throw new HttpError(400, 'Nome e cognome sono obbligatori');
  }
  if (!team_id || !reserve_driver) {
    throw new HttpError(400, 'Scuderia e pilota di riserva (BOT) sono obbligatori');
  }
  const display_name = fullName(first_name, last_name);
  const emailExists = await db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (emailExists) throw new HttpError(409, 'Email già registrata');
  // Il nickname di gioco è univoco per piattaforma.
  const handleExists = await db
    .prepare('SELECT id FROM game_identities WHERE platform = ? AND handle = ?')
    .get(platform, handle);
  if (handleExists) throw new HttpError(409, 'Questo nickname di gioco è già in uso');

  // Il pilota di riserva (BOT) è assegnabile a un solo utente
  const reservedBy = await db
    .prepare('SELECT id FROM users WHERE reserve_driver = ?')
    .get(reserve_driver);
  if (reservedBy) throw new HttpError(409, 'Questo pilota di riserva è già stato scelto da un altro utente');

  const hash = await bcrypt.hash(password, 10);
  const info = await db
    .prepare(
      `INSERT INTO users (display_name, first_name, last_name, email, password_hash, role, provider, team_id, reserve_driver, assist_abs, assist_tc, assist_gearbox)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(display_name || handle, first_name.trim(), last_name.trim(), email, hash, ROLES.PILOTA, PROVIDERS.LOCAL, team_id || null, reserve_driver || null, assist_abs, assist_tc, assist_gearbox);

  // Registra il nickname di gioco come handle PRIMARIO (nome pubblico + telemetria).
  await db
    .prepare(
      `INSERT INTO game_identities (user_id, platform, handle, source, is_primary)
       VALUES (?, ?, ?, 'profile', 1)`
    )
    .run(info.lastInsertRowid, platform, handle);

  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  await authResponse(res, user);
});

/** POST /api/auth/login  (email + password) */
export const login = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body; // identifier = email
  const email = String(identifier || '').trim();
  if (!email || !password) throw new HttpError(400, 'Credenziali mancanti');

  const user = await db
    .prepare('SELECT * FROM users WHERE email = ? AND is_active = 1')
    .get(email);

  if (!user || !user.password_hash) throw new HttpError(401, 'Credenziali non valide');
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw new HttpError(401, 'Credenziali non valide');

  await authResponse(res, user);
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
      const info = await db
        .prepare(
          `INSERT INTO users (display_name, role, provider, provider_id, avatar)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(gamertag, ROLES.PILOTA, provider, providerId, '/images/avatars/default.svg');
      user = await db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
      // Il gamertag diventa il nickname di gioco primario (nome pubblico "@handle").
      const platform = provider === PROVIDERS.PSN ? 'playstation' : 'origin';
      await db
        .prepare(
          `INSERT INTO game_identities (user_id, platform, handle, source, is_primary)
           VALUES (?, ?, ?, 'profile', 1)
           ON CONFLICT (platform, handle) DO NOTHING`
        )
        .run(user.id, platform, gamertag);
    }

    await authResponse(res, user);
  });
}

/** POST /api/auth/psn */
export const loginPsn = mockOAuthLogin(PROVIDERS.PSN);
/** POST /api/auth/ea */
export const loginEa = mockOAuthLogin(PROVIDERS.EA);

/**
 * POST /api/auth/forgot-password
 * Genera un token di reset, lo salva (solo hash) e invia l'email con il link.
 * Risponde SEMPRE 200 per non rivelare se l'email esiste (anti-enumeration).
 */
export const forgotPassword = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim();
  const genericMessage =
    'Richiesta registrata. Se l\'indirizzo è associato a un account, un amministratore ti fornirà a breve il link per reimpostare la password.';

  // Solo account "local" con email e password possono usare il reset.
  const user = email
    ? await db
        .prepare(
          "SELECT * FROM users WHERE email = ? AND is_active = 1 AND provider = 'local' AND password_hash IS NOT NULL"
        )
        .get(email)
    : null;

  if (!user) {
    // Nessun account: rispondiamo comunque generico (senza rivelare nulla).
    return res.json({ message: genericMessage });
  }

  // Token in chiaro (nell'URL) + hash salvato nel DB. Scadenza 1 ora, uso singolo.
  const token = crypto.randomBytes(32).toString('hex');
  await db
    .prepare('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL')
    .run(user.id); // invalida eventuali richieste precedenti non usate
  await db
    .prepare(
      "INSERT INTO password_resets (user_id, token_hash, token_plain, expires_at) VALUES (?, ?, ?, datetime('now', '+1 hour'))"
    )
    .run(user.id, hashToken(token), token);

  const base = config.clientUrl.replace(/\/+$/, '');
  const resetUrl = `${base}/reset-password.html?token=${token}`;

  let sent = { delivered: false };
  try {
    sent = await sendPasswordResetEmail(user.email, resetUrl, user.display_name);
  } catch (err) {
    console.error('Invio email reset fallito:', err.message);
  }

  const payload = { message: genericMessage };
  // In sviluppo (o se il mailer non è configurato) esponiamo il link così il
  // flusso è testabile senza provider email. MAI in produzione.
  if (!config.isProd() && !sent.delivered) payload.dev_reset_url = resetUrl;
  res.json(payload);
});

/**
 * POST /api/auth/reset-password
 * Consuma il token e imposta la nuova password.
 */
export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!token) throw new HttpError(400, 'Token mancante');
  if (!password || String(password).length < 6) {
    throw new HttpError(400, 'La password deve avere almeno 6 caratteri');
  }

  const row = await db
    .prepare(
      "SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')"
    )
    .get(hashToken(token));
  if (!row) throw new HttpError(400, 'Link di reset non valido o scaduto. Richiedine uno nuovo.');

  const hash = await bcrypt.hash(String(password), 10);
  await db.raw.batch(
    [
      { sql: "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?", args: [hash, row.user_id] },
      { sql: "UPDATE password_resets SET used_at = datetime('now') WHERE id = ?", args: [row.id] },
    ],
    'write'
  );

  res.json({ message: 'Password reimpostata. Ora puoi accedere con la nuova password.' });
});

/** GET /api/auth/me */
export const me = asyncHandler(async (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});
