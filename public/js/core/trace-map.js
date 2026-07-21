/* =============================================================
   core/trace-map.js — Mappa 2D interattiva del circuito + confronto traiettorie.

   Disegna la vista dall'alto del tracciato (ricostruita dai punti [x,z] del
   Motion packet) e permette di confrontare la "racing line" di due piloti in
   stile telemetria professionale (MoTeC / Garage61 / VRS), usando SOLO i dati
   già salvati (nessuna velocità per punto):

     - modalità CONFRONTO (due piloti) o TUTTI (overlay);
     - heatmap della DIFFERENZA laterale tra le due linee (connettori la cui
       intensità/spessore cresce con lo scostamento) → si vede subito dove un
       pilota entra meglio, frena prima, allarga o stringe;
     - evidenziazione del PUNTO di massima differenza (marker + metri);
     - zoom (rotella) e pan (trascinamento) fluidi, con reset;
     - tooltip su hover con la distanza locale tra le due traiettorie;
     - selezione rapida dei settori (approssimati per lunghezza d'arco).

   Colori: coppia pilota A/B validata CVD-safe (vedi skill dataviz); la
   differenza usa la tinta rossa di lega con intensità = magnitudine (alpha +
   spessore), quindi non compete con l'identità dei piloti.
   ============================================================= */
import { esc } from './ui.js';

// Coppia categoriale validata (ΔE CVD ~22, banda/contrasto OK su superficie scura).
const COL_A = '#2596c9';
const COL_B = '#c07d14';
const COL_DIFF = '#e10600';      // intensità differenza (magnitudine via alpha/spessore)
// Fallback categoriale (modalità "tutti", quando manca il colore team).
const CAT = ['#2596c9', '#c07d14', '#5fb85f', '#b06fd0', '#e0607a', '#3fb6c0', '#d0a53a', '#9a9a9a'];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function fmtLap(ms) {
  const n = Number(ms);
  if (!n || n <= 0) return '—';
  const m = Math.floor(n / 60000), s = Math.floor((n % 60000) / 1000), ml = Math.floor(n % 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(ml).padStart(3, '0')}`;
}

const dist2 = (ax, az, bx, bz) => (ax - bx) ** 2 + (az - bz) ** 2;

/** Distanza minima (e punto più vicino) da (x,z) alla polilinea `pts`. */
function nearest(x, z, pts) {
  let best = Infinity, bx = 0, bz = 0;
  for (let i = 0; i < pts.length; i++) {
    const d = dist2(x, z, pts[i][0], pts[i][1]);
    if (d < best) { best = d; bx = pts[i][0]; bz = pts[i][1]; }
  }
  return { dist: Math.sqrt(best), x: bx, z: bz };
}

/**
 * Monta la mappa interattiva dentro `container`.
 * @param {HTMLElement} container
 * @param {Array<{user_id,display_name,handle,team_color,best_lap_time_ms,points:number[][]}>} driversRaw
 * @returns {{destroy: Function}}
 */
export function mountTraceMap(container, driversRaw) {
  const drivers = (driversRaw || []).filter((d) => Array.isArray(d.points) && d.points.length > 1);
  if (!drivers.length) {
    container.innerHTML = '<div class="empty"><div class="em-ic">🗺️</div>Nessuna traiettoria disponibile (importa la gara con il collector aggiornato).</div>';
    return { destroy() {} };
  }

  // --- Bounding box del mondo (metri) su tutti i punti ---
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const d of drivers) for (const p of d.points) {
    if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
    if (p[1] < minZ) minZ = p[1]; if (p[1] > maxZ) maxZ = p[1];
  }
  const worldW = Math.max(1, maxX - minX), worldH = Math.max(1, maxZ - minZ);
  const wcx = (minX + maxX) / 2, wcz = (minZ + maxZ) / 2;
  const refTrack = drivers.reduce((a, b) => (b.points.length > a.points.length ? b : a), drivers[0]);

  // --- Stato interattivo ---
  const opts = drivers.map((d, i) => ({ i, name: d.display_name, lap: d.best_lap_time_ms }));
  const state = {
    mode: drivers.length >= 2 ? 'compare' : 'all',
    a: 0,
    b: drivers.length >= 2 ? 1 : 0,
    zoom: 1, panX: 0, panY: 0,
    visible: new Set(drivers.map((_, i) => i)),
    hover: null, // { sx, sy, text }
  };

  // --- DOM ---
  const driverOptions = (sel) => opts.map((o) => `<option value="${o.i}" ${o.i === sel ? 'selected' : ''}>${esc(o.name)} · ${fmtLap(o.lap)}</option>`).join('');
  container.innerHTML = `
    <div class="card trace-card">
      <div class="trace-toolbar">
        <div class="seg" role="tablist">
          <button class="seg-btn ${state.mode === 'compare' ? 'active' : ''}" data-mode="compare" ${drivers.length < 2 ? 'disabled' : ''}>Confronto</button>
          <button class="seg-btn ${state.mode === 'all' ? 'active' : ''}" data-mode="all">Tutti</button>
        </div>
        <div class="trace-compare ${state.mode === 'compare' ? '' : 'hidden'}">
          <label class="trace-pick"><span class="dot" style="background:${COL_A}"></span>
            <select class="select sm" id="tm-a">${driverOptions(state.a)}</select></label>
          <label class="trace-pick"><span class="dot" style="background:${COL_B}"></span>
            <select class="select sm" id="tm-b">${driverOptions(state.b)}</select></label>
        </div>
        <div class="trace-sectors">
          <button class="btn ghost sm" data-sector="0">Tutto</button>
          <button class="btn ghost sm" data-sector="1">S1</button>
          <button class="btn ghost sm" data-sector="2">S2</button>
          <button class="btn ghost sm" data-sector="3">S3</button>
          <button class="btn ghost sm" id="tm-reset" title="Reset zoom">⤢</button>
        </div>
      </div>
      <div class="trace-stage">
        <canvas class="trace-canvas"></canvas>
        <div class="trace-tip hidden"></div>
        <div class="trace-badge hidden"></div>
      </div>
      <div class="trace-legend"></div>
      <div class="hint trace-hint"></div>
    </div>`;

  const stage = container.querySelector('.trace-stage');
  const canvas = container.querySelector('.trace-canvas');
  const tip = container.querySelector('.trace-tip');
  const badge = container.querySelector('.trace-badge');
  const legendEl = container.querySelector('.trace-legend');
  const hintEl = container.querySelector('.trace-hint');
  const ctx = canvas.getContext('2d');

  let cw = 0, ch = 0, fitScale = 1;
  const recalcFit = () => {
    fitScale = Math.min(cw / (worldW * 1.12), ch / (worldH * 1.12));
  };
  const scale = () => fitScale * state.zoom;
  const toScreen = (x, z) => [cw / 2 + (x - wcx) * scale() + state.panX, ch / 2 - (z - wcz) * scale() + state.panY];
  const toWorld = (sx, sy) => [wcx + (sx - cw / 2 - state.panX) / scale(), wcz - (sy - ch / 2 - state.panY) / scale()];

  // --- Confronto: distanze per-punto tra A e B, e punto di massima differenza ---
  let diff = null; // { seg:[{ax,az,bx,bz,d}], max:{...}, maxD }
  function computeDiff() {
    diff = null;
    if (state.mode !== 'compare' || state.a === state.b) return;
    const A = drivers[state.a].points, B = drivers[state.b].points;
    const seg = [];
    let max = null, maxD = 0;
    for (const p of A) {
      const n = nearest(p[0], p[1], B);
      seg.push({ ax: p[0], az: p[1], bx: n.x, bz: n.z, d: n.dist });
      if (n.dist > maxD) { maxD = n.dist; max = { ax: p[0], az: p[1], bx: n.x, bz: n.z, d: n.dist }; }
    }
    diff = { seg, max, maxD };
  }

  // --- Disegno ---
  function drawLine(pts, color, width, alpha = 1) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const [sx, sy] = toScreen(pts[i][0], pts[i][1]);
      i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
    }
    ctx.strokeStyle = color; ctx.globalAlpha = alpha;
    ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.stroke(); ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.clearRect(0, 0, cw, ch);

    // Asfalto (traccia più completa), due bande sovrapposte.
    drawLine(refTrack.points, 'rgba(180,190,210,0.10)', 22);
    drawLine(refTrack.points, 'rgba(180,190,210,0.18)', 12);

    if (state.mode === 'compare' && diff && state.a !== state.b) {
      // Heatmap differenza: connettori A→B, intensità/spessore ∝ scostamento.
      const maxD = Math.max(1, diff.maxD);
      for (let i = 0; i < diff.seg.length; i += 1) {
        const s = diff.seg[i];
        const t = clamp(s.d / maxD, 0, 1);
        if (t < 0.06) continue; // salta gli scostamenti trascurabili (meno rumore)
        const [ax, ay] = toScreen(s.ax, s.az);
        const [bx, by] = toScreen(s.bx, s.bz);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
        ctx.strokeStyle = COL_DIFF; ctx.globalAlpha = 0.12 + 0.6 * t;
        ctx.lineWidth = 1 + 2.5 * t; ctx.lineCap = 'round';
        ctx.stroke(); ctx.globalAlpha = 1;
      }
      // Le due linee sopra i connettori.
      drawLine(drivers[state.a].points, COL_A, 2.4);
      drawLine(drivers[state.b].points, COL_B, 2.4);
      // Punto di massima differenza.
      if (diff.max) {
        const [mx, my] = toScreen((diff.max.ax + diff.max.bx) / 2, (diff.max.az + diff.max.bz) / 2);
        ctx.beginPath(); ctx.arc(mx, my, 6, 0, Math.PI * 2);
        ctx.fillStyle = COL_DIFF; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
      }
    } else {
      // Modalità "tutti": overlay delle linee visibili.
      drivers.forEach((d, i) => {
        if (!state.visible.has(i)) return;
        drawLine(d.points, d.team_color || CAT[i % CAT.length], 2.2, 0.95);
      });
    }

    // Traguardo (primo punto della traccia di riferimento).
    const sf = refTrack.points[0];
    if (sf) {
      const [fx, fy] = toScreen(sf[0], sf[1]);
      ctx.beginPath(); ctx.arc(fx, fy, 5, 0, Math.PI * 2);
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke();
    }
  }

  // --- Layout / DPR ---
  function resize() {
    const rect = stage.getBoundingClientRect();
    cw = Math.max(1, Math.round(rect.width));
    ch = Math.max(1, Math.round(rect.height));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    recalcFit();
    draw();
  }

  // --- Viste (reset / settori) ---
  function reset() { state.zoom = 1; state.panX = 0; state.panY = 0; draw(); }
  function fitBox(x0, x1, z0, z1) {
    const bw = Math.max(1, x1 - x0), bh = Math.max(1, z1 - z0);
    const s = Math.min(cw / (bw * 1.25), ch / (bh * 1.25));
    state.zoom = clamp(s / fitScale, 1, 40);
    const sc = scale();
    state.panX = (wcx - (x0 + x1) / 2) * sc;
    state.panY = ((z0 + z1) / 2 - wcz) * sc;
    draw();
  }
  function zoomToSector(n) {
    if (n === 0) return reset();
    // Settori approssimati: terzi per lunghezza d'arco cumulata della traccia.
    const pts = refTrack.points;
    let total = 0; const cum = [0];
    for (let i = 1; i < pts.length; i++) { total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(total); }
    const lo = total * (n - 1) / 3, hi = total * n / 3;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      if (cum[i] < lo || cum[i] > hi) continue;
      x0 = Math.min(x0, pts[i][0]); x1 = Math.max(x1, pts[i][0]);
      z0 = Math.min(z0, pts[i][1]); z1 = Math.max(z1, pts[i][1]);
    }
    if (x0 === Infinity) return;
    fitBox(x0, x1, z0, z1);
  }

  // --- Legenda + hint ---
  function renderLegend() {
    if (state.mode === 'compare') {
      const a = drivers[state.a], b = drivers[state.b];
      legendEl.innerHTML = `
        <span class="trace-leg static"><span class="dot" style="background:${COL_A}"></span><span class="text-hi">${esc(a.display_name)}</span><span class="mono text-lo">${fmtLap(a.best_lap_time_ms)}</span></span>
        <span class="trace-leg static"><span class="dot" style="background:${COL_B}"></span><span class="text-hi">${esc(b.display_name)}</span><span class="mono text-lo">${fmtLap(b.best_lap_time_ms)}</span></span>`;
      hintEl.innerHTML = state.a === state.b
        ? 'Scegli due piloti diversi per confrontarne le traiettorie.'
        : `I tratti rossi mostrano <b>quanto</b> le linee differiscono (più intensi = scostamento maggiore). Il punto rosso è la <b>massima differenza</b>. Rotella per zoomare, trascina per spostare, passa il mouse per la distanza locale.`;
    } else {
      legendEl.innerHTML = drivers.map((d, i) => `
        <button type="button" class="trace-leg ${state.visible.has(i) ? 'active' : ''}" data-vis="${i}">
          <span class="dot" style="background:${d.team_color || CAT[i % CAT.length]}"></span>
          <span class="text-hi">${esc(d.display_name)}</span>
          <span class="mono text-lo">${fmtLap(d.best_lap_time_ms)}</span>
        </button>`).join('');
      hintEl.innerHTML = 'Vista dall\'alto del circuito con la <b>traiettoria del giro veloce</b> di ogni pilota · clicca un nome per mostrare/nascondere · rotella per zoomare, trascina per spostare.';
    }
    legendEl.querySelectorAll('[data-vis]').forEach((btn) => btn.addEventListener('click', () => {
      const i = Number(btn.dataset.vis);
      if (state.visible.has(i)) state.visible.delete(i); else state.visible.add(i);
      btn.classList.toggle('active');
      draw();
    }));
  }

  // Badge "Δ massimo" sopra il canvas (compare).
  function renderBadge() {
    if (state.mode === 'compare' && diff && diff.max) {
      badge.textContent = `Δ max ${diff.maxD.toFixed(1)} m`;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  function refresh() { computeDiff(); renderLegend(); renderBadge(); draw(); }

  // --- Eventi ---
  const onWheel = (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const [wx, wz] = toWorld(mx, my);
    state.zoom = clamp(state.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 1, 40);
    const sc = scale();
    state.panX = mx - cw / 2 - (wx - wcx) * sc;
    state.panY = my - ch / 2 + (wz - wcz) * sc;
    hideTip();
    draw();
  };
  // Pan (1 dito / mouse) + pinch-zoom (2 dita) via Pointer Events: stesso
  // codice su desktop e mobile. touch-action:none (CSS) impedisce al browser
  // di intercettare il gesto (scroll/zoom pagina) sopra il canvas.
  const pointers = new Map(); // pointerId -> {x, y}
  let pinchPrev = null;       // { dist, cx, cy }
  const centroid = () => {
    const p = [...pointers.values()];
    return { dist: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), cx: (p[0].x + p[1].x) / 2, cy: (p[0].y + p[1].y) / 2 };
  };
  const onDown = (e) => {
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) pinchPrev = centroid();
    canvas.classList.add('grabbing');
    hideTip();
  };
  const onMove = (e) => {
    const rect = canvas.getBoundingClientRect();
    if (!pointers.has(e.pointerId)) {
      // hover (solo mouse): tooltip con la distanza locale tra le linee
      if (e.pointerType === 'mouse' && pointers.size === 0) showTipAt(e.clientX - rect.left, e.clientY - rect.top);
      return;
    }
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      // Pinch: mantieni fermo il punto-mondo sotto il centro del gesto.
      const cur = centroid();
      if (pinchPrev && pinchPrev.dist > 0) {
        const [wx, wz] = toWorld(pinchPrev.cx - rect.left, pinchPrev.cy - rect.top);
        state.zoom = clamp(state.zoom * (cur.dist / pinchPrev.dist), 1, 40);
        const sc = scale();
        state.panX = (cur.cx - rect.left) - cw / 2 - (wx - wcx) * sc;
        state.panY = (cur.cy - rect.top) - ch / 2 + (wz - wcz) * sc;
      }
      pinchPrev = cur;
      hideTip(); draw();
    } else {
      // Pan con un dito / mouse.
      state.panX += e.clientX - prev.x;
      state.panY += e.clientY - prev.y;
      hideTip(); draw();
    }
  };
  const onUp = (e) => {
    pointers.delete(e.pointerId);
    canvas.releasePointerCapture?.(e.pointerId);
    if (pointers.size < 2) pinchPrev = null;
    if (pointers.size === 0) canvas.classList.remove('grabbing');
  };

  function hideTip() { tip.classList.add('hidden'); state.hover = null; }
  function showTipAt(mx, my) {
    if (state.mode !== 'compare' || !diff || state.a === state.b) { hideTip(); return; }
    const [wx, wz] = toWorld(mx, my);
    // punto della linea A più vicino al cursore → distanza locale tra le linee
    let best = Infinity, seg = null;
    for (const s of diff.seg) {
      const d = dist2(wx, wz, s.ax, s.az);
      if (d < best) { best = d; seg = s; }
    }
    // solo se il cursore è ragionevolmente vicino alla traccia
    if (!seg || Math.sqrt(best) > worldW * 0.06 / state.zoom + 8) { hideTip(); return; }
    const [ax, ay] = toScreen(seg.ax, seg.az);
    tip.textContent = `Δ ${seg.d.toFixed(1)} m`;
    tip.style.left = `${ax}px`; tip.style.top = `${ay}px`;
    tip.classList.remove('hidden');
    // evidenzia il punto puntato
    draw();
    ctx.beginPath(); ctx.arc(ax, ay, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
  }

  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hideTip(); });

  container.querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => {
    if (b.disabled) return;
    state.mode = b.dataset.mode;
    container.querySelectorAll('.seg-btn').forEach((x) => x.classList.toggle('active', x === b));
    container.querySelector('.trace-compare').classList.toggle('hidden', state.mode !== 'compare');
    refresh();
  }));
  const selA = container.querySelector('#tm-a'), selB = container.querySelector('#tm-b');
  selA.addEventListener('change', () => { state.a = Number(selA.value); refresh(); });
  selB.addEventListener('change', () => { state.b = Number(selB.value); refresh(); });
  container.querySelectorAll('[data-sector]').forEach((b) => b.addEventListener('click', () => zoomToSector(Number(b.dataset.sector))));
  container.querySelector('#tm-reset').addEventListener('click', reset);

  const ro = new ResizeObserver(() => resize());
  ro.observe(stage);

  // init
  resize();
  refresh();

  return {
    destroy() {
      ro.disconnect();
    },
  };
}

export default { mountTraceMap };
