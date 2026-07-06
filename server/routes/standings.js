/**
 * routes/standings.js
 * ------------------------------------------------------------
 * Rotte classifiche.
 * ------------------------------------------------------------
 */
import { Router } from 'express';
import * as st from '../controllers/standingsController.js';

const router = Router();

router.get('/drivers', st.driverStandings);
router.get('/constructors', st.constructorStandings);
router.get('/progression', st.pointsProgression);

export default router;
