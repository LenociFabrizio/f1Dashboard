/**
 * routes/news.js
 * ------------------------------------------------------------
 * Rotte notizie.
 * ------------------------------------------------------------
 */
import { Router } from 'express';
import * as news from '../controllers/newsController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', news.listNews);
router.post('/', requireAuth, requireAdmin, news.createNews);
router.delete('/:id', requireAuth, requireAdmin, news.deleteNews);

export default router;
