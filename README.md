# 🏎️ F1 Championship Portal

Portale ufficiale del campionato amatoriale **F1 25 (EA Sports)**: classifiche piloti/costruttori, statistiche, calendario gare, gestione risultati e qualifiche, area admin completa.

Stack: **Node.js + Express** (API) · **libSQL/Turso** (database SQLite serverless) · **Vercel Blob** (upload immagini) · frontend **vanilla** (HTML/CSS/JS + Chart.js). Deploy su **Vercel**.

---

## 🚀 Avvio in locale

Requisiti: Node.js ≥ 18.

```bash
npm install
cp .env.example .env        # su Windows: copy .env.example .env
npm run db:reset            # crea schema + dati demo (SQLite locale)
npm start                   # http://localhost:3000
```

In locale non serve nulla di esterno: il DB è un file SQLite (`server/database/f1.db`) e gli upload finiscono in `public/uploads/`.

**Credenziali demo**
- Admin → `admin@f1league.it` / `admin123`
- Pilota → `max@f1league.it` / `password123`

Script disponibili: `npm run dev` (watch), `npm run seed`, `npm run db:reset`.

---

## ☁️ Deploy su Vercel

Il progetto è già configurato per Vercel:
- `api/index.js` — l'app Express come funzione serverless (tutte le rotte `/api/*`, vedi `vercel.json`).
- `public/` — servito come statico dalla CDN.

### 1. Database — Turso (libSQL)
1. Crea un account su [turso.tech](https://turso.tech) e un database (oppure aggiungi Turso dal **Vercel Marketplace**).
2. Ottieni **Database URL** (`libsql://....turso.io`) e un **auth token**.
3. Popola lo schema + dati demo puntando al DB remoto (una tantum, dal tuo PC):
   ```bash
   DATABASE_URL="libsql://il-tuo-db.turso.io" DATABASE_AUTH_TOKEN="<token>" npm run db:reset
   ```
   > Su PowerShell: `$env:DATABASE_URL="..."; $env:DATABASE_AUTH_TOKEN="..."; npm run db:reset`

### 2. Upload immagini — Vercel Blob
Nel progetto Vercel: **Storage → Blob → Create**. Copia il `BLOB_READ_WRITE_TOKEN`.

### 3. Variabili d'ambiente su Vercel
Imposta (Project → Settings → Environment Variables):

| Variabile | Valore |
|---|---|
| `JWT_SECRET` | stringa lunga e casuale |
| `DATABASE_URL` | `libsql://il-tuo-db.turso.io` |
| `DATABASE_AUTH_TOKEN` | token Turso |
| `BLOB_READ_WRITE_TOKEN` | token Vercel Blob |

### 4. Deploy
Importa il repo GitHub su Vercel (framework preset: **Other**) e fai il deploy. Verifica:
```
GET https://<tuo-progetto>.vercel.app/api/health   →  { "status": "ok" }
```

---

## 📁 Struttura

```
api/                    funzione serverless Vercel (entry)
server/
  app.js                app Express (middleware, static, API)
  index.js              avvio locale
  config/               configurazione (env)
  database/             db.js (facade libSQL), schema.sql, seed.js
  routes/ controllers/  API REST
  services/             classifiche & statistiche (calcolo on-demand)
  middleware/           auth (JWT), upload (Blob), errori
public/                 frontend statico (pagine, css, js, immagini)
vercel.json             routing /api/* → funzione
```

## 🔐 Note
- Autenticazione via **JWT** (Bearer). I login PSN/EA sono **mock** ma il codice è predisposto per OAuth reale.
- Classifiche e statistiche sono calcolate **on-demand** dai risultati: restano sempre coerenti dopo ogni modifica.
