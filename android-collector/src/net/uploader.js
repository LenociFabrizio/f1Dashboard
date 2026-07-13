/**
 * net/uploader.js  (Android)
 * ------------------------------------------------------------
 * Invia le sessioni in coda all'endpoint di ingest del sito via HTTPS.
 * - drena la coda (QueueStore) periodicamente e su richiesta;
 * - rimuove dalla coda solo dopo un invio riuscito (2xx o "deduped");
 * - backoff esponenziale in caso di errore/rete assente;
 * - un solo drain alla volta (niente invii concorrenti).
 *
 * Identico al collector PC: `fetch` + `AbortController` funzionano nativamente
 * in React Native. L'unica differenza è che i metodi della coda sono async
 * (AsyncStorage) e vengono attesi con await.
 * ------------------------------------------------------------
 */
import { EventEmitter } from 'events';

export class Uploader extends EventEmitter {
  /**
   * @param {object} opts
   * @param {import('../store/queue.js').QueueStore} opts.store
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
      const files = await this.store.list();
      for (const file of files) {
        const payload = await this.store.read(file);
        if (!payload) {
          this.emit('warn', `entry di coda corrotta, rimossa: ${file}`);
          await this.store.remove(file);
          continue;
        }
        try {
          const res = await this.send(payload);
          await this.store.remove(file);
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
