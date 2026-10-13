/**
 * dashboardController.js
 * ------------------------------------------------------------
 * Aggrega i dati per la dashboard utente, la homepage e la
 * dashboard admin in un'unica risposta comoda per il frontend.
 * ------------------------------------------------------------
 */
import db from '../database/db.js';
import { asyncHandler, PRIMARY_HANDLE_JOIN, round } from '../utils/helpers.js';
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
              u.display_name AS author_name, gph.handle AS author_handle,
              u.avatar AS author_avatar, t.color AS author_team_color
         FROM posts p
         JOIN users u ON u.id = p.author_id
         ${PRIMARY_HANDLE_JOIN}
         LEFT JOIN teams t ON t.id = u.team_id
        ORDER BY p.created_at DESC, p.id DESC LIMIT ?`
    )
    .all(limit);
  if (!posts.length) return posts;
  const ids = posts.map((p) => p.id);
  const tags = await db
    .prepare(
      `SELECT pt.post_id, u.display_name, gph.handle
         FROM post_tags pt
         JOIN users u ON u.id = pt.user_id
         ${PRIMARY_HANDLE_JOIN}
        WHERE pt.post_id IN (${ids.map(() => '?').join(',')})`
    )
    .all(...ids);
  const byPost = new Map();
  for (const t of tags) {
    if (!byPost.has(t.post_id)) byPost.set(t.post_id, []);
    byPost.get(t.post_id).push({ display_name: t.display_name, handle: t.handle });
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
        `SELECT r.user_id, r.position, r.points, r.dnf, u.display_name, u.avatar, t.color AS team_color, t.name AS team_name
           FROM results r JOIN users u ON u.id=r.user_id
           LEFT JOIN teams t ON t.id = COALESCE(r.team_id, u.team_id)
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

/**
 * GET /api/dashboard/mobile — riepilogo compatto del pilota loggato per la
 * vista app mobile (richiede auth). Ogni blocco può essere null.
 * I punti scuderia arrivano da getConstructorStandings (somma dei punti dei
 * piloti per scuderia attuale): qui non si ricalcola nulla per singola gara.
 */
export const mobileSummary = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Query indipendenti in parallelo (su Turso remoto ogni await è un round-trip).
  // Dati pubblici dell'utente (mai email/password_hash) + stagione attiva.
  const [me, season] = await Promise.all([
    db
      .prepare(
        `SELECT u.id, u.display_name, gph.handle AS handle, u.avatar, u.role, u.team_id,
                u.nationality, u.favorite_number
           FROM users u
           ${PRIMARY_HANDLE_JOIN}
          WHERE u.id = ?`
      )
      .get(userId),
    activeSeason(),
  ]);

  if (!season) {
    return res.json({
      season: null, me: me || null, driver: null, team: null,
      next_race: null, last_race: null, leaders: null,
    });
  }

  // Tutto ciò che dipende solo dalla stagione parte insieme; in sequenza
  // restano solo fallback scuderia, anagrafica team e my_result (dipendenti).
  const [counts, driverStandings, constructorStandings, next, last] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed
           FROM races WHERE season_id = ?`
      )
      .get(season.id),
    getDriverStandings(season.id),
    getConstructorStandings(season.id),
    db
      .prepare(`${RACE_SELECT} WHERE ra.season_id=? AND ra.status='scheduled' ORDER BY ra.round LIMIT 1`)
      .get(season.id),
    db
      .prepare(`${RACE_SELECT} WHERE ra.season_id=? AND ra.status='completed' ORDER BY ra.round DESC LIMIT 1`)
      .get(season.id),
  ]);

  // Posizione in classifica piloti
  let driver = null;
  const idx = driverStandings.findIndex((d) => d.user_id === userId);
  if (idx >= 0) {
    const d = driverStandings[idx];
    driver = {
      position: d.position,
      total: driverStandings.length,
      points: d.points,
      gap_to_leader: d.gap_to_leader,
      gap_to_ahead: idx > 0 ? round(driverStandings[idx - 1].points - d.points, 1) : null,
      wins: d.wins,
      podiums: d.podiums,
      races: d.races,
    };
  }

  // Scuderia: attuale, altrimenti quella dell'ultima gara completata con team
  // (stessa logica di teamByUser in getConstructorStandings)
  let teamId = me?.team_id ?? null;
  if (teamId === null) {
    const lastTeam = await db
      .prepare(
        `SELECT r.team_id FROM results r
           JOIN races ra ON ra.id = r.race_id
          WHERE ra.season_id = ? AND ra.status = 'completed'
            AND r.user_id = ? AND r.team_id IS NOT NULL
          ORDER BY ra.round DESC LIMIT 1`
      )
      .get(season.id, userId);
    teamId = lastTeam ? lastTeam.team_id : null;
  }

  let team = null;
  if (teamId !== null) {
    const ci = constructorStandings.findIndex((s) => s.team_id === teamId);
    if (ci >= 0) {
      const c = constructorStandings[ci];
      team = {
        team_id: c.team_id, team_name: c.team_name, team_color: c.team_color, logo: c.logo,
        position: c.position, total: constructorStandings.length, points: c.points,
        gap_to_leader: round(constructorStandings[0].points - c.points, 1),
        gap_to_ahead: ci > 0 ? round(constructorStandings[ci - 1].points - c.points, 1) : null,
      };
    } else {
      // Scuderia non ancora in classifica: solo dati anagrafici
      const t = await db.prepare('SELECT id, name, color, logo FROM teams WHERE id = ?').get(teamId);
      if (t) {
        team = {
          team_id: t.id, team_name: t.name, team_color: t.color, logo: t.logo,
          position: null, total: constructorStandings.length, points: 0,
        };
      }
    }
  }

  let lastRace = null;
  if (last) {
    const r = await db
      .prepare('SELECT position, points, dnf FROM results WHERE race_id = ? AND user_id = ?')
      .get(last.id, userId);
    lastRace = {
      id: last.id, round: last.round, name: last.name, race_date: last.race_date,
      country_code: last.country_code,
      my_result: r ? { position: r.position, points: r.points, dnf: !!r.dnf } : null,
    };
  }

  const dl = driverStandings[0];
  const cl = constructorStandings[0];
  const leaders = dl || cl
    ? {
        driver: dl ? { user_id: dl.user_id, display_name: dl.display_name, handle: dl.handle, points: dl.points } : null,
        team: cl ? { team_id: cl.team_id, team_name: cl.team_name, team_color: cl.team_color, points: cl.points } : null,
      }
    : null;

  res.json({
    season: {
      id: season.id, name: season.name, year: season.year,
      total_rounds: counts.total || 0, completed_rounds: counts.completed || 0,
    },
    me: me || null,
    driver,
    team,
    next_race: next
      ? {
          id: next.id, round: next.round, name: next.name, race_date: next.race_date,
          circuit_name: next.circuit_name, country: next.country, country_code: next.country_code,
        }
      : null,
    last_race: lastRace,
    leaders,
  });
});
