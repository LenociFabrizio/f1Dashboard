/* =============================================================
   views/index.js — Registro delle viste della app mobile.
   Ogni modulo esporta: { route, title, async render(root, ctx) }
   e render può restituire una funzione di cleanup.
   ============================================================= */
import home from './home.js';
import classifica from './classifica.js';
import calendario from './calendario.js';
import statistiche from './statistiche.js';
import profilo from './profilo.js';
import impostazioni from './impostazioni.js';

export const VIEWS = Object.freeze({ home, classifica, calendario, statistiche, profilo, impostazioni });

export default VIEWS;
