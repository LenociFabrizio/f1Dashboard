/**
 * captureController.js
 * ------------------------------------------------------------
 * Pannello admin: revisione e import delle sessioni telemetria
 * catturate (staging). Tutte le rotte sono admin-only.
 *
 * Flusso:
 *   GET    /api/admin/captures            → elenco sessioni in staging
 *   GET    /api/admin/captures/:id        → anteprima (identità + righe proposte)
 *   POST   /api/admin/captures/:id/identities → salva alias (mappatura handle→utente)
 *   POST   /api/admin/captures/:id/commit → importa nella gara scelta
 *   DELETE /api/admin/captures/:id        → scarta la sessione
 * ------------------------------------------------------------
 */
import db from '../database/db.js';
import { asyncHandler, HttpError } from '../utils/helpers.js';
import { previewCapture, commitCapture, saveAliases } from '../services/captureService.js';
import { suggestCircuitId } from '../utils/f1-mappings.js';

/** Carica una sessione catturata o lancia 404. */
async function getCapture(id) {
  const capture = await db.prepare('SELECT * FROM captured_sessions WHERE id = ?').get(id);
  if (!capture) throw new HttpError(404, 'Sessione catturata non trovata');
  return capture;
}

/** GET /api/admin/captures — elenco (senza payload, per leggerezza) */
export const listCaptures = asyncHandler(async (req, res) => {
  const status = req.query.status;
  const base = `SELECT c.id, c.session_uid, c.session_type, c.track_id, c.packet_format,
                       c.status, c.race_id, c.collector_version, c.created_at, c.imported_at,
                       ra.name AS race_name, ra.round AS race_round
                  FROM captured_sessions c
                  LEFT JOIN races ra ON ra.id = c.race_id`;
  const rows = status
    ? await db.prepare(`${base} WHERE c.status = ? ORDER BY c.created_at DESC`).all(status)
    : await db.prepare(`${base} ORDER BY c.created_at DESC`).all();
  res.json(rows);
});

/**
 * GET /api/admin/captures/:id — anteprima non distruttiva.
 * Query opzionale: overrides via body non disponibile su GET, quindi la
 * mappatura manuale si prova con POST /commit (dry_run) o /identities.
 */
export const getCaptureDetail = asyncHandler(async (req, res) => {
  const capture = await getCapture(req.params.id);
  const preview = await previewCapture(capture);

  // Suggerimento gara: circuito ricavato dal trackId (best-effort)
  const circuits = await db.prepare('SELECT id, name, city, country FROM circuits').all();
  const suggestedCircuitId = capture.track_id != null ? suggestCircuitId(circuits, capture.track_id) : null;

  res.json({
    capture: {
      id: capture.id,
      session_uid: capture.session_uid,
      session_type: capture.session_type,
      track_id: capture.track_id,
      packet_format: capture.packet_format,
      status: capture.status,
      race_id: capture.race_id,
      created_at: capture.created_at,
    },
    suggestedCircuitId,
    weather: preview.payload.weather ?? null,
    totalLaps: preview.payload.totalLaps ?? null,
    participants: preview.participants,
    resultRows: preview.resultRows,
    qualifyingRows: preview.qualifyingRows,
    skipped: preview.skipped,
  });
});

/**
 * POST /api/admin/captures/:id/identities
 * Body: { mappings: [ { platform?, handle, user_id } ] }
 * Salva alias permanenti (conferma manuale) e restituisce la nuova anteprima.
 */
export const resolveCaptureIdentities = asyncHandler(async (req, res) => {
  const capture = await getCapture(req.params.id);
  const saved = await saveAliases(req.body.mappings || []);
  const preview = await previewCapture(capture);
  res.json({ message: `Alias salvati: ${saved}`, participants: preview.participants, skipped: preview.skipped });
});

/**
 * POST /api/admin/captures/:id/commit
 * Body: { race_id, mappings?: [{carIndex,user_id}], save_aliases?: bool,
 *         mark_completed?, comment?, mvp_user_id? }
 * Importa la sessione nella gara indicata (riusa persistResults/persistQualifying).
 */
export const commitCaptureToRace = asyncHandler(async (req, res) => {
  const capture = await getCapture(req.params.id);
  if (capture.status === 'imported') {
    throw new HttpError(409, 'Sessione già importata');
  }
  const mappings = req.body.mappings || [];

  // Se richiesto, memorizza le mappature manuali come alias permanenti.
  // Servono platform+handle: li ricaviamo dai partecipanti del payload.
  if (req.body.save_aliases && mappings.length) {
    const preview = await previewCapture(capture);
    const byCar = new Map(preview.participants.map((p) => [p.carIndex, p]));
    const aliasMappings = mappings
      .map((m) => {
        const p = byCar.get(m.carIndex);
        return p ? { platform: p.platform, handle: p.name, user_id: m.user_id } : null;
      })
      .filter(Boolean);
    await saveAliases(aliasMappings);
  }

  const result = await commitCapture(capture, {
    raceId: Number(req.body.race_id),
    mappings,
    markCompleted: req.body.mark_completed !== false,
    comment: req.body.comment,
    mvpUserId: req.body.mvp_user_id,
  });

  res.json({
    message: 'Sessione importata: risultati e classifiche aggiornati',
    imported: result.results.length,
    qualifying: result.qualifying,
    skipped: result.skipped,
    results: result.results,
  });
});

/** DELETE /api/admin/captures/:id — scarta la sessione (non elimina dati canonici) */
export const discardCapture = asyncHandler(async (req, res) => {
  const capture = await getCapture(req.params.id);
  await db.prepare("UPDATE captured_sessions SET status = 'discarded' WHERE id = ?").run(capture.id);
  res.json({ message: 'Sessione scartata' });
});
