/**
 * parser/index.js
 * ------------------------------------------------------------
 * Punto d'ingresso del parser: legge l'header comune e smista al
 * parser del corpo in base a m_packetId. I pacchetti non gestiti
 * ritornano null (vengono ignorati dall'aggregatore).
 * ------------------------------------------------------------
 */
import { Cursor } from './binary.js';
import {
  parseSession,
  parseLapData,
  parseEvent,
  parseParticipants,
  parseFinalClassification,
  parseSessionHistory,
  PACKET_ID,
} from './schemas.js';

/**
 * Header comune a tutti i pacchetti (F1 24/25) — 29 byte.
 * VALIDARE sull'Appendix ufficiale (stabile dal 2023).
 */
export function parseHeader(cursor) {
  return {
    packetFormat: cursor.u16(),          // es. 2025
    gameYear: cursor.u8(),               // es. 25
    gameMajorVersion: cursor.u8(),
    gameMinorVersion: cursor.u8(),
    packetVersion: cursor.u8(),
    packetId: cursor.u8(),
    sessionUID: cursor.u64(),            // stringa (id, non numero)
    sessionTime: cursor.f32(),
    frameIdentifier: cursor.u32(),
    overallFrameIdentifier: cursor.u32(),
    playerCarIndex: cursor.u8(),
    secondaryPlayerCarIndex: cursor.u8(),
  };
}

export const HEADER_SIZE = 29;

/**
 * Parsa un datagramma UDP.
 * @param {Buffer} buffer
 * @returns {object|null} { header, ...body } oppure null se pacchetto non gestito
 */
export function parsePacket(buffer) {
  if (!buffer || buffer.length < HEADER_SIZE) return null;
  const cursor = new Cursor(buffer);
  const header = parseHeader(cursor);

  switch (header.packetId) {
    case PACKET_ID.SESSION:
      return { header, ...parseSession(cursor, header) };
    case PACKET_ID.LAP_DATA:
      return { header, ...parseLapData(cursor, header, buffer) };
    case PACKET_ID.EVENT:
      return { header, ...parseEvent(cursor, header) };
    case PACKET_ID.PARTICIPANTS:
      return { header, ...parseParticipants(cursor, header, buffer) };
    case PACKET_ID.FINAL_CLASSIFICATION:
      return { header, ...parseFinalClassification(cursor, header, buffer) };
    case PACKET_ID.SESSION_HISTORY:
      return { header, ...parseSessionHistory(cursor, header) };
    default:
      return null; // pacchetto non necessario all'import
  }
}

export default parsePacket;
