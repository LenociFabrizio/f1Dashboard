/**
 * routes/dashboard.js
 * ------------------------------------------------------------
 * Rotte aggregate per dashboard/homepage.
 * ------------------------------------------------------------
 */
import { Router } from 'express';
import * as dash from '../controllers/dashboardController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/home', dash.homeData);
router.get('/me', requireAuth, dash.myDashboard);
router.get('/admin', requireAuth, requireAdmin, dash.adminDashboard);

export default router;
