/**
 * statsController.js
 * ------------------------------------------------------------
 * Statistiche di campionato, statistiche del singolo pilota,
 * confronto tra piloti e gestione statistiche manuali (admin).
 * ------------------------------------------------------------
 */
import db from '../database/db.js';
import { asyncHandler, HttpError } from '../utils/helpers.js';
import { getDriverStats, getChampionshipStats } from '../services/statsService.js';

/** GET /api/stats/championship?season_id= */
export const championshipStats = asyncHandler(async (req, res) => {
  res.json(await getChampionshipStats(Number(req.query.season_id)));
});

/** GET /api/stats/driver/:userId?season_id= */
export const driverStats = asyncHandler(async (req, res) => {
  const seasonId = Number(req.query.season_id);
  const stats = await getDriverStats(seasonId, Number(req.params.userId));
  if (!stats) throw new HttpError(404, 'Pilota non trovato');

  // Aggiunge statistiche manuali (es. sorpassi totali) per la stagione
  const manual = await db
    .prepare('SELECT stat_key, stat_value, note FROM manual_stats WHERE season_id = ? AND user_id = ?')
    .all(seasonId, req.params.userId);
  stats.manual = Object.fromEntries(manual.map((m) => [m.stat_key, m.stat_value]));
  res.json(stats);
});

/** GET /api/stats/compare?season_id=&users=1,2,3 — confronto piloti */
export const compareDrivers = asyncHandler(async (req, res) => {
  const seasonId = Number(req.query.season_id);
  const ids = String(req.query.users || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter(Boolean);
  if (ids.length < 2) throw new HttpError(400, 'Fornisci almeno due piloti (?users=1,2)');

  const drivers = (await Promise.all(ids.map(async (id) => {
    const stats = await getDriverStats(seasonId, id);
    const user = await db.prepare('SELECT display_name, avatar FROM users WHERE id = ?').get(id);
    return stats ? { ...stats, display_name: user?.display_name, avatar: user?.avatar } : null;
  }))).filter(Boolean);

  res.json({ drivers });
});

// ------------------ STATISTICHE MANUALI (admin) ------------------

/** PUT /api/stats/manual (admin) — upsert di una statistica manuale */
export const setManualStat = asyncHandler(async (req, res) => {
  const { season_id, user_id, stat_key, stat_value, note } = req.body;
  if (!season_id || !user_id || !stat_key) {
    throw new HttpError(400, 'season_id, user_id e stat_key obbligatori');
  }
  await db.prepare(
    `INSERT INTO manual_stats (season_id, user_id, stat_key, stat_value, note)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(season_id, user_id, stat_key)
     DO UPDATE SET stat_value = excluded.stat_value, note = excluded.note`
  ).run(season_id, user_id, stat_key, Number(stat_value) || 0, note || '');
  res.json({ message: 'Statistica manuale salvata' });
});
