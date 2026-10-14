# Chiamate Tracker: guida per Claude

Leggi tutto prima di toccare il codice. Le regole in fondo ("Regole che non si rompono") valgono sempre.

---

## 1. Cos'è

Web app statica (HTML + CSS + JavaScript puro, niente build, niente backend, niente dipendenze npm) per chi fa chiamate di vendita in un'agenzia per centri estetici.

Due ruoli, nello stesso tool:

- **Setter**: chiama i lead in sessioni, fissa appuntamenti, fa il giro di conferme del giorno prima.
- **Venditore** (closer): gestisce gli appuntamenti ricevuti, lo stato della trattativa, incassi e rate.

Utenti: Simone (proprietario del tool, fa setter e venditore) e Hamza (collega setter, usa soprattutto la parte Setting e propone fix).

- Repo: `siimxh/CRM-SETTER-VENDITORE`, branch `main`.
- **Versione in uso (dal 14/10/2026)**: https://comms-wine.vercel.app — login + database Supabase. Vercel (progetto "comms", piano Hobby) pubblica il branch `supabase`: push su `supabase` = online in 1-2 minuti.
- Versione vecchia senza login: GitHub Pages https://siimxh.github.io/CRM-SETTER-VENDITORE/ dal branch `main`. Non si usa più per registrare (i dati restano solo nel browser).
- `siimxh/TRACKER-OUTBOUND` è una versione vecchia: non toccarla.
- Il repo è **pubblico**: niente dati dei lead, indirizzi email o dati personali nei file.

---

## 2. Chi è Simone e come vuole lavorare

- Scrive in italiano, spesso detta a voce. Rispondi in italiano.
- Vista non ottima: frasi brevi, molta spaziatura, niente muri di testo.
- Non scrive codice. Detta il comportamento, dà regole sui casi limite, manda screenshot.
- Ragiona per regole esatte: se una regola è ambigua, chiedi prima di decidere i numeri.
- Dettatura: "Anza" o "Amazon" = Hamza. "Sala/Sonnet di Vincente" = Salone Vincente (l'agenzia).

### Procedura per ogni modifica

1. Ascolti la richiesta (da Simone, o da Hamza via mail).
2. Prepari la modifica su un branch, la testi (vedi sezione 7).
3. Mandi a Simone in chat lo schema di cosa cambia, con screenshot, e chiedi l'ok.
4. **Solo dopo il suo ok**: push sul branch pubblicato (oggi `supabase`, su Vercel).
5. Controlli che il deploy sia andato a buon fine (chiedi a Simone di aprire il link se dal cloud non si raggiunge).
6. Mail di aggiornamento a Hamza (vedi sotto), a meno che Simone dica "no mail".

Se la richiesta viene da Hamza: stessa procedura, l'ok lo dà sempre Simone. A Hamza si risponde solo dopo che il fix è online.

### Mail di aggiornamento a Hamza

Dal Gmail di Simone. L'indirizzo di Hamza non sta nel repo: è nel file di passaggio del progetto o nella memoria.

Struttura fissa:

```
Ciao Hamza 👋
sono Claude, l'assistente AI con cui Simone sta costruendo il suo tool di gestione chiamate.
Mi ha chiesto di darti un aggiornamento sulle ultime modifiche.

🆕 Novità

• punto

• punto

🔧 Fix tecnici

• punto

Resto a disposizione per qualsiasi domanda 🙂

🔗 Apri il tool: https://comms-wine.vercel.app

Cordiali saluti,
Claude
```

- Oggetto: scherzoso, tutto in maiuscolo (sono amici).
- **Mai** l'emoji ✨.
- Metti in evidenza le modifiche alla parte Setting (è quella che usa Hamza).
- Screenshot: JPG in `aggiornamenti/AAAA-MM-GG/` nel repo, inseriti nella mail come `<img>` con link `raw.githubusercontent.com/siimxh/CRM-SETTER-VENDITORE/main/aggiornamenti/...`.

### Calendari (quando servono)

Si toccano solo "Simo Privato" (personale) e "Calendario Simone" (delicato: lo vede tutto il team commerciale). Mai "Holidays", mai calendari di altre persone.

---

## 3. File

Ordine di caricamento in `index.html`: `storage.js` → `utils.js` → `supabase-config.js` → `cloud-sync.js` → `app.js`. Tutto è globale (niente moduli): una funzione di `utils.js` si usa direttamente in `app.js`.

| File | Cosa contiene |
|---|---|
| `index.html` | Guscio della pagina, topbar (Dashboard / Setting / Venditore), contenitore `#app` |
| `storage.js` | Chiave localStorage, `defaultData()`, esiti di default, migrazioni (`migrateAppointment`, `mergeWithDefaults`) |
| `utils.js` | Date e periodi, statistiche (`computeStats`, `computeFunnelValues`, `computeSetterStats`, `computeVenditoreStats`), commissioni, pace |
| `supabase-config.js` | URL e chiave pubblica (anon) di Supabase |
| `cloud-sync.js` | Login e salvataggio sul database Supabase (senza librerie: fetch diretto alle API) |
| `supabase/schema.sql` | Tabelle, regole RLS, foto notturna, storico modifiche. Si lancia dal SQL Editor di Supabase |
| `app.js` | Tutta l'interfaccia: routing, render, eventi, modali (~5.600 righe) |
| `style.css` | Stile e temi |
| `aggiornamenti/` | Screenshot delle mail a Hamza, una cartella per rilascio |
| `tools/` | `prova-tracker.js` (prova nel browser), `anonimizza-backup.js` (copia anonima di un backup) |

Il codice è commentato in italiano e i commenti spiegano spesso **perché** una regola è così ("richiesto dall'utente", "CORREZIONE"). Leggili prima di cambiare una regola: di solito è una decisione di Simone.

---

## 4. Mappa di app.js

Cerca per nome funzione (`grep -n "function nome"`), i numeri di riga cambiano.

**Base e routing**
- `persist()` salva nella copia locale e accoda il salvataggio online (`CloudSync.schedule`). Chiamala dopo ogni modifica a `db`.
- Avvio: `bootApp` → login (`loginSubmitAction`) → `startForUser` → `openUserData` (dati online, o import dei dati del browser al primo login). Account ed Esci: `openAccountModal`, `logoutAction`.
- `renderRoute()` decide cosa mostrare da `location.hash`. Route (piatte, con trattino):
  - `#/dashboard`
  - Setting: `#/setting-appuntamenti`, `#/sessioni` (dettaglio: `#/sessioni/<id>`), `#/setting-statistiche`
  - Venditore: `#/venditore-appuntamenti`, `#/venditore-statistiche`
  - Builder tema: `#/impostazioni`
- Priorità prima della route: richiamata in corso (`callbackCallActiveId`), sessione attiva non minimizzata, Round Conferme, Round Recupero. Se uno di questi è attivo, la route viene ignorata.
- Tema: `THEME_PRESETS`, `applyTheme`, pagina Builder (`renderBuilderPage`, tasto 🎨).

**Dashboard**
- `renderDashboard`, `renderDashboardTopSections`.
- Obiettivi e funnel: `FUNNEL_STEPS_SETTER`, `FUNNEL_STEPS_VENDITORE`, `renderFunnelSection`, `renderPaceBar` (design "Ritmo": tacca "dove dovresti essere adesso").
- Andamento generale: `renderCommissionKpiSection`, `buildAndamentoSeries`, `renderLineChart`.
- Pace del mese: `renderMonthPace`, `renderMonthPaceBox`.
- Report da copiare: `generateSessionReport`, `generateAppointmentsReport`, `generateVenditoreAppointmentsReport`.

**Sessioni di chiamata (Setter)**
- Nuova sessione: `openNewSessionModal` → `startSessionAction` → `beginPipelineSession` / `createPipelineSession`.
- Schermata sessione: `renderSessioneAttiva`, `logCallAction` (registra un esito), `skipLeadAction`, `endSessionAction`, `toggleSessionPause`, `undoLastCallAction` (tasto "Annulla ultimo esito").
- Appuntamento fissato in sessione: `openAppointmentSetModal`, lista sotto gli esiti `renderSessionApptList`.
- Elenco e dettaglio: `renderSessioniList`, `renderSessioneDetail`.

**Da richiamare (callback)**
- Esito "Da richiamare" → `openCallbackModal`. Lista `openCallbacksListModal`, modifica `openEditCallbackModal`, cestino `removeCallback`.
- Richiamata: `startCallbackCall`, `renderCallbackCallScreen`, `logCallbackCall`, `appendCallbackCallToSession`.
- Senza sessione aperta, le richiamate finiscono nella sessione automatica del giorno "Richiami" (`CALLBACK_AUTO_PIPELINE_ID`).

**Round Conferme**
- Richiama gli appuntamenti Setter del giorno lavorativo dopo (il venerdì quelli del lunedì): `getConfirmTargetDateKeys`, `getPendingConfirmAppointments`.
- Schermata: `renderConfirmRoundScreen`, `applyConfirmOutcome`, `exitConfirmRound`. Banner dalle 18: `renderConfirmAlertBanner`.
- Le chiamate vanno nella sessione aperta se c'è (`appendConfirmCallToSession`), altrimenti nella sessione automatica del giorno "Conferme".
- Messaggio WhatsApp: `CONFIRM_WHATSAPP_TEMPLATE`, `buildWhatsAppConfirmMessage`.

**Round Recupero Appuntamenti**
- Unico round fisso per no show e annullati, sia Setter sia Venditore: `addToRecoveryRound`, `renderRecoveryRoundScreen`, `applyRecoveryOutcome`.

**Appuntamenti (mini-CRM)**
- Modello: `newAppointment(role)`. Stati Venditore: `DEAL_STAGES`, `dealStageDef`.
- Setter: `renderAppuntamenti`, `renderApptRow`, `wireAppuntamentiEvents`. Esiti Setter: `SETTER_PRESENTED_LABEL`.
- Venditore: `renderVenditoreAppuntamenti`, `renderVenditoreApptRow`, `wireVenditoreAppuntamentiEvents`, note `openNotesModal`, follow-up `openFollowUpModal`, rate `openInstallmentsModal`, registrazioni call `renderCallRecordingsSection`.
- Spostato: `openRescheduleModal` → `rescheduleAppointment` crea un appuntamento NUOVO collegato (`rescheduledFromId` / `rescheduledToId`).
- Soldi: `apptTotalSold`, `getEffectiveInstallments` (l'acconto incassato diventa una rata pagata sintetica).
- Statistiche: `renderSettingStatistiche`, `renderVenditoreStatistiche`. Calendari: `openAppointmentsCalendarModal`, commissioni per giorno `renderCommissioniCalendarSection`.

**Dati**
- `exportData` / `importData` (backup .json). Importa sostituisce tutto anche online.

---

## 5. Modello dati

Tutto sta in un unico oggetto `db`. Struttura completa e commentata in `storage.js` → `defaultData()`.

Dove viene salvato (branch `supabase`, vedi `cloud-sync.js`):
- Online su Supabase: tabella `appuntamenti` (una riga per appuntamento), `sessioni` (una riga per sessione, chiamate dentro), `stato` (tutto il resto, una riga per utente). Si inviano solo le righe cambiate.
- Copia locale per utente: localStorage `chiamateTrackerData_v1__<id utente>`.
- La chiave vecchia `chiamateTrackerData_v1` (versione senza login) non viene mai toccata: al primo login il tool la legge, scarica un backup e la carica online.
- Date nel database: timestamptz. `scheduledAt`/`presentedAt` restano stringhe locali nel tool e sono convertite come ora italiana solo in `cloud-sync.js`.

- `pipelines[]`: liste di chiamata, ognuna con i suoi `outcomes[]` (`isConversion`, `isNoAnswer`).
- `sessions[]` e `activeSession`: ogni sessione ha `calls[]`, `startedAt`, `endedAt`, `pausedTotalMs`, `skips`.
- Chiamata: `{ id, timestamp, outcomeId, outcomeLabel, isConversion, isNoAnswer, isSecondAttempt, groupId, isCallbackCall?, isConfirmCall?, undoState? }`.
  - `groupId` = il lead. Più chiamate con lo stesso `groupId` = un solo lead.
- `appointments[]`: campi in `newAppointment()`. `role` è `'setter'` o `'venditore'`.
  - Setter: `presentedStatus` ∈ `no`, `confirmed24h`, `presented`, `no_show`, `annullato`, `spostato`.
  - Venditore: `dealStage` (vedi `DEAL_STAGES`), `notes[]`, `nextFollowUpDate` (YYYY-MM-DD).
  - Soldi: `cashCollected`, `totalSold`, `installments[]` (`amount`, `paid`, `paidDate`, `dueDate`).
- `callbacks[]`: i "Da richiamare".
- `recoveryRound[]`: i lead del Round Recupero.
- `goals`, `settings`, `callRecordings[]`.

**Date**: gli input `datetime-local` salvano stringhe locali senza fuso (`2026-10-14T15:30`). Per i valori di default usa sempre `localDateTimeValue(new Date())` e `dateInputValue(new Date())` (utils.js). **Mai** `toISOString().slice(...)`: dà l'ora UTC, 2 ore indietro in Italia (bug corretto il 13/10).

---

## 6. Regole sui numeri (decise da Simone)

Prima di cambiarne una, chiedi a Simone.

**Lead e chiamate**
- Un lead chiamato più volte conta **1 volta**, con l'**ultimo** esito (ordinato per orario). Vale anche per gli esiti nel dettaglio sessione (`sessionOutcomeCountsByLead`).
- "Senza risposta" solo se nessun tentativo ha avuto risposta.
- "Da richiamare" richiamato lo stesso giorno = stesso lead. Un altro giorno = lead nuovo.
- Le conferme dello stesso appuntamento lo stesso giorno = un lead; un altro giorno = lead nuovo (`ensureConfirmGroupId`).
- Contatori di sessione: `countSessionLeads`.
- Chiamate all'ora: tempo di sessione **senza le pause**.

**Appuntamenti Setter**
- Fissati: contati per **data di inserimento** (`createdAt`). Gli spostati non contano come nuovi (`isCountedAsNewBooking`).
- Show-up rate = Presentati / (Presentati + No Show), solo appuntamenti già passati. Quelli lasciati su "No" o "Confermato24h" non contano.

**Appuntamenti Venditore**
- Assegnati: contati per **data dell'appuntamento** (`scheduledAt`), spostati esclusi.
- Show rate = presentati / (presentati + no show).
- Closing rate = chiusi / presentati in target.
- Annullato e Spostato: fuori da show rate e closing rate.
- Non in target: conta come show, fuori dal closing rate.
- Chiusi = Contratto Firmato + Chiuso.

**Commissioni** (`commissionEventsForAppointment` in utils.js)
- Setter: 40 € per ogni presentato + 3% dell'incassato sui chiusi.
- Venditore: 10% dell'**incassato**: cash collected + rate spuntate come pagate. Le rate future contano solo quando vengono spuntate.
- Data della commissione: l'acconto va al giorno della presentazione (`appointmentCashDate`), ogni rata al giorno in cui è stata pagata. Mai al giorno in cui la riga viene segnata "chiuso".
- "Totale venduto" in dashboard somma Setter + Venditore: va bene così.

**Obiettivi e pace**
- Giorno = ore 9-19. Settimana e mese = solo giorni lun-ven.

---

## 7. Come testare

Niente test automatici nel repo: si testa nel browser vero con Playwright.

- Apri `index.html` con `file://`, carica i dati in localStorage, ricarica.
- Usa sempre `timezoneId: 'Europe/Rome'`.
- Per fissare l'ora (es. testare il Round Conferme alle 18) sostituisci `Date` con `addInitScript`.
- Dati realistici: il backup di Simone (.json, formato identico a localStorage). **Non sta nel repo** perché contiene nomi e telefoni dei lead: è nei file del progetto. Non committarlo mai.
- Con localStorage vuoto non ci sono pipeline: aggiungine una con `defaultOutcomesList()` (storage.js).
- Controlla sempre che non ci siano errori in console (`page.on('pageerror')`) passando per tutte le route.

Script di base: `tools/prova-tracker.js` (vedi commento in testa al file).

```bash
node tools/prova-tracker.js /percorso/backup.json
```

Per gli screenshot da mandare a Simone: viewport 1440×900, salva PNG fuori dal repo; per la mail a Hamza convertili in JPG dentro `aggiornamenti/AAAA-MM-GG/`.

---

## 8. Git

- Lavora su un branch, merge su `main` solo dopo l'ok di Simone.
- Messaggi di commit in italiano, con il "cosa" visibile all'utente: `Sessione: tasto Annulla ultimo esito (richiesta di Hamza)`.
- Se la richiesta viene da Hamza, scrivilo nel messaggio.
- Dopo il push controlla l'ultima run del workflow "pages build and deployment" (deve essere `success` sul commit giusto).

---

## 9. Regole che non si rompono

1. Niente push su `main` senza l'ok di Simone in chat.
2. Niente dati dei lead nel repo (è pubblico): backup, nomi, telefoni.
3. Mettere online i dati dei lead (database) richiede l'ok di Giada, la direttrice commerciale.
4. Calendari: solo "Simo Privato" e "Calendario Simone". Mai Holidays, mai calendari altrui.
5. Mail a Hamza solo dopo che il fix è online. Mai l'emoji ✨.
6. Le regole sui numeri (sezione 6) non si cambiano senza chiedere.
7. Date di default sempre in ora locale (sezione 5).

---

## 10. Dove andiamo

Decisione di Simone (14/10/2026): **login + database Supabase**, il prima possibile, con il tool pubblicato su **Vercel (piano Hobby)**.

- Lavori in corso sul branch `supabase` (login, salvataggio online, Firebase tolto). `main` resta la versione senza login finché Simone non dà l'ok al passaggio.
- Prima della migrazione: date tutte nello stesso formato con fuso Europe/Rome.
- Hamza non deve fermarsi: la versione nuova si costruisce e si prova a un indirizzo separato, mentre lui continua sul link GitHub Pages. Passa solo alla fine, al primo login il tool carica i dati che ha già nel browser.
- Chiavi Supabase: nel codice solo la chiave pubblica (anon) con le regole RLS attive. La chiave `service_role` mai nel repo.
- Dopo il database: **gestione appuntamenti del venditore via chat** (Simone scrive cosa è successo, Claude aggiorna esito, nota, follow-up, calendario e promemoria). Dettagli e domande aperte nel file di passaggio.
