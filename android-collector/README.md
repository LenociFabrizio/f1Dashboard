# F1 Telemetry Relay — app Android

App Android minimale il cui **unico scopo** è ricevere la telemetria UDP di
**F1 25** sulla stessa WiFi e inviarla al portale del campionato (lo stesso
endpoint del collector PC: `POST /api/ingest/sessions`).

È il gemello mobile di [`../collector`](../collector): riusa **identico** il core
di parsing/aggregazione (`src/parser`, `src/session`); cambiano solo i due bordi
I/O — il socket UDP (`react-native-udp`) e la coda (`AsyncStorage`) — più un
foreground service per restare attivo a schermo spento.

> Una PWA/pagina web non basta: i browser non possono aprire socket UDP. Serve
> un'app installata.

---

## Prerequisiti

- **Node.js** ≥ 18 sul PC (solo per lanciare i comandi).
- Un **account Expo** gratuito (https://expo.dev/signup) per la build in cloud.
- Nessun Android Studio / Android SDK necessario (compila EAS in cloud).

## Installazione dipendenze

```bash
cd android-collector
npm install          # se npm blocca sui peer di react-native-udp: npm install --legacy-peer-deps
npm i -g eas-cli
```

## Build dell'APK (EAS cloud)

```bash
eas login
eas build:configure          # collega il progetto al tuo account (una tantum)
eas build -p android --profile preview
```

A fine build EAS stampa un URL (e un QR). Aprilo **dal telefono**, scarica l'APK
e installalo (abilita "Installa app da origini sconosciute" se richiesto).
Il profilo `preview` produce un APK autonomo: non serve né Metro né il PC per
usarlo.

> Il socket UDP e le notifiche usano moduli nativi: **Expo Go non funziona**,
> serve questa build custom. Per iterare sul codice JS puoi invece usare il
> profilo `development` (`npm run build:dev`) + `npm start`.

## Uso

1. Telefono e console/PC **sulla stessa rete WiFi** (o usa il telefono come
   hotspot e collega la console ad esso).
2. Apri l'app, incolla il **token** (personale, dalla pagina *I miei tempi* del
   sito, oppure quello di lega). L'URL di ingest è già precompilato.
3. Premi **Avvia**: compare una notifica persistente "Telemetria F1 attiva" e lo
   stato passa a *in ascolto :20777*.
4. In **F1 25 → Impostazioni → Telemetria**:
   - *UDP Telemetry*: **On**
   - *UDP IP Address*: l'**IP di questo telefono** nella rete
   - *UDP Port*: **20777**
   - *UDP Send Rate*: 20–60 Hz va bene
5. Gioca. A fine sessione (uscita al menu per le prove a tempo, classifica per le
   gare) l'app accoda il JSON e lo invia; lo stato mostra *inviata* e la coda
   torna a 0. Senza rete resta in coda e riparte da solo appena torna la
   connessione.

### Note per gare lunghe (schermo spento)
- L'app usa un **foreground service** (la notifica persistente) per continuare a
  ricevere con lo schermo spento.
- Su Samsung/Xiaomi/Huawei disattiva l'**ottimizzazione batteria** per l'app
  (Impostazioni → App → F1 Telemetry Relay → Batteria → *Senza restrizioni*),
  altrimenti l'OS può chiuderla.

---

## Struttura

```
android-collector/
  index.js            entry: polyfills → registra foreground service → App
  polyfills.js        global.Buffer (necessario al parser)
  App.js              UI single-screen (token, URL, Avvia/Ferma, stato, istruzioni)
  metro.config.js     alias buffer/events/dgram
  app.json            config Expo (permessi, plugin notifee + FGS type)
  eas.json            profili build (preview APK / development)
  plugins/
    withForegroundServiceType.js   inietta android:foregroundServiceType="dataSync"
  src/
    parser/           IDENTICO al collector PC (binary, enums, schemas, index)
    session/          IDENTICO al collector PC (aggregator*, builder)
    net/uploader.js   come PC, drain async su AsyncStorage
    udp/listener.js   react-native-udp (al posto di node:dgram)
    store/queue.js    AsyncStorage (al posto di fs)
    plumbing.js       cablaggio + stato per la UI
    config.js         default (URL ingest, porta, tipi sessione)
```

\* `aggregator.js` differisce dal PC solo per l'import di `EventEmitter` (da
`events` invece di `node:events`).

## Lato server

Nessuna modifica: l'app è un client identico al collector PC. Con un **token
personale** i dati finiscono nella sezione *I miei tempi*; con il **token di
lega** nello staging admin.
