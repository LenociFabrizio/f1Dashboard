/**
 * routes/captures.js
 * ------------------------------------------------------------
 * Revisione/import delle sessioni telemetria catturate. Admin-only.
 * Montato sotto /api/admin/captures.
 * ------------------------------------------------------------
 */
import { Router } from 'express';
import * as captures from '../controllers/captureController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/', captures.listCaptures);
router.get('/:id', captures.getCaptureDetail);
router.post('/:id/identities', captures.resolveCaptureIdentities);
router.post('/:id/commit', captures.commitCaptureToRace);
router.delete('/:id', captures.discardCapture);

export default router;
