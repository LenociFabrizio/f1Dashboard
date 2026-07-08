/**
 * userController.js
 * ------------------------------------------------------------
 * Gestione utenti: elenco, dettaglio, aggiornamento profilo,
 * upload avatar, gestione admin (ruoli, attivazione).
 * ------------------------------------------------------------
 */
import bcrypt from 'bcryptjs';
import db from '../database/db.js';
import { asyncHandler, HttpError, sanitizeUser, fullName } from '../utils/helpers.js';
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
      `SELECT u.id, u.username, u.display_name, u.first_name, u.last_name, u.avatar, u.nationality, u.favorite_number,
              u.role, u.biography, u.favorite_driver, u.reserve_driver, u.team_id, u.created_at,
              t.name AS team_name, t.color AS team_color
         FROM users u
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
      `SELECT u.*, t.name AS team_name, t.color AS team_color, t.logo AS team_logo
         FROM users u LEFT JOIN teams t ON t.id = u.team_id
        WHERE u.id = ?`
    )
    .get(req.params.id);
  if (!user) throw new HttpError(404, 'Pilota non trovato');
  res.json(sanitizeUser(user));
});

// Campi che l'utente può modificare del proprio profilo
// (display_name è derivato da first_name + last_name, non modificabile direttamente)
const EDITABLE_FIELDS = [
  'first_name', 'last_name', 'email', 'nationality', 'favorite_number',
  'favorite_driver', 'reserve_driver', 'biography', 'avatar', 'team_id',
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

  // Cambio username (nickname) con controllo di univocità.
  if (req.body.username !== undefined) {
    const uname = String(req.body.username).trim();
    if (!uname) throw new HttpError(400, 'Username non valido');
    const taken = await db.prepare('SELECT id FROM users WHERE username = ? AND id <> ?').get(uname, req.user.id);
    if (taken) throw new HttpError(409, 'Username già in uso');
    updates.username = uname;
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
    .prepare('SELECT id, platform, handle, source, created_at FROM game_identities WHERE user_id = ? ORDER BY created_at')
    .all(req.user.id);
  res.json(rows);
});

/** POST /api/users/me/handles — aggiunge un handle (source 'profile') */
export const addMyHandle = asyncHandler(async (req, res) => {
  const handle = String(req.body.handle || '').trim();
  const platform = String(req.body.platform || '').trim();
  if (!handle) throw new HttpError(400, 'Handle obbligatorio');

  // L'unicità è su (platform, handle): se già assegnato ad altri, blocca.
  const existing = await db.prepare('SELECT user_id FROM game_identities WHERE platform = ? AND handle = ?').get(platform, handle);
  if (existing && existing.user_id !== req.user.id) {
    throw new HttpError(409, 'Questo handle è già associato a un altro pilota');
  }
  await db
    .prepare(`INSERT INTO game_identities (user_id, platform, handle, source)
              VALUES (?, ?, ?, 'profile')
              ON CONFLICT (platform, handle) DO UPDATE SET user_id = excluded.user_id, source = 'profile'`)
    .run(req.user.id, platform, handle);
  const rows = await db.prepare('SELECT id, platform, handle, source, created_at FROM game_identities WHERE user_id = ? ORDER BY created_at').all(req.user.id);
  res.status(201).json(rows);
});

/** DELETE /api/users/me/handles/:hid — rimuove un proprio handle */
export const deleteMyHandle = asyncHandler(async (req, res) => {
  const info = await db
    .prepare('DELETE FROM game_identities WHERE id = ? AND user_id = ?')
    .run(Number(req.params.hid), req.user.id);
  if (!info.changes) throw new HttpError(404, 'Handle non trovato');
  res.json({ message: 'Handle rimosso' });
});

// ---------------------- ADMIN ----------------------

/** PUT /api/users/:id  (admin) — modifica qualunque utente */
export const adminUpdateUser = asyncHandler(async (req, res) => {
  const target = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) throw new HttpError(404, 'Utente non trovato');

  const allowed = [...EDITABLE_FIELDS, 'role', 'is_active', 'username'];
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
  const { username, first_name, last_name, email, password, role, team_id, favorite_number, nationality, reserve_driver } =
    req.body;
  if (!username) throw new HttpError(400, 'Username obbligatorio');
  const display_name = fullName(first_name, last_name) || username;
  const exists = await db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) throw new HttpError(409, 'Username già esistente');
  if (reserve_driver && (await reserveTaken(reserve_driver))) {
    throw new HttpError(409, 'Pilota di riserva già assegnato a un altro utente');
  }

  const hash = password ? await bcrypt.hash(password, 10) : null;
  const info = await db
    .prepare(
      `INSERT INTO users (username, display_name, first_name, last_name, email, password_hash, role, team_id, favorite_number, nationality, reserve_driver)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      username,
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
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(sanitizeUser(user));
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
