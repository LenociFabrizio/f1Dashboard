/* =============================================================
   feed.js — Bacheca social: composer (foto/video + tag) e feed post
   ============================================================= */
import api, { token } from '../core/api.js';
import auth from '../core/auth.js';
import { mountChrome, avatarUrl } from '../core/components.js';
import { $, esc, loader, toast, fmtDate, confirmDialog, debounce } from '../core/ui.js';
import { prepareMedia } from '../core/media.js';

const fmtMB = (bytes) => (bytes / (1024 * 1024)).toFixed(1) + ' MB';

mountChrome();

const me = auth.user;
let allUsers = [];           // per il tag picker
const selectedTags = new Map(); // user_id -> {id, display_name, handle}
let pendingMedia = null;     // { url, type } dopo l'upload

/* ---------------- Upload media ---------------- */
/** Upload multipart con avanzamento reale (XHR) verso il fallback locale. */
function xhrUpload(path, formData, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api' + path);
    const tk = token.get();
    if (tk) xhr.setRequestHeader('Authorization', 'Bearer ' + tk);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.({ percentage: Math.round((e.loaded / e.total) * 100), loaded: e.loaded, total: e.total });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); } catch { resolve(null); }
      } else {
        let msg = `Errore ${xhr.status}`;
        try { msg = JSON.parse(xhr.responseText).message || msg; } catch { /* testo non-JSON */ }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error('Errore di rete durante il caricamento'));
    xhr.send(formData);
  });
}

let uploadCfg = null; // cache di /posts/upload-config
let blobClientPromise = null; // preload del client Vercel Blob

function preloadUploader() {
  if (!uploadCfg) {
    api.get('/posts/upload-config', {}, { auth: false })
      .then((c) => { uploadCfg = c; if (c?.direct) blobClientPromise = import('https://esm.sh/@vercel/blob@0.27.3/client'); })
      .catch(() => {});
  }
}

async function uploadMedia(file, { onProgress } = {}) {
  const cfg = uploadCfg || (uploadCfg = await api.get('/posts/upload-config', {}, { auth: false }));
  const safe = (file.name || 'media').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 60);
  const kind = (file.type || '').startsWith('video') ? 'video' : 'image';

  if (cfg.direct) {
    // Upload diretto browser → Vercel Blob (nessun limite serverless)
    const { upload } = await (blobClientPromise || (blobClientPromise = import('https://esm.sh/@vercel/blob@0.27.3/client')));
    const blob = await upload(`posts/${safe}`, file, {
      access: 'public',
      handleUploadUrl: '/api/posts/upload',
      clientPayload: token.get() || '',
      contentType: file.type || undefined,
      multipart: file.size > 8 * 1024 * 1024,
      onUploadProgress: (e) => onProgress?.({
        percentage: Math.round(e.percentage ?? (e.total ? (e.loaded / e.total) * 100 : 0)),
        loaded: e.loaded, total: e.total,
      }),
    });
    return { url: blob.url, type: kind };
  }
  // Fallback locale (sviluppo): multipart via server con avanzamento XHR
  const fd = new FormData();
  fd.append('media', file);
  return xhrUpload('/posts/media-local', fd, { onProgress });
}

/* ---------------- Barra di avanzamento ---------------- */
function setProgress(label, pct, hint) {
  const bar = $('#upload-bar');
  if (!bar) return;
  bar.hidden = false;
  $('#up-label').textContent = label;
  const fill = $('#up-fill');
  const pctEl = $('#up-pct');
  if (pct == null) {
    bar.classList.add('indeterminate');
    fill.style.width = '40%';
    pctEl.textContent = '';
  } else {
    bar.classList.remove('indeterminate');
    fill.style.width = `${pct}%`;
    pctEl.textContent = `${pct}%`;
  }
  $('#up-hint').textContent = hint || '';
}
function hideProgress() {
  const bar = $('#upload-bar');
  if (!bar) return;
  bar.hidden = true;
  bar.classList.remove('indeterminate');
  $('#up-fill').style.width = '0%';
  $('#up-pct').textContent = '';
  $('#up-hint').textContent = '';
}

/* ---------------- Tag picker ---------------- */
function renderChips() {
  const box = $('#tag-chips');
  if (!box) return;
  box.innerHTML = [...selectedTags.values()]
    .map(
      (u) => `<span class="tag-chip">@${esc(u.handle || u.display_name)}
        <button type="button" data-untag="${u.id}" aria-label="Rimuovi">&times;</button></span>`
    )
    .join('');
  box.querySelectorAll('[data-untag]').forEach((b) =>
    b.addEventListener('click', () => { selectedTags.delete(Number(b.dataset.untag)); renderChips(); })
  );
}

function renderTagResults(term) {
  const list = $('#tag-results');
  if (!list) return;
  const q = term.trim().toLowerCase();
  if (!q) { list.innerHTML = ''; list.classList.remove('open'); return; }
  const matches = allUsers
    .filter((u) => u.id !== me?.id && !selectedTags.has(u.id))
    .filter((u) => u.display_name.toLowerCase().includes(q) || (u.handle || '').toLowerCase().includes(q))
    .slice(0, 6);
  list.innerHTML = matches.length
    ? matches.map((u) => `
        <button type="button" class="tag-opt" data-tag="${u.id}">
          <img src="${avatarUrl(u)}" onerror="this.src='/images/avatars/default.svg'" alt="">
          <span><strong>${esc(u.display_name)}</strong> ${u.handle ? `<span class="text-lo">@${esc(u.handle)}</span>` : ''}</span>
        </button>`).join('')
    : '<div class="tag-opt text-lo" style="cursor:default">Nessun pilota trovato</div>';
  list.classList.add('open');
  list.querySelectorAll('[data-tag]').forEach((b) =>
    b.addEventListener('click', () => {
      const u = allUsers.find((x) => x.id === Number(b.dataset.tag));
      if (u) selectedTags.set(u.id, u);
      $('#tag-input').value = '';
      list.innerHTML = ''; list.classList.remove('open');
      renderChips();
    })
  );
}

/* ---------------- Composer ---------------- */
function mountComposer() {
  if (!auth.isLogged()) {
    $('#composer-mount').innerHTML = `
      <div class="card" style="text-align:center">
        <p class="text-mid" style="margin:0 0 12px">Accedi per pubblicare sulla bacheca.</p>
        <a href="/login.html" class="btn primary sm">Accedi</a>
      </div>`;
    return;
  }

  $('#composer-mount').innerHTML = `
    <div class="card composer">
      <div class="flex gap-3" style="align-items:flex-start">
        <img src="${avatarUrl(me)}" onerror="this.src='/images/avatars/default.svg'" class="avatar" style="width:44px;height:44px">
        <div style="flex:1;min-width:0">
          <textarea id="post-body" class="input" rows="3" maxlength="2000"
            placeholder="Condividi qualcosa con la lega, ${esc(me?.display_name || 'pilota')}..."></textarea>

          <div id="media-preview" class="media-preview" hidden></div>

          <div class="tag-field">
            <div id="tag-chips" class="tag-chips"></div>
            <input id="tag-input" class="input sm" type="text" placeholder="🏷️ Tagga un pilota (cerca per nome)…" autocomplete="off">
            <div id="tag-results" class="tag-results"></div>
          </div>

          <div class="composer-actions">
            <label class="btn ghost sm" style="cursor:pointer" title="Foto o video">
              📎 Foto / Video
              <input type="file" id="media-input" accept="image/*,video/*" hidden>
            </label>
            <span id="media-status" class="text-lo" style="font-size:0.82rem"></span>
            <button class="btn primary sm" id="publish-btn" style="margin-left:auto">Pubblica</button>
          </div>

          <div class="composer-hint">💡 <strong>Consiglio:</strong> per i video, taglia la clip il più possibile (bastano pochi secondi del momento clou): più è corta, più il caricamento in bacheca sarà rapido e leggero.</div>

          <div id="upload-bar" class="upload-progress" hidden>
            <div class="up-head"><span id="up-label">Caricamento…</span><span id="up-pct"></span></div>
            <div class="up-track"><i id="up-fill"></i></div>
            <div class="up-hint" id="up-hint"></div>
          </div>
        </div>
      </div>
    </div>`;

  // Tag picker
  $('#tag-input').addEventListener('input', debounce((e) => renderTagResults(e.target.value), 150));
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.tag-field')) $('#tag-results')?.classList.remove('open');
  });

  // Media selection + upload
  const mediaInput = $('#media-input');
  mediaInput.addEventListener('change', async () => {
    const file = mediaInput.files?.[0];
    if (!file) return;
    const isVideo = (file.type || '').startsWith('video');
    const isImage = (file.type || '').startsWith('image');
    if (!isVideo && !isImage) { toast.error('Seleziona una foto o un video.'); mediaInput.value = ''; return; }
    const status = $('#media-status');
    const publishBtn = $('#publish-btn');
    try {
      publishBtn.disabled = true;
      status.textContent = '';
      // 1) Compressione (foto sempre; video solo se pesante)
      setProgress('Preparazione…', null);
      const prepared = await prepareMedia(file, {
        onStatus: (s) => setProgress(s, null, 'Non chiudere questa pagina finché non è pronto.'),
        onProgress: (p) => setProgress('Compressione video…', p, 'Non chiudere questa pagina finché non è pronto.'),
      });
      const savedHint = prepared !== file ? `Ottimizzato: ${fmtMB(file.size)} → ${fmtMB(prepared.size)}` : '';
      // 2) Upload (diretto su Blob o fallback locale) con avanzamento reale.
      // Fase iniziale indeterminata: preparazione connessione/token (non è "bloccato").
      setProgress('Preparazione caricamento…', null, savedHint || 'Attendi il completamento prima di pubblicare.');
      pendingMedia = await uploadMedia(prepared, {
        onProgress: ({ percentage, loaded, total }) => {
          const mb = (loaded != null && total) ? `${fmtMB(loaded)} / ${fmtMB(total)}` : savedHint;
          setProgress('Caricamento…', percentage, mb || 'Attendi il completamento prima di pubblicare.');
        },
      });
      setProgress('Completato', 100, savedHint);
      setTimeout(hideProgress, 700);
      status.textContent = '✓ Media pronto da pubblicare';
      showMediaPreview(pendingMedia);
    } catch (err) {
      console.error(err);
      pendingMedia = null;
      hideProgress();
      status.textContent = '';
      toast.error(err.message || 'Upload non riuscito.');
    } finally {
      publishBtn.disabled = false;
      mediaInput.value = '';
    }
  });

  $('#publish-btn').addEventListener('click', publish);

  // Precarica configurazione upload + client Blob per ridurre l'attesa iniziale
  preloadUploader();
}

function showMediaPreview(media) {
  const box = $('#media-preview');
  if (!media) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  const el = media.type === 'video'
    ? `<video src="${esc(media.url)}" controls></video>`
    : `<img src="${esc(media.url)}" alt="Anteprima">`;
  box.innerHTML = `${el}<button type="button" class="media-remove" id="media-remove" aria-label="Rimuovi">&times;</button>`;
  $('#media-remove').addEventListener('click', () => {
    pendingMedia = null;
    $('#media-status').textContent = '';
    showMediaPreview(null);
  });
}

async function publish() {
  const body = $('#post-body').value.trim();
  if (!body && !pendingMedia) { toast.error('Scrivi qualcosa o allega una foto/video.'); return; }
  const btn = $('#publish-btn');
  btn.disabled = true; btn.textContent = 'Pubblico…';
  try {
    const created = await api.post('/posts', {
      body,
      media_url: pendingMedia?.url || null,
      media_type: pendingMedia?.type || null,
      tags: [...selectedTags.keys()],
    });
    // Reset composer
    $('#post-body').value = '';
    pendingMedia = null; showMediaPreview(null);
    selectedTags.clear(); renderChips();
    $('#media-status').textContent = '';
    prependPost(created);
    toast.success('Post pubblicato!');
  } catch (e) {
    toast.error(e.message || 'Pubblicazione non riuscita.');
  } finally {
    btn.disabled = false; btn.textContent = 'Pubblica';
  }
}

/* ---------------- Feed ---------------- */
function mediaBlock(p) {
  if (!p.media_url) return '';
  return p.media_type === 'video'
    ? `<div class="post-media"><video src="${esc(p.media_url)}" controls preload="metadata"></video></div>`
    : `<div class="post-media"><img src="${esc(p.media_url)}" alt="" loading="lazy"></div>`;
}

function tagsBlock(p) {
  if (!p.tags?.length) return '';
  return `<div class="post-tags">🏷️ ${p.tags
    .map((t) => `<a href="/driver.html?id=${t.user_id}">@${esc(t.handle || t.display_name)}</a>`)
    .join(' ')}</div>`;
}

function postCard(p) {
  const canDelete = auth.isLogged() && (me?.id === p.author_id || auth.isAdmin());
  const color = p.author_team_color || 'var(--f1-red)';
  return `
    <article class="card post" data-id="${p.id}">
      <header class="post-head">
        <a href="/driver.html?id=${p.author_id}" class="driver-cell">
          <img src="${avatarUrl({ avatar: p.author_avatar })}" onerror="this.src='/images/avatars/default.svg'" alt="" style="border:2px solid ${color}">
          <div>
            <div class="dc-name">${esc(p.author_name)}</div>
            <div class="dc-sub">${p.author_handle ? `@${esc(p.author_handle)} · ` : ''}${fmtDate(p.created_at, { withTime: true })}</div>
          </div>
        </a>
        ${canDelete ? `<button class="btn ghost sm post-del" data-del="${p.id}" title="Elimina" style="color:var(--danger)">Elimina</button>` : ''}
      </header>
      ${p.body ? `<p class="post-body">${esc(p.body)}</p>` : ''}
      ${mediaBlock(p)}
      ${tagsBlock(p)}
    </article>`;
}

function wireDelete(scope) {
  scope.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Eliminare il post?', danger: true, confirmText: 'Elimina' }))) return;
      try {
        await api.del(`/posts/${b.dataset.del}`);
        b.closest('.post')?.remove();
        if (!$('#feed').querySelector('.post')) renderEmpty();
        toast.success('Post eliminato.');
      } catch (e) { toast.error(e.message); }
    })
  );
}

function prependPost(p) {
  const feed = $('#feed');
  const empty = feed.querySelector('.empty');
  if (empty) feed.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.innerHTML = postCard(p);
  const node = wrap.firstElementChild;
  feed.prepend(node);
  wireDelete(node);
}

function renderEmpty() {
  $('#feed').innerHTML = '<div class="empty"><div class="em-ic">📭</div>Ancora nessun post. Sii il primo a pubblicare!</div>';
}

function renderFeed(posts) {
  const feed = $('#feed');
  if (!posts.length) { renderEmpty(); return; }
  feed.innerHTML = posts.map(postCard).join('');
  wireDelete(feed);
}

/* ---------------- Init ---------------- */
(async function init() {
  try {
    mountComposer();
    const reqs = [api.get('/posts', { limit: 50 }, { auth: false })];
    if (auth.isLogged()) reqs.push(api.get('/users', {}, { auth: false }));
    const [posts, users] = await Promise.all(reqs);
    allUsers = users || [];
    renderFeed(posts);
  } catch (e) {
    console.error(e);
    $('#feed').innerHTML = `<div class="empty" style="padding:60px"><div class="em-ic">⚠️</div>${esc(e.message)}</div>`;
  } finally {
    loader.hide();
  }
})();
