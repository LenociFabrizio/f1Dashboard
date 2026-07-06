/* =============================================================
   f1data.js — Dati statici F1 2025 condivisi (line-up scuderie).
   Usato da: registrazione utente e area admin.
   ============================================================= */

/** Piloti reali stagione F1 2025 per scuderia (chiave = nome team, come nel seed). */
export const F1_2025_LINEUPS = {
  'Red Bull Racing': ['Max Verstappen', 'Liam Lawson'],
  'Ferrari': ['Charles Leclerc', 'Lewis Hamilton'],
  'Mercedes': ['George Russell', 'Andrea Kimi Antonelli'],
  'McLaren': ['Lando Norris', 'Oscar Piastri'],
  'Aston Martin': ['Fernando Alonso', 'Lance Stroll'],
  'Alpine': ['Pierre Gasly', 'Jack Doohan'],
  'Williams': ['Alexander Albon', 'Carlos Sainz'],
  'RB': ['Yuki Tsunoda', 'Isack Hadjar'],
  'Kick Sauber': ['Nico Hülkenberg', 'Gabriel Bortoleto'],
  'Haas': ['Esteban Ocon', 'Oliver Bearman'],
};

/** Piloti disponibili per un nome team (array eventualmente vuoto). */
export const driversForTeamName = (name) => F1_2025_LINEUPS[name] || [];
