/**
 * constants.js
 * ------------------------------------------------------------
 * Costanti condivise del dominio F1.
 * ------------------------------------------------------------
 */

// Sistema punti ufficiale F1 (top 10) — modificabile in futuro per stagione.
export const POINTS_SYSTEM = {
  1: 25, 2: 18, 3: 15, 4: 12, 5: 10,
  6: 8, 7: 6, 8: 4, 9: 2, 10: 1,
};

// Punto bonus per il giro veloce (se in top 10)
export const FASTEST_LAP_POINT = 1;

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
 */
export function calculatePoints(position, fastestLap = false, dnf = false, opts = {}) {
  const {
    pole = false,
    pointsFastestLap = FASTEST_LAP_POINT,
    pointsPole = 0,
  } = opts;

  let pts = 0;
  // Punti gara (solo se ha concluso e ha una posizione a punti)
  if (!dnf && position) pts += POINTS_SYSTEM[position] || 0;
  // Bonus giro veloce: solo se in top 10 (regola F1) e se abilitato
  if (fastestLap && position && position <= 10) pts += Number(pointsFastestLap) || 0;
  // Bonus pole: assegnato per la qualifica, indipendente dal risultato in gara
  if (pole) pts += Number(pointsPole) || 0;
  return pts;
}
