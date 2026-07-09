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
 * @param {object} state stato di SessionAggregator
 * @param {{collectorVersion?:string}} [opts]
 * @returns {object} payload di sessione pronto per l'ingest
 */
export function buildPayload(state, { collectorVersion = '' } = {}) {
  const meta = state.meta || {};
  const participants = state.participants?.participants || [];
  const numActive = state.participants?.numActiveCars ?? participants.length;
  const classification = state.classification?.cars || [];
  const numCars = state.classification?.numCars ?? classification.length;
  const overtakes = state.overtakes || {};
  const history = state.history || {};
  const traces = state.traces || {};

  const sessionType = normalizeSessionType(meta.sessionType);
  const isQualifying = sessionType === 'qualifying';

  // Partecipanti (solo le vetture attive)
  const participantsOut = participants.slice(0, numActive).map((p, i) => ({
    carIndex: i,
    name: p.name || '',
    platform: platformName(p.platform),
    raceNumber: p.raceNumber ?? null,
    teamId: p.teamId ?? null,
    aiControlled: !!p.aiControlled,
    // 0 = nomi online nascosti: `name` è inaffidabile (spesso "Player").
    // Lo passiamo al sito così l'admin sa quando non fidarsi del nickname.
    nameReliable: p.showOnlineNames === undefined ? true : !!p.showOnlineNames,
  }));

  // Classifica finale (solo le vetture classificate)
  const classificationOut = classification.slice(0, numCars).map((c, i) => ({
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
