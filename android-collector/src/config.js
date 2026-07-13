/**
 * config.js
 * ------------------------------------------------------------
 * Costanti dell'app. A differenza del collector PC (che leggeva un
 * config.json da disco), qui i valori runtime (token, URL) vivono nella UI
 * e vengono salvati in AsyncStorage. Questo file tiene solo i default.
 * ------------------------------------------------------------
 */

// Endpoint di ingest del sito (uguale al collector PC).
export const DEFAULT_INGEST_URL =
  'https://f1-dashboard-eosin.vercel.app/api/ingest/sessions';

// Porta UDP di F1 25 (default del gioco).
export const UDP_PORT = 20777;
export const UDP_HOST = '0.0.0.0';

// Tipi di sessione catturati e inviati (gli altri sono ignorati).
// time_trial serve alla sezione personale "I miei tempi".
export const CAPTURE_SESSION_TYPES = ['race', 'sprint', 'qualifying', 'time_trial'];

// Versione del collector, inclusa nel payload.
export const COLLECTOR_VERSION = '0.1.0-android';

// Chiavi AsyncStorage per le impostazioni salvate dalla UI.
export const STORAGE_KEYS = {
  token: 'settings:token',
  ingestUrl: 'settings:ingestUrl',
};
