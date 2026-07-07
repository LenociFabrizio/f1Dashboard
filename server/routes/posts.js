/**
 * routes/posts.js
 * ------------------------------------------------------------
 * Rotte bacheca social (post degli utenti).
 * ------------------------------------------------------------
 */
import { Router } from 'express';
import * as posts from '../controllers/postController.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadMedia } from '../middleware/upload.js';

const router = Router();

// Upload media (prima delle rotte con :id)
router.get('/upload-config', posts.uploadConfig);
router.post('/upload', posts.generateUploadToken); // auth via clientPayload (JWT)
router.post('/media-local', requireAuth, uploadMedia.single('media'), posts.uploadMediaLocal);

router.get('/', posts.listPosts);
router.post('/', requireAuth, posts.createPost);
router.delete('/:id', requireAuth, posts.deletePost);

export default router;
