/**
 * routes/seasons.js
 * ------------------------------------------------------------
 * Rotte stagioni + circuiti.
 * ------------------------------------------------------------
 */
import { Router } from 'express';
import * as s from '../controllers/seasonController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// Stagioni
router.get('/seasons', s.listSeasons);
router.get('/seasons/active', s.getActiveSeason);
router.get('/seasons/:id', s.getSeason);
router.post('/seasons', requireAuth, requireAdmin, s.createSeason);
router.put('/seasons/:id', requireAuth, requireAdmin, s.updateSeason);

// Circuiti
router.get('/circuits', s.listCircuits);
router.post('/circuits', requireAuth, requireAdmin, s.createCircuit);
router.put('/circuits/:id', requireAuth, requireAdmin, s.updateCircuit);

export default router;
