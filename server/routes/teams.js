/**
 * routes/teams.js
 * ------------------------------------------------------------
 * Rotte team/costruttori.
 * ------------------------------------------------------------
 */
import { Router } from 'express';
import * as teams from '../controllers/teamController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', teams.listTeams);
router.get('/:id', teams.getTeam);
router.post('/', requireAuth, requireAdmin, teams.createTeam);
router.put('/:id', requireAuth, requireAdmin, teams.updateTeam);
router.delete('/:id', requireAuth, requireAdmin, teams.deleteTeam);

export default router;
