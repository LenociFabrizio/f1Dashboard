/**
 * routes/notifications.js
 * ------------------------------------------------------------
 * Centro notifiche admin: elenco/conteggio + gestione delle
 * richieste di cambio team/riserva. Tutto riservato all'admin.
 * ------------------------------------------------------------
 */
import { Router } from 'express';
import * as notifications from '../controllers/notificationController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/notifications', requireAuth, requireAdmin, notifications.listNotifications);
router.get('/notifications/count', requireAuth, requireAdmin, notifications.getCount);
router.post('/change-requests/:id/approve', requireAuth, requireAdmin, notifications.approveChangeRequest);
router.post('/change-requests/:id/reject', requireAuth, requireAdmin, notifications.rejectChangeRequest);

export default router;
