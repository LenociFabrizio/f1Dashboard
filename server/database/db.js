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

  // Handle di gioco PRIMARIO (nome pubblico "@handle").
  const giCols = await db.all('PRAGMA table_info(game_identities)');
  if (giCols.length && !giCols.some((c) => c.name === 'is_primary')) {
    await db.run('ALTER TABLE game_identities ADD COLUMN is_primary INTEGER NOT NULL DEFAULT 0');
  }
  // Assicura un primario per chi ha handle ma nessuno ancora marcato (il più vecchio).
  await db.run(
    `UPDATE game_identities SET is_primary = 1
      WHERE id IN (
        SELECT MIN(g.id) FROM game_identities g
         WHERE NOT EXISTS (
           SELECT 1 FROM game_identities p WHERE p.user_id = g.user_id AND p.is_primary = 1
         )
         GROUP BY g.user_id
      )`
  );

  // Rimozione definitiva della colonna users.username (con backfill del nome pubblico).
  await dropUsernameColumnOnce();

  // Tipo di sessione ('race' | 'qualifying') su tempi/traiettorie: consente a
  // gara e qualifica dello stesso GP di coesistere senza sovrascriversi.
  await addSessionTypeToLapTables();

  await ensureOfficialCircuits();
  await ensureFullCalendarOnce();
}

/**
 * Aggiunge la colonna `session_type` a `lap_times` e `lap_traces` sui DB
 * esistenti e ne aggiorna i vincoli UNIQUE (che devono includere il tipo di
 * sessione). SQLite non consente di modificare un UNIQUE inline: si ricostruisce
 * la tabella. I dati preesistenti sono giri/traiettorie di GARA → `session_type='race'`.
 * Idempotente: se la colonna esiste già, non fa nulla.
 */
async function addSessionTypeToLapTables() {
  const ltCols = await db.all('PRAGMA table_info(lap_times)');
  if (ltCols.length && !ltCols.some((c) => c.name === 'session_type')) {
    await db.exec(`
      PRAGMA foreign_keys=OFF;
      CREATE TABLE lap_times_new (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        race_id       INTEGER NOT NULL,
        user_id       INTEGER NOT NULL,
        session_type  TEXT    NOT NULL DEFAULT 'race',
        lap           INTEGER NOT NULL,
        lap_time_ms   INTEGER,
        sector1_ms    INTEGER,
        sector2_ms    INTEGER,
        sector3_ms    INTEGER,
        valid         INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (race_id) REFERENCES races(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE (race_id, user_id, session_type, lap)
      );
      INSERT INTO lap_times_new (id, race_id, user_id, session_type, lap, lap_time_ms, sector1_ms, sector2_ms, sector3_ms, valid)
        SELECT id, race_id, user_id, 'race', lap, lap_time_ms, sector1_ms, sector2_ms, sector3_ms, valid FROM lap_times;
      DROP TABLE lap_times;
      ALTER TABLE lap_times_new RENAME TO lap_times;
      CREATE INDEX IF NOT EXISTS idx_lap_times_race ON lap_times(race_id);
      PRAGMA foreign_keys=ON;
    `);
  }

  const trCols = await db.all('PRAGMA table_info(lap_traces)');
  if (trCols.length && !trCols.some((c) => c.name === 'session_type')) {
    await db.exec(`
      PRAGMA foreign_keys=OFF;
      CREATE TABLE lap_traces_new (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        race_id           INTEGER NOT NULL,
        user_id           INTEGER NOT NULL,
        session_type      TEXT NOT NULL DEFAULT 'race',
        lap               INTEGER,
        best_lap_time_ms  INTEGER,
        points            TEXT NOT NULL,
        created_at        TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (race_id) REFERENCES races(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE (race_id, user_id, session_type)
      );
      INSERT INTO lap_traces_new (id, race_id, user_id, session_type, lap, best_lap_time_ms, points, created_at)
        SELECT id, race_id, user_id, 'race', lap, best_lap_time_ms, points, created_at FROM lap_traces;
      DROP TABLE lap_traces;
      ALTER TABLE lap_traces_new RENAME TO lap_traces;
      CREATE INDEX IF NOT EXISTS idx_lap_traces_race ON lap_traces(race_id);
      PRAGMA foreign_keys=ON;
    `);
  }
}

/**
 * Elimina la colonna `users.username` (storica) dai DB esistenti.
 * - Prima esegue il backfill: chi non ha alcun handle eredita lo username come
 *   handle di gioco PRIMARIO, così non perde il nome pubblico "@handle".
 * - Poi ricostruisce la tabella `users` senza `username` (SQLite non consente
 *   DROP COLUMN su una colonna con vincolo UNIQUE inline). Gli `id` sono
 *   preservati: le FK delle tabelle figlie restano valide.
 * Idempotente: se la colonna non esiste più, non fa nulla.
 */
async function dropUsernameColumnOnce() {
  const cols = await db.all('PRAGMA table_info(users)');
  if (!cols.some((c) => c.name === 'username')) return; // già rimossa

  // 1) Backfill: username → handle primario per chi non ha handle.
  await db.run(
    `INSERT INTO game_identities (user_id, platform, handle, source, is_primary)
     SELECT u.id, '', u.username, 'profile', 1
       FROM users u
      WHERE u.username IS NOT NULL AND TRIM(u.username) <> ''
        AND NOT EXISTS (SELECT 1 FROM game_identities g WHERE g.user_id = u.id)`
  );

  // 2) Rebuild della tabella users senza `username`.
  const copyCols = [
    'id', 'display_name', 'first_name', 'last_name', 'email', 'password_hash', 'avatar',
    'nationality', 'favorite_number', 'team_id', 'favorite_driver', 'reserve_driver',
    'biography', 'assist_abs', 'assist_tc', 'assist_gearbox', 'role', 'provider',
    'provider_id', 'is_active', 'created_at', 'updated_at',
  ].filter((c) => cols.some((x) => x.name === c));
  const colList = copyCols.join(', ');

  await db.exec(`
    PRAGMA foreign_keys=OFF;
    CREATE TABLE users_new (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      display_name      TEXT    NOT NULL,
      first_name        TEXT    DEFAULT '',
      last_name         TEXT    DEFAULT '',
      email             TEXT    UNIQUE,
      password_hash     TEXT,
      avatar            TEXT    DEFAULT '/images/avatars/default.svg',
      nationality       TEXT    DEFAULT 'IT',
      favorite_number   INTEGER,
      team_id           INTEGER,
      favorite_driver   TEXT,
      reserve_driver    TEXT,
      biography         TEXT    DEFAULT '',
      assist_abs        INTEGER NOT NULL DEFAULT 0,
      assist_tc         TEXT    NOT NULL DEFAULT 'off',
      assist_gearbox    TEXT    NOT NULL DEFAULT 'auto',
      role              TEXT    NOT NULL DEFAULT 'pilota',
      provider          TEXT    DEFAULT 'local',
      provider_id       TEXT,
      is_active         INTEGER NOT NULL DEFAULT 1,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
    );
    INSERT INTO users_new (${colList}) SELECT ${colList} FROM users;
    DROP TABLE users;
    ALTER TABLE users_new RENAME TO users;
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    PRAGMA foreign_keys=ON;
  `);
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

/**
 * GP mancanti del calendario 2025 da aggiungere alla stagione ATTIVA.
 * [nome GP, nome circuito (per il lookup), data ISO]
 */
const MISSING_2025_GPS = [
  ["Gran Premio dei Paesi Bassi", 'Circuit Zandvoort', '2025-08-31T15:00:00'],
  ["Gran Premio dell'Azerbaigian", 'Baku City Circuit', '2025-09-21T13:00:00'],
  ['Gran Premio degli Stati Uniti', 'Circuit of the Americas', '2025-10-19T20:00:00'],
  ['Gran Premio di Città del Messico', 'Autódromo Hermanos Rodríguez', '2025-10-26T21:00:00'],
  ['Gran Premio del Brasile', 'Autódromo José Carlos Pace', '2025-11-09T17:00:00'],
  ['Gran Premio di Las Vegas', 'Las Vegas Strip Circuit', '2025-11-23T05:00:00'],
  ['Gran Premio del Qatar', 'Lusail International Circuit', '2025-11-30T16:00:00'],
  ['Gran Premio di Abu Dhabi', 'Yas Marina Circuit', '2025-12-07T14:00:00'],
];

/**
 * Completa UNA VOLTA il calendario della stagione attiva con i GP ufficiali
 * mancanti (round accodati). È one-shot (marcatore in app_meta): così se
 * l'admin poi ne elimina qualcuno, non vengono ripristinati al riavvio.
 * Ogni GP è comunque aggiunto solo se la stagione non ha già una gara su quel
 * circuito (evita duplicati con eventuali inserimenti manuali).
 */
async function ensureFullCalendarOnce() {
  const MARK = 'calendar_2025_gps_v1';
  const done = await db.prepare('SELECT value FROM app_meta WHERE key = ?').get(MARK);
  if (done) return;

  const season = await db.prepare('SELECT id FROM seasons WHERE is_active = 1 ORDER BY id LIMIT 1').get();
  if (season) {
    const mx = await db.prepare('SELECT COALESCE(MAX(round), 0) AS m FROM races WHERE season_id = ?').get(season.id);
    let nextRound = (mx?.m || 0) + 1;
    for (const [name, circuitName, date] of MISSING_2025_GPS) {
      const circ = await db
        .prepare('SELECT id, laps_default, length_km FROM circuits WHERE name = ?')
        .get(circuitName);
      if (!circ) continue;
      const exists = await db
        .prepare('SELECT id FROM races WHERE season_id = ? AND circuit_id = ?')
        .get(season.id, circ.id);
      if (exists) continue;
      const laps = circ.laps_default || null;
      const dist = circ.length_km && laps ? Math.round(circ.length_km * laps * 10) / 10 : null;
      await db
        .prepare(
          `INSERT INTO races (season_id, circuit_id, round, name, race_date, weather, laps, distance_km, status)
           VALUES (?, ?, ?, ?, ?, 'Sereno', ?, ?, 'scheduled')`
        )
        .run(season.id, circ.id, nextRound, name, date, laps, dist);
      nextRound++;
    }
  }
  // Marca come eseguito anche se non c'era stagione attiva: si completa dal seed/admin.
  await db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run(MARK, new Date().toISOString());
}

export default db;
