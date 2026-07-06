/**
 * dashboardController.js
 * ------------------------------------------------------------
 * Aggrega i dati per la dashboard utente, la homepage e la
 * dashboard admin in un'unica risposta comoda per il frontend.
 * ------------------------------------------------------------
 */
import db from '../database/db.js';
import { asyncHandler } from '../utils/helpers.js';
import { getDriverStandings, getConstructorStandings } from '../services/standingsService.js';
import { getDriverStats } from '../services/statsService.js';

/** Recupera la stagione attiva (o l'ultima). */
async function activeSeason() {
  return (
    (await db.prepare('SELECT * FROM seasons WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get()) ||
    (await db.prepare('SELECT * FROM seasons ORDER BY year DESC LIMIT 1').get())
  );
}

const RACE_SELECT = `
  SELECT ra.*, c.name AS circuit_name, c.country, c.country_code, c.image AS circuit_image
    FROM races ra JOIN circuits c ON c.id = ra.circuit_id`;

/** GET /api/dashboard/home — dati per la homepage pubblica */
export const homeData = asyncHandler(async (_req, res) => {
  const season = await activeSeason();
  if (!season) return res.json({ season: null });

  const drivers = (await getDriverStandings(season.id)).slice(0, 5);
  const constructors = (await getConstructorStandings(season.id)).slice(0, 5);
  const nextRace = await db
    .prepare(`${RACE_SELECT} WHERE ra.season_id=? AND ra.status='scheduled' ORDER BY ra.round LIMIT 1`)
    .get(season.id);
  const lastRace = await db
    .prepare(`${RACE_SELECT} WHERE ra.season_id=? AND ra.status='completed' ORDER BY ra.round DESC LIMIT 1`)
    .get(season.id);
  const calendar = await db
    .prepare(`${RACE_SELECT} WHERE ra.season_id=? ORDER BY ra.round`)
    .all(season.id);
  const news = await db
    .prepare(
      `SELECT n.*, u.display_name AS author_name FROM news n
       LEFT JOIN users u ON u.id=n.author_id
       WHERE n.season_id=? OR n.season_id IS NULL
       ORDER BY n.published_at DESC LIMIT 4`
    )
    .all(season.id);

  let lastResults = [];
  if (lastRace) {
    lastResults = await db
      .prepare(
        `SELECT r.position, r.points, r.dnf, u.display_name, u.avatar, t.color AS team_color, t.name AS team_name
           FROM results r JOIN users u ON u.id=r.user_id
           LEFT JOIN teams t ON t.id=r.team_id
          WHERE r.race_id=? ORDER BY (r.dnf),(r.position IS NULL), r.position LIMIT 5`
      )
      .all(lastRace.id);
  }

  res.json({ season, drivers, constructors, nextRace, lastRace, lastResults, calendar, news });
});

/** GET /api/dashboard/me — dashboard personale (richiede auth) */
export const myDashboard = asyncHandler(async (req, res) => {
  const season = await activeSeason();
  if (!season) return res.json({ season: null });

  const driverStandings = await getDriverStandings(season.id);
  const myStats = await getDriverStats(season.id, req.user.id);
  const myStanding = driverStandings.find((d) => d.user_id === req.user.id) || null;

  const nextRace = await db
    .prepare(`${RACE_SELECT} WHERE ra.season_id=? AND ra.status='scheduled' ORDER BY ra.round LIMIT 1`)
    .get(season.id);
  const lastRace = await db
    .prepare(`${RACE_SELECT} WHERE ra.season_id=? AND ra.status='completed' ORDER BY ra.round DESC LIMIT 1`)
    .get(season.id);
  const news = await db
    .prepare(
      `SELECT n.*, u.display_name AS author_name FROM news n
       LEFT JOIN users u ON u.id=n.author_id
       ORDER BY n.published_at DESC LIMIT 5`
    )
    .all();

  res.json({
    season,
    myStanding,
    myStats,
    driverStandings: driverStandings.slice(0, 10),
    constructorStandings: (await getConstructorStandings(season.id)).slice(0, 5),
    nextRace,
    lastRace,
    news,
  });
});

/** GET /api/dashboard/admin — statistiche pannello admin */
export const adminDashboard = asyncHandler(async (_req, res) => {
  const season = await activeSeason();
  const userCount = (await db.prepare('SELECT COUNT(*) c FROM users WHERE is_active=1').get()).c;
  const adminCount = (await db.prepare("SELECT COUNT(*) c FROM users WHERE role='admin'").get()).c;
  const teamCount = (await db.prepare('SELECT COUNT(*) c FROM teams WHERE is_active=1').get()).c;

  let raceCount = 0;
  let completedCount = 0;
  let nextRace = null;
  let lastRace = null;
  if (season) {
    raceCount = (await db.prepare('SELECT COUNT(*) c FROM races WHERE season_id=?').get(season.id)).c;
    completedCount = (await db
      .prepare("SELECT COUNT(*) c FROM races WHERE season_id=? AND status='completed'")
      .get(season.id)).c;
    nextRace = await db
      .prepare(`${RACE_SELECT} WHERE ra.season_id=? AND ra.status='scheduled' ORDER BY ra.round LIMIT 1`)
      .get(season.id);
    lastRace = await db
      .prepare(`${RACE_SELECT} WHERE ra.season_id=? AND ra.status='completed' ORDER BY ra.round DESC LIMIT 1`)
      .get(season.id);
  }

  res.json({
    season,
    stats: { userCount, adminCount, teamCount, raceCount, completedCount, remaining: raceCount - completedCount },
    nextRace,
    lastRace,
  });
});
