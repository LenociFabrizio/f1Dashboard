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

router.get('/', users.listUsers);
router.get('/:id', users.getUser);

// Admin
router.post('/', requireAuth, requireAdmin, users.adminCreateUser);
router.put('/:id', requireAuth, requireAdmin, users.adminUpdateUser);
router.delete('/:id', requireAuth, requireAdmin, users.adminDeleteUser);

export default router;
