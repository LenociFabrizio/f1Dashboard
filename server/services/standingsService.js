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
import { round, PRIMARY_HANDLE_JOIN, HANDLE_SELECT } from '../utils/helpers.js';

/**
 * Classifica Piloti per una stagione.
 * @param {number} seasonId
 * @returns {Array} righe classifica ordinate
 */
export async function getDriverStandings(seasonId) {
  // Prende tutti i risultati della stagione con dati pilota/team
  const rows = await db
    .prepare(
      `SELECT r.*, ${HANDLE_SELECT}, u.display_name, u.avatar, u.nationality, u.favorite_number,
              u.reserve_driver, ra.round AS race_round, ra.name AS race_name,
              t.name AS team_name, t.color AS team_color,
              ct.name AS cur_team_name, ct.color AS cur_team_color
         FROM results r
         JOIN races  ra ON ra.id = r.race_id
         JOIN users  u  ON u.id  = r.user_id
         ${PRIMARY_HANDLE_JOIN}
         LEFT JOIN teams t  ON t.id  = COALESCE(r.team_id, u.team_id)
         LEFT JOIN teams ct ON ct.id = u.team_id
        WHERE ra.season_id = ? AND ra.status = 'completed'
        ORDER BY ra.round ASC`
    )
    .all(seasonId);

  const map = new Map();

  for (const row of rows) {
    if (!map.has(row.user_id)) {
      map.set(row.user_id, {
        user_id: row.user_id,
        handle: row.handle,
        display_name: row.display_name,
        avatar: row.avatar,
        nationality: row.nationality,
        favorite_number: row.favorite_number,
        reserve_driver: row.reserve_driver || null,
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
        bot_rounds: [], // gare in cui ha corso il bot di riserva al posto dell'utente
        positions_sum: 0, // per media piazzamento (solo gare terminate)
        positions_count: 0,
      });
    }
    const s = map.get(row.user_id);
    // Scuderia mostrata: quella attuale del pilota; se non ne ha (es. dopo un
    // reset assegnazioni) quella dell'ultima gara disputata (righe per round).
    if (row.cur_team_name) {
      s.team_name = row.cur_team_name;
      s.team_color = row.cur_team_color;
    } else if (row.team_name) {
      s.team_name = row.team_name;
      s.team_color = row.team_color;
    }
    s.points += row.points;
    s.races += 1;
    s.overtakes += row.overtakes;
    if (row.bot_driver && String(row.bot_driver).trim()) {
      s.bot_rounds.push({ round: row.race_round, race: row.race_name, bot: String(row.bot_driver).trim() });
    }
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
    bot_rounds: s.bot_rounds.sort((a, b) => a.round - b.round),
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
  // Punti costruttori = somma dei punti dei piloti raggruppati per la scuderia
  // mostrata nella classifica piloti: quella attuale del pilota, oppure (se non
  // ne ha, es. dopo un reset assegnazioni) quella dell'ultima gara disputata.
  // Così le due classifiche restano sempre allineate.
  const rows = await db
    .prepare(
      `SELECT r.*, u.team_id AS cur_team_id, r.team_id AS race_team_id,
              u.display_name, u.avatar
         FROM results r
         JOIN races ra ON ra.id = r.race_id
         JOIN users u  ON u.id  = r.user_id
        WHERE ra.season_id = ? AND ra.status = 'completed'
        ORDER BY ra.round ASC`
    )
    .all(seasonId);

  const teamById = new Map(
    (await db.prepare('SELECT id, name, color, logo FROM teams').all()).map((t) => [t.id, t])
  );

  // Scuderia di ciascun pilota (righe ordinate per round: vince l'ultima gara)
  const teamByUser = new Map();
  for (const row of rows) {
    const tid = row.cur_team_id ?? row.race_team_id ?? teamByUser.get(row.user_id) ?? null;
    if (tid !== null) teamByUser.set(row.user_id, tid);
  }

  const map = new Map();

  for (const row of rows) {
    const team = teamById.get(teamByUser.get(row.user_id));
    if (!team) continue; // pilota mai associato a una scuderia
    row.tid = team.id;
    row.team_name = team.name;
    row.team_color = team.color;
    row.logo = team.logo;
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
        race_ids: new Set(), // GP disputati (almeno una vettura in gara)
        drivers: new Map(), // contributo di ogni pilota (anteprima nella app mobile)
      });
    }
    const s = map.get(row.tid);
    s.points += row.points;
    if (!s.drivers.has(row.user_id)) {
      s.drivers.set(row.user_id, {
        user_id: row.user_id, display_name: row.display_name, avatar: row.avatar, points: 0, races: 0,
      });
    }
    const d = s.drivers.get(row.user_id);
    d.points += row.points;
    d.races += 1;
    s.entries += 1;
    s.race_ids.add(row.race_id);
    if (row.pole) s.poles += 1;
    if (row.fastest_lap) s.fastest_laps += 1;
    if (!row.dnf && row.position) {
      if (row.position === 1) s.wins += 1;
      if (row.position <= 3) s.podiums += 1;
    }
  }

  // Media/gara = punti del team per GP disputato (non per singola vettura:
  // altrimenti la media di un team con due piloti risulterebbe dimezzata).
  let standings = Array.from(map.values()).map(({ race_ids, drivers, ...s }) => ({
    ...s,
    drivers: Array.from(drivers.values())
      .map((d) => ({ ...d, points: round(d.points, 1) }))
      .sort((a, b) => b.points - a.points),
    races: race_ids.size,
    points: round(s.points, 1),
    avg_points: race_ids.size ? round(s.points / race_ids.size, 2) : 0,
  }));

  // Ordinamento: punti desc, vittorie desc, podi desc (come la classifica piloti)
  standings.sort((a, b) => b.points - a.points || b.wins - a.wins || b.podiums - a.podiums);
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
