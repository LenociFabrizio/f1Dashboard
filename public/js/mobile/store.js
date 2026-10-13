/* =============================================================
   store.js — Cache in memoria delle richieste della vista app.
   store.get(key, fetcher) memorizza la PROMESSA per 60s: chiamate
   concorrenti con la stessa chiave condividono la stessa richiesta.
   Una promessa rifiutata viene scartata subito, così "Riprova"
   rifà davvero la chiamata.
   ============================================================= */

const TTL_MS = 60_000;
const cache = new Map(); // key → { promise, expires }

export const store = {
  /**
   * @param {string} key  chiave univoca (es. 'summary', 'standings:drivers')
   * @param {() => Promise<any>} fetcher  funzione che esegue la richiesta
   * @param {number} [ttl=60000] durata della cache in ms
   * @returns {Promise<any>}
   */
  get(key, fetcher, ttl = TTL_MS) {
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.promise;

    const promise = Promise.resolve()
      .then(fetcher)
      .catch((err) => {
        // Solo se in cache c'è ancora QUESTA promessa (non una più recente)
        if (cache.get(key)?.promise === promise) cache.delete(key);
        throw err;
      });
    cache.set(key, { promise, expires: Date.now() + ttl });
    return promise;
  },

  /** Svuota tutta la cache o, se indicata, una sola chiave. */
  clear(key) {
    if (key === undefined) cache.clear();
    else cache.delete(key);
  },
};

export default store;
