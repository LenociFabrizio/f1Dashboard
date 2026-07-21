/**
 * captureService.js
 * ------------------------------------------------------------
 * Elaborazione delle sessioni telemetria catturate (staging) verso i
 * risultati canonici del sito.
 *
 * Responsabilità:
 *   - risolvere l'identità dei piloti (nickname di gioco → utente del DB)
 *     usando la tabella `game_identities` (handle pre-dichiarati + alias);
 *   - costruire le righe `results`/`qualifying` dal JSON aggregato;
 *   - "committare" una sessione riusando la persistenza esistente
 *     (persistResults / persistQualifying): nessuna duplicazione di logica.
 *
 * NON scrive nulla nelle tabelle canoniche finché l'admin non chiede il
 * commit: prima è solo staging + anteprima.
 * ------------------------------------------------------------
 */
import db from '../database/db.js';
import { HttpError } from '../utils/helpers.js';
import { persistResults } from '../controllers/resultController.js';
import { persistQualifying } from '../controllers/raceController.js';
import { resultStatusToDnf, msToLapTime, msToRaceTime, msToGap } from '../utils/f1-mappings.js';

const norm = (s) => String(s || '').trim().toLowerCase();

/**
 * Categoria canonica di una sessione ai fini dell'import: 'race' | 'qualifying'.
 * Il collector emette 'race' | 'qualifying' | 'practice' | 'time_trial' (sprint
 * rientra in 'race', vedi collector/src/parser/enums.js). Solo la qualifica ha
 * un ramo dedicato: tutto il resto è trattato come gara.
 */
export function sessionKind(type) {
  return String(type || '').trim().toLowerCase() === 'qualifying' ? 'qualifying' : 'race';
}

/**
 * Risolve i partecipanti di una sessione in utenti del sito.
 * Precedenza: (platform + handle) esatto → handle unico su qualsiasi
 * piattaforma. I bot (aiControlled) non vengono mappati automaticamente.
 *
 * @param {Array<object>} participants  [{ carIndex, name, platform, raceNumber, teamId, aiControlled }]
 * @returns {Promise<Array>} partecipanti arricchiti con { userId, userDisplay, matchedBy }
 */
export async function resolveIdentities(participants = []) {
  const aliases = await db
    .prepare('SELECT user_id, platform, handle FROM game_identities')
    .all();
  const users = await db
    .prepare('SELECT id, display_name, reserve_driver FROM users WHERE is_active = 1')
    .all();
  const userById = new Map(users.map((u) => [u.id, u]));

  // Indice dei piloti di riserva (BOT): nome del bot -> utente titolare.
  // reserve_driver e' univoco per utente, quindi il match e' deterministico:
  // riconosce quando in gara ha corso il bot di riserva al posto del titolare.
  const byReserve = new Map();
  for (const u of users) {
    const r = norm(u.reserve_driver);
    if (r) byReserve.set(r, u.id);
  }

  // Indici di lookup
  const byPlatformHandle = new Map(); // "platform handle" → user_id
  const byHandle = new Map();         // "handle" → Set(user_id)  (per rilevare ambiguità)
  for (const a of aliases) {
    byPlatformHandle.set(`${norm(a.platform)} ${norm(a.handle)}`, a.user_id);
    const h = norm(a.handle);
    if (!byHandle.has(h)) byHandle.set(h, new Set());
    byHandle.get(h).add(a.user_id);
  }

  return participants.map((p) => {
    const handle = norm(p.name);
    let userId = null;
    let matchedBy = null;
    let botDriver = null;

    if (handle) {
      const exact = byPlatformHandle.get(`${norm(p.platform)} ${handle}`);
      if (exact) {
        userId = exact;
        matchedBy = 'platform';
      } else {
        const set = byHandle.get(handle);
        if (set && set.size === 1) {
          userId = [...set][0];
          matchedBy = 'handle';
        }
      }
    }

    // Nessun match come giocatore: prova come BOT di riserva (per nome).
    if (!userId && handle && byReserve.has(handle)) {
      userId = byReserve.get(handle);
      matchedBy = 'reserve';
      botDriver = p.name; // ha corso il bot al posto del titolare
    }

    const u = userId ? userById.get(userId) : null;
    return {
      carIndex: p.carIndex,
      name: p.name || '',
      platform: p.platform || '',
      raceNumber: p.raceNumber ?? null,
      teamId: p.teamId ?? null,
      aiControlled: !!p.aiControlled,
      userId: u ? u.id : null,
      userDisplay: u ? u.display_name : null,
      matchedBy,
      botDriver,
    };
  });
}

/**
 * Salva/aggiorna alias di gioco (conferma manuale dell'admin). Idempotente:
 * un conflitto (platform, handle) riassegna l'alias all'utente indicato.
 * @param {Array<{platform?:string, handle:string, user_id:number}>} mappings
 * @returns {Promise<number>} numero di alias salvati
 */
export async function saveAliases(mappings = []) {
  const stmts = [];
  for (const m of mappings) {
    const handle = String(m.handle || '').trim();
    if (!handle || !m.user_id) continue;
    stmts.push({
      sql: `INSERT INTO game_identities (user_id, platform, handle, source)
            VALUES (?, ?, ?, 'alias')
            ON CONFLICT (platform, handle)
            DO UPDATE SET user_id = excluded.user_id`,
      args: [Number(m.user_id), String(m.platform || '').trim(), handle],
    });
  }
  if (stmts.length) await db.raw.batch(stmts, 'write');
  return stmts.length;
}

/**
 * Costruisce le righe results/qualifying dal JSON di sessione, dato l'elenco
 * dei partecipanti già risolti (con userId). I partecipanti non mappati
 * finiscono in `skipped` (l'admin li risolve e ricommitta).
 *
 * @param {object} payload  JSON aggregato della sessione
 * @param {Array<object>} resolved  output di resolveIdentities (+ eventuali override)
 * @returns {{ resultRows:Array, qualifyingRows:Array, skipped:Array }}
 */
export function buildRows(payload, resolved, opts = {}) {
  const userByCar = new Map(resolved.map((p) => [p.carIndex, p]));
  const classification = payload.classification || [];
  const qualifying = payload.qualifying || [];

  // Pole: override esplicito (griglia di qualifica già salvata sul DB) oppure,
  // in mancanza, chi ha chiuso la qualifica in P1 nel payload (sessione combinata).
  const poleEntry = qualifying.find((q) => Number(q.position) === 1);
  const poleUserId = opts.poleUserId !== undefined
    ? opts.poleUserId
    : (poleEntry ? userByCar.get(poleEntry.carIndex)?.userId ?? null : null);

  // Giro veloce: usa l'indice dichiarato dal collector, altrimenti il miglior
  // bestLapMs valido tra i classificati.
  let fastestCar = payload.fastestLapCarIndex;
  if (fastestCar === undefined || fastestCar === null) {
    let best = Infinity;
    for (const c of classification) {
      const t = Number(c.bestLapMs);
      if (t > 0 && t < best) { best = t; fastestCar = c.carIndex; }
    }
  }

  // Tempo del vincitore (per calcolare i distacchi dei piloti a pari giri)
  const finishers = classification.filter((c) => Number(c.totalRaceTimeMs) > 0);
  const leaderMs = finishers.length ? Math.min(...finishers.map((c) => Number(c.totalRaceTimeMs))) : 0;
  const leaderLaps = Math.max(0, ...classification.map((c) => Number(c.numLaps) || 0));

  const resultRows = [];
  const skipped = [];

  for (const c of classification) {
    const p = userByCar.get(c.carIndex);
    if (!p || !p.userId) {
      skipped.push({ carIndex: c.carIndex, name: p?.name || `car ${c.carIndex}`, reason: 'non mappato' });
      continue;
    }
    const { dnf, dnf_reason } = resultStatusToDnf(c.resultStatus);

    // Distacco dal vincitore: tempo per chi ha finito a pari giri, altrimenti
    // "+N giri" per i doppiati.
    let gap = null;
    let finish_time = null;
    if (!dnf) {
      const laps = Number(c.numLaps) || 0;
      const totalMs = Number(c.totalRaceTimeMs) || 0;
      if (Number(c.position) === 1 && totalMs > 0) {
        finish_time = msToRaceTime(totalMs);
      } else if (leaderLaps > 0 && laps < leaderLaps) {
        // Senza "+": lo antepone la UI (come per msToGap).
        const behind = leaderLaps - laps;
        gap = `${behind} ${behind > 1 ? 'giri' : 'giro'}`;
      } else if (totalMs > 0 && leaderMs > 0) {
        gap = msToGap(totalMs - leaderMs);
      }
    }

    resultRows.push({
      user_id: p.userId,
      // team_id lasciato null: persistResults usa la scuderia di lega del pilota.
      team_id: null,
      grid_position: c.gridPosition || null,
      position: dnf ? null : (c.position || null),
      // points omesso: lo ricalcola persistResults con la config della stagione.
      finish_time,
      gap,
      fastest_lap: c.carIndex === fastestCar,
      pole: p.userId === poleUserId,
      dnf,
      dnf_reason,
      penalty_seconds: Number(c.penaltiesTimeS) || 0,
      overtakes: Number(c.overtakes) || 0,
      notes: '',
      // Se il pilota è stato riconosciuto come BOT di riserva, lo segnaliamo:
      // i punti restano al titolare, ma la gara mostra che ha corso il bot.
      bot_driver: p.botDriver || '',
    });
  }

  // Qualifiche
  const poleMs = poleEntry ? Number(poleEntry.bestLapMs) || 0 : 0;
  const qualifyingRows = [];
  for (const q of qualifying) {
    const p = userByCar.get(q.carIndex);
    if (!p || !p.userId || !q.position) continue;
    const bestMs = Number(q.bestLapMs) || 0;
    qualifyingRows.push({
      user_id: p.userId,
      position: Number(q.position),
      best_time: msToLapTime(bestMs),
      gap: poleMs > 0 && bestMs > poleMs ? msToGap(bestMs - poleMs) : null,
    });
  }

  return { resultRows, qualifyingRows, skipped };
}

/**
 * Unisce righe manuali (aggiunte dall'admin per piloti registrati non rilevati
 * dal collector) alle righe costruite dalla telemetria, deduplicando per
 * user_id: una riga manuale ha la precedenza su quella catturata dello stesso
 * pilota. Ogni riga manuale deve avere almeno { user_id, position }.
 * @param {Array<object>} rows righe da telemetria
 * @param {Array<object>} manual righe manuali [{ user_id, position, ... }]
 * @returns {Array<object>}
 */
export function mergeManualRows(rows, manual) {
  if (!Array.isArray(manual) || !manual.length) return rows;
  const byUser = new Map();
  for (const r of rows) if (r.user_id) byUser.set(Number(r.user_id), r);
  for (const m of manual) {
    if (!m || !m.user_id || !m.position) continue;
    const uid = Number(m.user_id);
    byUser.set(uid, { ...byUser.get(uid), ...m, user_id: uid, position: Number(m.position) });
  }
  return [...byUser.values()];
}

/**
 * Costruisce le righe lap_times (tempo giro + settori) dal payload,
 * mappando carIndex -> utente tramite i partecipanti risolti.
 * @returns {Array<{user_id,lap,lap_time_ms,sector1_ms,sector2_ms,sector3_ms,valid}>}
 */
export function buildLapTimes(payload, resolved) {
  const userByCar = new Map(resolved.map((p) => [p.carIndex, p]));
  const out = [];
  for (const h of payload.lapHistory || []) {
    const p = userByCar.get(h.carIndex);
    if (!p || !p.userId) continue;
    for (const l of h.laps || []) {
      if (!l.lap) continue;
      out.push({
        user_id: p.userId,
        lap: l.lap,
        lap_time_ms: l.timeMs || null,
        sector1_ms: l.s1Ms || null,
        sector2_ms: l.s2Ms || null,
        sector3_ms: l.s3Ms || null,
        valid: l.valid ? 1 : 0,
      });
    }
  }
  return out;
}

/**
 * Costruisce le righe lap_traces (linea di gara del giro veloce) dal payload,
 * mappando carIndex -> utente tramite i partecipanti risolti. I punti vengono
 * serializzati in JSON (array [[x,z], ...]).
 * @returns {Array<{user_id,lap,best_lap_time_ms,points}>}
 */
export function buildLapTraces(payload, resolved) {
  const userByCar = new Map(resolved.map((p) => [p.carIndex, p]));
  const out = [];
  for (const t of payload.lapTraces || []) {
    const p = userByCar.get(t.carIndex);
    if (!p || !p.userId) continue;
    if (!Array.isArray(t.points) || !t.points.length) continue;
    out.push({
      user_id: p.userId,
      lap: t.lap ?? null,
      best_lap_time_ms: t.timeMs ?? null,
      points: JSON.stringify(t.points),
    });
  }
  return out;
}

/**
 * Anteprima non distruttiva di una sessione catturata: risolve le identità
 * e costruisce le righe che verrebbero salvate, senza scrivere nulla.
 * @param {object} capture  record di captured_sessions
 * @param {Array<object>} [overrides]  [{ carIndex, user_id }] mapping manuale
 */
export async function previewCapture(capture, overrides = []) {
  const payload = parsePayload(capture);
  const resolved = await resolveWithOverrides(payload.participants || [], overrides);
  const { resultRows, qualifyingRows, skipped } = buildRows(payload, resolved);
  return { payload, participants: resolved, resultRows, qualifyingRows, skipped };
}

/**
 * Commit di una sessione catturata nella gara indicata. Riusa persistResults
 * e persistQualifying. Marca la sessione come 'imported'.
 *
 * @param {object} capture record di captured_sessions
 * @param {object} opts
 * @param {number} opts.raceId  gara di destinazione
 * @param {Array<{carIndex:number,user_id:number}>} [opts.mappings]  override identità
 * @param {boolean} [opts.markCompleted=true]
 * @param {string}  [opts.comment]
 * @param {number|null} [opts.mvpUserId]
 * @returns {Promise<{results:Array, qualifying:number, skipped:Array}>}
 */
export async function commitCapture(capture, opts) {
  const { raceId } = opts;
  if (!raceId) throw new HttpError(400, 'race_id di destinazione obbligatorio');
  const race = await db.prepare('SELECT id FROM races WHERE id = ?').get(raceId);
  if (!race) throw new HttpError(404, 'Gara di destinazione non trovata');

  const payload = parsePayload(capture);
  const kind = sessionKind(capture.session_type || payload.sessionType);
  const resolved = await resolveWithOverrides(payload.participants || [], opts.mappings || []);

  // Telemetria (indipendente dal tipo): tempi sul giro + traiettoria del giro veloce.
  const lapRows = buildLapTimes(payload, resolved);
  const traceRows = buildLapTraces(payload, resolved);

  // ------------------------------------------------------------------
  //  RAMO QUALIFICA: scrive SOLO la griglia + telemetria di qualifica.
  //  Non tocca i risultati di gara, non marca la gara come conclusa.
  // ------------------------------------------------------------------
  if (kind === 'qualifying') {
    const { qualifyingRows } = buildRows(payload, resolved);
    // Fallback manuale: tempi di qualifica di piloti (registrati) non rilevati.
    const rows = mergeManualRows(qualifyingRows, opts.manualQualifying);
    if (!rows.length) {
      throw new HttpError(400, 'Nessun tempo di qualifica mappato: impossibile importare. Associa gli handle o aggiungi i piloti mancanti.');
    }
    const qualifying = await persistQualifying(raceId, rows);
    await persistLapTimes(raceId, lapRows, 'qualifying');
    await persistLapTraces(raceId, traceRows, 'qualifying');
    await markImported(capture.id, raceId);
    return { sessionType: 'qualifying', results: [], qualifying, lapTimes: lapRows.length, traces: traceRows.length, skipped: [] };
  }

  // ------------------------------------------------------------------
  //  RAMO GARA (default): scrive SOLO risultati + telemetria di gara.
  //  Non tocca la griglia di qualifica.
  // ------------------------------------------------------------------
  // Pole: ricavata dalla griglia di qualifica già salvata (P1), se presente.
  const poleRow = await db
    .prepare('SELECT user_id FROM qualifying WHERE race_id = ? AND position = 1')
    .get(raceId);
  const { resultRows, skipped } = buildRows(payload, resolved, { poleUserId: poleRow ? poleRow.user_id : null });

  // Fallback manuale: risultati di piloti (registrati) non rilevati dal collector.
  const rows = mergeManualRows(resultRows, opts.manualResults);
  if (!rows.length) {
    throw new HttpError(400, 'Nessun pilota mappato: impossibile importare. Associa gli handle o aggiungi i piloti mancanti.');
  }

  const results = await persistResults(raceId, rows, {
    markCompleted: opts.markCompleted !== false,
    comment: opts.comment,
    mvpUserId: opts.mvpUserId,
  });
  await persistLapTimes(raceId, lapRows, 'race');
  await persistLapTraces(raceId, traceRows, 'race');

  // Completa i metadati della gara dai dati di sessione: meteo, giri, distanza.
  await updateRaceMetaFromPayload(raceId, payload);
  await markImported(capture.id, raceId);

  return { sessionType: 'race', results, qualifying: 0, lapTimes: lapRows.length, traces: traceRows.length, skipped };
}

/** Marca una sessione catturata come importata nella gara indicata. */
function markImported(captureId, raceId) {
  return db
    .prepare("UPDATE captured_sessions SET status = 'imported', race_id = ?, imported_at = datetime('now') WHERE id = ?")
    .run(raceId, captureId);
}

/**
 * Sostituisce i tempi sul giro di una SESSIONE (gara o qualifica) in un unico
 * batch. Cancella solo i precedenti dello stesso tipo (re-import idempotente):
 * i giri dell'altra sessione dello stesso GP restano intatti.
 */
async function persistLapTimes(raceId, rows, sessionType = 'race') {
  const stmts = [{ sql: 'DELETE FROM lap_times WHERE race_id = ? AND session_type = ?', args: [raceId, sessionType] }];
  for (const r of rows) {
    stmts.push({
      sql: `INSERT INTO lap_times (race_id, user_id, session_type, lap, lap_time_ms, sector1_ms, sector2_ms, sector3_ms, valid)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [raceId, r.user_id, sessionType, r.lap, r.lap_time_ms, r.sector1_ms, r.sector2_ms, r.sector3_ms, r.valid],
    });
  }
  await db.raw.batch(stmts, 'write');
}

/**
 * Sostituisce le traiettorie di una SESSIONE (gara o qualifica) in un unico
 * batch. Cancella solo le precedenti dello stesso tipo (re-import idempotente):
 * resta al più una riga per pilota-sessione; l'altra sessione resta intatta.
 */
async function persistLapTraces(raceId, rows, sessionType = 'race') {
  const stmts = [{ sql: 'DELETE FROM lap_traces WHERE race_id = ? AND session_type = ?', args: [raceId, sessionType] }];
  for (const r of rows) {
    stmts.push({
      sql: `INSERT INTO lap_traces (race_id, user_id, session_type, lap, best_lap_time_ms, points)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [raceId, r.user_id, sessionType, r.lap, r.best_lap_time_ms, r.points],
    });
  }
  await db.raw.batch(stmts, 'write');
}

// Meteo F1 25 -> etichetta italiana coerente con quelle usate sul sito.
const WEATHER_LABEL_IT = {
  clear: 'Sereno',
  light_cloud: 'Poco nuvoloso',
  overcast: 'Nuvoloso',
  light_rain: 'Pioggia leggera',
  heavy_rain: 'Pioggia intensa',
  storm: 'Tempesta',
};

/**
 * Aggiorna meteo/giri/distanza della gara dai dati telemetria, senza
 * toccare i campi non ricavabili (nome, data, MVP, cronaca). Scrive solo i
 * valori effettivamente disponibili.
 */
async function updateRaceMetaFromPayload(raceId, payload) {
  const sets = [];
  const args = [];

  const weather = WEATHER_LABEL_IT[payload.weather];
  if (weather) { sets.push('weather = ?'); args.push(weather); }

  const laps = Number(payload.totalLaps);
  if (laps > 0) { sets.push('laps = ?'); args.push(laps); }

  // distanza gara = lunghezza tracciato (m -> km) * giri
  const trackKm = Number(payload.trackLength) / 1000;
  if (trackKm > 0 && laps > 0) {
    sets.push('distance_km = ?');
    args.push(Math.round(trackKm * laps * 10) / 10);
  }

  if (!sets.length) return;
  args.push(raceId);
  await db.prepare(`UPDATE races SET ${sets.join(', ')} WHERE id = ?`).run(...args);
}

/* ---------------------------- interni ---------------------------- */

/** Deserializza il payload JSON della sessione (con errore chiaro se corrotto). */
function parsePayload(capture) {
  try {
    return typeof capture.payload_json === 'string'
      ? JSON.parse(capture.payload_json)
      : capture.payload_json;
  } catch {
    throw new HttpError(422, 'Payload della sessione non è JSON valido');
  }
}

/** Risolve le identità e applica gli override manuali (carIndex → user_id). */
async function resolveWithOverrides(participants, overrides) {
  const resolved = await resolveIdentities(participants);
  if (overrides && overrides.length) {
    const byCar = new Map(overrides.filter((o) => o && o.user_id).map((o) => [o.carIndex, Number(o.user_id)]));
    for (const p of resolved) {
      if (byCar.has(p.carIndex)) {
        p.userId = byCar.get(p.carIndex);
        p.matchedBy = 'inline';
      }
    }
  }
  return resolved;
}
