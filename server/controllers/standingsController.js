/**
 * standingsController.js
 * ------------------------------------------------------------
 * Espone le classifiche Piloti/Costruttori e la progressione punti.
 * ------------------------------------------------------------
 */
import { asyncHandler } from '../utils/helpers.js';
import {
  getDriverStandings,
  getConstructorStandings,
  getPointsProgression,
} from '../services/standingsService.js';

/** GET /api/standings/drivers?season_id= */
export const driverStandings = asyncHandler(async (req, res) => {
  res.json(await getDriverStandings(Number(req.query.season_id)));
});

/** GET /api/standings/constructors?season_id= */
export const constructorStandings = asyncHandler(async (req, res) => {
  res.json(await getConstructorStandings(Number(req.query.season_id)));
});

/** GET /api/standings/progression?season_id= */
export const pointsProgression = asyncHandler(async (req, res) => {
  res.json(await getPointsProgression(Number(req.query.season_id)));
});
