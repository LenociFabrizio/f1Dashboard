/**
 * config.js
 * ------------------------------------------------------------
 * Configurazione centralizzata dell'applicazione.
 * Legge le variabili d'ambiente (file .env) e fornisce valori
 * di default sensati. Unico punto di verità per la configurazione.
 * ------------------------------------------------------------
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root del progetto (due livelli sopra /server/config)
export const ROOT_DIR = path.resolve(__dirname, '..', '..');

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,

  jwt: {
    secret: process.env.JWT_SECRET || 'insecure-dev-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // Token condiviso usato dal collector telemetria per autenticare l'ingest
  // (POST /api/ingest/sessions). NON è un utente JWT: è una API key dedicata.
  // Vuoto in locale (l'ingest resta libero in dev); OBBLIGATORIO in produzione.
  collectorToken: process.env.COLLECTOR_TOKEN || '',

  db: {
    // libSQL/Turso. In locale un file embedded; in prod l'URL Turso (libsql://...).
    url: process.env.DATABASE_URL || 'file:server/database/f1.db',
    authToken: process.env.DATABASE_AUTH_TOKEN || '',
  },

  paths: {
    root: ROOT_DIR,
    public: path.resolve(ROOT_DIR, 'public'),
    uploads: path.resolve(ROOT_DIR, 'public', 'uploads'),
  },

  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',

  // Provider OAuth (mock). Predisposti per integrazione reale futura.
  oauth: {
    psn: {
      clientId: process.env.PSN_CLIENT_ID || '',
      clientSecret: process.env.PSN_CLIENT_SECRET || '',
      enabled: Boolean(process.env.PSN_CLIENT_ID),
    },
    ea: {
      clientId: process.env.EA_CLIENT_ID || '',
      clientSecret: process.env.EA_CLIENT_SECRET || '',
      enabled: Boolean(process.env.EA_CLIENT_ID),
    },
  },

  isProd() {
    return this.env === 'production';
  },
};

export default config;
