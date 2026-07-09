/**
 * routes/races.js
 * ------------------------------------------------------------
 * Rotte gare, qualifiche e risultati.
 * ------------------------------------------------------------
 */
import { Router } from 'express';
import * as races from '../controllers/raceController.js';
import { saveResults } from '../controllers/resultController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = Router();

// Rotte specifiche prima di /:id
router.get('/', races.listRaces);
router.get('/next', races.getNextRace);
router.get('/last', races.getLastRace);
router.get('/:id', races.getRace);
router.get('/:id/laps', races.getRaceLaps);
router.get('/:id/traces', races.getRaceTraces);

// Admin
router.post('/', requireAuth, requireAdmin, races.createRace);
router.put('/:id', requireAuth, requireAdmin, races.updateRace);
router.delete('/:id', requireAuth, requireAdmin, races.deleteRace);
router.post('/:id/clear', requireAuth, requireAdmin, races.clearRaceData);
router.put('/:id/results', requireAuth, requireAdmin, saveResults);
router.put('/:id/qualifying', requireAuth, requireAdmin, races.setQualifying);
router.post('/:id/screenshot', requireAuth, requireAdmin, upload.single('screenshot'), races.uploadScreenshot);

export default router;
