/**
 * parser/schemas.js
 * ------------------------------------------------------------
 * Parser del CORPO dei pacchetti F1 25 (dopo l'header di 29 byte).
 *
 * Fonte: specifica ufficiale "Data Output from F1 25 v3" (EA SPORTS F1 25
 * UDP Specification) + parser di riferimento F1 25 (MacManley/f1-25-udp).
 * Le struct sono PACKED, little-endian: leggendo i campi in ordine gli
 * offset tornano da soli (vedi binary.js). Per validare basta confrontare
 * l'ordine/tipo dei campi con l'Appendix.
 *
 * Note di versione (F1 25 vs F1 24), incorporate qui:
 *   - Participants: invariato (60 byte/vettura, name char[48], techLevel u16).
 *   - Final Classification: F1 24 = 45 byte/vettura; F1 25 può aggiungere
 *     un byte m_resultReason dopo m_resultStatus (→ 46). Gestito in modo
 *     robusto ricavando lo "stride" dalla lunghezza del pacchetto.
 *   - Lap Data: 57 byte/vettura.
 * ------------------------------------------------------------
 */
import { HEADER_SIZE } from './index.js';

export const PACKET_ID = {
  SESSION: 1,
  LAP_DATA: 2,
  EVENT: 3,
  PARTICIPANTS: 4,
  CAR_STATUS: 7,
  FINAL_CLASSIFICATION: 8,
  LOBBY_INFO: 9,
  CAR_DAMAGE: 10,
  SESSION_HISTORY: 11,
};

const NUM_CARS = 22;

// ------------------------------------------------------------
//  SESSION (id 1) — leggiamo la testa confermata del pacchetto.
//  (Il tail — safety car periods ecc. — è version-sensitive: non
//  necessario all'import, quindi non lo leggiamo.)
// ------------------------------------------------------------
export function parseSession(c /*, header */) {
  return {
    weather: c.u8(),            // 0 clear … 5 storm
    trackTemperature: c.i8(),
    airTemperature: c.i8(),
    totalLaps: c.u8(),
    trackLength: c.u16(),
    sessionType: c.u8(),        // vedi enums.SESSION_TYPE
    trackId: c.i8(),            // -1 sconosciuto
    formula: c.u8(),
    numSafetyCarPeriods: null,  // non letto (offset del tail non garantito su F1 25)
  };
}

// ------------------------------------------------------------
//  PARTICIPANTS (id 4)
//  ⚠️ F1 25 ha cambiato questa struct rispetto a F1 24:
//     - m_name ridotto da char[48] a char[32];
//     - aggiunti campi "livery colours".
//  Per essere robusti tra versioni:
//     - i campi PRIMA del nome (offset 0-6) sono stabili e letti diretti;
//     - il NOME è null-terminated: lo leggiamo senza dipendere dalla
//       larghezza del campo (32 o 48);
//     - lo "stride" per vettura è ricavato dalla lunghezza del pacchetto;
//     - i campi DOPO il nome (platform/showOnlineNames) dipendono dalla
//       versione: layout selezionato su m_packetFormat.
//  Solo i campi utili all'identità pilota vengono estratti.
// ------------------------------------------------------------
const PARTICIPANT_PRE_NAME = 7; // aiControlled..nationality

/**
 * Estrae platform e showOnlineNames (che seguono il nome), la cui posizione
 * dipende dalla versione (il nome è char[32] su F1 25, char[48] su F1 24).
 * Offset relativi all'inizio della sub-struct ParticipantData:
 *   F1 25: name[32]→ showOnlineNames @40, platform @43  (struct 57 byte)
 *   F1 24: name[48]→ showOnlineNames @56, platform @59  (struct 60 byte)
 * Fonte: "Data Output from F1 25 v3" (ufficiale EA).
 */
function parseParticipantTail(buffer, base, isF1_25) {
  const SHOW_OFFSET = isF1_25 ? 40 : 56;
  const PLATFORM_OFFSET = isF1_25 ? 43 : 59;
  const showOff = base + SHOW_OFFSET;
  const platOff = base + PLATFORM_OFFSET;
  return {
    showOnlineNames: showOff < buffer.length ? buffer.readUInt8(showOff) : undefined,
    platform: platOff < buffer.length ? buffer.readUInt8(platOff) : undefined,
  };
}

export function parseParticipants(c, header, buffer) {
  const numActiveCars = c.u8();
  const arrayStart = HEADER_SIZE + 1; // 30
  const stride = Math.floor((buffer.length - arrayStart) / NUM_CARS);
  const isF1_25 = (header.packetFormat ?? 0) >= 2025;

  const participants = [];
  for (let i = 0; i < NUM_CARS; i++) {
    const base = arrayStart + i * stride;
    c.seek(base);
    const aiControlled = c.u8();
    const driverId = c.u8();
    const networkId = c.u8();
    const teamId = c.u8();
    const myTeam = c.u8();
    const raceNumber = c.u8();
    const nationality = c.u8();

    // Nome: null-terminated a partire da base+7, fino al limite della vettura.
    const nameStart = base + PARTICIPANT_PRE_NAME;
    const nameMax = base + stride;
    const nul = buffer.indexOf(0, nameStart);
    const nameEnd = nul === -1 || nul > nameMax ? nameMax : nul;
    const name = buffer.toString('utf8', nameStart, nameEnd).trim();

    // Campi dopo il nome: posizione dipendente dalla versione.
    const { platform, showOnlineNames } = parseParticipantTail(buffer, base, isF1_25);

    participants.push({
      aiControlled, driverId, networkId, teamId, myTeam, raceNumber, nationality,
      name, platform, showOnlineNames,
    });
  }
  return { numActiveCars, participants };
}

// ------------------------------------------------------------
//  FINAL CLASSIFICATION (id 8) — robusto a 45 (F1 24) / 46 (F1 25) byte.
//  Ricava lo stride dalla lunghezza del pacchetto:
//    body = numCars(1) + NUM_CARS * itemSize  →  itemSize = (len-30)/NUM_CARS
// ------------------------------------------------------------
export function parseFinalClassification(c, _header, buffer) {
  const numCars = c.u8();
  const arrayStart = HEADER_SIZE + 1; // 30
  const stride = Math.floor((buffer.length - arrayStart) / NUM_CARS);
  const hasResultReason = stride >= 46; // F1 25 inserisce m_resultReason (u8)

  const cars = [];
  for (let i = 0; i < NUM_CARS; i++) {
    const base = arrayStart + i * stride;
    c.seek(base);
    const car = {
      position: c.u8(),
      numLaps: c.u8(),
      gridPosition: c.u8(),
      points: c.u8(),
      numPitStops: c.u8(),
      resultStatus: c.u8(),
    };
    if (hasResultReason) car.resultReason = c.u8(); // F1 25
    car.bestLapTimeInMS = c.u32();
    car.totalRaceTime = c.f64();      // SECONDI (double)
    car.penaltiesTime = c.u8();
    car.numPenalties = c.u8();
    car.numTyreStints = c.u8();
    car.tyreStintsActual = c.array(8, (x) => x.u8());
    car.tyreStintsVisual = c.array(8, (x) => x.u8());
    car.tyreStintsEndLaps = c.array(8, (x) => x.u8());
    cars.push(car);
  }
  return { numCars, cars };
}

// ------------------------------------------------------------
//  EVENT (id 3) — codice 4 char + dettaglio per alcuni eventi.
// ------------------------------------------------------------
export function parseEvent(c /*, header */) {
  const code = c.charArray(4);
  const detail = {};
  switch (code) {
    case 'FTLP': // Fastest Lap
      detail.vehicleIdx = c.u8();
      detail.lapTime = c.f32();
      break;
    case 'RCWN': // Race Winner
    case 'RTMT': // Retirement
    case 'DTSV': // Drive-through served
    case 'SGSV': // Stop-go served
      detail.vehicleIdx = c.u8();
      break;
    default:
      break; // SSTA/SEND/CHQF/RDFL/… nessun dettaglio utile qui
  }
  return { code, detail };
}

// ------------------------------------------------------------
//  LAP DATA (id 2) — 57 byte/vettura. Solo i campi utili alla live view.
//  Offset interni confermati dalla specifica F1 25.
// ------------------------------------------------------------
const LAPDATA_ITEM_SIZE = 57;
const LAPDATA_TRAILING = 2; // m_timeTrialPBCarIdx, m_timeTrialRivalCarIdx

export function parseLapData(c, _header, buffer) {
  // Stride robusto: usa la dimensione nota, ma verifica con la lunghezza.
  const usable = buffer.length - HEADER_SIZE - LAPDATA_TRAILING;
  const stride = usable >= NUM_CARS * LAPDATA_ITEM_SIZE
    ? LAPDATA_ITEM_SIZE
    : Math.floor(usable / NUM_CARS);

  const cars = [];
  for (let i = 0; i < NUM_CARS; i++) {
    const base = HEADER_SIZE + i * stride;
    if (base + 36 > buffer.length) break;
    c.seek(base);
    const lastLapTimeInMS = c.u32();     // offset 0
    c.seek(base + 32);
    const carPosition = c.u8();          // offset 32
    const currentLapNum = c.u8();        // offset 33
    const pitStatus = c.u8();            // offset 34
    const numPitStops = c.u8();          // offset 35
    cars.push({ lastLapTimeInMS, carPosition, currentLapNum, pitStatus, numPitStops });
  }
  return { cars };
}
