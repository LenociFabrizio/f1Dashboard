/**
 * userController.js
 * ------------------------------------------------------------
 * Gestione utenti: elenco, dettaglio, aggiornamento profilo,
 * upload avatar, gestione admin (ruoli, attivazione).
 * ------------------------------------------------------------
 */
import bcrypt from 'bcryptjs';
import db from '../database/db.js';
import { asyncHandler, HttpError, sanitizeUser } from '../utils/helpers.js';
import { ROLES } from '../utils/constants.js';
import { persistUpload } from '../middleware/upload.js';

/** GET /api/users  — elenco pubblico dei piloti */
export const listUsers = asyncHandler(async (_req, res) => {
  const users = await db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.avatar, u.nationality, u.favorite_number,
              u.role, u.biography, u.favorite_driver, u.created_at,
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
const EDITABLE_FIELDS = [
  'display_name', 'email', 'nationality', 'favorite_number',
  'favorite_driver', 'reserve_driver', 'biography', 'avatar', 'team_id',
];

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

// ---------------------- ADMIN ----------------------

/** PUT /api/users/:id  (admin) — modifica qualunque utente */
export const adminUpdateUser = asyncHandler(async (req, res) => {
  const target = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) throw new HttpError(404, 'Utente non trovato');

  const allowed = [...EDITABLE_FIELDS, 'role', 'is_active', 'username'];
  const updates = {};
  for (const f of allowed) if (req.body[f] !== undefined) updates[f] = req.body[f];
  if (req.body.password) updates.password_hash = await bcrypt.hash(req.body.password, 10);

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
  const { username, display_name, email, password, role, team_id, favorite_number, nationality, reserve_driver } =
    req.body;
  if (!username) throw new HttpError(400, 'Username obbligatorio');
  const exists = await db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) throw new HttpError(409, 'Username già esistente');

  const hash = password ? await bcrypt.hash(password, 10) : null;
  const info = await db
    .prepare(
      `INSERT INTO users (username, display_name, email, password_hash, role, team_id, favorite_number, nationality, reserve_driver)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      username,
      display_name || username,
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
