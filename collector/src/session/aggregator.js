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
import { normalizeSessionType } from '../parser/enums.js';

// Traiettoria (giro veloce): parametri di campionamento/limite.
const TRACE_MIN_DIST_SQ = 36;   // (~6 m)² tra punti consecutivi: decimazione distanza-based
const MAX_TRACE_POINTS = 1500;  // cap di sicurezza per singolo giro
const MIN_TRACE_POINTS = 20;    // un giro con troppi pochi punti non è una traccia utile

// Prove a tempo (e altre sessioni senza Final Classification): se non arrivano
// pacchetti per questo tempo, chiudiamo la sessione con ciò che abbiamo. È solo
// un backup: la chiusura "buona" avviene all'uscita al menu (sessionUID → 0).
const IDLE_FLUSH_MS = 120_000; // 2 min

export class SessionAggregator extends EventEmitter {
  /** @param {{collectorVersion?:string, idleFlushMs?:number}} [opts] */
  constructor({ collectorVersion = '', idleFlushMs = IDLE_FLUSH_MS } = {}) {
    super();
    this.collectorVersion = collectorVersion;
    this.idleFlushMs = idleFlushMs;
    this.state = null;
    this._idleTimer = null;
  }

  /** Reimposta lo stato per una nuova sessione. */
  _reset(sessionUid, header) {
    this.state = {
      sessionUID: sessionUid,
      packetFormat: header.packetFormat,
      playerCarIndex: header.playerCarIndex ?? null, // vettura del giocatore (owner)
      meta: null,            // ultimo pacchetto Session
      participants: null,    // ultimo pacchetto Participants
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

    // Fine sessione IMPLICITA: uscita al menu (uid 0) o cambio di sessione.
    // Chiude le sessioni senza Final Classification (tipico delle prove a
    // tempo) usando la cronologia giri già raccolta.
    if (this.state && (!uid || uid === '0' || this.state.sessionUID !== uid)) {
      this._finalizeIfPending('session-change');
    }

    // sessionUID 0 = nessuna sessione attiva (menu): niente altro da fare.
    if (!uid || uid === '0') { this._clearIdleTimer(); return; }

    if (!this.state || this.state.sessionUID !== uid) {
      this._reset(uid, header);
    }
    const s = this.state;
    if (header.playerCarIndex != null) s.playerCarIndex = header.playerCarIndex;

    // Riarma il timer di inattività a ogni pacchetto ricevuto.
    this._armIdleTimer();

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
      case 4: // Participants
        s.participants = packet;
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
    const numActive = s.participants?.numActiveCars ?? packet.cars.length;

    for (let i = 0; i < packet.cars.length && i < numActive; i++) {
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

  /** Numero di vetture con cronologia giri raccolta. */
  _hasHistory() {
    return this.state && Object.keys(this.state.history || {}).length > 0;
  }

  /**
   * Chiude la sessione SOLO se c'è qualcosa da inviare e non è già chiusa.
   * Usata dalle chiusure implicite (menu/cambio sessione/inattività), dove una
   * gara è già stata chiusa dal pacchetto 8 e le prove a tempo non hanno
   * classifica ma hanno la cronologia giri.
   */
  _finalizeIfPending(reason) {
    const s = this.state;
    if (!s || s.finalized) return;
    if (!s.classification && !this._hasHistory()) return; // niente da inviare
    this._finalize(reason);
  }

  /** Chiude la sessione ed emette il payload (una sola volta). */
  _finalize(reason) {
    const s = this.state;
    if (!s || s.finalized) return;
    // Serve almeno una classifica (gara/qualifica) oppure la cronologia giri
    // (prove a tempo): altrimenti non c'è nulla da importare.
    if (!s.classification && !this._hasHistory()) return;
    s.finalized = true;
    this._clearIdleTimer();

    const payload = buildPayload(s, { collectorVersion: this.collectorVersion });
    this.emit('session-complete', { reason, payload });
  }

  /** (Ri)arma il timer di inattività per il flush di backup. */
  _armIdleTimer() {
    this._clearIdleTimer();
    this._idleTimer = setTimeout(() => this._finalizeIfPending('idle-timeout'), this.idleFlushMs);
    if (this._idleTimer.unref) this._idleTimer.unref(); // non tiene vivo il processo
  }

  _clearIdleTimer() {
    if (this._idleTimer) { clearTimeout(this._idleTimer); this._idleTimer = null; }
  }

  /** Stato corrente (per la live view). */
  get current() {
    return this.state;
  }
}

export default SessionAggregator;
