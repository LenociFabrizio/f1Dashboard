/**
 * store/buffer-store.js
 * ------------------------------------------------------------
 * Coda persistente su disco delle sessioni pronte per l'invio.
 * Ogni sessione è un file JSON nella cartella di buffer: sopravvive a
 * crash del collector e ad assenza temporanea di rete. L'uploader la
 * consuma e la rimuove solo dopo un invio andato a buon fine.
 *
 * Il nome file usa il sessionUID → invii ripetuti della stessa sessione
 * sovrascrivono lo stesso file (niente duplicati in coda).
 *
 * Formato file (envelope v2): { v:2, token, payload }. Il `token` è quello con
 * cui la sessione va inviata (dipende dalla modalità attiva alla cattura), così
 * un riavvio in una modalità diversa non instrada male una sessione già in
 * coda. I file legacy (solo payload, senza `v`) restano leggibili.
 * ------------------------------------------------------------
 */
import fs from 'node:fs';
import path from 'node:path';

export class BufferStore {
  /** @param {string} dir cartella della coda */
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(this.dir, { recursive: true });
  }

  /** Nome file sicuro a partire dal sessionUID. */
  fileFor(sessionUid) {
    const safe = String(sessionUid).replace(/[^0-9a-zA-Z_-]/g, '_');
    return path.join(this.dir, `session-${safe}.json`);
  }

  /**
   * Accoda (o aggiorna) una sessione, con il token con cui va inviata.
   * @param {object} payload  payload di sessione
   * @param {{token?:string|null}} [meta]  token da usare in invio (modalità attiva)
   * @returns {string} path del file
   */
  enqueue(payload, meta = {}) {
    const file = this.fileFor(payload.sessionUID);
    const envelope = { v: 2, token: meta.token ?? null, payload };
    fs.writeFileSync(file, JSON.stringify(envelope), 'utf-8');
    return file;
  }

  /** Elenca i file in coda (ordinati per data di modifica crescente). */
  list() {
    if (!fs.existsSync(this.dir)) return [];
    return fs
      .readdirSync(this.dir)
      .filter((f) => f.startsWith('session-') && f.endsWith('.json'))
      .map((f) => path.join(this.dir, f))
      .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
  }

  /** Legge e deserializza un file di coda (null se corrotto). */
  read(file) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * Legge un file di coda come { token, payload }, gestendo sia l'envelope v2
   * sia i file legacy (solo payload). @returns {{token:string|null, payload:object}|null}
   */
  readEntry(file) {
    const raw = this.read(file);
    if (!raw || typeof raw !== 'object') return null;
    // Envelope v2: { v, token, payload }
    if (raw.v && raw.payload && typeof raw.payload === 'object') {
      return { token: raw.token ?? null, payload: raw.payload };
    }
    // Legacy: il file è direttamente il payload.
    return { token: null, payload: raw };
  }

  /** Rimuove un file dalla coda (dopo invio riuscito). */
  remove(file) {
    try {
      fs.unlinkSync(file);
    } catch {
      /* già rimosso */
    }
  }

  get size() {
    return this.list().length;
  }
}

export default BufferStore;
