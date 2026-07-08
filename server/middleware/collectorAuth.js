/**
 * collectorAuth.js (middleware)
 * ------------------------------------------------------------
 * Autenticazione del collector telemetria via API key condivisa
 * (config.collectorToken / env COLLECTOR_TOKEN). NON usa JWT: il
 * collector non è un utente del sito.
 *
 * La key è accettata da:
 *   - header  Authorization: Bearer <token>
 *   - header  X-Collector-Token: <token>
 *
 * In sviluppo, se nessun token è configurato, l'ingest resta libero
 * (comodo per i test locali). In produzione il token è OBBLIGATORIO:
 * senza configurazione ogni richiesta è respinta.
 * ------------------------------------------------------------
 */
import { config } from '../config/config.js';
import { HttpError } from '../utils/helpers.js';

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  if (req.headers['x-collector-token']) return String(req.headers['x-collector-token']).trim();
  return null;
}

export function requireCollector(req, _res, next) {
  const expected = config.collectorToken;

  if (!expected) {
    // Nessun token configurato: consentito solo fuori produzione.
    if (config.isProd()) {
      return next(new HttpError(503, 'Ingest telemetria non configurato (COLLECTOR_TOKEN mancante)'));
    }
    return next();
  }

  const provided = extractToken(req);
  if (!provided || provided !== expected) {
    return next(new HttpError(401, 'Token collector non valido'));
  }
  next();
}
