/**
 * routes/users.js
 * ------------------------------------------------------------
 * Rotte utenti/piloti.
 * ------------------------------------------------------------
 */
import { Router } from 'express';
import * as users from '../controllers/userController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = Router();

// Il proprio profilo (prima di /:id per evitare conflitti)
router.put('/me', requireAuth, users.updateMe);
router.post('/me/avatar', requireAuth, upload.single('avatar'), users.uploadAvatar);
router.post('/me/assists-confirm', requireAuth, users.confirmMyAssists);
router.delete('/me', requireAuth, users.deleteMe);

// Handle di gioco F1 25 (per l'import automatico della telemetria + nome pubblico "@handle")
router.get('/me/handles', requireAuth, users.listMyHandles);
router.post('/me/handles', requireAuth, users.addMyHandle);
router.put('/me/handles/:hid/primary', requireAuth, users.setPrimaryHandle);
router.delete('/me/handles/:hid', requireAuth, users.deleteMyHandle);

// Richieste di cambio team / pilota di riserva (approvazione admin)
router.get('/me/change-request', requireAuth, users.getMyChangeRequest);
router.post('/me/change-request', requireAuth, users.createChangeRequest);
router.delete('/me/change-request', requireAuth, users.cancelMyChangeRequest);

router.get('/', users.listUsers);
router.get('/reserved', users.listReservedDrivers);
// Richieste di reset password (admin) — prima di '/:id' per non farsele "catturare".
router.get('/reset-requests', requireAuth, requireAdmin, users.listResetRequests);
router.delete('/reset-requests/:rid', requireAuth, requireAdmin, users.revokeResetRequest);
router.get('/:id', users.getUser);

// Admin
router.post('/', requireAuth, requireAdmin, users.adminCreateUser);
router.put('/:id', requireAuth, requireAdmin, users.adminUpdateUser);
router.delete('/:id', requireAuth, requireAdmin, users.adminDeleteUser);

export default router;
