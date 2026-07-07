/* =============================================================
   media.js — Compressione lato client di foto e video prima
   dell'upload in bacheca.
   - Foto: ridimensionamento + ricodifica via canvas (nessuna dipendenza).
   - Video: ricompressione con ffmpeg.wasm SOLO sopra una soglia
     (caricato da CDN on-demand). In caso di errore si usa l'originale.
   ============================================================= */

/* ---------------- Utility ---------------- */
function renameExt(name, mime) {
  const ext = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png', 'video/mp4': 'mp4' }[mime] || 'bin';
  const base = (name || 'media').replace(/\.[^.]+$/, '');
  return `${base}.${ext}`;
}

async function loadBitmap(file) {
  // createImageBitmap gestisce l'orientamento EXIF quando supportato
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch { /* fallback sotto */ }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

/* ---------------- Foto ---------------- */
const IMG_COMPRESSIBLE = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Comprime un'immagine ridimensionandola e ricodificandola.
 * Restituisce l'originale se non c'è guadagno o il formato non è gestibile
 * (es. GIF animate, SVG).
 */
export async function compressImage(file, { maxDim = 1920, quality = 0.82 } = {}) {
  if (!IMG_COMPRESSIBLE.includes(file.type)) return file;
  let bitmap;
  try { bitmap = await loadBitmap(file); } catch { return file; }

  const w = bitmap.width, h = bitmap.height;
  if (!w || !h) { bitmap.close?.(); return file; }

  const scale = Math.min(1, maxDim / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = tw; canvas.height = th;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, tw, th);
  bitmap.close?.();

  // PNG → WebP (mantiene la trasparenza e comprime bene); jpeg/webp restano tali
  const outMime = file.type === 'image/png' ? 'image/webp' : file.type;
  const blob = await new Promise((res) => canvas.toBlob(res, outMime, quality));
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], renameExt(file.name, blob.type), { type: blob.type });
}

/* ---------------- Video (ffmpeg.wasm on-demand) ---------------- */
const FF_VER = '0.12.10';
const FF_UTIL_VER = '0.12.1';
const FF_CORE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
let ffmpegPromise = null;

async function getFFmpeg() {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
        import(`https://esm.sh/@ffmpeg/ffmpeg@${FF_VER}`),
        import(`https://esm.sh/@ffmpeg/util@${FF_UTIL_VER}`),
      ]);
      const ff = new FFmpeg();
      await ff.load({
        coreURL: await toBlobURL(`${FF_CORE}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${FF_CORE}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      return ff;
    })().catch((e) => { ffmpegPromise = null; throw e; });
  }
  return ffmpegPromise;
}

/**
 * Ricomprime un video SOLO se supera thresholdMB. Altrimenti restituisce
 * l'originale (l'upload diretto su Blob gestisce comunque file grandi).
 * In caso di errore di caricamento/compressione, ritorna l'originale.
 */
export async function compressVideoIfNeeded(file, { thresholdMB = 50, onProgress, onStatus } = {}) {
  if (!file.type.startsWith('video')) return file;
  if (file.size <= thresholdMB * 1024 * 1024) return file;

  try {
    onStatus?.('Compressione video… può richiedere qualche minuto');
    const ff = await getFFmpeg();
    const { fetchFile } = await import(`https://esm.sh/@ffmpeg/util@${FF_UTIL_VER}`);

    const onProg = ({ progress }) => onProgress?.(Math.max(0, Math.min(99, Math.round((progress || 0) * 100))));
    ff.on('progress', onProg);

    const IN = 'in.dat', OUT = 'out.mp4';
    await ff.writeFile(IN, await fetchFile(file));
    await ff.exec([
      '-i', IN,
      '-vf', "scale='min(1280,iw)':-2",
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      OUT,
    ]);
    const data = await ff.readFile(OUT);
    ff.off?.('progress', onProg);
    await ff.deleteFile(IN).catch(() => {});
    await ff.deleteFile(OUT).catch(() => {});

    const blob = new Blob([data.buffer], { type: 'video/mp4' });
    if (blob.size >= file.size) return file; // nessun guadagno
    return new File([blob], renameExt(file.name, 'video/mp4'), { type: 'video/mp4' });
  } catch (e) {
    console.warn('Compressione video non riuscita, uso il file originale:', e);
    onStatus?.('Compressione non disponibile: caricamento del file originale…');
    return file;
  }
}

/**
 * Prepara un media (foto o video) per l'upload, comprimendolo se opportuno.
 */
export async function prepareMedia(file, { onStatus, onProgress } = {}) {
  if (file.type.startsWith('image')) {
    onStatus?.('Ottimizzazione foto…');
    return compressImage(file);
  }
  if (file.type.startsWith('video')) {
    return compressVideoIfNeeded(file, { onStatus, onProgress });
  }
  return file;
}
