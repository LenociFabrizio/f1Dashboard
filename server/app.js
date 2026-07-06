/**
 * app.js
 * ------------------------------------------------------------
 * Costruzione dell'applicazione Express: middleware globali,
 * servizio dei file statici del frontend, montaggio delle API,
 * fallback SPA e gestione errori.
 * ------------------------------------------------------------
 */
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { config } from './config/config.js';
import apiRouter from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';

export function createApp() {
  const app = express();

  // Middleware globali
  // Same-origin su Vercel; l'auth usa Bearer token (non cookie), quindi
  // riflettere l'origine della richiesta è sicuro e semplifica il deploy.
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Logger minimale in sviluppo
  if (!config.isProd()) {
    app.use((req, _res, next) => {
      console.log(`${req.method} ${req.url}`);
      next();
    });
  }

  // API
  app.use('/api', apiRouter);

  // File statici (frontend + upload)
  app.use(express.static(config.paths.public));

  // 404 per le API
  app.use(notFoundHandler);

  // Fallback: per rotte non-API serve index.html (permette link diretti)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(config.paths.public, 'index.html'));
  });

  // Gestione errori
  app.use(errorHandler);

  return app;
}

export default createApp;
