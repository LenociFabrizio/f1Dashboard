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

/** Ultimi post della bacheca con autore e utenti taggati. */
async function recentPosts(limit = 5) {
  const posts = await db
    .prepare(
      `SELECT p.id, p.author_id, p.body, p.media_url, p.media_type, p.created_at,
              u.display_name AS author_name, u.username AS author_username,
              u.avatar AS author_avatar, t.color AS author_team_color
         FROM posts p
         JOIN users u ON u.id = p.author_id
         LEFT JOIN teams t ON t.id = u.team_id
        ORDER BY p.created_at DESC, p.id DESC LIMIT ?`
    )
    .all(limit);
  if (!posts.length) return posts;
  const ids = posts.map((p) => p.id);
  const tags = await db
    .prepare(
      `SELECT pt.post_id, u.display_name, u.username
         FROM post_tags pt JOIN users u ON u.id = pt.user_id
        WHERE pt.post_id IN (${ids.map(() => '?').join(',')})`
    )
    .all(...ids);
  const byPost = new Map();
  for (const t of tags) {
    if (!byPost.has(t.post_id)) byPost.set(t.post_id, []);
    byPost.get(t.post_id).push({ display_name: t.display_name, username: t.username });
  }
  return posts.map((p) => ({ ...p, tags: byPost.get(p.id) || [] }));
}

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
  const posts = await recentPosts(4);

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

  res.json({ season, drivers, constructors, nextRace, lastRace, lastResults, calendar, posts });
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
  const posts = await recentPosts(5);

  res.json({
    season,
    myStanding,
    myStats,
    driverStandings: driverStandings.slice(0, 10),
    constructorStandings: (await getConstructorStandings(season.id)).slice(0, 5),
    nextRace,
    lastRace,
    posts,
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
