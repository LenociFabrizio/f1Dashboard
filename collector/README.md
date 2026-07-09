# 🏎️ F1 Telemetry Collector

Piccolo programma **Node.js** da eseguire sul PC di gioco. Ascolta la telemetria **UDP di F1 25**, riconosce automaticamente inizio/fine sessione, aggrega i dati e invia al portale del campionato un **JSON compatto di fine gara**. L'admin del sito poi lo rivede e lo importa.

- **Nessuna dipendenza esterna**: usa solo moduli nativi di Node (`dgram`, `http`, `fs`).
- **Robusto offline**: le sessioni vengono accodate su disco e inviate appena la rete torna.
- **Vista live locale** (facoltativa) per controllare la classifica in tempo reale.

> 🎮 **Giochi su console (PS5/Xbox)?** Il collector gira su un **altro PC della stessa rete** e la
> console gli invia i dati via UDP. Guida passo-passo per non esperti: **[GUIDA-PS5.md](GUIDA-PS5.md)**.

## Requisiti

- Node.js ≥ 18 sul PC di gioco.
- F1 25 con la telemetria UDP attiva.

## Configurare F1 25

`Impostazioni → Telemetria` (Game Options → Settings → Telemetry Settings):

| Opzione | Valore |
|---|---|
| UDP Telemetry | **On** |
| UDP Broadcast Mode | Off (invio al solo PC locale) |
| UDP IP Address | `127.0.0.1` (se il collector gira sullo stesso PC) |
| UDP Port | **20777** |
| UDP Send Rate | 20–60 Hz |
| **UDP Format** | **2025** |
| Your Telemetry | Public |
| Show online names | **On** *(consigliato: senza, i nickname possono risultare oscurati)* |

> **Da console** (PS5/Xbox) l'`UDP IP Address` **non** è `127.0.0.1` ma l'**IP del PC** che gira il
> collector sulla stessa rete (es. `192.168.1.50`) — vedi [GUIDA-PS5.md](GUIDA-PS5.md).

## Installazione e avvio

```bash
cd collector
cp config.example.json config.json   # Windows: copy config.example.json config.json
# modifica config.json: ingestUrl del sito + collectorToken
npm start
```

`config.json`:

```jsonc
{
  "udp": { "port": 20777, "host": "0.0.0.0" },
  "server": {
    "ingestUrl": "https://<tuo-sito>.vercel.app/api/ingest/sessions",
    "collectorToken": "<lo stesso COLLECTOR_TOKEN impostato sul sito>"
  },
  "live": { "enabled": true, "port": 4600 },
  "buffer": { "dir": "./data/queue" },
  "captureSessionTypes": ["race", "sprint", "qualifying"]
}
```

Override rapidi via ambiente: `COLLECTOR_INGEST_URL`, `COLLECTOR_TOKEN`, `COLLECTOR_UDP_PORT`.

Con `live.enabled` la classifica in tempo reale è su `http://localhost:4600`.

## Come funziona

```
F1 25 ──UDP──▶ listener ─▶ parser ─▶ aggregator ─┬─▶ buffer (disco) ─▶ uploader ──HTTPS──▶ sito
                                                  └─▶ live view (locale)
```

1. **listener** riceve i datagrammi UDP (porta 20777).
2. **parser** decodifica l'header e i pacchetti utili (Participants, Session, Lap Data, Event, Final Classification).
3. **aggregator** accumula lo stato e rileva la fine sessione (Final Classification / evento SEND).
4. Il **builder** produce il JSON compatto (solo dati aggregati: partecipanti, qualifica, classifica finale — niente telemetria grezza ad alta frequenza).
5. Il JSON va nel **buffer su disco** e l'**uploader** lo invia al sito con retry/backoff.

## Struttura

```
src/
  index.js            entry: cablaggio dei moduli
  config.js           caricamento config.json + override da env
  udp/listener.js     socket UDP
  parser/
    binary.js         Cursor di lettura sequenziale (little-endian, packed)
    enums.js          enum del protocollo → stringhe (sessione, meteo, gomme…)
    schemas.js        ORDINE + TIPO dei campi per pacchetto (da validare sul PDF ufficiale)
    index.js          parsePacket(buffer) → oggetto
  session/
    aggregator.js     stato sessione + rilevamento inizio/fine
    builder.js        stato → JSON di ingest (il "contratto")
  store/buffer-store.js   coda persistente su disco
  net/uploader.js         invio HTTPS con retry
  live/server.js          vista live locale
```

## Nota sul protocollo

I layout sono **validati sulla specifica ufficiale F1 25** ("Data Output from F1 25 v3", EA), con conferma incrociata su parser di riferimento F1 25. Punti chiave verificati:

- header **29 byte**; `ParticipantData` **57 byte** (`m_name` è `char[32]` in F1 25, ridotto da 48; `platform` @ offset 43); `FinalClassificationData` **46 byte** con il nuovo campo `m_resultReason` (F1 24 era 45); `LapData` **57 byte**.
- Il parser legge i campi **in ordine** (struct *packed*, little-endian): validare significa confrontare ordine/tipo dei campi in [`src/parser/schemas.js`](src/parser/schemas.js).
- Robustezza alle versioni: lo *stride* per vettura di Participants e Final Classification è ricavato dalla lunghezza del pacchetto, e i campi post-nome sono selezionati su `m_packetFormat` (F1 25 vs F1 24). Aggiornamenti futuri si gestiscono lì.
