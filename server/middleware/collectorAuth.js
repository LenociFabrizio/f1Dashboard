/**
 * collectorAuth.js (middleware)
 * ------------------------------------------------------------
 * Autenticazione dell'ingest telemetria. NON usa JWT: il collector non
 * è un utente del sito. Sono ammessi DUE tipi di token, distinti dal
 * comportamento a valle:
 *
 *   1) token CONDIVISO della lega (config.collectorToken / COLLECTOR_TOKEN):
 *      la sessione finisce in staging (captured_sessions) e la rivede l'admin.
 *      → req.ingestMode = 'league'
 *
 *   2) token PERSONALE di un utente (users.personal_token): la sessione viene
 *      importata automaticamente nella sua area "I miei tempi", senza admin.
 *      → req.ingestMode = 'personal', req.personalUserId = <id>
 *
 * La key è accettata da:
 *   - header  Authorization: Bearer <token>
 *   - header  X-Collector-Token: <token>
 *
 * In sviluppo, se nessun token di lega è configurato e non viene fornito un
 * token personale valido, l'ingest resta libero (comodo per i test locali) e
 * si comporta come 'league'. In produzione un token valido è OBBLIGATORIO.
 * ------------------------------------------------------------
 */
import { config } from '../config/config.js';
import { HttpError } from '../utils/helpers.js';
import db from '../database/db.js';

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  if (req.headers['x-collector-token']) return String(req.headers['x-collector-token']).trim();
  return null;
}

export async function requireCollector(req, _res, next) {
  try {
    const provided = extractToken(req);
    const expected = config.collectorToken;

    // 1) Token personale di un utente? (controllato per primo, così funziona
    //    anche quando il token di lega non è configurato).
    if (provided) {
      const user = await db
        .prepare('SELECT id FROM users WHERE personal_token = ? AND is_active = 1')
        .get(provided);
      if (user) {
        req.ingestMode = 'personal';
        req.personalUserId = user.id;
        return next();
      }
    }

    // 2) Token condiviso della lega.
    if (!expected) {
      // Nessun token di lega configurato: consentito solo fuori produzione.
      if (config.isProd()) {
        return next(new HttpError(503, 'Ingest telemetria non configurato (COLLECTOR_TOKEN mancante)'));
      }
      req.ingestMode = 'league';
      return next();
    }

    if (!provided || provided !== expected) {
      return next(new HttpError(401, 'Token collector non valido'));
    }
    req.ingestMode = 'league';
    next();
  } catch (err) {
    next(err);
  }
}
