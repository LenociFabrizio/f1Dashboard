/**
 * net/uploader.js
 * ------------------------------------------------------------
 * Invia le sessioni in coda all'endpoint di ingest del sito via HTTPS.
 * - drena la coda (BufferStore) periodicamente e su richiesta;
 * - rimuove dalla coda solo dopo un invio riuscito (2xx o "deduped");
 * - backoff esponenziale in caso di errore/rete assente;
 * - un solo drain alla volta (niente invii concorrenti).
 * ------------------------------------------------------------
 */
import { EventEmitter } from 'node:events';

export class Uploader extends EventEmitter {
  /**
   * @param {object} opts
   * @param {import('../store/buffer-store.js').BufferStore} opts.store
   * @param {string} opts.ingestUrl
   * @param {string} opts.token
   * @param {number} [opts.intervalMs] periodo del drain automatico
   */
  constructor({ store, ingestUrl, token, intervalMs = 15000 }) {
    super();
    this.store = store;
    this.ingestUrl = ingestUrl;
    this.token = token;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.draining = false;
    this.backoff = 0; // drain saltati per backoff
  }

  start() {
    if (this.timer) return this;
    this.timer = setInterval(() => this.drain(), this.intervalMs);
    if (this.timer.unref) this.timer.unref();
    this.drain();
    return this;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Prova a inviare tutte le sessioni in coda, in ordine. */
  async drain() {
    if (this.draining) return;
    if (!this.ingestUrl) {
      this.emit('warn', 'ingestUrl non configurato: le sessioni restano in coda');
      return;
    }
    if (this.backoff > 0) {
      this.backoff -= 1;
      return;
    }

    this.draining = true;
    try {
      for (const file of this.store.list()) {
        const payload = this.store.read(file);
        if (!payload) {
          this.emit('warn', `file di coda corrotto, rimosso: ${file}`);
          this.store.remove(file);
          continue;
        }
        try {
          const res = await this.send(payload);
          this.store.remove(file);
          this.backoff = 0;
          this.emit('sent', { sessionUID: payload.sessionUID, response: res });
        } catch (err) {
          // Fallito: interrompi il drain, applica backoff e riprova dopo.
          this.backoff = Math.min(8, this.backoff + 1) * 2;
          this.emit('error', err);
          break;
        }
      }
    } finally {
      this.draining = false;
    }
  }

  /** POST del payload all'endpoint di ingest. Rigetta su status non-2xx. */
  async send(payload) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(this.ingestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`Ingest HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      try {
        return JSON.parse(text);
      } catch {
        return { raw: text };
      }
    } finally {
      clearTimeout(t);
    }
  }
}

export default Uploader;
