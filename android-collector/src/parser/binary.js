/**
 * parser/binary.js
 * ------------------------------------------------------------
 * Cursore di lettura sequenziale su un Buffer, little-endian.
 *
 * I pacchetti UDP F1 25 sono struct "packed" (nessun padding) in
 * little-endian: leggendo i campi NELL'ORDINE ESATTO del protocollo, gli
 * offset vengono calcolati da soli. Questo rende il parser robusto e la
 * validazione contro la specifica ufficiale una semplice verifica
 * dell'ORDINE e del TIPO dei campi (vedi parser/schemas.js), non di offset
 * numerici scritti a mano.
 *
 * NOTA (Android): usa il `Buffer` globale (polyfill `buffer`, vedi
 * polyfills.js). Nessuna dipendenza da moduli Node.
 * ------------------------------------------------------------
 */
export class Cursor {
  /** @param {Buffer} buffer @param {number} [offset] */
  constructor(buffer, offset = 0) {
    this.buf = buffer;
    this.off = offset;
  }

  get remaining() {
    return this.buf.length - this.off;
  }

  seek(offset) {
    this.off = offset;
    return this;
  }

  skip(n) {
    this.off += n;
    return this;
  }

  u8() {
    const v = this.buf.readUInt8(this.off);
    this.off += 1;
    return v;
  }
  i8() {
    const v = this.buf.readInt8(this.off);
    this.off += 1;
    return v;
  }
  u16() {
    const v = this.buf.readUInt16LE(this.off);
    this.off += 2;
    return v;
  }
  i16() {
    const v = this.buf.readInt16LE(this.off);
    this.off += 2;
    return v;
  }
  u32() {
    const v = this.buf.readUInt32LE(this.off);
    this.off += 4;
    return v;
  }
  i32() {
    const v = this.buf.readInt32LE(this.off);
    this.off += 4;
    return v;
  }
  /** uint64 → String (evita perdita di precisione: sessionUID è un id, non un numero). */
  u64() {
    const v = this.buf.readBigUInt64LE(this.off);
    this.off += 8;
    return v.toString();
  }
  f32() {
    const v = this.buf.readFloatLE(this.off);
    this.off += 4;
    return v;
  }
  f64() {
    const v = this.buf.readDoubleLE(this.off);
    this.off += 8;
    return v;
  }

  /** Legge N byte grezzi come Buffer (avanza il cursore). */
  bytes(n) {
    const b = this.buf.subarray(this.off, this.off + n);
    this.off += n;
    return b;
  }

  /**
   * Stringa UTF-8 di lunghezza fissa N byte, null-terminated.
   * (Participants/Lobby m_name è char[N] terminato da \0 e riempito di \0.)
   */
  charArray(n) {
    const raw = this.bytes(n);
    const end = raw.indexOf(0);
    return raw.toString('utf8', 0, end === -1 ? n : end).trim();
  }

  /** Array di `count` valori letti con un reader (es. c => c.u8()). */
  array(count, readFn) {
    const out = new Array(count);
    for (let i = 0; i < count; i++) out[i] = readFn(this);
    return out;
  }
}

export default Cursor;
