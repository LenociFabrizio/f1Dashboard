/**
 * db.js
 * ------------------------------------------------------------
 * Connessione al database e inizializzazione dello schema.
 *
 * DATA LAYER ASTRATTO (async): tutta l'app usa `db` da questo file.
 * Il motore è libSQL (@libsql/client), compatibile SQLite:
 *   - in locale usa un file embedded  (url `file:...`)
 *   - in produzione (Vercel) usa Turso (url `libsql://...` + authToken)
 *
 * La facade replica l'interfaccia sincrona di better-sqlite3
 * (`prepare(sql).get/all/run(...)`) ma è ASINCRONA: i consumer
 * devono usare `await`. I risultati sono oggetti semplici, così
 * spread/serializzazione si comportano come prima.
 * ------------------------------------------------------------
 */
import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Per il file locale, assicura che la cartella esista (url tipo "file:server/database/f1.db")
if (config.db.url.startsWith('file:')) {
  const filePath = config.db.url.slice('file:'.length);
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(config.paths.root, filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
}

const client = createClient({
  url: config.db.url,
  authToken: config.db.authToken || undefined,
});

/* --- Utility di conversione --- */
const rowToObj = (row, cols) => {
  const o = {};
  for (const c of cols) o[c] = row[c];
  return o;
};

// better-sqlite3 accetta sia varargs posizionali (?) sia un oggetto (@name).
const normArgs = (params) =>
  params.length === 1 && params[0] && typeof params[0] === 'object' && !Array.isArray(params[0])
    ? params[0]
    : params;

const mapRun = (rs) => ({
  lastInsertRowid: rs.lastInsertRowid != null ? Number(rs.lastInsertRowid) : undefined,
  changes: rs.rowsAffected,
});

/**
 * Facade asincrona sul client libSQL.
 */
export const db = {
  async get(sql, ...params) {
    const rs = await client.execute({ sql, args: normArgs(params) });
    return rs.rows[0] ? rowToObj(rs.rows[0], rs.columns) : undefined;
  },
  async all(sql, ...params) {
    const rs = await client.execute({ sql, args: normArgs(params) });
    return rs.rows.map((r) => rowToObj(r, rs.columns));
  },
  async run(sql, ...params) {
    return mapRun(await client.execute({ sql, args: normArgs(params) }));
  },
  /** Statement "preparato" (lazy): stessa forma di better-sqlite3 ma async. */
  prepare(sql) {
    return {
      get: (...a) => db.get(sql, ...a),
      all: (...a) => db.all(sql, ...a),
      run: (...a) => db.run(sql, ...a),
    };
  },
  /** Esegue più statement separati da ';' (usato per lo schema). */
  async exec(sql) {
    await client.executeMultiple(sql);
  },
  /** Accesso diretto al client (per batch/transazioni). */
  raw: client,
};

/**
 * Inizializza lo schema eseguendo schema.sql (idempotente grazie a IF NOT EXISTS).
 * NON è chiamata automaticamente: la invocano server/index.js (dev) e seed.js.
 */
export async function initSchema() {
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  await db.exec(schema);
  await runMigrations();
}

/**
 * Migrazioni idempotenti per DB già esistenti (aggiunge colonne mancanti).
 */
async function runMigrations() {
  const userCols = await db.all('PRAGMA table_info(users)');
  if (!userCols.some((c) => c.name === 'reserve_driver')) {
    await db.run('ALTER TABLE users ADD COLUMN reserve_driver TEXT');
  }
  if (!userCols.some((c) => c.name === 'first_name')) {
    await db.run("ALTER TABLE users ADD COLUMN first_name TEXT DEFAULT ''");
  }
  if (!userCols.some((c) => c.name === 'last_name')) {
    await db.run("ALTER TABLE users ADD COLUMN last_name TEXT DEFAULT ''");
  }
  if (!userCols.some((c) => c.name === 'assist_abs')) {
    await db.run('ALTER TABLE users ADD COLUMN assist_abs INTEGER NOT NULL DEFAULT 0');
  }
  if (!userCols.some((c) => c.name === 'assist_tc')) {
    await db.run("ALTER TABLE users ADD COLUMN assist_tc TEXT NOT NULL DEFAULT 'off'");
  }
  if (!userCols.some((c) => c.name === 'assist_gearbox')) {
    await db.run("ALTER TABLE users ADD COLUMN assist_gearbox TEXT NOT NULL DEFAULT 'auto'");
  }

  const resultCols = await db.all('PRAGMA table_info(results)');
  if (!resultCols.some((c) => c.name === 'bot_driver')) {
    await db.run("ALTER TABLE results ADD COLUMN bot_driver TEXT DEFAULT ''");
  }

  const seasonCols = await db.all('PRAGMA table_info(seasons)');
  const hasSeason = (name) => seasonCols.some((c) => c.name === name);
  if (!hasSeason('points_pole')) {
    await db.run('ALTER TABLE seasons ADD COLUMN points_pole INTEGER NOT NULL DEFAULT 0');
  }
  if (!hasSeason('points_fastest_lap')) {
    await db.run('ALTER TABLE seasons ADD COLUMN points_fastest_lap INTEGER NOT NULL DEFAULT 1');
  }

  // password_resets può esistere già (deploy precedente) senza token_plain.
  const resetCols = await db.all('PRAGMA table_info(password_resets)');
  if (resetCols.length && !resetCols.some((c) => c.name === 'token_plain')) {
    await db.run('ALTER TABLE password_resets ADD COLUMN token_plain TEXT');
  }

  await ensureOfficialCircuits();
}

/**
 * Circuiti ufficiali del Mondiale 2025. Inserisce SOLO quelli mancanti
 * (match per nome), così completa il calendario anche su DB già popolati
 * senza duplicare né toccare i dati esistenti.
 * [nome, paese, country_code, città, lunghezza_km, giri]
 */
const OFFICIAL_CIRCUITS_2025 = [
  ['Bahrain International Circuit', 'Bahrain', 'BH', 'Sakhir', 5.412, 57],
  ['Jeddah Corniche Circuit', 'Arabia Saudita', 'SA', 'Jeddah', 6.174, 50],
  ['Albert Park Circuit', 'Australia', 'AU', 'Melbourne', 5.278, 58],
  ['Suzuka International', 'Giappone', 'JP', 'Suzuka', 5.807, 53],
  ['Shanghai International', 'Cina', 'CN', 'Shanghai', 5.451, 56],
  ['Miami International', 'USA', 'US', 'Miami', 5.412, 57],
  ['Autodromo di Imola', 'Italia', 'IT', 'Imola', 4.909, 63],
  ['Circuit de Monaco', 'Monaco', 'MC', 'Monte Carlo', 3.337, 78],
  ['Circuit de Barcelona', 'Spagna', 'ES', 'Barcellona', 4.657, 66],
  ['Circuit Gilles Villeneuve', 'Canada', 'CA', 'Montreal', 4.361, 70],
  ['Red Bull Ring', 'Austria', 'AT', 'Spielberg', 4.318, 71],
  ['Silverstone Circuit', 'Gran Bretagna', 'GB', 'Silverstone', 5.891, 52],
  ['Circuit de Spa', 'Belgio', 'BE', 'Spa', 7.004, 44],
  ['Hungaroring', 'Ungheria', 'HU', 'Budapest', 4.381, 70],
  ['Circuit Zandvoort', 'Paesi Bassi', 'NL', 'Zandvoort', 4.259, 72],
  ['Autodromo di Monza', 'Italia', 'IT', 'Monza', 5.793, 53],
  ['Baku City Circuit', 'Azerbaigian', 'AZ', 'Baku', 6.003, 51],
  ['Marina Bay', 'Singapore', 'SG', 'Singapore', 4.940, 62],
  ['Circuit of the Americas', 'USA', 'US', 'Austin', 5.513, 56],
  ['Autódromo Hermanos Rodríguez', 'Messico', 'MX', 'Città del Messico', 4.304, 71],
  ['Autódromo José Carlos Pace', 'Brasile', 'BR', 'San Paolo', 4.309, 71],
  ['Las Vegas Strip Circuit', 'USA', 'US', 'Las Vegas', 6.201, 50],
  ['Lusail International Circuit', 'Qatar', 'QA', 'Lusail', 5.419, 57],
  ['Yas Marina Circuit', 'Emirati Arabi Uniti', 'AE', 'Abu Dhabi', 5.281, 58],
];

async function ensureOfficialCircuits() {
  for (const c of OFFICIAL_CIRCUITS_2025) {
    const exists = await db.prepare('SELECT id FROM circuits WHERE name = ?').get(c[0]);
    if (!exists) {
      await db
        .prepare('INSERT INTO circuits (name, country, country_code, city, length_km, laps_default) VALUES (?, ?, ?, ?, ?, ?)')
        .run(...c);
    }
  }
}

export default db;
