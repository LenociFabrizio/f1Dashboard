/**
 * routes/stats.js
 * ------------------------------------------------------------
 * Rotte statistiche.
 * ------------------------------------------------------------
 */
import { Router } from 'express';
import * as stats from '../controllers/statsController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/championship', stats.championshipStats);
router.get('/compare', stats.compareDrivers);
router.get('/driver/:userId', stats.driverStats);
router.put('/manual', requireAuth, requireAdmin, stats.setManualStat);

export default router;
