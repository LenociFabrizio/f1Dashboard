/**
 * mailer.js
 * ------------------------------------------------------------
 * Invio email transazionali tramite Resend (https://resend.com).
 * Usa la fetch nativa di Node (>=18): nessuna dipendenza aggiuntiva.
 *
 * Se `config.mail.resendApiKey` è vuoto il mailer NON invia nulla e
 * restituisce { delivered:false, reason:'not-configured' }. In sviluppo
 * stampa in console l'anteprima (incluso l'eventuale link) così il flusso
 * resta testabile senza configurare un provider.
 * ------------------------------------------------------------
 */
import { config } from '../config/config.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Invia una email.
 * @param {{to:string, subject:string, html:string, text?:string}} msg
 * @returns {Promise<{delivered:boolean, id?:string, reason?:string}>}
 */
export async function sendEmail({ to, subject, html, text }) {
  if (!to) return { delivered: false, reason: 'no-recipient' };

  if (!config.mail.enabled) {
    // Nessun provider configurato: log utile in sviluppo, silenzioso in prod.
    if (!config.isProd()) {
      console.log('\n[mailer] RESEND_API_KEY non configurata — email NON inviata.');
      console.log(`[mailer] A: ${to}`);
      console.log(`[mailer] Oggetto: ${subject}`);
      if (text) console.log(`[mailer] Testo:\n${text}\n`);
    }
    return { delivered: false, reason: 'not-configured' };
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.mail.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: config.mail.from, to, subject, html, text }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Invio email fallito (${res.status}): ${detail.slice(0, 300)}`);
  }
  const data = await res.json().catch(() => ({}));
  return { delivered: true, id: data?.id };
}

/** Template HTML/testo per il reset password. */
export function sendPasswordResetEmail(to, resetUrl, displayName = '') {
  const name = displayName ? ` ${displayName}` : '';
  const subject = 'Reimposta la tua password · Lega F1';
  const text =
    `Ciao${name},\n\n` +
    `hai richiesto di reimpostare la password del tuo account Lega F1.\n` +
    `Apri questo link per scegliere una nuova password (valido 1 ora):\n\n` +
    `${resetUrl}\n\n` +
    `Se non hai richiesto tu il reset, ignora questa email: la password non verrà cambiata.\n`;
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#111">
    <div style="background:#e10600;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
      <h1 style="margin:0;font-size:20px">🏎️ Lega F1</h1>
    </div>
    <div style="border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px;padding:24px">
      <p>Ciao${name},</p>
      <p>hai richiesto di reimpostare la password del tuo account. Clicca il pulsante qui sotto
      per sceglierne una nuova. Il link è valido <strong>1 ora</strong>.</p>
      <p style="text-align:center;margin:28px 0">
        <a href="${resetUrl}" style="background:#e10600;color:#fff;text-decoration:none;
           padding:12px 24px;border-radius:8px;font-weight:700;display:inline-block">
          Reimposta password
        </a>
      </p>
      <p style="font-size:13px;color:#666">Se il pulsante non funziona, copia e incolla questo indirizzo nel browser:<br>
        <a href="${resetUrl}" style="color:#e10600;word-break:break-all">${resetUrl}</a>
      </p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
      <p style="font-size:13px;color:#666">Se non hai richiesto tu il reset, ignora questa email:
      la tua password non verrà modificata.</p>
    </div>
  </div>`;
  return sendEmail({ to, subject, html, text });
}

export default { sendEmail, sendPasswordResetEmail };
