/**
 * ingestController.js
 * ------------------------------------------------------------
 * Ricezione delle sessioni telemetria dal collector F1 25.
 * Endpoint autenticato via API key (vedi middleware/collectorAuth.js),
 * NON via JWT utente.
 *
 * Il payload viene salvato in staging (captured_sessions) senza toccare
 * i dati canonici: sarà l'admin a rivederlo e importarlo.
 * Idempotente sul session_uid: un reinvio (retry del collector) aggiorna
 * il payload finché la sessione è ancora 'pending'.
 * ------------------------------------------------------------
 */
import db from '../database/db.js';
import { asyncHandler, HttpError } from '../utils/helpers.js';

/**
 * POST /api/ingest/sessions
 * Body: JSON aggregato della sessione (vedi captureService/collector).
 * Header: Authorization: Bearer <COLLECTOR_TOKEN>  (o X-Collector-Token)
 */
export const ingestSession = asyncHandler(async (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new HttpError(400, 'Payload sessione mancante o non valido');
  }
  const sessionUid = payload.sessionUID != null ? String(payload.sessionUID) : null;
  if (!sessionUid) throw new HttpError(400, 'sessionUID obbligatorio nel payload');

  const json = JSON.stringify(payload);
  const existing = await db
    .prepare('SELECT id, status FROM captured_sessions WHERE session_uid = ?')
    .get(sessionUid);

  if (existing) {
    // Reinvio: aggiorna solo se non è già stata importata/scartata.
    if (existing.status === 'pending') {
      await db
        .prepare('UPDATE captured_sessions SET payload_json = ?, created_at = datetime(\'now\') WHERE id = ?')
        .run(json, existing.id);
    }
    return res.status(200).json({ id: existing.id, status: existing.status, deduped: true });
  }

  const info = await db
    .prepare(
      `INSERT INTO captured_sessions
         (session_uid, session_type, track_id, packet_format, payload_json, collector_version)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      sessionUid,
      String(payload.sessionType || ''),
      payload.trackId != null ? Number(payload.trackId) : null,
      payload.packetFormat != null ? Number(payload.packetFormat) : null,
      json,
      String(payload.collectorVersion || '')
    );

  res.status(201).json({ id: Number(info.lastInsertRowid), status: 'pending', deduped: false });
});
