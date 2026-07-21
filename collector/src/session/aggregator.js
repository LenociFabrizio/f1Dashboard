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
import { buildPayload, isRealParticipant } from './builder.js';

// Traiettoria (giro veloce): parametri di campionamento/limite.
const TRACE_MIN_DIST_SQ = 36;   // (~6 m)² tra punti consecutivi: decimazione distanza-based
const MAX_TRACE_POINTS = 1500;  // cap di sicurezza per singolo giro
const MIN_TRACE_POINTS = 20;    // un giro con troppi pochi punti non è una traccia utile

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
      participants: null,    // ultimo pacchetto Participants (grezzo, per la live view)
      participantsByCar: {}, // carIdx -> identità accumulata nel tempo (merge)
      lapData: null,         // ultimo pacchetto LapData (per la live view)
      classification: null,  // Final Classification
      fastestLapCarIndex: null,
      overtakes: {},         // carIndex -> numero di sorpassi (eventi OVTK)
      history: {},           // carIdx -> cronologia giri (Session History, pkt 11)
      traces: {},            // carIdx -> traiettoria (Motion, pkt 0): giro corrente + miglior giro
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
      case 0: // Motion → traiettoria (linea di gara)
        this._onMotion(packet);
        break;
      case 1: // Session
        s.meta = packet;
        break;
      case 2: // Lap Data
        s.lapData = packet;
        this.emit('lap-data', packet);
        break;
      case 4: // Participants: tieni l'ultimo (live view) e ACCUMULA nel tempo
        s.participants = packet;
        this._mergeParticipants(packet);
        break;
      case 3: // Event
        this._onEvent(packet);
        break;
      case 11: // Session History (una vettura per pacchetto): tieni l'ultima
        if (packet.carIdx != null) s.history[packet.carIdx] = packet;
        break;
      case 8: // Final Classification → fine sessione
        s.classification = packet;
        this._finalize('final-classification');
        break;
      default:
        break;
    }
  }

  /**
   * Accumula i partecipanti nel tempo (merge per carIndex): ogni pacchetto
   * Participants aggiorna solo gli slot "reali", senza mai rimuovere quelli
   * già visti. Così, se l'ultimo Participants prima della fine gara è
   * incompleto (numActiveCars basso, piloti ai box/riconnessi), le identità
   * raccolte in precedenza NON vengono perse. Conserva anche il nome migliore
   * già visto (una versione "a nomi nascosti" non sovrascrive un nome buono).
   */
  _mergeParticipants(packet) {
    const arr = packet.participants || [];
    const map = this.state.participantsByCar;
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      if (!isRealParticipant(p)) continue;
      const prev = map[i];
      const name = p.name && String(p.name).trim() ? p.name : (prev?.name || p.name);
      map[i] = { ...p, name };
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
      case 'OVTK': // Sorpasso: conta per chi sorpassa
        if (packet.detail && packet.detail.overtakingVehicleIdx != null) {
          const idx = packet.detail.overtakingVehicleIdx;
          s.overtakes[idx] = (s.overtakes[idx] || 0) + 1;
        }
        break;
      case 'SEND': // Session Ended (backup: se abbiamo dati sufficienti)
        if (s.classification) this._finalize('session-end');
        break;
      default:
        break;
    }
  }

  /**
   * Motion (pkt 0): accumula la linea di gara per vettura. Il Motion non
   * porta il numero di giro, quindi facciamo il join con l'ultimo LapData
   * (currentLapNum + lastLapTimeInMS). In RAM teniamo solo il giro corrente
   * e il miglior giro completato: al cambio di giro promuoviamo il giro
   * appena chiuso se più veloce del best precedente.
   */
  _onMotion(packet) {
    const s = this.state;
    if (!s.lapData || !packet.cars) return; // senza LapData non sappiamo il giro
    const lapCars = s.lapData.cars || [];

    // Itera tutte le vetture: gli slot vuoti/inattivi sono già saltati dai
    // controlli sotto (nessun LapData o giro corrente). Non ci limitiamo a
    // numActiveCars, che in lobby online può sottostimare le vetture presenti.
    for (let i = 0; i < packet.cars.length; i++) {
      const pos = packet.cars[i];
      const ld = lapCars[i];
      if (!pos || !ld) continue;
      const lapNum = ld.currentLapNum;
      if (!lapNum) continue; // pre-via / non ancora in giro

      const t = (s.traces[i] ||= { curLap: lapNum, curPoints: [], best: null, lastX: null, lastZ: null });

      // Cambio di giro: valuta il giro appena chiuso (t.curLap) e riparte.
      if (lapNum !== t.curLap) {
        const closedTime = ld.lastLapTimeInMS;
        if (closedTime > 0 && t.curPoints.length >= MIN_TRACE_POINTS &&
            (!t.best || closedTime < t.best.timeMs)) {
          t.best = { lap: t.curLap, timeMs: closedTime, points: t.curPoints };
        }
        t.curLap = lapNum;
        t.curPoints = [];
        t.lastX = null;
        t.lastZ = null;
      }

      // Decimazione distanza-based: campiona un punto solo ogni ~6 m.
      const { x, z } = pos;
      const far = t.lastX === null || ((x - t.lastX) ** 2 + (z - t.lastZ) ** 2) >= TRACE_MIN_DIST_SQ;
      if (far && t.curPoints.length < MAX_TRACE_POINTS) {
        t.curPoints.push([Math.round(x), Math.round(z)]);
        t.lastX = x;
        t.lastZ = z;
      }
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
