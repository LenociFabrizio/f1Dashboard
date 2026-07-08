/**
 * f1-mappings.js
 * ------------------------------------------------------------
 * Tabelle di conversione dal protocollo UDP F1 25 (Codemasters/EA)
 * verso il dominio del sito, + piccoli helper di formattazione.
 *
 * Il collector invia già valori NORMALIZZATI (stringhe) dove possibile,
 * ma queste funzioni accettano anche i codici numerici grezzi del
 * protocollo per robustezza (es. se una versione futura del collector
 * inoltra i valori raw).
 *
 * Riferimento: F1 24/25 UDP Specification (packet format 2024/2025).
 * NB: gli offset dei byte NON sono qui — la decodifica dei pacchetti
 * avviene nel collector. Qui trattiamo solo enum/semantica.
 * ------------------------------------------------------------
 */

// ------------------------------------------------------------
//  RESULT STATUS (FinalClassificationData / LapData.m_resultStatus)
//  0 invalid · 1 inactive · 2 active · 3 finished · 4 DNF
//  5 disqualified (DSQ) · 6 not classified · 7 retired
// ------------------------------------------------------------
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

// Stati che equivalgono a "non ha concluso la gara" nel dominio del sito.
const DNF_KEYS = new Set(['dnf', 'dsq', 'retired', 'not_classified']);

// Motivo DNF leggibile (precompila la nota nel pannello admin).
const DNF_REASON = {
  dnf: 'Ritirato (DNF)',
  dsq: 'Squalificato (DSQ)',
  retired: 'Ritirato',
  not_classified: 'Non classificato',
};

/**
 * Normalizza un resultStatus (stringa o codice numerico) a una chiave nota.
 * @param {string|number} status
 * @returns {string} chiave normalizzata (default 'finished')
 */
export function normalizeResultStatus(status) {
  if (typeof status === 'number') return RESULT_STATUS[status] || 'finished';
  const s = String(status || '').toLowerCase().trim();
  return s || 'finished';
}

/**
 * Traduce un resultStatus in { dnf, dnf_reason } per la tabella `results`.
 * @param {string|number} status
 */
export function resultStatusToDnf(status) {
  const key = normalizeResultStatus(status);
  const dnf = DNF_KEYS.has(key);
  return { dnf: dnf ? 1 : 0, dnf_reason: dnf ? (DNF_REASON[key] || 'Ritirato') : '' };
}

// ------------------------------------------------------------
//  TEAM ID (Participants.m_teamId) → nome canonico del team.
//  Solo scuderie 2024/2025 attuali: usato come RIFERIMENTO/suggerimento.
//  L'assegnazione ufficiale del team resta la scuderia di lega
//  dell'utente (users.team_id); questo serve a mostrare/derivare un
//  suggerimento, non a decidere.
// ------------------------------------------------------------
export const TEAM_ID_TO_NAME = {
  0: 'Mercedes',
  1: 'Ferrari',
  2: 'Red Bull Racing',
  3: 'Williams',
  4: 'Aston Martin',
  5: 'Alpine',
  6: 'RB',            // Visa Cash App RB (ex AlphaTauri)
  7: 'Haas',
  8: 'McLaren',
  9: 'Kick Sauber',   // ex Alfa Romeo / Sauber
};

/**
 * Trova l'id del team del sito che meglio corrisponde a un m_teamId F1
 * o a un nome team. Match per uguaglianza (case-insensitive) o inclusione
 * del nome. Best-effort: ritorna null se nessuna corrispondenza.
 * @param {Array<{id:number,name:string}>} teams elenco team del sito
 * @param {number|string} teamRef m_teamId oppure nome
 * @returns {number|null}
 */
export function matchTeamId(teams, teamRef) {
  if (teamRef === null || teamRef === undefined) return null;
  const targetName =
    typeof teamRef === 'number' ? TEAM_ID_TO_NAME[teamRef] : String(teamRef);
  if (!targetName) return null;
  const norm = (s) => String(s || '').toLowerCase().trim();
  const t = norm(targetName);
  const exact = teams.find((x) => norm(x.name) === t);
  if (exact) return exact.id;
  const partial = teams.find((x) => norm(x.name).includes(t) || t.includes(norm(x.name)));
  return partial ? partial.id : null;
}

// ------------------------------------------------------------
//  TRACK ID (header.m_trackId) → parole chiave per riconoscere il
//  circuito nel DB (name/city/country). Best-effort, solo suggerimento:
//  la gara di destinazione la sceglie comunque l'admin.
// ------------------------------------------------------------
export const TRACK_ID_KEYWORDS = {
  0: ['melbourne', 'albert park'],
  2: ['shanghai'],
  3: ['sakhir', 'bahrain'],
  4: ['barcelona', 'barcellona', 'catalunya'],
  5: ['monaco', 'monte carlo'],
  6: ['montreal', 'villeneuve'],
  7: ['silverstone'],
  9: ['hungaroring', 'budapest'],
  10: ['spa'],
  11: ['monza'],
  12: ['marina bay', 'singapore'],
  13: ['suzuka'],
  14: ['yas marina', 'abu dhabi'],
  15: ['austin', 'cota'],
  16: ['interlagos', 'brasile', 'brazil'],
  17: ['red bull ring', 'spielberg'],
  19: ['mexico', 'messico'],
  20: ['baku'],
  26: ['zandvoort'],
  27: ['imola'],
  29: ['jeddah'],
  30: ['miami'],
  31: ['las vegas'],
  32: ['lusail', 'qatar'],
};

/**
 * Suggerisce l'id circuito del sito a partire da un m_trackId F1.
 * @param {Array<{id:number,name:string,city:string,country:string}>} circuits
 * @param {number} trackId
 * @returns {number|null}
 */
export function suggestCircuitId(circuits, trackId) {
  const kws = TRACK_ID_KEYWORDS[trackId];
  if (!kws) return null;
  const match = circuits.find((c) => {
    const hay = `${c.name || ''} ${c.city || ''} ${c.country || ''}`.toLowerCase();
    return kws.some((kw) => hay.includes(kw));
  });
  return match ? match.id : null;
}

// ------------------------------------------------------------
//  Formattazione tempi (i tempi UDP sono in millisecondi)
// ------------------------------------------------------------

/**
 * Millisecondi → tempo sul giro "m:ss.mmm" (es. 81345 → "1:21.345").
 * @param {number} ms
 * @returns {string|null}
 */
export function msToLapTime(ms) {
  const n = Number(ms);
  if (!n || n <= 0 || !Number.isFinite(n)) return null;
  const minutes = Math.floor(n / 60000);
  const seconds = Math.floor((n % 60000) / 1000);
  const millis = Math.floor(n % 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

/**
 * Millisecondi → tempo gara "h:mm:ss.mmm" (l'ora è omessa se 0).
 * @param {number} ms
 * @returns {string|null}
 */
export function msToRaceTime(ms) {
  const n = Number(ms);
  if (!n || n <= 0 || !Number.isFinite(n)) return null;
  const hours = Math.floor(n / 3600000);
  const minutes = Math.floor((n % 3600000) / 60000);
  const seconds = Math.floor((n % 60000) / 1000);
  const millis = Math.floor(n % 1000);
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const mmm = String(millis).padStart(3, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}.${mmm}` : `${minutes}:${ss}.${mmm}`;
}

/**
 * Distacco dal vincitore in "s.mmm" (o "m:ss.mmm" se ≥ 60s).
 * NB: il segno "+" NON è incluso: lo antepone la UI in fase di
 * visualizzazione (come per i gap inseriti a mano), così si evita il "++".
 * @param {number} deltaMs distacco in ms (già calcolato: tempo pilota - vincitore)
 */
export function msToGap(deltaMs) {
  const n = Number(deltaMs);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 60000) return `${(n / 1000).toFixed(3)}`;
  const minutes = Math.floor(n / 60000);
  const seconds = ((n % 60000) / 1000).toFixed(3);
  return `${minutes}:${String(seconds).padStart(6, '0')}`;
}
