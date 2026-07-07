/**
 * standingsService.js
 * ------------------------------------------------------------
 * Calcolo delle classifiche Piloti e Costruttori a partire dai
 * risultati salvati. Le classifiche sono calcolate on-demand
 * (nessuna denormalizzazione) così restano sempre coerenti dopo
 * ogni inserimento/modifica dei risultati.
 * ------------------------------------------------------------
 */
import db from '../database/db.js';
import { round } from '../utils/helpers.js';

/**
 * Classifica Piloti per una stagione.
 * @param {number} seasonId
 * @returns {Array} righe classifica ordinate
 */
export async function getDriverStandings(seasonId) {
  // Prende tutti i risultati della stagione con dati pilota/team
  const rows = await db
    .prepare(
      `SELECT r.*, u.username, u.display_name, u.avatar, u.nationality, u.favorite_number,
              t.name AS team_name, t.color AS team_color
         FROM results r
         JOIN races  ra ON ra.id = r.race_id
         JOIN users  u  ON u.id  = r.user_id
         LEFT JOIN teams t ON t.id = COALESCE(r.team_id, u.team_id)
        WHERE ra.season_id = ? AND ra.status = 'completed'`
    )
    .all(seasonId);

  const map = new Map();

  for (const row of rows) {
    if (!map.has(row.user_id)) {
      map.set(row.user_id, {
        user_id: row.user_id,
        username: row.username,
        display_name: row.display_name,
        avatar: row.avatar,
        nationality: row.nationality,
        favorite_number: row.favorite_number,
        team_name: row.team_name,
        team_color: row.team_color,
        points: 0,
        wins: 0,
        podiums: 0,
        poles: 0,
        fastest_laps: 0,
        dnf: 0,
        races: 0,
        overtakes: 0,
        positions_sum: 0, // per media piazzamento (solo gare terminate)
        positions_count: 0,
      });
    }
    const s = map.get(row.user_id);
    s.points += row.points;
    s.races += 1;
    s.overtakes += row.overtakes;
    if (row.pole) s.poles += 1;
    if (row.fastest_lap) s.fastest_laps += 1;
    if (row.dnf) {
      s.dnf += 1;
    } else if (row.position) {
      s.positions_sum += row.position;
      s.positions_count += 1;
      if (row.position === 1) s.wins += 1;
      if (row.position <= 3) s.podiums += 1;
    }
  }

  let standings = Array.from(map.values()).map((s) => ({
    ...s,
    avg_position: s.positions_count ? round(s.positions_sum / s.positions_count, 2) : null,
    points: round(s.points, 1),
  }));

  // Ordinamento: punti desc, vittorie desc, podi desc
  standings.sort(
    (a, b) => b.points - a.points || b.wins - a.wins || b.podiums - a.podiums
  );

  const leaderPoints = standings.length ? standings[0].points : 0;
  standings = standings.map((s, i) => ({
    position: i + 1,
    gap_to_leader: round(leaderPoints - s.points, 1),
    ...s,
  }));

  return standings;
}

/**
 * Classifica Costruttori per una stagione.
 * @param {number} seasonId
 */
export async function getConstructorStandings(seasonId) {
  // Il team del risultato può essere NULL (risultati inseriti prima del fix
  // su team_id): in tal caso si usa la scuderia attuale del pilota (COALESCE).
  const rows = await db
    .prepare(
      `SELECT r.*, t.id AS tid, t.name AS team_name, t.color AS team_color, t.logo
         FROM results r
         JOIN races ra ON ra.id = r.race_id
         JOIN users u  ON u.id  = r.user_id
         JOIN teams t  ON t.id  = COALESCE(r.team_id, u.team_id)
        WHERE ra.season_id = ? AND ra.status = 'completed'`
    )
    .all(seasonId);

  const map = new Map();

  for (const row of rows) {
    if (!map.has(row.tid)) {
      map.set(row.tid, {
        team_id: row.tid,
        team_name: row.team_name,
        team_color: row.team_color,
        logo: row.logo,
        points: 0,
        wins: 0,
        podiums: 0,
        poles: 0,
        fastest_laps: 0,
        entries: 0,
      });
    }
    const s = map.get(row.tid);
    s.points += row.points;
    s.entries += 1;
    if (row.pole) s.poles += 1;
    if (row.fastest_lap) s.fastest_laps += 1;
    if (!row.dnf && row.position) {
      if (row.position === 1) s.wins += 1;
      if (row.position <= 3) s.podiums += 1;
    }
  }

  let standings = Array.from(map.values()).map((s) => ({
    ...s,
    points: round(s.points, 1),
    avg_points: s.entries ? round(s.points / s.entries, 2) : 0,
  }));

  standings.sort((a, b) => b.points - a.points || b.wins - a.wins);
  standings = standings.map((s, i) => ({ position: i + 1, ...s }));
  return standings;
}

/**
 * Progressione punti per gara di ogni pilota (per grafici a linee).
 * Restituisce { labels: [...gare], drivers: [{name, color, data:[cumulati]}] }
 */
export async function getPointsProgression(seasonId) {
  const races = await db
    .prepare(
      `SELECT id, round, name FROM races
        WHERE season_id = ? AND status = 'completed'
        ORDER BY round ASC`
    )
    .all(seasonId);

  const results = await db
    .prepare(
      `SELECT r.user_id, r.race_id, r.points, u.display_name, t.color AS team_color
         FROM results r
         JOIN races ra ON ra.id = r.race_id
         JOIN users u  ON u.id  = r.user_id
         LEFT JOIN teams t ON t.id = COALESCE(r.team_id, u.team_id)
        WHERE ra.season_id = ? AND ra.status = 'completed'`
    )
    .all(seasonId);

  const labels = races.map((r) => `R${r.round}`);
  const raceIndex = new Map(races.map((r, i) => [r.id, i]));

  const drivers = new Map();
  for (const res of results) {
    if (!drivers.has(res.user_id)) {
      drivers.set(res.user_id, {
        name: res.display_name,
        color: res.team_color || '#e10600',
        perRace: new Array(races.length).fill(0),
      });
    }
    const idx = raceIndex.get(res.race_id);
    if (idx !== undefined) drivers.get(res.user_id).perRace[idx] += res.points;
  }

  // Cumulativo
  const datasets = Array.from(drivers.values()).map((d) => {
    let cum = 0;
    const data = d.perRace.map((p) => (cum += p));
    return { label: d.name, color: d.color, data };
  });

  return { labels, datasets };
}
