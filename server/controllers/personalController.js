/**
 * personalController.js
 * ------------------------------------------------------------
 * API della sezione personale "I miei tempi" (prove a tempo & gare tra
 * amici). Tutte le rotte richiedono un utente autenticato (requireAuth).
 *
 *   GET  /api/personal/token              → token del collector (lo crea se manca)
 *   POST /api/personal/token/regenerate   → rigenera il token (invalida il vecchio)
 *   GET  /api/personal/tracks             → tracciati con i miei tempi (+ mio best)
 *   GET  /api/personal/laps?track_id=     → i miei giri su un tracciato (andamento)
 *   GET  /api/personal/leaderboard?track_id= → best per pilota su un tracciato
 * ------------------------------------------------------------
 */
import crypto from 'node:crypto';
import db from '../database/db.js';
import { asyncHandler, HttpError, PRIMARY_HANDLE_JOIN, HANDLE_SELECT } from '../utils/helpers.js';

const genToken = () => `ptk_${crypto.randomBytes(20).toString('hex')}`;

/** Restituisce il token personale dell'utente, generandolo se assente. */
async function ensureToken(userId) {
  const row = await db.prepare('SELECT personal_token FROM users WHERE id = ?').get(userId);
  if (row && row.personal_token) return row.personal_token;
  // Genera un token univoco (collisione praticamente impossibile: ritenta comunque).
  for (let i = 0; i < 5; i++) {
    const token = genToken();
    const clash = await db.prepare('SELECT id FROM users WHERE personal_token = ?').get(token);
    if (!clash) {
      await db.prepare("UPDATE users SET personal_token = ?, updated_at = datetime('now') WHERE id = ?").run(token, userId);
      return token;
    }
  }
  throw new HttpError(500, 'Impossibile generare il token personale');
}

/** GET /api/personal/token */
export const getPersonalToken = asyncHandler(async (req, res) => {
  const token = await ensureToken(req.user.id);
  res.json({ token });
});

/** POST /api/personal/token/regenerate */
export const regeneratePersonalToken = asyncHandler(async (req, res) => {
  let token;
  for (let i = 0; i < 5; i++) {
    token = genToken();
    const clash = await db.prepare('SELECT id FROM users WHERE personal_token = ?').get(token);
    if (!clash) break;
    token = null;
  }
  if (!token) throw new HttpError(500, 'Impossibile generare il token personale');
  await db.prepare("UPDATE users SET personal_token = ?, updated_at = datetime('now') WHERE id = ?").run(token, req.user.id);
  res.json({ token });
});

/** GET /api/personal/tracks — tracciati con i miei tempi. */
export const getMyTracks = asyncHandler(async (req, res) => {
  const rows = await db
    .prepare(
      `SELECT pl.track_id, pl.circuit_id,
              c.name AS circuit_name, c.country_code, c.city,
              MIN(CASE WHEN pl.valid = 1 THEN pl.lap_time_ms END) AS best_ms,
              COUNT(*) AS laps,
              MAX(pl.created_at) AS last_at
         FROM personal_laps pl
         LEFT JOIN circuits c ON c.id = pl.circuit_id
        WHERE pl.user_id = ?
        GROUP BY pl.track_id, pl.circuit_id
        ORDER BY last_at DESC`
    )
    .all(req.user.id);
  res.json(rows);
});

/** Costruisce il filtro tracciato gestendo il caso track_id nullo. */
function trackFilter(raw) {
  if (raw === undefined || raw === null || raw === '' || raw === 'null') {
    return { clause: 'pl.track_id IS NULL', args: [] };
  }
  return { clause: 'pl.track_id = ?', args: [Number(raw)] };
}

/** GET /api/personal/laps?track_id= — i miei giri su un tracciato, per sessione. */
export const getMyLaps = asyncHandler(async (req, res) => {
  const f = trackFilter(req.query.track_id);
  const rows = await db
    .prepare(
      `SELECT ps.id AS session_id, ps.session_type, ps.created_at AS session_at,
              pl.lap, pl.lap_time_ms, pl.sector1_ms, pl.sector2_ms, pl.sector3_ms, pl.valid
         FROM personal_laps pl
         JOIN personal_sessions ps ON ps.id = pl.session_id
        WHERE pl.user_id = ? AND ${f.clause}
        ORDER BY ps.created_at ASC, pl.lap ASC`
    )
    .all(req.user.id, ...f.args);

  // Raggruppa per sessione: comodo per la tabella e per il grafico andamento
  // (best valido per sessione nel tempo).
  const bySession = new Map();
  for (const r of rows) {
    if (!bySession.has(r.session_id)) {
      bySession.set(r.session_id, {
        session_id: r.session_id,
        session_type: r.session_type,
        session_at: r.session_at,
        best_ms: null,
        laps: [],
      });
    }
    const s = bySession.get(r.session_id);
    s.laps.push({
      lap: r.lap,
      lap_time_ms: r.lap_time_ms,
      sector1_ms: r.sector1_ms,
      sector2_ms: r.sector2_ms,
      sector3_ms: r.sector3_ms,
      valid: r.valid,
    });
    if (r.valid && r.lap_time_ms > 0 && (s.best_ms == null || r.lap_time_ms < s.best_ms)) {
      s.best_ms = r.lap_time_ms;
    }
  }
  res.json(Array.from(bySession.values()));
});

/** GET /api/personal/leaderboard?track_id= — best per pilota sul tracciato. */
export const getTrackLeaderboard = asyncHandler(async (req, res) => {
  const f = trackFilter(req.query.track_id);
  const rows = await db
    .prepare(
      `SELECT pl.user_id, u.display_name, ${HANDLE_SELECT}, u.avatar, t.color AS team_color,
              MIN(pl.lap_time_ms) AS best_ms, COUNT(*) AS laps
         FROM personal_laps pl
         JOIN users u ON u.id = pl.user_id
         ${PRIMARY_HANDLE_JOIN}
         LEFT JOIN teams t ON t.id = u.team_id
        WHERE ${f.clause} AND pl.valid = 1 AND pl.lap_time_ms > 0
        GROUP BY pl.user_id
        ORDER BY best_ms ASC`
    )
    .all(...f.args);
  res.json(rows);
});
