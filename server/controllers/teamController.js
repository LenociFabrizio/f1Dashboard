/**
 * teamController.js
 * ------------------------------------------------------------
 * CRUD dei team/costruttori.
 * ------------------------------------------------------------
 */
import db from '../database/db.js';
import { asyncHandler, HttpError } from '../utils/helpers.js';

/** GET /api/teams */
export const listTeams = asyncHandler(async (_req, res) => {
  const teams = await db.prepare('SELECT * FROM teams WHERE is_active = 1 ORDER BY name').all();
  // Aggiunge il conteggio piloti per team
  for (const t of teams) {
    t.drivers = await db
      .prepare('SELECT id, display_name, avatar FROM users WHERE team_id = ? AND is_active = 1')
      .all(t.id);
  }
  res.json(teams);
});

/** GET /api/teams/:id */
export const getTeam = asyncHandler(async (req, res) => {
  const team = await db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);
  if (!team) throw new HttpError(404, 'Team non trovato');
  team.drivers = await db
    .prepare('SELECT id, display_name, avatar FROM users WHERE team_id = ? AND is_active = 1')
    .all(team.id);
  res.json(team);
});

/** POST /api/teams (admin) */
export const createTeam = asyncHandler(async (req, res) => {
  const { name, full_name, color, base, power_unit, logo } = req.body;
  if (!name) throw new HttpError(400, 'Nome team obbligatorio');
  const info = await db
    .prepare(
      `INSERT INTO teams (name, full_name, color, base, power_unit, logo)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(name, full_name || name, color || '#e10600', base || '', power_unit || '', logo || '/images/teams/default.svg');
  res.status(201).json(await db.prepare('SELECT * FROM teams WHERE id = ?').get(info.lastInsertRowid));
});

/** PUT /api/teams/:id (admin) */
export const updateTeam = asyncHandler(async (req, res) => {
  const team = await db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);
  if (!team) throw new HttpError(404, 'Team non trovato');
  const fields = ['name', 'full_name', 'color', 'base', 'power_unit', 'logo', 'is_active'];
  const updates = {};
  for (const f of fields) if (req.body[f] !== undefined) updates[f] = req.body[f];
  if (Object.keys(updates).length === 0) throw new HttpError(400, 'Nessun dato da aggiornare');
  const setClause = Object.keys(updates).map((k) => `${k} = @${k}`).join(', ');
  await db.prepare(`UPDATE teams SET ${setClause} WHERE id = @id`).run({ ...updates, id: req.params.id });
  res.json(await db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id));
});

/** DELETE /api/teams/:id (admin) */
export const deleteTeam = asyncHandler(async (req, res) => {
  await db.prepare('UPDATE teams SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Team disattivato' });
});
