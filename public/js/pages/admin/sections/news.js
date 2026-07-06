/* =============================================================
   admin/sections/news.js — Gestione notizie del campionato
   ============================================================= */
import api from '../../../core/api.js';
import { esc, toast, confirmDialog, fmtDate } from '../../../core/ui.js';
import { state, sectionHead, formModal, empty } from '../shared.js';

const FIELDS = [
  { name: 'title', label: 'Titolo', required: true, placeholder: 'Titolo della notizia' },
  { name: 'body', label: 'Testo', type: 'textarea', rows: 6, required: true, full: true },
  { name: 'image', label: 'URL immagine (opzionale)', placeholder: '/uploads/...' },
];

function card(n) {
  return `
    <div class="card" style="display:flex;justify-content:space-between;gap:16px;align-items:start">
      <div>
        <div class="text-lo" style="font-size:0.78rem">${fmtDate(n.published_at, { withTime: true })} · ${esc(n.author_name || 'Admin')}</div>
        <div class="text-hi" style="font-weight:800;font-size:1.1rem;margin:4px 0">${esc(n.title)}</div>
        <p class="text-mid" style="margin:0;line-height:1.6">${esc(n.body)}</p>
      </div>
      <button class="btn ghost sm" data-del="${n.id}" style="color:var(--danger);flex:0 0 auto">Elimina</button>
    </div>`;
}

async function render(root) {
  const seasonId = state.season?.id;
  const news = await api.get('/news', seasonId ? { season_id: seasonId, limit: 50 } : { limit: 50 }, {});
  root.innerHTML = sectionHead('Notizie', 'Comunicati e novità mostrati in home e dashboard.',
    '<button class="btn primary sm" id="new-news">+ Nuova notizia</button>') +
    (news.length
      ? `<div class="flex" style="flex-direction:column;gap:14px">${news.map(card).join('')}</div>`
      : empty('📰', 'Nessuna notizia pubblicata.'));

  root.querySelector('#new-news').addEventListener('click', async () => {
    const ok = await formModal({
      title: 'Nuova notizia', fields: FIELDS, values: {},
      onSubmit: (v) => api.post('/news', { ...v, season_id: seasonId || null }),
    });
    if (ok) { toast.success('Notizia pubblicata.'); render(root); }
  });

  root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog({ title: 'Eliminare la notizia?', danger: true, confirmText: 'Elimina' }))) return;
    try { await api.del(`/news/${b.dataset.del}`); toast.success('Notizia eliminata.'); render(root); }
    catch (e) { toast.error(e.message); }
  }));
}

export default { render };
