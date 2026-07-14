/**
 * config.js
 * ------------------------------------------------------------
 * Carica la configurazione del collector da un file JSON
 * (default: ./config.json accanto alla root del pacchetto) con
 * override tramite variabili d'ambiente. Fornisce default sensati.
 * ------------------------------------------------------------
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');

const DEFAULTS = {
  udp: { port: 20777, host: '0.0.0.0' },
  // collectorToken = token CONDIVISO della lega (ramo 'league', staging admin).
  // personalToken  = token PERSONALE dell'utente (ramo 'personal', "I miei tempi").
  // La modalità scelta all'avvio decide quale dei due viene usato (vedi modes.js).
  server: { ingestUrl: '', collectorToken: '', personalToken: '' },
  live: { enabled: true, port: 4600 },
  buffer: { dir: './data/queue' },
  // Tipi di sessione che vengono catturati e inviati (gli altri sono ignorati).
  // time_trial serve alla sezione personale "I miei tempi".
  captureSessionTypes: ['race', 'sprint', 'qualifying', 'time_trial'],
};

/** Fonde in profondità due oggetti semplici (b sovrascrive a). */
function deepMerge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(a[k] || {}, v) : v;
  }
  return out;
}

/**
 * Carica la configurazione.
 * @param {string} [file] percorso al config.json (default: <root>/config.json)
 */
export function loadConfig(file) {
  const configPath = path.resolve(ROOT_DIR, file || process.env.COLLECTOR_CONFIG || 'config.json');
  let fromFile = {};
  if (fs.existsSync(configPath)) {
    try {
      fromFile = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (err) {
      throw new Error(`Config non valida (${configPath}): ${err.message}`);
    }
  }
  let cfg = deepMerge(DEFAULTS, fromFile);

  // Override da ambiente (comodi per test/CI o esecuzione headless)
  cfg = deepMerge(cfg, {
    udp: {
      port: envInt('COLLECTOR_UDP_PORT', cfg.udp.port),
      host: process.env.COLLECTOR_UDP_HOST || cfg.udp.host,
    },
    server: {
      ingestUrl: process.env.COLLECTOR_INGEST_URL || cfg.server.ingestUrl,
      collectorToken: process.env.COLLECTOR_TOKEN || cfg.server.collectorToken,
      personalToken: process.env.COLLECTOR_PERSONAL_TOKEN || cfg.server.personalToken,
    },
  });

  // Normalizza la cartella di buffer in assoluto
  cfg.buffer.dir = path.resolve(ROOT_DIR, cfg.buffer.dir);
  cfg.configPath = configPath;
  return cfg;
}

function envInt(name, fallback) {
  const v = process.env[name];
  return v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : fallback;
}
