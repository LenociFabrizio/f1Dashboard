/**
 * constants.js
 * ------------------------------------------------------------
 * Costanti condivise del dominio F1.
 * ------------------------------------------------------------
 */

/**
 * Schemi di punteggio selezionabili dall'admin per ogni stagione.
 * `table` mappa posizione → punti; le posizioni assenti non danno punti.
 */
export const POINTS_SCHEMES = {
  official: {
    label: 'Ufficiale F1',
    summary: '25-18-15-12-10-8-6-4-2-1',
    table: {
      1: 25, 2: 18, 3: 15, 4: 12, 5: 10,
      6: 8, 7: 6, 8: 4, 9: 2, 10: 1,
    },
  },
  linear10: {
    label: 'Lineare top 10',
    summary: '10-9-8-7-6-5-4-3-2-1',
    table: {
      1: 10, 2: 9, 3: 8, 4: 7, 5: 6,
      6: 5, 7: 4, 8: 3, 9: 2, 10: 1,
    },
  },
};

export const DEFAULT_POINTS_SCHEME = 'official';

// Sistema punti ufficiale F1 (top 10) — alias storico dello schema 'official'.
export const POINTS_SYSTEM = POINTS_SCHEMES.official.table;

// Punto bonus per il giro veloce (se in zona punti)
export const FASTEST_LAP_POINT = 1;

/**
 * Tabella punti di uno schema, con fallback allo schema ufficiale se il nome
 * non è riconosciuto (es. valore vecchio o nullo nel DB).
 * @param {string} [scheme]
 */
export function pointsTableFor(scheme) {
  return (POINTS_SCHEMES[scheme] || POINTS_SCHEMES[DEFAULT_POINTS_SCHEME]).table;
}

export const ROLES = {
  ADMIN: 'admin',
  PILOTA: 'pilota',
};

export const RACE_STATUS = {
  SCHEDULED: 'scheduled',
  COMPLETED: 'completed',
};

export const PROVIDERS = {
  LOCAL: 'local',
  PSN: 'psn',
  EA: 'ea',
};

/**
 * Calcola i punti dati posizione, giro veloce e pole.
 * @param {number|null} position posizione finale (null/DNF => 0 punti gara)
 * @param {boolean} fastestLap
 * @param {boolean} dnf
 * @param {object} [opts] configurazione punti della stagione
 * @param {boolean} [opts.pole=false]         il pilota è partito in pole
 * @param {number}  [opts.pointsFastestLap=1] punti per il giro veloce (0 = disattivato)
 * @param {number}  [opts.pointsPole=0]       punti per la pole position (0 = disattivato)
 * @param {string}  [opts.scheme='official']  schema punti (vedi POINTS_SCHEMES)
 */
export function calculatePoints(position, fastestLap = false, dnf = false, opts = {}) {
  const {
    pole = false,
    pointsFastestLap = FASTEST_LAP_POINT,
    pointsPole = 0,
    scheme = DEFAULT_POINTS_SCHEME,
  } = opts;

  const table = pointsTableFor(scheme);

  let pts = 0;
  // Punti gara (solo se ha concluso e ha una posizione a punti)
  if (!dnf && position) pts += table[position] || 0;
  // Bonus giro veloce: solo se in zona punti (regola F1) e se abilitato
  if (fastestLap && position && table[position] != null) pts += Number(pointsFastestLap) || 0;
  // Bonus pole: assegnato per la qualifica, indipendente dal risultato in gara
  if (pole) pts += Number(pointsPole) || 0;
  return pts;
}
