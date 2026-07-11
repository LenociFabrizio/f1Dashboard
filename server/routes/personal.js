/**
 * routes/personal.js
 * ------------------------------------------------------------
 * Sezione personale "I miei tempi": token del collector personale,
 * tracciati con dati, giri e classifica per tracciato.
 * Tutte le rotte richiedono un utente autenticato.
 * ------------------------------------------------------------
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  getPersonalToken,
  regeneratePersonalToken,
  getMyTracks,
  getMyLaps,
  getTrackLeaderboard,
} from '../controllers/personalController.js';

const router = Router();

router.use(requireAuth);

router.get('/token', getPersonalToken);
router.post('/token/regenerate', regeneratePersonalToken);
router.get('/tracks', getMyTracks);
router.get('/laps', getMyLaps);
router.get('/leaderboard', getTrackLeaderboard);

export default router;
