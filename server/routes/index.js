/**
 * routes/index.js
 * ------------------------------------------------------------
 * Router principale: monta tutti i sotto-router sotto /api.
 * ------------------------------------------------------------
 */
import { Router } from 'express';
import authRoutes from './auth.js';
import userRoutes from './users.js';
import teamRoutes from './teams.js';
import seasonRoutes from './seasons.js';
import raceRoutes from './races.js';
import standingsRoutes from './standings.js';
import statsRoutes from './stats.js';
import newsRoutes from './news.js';
import postRoutes from './posts.js';
import dashboardRoutes from './dashboard.js';
import ingestRoutes from './ingest.js';
import captureRoutes from './captures.js';
import personalRoutes from './personal.js';
import notificationRoutes from './notifications.js';

const router = Router();

router.get('/health', (_req, res) => res.json({ status: 'ok', service: 'f1-portal' }));

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/teams', teamRoutes);
router.use('/', seasonRoutes); // /seasons e /circuits
router.use('/races', raceRoutes);
router.use('/standings', standingsRoutes);
router.use('/stats', statsRoutes);
router.use('/news', newsRoutes);
router.use('/posts', postRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/ingest', ingestRoutes);
router.use('/admin/captures', captureRoutes);
router.use('/personal', personalRoutes);
router.use('/', notificationRoutes); // /notifications e /change-requests (admin)

export default router;
