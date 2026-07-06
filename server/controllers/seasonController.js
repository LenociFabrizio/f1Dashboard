/**
 * seasonController.js
 * ------------------------------------------------------------
 * Gestione stagioni + circuiti (raggruppati perché entità di base).
 * ------------------------------------------------------------
 */
import db from '../database/db.js';
import { asyncHandler, HttpError } from '../utils/helpers.js';

// ----------------------- STAGIONI -----------------------

/** GET /api/seasons */
export const listSeasons = asyncHandler(async (_req, res) => {
  res.json(await db.prepare('SELECT * FROM seasons ORDER BY year DESC, id DESC').all());
});

/** GET /api/seasons/active — stagione attiva corrente */
export const getActiveSeason = asyncHandler(async (_req, res) => {
  const season =
    (await db.prepare('SELECT * FROM seasons WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get()) ||
    (await db.prepare('SELECT * FROM seasons ORDER BY year DESC LIMIT 1').get());
  res.json(season || null);
});

/** GET /api/seasons/:id */
export const getSeason = asyncHandler(async (req, res) => {
  const season = await db.prepare('SELECT * FROM seasons WHERE id = ?').get(req.params.id);
  if (!season) throw new HttpError(404, 'Stagione non trovata');
  res.json(season);
});

/** POST /api/seasons (admin) */
export const createSeason = asyncHandler(async (req, res) => {
  const { name, year, game, description, is_active } = req.body;
  if (!name || !year) throw new HttpError(400, 'Nome e anno obbligatori');
  if (is_active) await db.prepare('UPDATE seasons SET is_active = 0').run(); // solo una attiva
  const info = await db
    .prepare(
      `INSERT INTO seasons (name, year, game, description, is_active)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(name, year, game || 'F1 25', description || '', is_active ? 1 : 0);
  res.status(201).json(await db.prepare('SELECT * FROM seasons WHERE id = ?').get(info.lastInsertRowid));
});

/** PUT /api/seasons/:id (admin) */
export const updateSeason = asyncHandler(async (req, res) => {
  const season = await db.prepare('SELECT * FROM seasons WHERE id = ?').get(req.params.id);
  if (!season) throw new HttpError(404, 'Stagione non trovata');
  if (req.body.is_active) await db.prepare('UPDATE seasons SET is_active = 0').run();
  const fields = ['name', 'year', 'game', 'description', 'is_active'];
  const updates = {};
  for (const f of fields) if (req.body[f] !== undefined) updates[f] = req.body[f];
  if (Object.keys(updates).length === 0) throw new HttpError(400, 'Nessun dato da aggiornare');
  const setClause = Object.keys(updates).map((k) => `${k} = @${k}`).join(', ');
  await db.prepare(`UPDATE seasons SET ${setClause} WHERE id = @id`).run({ ...updates, id: req.params.id });
  res.json(await db.prepare('SELECT * FROM seasons WHERE id = ?').get(req.params.id));
});

// ----------------------- CIRCUITI -----------------------

/** GET /api/circuits */
export const listCircuits = asyncHandler(async (_req, res) => {
  res.json(await db.prepare('SELECT * FROM circuits ORDER BY name').all());
});

/** POST /api/circuits (admin) */
export const createCircuit = asyncHandler(async (req, res) => {
  const { name, country, country_code, city, length_km, laps_default, image } = req.body;
  if (!name || !country) throw new HttpError(400, 'Nome e paese obbligatori');
  const info = await db
    .prepare(
      `INSERT INTO circuits (name, country, country_code, city, length_km, laps_default, image)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(name, country, country_code || 'IT', city || '', length_km || null, laps_default || null, image || '/images/circuits/default.svg');
  res.status(201).json(await db.prepare('SELECT * FROM circuits WHERE id = ?').get(info.lastInsertRowid));
});

/** PUT /api/circuits/:id (admin) */
export const updateCircuit = asyncHandler(async (req, res) => {
  const circuit = await db.prepare('SELECT * FROM circuits WHERE id = ?').get(req.params.id);
  if (!circuit) throw new HttpError(404, 'Circuito non trovato');
  const fields = ['name', 'country', 'country_code', 'city', 'length_km', 'laps_default', 'image'];
  const updates = {};
  for (const f of fields) if (req.body[f] !== undefined) updates[f] = req.body[f];
  if (Object.keys(updates).length === 0) throw new HttpError(400, 'Nessun dato da aggiornare');
  const setClause = Object.keys(updates).map((k) => `${k} = @${k}`).join(', ');
  await db.prepare(`UPDATE circuits SET ${setClause} WHERE id = @id`).run({ ...updates, id: req.params.id });
  res.json(await db.prepare('SELECT * FROM circuits WHERE id = ?').get(req.params.id));
});
