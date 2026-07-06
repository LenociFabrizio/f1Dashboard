/**
 * error.js (middleware)
 * ------------------------------------------------------------
 * Gestione centralizzata degli errori + handler 404 per le API.
 * ------------------------------------------------------------
 */
import { config } from '../config/config.js';

/** 404 per rotte API non trovate. */
export function notFoundHandler(req, res, next) {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint non trovato', path: req.path });
  }
  next();
}

/** Handler errori generico. */
export function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  const payload = { error: err.message || 'Errore interno del server' };
  if (!config.isProd() && status >= 500) {
    payload.stack = err.stack;
    console.error('[ERROR]', err);
  }
  res.status(status).json(payload);
}
