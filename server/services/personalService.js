/**
 * personalService.js
 * ------------------------------------------------------------
 * Import AUTOMATICO delle sessioni personali (prove a tempo & gare tra
 * amici) catturate dal collector di un pilota (token personale).
 *
 * A differenza del flusso di lega (captureService → staging admin), qui:
 *   - non c'è revisione dell'admin: i tempi vengono salvati subito;
 *   - non si toccano i dati canonici (results/qualifying/classifiche);
 *   - i giri finiscono in personal_sessions / personal_laps, usati dalla
 *     sezione "I miei tempi".
 *
 * Attribuzione dei giri (carIndex → utente del sito):
 *   - la vettura del GIOCATORE (payload.playerCarIndex) è sempre del
 *     proprietario del collector, anche se il nome online è oscurato
 *     (tipico nelle prove a tempo);
 *   - le altre vetture (gare tra amici) vengono abbinate agli utenti tramite
 *     gli handle di gioco già registrati (resolveIdentities → game_identities);
 *   - le vetture non abbinate vengono ignorate.
 * ------------------------------------------------------------
 */
import db from '../database/db.js';
import { HttpError } from '../utils/helpers.js';
import { resolveIdentities } from './captureService.js';
import { suggestCircuitId } from '../utils/f1-mappings.js';

/**
 * Importa una sessione personale per l'utente proprietario del collector.
 * @param {object} payload   JSON aggregato della sessione (vedi collector/builder)
 * @param {number} ownerUserId  id dell'utente (dal token personale)
 * @returns {Promise<{sessionId:number, laps:number, drivers:number}>}
 */
export async function ingestPersonalSession(payload, ownerUserId) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new HttpError(400, 'Payload sessione mancante o non valido');
  }
  const sessionUid = payload.sessionUID != null ? String(payload.sessionUID) : null;
  if (!sessionUid) throw new HttpError(400, 'sessionUID obbligatorio nel payload');

  const participants = payload.participants || [];
  const resolved = await resolveIdentities(participants);

  // carIndex → user_id (solo vetture abbinate a un utente).
  const carUser = new Map();
  for (const p of resolved) {
    if (p.userId) carUser.set(p.carIndex, p.userId);
  }

  // La vettura del giocatore è SEMPRE del proprietario del collector.
  const ownerCar = payload.playerCarIndex;
  if (ownerCar != null && Number(ownerCar) >= 0) {
    carUser.set(Number(ownerCar), ownerUserId);
  } else {
    // Fallback prove a tempo: se c'è un solo tracciato di giri, è dell'owner.
    const carsWithLaps = (payload.lapHistory || []).filter((h) =>
      (h.laps || []).some((l) => Number(l.timeMs) > 0)
    );
    if (carsWithLaps.length === 1) carUser.set(carsWithLaps[0].carIndex, ownerUserId);
  }

  // Circuito del sito suggerito dalla telemetria (best-effort, può essere null).
  const circuits = await db.prepare('SELECT id, name, city, country FROM circuits').all();
  const trackId = payload.trackId != null ? Number(payload.trackId) : null;
  const circuitId = trackId != null ? suggestCircuitId(circuits, trackId) : null;

  // Sessione (di proprietà dell'owner). Idempotente sul (session_uid, user_id).
  await db
    .prepare(
      `INSERT INTO personal_sessions
         (user_id, session_uid, session_type, track_id, circuit_id, weather, packet_format)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (session_uid, user_id) DO UPDATE SET
         session_type = excluded.session_type,
         track_id     = excluded.track_id,
         circuit_id   = excluded.circuit_id,
         weather      = excluded.weather,
         packet_format= excluded.packet_format`
    )
    .run(
      ownerUserId,
      sessionUid,
      String(payload.sessionType || ''),
      trackId,
      circuitId,
      payload.weather || null,
      payload.packetFormat != null ? Number(payload.packetFormat) : null
    );

  const session = await db
    .prepare('SELECT id FROM personal_sessions WHERE session_uid = ? AND user_id = ?')
    .get(sessionUid, ownerUserId);
  const sessionId = session.id;

  // Righe giri dalla cronologia (Session History). Re-import completo idempotente:
  // svuota e reinserisce i giri della sessione.
  const stmts = [{ sql: 'DELETE FROM personal_laps WHERE session_id = ?', args: [sessionId] }];
  const drivers = new Set();
  let laps = 0;
  for (const h of payload.lapHistory || []) {
    const uid = carUser.get(h.carIndex);
    if (!uid) continue;
    for (const l of h.laps || []) {
      if (!l.lap || !(Number(l.timeMs) > 0)) continue;
      stmts.push({
        sql: `INSERT INTO personal_laps
                (session_id, user_id, track_id, circuit_id, lap, lap_time_ms, sector1_ms, sector2_ms, sector3_ms, valid)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          sessionId, uid, trackId, circuitId, l.lap,
          l.timeMs || null, l.s1Ms || null, l.s2Ms || null, l.s3Ms || null, l.valid ? 1 : 0,
        ],
      });
      laps++;
      drivers.add(uid);
    }
  }
  await db.raw.batch(stmts, 'write');
  return { sessionId, laps, drivers: drivers.size };
}
