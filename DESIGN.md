---
name: Lega F1
description: Il portale del campionato amatoriale F1 25, in notturna.
colors:
  rosso-corsa: "#e10600"
  rosso-corsa-scuro: "#b30500"
  rosso-corsa-acceso: "#ff2d24"
  rosso-corsa-tenue: "#ff7b76"
  asfalto-notte: "#0a0a0c"
  asfalto-sezione: "#101014"
  carbonio: "#16161c"
  carbonio-elevato: "#1d1d25"
  grafite: "#26262f"
  grafite-chiara: "#33333f"
  bianco-fari: "#ffffff"
  argento-testo: "#c7c7d1"
  grigio-pitlane: "#8a8a99"
  grigio-spento: "#5c5c6b"
  verde-pista-libera: "#2ecc71"
  giallo-bandiera: "#f1c40f"
  rosso-errore: "#e74c3c"
  blu-telemetria: "#3aa0ff"
  oro-podio: "#ffd54a"
  argento-podio: "#d5d9de"
  bronzo-podio: "#cd7f32"
typography:
  display:
    fontFamily: "Titillium Web, system-ui, sans-serif"
    fontSize: "clamp(2rem, 5vw, 3.4rem)"
    fontWeight: 900
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Titillium Web, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 3.5vw, 2.3rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Titillium Web, system-ui, sans-serif"
    fontSize: "1.35rem"
    fontWeight: 700
    lineHeight: 1.15
  body:
    fontFamily: "Titillium Web, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Titillium Web, system-ui, sans-serif"
    fontSize: "0.74rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.08em"
  numeral:
    fontFamily: "Titillium Web, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 900
    lineHeight: 1
    fontFeature: "'tnum'"
rounded:
  sm: "6px"
  md: "10px"
  lg: "16px"
  xl: "24px"
  pill: "999px"
spacing:
  sp-1: "4px"
  sp-2: "8px"
  sp-3: "12px"
  sp-4: "16px"
  sp-5: "24px"
  sp-6: "32px"
  sp-7: "48px"
  sp-8: "64px"
components:
  button-primary:
    backgroundColor: "{colors.rosso-corsa}"
    textColor: "{colors.bianco-fari}"
    rounded: "{rounded.sm}"
    padding: "11px 20px"
  button-primary-hover:
    backgroundColor: "{colors.rosso-corsa-acceso}"
    textColor: "{colors.bianco-fari}"
  button-ghost:
    backgroundColor: "{colors.carbonio}"
    textColor: "{colors.bianco-fari}"
    rounded: "{rounded.sm}"
    padding: "11px 20px"
  button-ghost-hover:
    backgroundColor: "{colors.carbonio-elevato}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.argento-testo}"
    rounded: "{rounded.sm}"
    padding: "11px 20px"
  card:
    backgroundColor: "{colors.carbonio}"
    rounded: "{rounded.lg}"
    padding: "{spacing.sp-5}"
  input:
    backgroundColor: "{colors.asfalto-sezione}"
    textColor: "{colors.bianco-fari}"
    rounded: "{rounded.sm}"
    padding: "11px 13px"
  input-focus:
    backgroundColor: "{colors.carbonio}"
  badge:
    backgroundColor: "{colors.carbonio}"
    textColor: "{colors.argento-testo}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  tab-active:
    textColor: "{colors.bianco-fari}"
    padding: "11px 18px"
  position-p1:
    backgroundColor: "{colors.oro-podio}"
    textColor: "#4a3800"
    rounded: "{rounded.sm}"
    height: "28px"
  navbar:
    backgroundColor: "rgba(22, 22, 28, 0.72)"
    textColor: "{colors.argento-testo}"
    height: "66px"
---

# Design System: Lega F1

## Overview

**Creative North Star: "La Notte di Gara"**

Il portale è un Gran Premio in notturna. Il fondo è asfalto quasi nero, le superfici sono strati di carbonio appena più chiari, e la luce arriva da due sole fonti: il Rosso Corsa, che accende ciò che conta (il CTA, la tab attiva, il pilota che sei tu, il prossimo GP), e il bianco dei fari, riservato a titoli, nomi e punti. Sullo sfondo della pagina due aloni radiali, uno rosso in alto a destra e uno blu in basso a sinistra, fanno da riflesso di luci della pista senza mai diventare decorazione in primo piano.

Il carattere è veloce e deciso: Titillium Web in pesi 700–900, il marchio "LEGA F1" in corsivo inclinato, bottoni primari con un gradiente rosso e un bagliore che cresce al passaggio del mouse, card che si sollevano di pochi pixel. La densità è da muretto box quando servono i dati (tabelle compatte, numeri tabulari, colonne secondarie nascoste su telefono) e da evento quando si racconta la stagione (hero, countdown, podio in oro/argento/bronzo).

È un'interfaccia scura per scelta, non per tema: non esiste una variante chiara e il sistema non va pensato su fondo bianco.

**Key Characteristics:**
- Fondo scuro stratificato in sei livelli (dall'asfalto `#0a0a0c` alla grafite `#33333f`).
- Un solo accento cromatico, il Rosso Corsa, usato come segnale e non come riempimento.
- Titillium Web ovunque, con pesi forti e numeri tabulari per punti, tempi e posizioni.
- Movimento breve e reattivo: sollevamenti di 1–4px, comparse "fade-up", rispetto di `prefers-reduced-motion`.
- Podio con colori metallici dedicati, mai riutilizzati per altro.

## Colors

Una notte di gara: neri freddi a gradini, un rosso da corsa che fa da unico segnale, colori metallici solo per il podio e quattro colori di stato.

### Primary
- **Rosso Corsa** (`rosso-corsa`): l'accento unico. CTA primari, tab e voci di navigazione attive (sottolineatura di 2px), barre laterali dei titoli di sezione, focus degli input, riga "sei tu" nelle classifiche, selezione del testo, puntino live pulsante.
- **Rosso Corsa Scuro** (`rosso-corsa-scuro`): la base dei gradienti (barre di progresso, titoli di sezione) e il thumb della scrollbar al passaggio.
- **Rosso Corsa Acceso** (`rosso-corsa-acceso`): la cima del gradiente del bottone primario, il colore dei link al passaggio, l'anello di focus da tastiera, i valori dei record nelle leader card.
- **Rosso Corsa Tenue** (`rosso-corsa-tenue`): testo rosso su fondo rosso trasparente (badge rossi, pill admin, risultati DNF, messaggi d'errore dei campi), dove il rosso pieno non sarebbe leggibile.

### Secondary
- **Blu Telemetria** (`blu-telemetria`): l'unico freddo del sistema. Alone di sfondo in basso a sinistra, badge blu, toast informativi. Mai usato per azioni.

### Tertiary
- **Oro / Argento / Bronzo Podio** (`oro-podio`, `argento-podio`, `bronzo-podio`): solo per P1, P2, P3 (badge posizione con gradiente metallico, form-dot) e per i badge oro.

### Neutral
- **Asfalto Notte** (`asfalto-notte`): sfondo della pagina e del loader.
- **Asfalto Sezione** (`asfalto-sezione`): footer, sidebar admin, intestazioni di tabella, fondo degli input a riposo, pannello auth.
- **Carbonio** (`carbonio`): card, tabelle, modali, dropdown, input a fuoco.
- **Carbonio Elevato** (`carbonio-elevato`): card al passaggio, toast, skeleton.
- **Grafite** (`grafite`): badge posizione neutri, form-dot, tracce delle barre, hover nei menu.
- **Grafite Chiara** (`grafite-chiara`): thumb della scrollbar.
- **Bianco Fari** (`bianco-fari`): titoli, nomi pilota, punti, valori numerici.
- **Argento Testo** (`argento-testo`): testo corrente e paragrafi.
- **Grigio Pitlane** (`grigio-pitlane`): etichette, intestazioni di colonna, testo secondario, lead.
- **Grigio Spento** (`grigio-spento`): placeholder, hint, copyright.
- I bordi sono bianco trasparente: `rgba(255,255,255,0.07)` di base, `0.14` per la versione marcata.

### Stati
- **Verde Pista Libera** (`verde-pista-libera`), **Giallo Bandiera** (`giallo-bandiera`), **Rosso Errore** (`rosso-errore`): successo, avviso, errore (bordo sinistro dei toast, delta delle stat card, bottone danger). Il blu informativo è il Blu Telemetria.

### Named Rules
**La Regola del Segnale.** Il Rosso Corsa indica cosa è attivo, cosa è tuo o cosa fare adesso. Non si usa come fondo di grandi superfici: al massimo come velatura trasparente (8–22%) dietro un elemento attivo.

**La Regola del Podio.** Oro, argento e bronzo significano solo P1, P2, P3. Non diventano colori di categoria, grafici o decorazione.

## Typography

**Display Font:** Titillium Web (con system-ui, sans-serif)
**Body Font:** Titillium Web (con system-ui, -apple-system, Segoe UI, Roboto)

**Character:** Una sola famiglia sportiva e tecnica, con un registro molto ampio: 900 per titoli, numeri e marchio, 400 per leggere. Il contrasto viene dal peso e dal maiuscolo spaziato, non dall'abbinamento di più font.

### Hierarchy
- **Display** (900, `clamp(2rem, 5vw, 3.4rem)`, 1.15): titolo della hero e delle pagine; nella hero ha una larghezza massima di 16ch.
- **Headline** (700, `clamp(1.5rem, 3.5vw, 2.3rem)`, 1.15): titoli di sezione della home e delle pagine.
- **Title** (700, 1.35rem; 1.15rem nelle intestazioni delle card): intestazioni di card, modali.
- **Section title** (900, 1.4rem, con barretta rossa verticale di 4×22px): titoli di blocco nelle pagine dati.
- **Body** (400, 1rem, 1.55): testo corrente in Argento Testo; i lead restano entro 52–60ch.
- **Label** (700, 0.74rem, letter-spacing 0.08em, MAIUSCOLO): intestazioni di colonna, etichette delle stat card, badge. Kicker ed eyebrow salgono a 0.12–0.16em, in Rosso Corsa.
- **Numeral** (900, 2rem, 1, `tnum`): valori delle stat card, countdown, numeri della hero. Ogni numero confrontabile usa cifre tabulari.

### Named Rules
**La Regola dei Numeri Tabulari.** Punti, tempi, posizioni e conteggi usano sempre `font-variant-numeric: tabular-nums`, così le colonne restano allineate come su un tabellone dei tempi.

**La Regola del Corsivo di Marca.** Il corsivo 900 appartiene al marchio "LEGA F1" (navbar, loader). Non si usa per enfatizzare il testo corrente.

## Layout

- **Contenitore:** larghezza massima 1280px, margini laterali 24px, che scendono a 16px sotto i 720px e a 12px sotto i 560px.
- **Ritmo:** scala a 4px (4, 8, 12, 16, 24, 32, 48, 64). Le sezioni della home sono separate da 48px; le pagine hanno 48px di padding verticale; la card ha 24px di padding interno.
- **Griglie:** 2, 3, 4 colonne e una griglia auto-fit con minimo 240px, tutte con spazio di 24px. Sotto i 960px le griglie da 3 e 4 diventano da 2; sotto i 720px tutto va a una colonna.
- **Navbar:** alta 66px, sticky, in vetro. Sotto i 720px l'hamburger va a sinistra, il marchio a destra, e link e account diventano un pannello laterale largo `min(82vw, 320px)` con sfondo scuro dietro.
- **Admin:** sidebar di 250px affiancata al contenuto; sotto i 960px diventa un pannello a scomparsa da sinistra.
- **Auth:** split con area visiva a sinistra e pannello di 460px a destra; sotto gli 860px resta solo il pannello.
- **Telefono prima di tutto:** sotto i 560px le tabelle si compattano (0.85rem), le colonne secondarie si nascondono (`.hide-sm`), le tab scorrono in orizzontale invece di andare a capo, i grafici si abbassano a 260/200px e i CTA della hero vanno a tutta larghezza.

### Named Rules
**La Regola della Classifica Leggibile.** Su telefono una classifica mostra almeno posizione, pilota/team e punti senza scroll orizzontale; tutto il resto è una colonna secondaria che si può nascondere. I nomi non vanno mai a capo lettera per lettera.

## Elevation & Depth

La profondità nasce prima di tutto dai livelli di colore (asfalto → carbonio → carbonio elevato) e dai bordi trasparenti; le ombre sono scure e diffuse, servono a staccare gli elementi sovrapposti (dropdown, modali, toast, pannelli mobili) e a rispondere al passaggio del mouse. L'unica ombra colorata è il bagliore rosso, riservato al bottone primario e al marchio. Il vetro (sfondo carbonio al 72% con blur di 14px) è usato per la navbar e per la classe `.glass`.

### Shadow Vocabulary
- **Contatto** (`box-shadow: 0 1px 3px rgba(0,0,0,0.4)`): elementi piccoli appoggiati.
- **Sollevato** (`box-shadow: 0 6px 20px rgba(0,0,0,0.45)`): navbar dopo lo scroll.
- **Sospeso** (`box-shadow: 0 18px 50px rgba(0,0,0,0.55)`): modali, dropdown, toast, pannelli laterali, card al passaggio.
- **Bagliore Rosso** (`box-shadow: 0 8px 30px rgba(225,6,0,0.45)`): marchio in navbar; il bottone primario usa una versione più contenuta (`0 4px 16px` al 35%, `0 6px 26px` al 55% al passaggio).

### Named Rules
**La Regola dei Fari.** Solo ciò che è in primo piano (sovrapposto o al passaggio) riceve un'ombra profonda. A riposo le card stanno a terra, separate da colore e bordo.

## Shapes

Angoli morbidi ma tecnici: 6px per controlli e piccoli elementi (bottoni, input, badge posizione, tab segmentate), 10px per toast, dropdown e media, 16px per card, tabelle e modali, pillola per badge, chip, avatar utente e legende. Gli avatar sono circolari. Il linguaggio sportivo è dato dai dettagli: il marchio inclinato di -8°, le barrette verticali rosse di 4px con raggio 2px (titoli di sezione, colore team), la barra rossa di 3px che sfuma in cima alle card in evidenza, le righe diagonali sottilissime (115°) sull'area visiva delle pagine di accesso.

## Components

### Buttons
Rapidi e decisi: peso 700, letter-spacing 0.02em, nessun a-capo.
- **Shape:** angoli leggermente arrotondati (6px).
- **Primary:** gradiente verticale da Rosso Corsa Acceso a Rosso Corsa, testo bianco, bagliore rosso; al passaggio il bagliore cresce e il bottone sale di 1px.
- **Ghost:** fondo Carbonio, bordo marcato, testo bianco; al passaggio il bordo diventa rosso.
- **Outline:** trasparente, bordo marcato, testo Argento; al passaggio bordo rosso e testo bianco.
- **Danger:** fondo Rosso Errore.
- **Pressione:** scende di 1px e si riduce al 99%. Disabilitato: opacità 50%.
- **Taglie:** sm (7×13px, 0.82rem), base (11×20px, 0.92rem), lg (14×28px, 1.02rem), icona 38×38px, block a tutta larghezza.

### Chips
- **Badge:** pillola con testo maiuscolo da 0.74rem, fondo Carbonio e bordo marcato; le varianti rosso, verde, oro e blu usano un fondo al 14–15% e un bordo al 40% del proprio colore, con testo in una tinta più chiara.
- **Pill di ruolo:** admin su velatura rossa, pilota su Grafite.
- **Tag chip (bacheca):** pillola su velatura rossa con pulsante di rimozione.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** Carbonio con bordo `rgba(255,255,255,0.07)`.
- **Shadow Strategy:** a terra a riposo; le card cliccabili salgono di 4px e prendono l'ombra Sospeso.
- **Varianti:** `accent-top` (barra rossa sfumata di 3px in alto), `next-race` (velatura rossa diagonale e bordo rosso al 28%).
- **Internal Padding:** 24px; l'intestazione della card ha titolo a sinistra e link o azione a destra.

### Inputs / Fields
- **Style:** fondo Asfalto Sezione, bordo marcato, 6px, testo bianco, etichetta da 0.82rem in peso 600 sopra il campo, asterisco rosso per i campi obbligatori.
- **Focus:** bordo Rosso Corsa, anello di 3px in rosso al 18%, fondo che passa a Carbonio.
- **Error / Disabled:** bordo Rosso Errore e messaggio in Rosso Corsa Tenue sotto il campo.
- **Select:** freccia SVG triangolare in Grigio Pitlane, padding destro di 34px.

### Navigation
- **Navbar:** vetro scuro sticky; link in peso 600 da 0.92rem in Argento, bianco al passaggio con velatura bianca al 5%; il link attivo ha una sottolineatura rossa di 2px.
- **Account:** pillola con avatar e nome; campanella circolare di 38px con contatore rosso per gli admin.
- **Mobile:** pannello laterale da sinistra, link a tutta larghezza, menu account in linea.
- **Tab:** testo Grigio Pitlane, attiva in bianco con bordo inferiore rosso di 2px.
- **Segmented:** contenitore Carbonio, segmento attivo pieno in Rosso Corsa.

### Data Table
Il componente centrale del portale.
- Contenitore Carbonio con angoli di 16px e scroll orizzontale.
- Intestazioni sticky in Asfalto Sezione, etichette maiuscole Grigio Pitlane.
- Righe separate da bordi sottili, velatura bianca al 3% al passaggio, numeri allineati a destra in cifre tabulari, punti in bianco 700.
- **Riga "sei tu":** velatura rossa all'8% e filetto rosso interno di 3px a sinistra.
- **Riga DNF:** opacità 62%, piena al passaggio.
- **Cella pilota:** avatar circolare di 32px, nome in bianco 600, sotto-riga in Grigio Pitlane (handle, riserva, sostituzione BOT).

### Position Badge
Quadrato arrotondato di 28px con numero 700. P1, P2 e P3 hanno un gradiente metallico (oro, argento, bronzo) con testo scuro intonato; dalla P4 in poi il fondo è Grafite e il testo bianco. La stessa logica, in versione trasparente, vale per i form-dot delle ultime cinque gare (P1 oro, podio argento, DNF rosso).

### Stat & Leader Cards
- **Stat card:** etichetta maiuscola, valore Numeral, delta in verde o rosso, icona gigante al 6% di opacità ruotata nell'angolo.
- **Leader card:** icona in un cerchio con velatura rossa, etichetta, nome e valore del record in Rosso Corsa Acceso allineato a destra.

### Countdown & Live
Celle del countdown in Asfalto Notte con numeri 900 e unità maiuscole; il puntino live rosso pulsa ogni 1.6s.

### Feedback
- **Toast:** Carbonio Elevato, bordo sinistro di 4px nel colore di stato, entrata da destra.
- **Loader iniziale:** marchio "LEGA F1" in corsivo con barra rossa che scorre.
- **Skeleton:** shimmer da Carbonio Elevato a Grafite.
- **Modale:** Carbonio, 16px, intestazione e piede sticky, sfondo nero al 68% con blur di 4px.

## Do's and Don'ts

### Do:
- **Do** usare il Rosso Corsa come segnale di stato attivo, di "tuo" o di azione primaria, e i token `--f1-red*` invece di valori esadecimali sparsi.
- **Do** costruire la profondità con i livelli Asfalto → Carbonio → Carbonio Elevato e i bordi trasparenti, prima di aggiungere un'ombra.
- **Do** usare cifre tabulari per ogni numero confrontabile (punti, tempi, posizioni, countdown).
- **Do** progettare prima su telefono: compattare le tabelle, nascondere le colonne secondarie con `.hide-sm`, far scorrere le tab in orizzontale.
- **Do** mantenere il movimento breve (0.15–0.5s) e neutralizzarlo con `prefers-reduced-motion`, come già fa `animations.css`.
- **Do** dare a ogni elemento interattivo uno stato di focus visibile (anello di 2px in Rosso Corsa Acceso).

### Don't:
- **Don't** introdurre un tema chiaro o superfici bianche: il sistema esiste solo in notturna.
- **Don't** usare oro, argento e bronzo fuori dal podio.
- **Don't** riempire grandi superfici di Rosso Corsa pieno: oltre i bottoni e i segmenti attivi, il rosso è una velatura trasparente.
- **Don't** affiancare a Titillium Web un secondo font: la gerarchia si costruisce con peso, dimensione e maiuscolo spaziato.
- **Don't** usare il corsivo 900 del marchio per enfatizzare il testo corrente.
- **Don't** lasciare che i nomi dei piloti vadano a capo lettera per lettera nelle tabelle (`overflow-wrap: anywhere` è vietato lì).
