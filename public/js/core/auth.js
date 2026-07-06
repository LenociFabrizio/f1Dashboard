/* =============================================================
   auth.js — Stato di autenticazione lato client.
   Carica l'utente corrente, gestisce login/logout e le guardie
   di accesso alle pagine protette.
   ============================================================= */
import api, { token } from './api.js';

const USER_KEY = 'f1_user';

export const auth = {
  _user: null,

  /** Utente in cache (sincrono, può essere null). */
  get user() {
    if (this._user) return this._user;
    try {
      const raw = localStorage.getItem(USER_KEY);
      this._user = raw ? JSON.parse(raw) : null;
    } catch { this._user = null; }
    return this._user;
  },

  set user(u) {
    this._user = u;
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
    else localStorage.removeItem(USER_KEY);
  },

  isLogged() { return !!token.get(); },
  isAdmin() { return this.user?.role === 'admin'; },

  /** Salva sessione dopo login/registrazione. */
  setSession({ token: t, user }) {
    if (t) token.set(t);
    this.user = user;
  },

  /** Ricarica l'utente dal server (verifica il token). */
  async refresh() {
    if (!token.get()) { this.user = null; return null; }
    try {
      const data = await api.get('/auth/me');
      this.user = data.user || data;
      return this.user;
    } catch {
      this.logout(false);
      return null;
    }
  },

  async login(identifier, password) {
    const data = await api.post('/auth/login', { identifier, password }, { auth: false });
    this.setSession(data);
    return data.user;
  },

  async register(payload) {
    const data = await api.post('/auth/register', payload, { auth: false });
    this.setSession(data);
    return data.user;
  },

  async loginProvider(provider, handle) {
    const path = provider === 'psn' ? '/auth/psn' : '/auth/ea';
    const data = await api.post(path, { handle }, { auth: false });
    this.setSession(data);
    return data.user;
  },

  logout(redirect = true) {
    token.clear();
    this.user = null;
    if (redirect) window.location.href = '/login.html';
  },
};

/**
 * Guardia da chiamare in cima alle pagine protette.
 * @param {object} opts { admin: bool } — richiede ruolo admin
 * @returns {Promise<user|null>}
 */
export async function guard({ admin = false } = {}) {
  if (!auth.isLogged()) {
    const next = encodeURIComponent(location.pathname + location.search);
    location.href = `/login.html?next=${next}`;
    return null;
  }
  const user = auth.user || (await auth.refresh());
  if (!user) { location.href = '/login.html'; return null; }
  if (admin && user.role !== 'admin') {
    location.href = '/dashboard.html';
    return null;
  }
  return user;
}

export default auth;
