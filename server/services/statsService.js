/**
 * statsService.js
 * ------------------------------------------------------------
 * Statistiche di campionato e per singolo pilota.
 * Genera automaticamente record e trend a partire dai risultati.
 * ------------------------------------------------------------
 */
import db from '../database/db.js';
import { round } from '../utils/helpers.js';
import { getDriverStandings } from './standingsService.js';

/** Tutti i risultati "grezzi" di un pilota nella stagione, arricchiti. */
async function driverRaceRows(seasonId, userId) {
  return db
    .prepare(
      `SELECT r.*, ra.round, ra.name AS race_name, ra.race_date,
              c.name AS circuit_name, c.country_code,
              q.position AS quali_position
         FROM results r
         JOIN races ra   ON ra.id = r.race_id
         JOIN circuits c ON c.id = ra.circuit_id
         LEFT JOIN qualifying q ON q.race_id = r.race_id AND q.user_id = r.user_id
        WHERE ra.season_id = ? AND r.user_id = ? AND ra.status = 'completed'
        ORDER BY ra.round ASC`
    )
    .all(seasonId, userId);
}

/**
 * Statistiche complete di un singolo pilota.
 */
export async function getDriverStats(seasonId, userId) {
  const rows = await driverRaceRows(seasonId, userId);
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return null;

  const stats = {
    user_id: userId,
    races: rows.length,
    points: 0,
    wins: 0,
    podiums: 0,
    poles: 0,
    fastest_laps: 0,
    dnf: 0,
    overtakes: 0,
    positions: [],
    quali_positions: [],
  };

  const byCircuit = new Map(); // media posizione per circuito

  for (const r of rows) {
    stats.points += r.points;
    stats.overtakes += r.overtakes;
    if (r.pole) stats.poles += 1;
    if (r.fastest_lap) stats.fastest_laps += 1;
    if (r.quali_position) stats.quali_positions.push(r.quali_position);
    if (r.dnf) {
      stats.dnf += 1;
    } else if (r.position) {
      stats.positions.push(r.position);
      if (r.position === 1) stats.wins += 1;
      if (r.position <= 3) stats.podiums += 1;

      if (!byCircuit.has(r.circuit_name)) byCircuit.set(r.circuit_name, []);
      byCircuit.get(r.circuit_name).push(r.position);
    }
  }

  const finished = stats.positions.length;
  stats.points = round(stats.points, 1);
  stats.avg_position = finished ? round(stats.positions.reduce((a, b) => a + b, 0) / finished, 2) : null;
  stats.avg_quali = stats.quali_positions.length
    ? round(stats.quali_positions.reduce((a, b) => a + b, 0) / stats.quali_positions.length, 2)
    : null;
  stats.win_rate = stats.races ? round((stats.wins / stats.races) * 100, 1) : 0;
  stats.podium_rate = stats.races ? round((stats.podiums / stats.races) * 100, 1) : 0;
  stats.dnf_rate = stats.races ? round((stats.dnf / stats.races) * 100, 1) : 0;

  // Miglior / peggior risultato
  const finishedRows = rows.filter((r) => !r.dnf && r.position);
  const bestRow = finishedRows.slice().sort((a, b) => a.position - b.position)[0] || null;
  const worstRow = finishedRows.slice().sort((a, b) => b.position - a.position)[0] || null;
  stats.best_result = bestRow
    ? { position: bestRow.position, race: bestRow.race_name, round: bestRow.round }
    : null;
  stats.worst_result = worstRow
    ? { position: worstRow.position, race: worstRow.race_name, round: worstRow.round }
    : null;

  // Circuito migliore / peggiore (per media posizione)
  let bestCircuit = null;
  let worstCircuit = null;
  for (const [name, positions] of byCircuit.entries()) {
    const avg = positions.reduce((a, b) => a + b, 0) / positions.length;
    if (!bestCircuit || avg < bestCircuit.avg) bestCircuit = { name, avg: round(avg, 2) };
    if (!worstCircuit || avg > worstCircuit.avg) worstCircuit = { name, avg: round(avg, 2) };
  }
  stats.best_circuit = bestCircuit;
  stats.worst_circuit = worstCircuit;

  // Storico per grafici
  stats.history = rows.map((r) => ({
    round: r.round,
    race: r.race_name,
    circuit: r.circuit_name,
    country_code: r.country_code,
    grid: r.grid_position,
    quali: r.quali_position,
    position: r.dnf ? null : r.position,
    points: r.points,
    dnf: !!r.dnf,
    fastest_lap: !!r.fastest_lap,
    pole: !!r.pole,
    penalty: r.penalty_seconds,
    notes: r.notes,
  }));

  // Trend ultimi 5 GP (posizioni; null = DNF)
  stats.last5 = stats.history.slice(-5).map((h) => h.position);

  return stats;
}

/**
 * Statistiche/record di campionato: leader in ogni categoria + superlativi.
 */
export async function getChampionshipStats(seasonId) {
  const standings = await getDriverStandings(seasonId);
  if (!standings.length) {
    return { leaders: {}, standings: [], consistency: null };
  }

  const topBy = (key, extra) => {
    const sorted = [...standings].sort((a, b) => (b[key] || 0) - (a[key] || 0));
    const top = sorted[0];
    return top && (top[key] || 0) > 0
      ? { name: top.display_name, value: top[key], avatar: top.avatar, team: top.team_name, ...(extra ? extra(top) : {}) }
      : null;
  };

  // Pilota più costante = minor deviazione dalle proprie posizioni medie
  let consistency = null;
  for (const s of standings) {
    const full = await getDriverStats(seasonId, s.user_id);
    if (!full || full.positions.length < 2) continue;
    const mean = full.avg_position;
    const variance =
      full.positions.reduce((acc, p) => acc + (p - mean) ** 2, 0) / full.positions.length;
    const std = Math.sqrt(variance);
    if (!consistency || std < consistency.std) {
      consistency = { name: s.display_name, std: round(std, 2), avatar: s.avatar, team: s.team_name };
    }
  }

  // Maggior rimonta = massima somma di (griglia - arrivo) positivi
  const gainRows = await db
    .prepare(
      `SELECT u.display_name, u.avatar, SUM(MAX(r.grid_position - r.position, 0)) AS gained
         FROM results r
         JOIN races ra ON ra.id = r.race_id
         JOIN users u  ON u.id = r.user_id
        WHERE ra.season_id = ? AND ra.status='completed'
          AND r.dnf = 0 AND r.position IS NOT NULL AND r.grid_position IS NOT NULL
        GROUP BY r.user_id
        ORDER BY gained DESC LIMIT 1`
    )
    .get(seasonId);

  return {
    standings,
    leaders: {
      most_wins: topBy('wins'),
      most_poles: topBy('poles'),
      most_podiums: topBy('podiums'),
      most_fastest_laps: topBy('fastest_laps'),
      most_overtakes: topBy('overtakes'),
      most_points: { name: standings[0].display_name, value: standings[0].points, avatar: standings[0].avatar, team: standings[0].team_name },
      best_avg_position: (() => {
        const withAvg = standings.filter((s) => s.avg_position != null);
        withAvg.sort((a, b) => a.avg_position - b.avg_position);
        const t = withAvg[0];
        return t ? { name: t.display_name, value: t.avg_position, avatar: t.avatar, team: t.team_name } : null;
      })(),
      most_consistent: consistency,
      biggest_comeback: gainRows && gainRows.gained > 0
        ? { name: gainRows.display_name, value: gainRows.gained, avatar: gainRows.avatar }
        : null,
    },
  };
}
