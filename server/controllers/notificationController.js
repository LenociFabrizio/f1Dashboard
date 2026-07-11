/**
 * notificationController.js
 * ------------------------------------------------------------
 * Centro notifiche ADMIN. Aggrega gli elementi che richiedono
 * attenzione dell'amministratore:
 *   - richieste di cambio team / pilota di riserva (change_requests)
 *   - richieste di reset password (password_resets)
 * Espone anche il solo conteggio (per il badge della campanella)
 * e le azioni di approvazione/rifiuto delle richieste di cambio.
 * ------------------------------------------------------------
 */
import db from '../database/db.js';
import { asyncHandler, HttpError, PRIMARY_HANDLE_JOIN, HANDLE_SELECT } from '../utils/helpers.js';

/** Numero di reset password ancora attivi (non usati, non scaduti). */
async function countResets() {
  const { c } = await db
    .prepare(
      "SELECT COUNT(*) c FROM password_resets WHERE used_at IS NULL AND expires_at > datetime('now') AND token_plain IS NOT NULL"
    )
    .get();
  return c;
}

/** Numero di richieste di cambio in sospeso. */
async function countChangeRequests() {
  const { c } = await db.prepare("SELECT COUNT(*) c FROM change_requests WHERE status = 'pending'").get();
  return c;
}

/** GET /api/notifications/count (admin) — solo il totale (per il badge). */
export const getCount = asyncHandler(async (_req, res) => {
  const [changes, resets] = await Promise.all([countChangeRequests(), countResets()]);
  res.json({ count: changes + resets, changeRequests: changes, resetRequests: resets });
});

/** GET /api/notifications (admin) — elenco completo delle notifiche. */
export const listNotifications = asyncHandler(async (_req, res) => {
  const changeRequests = await db
    .prepare(
      `SELECT cr.id, cr.user_id, cr.requested_team_id, cr.requested_reserve, cr.created_at,
              u.display_name, ${HANDLE_SELECT},
              u.team_id AS current_team_id, u.reserve_driver AS current_reserve,
              ct.name AS current_team_name, rt.name AS requested_team_name
         FROM change_requests cr
         JOIN users u ON u.id = cr.user_id
         ${PRIMARY_HANDLE_JOIN}
         LEFT JOIN teams ct ON ct.id = u.team_id
         LEFT JOIN teams rt ON rt.id = cr.requested_team_id
        WHERE cr.status = 'pending'
        ORDER BY cr.created_at DESC`
    )
    .all();

  const resetRequests = await db
    .prepare(
      `SELECT pr.id, pr.token_plain AS token, pr.created_at, pr.expires_at,
              u.id AS user_id, u.display_name, ${HANDLE_SELECT}, u.email
         FROM password_resets pr
         JOIN users u ON u.id = pr.user_id
         ${PRIMARY_HANDLE_JOIN}
        WHERE pr.used_at IS NULL AND pr.expires_at > datetime('now') AND pr.token_plain IS NOT NULL
        ORDER BY pr.created_at DESC`
    )
    .all();

  res.json({
    changeRequests,
    resetRequests,
    count: changeRequests.length + resetRequests.length,
  });
});

/** POST /api/change-requests/:id/approve (admin) — applica il cambio all'utente. */
export const approveChangeRequest = asyncHandler(async (req, res) => {
  const cr = await db
    .prepare("SELECT * FROM change_requests WHERE id = ? AND status = 'pending'")
    .get(Number(req.params.id));
  if (!cr) throw new HttpError(404, 'Richiesta non trovata o già gestita');

  const updates = {};
  if (cr.requested_team_id !== null && cr.requested_team_id !== undefined) {
    updates.team_id = cr.requested_team_id;
  }
  if (cr.requested_reserve) {
    // Il pilota di riserva (BOT) è assegnabile a un solo utente.
    const taken = await db
      .prepare('SELECT id FROM users WHERE reserve_driver = ? AND id <> ?')
      .get(cr.requested_reserve, cr.user_id);
    if (taken) throw new HttpError(409, 'Il pilota di riserva richiesto è già assegnato a un altro utente');
    updates.reserve_driver = cr.requested_reserve;
  }

  if (Object.keys(updates).length) {
    const setClause = Object.keys(updates).map((k) => `${k} = @${k}`).join(', ');
    await db
      .prepare(`UPDATE users SET ${setClause}, updated_at = datetime('now') WHERE id = @id`)
      .run({ ...updates, id: cr.user_id });
  }
  await db
    .prepare("UPDATE change_requests SET status = 'approved', resolved_at = datetime('now'), resolved_by = ? WHERE id = ?")
    .run(req.user.id, cr.id);

  res.json({ message: 'Richiesta approvata' });
});

/** POST /api/change-requests/:id/reject (admin) — rifiuta senza applicare. */
export const rejectChangeRequest = asyncHandler(async (req, res) => {
  const info = await db
    .prepare(
      "UPDATE change_requests SET status = 'rejected', resolved_at = datetime('now'), resolved_by = ? WHERE id = ? AND status = 'pending'"
    )
    .run(req.user.id, Number(req.params.id));
  if (!info.changes) throw new HttpError(404, 'Richiesta non trovata o già gestita');
  res.json({ message: 'Richiesta rifiutata' });
});
