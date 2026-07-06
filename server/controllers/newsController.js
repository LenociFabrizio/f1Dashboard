/**
 * newsController.js
 * ------------------------------------------------------------
 * Notizie del campionato.
 * ------------------------------------------------------------
 */
import db from '../database/db.js';
import { asyncHandler, HttpError } from '../utils/helpers.js';

/** GET /api/news?season_id=&limit= */
export const listNews = asyncHandler(async (req, res) => {
  const { season_id, limit } = req.query;
  const lim = Math.min(Number(limit) || 20, 100);
  const base = `SELECT n.*, u.display_name AS author_name FROM news n
                LEFT JOIN users u ON u.id = n.author_id`;
  const news = season_id
    ? await db.prepare(`${base} WHERE n.season_id = ? ORDER BY n.published_at DESC LIMIT ?`).all(season_id, lim)
    : await db.prepare(`${base} ORDER BY n.published_at DESC LIMIT ?`).all(lim);
  res.json(news);
});

/** POST /api/news (admin) */
export const createNews = asyncHandler(async (req, res) => {
  const { season_id, title, body, image } = req.body;
  if (!title || !body) throw new HttpError(400, 'Titolo e corpo obbligatori');
  const info = await db
    .prepare(
      `INSERT INTO news (season_id, title, body, image, author_id)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(season_id || null, title, body, image || null, req.user.id);
  res.status(201).json(await db.prepare('SELECT * FROM news WHERE id = ?').get(info.lastInsertRowid));
});

/** DELETE /api/news/:id (admin) */
export const deleteNews = asyncHandler(async (req, res) => {
  await db.prepare('DELETE FROM news WHERE id = ?').run(req.params.id);
  res.json({ message: 'Notizia eliminata' });
});
