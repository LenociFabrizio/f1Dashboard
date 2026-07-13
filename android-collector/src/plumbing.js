/**
 * plumbing.js
 * ------------------------------------------------------------
 * Cablaggio dei moduli (derivato da collector/src/index.js):
 *   UDP listener → parser → aggregator → (queue → uploader)
 *
 * Espone una classe Collector con start()/stop() e un event emitter di stato
 * che la UI ascolta per mostrare: ascolto sì/no, pacchetti ricevuti, sessione
 * corrente, esito ultimo invio, sessioni in coda.
 * ------------------------------------------------------------
 */
import { EventEmitter } from 'events';

import { parsePacket } from './parser/index.js';
import { SessionAggregator } from './session/aggregator.js';
import { QueueStore } from './store/queue.js';
import { Uploader } from './net/uploader.js';
import { UdpListener } from './udp/listener.js';
import {
  UDP_PORT,
  UDP_HOST,
  CAPTURE_SESSION_TYPES,
  COLLECTOR_VERSION,
} from './config.js';

export class Collector extends EventEmitter {
  /** @param {{ingestUrl:string, token:string}} opts */
  constructor({ ingestUrl, token }) {
    super();
    this.ingestUrl = ingestUrl;
    this.token = token;

    this.running = false;
    this.status = {
      listening: false,
      address: null,
      packets: 0,
      currentSession: null,   // sessionUID in corso
      lastSessionType: null,
      lastSent: null,         // { sessionUID, deduped, at }
      lastError: null,        // messaggio ultimo errore invio
      queued: 0,
    };

    this.capture = new Set(CAPTURE_SESSION_TYPES);
    this.store = new QueueStore();
    this.aggregator = null;
    this.uploader = null;
    this.listener = null;
  }

  _emit() {
    // Copia difensiva così i consumatori React vedono un nuovo riferimento.
    this.emit('status', { ...this.status });
  }

  async _refreshQueued() {
    try {
      this.status.queued = await this.store.count();
    } catch {
      /* ignora */
    }
    this._emit();
  }

  start() {
    if (this.running) return this;
    this.running = true;

    const store = this.store;
    const uploader = new Uploader({ store, ingestUrl: this.ingestUrl, token: this.token });
    const aggregator = new SessionAggregator({ collectorVersion: COLLECTOR_VERSION });
    const listener = new UdpListener({ port: UDP_PORT, host: UDP_HOST });
    this.uploader = uploader;
    this.aggregator = aggregator;
    this.listener = listener;

    // --- aggregatore ---
    aggregator.on('session-start', ({ sessionUID }) => {
      this.status.currentSession = sessionUID;
      this._emit();
    });
    aggregator.on('session-complete', async ({ payload }) => {
      // Filtro tipi di sessione (come il collector PC).
      if (this.capture.size && !this.capture.has(payload.sessionType)) {
        return;
      }
      this.status.lastSessionType = payload.sessionType;
      await store.enqueue(payload);
      await this._refreshQueued();
      uploader.drain();
    });

    // --- uploader ---
    uploader.on('sent', async ({ sessionUID, response }) => {
      this.status.lastSent = { sessionUID, deduped: !!response?.deduped, at: Date.now() };
      this.status.lastError = null;
      await this._refreshQueued();
    });
    uploader.on('error', (err) => {
      this.status.lastError = err?.message || String(err);
      this._emit();
    });
    uploader.on('warn', (m) => {
      this.status.lastError = m;
      this._emit();
    });

    // --- listener UDP ---
    listener.on('listening', (addr) => {
      this.status.listening = true;
      this.status.address = `${addr?.address ?? UDP_HOST}:${addr?.port ?? UDP_PORT}`;
      this._emit();
    });
    listener.on('error', (err) => {
      this.status.lastError = `socket UDP: ${err?.message || err}`;
      this._emit();
    });
    listener.on('packet', (buf) => {
      let packet;
      try {
        packet = parsePacket(buf);
      } catch {
        return; // pacchetto sconosciuto/incompleto: ignora
      }
      if (packet) {
        this.status.packets += 1;
        // Aggiorna il contatore senza spammare: solo ogni 50 pacchetti.
        if (this.status.packets % 50 === 0) this._emit();
        aggregator.ingest(packet);
      }
    });

    uploader.start();
    listener.start();
    this._refreshQueued();
    this._emit();
    return this;
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.listener) this.listener.stop();
    if (this.uploader) this.uploader.stop();
    this.status.listening = false;
    this.status.address = null;
    this.status.currentSession = null;
    this._emit();
  }
}

export default Collector;
