# 🎮➡️💻 Guida facile: collegare la PS5 al PC per la telemetria

Questa guida spiega **passo per passo**, senza dare nulla per scontato, come far arrivare i dati
di gara di **F1 25 su PlayStation 5** al **PC** che gira il *collector*, così che finiscano
in automatico sul sito del campionato.

> **L'idea in una frase:** la PS5 non salva la telemetria, la **spedisce via rete** a un altro
> dispositivo. Quel dispositivo è il **PC** (sulla stessa rete di casa) che la ascolta e la manda al sito.
> Non serve installare niente sulla PlayStation.

```
  PS5 (F1 25)  ──── rete di casa (Wi-Fi/cavo) ────▶  PC con il collector  ──── Internet ────▶  Sito
```

---

## ✅ Cosa ti serve

- **Una PS5** con **F1 25**.
- **Un PC** (Windows, Mac o Linux) acceso **mentre giochi**, collegato **alla stessa rete** della PS5
  (stesso router/Wi-Fi di casa). Va bene anche un vecchio portatile.
- Entrambi sulla **stessa rete**: PS5 e PC devono vedere lo stesso Wi-Fi/router.
  (Uno può stare via cavo e l'altro via Wi-Fi: l'importante è che sia lo **stesso router**.)

> Non hai bisogno di comprare nulla. Se però vuoi un dispositivo piccolo sempre acceso dedicato
> allo scopo, un **Raspberry Pi** va benissimo (stessa procedura). **Tablet e smartphone no**:
> iPhone/iPad non sono adatti, Android solo con soluzioni complicate — usa un PC.

---

## 🧩 Cosa installare sul PC

Sul PC serve **una sola cosa**: **Node.js** (è il "motore" che fa funzionare il collector).

### Installare Node.js
1. Vai su **https://nodejs.org**
2. Scarica la versione **LTS** (il pulsante grande a sinistra, quello "consigliato").
3. Apri il file scaricato e clicca sempre **Avanti / Next** fino a **Fine** (vanno bene le opzioni predefinite).
4. Per verificare che sia installato: apri il **terminale** e scrivi:
   - **Windows:** premi `Tasto Windows`, scrivi `PowerShell`, invio. Poi digita `node -v`
   - **Mac:** apri **Terminale**, digita `node -v`

   Se vedi un numero tipo `v20.11.0` (basta che sia **18 o superiore**), è a posto. ✅

Non serve installare altro: il collector usa solo strumenti già inclusi in Node.

---

## 📁 Passo 1 — Preparare il collector sul PC

1. Copia sul PC la cartella **`collector`** del progetto (se hai già il progetto del sito, è dentro di esso).
2. Apri il terminale **dentro quella cartella**. Su Windows: apri la cartella `collector`,
   tieni premuto **Shift**, tasto destro in un punto vuoto → **"Apri finestra PowerShell qui"**.
3. Crea il file di configurazione copiando quello di esempio:
   - **Windows (PowerShell):** `copy config.example.json config.json`
   - **Mac/Linux:** `cp config.example.json config.json`
4. Apri `config.json` con un editor di testo (Blocco note va bene) e imposta **due valori** che ti dà
   l'amministratore del sito:
   ```jsonc
   {
     "udp": { "port": 20777, "host": "0.0.0.0" },   // ← lascia così com'è
     "server": {
       "ingestUrl": "https://IL-TUO-SITO.vercel.app/api/ingest/sessions",  // ← te lo dà l'admin
       "collectorToken": "IL-TOKEN-CHE-TI-DA-L-ADMIN"                       // ← te lo dà l'admin
     },
     "live": { "enabled": true, "port": 4600 }       // ← lascia così
   }
   ```
   - `ingestUrl` = l'indirizzo del sito dove finiscono i dati.
   - `collectorToken` = la "password" che autorizza l'invio.
   - **Non toccare** `"host": "0.0.0.0"`: significa "ascolta da qualsiasi dispositivo della rete",
     ed è proprio ciò che serve per ricevere dalla PS5.

> Se non hai `ingestUrl`/`collectorToken`, il collector funziona lo stesso e mostra la gara nella
> **vista live** locale (vedi Passo 5), ma non invia nulla al sito finché non li imposti.

---

## 🔎 Passo 2 — Trovare l'indirizzo IP del PC

La PS5 deve sapere **a chi** mandare i dati: cioè l'**indirizzo IP locale del PC** sulla rete di casa.

- **Windows:** nel terminale digita `ipconfig` e premi invio. Cerca la riga **"Indirizzo IPv4"**:
  è qualcosa come `192.168.1.50`.
- **Mac:** *Impostazioni di Sistema → Rete* → seleziona la connessione attiva → leggi l'**Indirizzo IP**.

📝 **Annotati questo numero** (es. `192.168.1.50`): ti serve tra poco sulla PS5.

> Di solito inizia con `192.168.` oppure `10.`. Se cambia ogni tanto, puoi chiedere al router
> di assegnare sempre lo stesso IP al PC ("IP statico / prenotazione DHCP"), ma non è obbligatorio.

---

## 🔥 Passo 3 — Permettere la connessione nel firewall del PC

La prima volta che avvii il collector, Windows potrebbe chiedere il permesso di rete:
clicca **"Consenti accesso"** (spunta almeno **Reti private**).

Se non appare l'avviso e più avanti "non arriva niente", apri manualmente la porta:
- Windows: cerca **"Windows Defender Firewall con sicurezza avanzata"** → *Regole connessioni in entrata*
  → *Nuova regola* → **Porta** → **UDP** → porta specifica **20777** → **Consenti** → dai un nome ("F1 Telemetria").

---

## ▶️ Passo 4 — Avviare il collector sul PC

Nel terminale, sempre dentro la cartella `collector`:

```bash
npm start
```

Quando parte, vedrai un messaggio che dice che è **in ascolto sulla porta 20777**. Lascialo aperto:
deve restare acceso **per tutto il tempo che giochi**. Per fermarlo, premi `Ctrl + C`.

---

## 🎛️ Passo 5 — Configurare F1 25 sulla PS5

Sulla PlayStation, dentro **F1 25**, vai in:
**Impostazioni → Telemetria** *(Game Options → Settings → Telemetry Settings)* e imposta:

| Opzione | Valore da mettere |
|---|---|
| **UDP Telemetry** | **On** |
| **UDP Broadcast Mode** | **Off** |
| **UDP IP Address** | **l'IP del PC** annotato al Passo 2 (es. `192.168.1.50`) |
| **UDP Port** | **20777** |
| **UDP Send Rate** | 20–60 (va bene 30) |
| **UDP Format** | **2025** |
| **Your Telemetry** | **Public** |
| **Show online names** | **On** |

> ⚠️ La cosa **più importante** è l'**UDP IP Address**: deve essere l'indirizzo del **PC**, non
> `127.0.0.1`. (`127.0.0.1` significa "me stesso" e serve solo quando giochi *sullo stesso PC*.)

---

## 👀 Passo 6 — Verificare che funzioni

1. Con il collector avviato e la PS5 configurata, entra in una **sessione** su F1 25
   (basta anche una prova libera per il test).
2. Sul PC apri il browser a questo indirizzo: **http://localhost:4600**
3. Se vedi comparire la **classifica live** che si aggiorna, ✅ **il collegamento funziona!**

A fine gara il collector prepara automaticamente il riassunto e lo invia al sito (se hai impostato
`ingestUrl` e `collectorToken`). Poi l'amministratore lo rivede e lo importa nel campionato.

---

## 💡 Cose utili da sapere

- **Basta UNA PS5 nella lobby.** La telemetria di F1 contiene i dati di **tutte** le vetture della
  sessione. Quindi in una gara online **non serve che tutti** attivino la telemetria: è sufficiente
  che **un solo giocatore** (di solito chi ospita) la invii al PC per registrare l'intera gara di tutti.
- **La PS5 e il PC devono restare sulla stessa rete.** Se cambi Wi-Fi o il PC va in stand-by, il
  collegamento si interrompe.
- **Le "Traiettorie" (linea di gara):** funzionano anche da PS5, senza fare nulla in più — fanno parte
  dello stesso flusso di dati.

---

## 🛠️ Non funziona? Controlli rapidi

| Sintomo | Cosa controllare |
|---|---|
| A `http://localhost:4600` non compare nulla | Il collector è avviato (`npm start`) e sei **in una sessione** di gioco? |
| Sul PC "non arriva niente" | 1) L'**IP** sulla PS5 è davvero quello del PC? 2) **Porta 20777**? 3) **Firewall**: hai consentito l'accesso (Passo 3)? |
| PS5 e PC non si "vedono" | Sono sullo **stesso router/Wi-Fi**? (No reti "ospite" separate, no VPN attive.) |
| `node -v` dà errore o versione < 18 | Reinstalla **Node.js LTS** dal Passo *Cosa installare*. |
| Arrivano i dati ma non vanno sul sito | Hai messo `ingestUrl` e `collectorToken` corretti in `config.json`? Chiedi conferma all'admin. |

---

📎 Per i dettagli tecnici (formato dati, struttura del progetto, protocollo UDP) vedi il
[README del collector](README.md).
