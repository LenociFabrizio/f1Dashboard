/**
 * userController.js
 * ------------------------------------------------------------
 * Gestione utenti: elenco, dettaglio, aggiornamento profilo,
 * upload avatar, gestione admin (ruoli, attivazione).
 * ------------------------------------------------------------
 */
import bcrypt from 'bcryptjs';
import db from '../database/db.js';
import { asyncHandler, HttpError, sanitizeUser, fullName, PRIMARY_HANDLE_JOIN, HANDLE_SELECT } from '../utils/helpers.js';
import { ROLES } from '../utils/constants.js';
import { persistUpload } from '../middleware/upload.js';

/** GET /api/users/reserved — elenco dei piloti di riserva (BOT) già assegnati */
export const listReservedDrivers = asyncHandler(async (_req, res) => {
  const rows = await db
    .prepare("SELECT reserve_driver FROM users WHERE reserve_driver IS NOT NULL AND reserve_driver <> ''")
    .all();
  res.json(rows.map((r) => r.reserve_driver));
});

/** Verifica se un pilota di riserva è già assegnato (opzionale: escludendo un utente). */
async function reserveTaken(name, exceptId = null) {
  if (!name) return false;
  const row = exceptId
    ? await db.prepare('SELECT id FROM users WHERE reserve_driver = ? AND id <> ?').get(name, exceptId)
    : await db.prepare('SELECT id FROM users WHERE reserve_driver = ?').get(name);
  return !!row;
}

/** GET /api/users  — elenco pubblico dei piloti */
export const listUsers = asyncHandler(async (_req, res) => {
  const users = await db
    .prepare(
      `SELECT u.id, ${HANDLE_SELECT}, u.display_name, u.first_name, u.last_name, u.avatar, u.nationality, u.favorite_number,
              u.role, u.biography, u.favorite_driver, u.reserve_driver, u.team_id, u.created_at,
              t.name AS team_name, t.color AS team_color
         FROM users u
         ${PRIMARY_HANDLE_JOIN}
         LEFT JOIN teams t ON t.id = u.team_id
        WHERE u.is_active = 1
        ORDER BY u.display_name COLLATE NOCASE`
    )
    .all();
  res.json(users);
});

/** GET /api/users/:id */
export const getUser = asyncHandler(async (req, res) => {
  const user = await db
    .prepare(
      `SELECT u.*, ${HANDLE_SELECT}, t.name AS team_name, t.color AS team_color, t.logo AS team_logo
         FROM users u
         ${PRIMARY_HANDLE_JOIN}
         LEFT JOIN teams t ON t.id = u.team_id
        WHERE u.id = ?`
    )
    .get(req.params.id);
  if (!user) throw new HttpError(404, 'Pilota non trovato');
  // Piattaforme di gioco dichiarate (dagli handle F1 25), senza esporre i nickname.
  const platRows = await db
    .prepare("SELECT DISTINCT platform FROM game_identities WHERE user_id = ? AND platform <> '' ORDER BY platform")
    .all(user.id);
  const safe = sanitizeUser(user);
  safe.platforms = platRows.map((p) => p.platform);
  res.json(safe);
});

// Campi che l'utente può modificare del proprio profilo
// (display_name è derivato da first_name + last_name, non modificabile direttamente;
//  team_id e reserve_driver NON sono qui: passano dal flusso di approvazione admin)
const EDITABLE_FIELDS = [
  'first_name', 'last_name', 'email', 'nationality', 'favorite_number',
  'favorite_driver', 'biography', 'avatar',
  'assist_abs', 'assist_tc', 'assist_gearbox',
];

/** Se cambia nome o cognome, ricalcola display_name usando i valori aggiornati + attuali. */
function applyDisplayName(updates, current = {}) {
  if ('first_name' in updates || 'last_name' in updates) {
    const first = 'first_name' in updates ? updates.first_name : current.first_name;
    const last = 'last_name' in updates ? updates.last_name : current.last_name;
    const dn = fullName(first, last);
    if (dn) updates.display_name = dn;
  }
}

/** PUT /api/users/me  — aggiorna il proprio profilo */
export const updateMe = asyncHandler(async (req, res) => {
  const updates = {};
  for (const f of EDITABLE_FIELDS) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }

  // Cambio password opzionale
  if (req.body.password) {
    updates.password_hash = await bcrypt.hash(req.body.password, 10);
  }

  applyDisplayName(updates, req.user);

  if (Object.keys(updates).length === 0) throw new HttpError(400, 'Nessun dato da aggiornare');

  const keys = Object.keys(updates);
  const setClause = keys.map((k) => `${k} = @${k}`).join(', ');
  await db.prepare(
    `UPDATE users SET ${setClause}, updated_at = datetime('now') WHERE id = @id`
  ).run({ ...updates, id: req.user.id });

  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json(sanitizeUser(user));
});

/** POST /api/users/me/avatar — upload avatar */
export const uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Nessun file caricato');
  const url = await persistUpload(req.file, 'avatars');
  await db.prepare("UPDATE users SET avatar = ?, updated_at = datetime('now') WHERE id = ?").run(
    url,
    req.user.id
  );
  res.json({ avatar: url });
});

/**
 * Cancellazione FISICA di un utente e di tutti i suoi dati collegati.
 * (Non ci affidiamo al cascade FK, non garantito su connessioni serverless.)
 * I risultati vengono rimossi: le classifiche/statistiche si ricalcolano da sole.
 */
async function hardDeleteUser(id) {
  await db.raw.batch(
    [
      { sql: 'DELETE FROM results WHERE user_id = ?', args: [id] },
      { sql: 'DELETE FROM qualifying WHERE user_id = ?', args: [id] },
      { sql: 'DELETE FROM lap_times WHERE user_id = ?', args: [id] },
      { sql: 'DELETE FROM lap_traces WHERE user_id = ?', args: [id] },
      { sql: 'DELETE FROM manual_stats WHERE user_id = ?', args: [id] },
      { sql: 'DELETE FROM achievements WHERE user_id = ?', args: [id] },
      { sql: 'DELETE FROM post_tags WHERE user_id = ?', args: [id] },
      { sql: 'DELETE FROM post_tags WHERE post_id IN (SELECT id FROM posts WHERE author_id = ?)', args: [id] },
      { sql: 'DELETE FROM posts WHERE author_id = ?', args: [id] },
      { sql: 'UPDATE news SET author_id = NULL WHERE author_id = ?', args: [id] },
      { sql: 'UPDATE races SET mvp_user_id = NULL WHERE mvp_user_id = ?', args: [id] },
      { sql: 'DELETE FROM users WHERE id = ?', args: [id] },
    ],
    'write'
  );
}

/** Vero se l'utente indicato è l'ultimo amministratore rimasto. */
async function isLastAdmin(id) {
  const target = await db.prepare('SELECT role FROM users WHERE id = ?').get(id);
  if (!target || target.role !== 'admin') return false;
  const { c } = await db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'admin'").get();
  return c <= 1;
}

/** DELETE /api/users/me — l'utente elimina il proprio account (e i suoi dati) */
export const deleteMe = asyncHandler(async (req, res) => {
  if (await isLastAdmin(req.user.id)) {
    throw new HttpError(400, 'Sei l\'ultimo amministratore: assegna prima un altro admin.');
  }
  await hardDeleteUser(req.user.id);
  res.json({ message: 'Account eliminato' });
});

// ---------------------- HANDLE DI GIOCO (telemetria) ----------------------
// L'utente dichiara i propri nickname di gioco F1 25 (per piattaforma): così
// l'import automatico delle gare lo riconosce senza mappatura manuale.
// Vedi captureService.resolveIdentities e la tabella game_identities.

/** GET /api/users/me/handles — elenco dei propri handle di gioco */
export const listMyHandles = asyncHandler(async (req, res) => {
  const rows = await db
    .prepare('SELECT id, platform, handle, source, is_primary, created_at FROM game_identities WHERE user_id = ? ORDER BY is_primary DESC, created_at')
    .all(req.user.id);
  res.json(rows);
});

/** POST /api/users/me/handles — aggiunge un handle (source 'profile') */
export const addMyHandle = asyncHandler(async (req, res) => {
  const handle = String(req.body.handle || '').trim();
  const platform = String(req.body.platform || '').trim();
  if (!handle) throw new HttpError(400, 'Handle obbligatorio');

  // Un solo handle per piattaforma per utente.
  const samePlatform = await db
    .prepare('SELECT id FROM game_identities WHERE user_id = ? AND platform = ?')
    .get(req.user.id, platform);
  if (samePlatform) {
    const label = platform || 'Qualsiasi';
    throw new HttpError(409, `Hai già un handle per la piattaforma "${label}". Rimuovilo prima di aggiungerne un altro.`);
  }

  // L'unicità è su (platform, handle): se già assegnato ad altri, blocca.
  const existing = await db.prepare('SELECT user_id FROM game_identities WHERE platform = ? AND handle = ?').get(platform, handle);
  if (existing && existing.user_id !== req.user.id) {
    throw new HttpError(409, 'Questo handle è già associato a un altro pilota');
  }
  // Il primo handle dell'utente diventa automaticamente il PRIMARIO (nome pubblico).
  const hasAny = await db.prepare('SELECT id FROM game_identities WHERE user_id = ?').get(req.user.id);
  const isPrimary = hasAny ? 0 : 1;
  await db
    .prepare(`INSERT INTO game_identities (user_id, platform, handle, source, is_primary)
              VALUES (?, ?, ?, 'profile', ?)
              ON CONFLICT (platform, handle) DO UPDATE SET user_id = excluded.user_id, source = 'profile'`)
    .run(req.user.id, platform, handle, isPrimary);
  const rows = await db.prepare('SELECT id, platform, handle, source, is_primary, created_at FROM game_identities WHERE user_id = ? ORDER BY is_primary DESC, created_at').all(req.user.id);
  res.status(201).json(rows);
});

/** PUT /api/users/me/handles/:hid/primary — imposta l'handle come nome pubblico "@handle" */
export const setPrimaryHandle = asyncHandler(async (req, res) => {
  const hid = Number(req.params.hid);
  const own = await db.prepare('SELECT id FROM game_identities WHERE id = ? AND user_id = ?').get(hid, req.user.id);
  if (!own) throw new HttpError(404, 'Handle non trovato');
  await db.raw.batch(
    [
      { sql: 'UPDATE game_identities SET is_primary = 0 WHERE user_id = ?', args: [req.user.id] },
      { sql: 'UPDATE game_identities SET is_primary = 1 WHERE id = ? AND user_id = ?', args: [hid, req.user.id] },
    ],
    'write'
  );
  const rows = await db.prepare('SELECT id, platform, handle, source, is_primary, created_at FROM game_identities WHERE user_id = ? ORDER BY is_primary DESC, created_at').all(req.user.id);
  res.json(rows);
});

/** DELETE /api/users/me/handles/:hid — rimuove un proprio handle */
export const deleteMyHandle = asyncHandler(async (req, res) => {
  const target = await db
    .prepare('SELECT id, is_primary FROM game_identities WHERE id = ? AND user_id = ?')
    .get(Number(req.params.hid), req.user.id);
  if (!target) throw new HttpError(404, 'Handle non trovato');
  await db.prepare('DELETE FROM game_identities WHERE id = ? AND user_id = ?').run(target.id, req.user.id);
  // Se ho eliminato il primario, promuovo il più vecchio rimasto.
  if (target.is_primary) {
    const next = await db
      .prepare('SELECT id FROM game_identities WHERE user_id = ? ORDER BY created_at LIMIT 1')
      .get(req.user.id);
    if (next) await db.prepare('UPDATE game_identities SET is_primary = 1 WHERE id = ?').run(next.id);
  }
  res.json({ message: 'Handle rimosso' });
});

// ---------------------- RICHIESTE DI CAMBIO TEAM / RISERVA ----------------------
// L'utente richiede il cambio di squadra e/o pilota di riserva: la modifica
// resta 'pending' finché l'admin non la approva (i valori attuali non cambiano).

/** GET /api/users/me/change-request — la propria richiesta in sospeso (o null) */
export const getMyChangeRequest = asyncHandler(async (req, res) => {
  const row = await db
    .prepare(
      `SELECT cr.*, t.name AS requested_team_name
         FROM change_requests cr
         LEFT JOIN teams t ON t.id = cr.requested_team_id
        WHERE cr.user_id = ? AND cr.status = 'pending'
        ORDER BY cr.created_at DESC LIMIT 1`
    )
    .get(req.user.id);
  res.json(row || null);
});

/** POST /api/users/me/change-request — crea/aggiorna la richiesta di cambio */
export const createChangeRequest = asyncHandler(async (req, res) => {
  const me = await db.prepare('SELECT team_id, reserve_driver FROM users WHERE id = ?').get(req.user.id);

  // Team richiesto (NULL = nessun cambio). '' o valore uguale all'attuale = nessun cambio.
  let requestedTeam = req.body.team_id === undefined || req.body.team_id === null || req.body.team_id === ''
    ? null
    : Number(req.body.team_id);
  if (requestedTeam !== null) {
    const team = await db.prepare('SELECT id FROM teams WHERE id = ? AND is_active = 1').get(requestedTeam);
    if (!team) throw new HttpError(400, 'Scuderia non valida');
    if (requestedTeam === me.team_id) requestedTeam = null; // nessun cambio effettivo
  }

  // Riserva richiesta (NULL = nessun cambio).
  let requestedReserve = req.body.reserve_driver === undefined ? null : String(req.body.reserve_driver || '').trim();
  if (requestedReserve === '' || requestedReserve === me.reserve_driver) requestedReserve = null;
  if (requestedReserve && (await reserveTaken(requestedReserve, req.user.id))) {
    throw new HttpError(409, 'Questo pilota di riserva è già assegnato a un altro utente');
  }

  if (requestedTeam === null && requestedReserve === null) {
    throw new HttpError(400, 'Nessuna modifica richiesta rispetto ai valori attuali');
  }

  // Una sola richiesta pending per utente: sostituiamo l'eventuale precedente.
  await db.prepare("DELETE FROM change_requests WHERE user_id = ? AND status = 'pending'").run(req.user.id);
  await db
    .prepare(
      `INSERT INTO change_requests (user_id, requested_team_id, requested_reserve)
       VALUES (?, ?, ?)`
    )
    .run(req.user.id, requestedTeam, requestedReserve);

  const row = await db
    .prepare(
      `SELECT cr.*, t.name AS requested_team_name
         FROM change_requests cr LEFT JOIN teams t ON t.id = cr.requested_team_id
        WHERE cr.user_id = ? AND cr.status = 'pending' ORDER BY cr.created_at DESC LIMIT 1`
    )
    .get(req.user.id);
  res.status(201).json(row);
});

/** DELETE /api/users/me/change-request — annulla la propria richiesta pending */
export const cancelMyChangeRequest = asyncHandler(async (req, res) => {
  const info = await db
    .prepare("DELETE FROM change_requests WHERE user_id = ? AND status = 'pending'")
    .run(req.user.id);
  if (!info.changes) throw new HttpError(404, 'Nessuna richiesta in sospeso');
  res.json({ message: 'Richiesta annullata' });
});

// ---------------------- ADMIN: richieste di reset password ----------------------
// Il reset avviene senza email: l'utente richiede, l'admin vede qui la richiesta
// con il link (token) da inoltrargli manualmente (WhatsApp/Discord).

/** GET /api/users/reset-requests (admin) — richieste di reset attive (non usate, non scadute) */
export const listResetRequests = asyncHandler(async (_req, res) => {
  const rows = await db
    .prepare(
      `SELECT pr.id, pr.token_plain AS token, pr.created_at, pr.expires_at,
              u.id AS user_id, u.display_name, ${HANDLE_SELECT}, u.email
         FROM password_resets pr
         JOIN users u ON u.id = pr.user_id
         ${PRIMARY_HANDLE_JOIN}
        WHERE pr.used_at IS NULL AND pr.expires_at > datetime('now') AND pr.token_plain IS NOT NULL
        ORDER BY pr.created_at DESC`
    )
    .all();
  res.json(rows);
});

/** DELETE /api/users/reset-requests/:rid (admin) — annulla/segna gestita una richiesta */
export const revokeResetRequest = asyncHandler(async (req, res) => {
  const info = await db
    .prepare('DELETE FROM password_resets WHERE id = ?')
    .run(Number(req.params.rid));
  if (!info.changes) throw new HttpError(404, 'Richiesta non trovata');
  res.json({ message: 'Richiesta rimossa' });
});

// ---------------------- ADMIN ----------------------

/** PUT /api/users/:id  (admin) — modifica qualunque utente */
export const adminUpdateUser = asyncHandler(async (req, res) => {
  const target = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) throw new HttpError(404, 'Utente non trovato');

  // L'admin può modificare direttamente anche team e riserva (bypassa l'approvazione).
  const allowed = [...EDITABLE_FIELDS, 'team_id', 'reserve_driver', 'role', 'is_active'];
  const updates = {};
  for (const f of allowed) if (req.body[f] !== undefined) updates[f] = req.body[f];
  if (req.body.password) updates.password_hash = await bcrypt.hash(req.body.password, 10);
  if (updates.reserve_driver && (await reserveTaken(updates.reserve_driver, Number(req.params.id)))) {
    throw new HttpError(409, 'Pilota di riserva già assegnato a un altro utente');
  }
  applyDisplayName(updates, target);

  if (Object.keys(updates).length === 0) throw new HttpError(400, 'Nessun dato da aggiornare');
  const setClause = Object.keys(updates).map((k) => `${k} = @${k}`).join(', ');
  await db.prepare(`UPDATE users SET ${setClause}, updated_at = datetime('now') WHERE id = @id`).run({
    ...updates,
    id: req.params.id,
  });
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  res.json(sanitizeUser(user));
});

/** POST /api/users  (admin) — crea utente/pilota manualmente */
export const adminCreateUser = asyncHandler(async (req, res) => {
  const { first_name, last_name, email, password, role, team_id, favorite_number, nationality, reserve_driver } =
    req.body;
  const handle = String(req.body.handle || '').trim();
  const platform = String(req.body.platform || '').trim();
  if (!handle) throw new HttpError(400, 'Nickname di gioco (handle) obbligatorio');
  const display_name = fullName(first_name, last_name) || handle;
  if (email) {
    const exists = await db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (exists) throw new HttpError(409, 'Email già esistente');
  }
  const handleExists = await db
    .prepare('SELECT id FROM game_identities WHERE platform = ? AND handle = ?')
    .get(platform, handle);
  if (handleExists) throw new HttpError(409, 'Questo nickname di gioco è già in uso');
  if (reserve_driver && (await reserveTaken(reserve_driver))) {
    throw new HttpError(409, 'Pilota di riserva già assegnato a un altro utente');
  }

  const hash = password ? await bcrypt.hash(password, 10) : null;
  const info = await db
    .prepare(
      `INSERT INTO users (display_name, first_name, last_name, email, password_hash, role, team_id, favorite_number, nationality, reserve_driver)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      display_name,
      (first_name || '').trim(),
      (last_name || '').trim(),
      email || null,
      hash,
      role === ROLES.ADMIN ? ROLES.ADMIN : ROLES.PILOTA,
      team_id || null,
      favorite_number || null,
      nationality || 'IT',
      reserve_driver || null
    );
  // Nickname di gioco come handle PRIMARIO (nome pubblico "@handle").
  await db
    .prepare(
      `INSERT INTO game_identities (user_id, platform, handle, source, is_primary)
       VALUES (?, ?, ?, 'profile', 1)`
    )
    .run(info.lastInsertRowid, platform, handle);
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ ...sanitizeUser(user), handle });
});

/** DELETE /api/users/:id (admin) — elimina definitivamente l'utente e i suoi dati */
export const adminDeleteUser = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) throw new HttpError(400, 'Non puoi eliminare te stesso da qui: usa il tuo profilo.');
  const target = await db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!target) throw new HttpError(404, 'Utente non trovato');
  if (await isLastAdmin(id)) throw new HttpError(400, 'Non puoi eliminare l\'ultimo amministratore.');
  await hardDeleteUser(id);
  res.json({ message: 'Utente e relativi dati eliminati' });
});
