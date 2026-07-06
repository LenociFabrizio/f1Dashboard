/**
 * api/index.js
 * ------------------------------------------------------------
 * Entry point serverless per Vercel.
 * Espone l'app Express come funzione. Tutte le richieste /api/*
 * vengono instradate qui (vedi vercel.json); i file statici in
 * /public sono serviti direttamente dalla CDN di Vercel.
 * ------------------------------------------------------------
 */
import { initSchema } from '../server/database/db.js';
import { createApp } from '../server/app.js';

const app = createApp();

// Inizializzazione schema "lazy" una sola volta per istanza (idempotente).
// Robusto anche se il DB Turso non è ancora stato inizializzato dal seed.
let ready = null;
function ensureReady() {
  if (!ready) {
    ready = initSchema().catch((err) => {
      ready = null; // consenti un nuovo tentativo alla prossima richiesta
      console.error('initSchema error:', err.message);
    });
  }
  return ready;
}

export default async function handler(req, res) {
  await ensureReady();
  return app(req, res);
}
