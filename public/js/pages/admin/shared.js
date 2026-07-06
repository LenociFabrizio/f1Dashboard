/* =============================================================
   admin/shared.js — Stato condiviso + helper per il pannello admin
   ============================================================= */
import api from '../../core/api.js';
import { el, esc, toast, modal } from '../../core/ui.js';

/** Cache condivisa fra le sezioni admin. */
export const state = {
  season: null,     // stagione attiva selezionata
  seasons: [],
  teams: [],
  users: [],
  circuits: [],
};

/** Carica/ricarica i dati di riferimento comuni. */
export async function loadRefs() {
  const [seasons, teams, users, circuits] = await Promise.all([
    api.get('/seasons'),
    api.get('/teams'),
    api.get('/users'),
    api.get('/circuits'),
  ]);
  state.seasons = seasons;
  state.teams = teams;
  state.users = users;
  state.circuits = circuits;
  if (!state.season) {
    state.season = seasons.find((s) => s.is_active) || seasons[0] || null;
  } else {
    state.season = seasons.find((s) => s.id === state.season.id) || seasons[0] || null;
  }
}

/* ---------------- Intestazione sezione ---------------- */
export function sectionHead(title, subtitle, actionsHtml = '') {
  return `
    <div class="flex justify-between items-center wrap gap-3" style="margin-bottom:24px">
      <div>
        <h1 style="margin:0;font-size:1.8rem">${esc(title)}</h1>
        ${subtitle ? `<p class="text-lo" style="margin:4px 0 0">${esc(subtitle)}</p>` : ''}
      </div>
      <div class="flex gap-2 wrap">${actionsHtml}</div>
    </div>`;
}

/* ---------------- Costruttore campi form ---------------- */
/**
 * Renderizza un campo da una spec.
 * spec: { name, label, type, options[], value, placeholder, required, min, max, hint, full }
 */
function fieldHtml(f, value) {
  const v = value ?? f.value ?? '';
  const req = f.required ? 'required' : '';
  let control;
  if (f.type === 'select') {
    const opts = (f.options || [])
      .map((o) => `<option value="${esc(String(o.value))}" ${String(o.value) === String(v) ? 'selected' : ''}>${esc(o.label)}</option>`)
      .join('');
    control = `<select class="select" name="${f.name}" ${req}>${opts}</select>`;
  } else if (f.type === 'textarea') {
    control = `<textarea class="textarea" name="${f.name}" rows="${f.rows || 4}" placeholder="${esc(f.placeholder || '')}" ${req}>${esc(v)}</textarea>`;
  } else if (f.type === 'checkbox') {
    control = `<label class="checkbox"><input type="checkbox" name="${f.name}" ${v ? 'checked' : ''}> ${esc(f.checkLabel || f.label)}</label>`;
    return `<div class="field ${f.full ? 'full' : ''}">${control}${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}</div>`;
  } else {
    const attrs = [
      `type="${f.type || 'text'}"`,
      `name="${f.name}"`,
      f.placeholder ? `placeholder="${esc(f.placeholder)}"` : '',
      f.min != null ? `min="${f.min}"` : '',
      f.max != null ? `max="${f.max}"` : '',
      f.step != null ? `step="${f.step}"` : '',
      req,
    ].join(' ');
    control = `<input class="input" ${attrs} value="${esc(v)}">`;
  }
  return `
    <div class="field ${f.full ? 'full' : ''}">
      <label>${esc(f.label)}${f.required ? ' *' : ''}</label>
      ${control}
      ${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}
    </div>`;
}

/**
 * Apre una modale-form. Ritorna una Promise che si risolve col risultato di
 * onSubmit (o null se annullata). onSubmit(values) può lanciare per bloccare.
 */
export function formModal({ title, fields, values = {}, submitText = 'Salva', size = '', onSubmit }) {
  return new Promise((resolve) => {
    const rows = fields.map((f) => fieldHtml(f, values[f.name])).join('');
    const content = `<div class="form-grid">${rows}</div>`;
    const btn = el('button', { class: 'btn primary', text: submitText });
    let settled = false;
    const m = modal({
      title, content, size, footer: [btn],
      onClose: () => { if (!settled) resolve(null); },
    });

    btn.addEventListener('click', async () => {
      const form = m.body;
      const out = {};
      for (const f of fields) {
        const input = form.querySelector(`[name="${f.name}"]`);
        if (!input) continue;
        if (f.type === 'checkbox') out[f.name] = input.checked ? 1 : 0;
        else if (f.type === 'number') out[f.name] = input.value === '' ? null : Number(input.value);
        else out[f.name] = input.value.trim() === '' ? null : input.value.trim();
      }
      // Validazione base
      for (const f of fields) {
        if (f.required && (out[f.name] == null || out[f.name] === '')) {
          toast.warning(`Il campo "${f.label}" è obbligatorio.`);
          return;
        }
      }
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner sm"></span> Salvataggio…';
      try {
        const result = await onSubmit(out);
        settled = true;
        m.close();
        resolve(result ?? true);
      } catch (err) {
        toast.error(err.message || 'Operazione fallita.');
        btn.disabled = false;
        btn.textContent = submitText;
      }
    });
  });
}

/** Opzioni <select> pronte per team / piloti / circuiti. */
export const opts = {
  teams: (includeEmpty = true) => [
    ...(includeEmpty ? [{ value: '', label: '— Nessun team —' }] : []),
    ...state.teams.map((t) => ({ value: t.id, label: t.name })),
  ],
  users: (includeEmpty = false) => [
    ...(includeEmpty ? [{ value: '', label: '— Nessuno —' }] : []),
    ...state.users.map((u) => ({ value: u.id, label: u.display_name || u.username })),
  ],
  circuits: () => state.circuits.map((c) => ({ value: c.id, label: `${c.name} (${c.country_code})` })),
  seasons: () => state.seasons.map((s) => ({ value: s.id, label: `${s.name} · ${s.year}` })),
};

/** Empty-state riutilizzabile. */
export function empty(icon, text) {
  return `<div class="empty"><div class="em-ic">${icon}</div>${esc(text)}</div>`;
}
