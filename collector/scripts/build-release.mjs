/**
 * build-release.mjs — Prepara il pacchetto Windows "a un click" del collector.
 * ------------------------------------------------------------
 * Uso (dall'admin, una volta):
 *   node scripts/build-release.mjs --ingest https://SITO/api/ingest/sessions --token XXXX [--zip]
 * oppure via variabili d'ambiente:
 *   COLLECTOR_INGEST_URL=... COLLECTOR_TOKEN=... node scripts/build-release.mjs --zip
 *
 * Produce collector/dist/F1-Collector/ (pronta da comprimere e condividere),
 * con config.json gia' valorizzato. Con --zip crea anche dist/F1-Collector.zip.
 * Zero dipendenze: usa solo Node built-in (+ PowerShell per lo zip).
 * ------------------------------------------------------------
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(DIST, 'F1-Collector');

/** Parsing minimale degli argomenti CLI (--chiave valore, --flag). */
function parseArgs(argv) {
  const out = { flags: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--zip') out.flags.add('zip');
    else if (a === '--ingest') out.ingest = argv[++i];
    else if (a === '--token') out.token = argv[++i];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const ingestUrl = args.ingest || process.env.COLLECTOR_INGEST_URL || '';
const collectorToken = args.token || process.env.COLLECTOR_TOKEN || '';

// File/cartelle da includere nel pacchetto (niente data/, runtime/, test/, dist/).
const INCLUDE = ['src', 'package.json', 'Avvia F1 Collector.bat', 'LEGGIMI-PRIMA.txt', 'config.example.json'];

function log(...a) { console.log(...a); }

// 1) Ripulisci e ricrea la cartella di output.
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// 2) Copia i file necessari.
for (const rel of INCLUDE) {
  const from = path.join(ROOT, rel);
  if (!fs.existsSync(from)) { log(`⚠️  Manca "${rel}" (salto).`); continue; }
  fs.cpSync(from, path.join(OUT, rel), { recursive: true });
}

// 3) Genera config.json. Priorità ai valori CLI/env; altrimenti si usano quelli
//    già presenti in config.example.json (che dovrebbero contenere URL + token).
const example = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.example.json'), 'utf-8'));
example.server = example.server || {};
if (ingestUrl) example.server.ingestUrl = ingestUrl;
if (collectorToken) example.server.collectorToken = collectorToken;
fs.writeFileSync(path.join(OUT, 'config.json'), JSON.stringify(example, null, 2) + '\n');

// Valori effettivi finiti nel pacchetto (per il messaggio di riepilogo).
const finalUrl = example.server.ingestUrl || '';
const finalToken = example.server.collectorToken || '';
const looksPlaceholder = (s) => !s || /il-tuo-sito|INCOLLA_QUI|<.*>/i.test(s);

log('✅ Pacchetto pronto in:', path.relative(process.cwd(), OUT));
if (looksPlaceholder(finalUrl) || looksPlaceholder(finalToken)) {
  log('⚠️  ATTENZIONE: URL del sito e/o token non impostati (sembrano segnaposto).');
  log('    Passa --ingest e --token (o COLLECTOR_INGEST_URL / COLLECTOR_TOKEN),');
  log('    oppure valorizzali in config.example.json prima di ricostruire.');
} else {
  log('   config.json valorizzato: URL =', finalUrl);
  log('   l\'utente finale non deve configurare nulla.');
}

// 4) Zip opzionale (via PowerShell Compress-Archive, nessuna dipendenza npm).
if (args.flags.has('zip')) {
  const zipPath = path.join(DIST, 'F1-Collector.zip');
  fs.rmSync(zipPath, { force: true });
  try {
    execFileSync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
        `Compress-Archive -Path '${OUT}\\*' -DestinationPath '${zipPath}' -Force`],
      { stdio: 'inherit' }
    );
    log('📦 ZIP creato:', path.relative(process.cwd(), zipPath));

    // 5) Pubblica lo ZIP tra i file statici del sito, così la pagina di download
    //    (public/collector.html → /downloads/F1-Collector.zip) lo serve subito.
    //    ROOT = collector/ ; il progetto sito sta un livello sopra.
    const publicDownloads = path.resolve(ROOT, '..', 'public', 'downloads');
    if (fs.existsSync(path.dirname(publicDownloads))) {
      fs.mkdirSync(publicDownloads, { recursive: true });
      const published = path.join(publicDownloads, 'F1-Collector.zip');
      fs.copyFileSync(zipPath, published);
      log('🌐 Pubblicato per il download dal sito:', path.relative(process.cwd(), published));
      log('   (ricorda di committare public/downloads/F1-Collector.zip per il deploy)');
    } else {
      log('ℹ️  Cartella public/ del sito non trovata: salto la pubblicazione per il download.');
    }
  } catch (err) {
    log('⚠️  Zip non riuscito (PowerShell non disponibile?). Comprimi a mano la cartella:', OUT);
  }
}

log('\nProssimo passo: comprimi/condividi la cartella. L\'utente scompatta e fa doppio-click su "Avvia F1 Collector.bat".');
