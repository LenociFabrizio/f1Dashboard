/**
 * postController.js
 * ------------------------------------------------------------
 * Bacheca social: ogni utente può pubblicare post con testo e un
 * media opzionale (foto o video) e taggare altri utenti.
 *
 * Upload media:
 *   - PRODUZIONE: upload diretto browser → Vercel Blob (bypassa il
 *     limite ~4.5MB delle funzioni serverless). Questo controller
 *     genera il token client tramite handleUpload().
 *   - SVILUPPO / senza Blob: fallback multipart classico su
 *     public/uploads via persistUpload().
 * ------------------------------------------------------------
 */
import { handleUpload } from '@vercel/blob/client';
import db from '../database/db.js';
import { asyncHandler, HttpError } from '../utils/helpers.js';
import { verifyToken } from '../utils/jwt.js';
import { persistUpload } from '../middleware/upload.js';
import { ROLES } from '../utils/constants.js';

const POST_SELECT = `
  SELECT p.id, p.author_id, p.body, p.media_url, p.media_type, p.created_at,
         u.display_name AS author_name, u.username AS author_username,
         u.avatar AS author_avatar, t.name AS author_team, t.color AS author_team_color
    FROM posts p
    JOIN users u ON u.id = p.author_id
    LEFT JOIN teams t ON t.id = u.team_id`;

/** Allega a ogni post l'elenco degli utenti taggati. */
async function attachTags(posts) {
  if (!posts.length) return posts;
  const ids = posts.map((p) => p.id);
  const placeholders = ids.map(() => '?').join(',');
  const tags = await db
    .prepare(
      `SELECT pt.post_id, pt.user_id, u.display_name, u.username
         FROM post_tags pt JOIN users u ON u.id = pt.user_id
        WHERE pt.post_id IN (${placeholders})`
    )
    .all(...ids);
  const byPost = new Map();
  for (const t of tags) {
    if (!byPost.has(t.post_id)) byPost.set(t.post_id, []);
    byPost.get(t.post_id).push({ user_id: t.user_id, display_name: t.display_name, username: t.username });
  }
  return posts.map((p) => ({ ...p, tags: byPost.get(p.id) || [] }));
}

/** GET /api/posts?limit= — bacheca pubblica (post più recenti) */
export const listPosts = asyncHandler(async (req, res) => {
  const lim = Math.min(Number(req.query.limit) || 30, 100);
  const posts = await db.prepare(`${POST_SELECT} ORDER BY p.created_at DESC, p.id DESC LIMIT ?`).all(lim);
  res.json(await attachTags(posts));
});

/** POST /api/posts — crea un post (autenticato) */
export const createPost = asyncHandler(async (req, res) => {
  const body = (req.body.body || '').trim();
  const mediaUrl = req.body.media_url ? String(req.body.media_url).trim() : null;
  let mediaType = req.body.media_type ? String(req.body.media_type).trim() : null;
  if (mediaType && !['image', 'video'].includes(mediaType)) mediaType = null;

  if (!body && !mediaUrl) throw new HttpError(400, 'Scrivi qualcosa o allega una foto/video.');
  if (body.length > 2000) throw new HttpError(400, 'Il testo è troppo lungo (max 2000 caratteri).');

  const info = await db
    .prepare('INSERT INTO posts (author_id, body, media_url, media_type) VALUES (?, ?, ?, ?)')
    .run(req.user.id, body, mediaUrl, mediaUrl ? mediaType : null);
  const postId = info.lastInsertRowid;

  // Tag: array di user_id, deduplicati, escluso l'autore
  const tagIds = Array.isArray(req.body.tags)
    ? [...new Set(req.body.tags.map(Number).filter((n) => Number.isInteger(n) && n !== req.user.id))]
    : [];
  if (tagIds.length) {
    // Verifica che gli id taggati esistano e siano attivi
    const placeholders = tagIds.map(() => '?').join(',');
    const valid = await db
      .prepare(`SELECT id FROM users WHERE is_active = 1 AND id IN (${placeholders})`)
      .all(...tagIds);
    const validIds = valid.map((v) => v.id);
    if (validIds.length) {
      await db.raw.batch(
        validIds.map((uid) => ({
          sql: 'INSERT OR IGNORE INTO post_tags (post_id, user_id) VALUES (?, ?)',
          args: [postId, uid],
        })),
        'write'
      );
    }
  }

  const [post] = await attachTags(await db.prepare(`${POST_SELECT} WHERE p.id = ?`).all(postId));
  res.status(201).json(post);
});

/** DELETE /api/posts/:id — elimina un post (autore o admin) */
export const deletePost = asyncHandler(async (req, res) => {
  const post = await db.prepare('SELECT id, author_id FROM posts WHERE id = ?').get(req.params.id);
  if (!post) throw new HttpError(404, 'Post non trovato');
  const isOwner = post.author_id === req.user.id;
  const isAdmin = req.user.role === ROLES.ADMIN;
  if (!isOwner && !isAdmin) throw new HttpError(403, 'Non puoi eliminare questo post.');
  // I tag vengono rimossi dal cascade FK; li cancelliamo comunque esplicitamente
  // (il cascade non è garantito sulle connessioni serverless).
  await db.raw.batch(
    [
      { sql: 'DELETE FROM post_tags WHERE post_id = ?', args: [Number(post.id)] },
      { sql: 'DELETE FROM posts WHERE id = ?', args: [Number(post.id)] },
    ],
    'write'
  );
  res.json({ message: 'Post eliminato' });
});

/** GET /api/posts/upload-config — indica se l'upload diretto su Blob è attivo */
export const uploadConfig = asyncHandler(async (_req, res) => {
  res.json({ direct: !!process.env.BLOB_READ_WRITE_TOKEN });
});

/**
 * POST /api/posts/upload — genera il token per l'upload diretto su Vercel Blob.
 * L'autenticazione avviene tramite il JWT passato in clientPayload
 * (il client Blob non inoltra gli header Authorization).
 */
export const generateUploadToken = asyncHandler(async (req, res) => {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new HttpError(503, 'Upload diretto non configurato (manca BLOB_READ_WRITE_TOKEN).');
  }
  const jsonResponse = await handleUpload({
    request: req,
    body: req.body,
    onBeforeGenerateToken: async (_pathname, clientPayload) => {
      try {
        if (!clientPayload) throw new Error('missing');
        verifyToken(clientPayload);
      } catch {
        throw new HttpError(401, 'Autenticazione richiesta per caricare un media.');
      }
      return {
        allowedContentTypes: [
          'image/jpeg', 'image/png', 'image/webp', 'image/gif',
          'video/mp4', 'video/webm', 'video/quicktime', 'video/ogg',
        ],
        maximumSizeInBytes: 300 * 1024 * 1024, // 300 MB
        addRandomSuffix: true,
      };
    },
    onUploadCompleted: async () => {
      /* no-op: il post referenzia l'URL restituito al client */
    },
  });
  res.json(jsonResponse);
});

/**
 * POST /api/posts/media-local — fallback upload multipart (sviluppo locale
 * o ambienti senza Vercel Blob). Salva su public/uploads/posts.
 */
export const uploadMediaLocal = asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Nessun file caricato');
  const url = await persistUpload(req.file, 'posts');
  const type = req.file.mimetype.startsWith('video') ? 'video' : 'image';
  res.json({ url, type });
});
