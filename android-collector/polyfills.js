// polyfills.js
// ------------------------------------------------------------
// DEVE essere importato per PRIMO (prima di qualunque modulo del parser),
// perché parser/binary.js e parser/schemas.js usano il `Buffer` globale.
// ------------------------------------------------------------
import { Buffer } from 'buffer';

if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}
