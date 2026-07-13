/**
 * store/queue.js  (Android)
 * ------------------------------------------------------------
 * Coda persistente delle sessioni pronte per l'invio, su AsyncStorage
 * (sostituisce il buffer-store.js su filesystem del collector PC).
 *
 * Ogni sessione è una entry JSON con chiave `session:<sessionUID>`: sopravvive
 * a chiusura dell'app e ad assenza temporanea di rete. L'uploader la consuma e
 * la rimuove solo dopo un invio andato a buon fine. La chiave sul sessionUID
 * rende gli invii ripetuti della stessa sessione idempotenti (niente duplicati
 * in coda), esattamente come il nome-file basato su UID del collector PC.
 *
 * A differenza del PC, i metodi sono ASINCRONI (AsyncStorage è async): il
 * drain() dell'uploader li attende con await.
 * ------------------------------------------------------------
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'session:';

export class QueueStore {
  /** Nome chiave sicuro a partire dal sessionUID. */
  keyFor(sessionUid) {
    const safe = String(sessionUid).replace(/[^0-9a-zA-Z_-]/g, '_');
    return `${PREFIX}${safe}`;
  }

  /** Accoda (o aggiorna) una sessione. @returns {Promise<string>} chiave */
  async enqueue(payload) {
    const key = this.keyFor(payload.sessionUID);
    await AsyncStorage.setItem(key, JSON.stringify(payload));
    return key;
  }

  /** Elenca le chiavi in coda (ordinamento deterministico per chiave). */
  async list() {
    const keys = await AsyncStorage.getAllKeys();
    return keys.filter((k) => k.startsWith(PREFIX)).sort();
  }

  /** Legge e deserializza una entry (null se assente/corrotta). */
  async read(key) {
    try {
      const s = await AsyncStorage.getItem(key);
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  }

  /** Rimuove una entry dalla coda (dopo invio riuscito). */
  async remove(key) {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      /* già rimossa */
    }
  }

  /** Numero di sessioni in coda. */
  async count() {
    return (await this.list()).length;
  }
}

export default QueueStore;
