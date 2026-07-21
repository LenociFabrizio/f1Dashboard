/**
 * session/builder.js
 * ------------------------------------------------------------
 * Trasforma lo stato aggregato di una sessione nel JSON compatto
 * (il "contratto") atteso dall'endpoint di ingest del sito.
 *
 * Solo dati AGGREGATI e utili all'import: nessuna telemetria grezza ad
 * alta frequenza. Anche la traiettoria (lapTraces) è aggregata — solo il
 * giro veloce di ogni pilota, con punti decimati (~6 m). Le mescole/tipi
 * vengono normalizzati in stringhe via parser/enums.js così il backend non
 * deve conoscere il protocollo.
 * ------------------------------------------------------------
 */
import {
  normalizeSessionType,
  weatherName,
  platformName,
  resultStatusName,
  tyreCompoundName,
} from '../parser/enums.js';

/**
 * Uno slot Participants è "reale" (vettura presente in sessione) se ha un nome,
 * un networkId (giocatore online) o è pilotato dall'IA. Gli slot inutilizzati
 * dell'array a 22 posizioni hanno nome '' e networkId 0 → esclusi.
 * Esportata anche per l'aggregatore (merge dei pacchetti Participants nel tempo).
 * @param {object} p slot ParticipantData parsato
 */
export function isRealParticipant(p) {
  if (!p) return false;
  const hasName = !!(p.name && String(p.name).trim());
  return hasName || Number(p.networkId) > 0 || !!p.aiControlled;
}

/**
 * Una entry della Final Classification è "reale" (vettura classificata) se ha
 * una posizione o dei giri, oppure un resultStatus di partecipazione. Gli slot
 * vuoti hanno position 0, numLaps 0 e resultStatus 0/1 (invalid/inactive).
 * @param {object} c entry FinalClassificationData parsata
 */
function isRealClassification(c) {
  if (!c) return false;
  return Number(c.position) > 0 || Number(c.numLaps) > 0 ||
    (c.resultStatus != null && c.resultStatus > 1);
}

/**
 * @param {object} state stato di SessionAggregator
 * @param {{collectorVersion?:string}} [opts]
 * @returns {object} payload di sessione pronto per l'ingest
 */
export function buildPayload(state, { collectorVersion = '' } = {}) {
  const meta = state.meta || {};
  const overtakes = state.overtakes || {};
  const history = state.history || {};
  const traces = state.traces || {};

  const sessionType = normalizeSessionType(meta.sessionType);
  const isQualifying = sessionType === 'qualifying';
  const player = state.playerCarIndex ?? null;

  // --- Identità piloti: unione ACCUMULATA nel tempo (merge di tutti i
  //     pacchetti Participants ricevuti) con fallback all'ultimo pacchetto
  //     grezzo. Evita di perdere piloti se l'ultimo Participants prima della
  //     Final Classification è incompleto (causa del bug "17 su 20"). ---
  const idByCar = new Map();
  const merged = state.participantsByCar || {};
  for (const [k, p] of Object.entries(merged)) idByCar.set(Number(k), p);
  const rawParts = state.participants?.participants || [];
  rawParts.forEach((p, i) => { if (!idByCar.has(i) && isRealParticipant(p)) idByCar.set(i, p); });

  // --- Classifica: solo entry reali, mantenendo il carIndex EFFETTIVO
  //     (indice nell'array). Nessuno slice per conteggio: in lobby online gli
  //     slot possono essere non contigui e numCars sottostimare i presenti. ---
  const classRaw = state.classification?.cars || [];
  const classByCar = new Map();
  classRaw.forEach((c, i) => { if (isRealClassification(c)) classByCar.set(i, c); });

  // Vetture da esportare = unione tra identità note e vetture classificate.
  // Così una vettura classificata ha sempre un partecipante corrispondente
  // (join per carIndex lato server) anche se l'ultimo Participants la ometteva.
  const carIndexes = [...new Set([...idByCar.keys(), ...classByCar.keys()])].sort((a, b) => a - b);

  const participantsOut = carIndexes.map((i) => {
    const p = idByCar.get(i) || {};
    return {
      carIndex: i,
      name: p.name || '',
      platform: platformName(p.platform),
      raceNumber: p.raceNumber ?? null,
      teamId: p.teamId ?? null,
      aiControlled: !!p.aiControlled,
      // 0 = nomi online nascosti: `name` è inaffidabile (spesso "Player").
      // Lo passiamo al sito così l'admin sa quando non fidarsi del nickname.
      nameReliable: p.showOnlineNames === undefined ? true : !!p.showOnlineNames,
      // Vettura del giocatore che registra: segnalata al sito per il match.
      isPlayer: i === player,
    };
  });

  // Classifica finale (solo le vetture realmente classificate)
  const classificationOut = [...classByCar.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([i, c]) => ({
      carIndex: i,
      position: c.position ?? null,
      gridPosition: c.gridPosition ?? null,
      numLaps: c.numLaps ?? null,
      points: c.points ?? null,
      numPitStops: c.numPitStops ?? null,
      resultStatus: resultStatusName(c.resultStatus),
      bestLapMs: c.bestLapTimeInMS ?? null,
      // m_totalRaceTime è in SECONDI (double) → ms
      totalRaceTimeMs: c.totalRaceTime != null ? Math.round(c.totalRaceTime * 1000) : null,
      penaltiesTimeS: c.penaltiesTime ?? 0,
      overtakes: overtakes[i] || 0,
      tyreStints: Array.isArray(c.tyreStintsVisual)
        ? c.tyreStintsVisual.slice(0, c.numTyreStints ?? 0).map(tyreCompoundName)
        : [],
    }));

  // Qualifica: derivata dalla classifica finale della sessione di qualifica.
  const qualifyingOut = isQualifying
    ? classificationOut
        .filter((c) => c.position && c.bestLapMs)
        .map((c) => ({ carIndex: c.carIndex, position: c.position, bestLapMs: c.bestLapMs }))
    : [];

  // Cronologia giri per vettura (tempi giro + settori). Solo giri completati
  // (lapTimeMs > 0): l'ultimo giro "in corso" ha tempo 0 e viene escluso.
  const lapHistoryOut = Object.values(history).map((h) => ({
    carIndex: h.carIdx,
    bestLapNum: h.bestLapTimeLapNum || null,
    laps: (h.laps || [])
      .filter((l) => l.lapTimeMs > 0)
      .map((l) => ({ lap: l.lap, timeMs: l.lapTimeMs, s1Ms: l.s1Ms, s2Ms: l.s2Ms, s3Ms: l.s3Ms, valid: l.valid })),
  })).filter((h) => h.laps.length);

  // Traiettoria del solo giro veloce di ogni pilota (punti [x,z] decimati).
  const lapTracesOut = Object.entries(traces)
    .map(([carIndex, t]) => t.best && {
      carIndex: Number(carIndex),
      lap: t.best.lap,
      timeMs: t.best.timeMs,
      points: t.best.points,
    })
    .filter(Boolean);

  return {
    sessionUID: state.sessionUID,
    packetFormat: state.packetFormat ?? null,
    collectorVersion,
    sessionType,
    playerCarIndex: player,
    trackId: meta.trackId ?? null,
    trackLength: meta.trackLength ?? null,
    totalLaps: meta.totalLaps ?? null,
    weather: weatherName(meta.weather),
    safetyCarPeriods: meta.numSafetyCarPeriods ?? null,
    fastestLapCarIndex: state.fastestLapCarIndex,
    participants: participantsOut,
    qualifying: qualifyingOut,
    classification: classificationOut,
    lapHistory: lapHistoryOut,
    lapTraces: lapTracesOut,
  };
}

export default buildPayload;
