/**
 * seasonController.js
 * ------------------------------------------------------------
 * Gestione stagioni + circuiti (raggruppati perché entità di base).
 * ------------------------------------------------------------
 */
import db from '../database/db.js';
import { asyncHandler, HttpError } from '../utils/helpers.js';
import { calculatePoints } from '../utils/constants.js';

// ----------------------- STAGIONI -----------------------

/** GET /api/seasons */
export const listSeasons = asyncHandler(async (_req, res) => {
  res.json(await db.prepare('SELECT * FROM seasons ORDER BY year DESC, id DESC').all());
});

/** GET /api/seasons/active — stagione attiva corrente */
export const getActiveSeason = asyncHandler(async (_req, res) => {
  const season =
    (await db.prepare('SELECT * FROM seasons WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get()) ||
    (await db.prepare('SELECT * FROM seasons ORDER BY year DESC LIMIT 1').get());
  res.json(season || null);
});

/** GET /api/seasons/:id */
export const getSeason = asyncHandler(async (req, res) => {
  const season = await db.prepare('SELECT * FROM seasons WHERE id = ?').get(req.params.id);
  if (!season) throw new HttpError(404, 'Stagione non trovata');
  res.json(season);
});

/** Mescola un array (Fisher-Yates). */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Ordine ufficiale del calendario F1 25 (parole chiave che compaiono nel
 * nome/città/paese del circuito). Serve per generare il calendario nella
 * sequenza reale quando l'admin NON sceglie l'ordine casuale.
 */
const F1_2025_ORDER = [
  'melbourne', 'albert park', 'australia',   // 1  Australia
  'shanghai', 'cina', 'china',               // 2  Cina
  'suzuka', 'giappone', 'japan',             // 3  Giappone
  'bahrain', 'sakhir',                       // 4  Bahrain
  'jeddah', 'arabia',                        // 5  Arabia Saudita
  'miami',                                   // 6  Miami
  'imola',                                   // 7  Emilia-Romagna
  'monaco', 'monte carlo',                   // 8  Monaco
  'barcelona', 'barcellona', 'spagna',       // 9  Spagna
  'montreal', 'villeneuve', 'canada',        // 10 Canada
  'red bull ring', 'spielberg', 'austria',   // 11 Austria
  'silverstone',                             // 12 Gran Bretagna
  'spa', 'belgio',                           // 13 Belgio
  'hungaroring', 'budapest', 'ungheria',     // 14 Ungheria
  'zandvoort', 'paesi bassi', 'olanda',      // 15 Olanda
  'monza',                                   // 16 Italia
  'baku', 'azerbaigian',                     // 17 Azerbaigian
  'marina bay', 'singapore',                 // 18 Singapore
  'austin', 'cota', 'stati uniti',           // 19 USA
  'messico', 'mexico',                       // 20 Messico
  'interlagos', 'brasile', 'brazil',         // 21 Brasile
  'las vegas',                               // 22 Las Vegas
  'lusail', 'qatar',                         // 23 Qatar
  'yas marina', 'abu dhabi',                 // 24 Abu Dhabi
];

/** Posizione di un circuito nel calendario ufficiale (in fondo se non riconosciuto). */
function officialRank(circuit) {
  const hay = `${circuit.name || ''} ${circuit.city || ''} ${circuit.country || ''}`.toLowerCase();
  const idx = F1_2025_ORDER.findIndex((kw) => hay.includes(kw));
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

/** Ordina i circuiti secondo il calendario ufficiale F1 25 (fallback: nome). */
function officialSort(circuits) {
  return [...circuits].sort((a, b) => {
    const ra = officialRank(a);
    const rb = officialRank(b);
    if (ra !== rb) return ra - rb;
    return (a.name || '').localeCompare(b.name || '');
  });
}

/**
 * POST /api/seasons (admin)
 * Oltre alla stagione, genera automaticamente il calendario gare in base a:
 *  - circuit_mode: 'all' | 'random' | 'custom'
 *  - circuit_ids:  (solo custom) elenco id circuiti scelti
 *  - random_count: (solo random) quanti tracciati; default = tutti
 *  - laps_percentage: 1..100, i giri di ogni gara = round(giri_reali * %)
 */
export const createSeason = asyncHandler(async (req, res) => {
  const { name, year, game, description, is_active, circuit_mode, circuit_ids, random_count, laps_percentage,
          points_pole, points_fastest_lap } = req.body;
  if (!name || !year) throw new HttpError(400, 'Nome e anno obbligatori');

  const pct = Math.min(100, Math.max(1, Number(laps_percentage) || 100));
  const ptsPole = Math.max(0, Number(points_pole) || 0);
  const ptsFl = Math.max(0, Number(points_fastest_lap ?? 1) || 0);

  if (is_active) await db.prepare('UPDATE seasons SET is_active = 0').run(); // solo una attiva
  const info = await db
    .prepare(
      `INSERT INTO seasons (name, year, game, description, is_active, points_pole, points_fastest_lap)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(name, year, game || 'F1 25', description || '', is_active ? 1 : 0, ptsPole, ptsFl);
  const seasonId = Number(info.lastInsertRowid);

  // Selezione tracciati per il calendario
  const allCircuits = await db.prepare('SELECT id, name, city, country, laps_default, length_km FROM circuits').all();
  let chosen;
  if (circuit_mode === 'custom') {
    // Solo i circuiti scelti, ma comunque in ordine ufficiale F1 25.
    const ids = (Array.isArray(circuit_ids) ? circuit_ids : []).map(Number);
    chosen = officialSort(allCircuits.filter((c) => ids.includes(c.id)));
  } else if (circuit_mode === 'random') {
    const shuffled = shuffle(allCircuits);
    const count = random_count ? Math.min(Math.max(1, Number(random_count)), shuffled.length) : shuffled.length;
    chosen = shuffled.slice(0, count); // ordine casuale, come richiesto
  } else {
    chosen = officialSort(allCircuits); // 'all' (default) → ordine ufficiale
  }

  // Genera le gare (round progressivo, giri in base alla percentuale)
  if (chosen.length) {
    const stmts = chosen.map((c, i) => {
      const laps = c.laps_default ? Math.max(1, Math.round((c.laps_default * pct) / 100)) : null;
      const distance = c.length_km && laps ? Math.round(c.length_km * laps * 10) / 10 : null;
      return {
        sql: `INSERT INTO races (season_id, circuit_id, round, name, laps, distance_km, status)
              VALUES (?, ?, ?, ?, ?, ?, 'scheduled')`,
        args: [seasonId, c.id, i + 1, c.name, laps, distance],
      };
    });
    await db.raw.batch(stmts, 'write');
  }

  const season = await db.prepare('SELECT * FROM seasons WHERE id = ?').get(seasonId);
  res.status(201).json({ ...season, races_created: chosen.length });
});

/** PUT /api/seasons/:id (admin) */
export const updateSeason = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const season = await db.prepare('SELECT * FROM seasons WHERE id = ?').get(id);
  if (!season) throw new HttpError(404, 'Stagione non trovata');
  if (req.body.is_active) await db.prepare('UPDATE seasons SET is_active = 0').run();
  const fields = ['name', 'year', 'game', 'description', 'is_active', 'points_pole', 'points_fastest_lap'];
  const updates = {};
  for (const f of fields) if (req.body[f] !== undefined) updates[f] = req.body[f];
  if (Object.keys(updates).length === 0) throw new HttpError(400, 'Nessun dato da aggiornare');
  const setClause = Object.keys(updates).map((k) => `${k} = @${k}`).join(', ');
  await db.prepare(`UPDATE seasons SET ${setClause} WHERE id = @id`).run({ ...updates, id });

  // Se cambia la regola punti (pole / giro veloce), ricalcola i punti di
  // tutti i risultati già salvati della stagione, così la classifica resta
  // coerente con la nuova configurazione.
  const poleChanged = updates.points_pole !== undefined && Number(updates.points_pole) !== Number(season.points_pole);
  const flChanged = updates.points_fastest_lap !== undefined && Number(updates.points_fastest_lap) !== Number(season.points_fastest_lap);
  if (poleChanged || flChanged) {
    await recomputeSeasonPoints(id);
  }

  res.json(await db.prepare('SELECT * FROM seasons WHERE id = ?').get(id));
});

/**
 * Ricalcola i punti di tutti i risultati di una stagione in base alla
 * configurazione punti corrente (pole / giro veloce).
 */
async function recomputeSeasonPoints(seasonId) {
  const s = await db.prepare('SELECT points_pole, points_fastest_lap FROM seasons WHERE id = ?').get(seasonId);
  const pointsPole = Number(s?.points_pole) || 0;
  const pointsFastestLap = Number(s?.points_fastest_lap ?? 1);

  const rows = await db
    .prepare(
      `SELECT r.id, r.position, r.fastest_lap, r.pole, r.dnf
         FROM results r
         JOIN races ra ON ra.id = r.race_id
        WHERE ra.season_id = ?`
    )
    .all(seasonId);
  if (!rows.length) return;

  const stmts = rows.map((r) => ({
    sql: 'UPDATE results SET points = ? WHERE id = ?',
    args: [
      calculatePoints(r.position, !!r.fastest_lap, !!r.dnf, {
        pole: !!r.pole,
        pointsPole,
        pointsFastestLap,
      }),
      r.id,
    ],
  }));
  await db.raw.batch(stmts, 'write');
}

/**
 * POST /api/seasons/:id/archive (admin)
 * Archivia (is_active = 0) o riattiva (is_active = 1) una stagione.
 * Body: { active: boolean }. Se si riattiva, le altre vengono disattivate.
 */
export const archiveSeason = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const season = await db.prepare('SELECT * FROM seasons WHERE id = ?').get(id);
  if (!season) throw new HttpError(404, 'Stagione non trovata');

  const active = req.body.active ? 1 : 0;
  if (active) await db.prepare('UPDATE seasons SET is_active = 0').run(); // solo una attiva
  await db.prepare('UPDATE seasons SET is_active = ? WHERE id = ?').run(active, id);
  res.json(await db.prepare('SELECT * FROM seasons WHERE id = ?').get(id));
});

/**
 * DELETE /api/seasons/:id (admin)
 * Elimina definitivamente la stagione e TUTTI i dati collegati:
 * risultati e qualifiche delle sue gare, le gare, le statistiche manuali e
 * le news della stagione. Cancellazione esplicita dei figli (non ci
 * affidiamo al cascade FK, non garantito su connessioni HTTP serverless).
 */
export const deleteSeason = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const season = await db.prepare('SELECT * FROM seasons WHERE id = ?').get(id);
  if (!season) throw new HttpError(404, 'Stagione non trovata');

  await db.raw.batch(
    [
      { sql: 'DELETE FROM results   WHERE race_id IN (SELECT id FROM races WHERE season_id = ?)', args: [id] },
      { sql: 'DELETE FROM qualifying WHERE race_id IN (SELECT id FROM races WHERE season_id = ?)', args: [id] },
      { sql: 'DELETE FROM lap_times  WHERE race_id IN (SELECT id FROM races WHERE season_id = ?)', args: [id] },
      { sql: 'DELETE FROM races        WHERE season_id = ?', args: [id] },
      { sql: 'DELETE FROM manual_stats WHERE season_id = ?', args: [id] },
      { sql: 'DELETE FROM news         WHERE season_id = ?', args: [id] },
      { sql: 'DELETE FROM seasons      WHERE id = ?',        args: [id] },
    ],
    'write'
  );
  res.json({ message: 'Stagione eliminata' });
});

// ----------------------- CIRCUITI -----------------------

/** GET /api/circuits */
export const listCircuits = asyncHandler(async (_req, res) => {
  res.json(await db.prepare('SELECT * FROM circuits ORDER BY name').all());
});

/** POST /api/circuits (admin) */
export const createCircuit = asyncHandler(async (req, res) => {
  const { name, country, country_code, city, length_km, laps_default, image } = req.body;
  if (!name || !country) throw new HttpError(400, 'Nome e paese obbligatori');
  const info = await db
    .prepare(
      `INSERT INTO circuits (name, country, country_code, city, length_km, laps_default, image)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(name, country, country_code || 'IT', city || '', length_km || null, laps_default || null, image || '/images/circuits/default.svg');
  res.status(201).json(await db.prepare('SELECT * FROM circuits WHERE id = ?').get(info.lastInsertRowid));
});

/** PUT /api/circuits/:id (admin) */
export const updateCircuit = asyncHandler(async (req, res) => {
  const circuit = await db.prepare('SELECT * FROM circuits WHERE id = ?').get(req.params.id);
  if (!circuit) throw new HttpError(404, 'Circuito non trovato');
  const fields = ['name', 'country', 'country_code', 'city', 'length_km', 'laps_default', 'image'];
  const updates = {};
  for (const f of fields) if (req.body[f] !== undefined) updates[f] = req.body[f];
  if (Object.keys(updates).length === 0) throw new HttpError(400, 'Nessun dato da aggiornare');
  const setClause = Object.keys(updates).map((k) => `${k} = @${k}`).join(', ');
  await db.prepare(`UPDATE circuits SET ${setClause} WHERE id = @id`).run({ ...updates, id: req.params.id });
  res.json(await db.prepare('SELECT * FROM circuits WHERE id = ?').get(req.params.id));
});
