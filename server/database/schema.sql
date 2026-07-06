-- ============================================================
--  F1 CHAMPIONSHIP PORTAL - SCHEMA DATABASE
--  Motore: SQLite (better-sqlite3)
--  Note di portabilità:
--    - I tipi sono volutamente generici (INTEGER/TEXT/REAL) per
--      facilitare la migrazione a MySQL/PostgreSQL.
--    - Timestamp salvati come TEXT ISO-8601 (UTC).
--    - Le foreign key sono attive (PRAGMA foreign_keys = ON in db.js).
-- ============================================================

-- ------------------------------------------------------------
--  UTENTI (piloti + admin)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  username          TEXT    NOT NULL UNIQUE,
  display_name      TEXT    NOT NULL,
  email             TEXT    UNIQUE,
  password_hash     TEXT,                    -- NULL se login solo via OAuth
  avatar            TEXT    DEFAULT '/images/avatars/default.svg',
  nationality       TEXT    DEFAULT 'IT',    -- codice ISO paese
  favorite_number   INTEGER,                 -- numero preferito (1-99)
  team_id           INTEGER,                 -- team attuale nel campionato
  favorite_driver   TEXT,                    -- pilota reale preferito
  reserve_driver    TEXT,                    -- pilota di riserva (BOT) reale F1 2025 del team
  biography         TEXT    DEFAULT '',
  role              TEXT    NOT NULL DEFAULT 'pilota',  -- 'admin' | 'pilota'
  -- Predisposizione OAuth
  provider          TEXT    DEFAULT 'local', -- 'local' | 'psn' | 'ea'
  provider_id       TEXT,                    -- id esterno del provider
  is_active         INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
);

-- ------------------------------------------------------------
--  TEAM / COSTRUTTORI
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teams (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL UNIQUE,
  full_name     TEXT,
  color         TEXT    DEFAULT '#e10600',   -- colore identificativo (hex)
  logo          TEXT    DEFAULT '/images/teams/default.svg',
  base          TEXT,                          -- sede
  power_unit    TEXT,                          -- motore
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
--  STAGIONI
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS seasons (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,              -- es. "Stagione 2025"
  year          INTEGER NOT NULL,
  game          TEXT    DEFAULT 'F1 25',
  description   TEXT    DEFAULT '',
  is_active     INTEGER NOT NULL DEFAULT 0,    -- solo una stagione attiva
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
--  CIRCUITI
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS circuits (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  country       TEXT    NOT NULL,
  country_code  TEXT    DEFAULT 'IT',
  city          TEXT,
  length_km     REAL,                          -- lunghezza tracciato
  laps_default  INTEGER,                        -- giri tipici gara
  image         TEXT    DEFAULT '/images/circuits/default.svg',
  layout_svg    TEXT,                          -- eventuale layout
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
--  GARE (Gran Premi)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS races (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id     INTEGER NOT NULL,
  circuit_id    INTEGER NOT NULL,
  round         INTEGER NOT NULL,              -- numero di tappa nel calendario
  name          TEXT    NOT NULL,              -- es. "Gran Premio d'Italia"
  race_date     TEXT,                          -- data/ora ISO
  weather       TEXT    DEFAULT 'Sereno',      -- meteo
  laps          INTEGER,                        -- giri previsti
  distance_km   REAL,                          -- lunghezza gara
  status        TEXT    NOT NULL DEFAULT 'scheduled', -- 'scheduled' | 'completed'
  comment       TEXT    DEFAULT '',            -- commento gara (admin)
  mvp_user_id   INTEGER,                        -- MVP della gara
  screenshot    TEXT,                          -- immagine risultati caricata
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (season_id)  REFERENCES seasons(id)  ON DELETE CASCADE,
  FOREIGN KEY (circuit_id) REFERENCES circuits(id) ON DELETE RESTRICT,
  FOREIGN KEY (mvp_user_id) REFERENCES users(id)   ON DELETE SET NULL,
  UNIQUE (season_id, round)
);

-- ------------------------------------------------------------
--  QUALIFICHE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS qualifying (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  race_id       INTEGER NOT NULL,
  user_id       INTEGER NOT NULL,
  position      INTEGER NOT NULL,              -- posizione in qualifica (griglia)
  best_time     TEXT,                          -- miglior tempo (es. 1:21.345)
  gap           TEXT,                          -- distacco dalla pole
  FOREIGN KEY (race_id) REFERENCES races(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (race_id, user_id)
);

-- ------------------------------------------------------------
--  RISULTATI GARA
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS results (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  race_id         INTEGER NOT NULL,
  user_id         INTEGER NOT NULL,
  team_id         INTEGER,
  grid_position   INTEGER,                     -- posizione di partenza
  position        INTEGER,                     -- posizione finale (NULL se DNF)
  points          REAL    NOT NULL DEFAULT 0,
  finish_time     TEXT,                        -- tempo finale
  gap             TEXT,                        -- distacco dal vincitore
  fastest_lap     INTEGER NOT NULL DEFAULT 0,  -- 1 = giro veloce
  pole            INTEGER NOT NULL DEFAULT 0,  -- 1 = pole position
  dnf             INTEGER NOT NULL DEFAULT 0,  -- 1 = ritiro
  dnf_reason      TEXT    DEFAULT '',
  penalty_seconds INTEGER NOT NULL DEFAULT 0,  -- secondi di penalità
  penalty_note    TEXT    DEFAULT '',
  overtakes       INTEGER NOT NULL DEFAULT 0,  -- sorpassi (inserimento manuale)
  notes           TEXT    DEFAULT '',
  bot_driver      TEXT    DEFAULT '',           -- se valorizzato: ha guidato il bot (riserva) al posto del giocatore
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (race_id) REFERENCES races(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
  UNIQUE (race_id, user_id)
);

-- ------------------------------------------------------------
--  NEWS / NOTIZIE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS news (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id     INTEGER,
  title         TEXT    NOT NULL,
  body          TEXT    NOT NULL,
  image         TEXT,
  author_id     INTEGER,
  published_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id)   ON DELETE SET NULL
);

-- ------------------------------------------------------------
--  STATISTICHE MANUALI (per stagione/pilota)
--  Valori non ricavabili automaticamente e inseriti dall'admin.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS manual_stats (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id     INTEGER NOT NULL,
  user_id       INTEGER NOT NULL,
  stat_key      TEXT    NOT NULL,              -- es. 'total_overtakes'
  stat_value    REAL    NOT NULL DEFAULT 0,
  note          TEXT    DEFAULT '',
  FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE,
  UNIQUE (season_id, user_id, stat_key)
);

-- ------------------------------------------------------------
--  ACHIEVEMENTS / BADGE (predisposizione futura)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS achievements (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  code          TEXT    NOT NULL,
  title         TEXT    NOT NULL,
  description   TEXT    DEFAULT '',
  icon          TEXT    DEFAULT '🏆',
  awarded_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
--  INDICI per performance
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_results_race    ON results(race_id);
CREATE INDEX IF NOT EXISTS idx_results_user    ON results(user_id);
CREATE INDEX IF NOT EXISTS idx_races_season     ON races(season_id);
CREATE INDEX IF NOT EXISTS idx_qualifying_race ON qualifying(race_id);
CREATE INDEX IF NOT EXISTS idx_users_role      ON users(role);
