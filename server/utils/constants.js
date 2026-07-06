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
 * Calcola i punti base dati posizione + giro veloce.
 * @param {number|null} position posizione finale (null/DNF => 0)
 * @param {boolean} fastestLap
 * @param {boolean} dnf
 */
export function calculatePoints(position, fastestLap = false, dnf = false) {
  if (dnf || !position) return 0;
  let pts = POINTS_SYSTEM[position] || 0;
  // Il punto del giro veloce vale solo se il pilota è in top 10
  if (fastestLap && position <= 10) pts += FASTEST_LAP_POINT;
  return pts;
}
