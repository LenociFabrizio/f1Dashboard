# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
I piloti della lega: un gruppo chiuso che corre un campionato amatoriale su F1 25 (EA Sports), da PC o console (PS5/Xbox). Entrano nel portale soprattutto dopo ogni Gran Premio, per lo più da telefono, per vedere risultati, classifiche piloti e costruttori, telemetria e statistiche, e per gestire il proprio profilo, il team e le richieste di riserva.

Audience secondaria: gli admin della lega, che importano i risultati dalla telemetria, gestiscono piloti, scuderie, calendario e riserve BOT, e approvano le richieste di cambio.

## Product Purpose
Dare alla lega un portale "ufficiale" che sostituisca fogli di calcolo e chat: risultati, classifiche e statistiche sempre coerenti e calcolati dai dati di gara, senza inserimento manuale. Successo = dopo ogni GP i piloti trovano tutto aggiornato e affidabile, e l'admin pubblica i risultati in pochi passaggi.

## Positioning
- **Telemetria automatica**: un collector Node.js ascolta la telemetria UDP di F1 25, produce un JSON di fine gara che l'admin rivede e importa. Niente trascrizione a mano dei risultati.
- **Feeling da F1 vera**: classifiche, pagine Gran Premio e profili pilota che fanno sentire il campionato un evento serio.
- **Regole trasparenti su team e riserve**: scuderie, riserve BOT e cambi team passano da approvazione admin; le classifiche mostrano chi ha sostituito chi e in quali round.
- **Statistiche dettagliate**: giri, confronti, record e storico per pilota e per GP.

## Operating Context
- Il ciclo tipico: gara su F1 25 → collector (sul PC di gioco o su un PC nella stessa rete della console) → invio JSON → staging → revisione e import da area admin → classifiche ricalcolate on-demand.
- Ruoli: `admin` e `pilota`. Login solo via email; l'identità pubblica del pilota è il suo @handle di gioco principale, con nome e cognome per il display name.
- Il pacchetto del collector si scarica dal portale (`public/downloads/F1-Collector.zip`), con guida per utenti non esperti (`collector/GUIDA-PS5.md`).

## Capabilities and Constraints
- Pagine: home, classifiche (piloti/costruttori), calendario, pagina GP, pilota, statistiche, dashboard, profilo, admin, collector, login/registrazione/reset password, privacy. La bacheca social esiste ma è nascosta.
- Regola classifica costruttori: somma dei punti dei piloti per la scuderia attuale, non per il team della singola gara.
- Stack esistente: Node.js + Express, libSQL/Turso, Vercel (serverless + statico), Vercel Blob per gli upload, frontend vanilla HTML/CSS/JS senza build step, Chart.js per i grafici.
- **Mobile prima di tutto**: la maggior parte dei piloti consulta il sito da telefono.
- **Solo italiano**: interfaccia, testi e messaggi restano in italiano.
- Aperto/non deciso: se il nome "Lega F1" sia definitivo; la politica sull'uso di riferimenti a marchi ufficiali (F1, FIA, EA, scuderie reali).

## Evidence on Hand
- Dati reali della lega nel database di produzione (Turso); in locale il seed contiene solo dati demo, da non spacciare per reali.
- Unico asset immagine di marca: `public/favicon.svg`; avatar di default in `public/images/avatars/default.svg`.
- Non esistono testimonianze, sponsor, partner o numeri pubblici sulla lega: non vanno inventati.

## Product Principles
1. **Il dato di gara è la fonte di verità**: tutto deriva dalla telemetria importata e dai risultati; niente valori duplicati o inseriti a mano quando si possono calcolare.
2. **Il post-gara su telefono è il momento chiave**: ciò che un pilota cerca subito dopo un GP (risultato, punti, posizione in classifica) deve essere immediato da mobile.
3. **Trasparenza delle regole**: riserve, sostituzioni BOT, cambi team e approvazioni devono essere visibili e comprensibili a tutti i piloti.
4. **Serietà da campionato vero**: il portale tratta una lega amatoriale con la cura di un campionato ufficiale.
5. **Admin con il minimo lavoro manuale**: ogni flusso amministrativo punta a rivedere e confermare, non a trascrivere.
