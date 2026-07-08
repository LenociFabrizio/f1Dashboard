/**
 * resultController.js
 * ------------------------------------------------------------
 * Inserimento/aggiornamento dei risultati di una gara.
 * Alla conferma:
 *   - calcola automaticamente i punti (posizione + giro veloce)
 *   - segna la gara come 'completed'
 *   - le classifiche e le statistiche si ricalcolano on-demand
 *     (vedi standingsService/statsService), quindi restano coerenti.
 *
 * La scrittura vera e propria è in `persistResults()`, riusata sia dal
 * flusso manuale (saveResults) sia dall'import telemetria (captureService).
 * ------------------------------------------------------------
 */
import db from '../database/db.js';
import { asyncHandler, HttpError } from '../utils/helpers.js';
import { calculatePoints } from '../utils/constants.js';

/**
 * Persiste (sostituendoli interamente) i risultati di una gara in un'unica
 * transazione batch atomica. Calcola i punti quando non forniti.
 *
 * @param {number} raceId
 * @param {Array<object>} rows righe risultato (vedi saveResults per i campi)
 * @param {object} [opts]
 * @param {boolean} [opts.markCompleted=true]  marca la gara come conclusa
 * @param {string}  [opts.comment]             se definito, aggiorna il commento gara
 * @param {number|null} [opts.mvpUserId]       se definito, aggiorna l'MVP
 * @returns {Promise<Array>} righe salvate (con dati pilota/team)
 */
export async function persistResults(raceId, rows, opts = {}) {
  const race = await db.prepare('SELECT * FROM races WHERE id = ?').get(raceId);
  if (!race) throw new HttpError(404, 'Gara non trovata');

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new HttpError(400, 'Nessun risultato fornito');
  }

  // Configurazione punti della stagione (pole / giro veloce)
  const season = await db.prepare('SELECT points_pole, points_fastest_lap FROM seasons WHERE id = ?').get(race.season_id);
  const pointsPole = season ? Number(season.points_pole) || 0 : 0;
  const pointsFastestLap = season ? Number(season.points_fastest_lap ?? 1) : 1;

  const INSERT_SQL =
    `INSERT INTO results
      (race_id, user_id, team_id, grid_position, position, points, finish_time, gap,
       fastest_lap, pole, dnf, dnf_reason, penalty_seconds, penalty_note, overtakes, notes, bot_driver)
     VALUES
      (@race_id, @user_id, @team_id, @grid_position, @position, @points, @finish_time, @gap,
       @fastest_lap, @pole, @dnf, @dnf_reason, @penalty_seconds, @penalty_note, @overtakes, @notes, @bot_driver)`;

  const stmts = [{ sql: 'DELETE FROM results WHERE race_id = ?', args: [raceId] }];

  // Fallback team: se una riga non porta team_id, si usa la scuderia attuale
  // del pilota. Evita risultati con team_id NULL (che sparirebbero dalla
  // classifica costruttori).
  const teamByUser = new Map(
    (await db.prepare('SELECT id, team_id FROM users').all()).map((u) => [u.id, u.team_id])
  );

  for (const r of rows) {
    if (!r.user_id) continue;
    const dnf = r.dnf ? 1 : 0;
    const fastest = r.fastest_lap ? 1 : 0;
    const pole = r.pole ? 1 : 0;
    const position = dnf ? null : r.position ? Number(r.position) : null;

    // Punti: usa quelli forniti se presenti, altrimenti calcola (con la
    // configurazione pole/giro veloce della stagione)
    const points =
      r.points !== undefined && r.points !== null && r.points !== ''
        ? Number(r.points)
        : calculatePoints(position, !!fastest, !!dnf, { pole: !!pole, pointsPole, pointsFastestLap });

    stmts.push({
      sql: INSERT_SQL,
      args: {
        race_id: raceId,
        user_id: Number(r.user_id),
        team_id: r.team_id ? Number(r.team_id) : (teamByUser.get(Number(r.user_id)) ?? null),
        grid_position: r.grid_position ? Number(r.grid_position) : null,
        position,
        points,
        finish_time: r.finish_time || null,
        gap: r.gap || null,
        fastest_lap: fastest,
        pole,
        dnf,
        dnf_reason: r.dnf_reason || '',
        penalty_seconds: r.penalty_seconds ? Number(r.penalty_seconds) : 0,
        penalty_note: r.penalty_note || '',
        overtakes: r.overtakes ? Number(r.overtakes) : 0,
        notes: r.notes || '',
        // Se valorizzato, il bot (riserva) ha corso al posto del giocatore.
        // I punti restano attribuiti al giocatore titolare (user_id).
        bot_driver: r.bot_driver ? String(r.bot_driver).trim() : '',
      },
    });
  }

  // Segna la gara come conclusa (di default) + metadati opzionali
  if (opts.markCompleted !== false) {
    stmts.push({ sql: "UPDATE races SET status = 'completed' WHERE id = ?", args: [raceId] });
  }
  if (opts.comment !== undefined) {
    stmts.push({ sql: 'UPDATE races SET comment = ? WHERE id = ?', args: [opts.comment, raceId] });
  }
  if (opts.mvpUserId !== undefined) {
    stmts.push({ sql: 'UPDATE races SET mvp_user_id = ? WHERE id = ?', args: [opts.mvpUserId || null, raceId] });
  }

  await db.raw.batch(stmts, 'write');

  // Restituisce i risultati salvati
  return db
    .prepare(
      `SELECT r.*, u.display_name, u.avatar, t.name AS team_name, t.color AS team_color
         FROM results r
         JOIN users u ON u.id = r.user_id
         LEFT JOIN teams t ON t.id = r.team_id
        WHERE r.race_id = ?
        ORDER BY (r.dnf), (r.position IS NULL), r.position ASC`
    )
    .all(raceId);
}

/**
 * PUT /api/races/:id/results (admin)
 * Body: { results: [ { user_id, team_id, grid_position, position, finish_time,
 *                      gap, fastest_lap, pole, dnf, dnf_reason, penalty_seconds,
 *                      penalty_note, overtakes, notes, points? } ], mark_completed }
 *
 * Se `points` non è fornito per una riga, viene calcolato automaticamente.
 */
export const saveResults = asyncHandler(async (req, res) => {
  const raceId = Number(req.params.id);
  const saved = await persistResults(raceId, req.body.results || [], {
    markCompleted: req.body.mark_completed !== false,
    comment: req.body.comment,
    mvpUserId: req.body.mvp_user_id,
  });
  res.json({ message: 'Risultati salvati e classifiche aggiornate', results: saved });
});
