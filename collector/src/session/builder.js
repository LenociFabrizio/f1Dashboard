/**
 * session/builder.js
 * ------------------------------------------------------------
 * Trasforma lo stato aggregato di una sessione nel JSON compatto
 * (il "contratto") atteso dall'endpoint di ingest del sito.
 *
 * Solo dati AGGREGATI e utili all'import: nessuna telemetria grezza ad
 * alta frequenza. Le mescole/tipi vengono normalizzati in stringhe via
 * parser/enums.js così il backend non deve conoscere il protocollo.
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

  return {
    sessionUID: state.sessionUID,
    packetFormat: state.packetFormat ?? null,
    collectorVersion,
    sessionType,
    trackId: meta.trackId ?? null,
    totalLaps: meta.totalLaps ?? null,
    weather: weatherName(meta.weather),
    safetyCarPeriods: meta.numSafetyCarPeriods ?? null,
    fastestLapCarIndex: state.fastestLapCarIndex,
    participants: participantsOut,
    qualifying: qualifyingOut,
    classification: classificationOut,
  };
}

export default buildPayload;
