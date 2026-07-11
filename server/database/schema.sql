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
  -- Il nome pubblico "@handle" è il nickname di gioco PRIMARIO (game_identities.is_primary).
  -- Lo storico "username" è stato rimosso: login solo via email.
  display_name      TEXT    NOT NULL,          -- derivato: "Nome Cognome"
  first_name        TEXT    DEFAULT '',        -- nome
  last_name         TEXT    DEFAULT '',        -- cognome
  email             TEXT    UNIQUE,
  password_hash     TEXT,                    -- NULL se login solo via OAuth
  avatar            TEXT    DEFAULT '/images/avatars/default.svg',
  nationality       TEXT    DEFAULT 'IT',    -- codice ISO paese
  favorite_number   INTEGER,                 -- numero preferito (1-99)
  team_id           INTEGER,                 -- team attuale nel campionato
  favorite_driver   TEXT,                    -- pilota reale preferito
  reserve_driver    TEXT,                    -- pilota di riserva (BOT) reale F1 2025 del team
  biography         TEXT    DEFAULT '',
  -- Aiuti alla guida dichiarati dal pilota (mostrati sul giro veloce)
  assist_abs        INTEGER NOT NULL DEFAULT 0,       -- 0 = off, 1 = on
  assist_tc         TEXT    NOT NULL DEFAULT 'off',   -- 'off' | 'medium' | 'full'
  assist_gearbox    TEXT    NOT NULL DEFAULT 'auto',  -- 'auto' | 'manual'
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
--  META APPLICAZIONE (chiave/valore) — usata per migrazioni "one-shot"
--  (es. popolamenti eseguiti una sola volta, così le modifiche manuali
--   dell'admin non vengono ripristinate a ogni avvio).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_meta (
  key    TEXT PRIMARY KEY,
  value  TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
--  RESET PASSWORD (recupero credenziali)
--  Un record per richiesta di reset. Salviamo solo l'HASH del token
--  (mai il token in chiaro): il link inviato via email contiene il token
--  originale, che confrontiamo per hash. Scadenza breve, uso singolo.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_resets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  token_hash  TEXT    NOT NULL UNIQUE,          -- sha256(token) in hex
  token_plain TEXT,                             -- token in chiaro: serve all'admin per copiare il link
  expires_at  TEXT    NOT NULL,                 -- ISO/datetime di scadenza
  used_at     TEXT,                             -- valorizzato quando consumato
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token_hash);

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
  points_pole        INTEGER NOT NULL DEFAULT 0,  -- punti per la pole (0 = nessuno)
  points_fastest_lap INTEGER NOT NULL DEFAULT 1,  -- punti per il giro veloce (0 = nessuno)
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
--  BACHECA / POST SOCIAL
--  Ogni utente può pubblicare un post con testo e (opzionale) un
--  media (foto o video). Può taggare altri utenti (post_tags).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS posts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id     INTEGER NOT NULL,
  body          TEXT    DEFAULT '',          -- didascalia/commento
  media_url     TEXT,                          -- URL foto o video (Vercel Blob / uploads)
  media_type    TEXT,                          -- 'image' | 'video' | NULL
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Utenti taggati in un post (molti-a-molti)
CREATE TABLE IF NOT EXISTS post_tags (
  post_id       INTEGER NOT NULL,
  user_id       INTEGER NOT NULL,
  PRIMARY KEY (post_id, user_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
--  IDENTITÀ DI GIOCO (alias telemetria)
--  Associa un nickname/handle F1 25 (dalla lobby UDP) a un utente
--  del sito. Popolata da:
--    - profilo pilota (handle pre-dichiarato)  → source = 'profile'
--    - conferma manuale dell'admin in import   → source = 'alias'
--  Consente la mappatura automatica dei piloti nelle gare importate.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_identities (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  platform      TEXT    DEFAULT '',        -- 'steam' | 'psn' | 'xbox' | 'origin' | ''
  handle        TEXT    NOT NULL,          -- nickname di gioco (Participants.m_name)
  source        TEXT    NOT NULL DEFAULT 'alias', -- 'profile' | 'alias'
  is_primary    INTEGER NOT NULL DEFAULT 0,  -- 1 = handle pubblico "@handle" (max uno per utente)
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (platform, handle)
);

-- ------------------------------------------------------------
--  RICHIESTE DI CAMBIO (team / pilota di riserva)
--  L'utente richiede dal profilo il cambio di squadra e/o del pilota
--  di riserva (BOT). La richiesta resta 'pending': i valori attuali
--  dell'utente NON cambiano finché l'admin non approva. Alla conferma
--  l'admin applica i valori richiesti su users.
--  Regola applicativa: una sola richiesta 'pending' per utente.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS change_requests (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL,
  requested_team_id INTEGER,          -- NULL = nessun cambio team
  requested_reserve TEXT,             -- NULL = nessun cambio riserva
  status            TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  note              TEXT DEFAULT '',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at       TEXT,
  resolved_by       INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (requested_team_id) REFERENCES teams(id) ON DELETE SET NULL,
  FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_change_requests_status ON change_requests(status);

-- ------------------------------------------------------------
--  SESSIONI CATTURATE (staging telemetria)
--  Il collector invia qui il JSON aggregato di fine gara. Restano
--  in "staging": l'admin le rivede e le importa nelle tabelle
--  canoniche (results/qualifying) tramite il flusso esistente.
--  Nessun dato canonico viene scritto dal collector direttamente.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS captured_sessions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  session_uid       TEXT    NOT NULL,          -- header UDP m_sessionUID
  session_type      TEXT    DEFAULT '',        -- 'race' | 'qualifying' | 'sprint' | ...
  track_id          INTEGER,                    -- header UDP m_trackId (riferimento)
  packet_format     INTEGER,                    -- es. 2025 (per versionare il parser)
  status            TEXT    NOT NULL DEFAULT 'pending', -- 'pending' | 'imported' | 'discarded'
  payload_json      TEXT    NOT NULL,           -- JSON aggregato completo della sessione
  race_id           INTEGER,                    -- gara in cui è stata importata
  collector_version TEXT    DEFAULT '',
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  imported_at       TEXT,
  FOREIGN KEY (race_id) REFERENCES races(id) ON DELETE SET NULL,
  UNIQUE (session_uid)
);

-- ------------------------------------------------------------
--  TEMPI SUL GIRO (cronologia per-giro dalla telemetria)
--  Un record per pilota-giro, con tempo giro e tempi dei 3 settori
--  (millisecondi) e validità. Popolati dall'import telemetria (Session
--  History, pacchetto UDP 11). Sostituiti a ogni re-import della gara.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lap_times (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  race_id       INTEGER NOT NULL,
  user_id       INTEGER NOT NULL,
  lap           INTEGER NOT NULL,          -- numero del giro (1-based)
  lap_time_ms   INTEGER,                    -- tempo sul giro (ms)
  sector1_ms    INTEGER,                    -- settore 1 (ms)
  sector2_ms    INTEGER,                    -- settore 2 (ms)
  sector3_ms    INTEGER,                    -- settore 3 (ms)
  valid         INTEGER NOT NULL DEFAULT 1, -- 1 = giro valido
  FOREIGN KEY (race_id) REFERENCES races(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (race_id, user_id, lap)
);

-- ------------------------------------------------------------
--  TRAIETTORIE (linea di gara dal Motion packet, UDP 0)
--  Un record per pilota-gara: la traiettoria del SOLO giro veloce, come
--  elenco di punti [x, z] (metri, piano orizzontale) decimati (~6 m).
--  Popolate dall'import telemetria; sostituite a ogni re-import della gara.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lap_traces (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  race_id           INTEGER NOT NULL,
  user_id           INTEGER NOT NULL,
  lap               INTEGER,                    -- giro veloce di riferimento
  best_lap_time_ms  INTEGER,                    -- tempo di quel giro (ms)
  points            TEXT NOT NULL,              -- JSON: [[x,z], ...] (metri, decimati ~6m)
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (race_id) REFERENCES races(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (race_id, user_id)                     -- un solo (miglior) giro per pilota
);
CREATE INDEX IF NOT EXISTS idx_lap_traces_race ON lap_traces(race_id);

-- ------------------------------------------------------------
--  SESSIONI PERSONALI (prove a tempo & gare tra amici)
--  Import AUTOMATICO dal collector di ogni pilota (token personale),
--  SENZA passare dall'admin e SENZA toccare i dati canonici di lega.
--  Servono per la sezione "I miei tempi": best per tracciato e confronto
--  tra piloti.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS personal_sessions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL,               -- proprietario del collector
  session_uid    TEXT    NOT NULL,               -- header UDP m_sessionUID
  session_type   TEXT    DEFAULT '',             -- 'time_trial' | 'race' | ...
  track_id       INTEGER,                         -- header UDP m_trackId
  circuit_id     INTEGER,                         -- circuito del sito (suggerito), può essere null
  weather        TEXT,
  packet_format  INTEGER,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (circuit_id) REFERENCES circuits(id) ON DELETE SET NULL,
  UNIQUE (session_uid, user_id)                   -- re-invio del collector idempotente
);
CREATE INDEX IF NOT EXISTS idx_personal_sessions_user ON personal_sessions(user_id);

CREATE TABLE IF NOT EXISTS personal_laps (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id     INTEGER NOT NULL,               -- FK personal_sessions
  user_id        INTEGER NOT NULL,               -- a chi appartiene il giro (owner o amico abbinato)
  track_id       INTEGER,                         -- denormalizzato per query per-tracciato
  circuit_id     INTEGER,                         -- denormalizzato (può essere null)
  lap            INTEGER NOT NULL,               -- numero del giro (1-based)
  lap_time_ms    INTEGER,                         -- tempo sul giro (ms)
  sector1_ms     INTEGER,
  sector2_ms     INTEGER,
  sector3_ms     INTEGER,
  valid          INTEGER NOT NULL DEFAULT 1,      -- 1 = giro valido
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES personal_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)             ON DELETE CASCADE,
  UNIQUE (session_id, user_id, lap)               -- re-invio idempotente
);
CREATE INDEX IF NOT EXISTS idx_personal_laps_user_track  ON personal_laps(user_id, track_id);
CREATE INDEX IF NOT EXISTS idx_personal_laps_track_valid ON personal_laps(track_id, valid);

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
CREATE INDEX IF NOT EXISTS idx_posts_created   ON posts(created_at);
CREATE INDEX IF NOT EXISTS idx_post_tags_post  ON post_tags(post_id);
CREATE INDEX IF NOT EXISTS idx_game_identities_user ON game_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_captured_status      ON captured_sessions(status);
CREATE INDEX IF NOT EXISTS idx_lap_times_race       ON lap_times(race_id);
