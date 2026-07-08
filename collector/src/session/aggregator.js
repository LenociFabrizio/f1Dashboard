/**
 * session/aggregator.js
 * ------------------------------------------------------------
 * Accumula i pacchetti parsati in uno stato di sessione e riconosce
 * automaticamente inizio e fine gara.
 *
 * Regole:
 *   - un nuovo m_sessionUID avvia una nuova sessione (reset dello stato);
 *   - i pacchetti Participants/Session/LapData aggiornano lo stato "corrente";
 *   - l'evento FTLP registra chi ha il giro veloce;
 *   - la Final Classification (o l'evento SEND, come backup) chiude la
 *     sessione ed emette 'session-complete' UNA sola volta con il payload
 *     aggregato pronto per l'invio.
 *
 * Non conosce il formato binario: lavora solo su oggetti già parsati.
 * ------------------------------------------------------------
 */
import { EventEmitter } from 'node:events';
import { buildPayload } from './builder.js';

export class SessionAggregator extends EventEmitter {
  /** @param {{collectorVersion?:string}} [opts] */
  constructor({ collectorVersion = '' } = {}) {
    super();
    this.collectorVersion = collectorVersion;
    this.state = null;
  }

  /** Reimposta lo stato per una nuova sessione. */
  _reset(sessionUid, header) {
    this.state = {
      sessionUID: sessionUid,
      packetFormat: header.packetFormat,
      meta: null,            // ultimo pacchetto Session
      participants: null,    // ultimo pacchetto Participants
      lapData: null,         // ultimo pacchetto LapData (per la live view)
      classification: null,  // Final Classification
      fastestLapCarIndex: null,
      finalized: false,
    };
    this.emit('session-start', { sessionUID: sessionUid });
  }

  /** Punto d'ingresso: riceve un pacchetto già parsato { header, ... }. */
  ingest(packet) {
    if (!packet || !packet.header) return;
    const { header } = packet;
    const uid = header.sessionUID;

    // sessionUID 0 = nessuna sessione attiva (menu): ignora.
    if (!uid || uid === '0') return;

    if (!this.state || this.state.sessionUID !== uid) {
      this._reset(uid, header);
    }
    const s = this.state;

    switch (header.packetId) {
      case 1: // Session
        s.meta = packet;
        break;
      case 2: // Lap Data
        s.lapData = packet;
        this.emit('lap-data', packet);
        break;
      case 4: // Participants
        s.participants = packet;
        break;
      case 3: // Event
        this._onEvent(packet);
        break;
      case 8: // Final Classification → fine sessione
        s.classification = packet;
        this._finalize('final-classification');
        break;
      default:
        break;
    }
  }

  _onEvent(packet) {
    const s = this.state;
    switch (packet.code) {
      case 'FTLP': // Fastest Lap
        if (packet.detail && packet.detail.vehicleIdx != null) {
          s.fastestLapCarIndex = packet.detail.vehicleIdx;
        }
        break;
      case 'SEND': // Session Ended (backup: se abbiamo dati sufficienti)
        if (s.classification) this._finalize('session-end');
        break;
      default:
        break;
    }
  }

  /** Chiude la sessione ed emette il payload (una sola volta). */
  _finalize(reason) {
    const s = this.state;
    if (!s || s.finalized) return;
    if (!s.classification) return; // niente classifica → niente da importare
    s.finalized = true;

    const payload = buildPayload(s, { collectorVersion: this.collectorVersion });
    this.emit('session-complete', { reason, payload });
  }

  /** Stato corrente (per la live view). */
  get current() {
    return this.state;
  }
}

export default SessionAggregator;
