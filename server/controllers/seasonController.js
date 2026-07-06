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

/** Mescola un array (Fisher-Yates). */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * POST /api/seasons (admin)
 * Oltre alla stagione, genera automaticamente il calendario gare in base a:
 *  - circuit_mode: 'all' | 'random' | 'custom'
 *  - circuit_ids:  (solo custom) elenco id circuiti scelti
 *  - random_count: (solo random) quanti tracciati; default = tutti
 *  - laps_percentage: 1..100, i giri di ogni gara = round(giri_reali * %)
 */
export const createSeason = asyncHandler(async (req, res) => {
  const { name, year, game, description, is_active, circuit_mode, circuit_ids, random_count, laps_percentage } = req.body;
  if (!name || !year) throw new HttpError(400, 'Nome e anno obbligatori');

  const pct = Math.min(100, Math.max(1, Number(laps_percentage) || 100));

  if (is_active) await db.prepare('UPDATE seasons SET is_active = 0').run(); // solo una attiva
  const info = await db
    .prepare(
      `INSERT INTO seasons (name, year, game, description, is_active)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(name, year, game || 'F1 25', description || '', is_active ? 1 : 0);
  const seasonId = Number(info.lastInsertRowid);

  // Selezione tracciati per il calendario
  const allCircuits = await db.prepare('SELECT id, name, laps_default, length_km FROM circuits ORDER BY name').all();
  let chosen;
  if (circuit_mode === 'custom') {
    const ids = (Array.isArray(circuit_ids) ? circuit_ids : []).map(Number);
    chosen = allCircuits.filter((c) => ids.includes(c.id));
  } else if (circuit_mode === 'random') {
    const shuffled = shuffle(allCircuits);
    const count = random_count ? Math.min(Math.max(1, Number(random_count)), shuffled.length) : shuffled.length;
    chosen = shuffled.slice(0, count);
  } else {
    chosen = allCircuits; // 'all' (default)
  }

  // Genera le gare (round progressivo, giri in base alla percentuale)
  if (chosen.length) {
    const stmts = chosen.map((c, i) => {
      const laps = c.laps_default ? Math.max(1, Math.round((c.laps_default * pct) / 100)) : null;
      const distance = c.length_km && laps ? Math.round(c.length_km * laps * 10) / 10 : null;
      return {
        sql: `INSERT INTO races (season_id, circuit_id, round, name, laps, distance_km, status)
              VALUES (?, ?, ?, ?, ?, ?, 'scheduled')`,
        args: [seasonId, c.id, i + 1, c.name, laps, distance],
      };
    });
    await db.raw.batch(stmts, 'write');
  }

  const season = await db.prepare('SELECT * FROM seasons WHERE id = ?').get(seasonId);
  res.status(201).json({ ...season, races_created: chosen.length });
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
