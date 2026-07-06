/**
 * routes/auth.js
 * ------------------------------------------------------------
 * Rotte di autenticazione.
 * ------------------------------------------------------------
 */
import { Router } from 'express';
import * as auth from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/register', auth.register);
router.post('/login', auth.login);
router.post('/psn', auth.loginPsn);   // login PlayStation Network (mock)
router.post('/ea', auth.loginEa);     // login EA Account (mock)
router.post('/forgot-password', auth.forgotPassword);
router.get('/me', requireAuth, auth.me);

export default router;
