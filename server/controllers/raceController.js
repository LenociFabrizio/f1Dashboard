/**
 * raceController.js
 * ------------------------------------------------------------
 * Gestione gare (GP): elenco calendario, dettaglio, prossimo/ultimo,
 * creazione/modifica (admin), qualifiche, MVP, commento, screenshot.
 * ------------------------------------------------------------
 */
import db from '../database/db.js';
import { asyncHandler, HttpError } from '../utils/helpers.js';
import { persistUpload } from '../middleware/upload.js';

/** Query di base per una gara con dati circuito. */
const RACE_SELECT = `
  SELECT ra.*, c.name AS circuit_name, c.country, c.country_code, c.city,
         c.length_km, c.image AS circuit_image,
         mvp.display_name AS mvp_name, mvp.avatar AS mvp_avatar
    FROM races ra
    JOIN circuits c ON c.id = ra.circuit_id
    LEFT JOIN users mvp ON mvp.id = ra.mvp_user_id`;

/** GET /api/races?season_id=  — calendario */
export const listRaces = asyncHandler(async (req, res) => {
  const seasonId = req.query.season_id;
  const races = seasonId
    ? await db.prepare(`${RACE_SELECT} WHERE ra.season_id = ? ORDER BY ra.round ASC`).all(seasonId)
    : await db.prepare(`${RACE_SELECT} ORDER BY ra.round ASC`).all();
  res.json(races);
});

/** GET /api/races/next?season_id= — prossimo GP programmato */
export const getNextRace = asyncHandler(async (req, res) => {
  const seasonId = req.query.season_id;
  const race = await db
    .prepare(
      `${RACE_SELECT} WHERE ra.season_id = ? AND ra.status = 'scheduled'
       ORDER BY ra.round ASC LIMIT 1`
    )
    .get(seasonId);
  res.json(race || null);
});

/** GET /api/races/last?season_id= — ultimo GP concluso */
export const getLastRace = asyncHandler(async (req, res) => {
  const seasonId = req.query.season_id;
  const race = await db
    .prepare(
      `${RACE_SELECT} WHERE ra.season_id = ? AND ra.status = 'completed'
       ORDER BY ra.round DESC LIMIT 1`
    )
    .get(seasonId);
  res.json(race || null);
});

/** GET /api/races/:id — dettaglio con risultati + qualifiche */
export const getRace = asyncHandler(async (req, res) => {
  const race = await db.prepare(`${RACE_SELECT} WHERE ra.id = ?`).get(req.params.id);
  if (!race) throw new HttpError(404, 'Gara non trovata');

  race.results = await db
    .prepare(
      `SELECT r.*, u.display_name, u.username, u.avatar, u.nationality,
              t.name AS team_name, t.color AS team_color
         FROM results r
         JOIN users u ON u.id = r.user_id
         LEFT JOIN teams t ON t.id = r.team_id
        WHERE r.race_id = ?
        ORDER BY (r.dnf), (r.position IS NULL), r.position ASC`
    )
    .all(race.id);

  race.qualifying = await db
    .prepare(
      `SELECT q.*, u.display_name, u.avatar, t.color AS team_color
         FROM qualifying q
         JOIN users u ON u.id = q.user_id
         LEFT JOIN teams t ON t.id = u.team_id
        WHERE q.race_id = ?
        ORDER BY q.position ASC`
    )
    .all(race.id);

  res.json(race);
});

/** POST /api/races (admin) */
export const createRace = asyncHandler(async (req, res) => {
  const { season_id, circuit_id, round, name, race_date, weather, laps, distance_km } = req.body;
  if (!season_id || !circuit_id || !round || !name) {
    throw new HttpError(400, 'season_id, circuit_id, round e name sono obbligatori');
  }
  const dup = await db.prepare('SELECT id FROM races WHERE season_id = ? AND round = ?').get(season_id, round);
  if (dup) throw new HttpError(409, `Esiste già una gara al round ${round}`);

  const info = await db
    .prepare(
      `INSERT INTO races (season_id, circuit_id, round, name, race_date, weather, laps, distance_km, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`
    )
    .run(season_id, circuit_id, round, name, race_date || null, weather || 'Sereno', laps || null, distance_km || null);
  res.status(201).json(await db.prepare(`${RACE_SELECT} WHERE ra.id = ?`).get(info.lastInsertRowid));
});

/** PUT /api/races/:id (admin) */
export const updateRace = asyncHandler(async (req, res) => {
  const race = await db.prepare('SELECT * FROM races WHERE id = ?').get(req.params.id);
  if (!race) throw new HttpError(404, 'Gara non trovata');
  const fields = ['circuit_id', 'round', 'name', 'race_date', 'weather', 'laps', 'distance_km', 'status', 'comment', 'mvp_user_id'];
  const updates = {};
  for (const f of fields) if (req.body[f] !== undefined) updates[f] = req.body[f];
  if (Object.keys(updates).length === 0) throw new HttpError(400, 'Nessun dato da aggiornare');
  const setClause = Object.keys(updates).map((k) => `${k} = @${k}`).join(', ');
  await db.prepare(`UPDATE races SET ${setClause} WHERE id = @id`).run({ ...updates, id: req.params.id });
  res.json(await db.prepare(`${RACE_SELECT} WHERE ra.id = ?`).get(req.params.id));
});

/** DELETE /api/races/:id (admin) */
export const deleteRace = asyncHandler(async (req, res) => {
  // Cancellazione esplicita dei figli (non ci affidiamo al cascade FK,
  // non garantito su connessioni HTTP serverless).
  const id = req.params.id;
  await db.raw.batch(
    [
      { sql: 'DELETE FROM results WHERE race_id = ?', args: [id] },
      { sql: 'DELETE FROM qualifying WHERE race_id = ?', args: [id] },
      { sql: 'DELETE FROM races WHERE id = ?', args: [id] },
    ],
    'write'
  );
  res.json({ message: 'Gara eliminata' });
});

/** POST /api/races/:id/screenshot (admin) — carica immagine classifica/risultati */
export const uploadScreenshot = asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Nessun file caricato');
  const url = await persistUpload(req.file, 'screenshots');
  await db.prepare('UPDATE races SET screenshot = ? WHERE id = ?').run(url, req.params.id);
  res.json({ screenshot: url });
});

/** PUT /api/races/:id/qualifying (admin) — salva l'intera griglia di qualifica */
export const setQualifying = asyncHandler(async (req, res) => {
  const raceId = req.params.id;
  const race = await db.prepare('SELECT id FROM races WHERE id = ?').get(raceId);
  if (!race) throw new HttpError(404, 'Gara non trovata');
  const entries = req.body.qualifying || [];

  // Sostituisce l'intera griglia in un'unica transazione (batch atomico).
  const stmts = [{ sql: 'DELETE FROM qualifying WHERE race_id = ?', args: [raceId] }];
  let saved = 0;
  for (const q of entries) {
    if (!q.user_id || !q.position) continue;
    stmts.push({
      sql: `INSERT INTO qualifying (race_id, user_id, position, best_time, gap)
            VALUES (?, ?, ?, ?, ?)`,
      args: [raceId, q.user_id, q.position, q.best_time || null, q.gap || null],
    });
    saved += 1;
  }
  await db.raw.batch(stmts, 'write');
  res.json({ message: 'Qualifiche salvate', count: saved });
});
