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

  /** Accoda (o aggiorna) una sessione. @returns {string} path del file */
  enqueue(payload) {
    const file = this.fileFor(payload.sessionUID);
    fs.writeFileSync(file, JSON.stringify(payload), 'utf-8');
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
