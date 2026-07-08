/**
 * routes/ingest.js
 * ------------------------------------------------------------
 * Ingest telemetria dal collector F1 25. Autenticazione via API key
 * (COLLECTOR_TOKEN), non JWT.
 * ------------------------------------------------------------
 */
import { Router } from 'express';
import { ingestSession } from '../controllers/ingestController.js';
import { requireCollector } from '../middleware/collectorAuth.js';

const router = Router();

router.post('/sessions', requireCollector, ingestSession);

export default router;
