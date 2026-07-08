/**
 * parser/enums.js
 * ------------------------------------------------------------
 * Traduzione degli enum del protocollo UDP F1 25 in stringhe leggibili,
 * così che il resto del collector (e il backend) non debba conoscere i
 * codici numerici.
 *
 * ⚠️ VALIDARE i valori con la specifica ufficiale F1 25 (Appendix).
 * I valori qui sotto sono quelli di F1 23/24 (in gran parte invariati).
 * ------------------------------------------------------------
 */

// --- m_sessionType --------------------------------------------------
// Raggruppa i molti sottotipi (P1/P2/Q1/Q2/…) nelle categorie che
// interessano al sito: practice | qualifying | sprint | race | time_trial.
export const SESSION_TYPE = {
  0: 'unknown',
  1: 'practice', 2: 'practice', 3: 'practice', 4: 'practice', // P1/P2/P3/Short P
  5: 'qualifying', 6: 'qualifying', 7: 'qualifying', 8: 'qualifying', 9: 'qualifying', // Q1/Q2/Q3/Short Q/OSQ
  10: 'qualifying', 11: 'qualifying', 12: 'qualifying', 13: 'qualifying', 14: 'qualifying', // Sprint Shootout (SQ1/SQ2/SQ3/Short SQ/OSSQ)
  15: 'race', 16: 'race', 17: 'race', // Race / Race 2 / Race 3 (Sprint usa questi in weekend sprint)
  18: 'time_trial',
};

/** Normalizza m_sessionType (numero) → categoria stringa. */
export function normalizeSessionType(type) {
  if (type === null || type === undefined) return 'unknown';
  return SESSION_TYPE[Number(type)] || 'unknown';
}

// --- m_weather ------------------------------------------------------
export const WEATHER = {
  0: 'clear',
  1: 'light_cloud',
  2: 'overcast',
  3: 'light_rain',
  4: 'heavy_rain',
  5: 'storm',
};
export function weatherName(w) {
  return WEATHER[Number(w)] || null;
}

// --- m_platform -----------------------------------------------------
export const PLATFORM = {
  1: 'steam',
  3: 'playstation',
  4: 'xbox',
  6: 'origin',
  255: 'unknown',
};
export function platformName(p) {
  return PLATFORM[Number(p)] || 'unknown';
}

// --- m_resultStatus -------------------------------------------------
export const RESULT_STATUS = {
  0: 'invalid',
  1: 'inactive',
  2: 'active',
  3: 'finished',
  4: 'dnf',
  5: 'dsq',
  6: 'not_classified',
  7: 'retired',
};
export function resultStatusName(s) {
  return RESULT_STATUS[Number(s)] || 'finished';
}

// --- m_visualTyreCompound ------------------------------------------
// (visual compound: le mescole "logiche" mostrate a schermo)
export const TYRE_COMPOUND = {
  16: 'soft',
  17: 'medium',
  18: 'hard',
  7: 'inter',
  8: 'wet',
  // Classic/F2 (19-22, 9-11, 12-15) omessi: non usati nel campionato.
};
export function tyreCompoundName(c) {
  return TYRE_COMPOUND[Number(c)] || String(c ?? '');
}
