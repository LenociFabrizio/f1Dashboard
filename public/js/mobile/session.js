/* =============================================================
   session.js — Gestione della sessione scaduta nella vista app.
   Un 401 dalle API (ApiError.status) riporta al login con ritorno
   alla app; usato dal bootstrap e dai catch delle viste.
   ============================================================= */

export const LOGIN_URL = '/login.html?next=%2Fapp.html';

/**
 * @param {any} err  errore della richiesta (ApiError)
 * @returns {boolean} true se ha avviato il redirect al login
 */
export function handleAuthError(err) {
  if (err?.status === 401) {
    location.replace(LOGIN_URL);
    return true;
  }
  return false;
}
