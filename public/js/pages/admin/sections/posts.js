/* =============================================================
   admin/sections/posts.js — Moderazione bacheca (post degli utenti)
   ============================================================= */
import api from '../../../core/api.js';
import { esc, toast, confirmDialog, fmtDate } from '../../../core/ui.js';
import { avatarUrl } from '../../../core/components.js';
import { sectionHead, empty } from '../shared.js';

function card(p) {
  const media = p.media_url
    ? (p.media_type === 'video'
        ? `<video src="${esc(p.media_url)}" controls style="max-width:180px;border-radius:var(--r-sm)"></video>`
        : `<img src="${esc(p.media_url)}" alt="" style="max-width:180px;border-radius:var(--r-sm)">`)
    : '';
  const tags = p.tags?.length ? `<div class="text-lo" style="font-size:0.82rem;margin-top:6px">🏷️ ${p.tags.map((t) => '@' + esc(t.username)).join(' ')}</div>` : '';
  return `
    <div class="card" style="display:flex;justify-content:space-between;gap:16px;align-items:start">
      <div style="min-width:0;flex:1">
        <div class="flex items-center gap-2">
          <img src="${avatarUrl({ avatar: p.author_avatar })}" onerror="this.src='/images/avatars/default.svg'" style="width:30px;height:30px;border-radius:50%">
          <div class="text-hi" style="font-weight:700">${esc(p.author_name)} <span class="text-lo" style="font-weight:400">@${esc(p.author_username)}</span></div>
        </div>
        <div class="text-lo" style="font-size:0.76rem;margin:4px 0">${fmtDate(p.created_at, { withTime: true })}</div>
        ${p.body ? `<p class="text-mid" style="margin:6px 0;line-height:1.6">${esc(p.body)}</p>` : ''}
        ${media}
        ${tags}
      </div>
      <button class="btn ghost sm" data-del="${p.id}" style="color:var(--danger);flex:0 0 auto">Elimina</button>
    </div>`;
}

async function render(root) {
  const posts = await api.get('/posts', { limit: 100 }, {});
  root.innerHTML = sectionHead('Bacheca', 'Post pubblicati dagli utenti. Puoi eliminare qualsiasi contenuto inappropriato.') +
    (posts.length
      ? `<div class="flex" style="flex-direction:column;gap:14px">${posts.map(card).join('')}</div>`
      : empty('📭', 'Nessun post pubblicato.'));

  root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog({ title: 'Eliminare il post?', danger: true, confirmText: 'Elimina' }))) return;
    try { await api.del(`/posts/${b.dataset.del}`); toast.success('Post eliminato.'); render(root); }
    catch (e) { toast.error(e.message); }
  }));
}

export default { render };
