#!/usr/bin/env node
/**
 * index.js — entry del collector telemetria F1 25
 * ------------------------------------------------------------
 * Cablaggio dei moduli:
 *   UDP listener → parser → aggregator → (buffer store → uploader)
 *                                     ↘ live view (locale)
 *
 * Riconosce da sé inizio/fine sessione, accoda su disco il JSON di fine
 * gara e lo invia al sito con retry. Funziona anche senza rete: le
 * sessioni restano in coda e partono appena la connessione torna.
 * ------------------------------------------------------------
 */
import os from 'node:os';
import { loadConfig } from './config.js';
import { UdpListener } from './udp/listener.js';
import { parsePacket } from './parser/index.js';
import { SessionAggregator } from './session/aggregator.js';
import { BufferStore } from './store/buffer-store.js';
import { Uploader } from './net/uploader.js';
import { LiveServer } from './live/server.js';

const VERSION = '0.1.0';
const log = (...a) => console.log(new Date().toISOString(), ...a);

/** Indirizzi IPv4 di rete locale (non-interni) del PC. Utili per configurare la PS5. */
function localIPv4s() {
  const out = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
  }
  return out;
}

function main() {
  const cfg = loadConfig();
  log(`F1 Telemetry Collector v${VERSION}`);
  log(`Config: ${cfg.configPath}`);

  const store = new BufferStore(cfg.buffer.dir);
  const uploader = new Uploader({
    store,
    ingestUrl: cfg.server.ingestUrl,
    token: cfg.server.collectorToken,
  });
  const aggregator = new SessionAggregator({ collectorVersion: VERSION });
  const listener = new UdpListener(cfg.udp);

  // Filtro tipi di sessione da catturare
  const capture = new Set(cfg.captureSessionTypes || []);

  // --- eventi aggregatore ---
  aggregator.on('session-start', ({ sessionUID }) => log(`▶  Sessione avviata (UID ${sessionUID})`));
  aggregator.on('session-complete', ({ reason, payload }) => {
    if (capture.size && !capture.has(payload.sessionType)) {
      log(`⏭  Sessione ${payload.sessionType} ignorata (non in captureSessionTypes)`);
      return;
    }
    store.enqueue(payload);
    log(`✅ Sessione completata (${payload.sessionType}, ${reason}): ${payload.classification.length} piloti → in coda [${store.size}]`);
    uploader.drain();
  });

  // --- eventi uploader ---
  uploader.on('sent', ({ sessionUID, response }) =>
    log(`📤 Inviata al sito (UID ${sessionUID})${response?.deduped ? ' [già presente]' : ''}. Coda: ${store.size}`)
  );
  uploader.on('error', (err) => log(`⚠️  Invio fallito (riprovo): ${err.message}`));
  uploader.on('warn', (m) => log(`⚠️  ${m}`));

  // --- listener UDP ---
  listener.on('listening', (a) => {
    log(`🎧 Ascolto UDP su ${a.address}:${a.port}`);
    // Suggerimento per chi gioca su PS5/Xbox: l'IP da inserire in F1 25.
    const ips = localIPv4s();
    log('──────────────────────────────────────────────');
    if (ips.length) {
      log('🎮 Se giochi su PS5/Xbox, in F1 25 → Impostazioni → Telemetria imposta:');
      log(`     UDP IP Address = ${ips[0]}   (Porta = ${a.port})`);
      if (ips.length > 1) log(`     (altri IP di questo PC: ${ips.slice(1).join(', ')})`);
    } else {
      log('🎮 Nessun IP di rete rilevato: collega il PC alla rete di casa per ricevere dalla PS5/Xbox.');
    }
    log('💻 Se giochi su questo stesso PC, in F1 25 usa UDP IP Address = 127.0.0.1');
    log('──────────────────────────────────────────────');
  });
  listener.on('error', (err) => log(`❌ Errore socket UDP: ${err.message}`));
  listener.on('packet', (buf) => {
    let packet;
    try {
      packet = parsePacket(buf);
    } catch (err) {
      // Pacchetto sconosciuto/incompleto: ignora senza far cadere il collector.
      return;
    }
    if (packet) aggregator.ingest(packet);
  });

  // --- live view (facoltativa) ---
  let live = null;
  if (cfg.live?.enabled) {
    live = new LiveServer({ aggregator, port: cfg.live.port }).start();
    log(`🖥  Live view: http://localhost:${cfg.live.port}`);
  }

  uploader.start();
  listener.start();

  if (!cfg.server.ingestUrl) {
    log('⚠️  server.ingestUrl non configurato: le sessioni verranno solo accodate su disco.');
  }
  if (store.size) log(`ℹ️  ${store.size} sessioni già in coda: provo l'invio.`);

  // Spegnimento pulito
  const shutdown = () => {
    log('Arresto…');
    listener.stop();
    uploader.stop();
    if (live) live.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
