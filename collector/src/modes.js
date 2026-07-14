/**
 * modes.js
 * ------------------------------------------------------------
 * Modalità di cattura del collector, scelte dall'utente all'avvio.
 *
 * Ogni modalità decide DUE cose:
 *   - `tokenKind`: quale token usare per l'invio → quale ramo lato server
 *       'personal' → users.personal_token → import automatico in "I miei tempi";
 *       'league'   → token condiviso della lega → staging admin (risultati+quali).
 *   - `capture`:   quali tipi di sessione (normalizzati, vedi parser/enums.js)
 *       vengono catturati e inviati; gli altri vengono ignorati.
 *
 * "Gara per il campionato" cattura sia `qualifying` sia `race`: in F1 25 sono
 * due sessioni distinte, quindi partono come due invii separati che l'admin
 * unisce nella stessa gara sul sito.
 * ------------------------------------------------------------
 */
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

/** @typedef {{label:string, tokenKind:'personal'|'league', capture:string[], dest:string}} Mode */

/** Tabella delle modalità. L'ordine è quello mostrato nel menu (1..N). */
export const MODES = {
  amichevole: {
    label: 'Gara amichevole',
    tokenKind: 'personal',
    capture: ['race'],
    dest: '"I miei tempi" (solo tempi sul giro)',
  },
  time_trial: {
    label: 'Tempo sul giro (prova a tempo)',
    tokenKind: 'personal',
    capture: ['time_trial'],
    dest: '"I miei tempi" (solo tempi sul giro)',
  },
  campionato: {
    label: 'Gara per il campionato principale (qualifica + gara)',
    tokenKind: 'league',
    capture: ['qualifying', 'race'],
    dest: 'staging admin (risultati + qualifiche)',
  },
};

/** Ordine stabile delle chiavi, usato dal menu e dall'indice numerico. */
export const MODE_KEYS = Object.keys(MODES);

/**
 * Risolve il token da usare per una modalità, leggendolo dal config.
 * @param {string} modeKey  chiave di MODES
 * @param {object} cfg      config caricata (loadConfig)
 * @returns {string} token (stringa vuota se non configurato)
 */
export function resolveToken(modeKey, cfg) {
  const mode = MODES[modeKey];
  if (!mode) return '';
  return mode.tokenKind === 'personal'
    ? cfg.server.personalToken || ''
    : cfg.server.collectorToken || '';
}

/**
 * Chiede all'utente quale modalità usare.
 * - Se `COLLECTOR_MODE` è una chiave valida, salta il prompt (uso headless).
 * - Altrimenti mostra il menu numerato e legge la scelta da stdin.
 * @param {object} cfg
 * @returns {Promise<string>} chiave di MODES scelta
 */
export async function promptMode(cfg) {
  const fromEnv = String(process.env.COLLECTOR_MODE || '').trim();
  if (fromEnv && MODES[fromEnv]) return fromEnv;

  const rl = readline.createInterface({ input, output });
  try {
    console.log('');
    console.log('Che tipo di sessione vuoi registrare?');
    MODE_KEYS.forEach((key, i) => {
      console.log(`  ${i + 1}) ${MODES[key].label}  →  ${MODES[key].dest}`);
    });
    console.log('');

    for (;;) {
      const answer = (await rl.question(`Scelta [1-${MODE_KEYS.length}]: `)).trim();
      const idx = Number(answer);
      if (Number.isInteger(idx) && idx >= 1 && idx <= MODE_KEYS.length) {
        return MODE_KEYS[idx - 1];
      }
      // Accetta anche la chiave testuale (es. "campionato").
      if (MODES[answer]) return answer;
      console.log(`Scelta non valida: digita un numero da 1 a ${MODE_KEYS.length}.`);
    }
  } finally {
    rl.close();
  }
}
