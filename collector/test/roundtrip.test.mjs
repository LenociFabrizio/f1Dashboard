/**
 * roundtrip.test.mjs
 * ------------------------------------------------------------
 * Costruisce pacchetti UDP sintetici con lo STESSO layout del parser
 * (header 29B, ParticipantData 60B, FinalClassificationData 45/46B,
 * Event FTLP) e verifica il round-trip parser → aggregator → builder.
 *
 * Valida l'aritmetica degli offset e la robustezza alla variante F1 25
 * (byte extra m_resultReason nella Final Classification).
 * ------------------------------------------------------------
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePacket, HEADER_SIZE } from '../src/parser/index.js';
import { SessionAggregator } from '../src/session/aggregator.js';

const SESSION_UID = 424242n;

/** Writer sequenziale little-endian (specularmente al Cursor di lettura). */
class W {
  constructor(size) { this.b = Buffer.alloc(size); this.o = 0; }
  u8(v) { this.b.writeUInt8(v & 0xff, this.o); this.o += 1; return this; }
  i8(v) { this.b.writeInt8(v, this.o); this.o += 1; return this; }
  u16(v) { this.b.writeUInt16LE(v, this.o); this.o += 2; return this; }
  i16(v) { this.b.writeInt16LE(v, this.o); this.o += 2; return this; }
  u32(v) { this.b.writeUInt32LE(v, this.o); this.o += 4; return this; }
  f32(v) { this.b.writeFloatLE(v, this.o); this.o += 4; return this; }
  f64(v) { this.b.writeDoubleLE(v, this.o); this.o += 8; return this; }
  u64(v) { this.b.writeBigUInt64LE(v, this.o); this.o += 8; return this; }
  chars(str, n) { this.b.write(str, this.o, 'utf8'); this.o += n; return this; }
  seek(o) { this.o = o; return this; }
}

function header(w, packetId) {
  w.u16(2025).u8(25).u8(1).u8(0).u8(1).u8(packetId).u64(SESSION_UID)
    .f32(12.5).u32(100).u32(100).u8(0).u8(255);
}

// ParticipantData F1 25 = 57 byte: 7 pre + name[32] + yourTelemetry(1) +
// showOnlineNames(1) + techLevel(2) + platform(1) + numColours(1) + livery[12].
const PARTICIPANT_SIZE = 57;
function participantsPacket(list, numActive) {
  const w = new W(HEADER_SIZE + 1 + 22 * PARTICIPANT_SIZE);
  header(w, 4);
  w.u8(numActive);
  for (let i = 0; i < 22; i++) {
    const base = HEADER_SIZE + 1 + i * PARTICIPANT_SIZE;
    w.seek(base);
    const p = list[i];
    if (!p) continue;
    w.u8(p.ai ? 1 : 0).u8(0).u8(0).u8(p.teamId ?? 0).u8(0).u8(p.raceNumber ?? 0).u8(0)
      .chars(p.name || '', 32)         // m_name[32]
      .u8(1)                            // m_yourTelemetry
      .u8(p.showNames ? 1 : 0)          // m_showOnlineNames
      .u16(0)                           // m_techLevel
      .u8(p.platform ?? 1)              // m_platform
      .u8(0);                           // m_numColours (livery colours restano 0)
  }
  return w.b;
}

function sessionPacket(sessionType) {
  const w = new W(HEADER_SIZE + 200);
  header(w, 1);
  w.u8(0)      // weather clear
    .i8(30).i8(25)
    .u8(50)    // totalLaps
    .u16(5793) // trackLength
    .u8(sessionType)
    .i8(11)    // trackId Monza
    .u8(0);    // formula
  return w.b;
}

function ftlpEvent(vehicleIdx) {
  const w = new W(HEADER_SIZE + 16);
  header(w, 3);
  w.chars('FTLP', 4).u8(vehicleIdx).f32(80.912);
  return w.b;
}

function ovtkEvent(overtaker, overtaken) {
  const w = new W(HEADER_SIZE + 16);
  header(w, 3);
  w.chars('OVTK', 4).u8(overtaker).u8(overtaken);
  return w.b;
}

// Session History (id 11): carIdx + numLaps + numTyreStints + 4 best-lap-num
// + lapHistoryData[100]*14 + tyreStints[8]*3.
function sessionHistoryPacket(carIdx, laps) {
  const w = new W(HEADER_SIZE + 7 + 100 * 14 + 8 * 3);
  header(w, 11);
  w.u8(carIdx).u8(laps.length).u8(0).u8(1).u8(1).u8(1).u8(1);
  const base = HEADER_SIZE + 7;
  laps.forEach((l, i) => {
    w.seek(base + i * 14);
    w.u32(l.time).u16(l.s1).u8(0).u16(l.s2).u8(0).u16(l.s3).u8(0).u8(l.valid ? 1 : 0);
  });
  return w.b;
}

// Motion (id 0): CarMotionData 60 byte/vettura, array subito dopo l'header.
// Scriviamo solo i primi 12 byte utili (worldPositionX/Y/Z). `posByCar` è un
// array indicizzato per carIdx: gli slot mancanti restano a 0.
const MOTION_ITEM_SIZE = 60;
function motionPacket(posByCar) {
  const w = new W(HEADER_SIZE + 22 * MOTION_ITEM_SIZE);
  header(w, 0);
  for (let i = 0; i < 22; i++) {
    const p = posByCar[i];
    if (!p) continue;
    w.seek(HEADER_SIZE + i * MOTION_ITEM_SIZE).f32(p.x).f32(p.y ?? 0).f32(p.z);
  }
  return w.b;
}

// Lap Data (id 2): 57 byte/vettura + 2 byte di coda (time-trial idx).
// Scriviamo lastLapTimeInMS (offset 0) e currentLapNum (offset 33).
const LAPDATA_ITEM_SIZE = 57;
function lapDataPacket(carsByIdx) {
  const w = new W(HEADER_SIZE + 22 * LAPDATA_ITEM_SIZE + 2);
  header(w, 2);
  for (let i = 0; i < 22; i++) {
    const c = carsByIdx[i];
    if (!c) continue;
    const base = HEADER_SIZE + i * LAPDATA_ITEM_SIZE;
    w.seek(base).u32(c.lastLapTimeInMS ?? 0);
    w.seek(base + 33).u8(c.currentLapNum ?? 0);
  }
  return w.b;
}

/** itemSize = 45 (F1 24) o 46 (F1 25 con m_resultReason). */
function finalClassificationPacket(cars, itemSize = 45) {
  const w = new W(HEADER_SIZE + 1 + 22 * itemSize);
  header(w, 8);
  w.u8(cars.length);
  for (let i = 0; i < 22; i++) {
    const base = HEADER_SIZE + 1 + i * itemSize;
    w.seek(base);
    const c = cars[i];
    if (!c) continue;
    w.u8(c.position).u8(c.numLaps).u8(c.grid).u8(c.points).u8(c.pits).u8(c.resultStatus);
    if (itemSize >= 46) w.u8(0); // m_resultReason
    w.u32(c.bestLapMs).f64(c.totalRaceTimeS).u8(c.penS).u8(0).u8(c.numStints);
    for (let k = 0; k < 8; k++) w.u8(0);                    // actual
    for (let k = 0; k < 8; k++) w.u8(c.stintsVisual?.[k] ?? 0); // visual
    for (let k = 0; k < 8; k++) w.u8(0);                    // endLaps
  }
  return w.b;
}

test('header + participants parse correttamente (ParticipantData 57 byte, name char[32])', () => {
  const pkt = participantsPacket(
    [
      { name: 'MaxP_TM', platform: 1, raceNumber: 1, teamId: 2, showNames: true },
      { name: 'Player', platform: 3, raceNumber: 16, teamId: 1, showNames: false },
    ],
    2
  );
  const parsed = parsePacket(pkt);
  assert.equal(parsed.header.packetFormat, 2025);
  assert.equal(parsed.header.sessionUID, '424242');
  assert.equal(parsed.numActiveCars, 2);
  assert.equal(parsed.participants[0].name, 'MaxP_TM');
  assert.equal(parsed.participants[0].platform, 1);
  assert.equal(parsed.participants[0].showOnlineNames, 1);
  assert.equal(parsed.participants[1].name, 'Player');
  assert.equal(parsed.participants[1].showOnlineNames, 0);
  assert.equal(parsed.participants[1].platform, 3);
});

function runSession(itemSize) {
  const agg = new SessionAggregator({ collectorVersion: 'test' });
  let done = null;
  agg.on('session-complete', (e) => { done = e; });

  agg.ingest(parsePacket(participantsPacket(
    [
      { name: 'MaxP_TM', platform: 1, raceNumber: 1, teamId: 2, showNames: true },
      { name: 'CharlesLec', platform: 1, raceNumber: 16, teamId: 1, showNames: true },
    ], 2)));
  agg.ingest(parsePacket(sessionPacket(15))); // Race
  agg.ingest(parsePacket(ftlpEvent(1)));       // giro veloce a car 1
  agg.ingest(parsePacket(ovtkEvent(1, 0)));    // car 1 sorpassa car 0 (x2)
  agg.ingest(parsePacket(ovtkEvent(1, 0)));
  agg.ingest(parsePacket(sessionHistoryPacket(1, [
    { time: 82000, s1: 25000, s2: 30000, s3: 27000, valid: true },
    { time: 81000, s1: 24800, s2: 29900, s3: 26300, valid: true },
    { time: 0, s1: 0, s2: 0, s3: 0, valid: false }, // giro in corso (escluso)
  ])));
  agg.ingest(parsePacket(finalClassificationPacket([
    { position: 1, numLaps: 50, grid: 1, points: 25, pits: 1, resultStatus: 3, bestLapMs: 81200, totalRaceTimeS: 3600.0, penS: 0, numStints: 2, stintsVisual: [16, 17] },
    { position: 2, numLaps: 50, grid: 2, points: 18, pits: 1, resultStatus: 3, bestLapMs: 81000, totalRaceTimeS: 3605.5, penS: 5, numStints: 2, stintsVisual: [16, 18] },
  ], itemSize)));

  return done;
}

test('aggregator → builder produce il payload corretto (Final Classification 45B)', () => {
  const done = runSession(45);
  assert.ok(done, 'session-complete emesso');
  const p = done.payload;
  assert.equal(p.sessionType, 'race');
  assert.equal(p.trackId, 11);
  assert.equal(p.totalLaps, 50);
  assert.equal(p.fastestLapCarIndex, 1);
  assert.equal(p.classification.length, 2);
  assert.equal(p.classification[0].position, 1);
  assert.equal(p.classification[0].bestLapMs, 81200);
  assert.equal(p.classification[0].totalRaceTimeMs, 3600000); // secondi → ms
  assert.deepEqual(p.classification[0].tyreStints, ['soft', 'medium']);
  assert.equal(p.classification[1].penaltiesTimeS, 5);
  assert.equal(p.classification[1].overtakes, 2); // 2 eventi OVTK per car 1
  assert.equal(p.classification[0].overtakes, 0);
  // Cronologia giri (Session History): 2 giri validi per car 1 (il 3° in corso è escluso)
  const hist = p.lapHistory.find((h) => h.carIndex === 1);
  assert.ok(hist, 'lapHistory presente per car 1');
  assert.equal(hist.laps.length, 2);
  assert.equal(hist.laps[1].timeMs, 81000);
  assert.equal(hist.laps[0].s1Ms, 25000);
  assert.equal(hist.laps[0].valid, true);
  assert.equal(p.participants[0].name, 'MaxP_TM');
  assert.equal(p.participants[0].nameReliable, true);
});

test('robustezza variante F1 25: Final Classification a 46 byte (m_resultReason)', () => {
  const done = runSession(46);
  assert.ok(done, 'session-complete emesso anche con stride 46');
  const p = done.payload;
  // Se lo stride/allineamento fossero errati, questi valori sarebbero corrotti.
  assert.equal(p.classification[0].bestLapMs, 81200);
  assert.equal(p.classification[1].bestLapMs, 81000);
  assert.equal(p.classification[0].totalRaceTimeMs, 3600000);
  assert.deepEqual(p.classification[1].tyreStints, ['soft', 'hard']);
});

test('sessione senza classifica NON viene finalizzata', () => {
  const agg = new SessionAggregator();
  let done = null;
  agg.on('session-complete', (e) => { done = e; });
  agg.ingest(parsePacket(sessionPacket(5))); // qualifying, nessuna Final Classification
  assert.equal(done, null);
});

test('Motion → traiettoria: il giro veloce (car 1) finisce in payload.lapTraces', () => {
  const agg = new SessionAggregator({ collectorVersion: 'test' });
  let done = null;
  agg.on('session-complete', (e) => { done = e; });

  agg.ingest(parsePacket(participantsPacket(
    [
      { name: 'MaxP_TM', platform: 1, raceNumber: 1, teamId: 2, showNames: true },
      { name: 'CharlesLec', platform: 1, raceNumber: 16, teamId: 1, showNames: true },
    ], 2)));
  agg.ingest(parsePacket(sessionPacket(15))); // Race

  // Giro 1 in corso: la traiettoria di car 1 si accumula lungo una linea
  // (punti distanziati 10 m → oltre la soglia di decimazione ~6 m).
  agg.ingest(parsePacket(lapDataPacket([null, { currentLapNum: 1, lastLapTimeInMS: 0 }])));
  for (let f = 0; f < 25; f++) {
    agg.ingest(parsePacket(motionPacket([null, { x: f * 10, y: 0, z: 5 }])));
  }

  // Il giro 1 si chiude (currentLapNum→2, lastLapTimeInMS = tempo del giro 1).
  agg.ingest(parsePacket(lapDataPacket([null, { currentLapNum: 2, lastLapTimeInMS: 81000 }])));
  agg.ingest(parsePacket(motionPacket([null, { x: 0, y: 0, z: 0 }]))); // frame che innesca la transizione

  agg.ingest(parsePacket(finalClassificationPacket([
    { position: 1, numLaps: 50, grid: 1, points: 25, pits: 1, resultStatus: 3, bestLapMs: 81000, totalRaceTimeS: 3600.0, penS: 0, numStints: 1, stintsVisual: [16] },
    { position: 2, numLaps: 50, grid: 2, points: 18, pits: 1, resultStatus: 3, bestLapMs: 82000, totalRaceTimeS: 3605.5, penS: 0, numStints: 1, stintsVisual: [16] },
  ])));

  assert.ok(done, 'session-complete emesso');
  const traces = done.payload.lapTraces;
  assert.ok(Array.isArray(traces), 'lapTraces è un array');
  const t = traces.find((x) => x.carIndex === 1);
  assert.ok(t, 'traiettoria presente per car 1');
  assert.equal(t.lap, 1, 'il giro veloce è il giro 1');
  assert.equal(t.timeMs, 81000);
  assert.ok(t.points.length >= 20, 'punti decimati accumulati');
  assert.ok(Array.isArray(t.points[0]) && t.points[0].length === 2, 'ogni punto è [x, z]');
});
