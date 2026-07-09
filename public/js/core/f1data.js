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

/* =============================================================
   Assetti consigliati — link a simracingsetup.com (F1 25).
   Lo slug del GP è in inglese; per le nazioni con più GP (Italia:
   Imola/Monza; USA: Miami/Austin/Las Vegas) si distingue dal circuito.
   ============================================================= */
const SETUP_BASE = 'https://simracingsetup.com/setups/f1-25/';

/** GP unico per nazione: country_code → slug (senza suffisso "-setups"). */
const SETUP_SLUG_BY_CC = {
  AU: 'australian-gp', CN: 'china-gp', JP: 'japanese-gp', BH: 'bahrain-gp',
  SA: 'saudi-arabian-gp', MC: 'monaco-gp', ES: 'spanish-gp', CA: 'canadian-gp',
  AT: 'austrian-gp', GB: 'british-gp', BE: 'belgium-gp', HU: 'hungarian-gp',
  NL: 'netherlands-gp', AZ: 'azerbaijan-gp', SG: 'singapore-gp', MX: 'mexican-gp',
  BR: 'brazilian-gp', QA: 'qatar-gp', AE: 'abu-dhabi-gp',
};

/** Ricava lo slug del GP dal record gara (circuito/nome + country_code). */
function setupSlug(race) {
  const hay = `${race?.circuit_name || ''} ${race?.name || ''}`.toLowerCase();
  // Nazioni con più GP: si distinguono dal circuito/nome.
  if (/imola|emilia/.test(hay)) return 'imola-gp';
  if (/monza|italia/.test(hay)) return 'italian-gp';
  if (/miami/.test(hay)) return 'miami-gp';
  if (/vegas/.test(hay)) return 'las-vegas-gp';
  if (/austin|americas|stati uniti|united states|texas/.test(hay)) return 'united-states-gp';
  return SETUP_SLUG_BY_CC[String(race?.country_code || '').toUpperCase()] || null;
}

/** URL della pagina assetti per una gara, o null se il GP non è mappato. */
export function setupUrlForRace(race) {
  const slug = setupSlug(race);
  return slug ? `${SETUP_BASE}${slug}-setups/` : null;
}
