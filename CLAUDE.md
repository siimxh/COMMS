# Chiamate Tracker: guida per Claude

Leggi tutto prima di toccare il codice. Le regole in fondo ("Regole che non si rompono") valgono sempre.

---

## 1. Cos'è

Web app statica (HTML + CSS + JavaScript puro, niente build, niente backend, niente dipendenze npm) per chi fa chiamate di vendita in un'agenzia per centri estetici.

Due ruoli, nello stesso tool:

- **Setter**: chiama i lead in sessioni, fissa appuntamenti, fa il giro di conferme del giorno prima.
- **Venditore** (closer): gestisce gli appuntamenti ricevuti, lo stato della trattativa, incassi e rate.

Utenti: Simone (proprietario del tool, fa setter e venditore) e Hamza (collega setter, usa soprattutto la parte Setting e propone fix).

- Repo: `siimxh/COMMS` (prima `siimxh/CRM-SETTER-VENDITORE`: GitHub reindirizza il nome vecchio), branch `main`. Se `git remote -v` mostra ancora il nome vecchio funziona lo stesso; per aggiornarlo: `git remote set-url origin https://github.com/siimxh/COMMS`.
- **Versione in uso**: https://comms-wine.vercel.app — login + database Supabase. Vercel (progetto "comms", piano Hobby) pubblica il branch `main`: push su `main` = online in 1-2 minuti.
- C'è **una sola versione del codice**: `main`. Il branch `supabase` (cantiere del login) è fermo e non si usa più.
- GitHub Pages pubblica anche lui `main` (stesso login, stessi dati). Col repo rinominato l'indirizzo diventa https://siimxh.github.io/COMMS/ (**da verificare**: GitHub Pages non reindirizza il nome vecchio). Nessuno lo usa: il link da dare è quello di Vercel.
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
4. **Solo dopo il suo ok**: merge e push su `main` (Vercel lo mette online).
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
- Screenshot: JPG in `aggiornamenti/AAAA-MM-GG/` nel repo, inseriti nella mail come `<img>` con link `raw.githubusercontent.com/siimxh/COMMS/main/aggiornamenti/...` (le mail vecchie usano il nome vecchio del repo: GitHub li reindirizza).

### Calendari (quando servono)

Si toccano solo "Simo Privato" (personale) e "Calendario Simone" (delicato: lo vede tutto il team commerciale). Mai "Holidays", mai calendari di altre persone.

---

## 3. File

Ordine di caricamento in `index.html`: `storage.js` → `utils.js` → `supabase-config.js` → `cloud-sync.js` → `lead.js` → `app.js`. Tutto è globale (niente moduli): una funzione di `utils.js` si usa direttamente in `app.js`.

| File | Cosa contiene |
|---|---|
| `index.html` | Guscio della pagina: barra laterale `#sidebar` (Dashboard / Setting / Venditore; in basso 👤 Account, 🎨 Aspetto, Esci; « la comprime, sotto 900 px è un menu a scomparsa ☰), barra della pagina `#pageBar` (titolo, tab `#pageTabs`, "Salvato", "+ Nuova sessione", "+ Task" solo in Dashboard), contenitore `#app` |
| `storage.js` | Chiave localStorage, `defaultData()`, esiti di default, `CHECKLIST_ITEMS` + `checklistPctOf`, migrazioni (`migrateAppointment`, `migrateSettings`, `mergeWithDefaults`) |
| `utils.js` | Date e periodi, statistiche (`computeStats`, `computeFunnelValues`, `computeSetterStats`, `computeVenditoreStats`, `computeCallTypeStats`), commissioni, pace |
| `supabase-config.js` | URL e chiave pubblica (anon) di Supabase |
| `cloud-sync.js` | Login e salvataggio sul database Supabase (senza librerie: fetch diretto alle API) |
| `supabase/schema.sql` | Tabelle (anche `lead`), regole RLS, foto notturna, storico modifiche. Si lancia dal SQL Editor di Supabase (si può rilanciare: crea solo quello che manca) |
| `lead.js` | Parte Venditore a lead: righe Venditore delle Task in Dashboard ("da esitare"), lista Lead, scheda lead, ⋯ degli appuntamenti, numeri dei lead. Tutto dentro `LeadCRM` |
| `app.js` | Tutta l'interfaccia: routing, render, eventi, modali (~6.800 righe) |
| `style.css` | Stile. In testa i token della guida colori (`--accent-100..500`, `--neutral-0..900`, `--success`, `--danger`, raggi); i nomi vecchi (`--accent`, `--bg`...) puntano ai token. Niente colori scritti a mano nei componenti |
| `aggiornamenti/` | Screenshot delle mail a Hamza, una cartella per rilascio |
| `tools/` | `prova-tracker.js` (prova nel browser), `dati-finti.js` (dati di prova inventati, vedi sezione 7), `anonimizza-backup.js` (copia anonima di un backup), `eod-report.js` (numeri del modulo di fine giornata, letti dal database: lo usa la mail EOD delle 19) |

Il codice è commentato in italiano e i commenti spiegano spesso **perché** una regola è così ("richiesto dall'utente", "CORREZIONE"). Leggili prima di cambiare una regola: di solito è una decisione di Simone.

---

## 4. Mappa di app.js

Cerca per nome funzione (`grep -n "function nome"`), i numeri di riga cambiano.

**Base e routing**
- `persist()` salva nella copia locale e accoda il salvataggio online (`CloudSync.schedule`). Chiamala dopo ogni modifica a `db`.
- Finestre: sempre con `openModal(html)` / `closeModal()`: role="dialog" aria-modal, titolo = primo h3, fuoco dentro (Tab gira nella finestra), Esc chiude, alla chiusura il fuoco torna dov'era.
- Una scheda sola: `announceThisTab` all'avvio, le altre schede vanno in `blockThisTab` (vedi sez. 5).
- Avvio: `bootApp` → login (`loginSubmitAction`) → `startForUser` → `openUserData` (dati online, o import dei dati del browser al primo login). Account ed Esci: `openAccountModal`, `logoutAction` (Esci ricarica la pagina). Dentro 👤 ci sono Esporta, Importa, l'interruttore Parte Venditore e il permesso per le notifiche di sistema.
- Layout: barra laterale `initSidebar`, `updateSidebarActive`, `openMobileSidebar`/`closeMobileSidebar` (compressa ricordata in localStorage `comms_barraCompatta`). Barra della pagina: `renderPageBar(section, tab)`; tab `SETTING_SUBROUTES`, `VENDITORE_SUBROUTES`. Un solo pulsante nero (`.btn-primary`) per vista.
- Periodo **unico**: Dashboard, Sessioni e Stats usano la stessa barra (`renderPeriodBar`, `wirePeriodBar`) e lo stesso periodo (`getPeriod`, `setPeriod`, `getPeriodRange`; `getPeriodRangeOrNull`, null = "Tutto"). Il browser si ricorda la scelta (localStorage `chiamateTracker_periodo`).
- `renderRoute()` decide cosa mostrare da `location.hash`. Route (piatte, con trattino):
  - `#/dashboard` (pagina d'apertura)
  - Setting: `#/setting-appuntamenti`, `#/sessioni` (dettaglio: `#/sessioni/<id>`), `#/setting-statistiche` (tab Stats)
  - Venditore: `#/venditore-lead` (scheda: `#/lead/<id>`), `#/venditore-statistiche`
  - 🎨 Aspetto: `#/impostazioni`
  - Route vecchie → `ROUTE_REDIRECTS`: `#/oggi` → Dashboard, `#/venditore-appuntamenti` e `#/venditore-tabella` → Lead. La pagina Oggi e la tabella Appuntamenti Venditore non esistono più.
  - Cambiando route si torna in cima alla pagina (`lastRenderedRouteKey`).
- Priorità prima della route: richiamata in corso (`callbackCallActiveId`, con "🗑 Togli" in alto), sessione attiva non minimizzata, Round Conferme, Round Recupero. Se uno di questi è attivo, la route viene ignorata (e barra laterale e barra della pagina si nascondono).
- Tema (🎨 Aspetto, `renderBuilderPage`): accento a rampa. `ACCENT_PRESETS` (Arancione = default, Indaco, Teal, Magenta) o colore a scelta (`accentRampFromHex` genera 500-100), Chiaro/Scuro (`settings.themeMode`), testo Normale/Grande, un effetto ("Numeri che contano"). `applyTheme` scrive inline solo le variabili d'accento (e il testo sopra l'accento, scuro se il bianco non arriva a 4,5:1). Accento verde → trend in blu; accento rosso → trend in viola. I settings dei temi vecchi li sistema `migrateSettings` (storage.js): Arancione, tenendo chiaro/scuro.

**Dashboard** (`renderDashboard`, eventi `wireDashboardSections`), dall'alto:
1. Task da fare (semplificate da Simone il 24/10): `collectDashboardTasks`, `renderDashboardTasks` (due blocchi Setting e Venditore, `renderDashboardTaskGroup`; con la parte Venditore spenta uno solo), `wireDashboardTasks`, "+ Task" → `openNewTaskModal`. Righe tutte uguali (`renderDashboardTaskRow`): icona, nome, cosa fare, quando, UN tasto. Priorità 1 conferme: una riga sola "N da confermare" (da mezzanotte), 2 Da richiamare di oggi e scaduti + una riga "N da recuperare" per blocco (Setting e Venditore, ognuna apre il round solo con le sue persone) + righe Venditore (`LeadCRM.dashboardTaskItems`: solo i "da esitare", tasto "Metti l'esito" = ⋯ dell'appuntamento), 3 `db.tasks` (tasto Fatto). I Da richiamare hanno anche il cestino 🗑 (`removeCallback`, Simone 30/10: cancellabili ovunque compaiono: Task, Setting → Appuntamenti, sessione, schermata della richiamata). Prime 6 per blocco + "Mostra tutte".
2. Prossimi pagamenti: `collectUpcomingPayments`, `renderDashboardPayments`, `wireDashboardPayments` (spunta "Pagato" sulla rata vera). Nome del centro, mai la persona. Rate non pagate di TUTTI gli appuntamenti chiusi, Setter e Venditore (anche più chiusure dello stesso lead).
   - Centro mancante: `centerMissingTagHtml` (pallino che pulsa + "centro mancante"), "Aggiungi centro" → `openCenterNameModal` (scrive `apt.centerName` dove manca e `lead.centro` se vuoto), avviso "N clienti senza nome del centro" in cima (`clientsMissingCenter`: un cliente = un appuntamento Setter chiuso o un lead Venditore). Stessa etichetta sui Setter chiusi senza centro in Setting → Appuntamenti e sui lead Cliente senza centro (lista e scheda, `leadMissingCenter` in lead.js).
3. Barra periodo `renderDashboardPeriodBar` (+ "Migliore di sempre", `renderBestPeriodCaption`).
4. Quattro ciambelle `renderDashboardDonuts` (Setting a sinistra, Venditore a destra), componente unico `renderDonut(data, opts)` in SVG. Numeri da `computeSetterStats` (`passatiPerEsito`), `computeVenditoreStats` (`assegnatiPerEsito`, `assegnatiPassati`, `commAcconti`, `commRatePagate`, `commRateFuture`) e `computeFunnelValues`: uguali alle pagine Stats. Le due "Appuntamenti per esito" contano per data dell'appuntamento e solo quelli già passati (vedi sez. 6).
5. Pace mese `renderMonthPaceSection` (obiettivo del mese ✎: è l'unico posto dove si cambiano i `db.goals`), Commissioni totali `renderCommissionKpiSection`, grafici nel tempo `renderAndamentoCharts` (`buildAndamentoSeries`, `renderLineChart`), calendario commissioni `renderCommissioniCalendarSection`.
- Funnel, obiettivi a barre e tassi in Dashboard: tolti per decisione di Simone, non rimetterli.
- Report da copiare: `generateSessionReport`, `generateAppointmentsReport`, `generateVenditoreAppointmentsReport`.

**Stats**
- Setting: `renderSettingStatistiche` (KPI, grafici per ora `renderHourlyChartsSection`/`hourlyChartData`: appuntamenti fissati per ora di `createdAt`, spostati esclusi, e tasso di risposta per ora su OGNI chiamata, risposta = non `isNoAnswer` (richiesta di Hamza, Simone 30/10); divisione per tipo di chiamata `renderCallTypesSection`). Venditore: `renderVenditoreStatistiche` (+ `LeadCRM.renderNewStatsSection`). Niente "Esiti nel periodo" (decisione di Simone).

**Sessioni di chiamata (Setter)**
- Nuova sessione: `openNewSessionModal` → `startSessionAction` → `beginPipelineSession` / `createPipelineSession`.
- Schermata sessione: `renderSessioneAttiva`, `logCallAction` (registra un esito), `skipLeadAction`, `endSessionAction`, `toggleSessionPause`, `undoLastCallAction` (tasto "Annulla ultimo esito"; rimette anche le spunte della checklist).
- A sinistra solo i Da richiamare di oggi (`todayPendingCallbacks`); a destra la checklist (`renderLiveChecklistPanel`, `wireLiveChecklist`): stato in corso su `db.activeSession.checklist`, `cb.inCallChecklist`, `entry.inCallChecklist` (richiamata e Round Recupero hanno la stessa checklist).
- Appuntamento fissato in sessione: `openAppointmentSetModal({ checklist, onSaved })` salva `apt.checklist` + `apt.checklistPct`; lista sotto gli esiti `renderSessionApptList` (con le voci prese "N/8" e il ⋯ = `openApptChecklistModal`).
- Esito "conferma appuntamento" (l'altro `isConversion`) con almeno una voce spuntata: la sessione non sa il nome del lead, quindi `openConfirmChecklistPickModal` chiede "Quale appuntamento?" (Setter da oggi in poi, da confermare o confermati, ricerca per nome/telefono, "Salta" = niente). Salva in unione (`mergeChecklistIntoAppt`); lo stato di prima va in `undoState.apptChecklist` e "Annulla ultimo esito" lo rimette (`restoreApptChecklist`).
- Sessione dimenticata aperta da un altro giorno: `staleActiveSession`, avviso `renderStaleSessionBanner` (all'apertura e ogni 20 s), `closeStaleSession` (chiude all'ora dell'ultima chiamata, o all'inizio; anche "Fine sessione" fa così). Finché resta aperta, le chiamate automatiche (richiami, conferme, recupero, follow-up) vanno nelle sessioni automatiche di oggi: `sessionForNewCalls`.
- Elenco e dettaglio: `renderSessioniList` (un filtro pipeline, ultime 20 sessioni + "Mostra altre", attività `renderCallActivitySection`, ricerca per giorno `renderSessionDaySearch`/`parseDaySearch`, grafico checklist `renderChecklistChartSection`/`checklistChartData`), `renderSessioneDetail`.

**Da richiamare (callback)**
- Esito "Da richiamare" → `openCallbackModal`. Lista: filtro "Da richiamare" in Setting → Appuntamenti (`pendingCallbacksSorted`, `renderCallbackListRow`); gli scaduti stanno anche nelle Task della Dashboard. Modifica `openEditCallbackModal`, cestino `removeCallback`.
- Richiamata: `startCallbackCall`, `renderCallbackCallScreen`, `logCallbackCall`, `appendCallbackCallToSession`.
- Checklist nella richiamata con l'esito "conferma appuntamento": stessa regola della sessione (almeno una voce, unione). `saveCallbackConfirmChecklist`: se un solo appuntamento candidato ha lo stesso telefono (`sureConfirmApptForPhone`) salva subito, altrimenti "Quale appuntamento?" con la ricerca già sul nome. Se la chiamata è finita nella sessione aperta, "Annulla ultimo esito" la toglie, rimette la checklist e riporta il richiamo tra i Da richiamare (`undoState.callback`). Senza sessione aperta non c'è il tasto (come per ogni richiamata).
- Round Recupero: non ha un esito di conferma, quindi lì la checklist si salva solo con "Appuntamento fissato" (`openRecoveryAppointmentModal`).
- Senza sessione aperta, le richiamate finiscono nella sessione automatica del giorno "Richiami" (`CALLBACK_AUTO_PIPELINE_ID`).
- Notifica all'ora del richiamo, su ogni pagina: `startCallbackNotifications` (timer ogni 20 s, avviato a fine `startForUser`, uno solo), `refreshCallbackNotifications` (anche da `persist` e `renderRoute`), clic → `openCallbackFromNotification`, X → `cb.dismissedAt`. Notifica di sistema solo se il permesso è dato da 👤 Account (`cb.notifiedAt`). Funziona solo con il tool aperto.

**Round Conferme**
- Richiama gli appuntamenti Setter del giorno lavorativo dopo (il venerdì quelli del lunedì): `getConfirmTargetDateKeys`, `getPendingConfirmAppointments`.
- Schermata: `renderConfirmRoundScreen`, `applyConfirmOutcome`, `exitConfirmRound`. Banner dalle 18: `renderConfirmAlertBanner`.
- Checklist: pannello a destra con le voci già salvate sull'appuntamento spuntate e bloccate (`confirmChecklistItems`), spunte in corso su `apt.inCallChecklist`. "Confermato 24h" le salva in unione (`mergeChecklistIntoAppt`) solo se c'è almeno una voce; Annullato, Spostato e Skip le buttano, Non risposto le tiene.
- Le chiamate vanno nella sessione aperta se c'è (`appendConfirmCallToSession`), altrimenti nella sessione automatica del giorno "Conferme".
- Messaggio WhatsApp: `CONFIRM_WHATSAPP_TEMPLATE`, `buildWhatsAppConfirmMessage`.

**Round Recupero Appuntamenti**
- Unico round fisso per no show e annullati, sia Setter sia Venditore: `addToRecoveryRound`, `renderRecoveryRoundScreen`, `applyRecoveryOutcome`.
- Le chiamate del round contano nell'attività del giorno: vanno nella sessione aperta se c'è, altrimenti nella sessione automatica del giorno "Recupero" (`logRecoveryCall`, `appendRecoveryCallToSession`). "Posticipato" e "Rimuovi" non sono chiamate.
- Esiti del round (Simone, 19/10): Non risposto resta nel round; "Non più interessato" è una chiamata e chiude la voce; "Da richiamare" chiede giorno e ora e crea un vero Da richiamare con le note del round (`openRecoveryCallbackModal`), poi chiude la voce (Annulla = niente); "Appuntamento fissato" crea l'appuntamento Setter "Recuperato" e chiude la voce; Posticipato resta; Rimuovi chiude.
- Entrata e uscita: No show e Annullato entrano (`addToRecoveryRound`, una voce attiva per appuntamento; il motivo segue l'ultimo esito). Qualsiasi altro stato, Spostato o appuntamento cancellato chiudono la voce (`deactivateRecoveryEntryForAppointment`, `closedBy: 'stato'`). Rimesso No show dopo una correzione: si riprende la voce chiusa da `'stato'` con tentativi e note. Voci chiuse dall'utente (`closedBy` `utente`, `non_interessato`, `da_richiamare`) non tornano.
- No show su un appuntamento futuro: la voce c'è ma non si vede (round e contatori) finché l'ora non è passata (`isFutureNoShowEntry`). L'Annullato futuro entra subito.
- Voci "fantasma" (appuntamento che non esiste più; per il Venditore anche senza un lead con quel nome): chiuse all'apertura, `closeGhostRecoveryEntries` (`closedBy: 'fantasma'`).
- Contatori ("N da recuperare" nelle Task, numero sul tasto del round) = `visibleRecoveryEntries`, divisi per ruolo (`recoveryEntryRole`: i Venditore solo con la parte Venditore accesa). Il round aperto mostra solo il ruolo da cui si è entrati (`db.recoveryRoundRole`, `roundRecoveryEntries`; la card in Setting → Appuntamenti = Setting). Un lead Cliente che salta un appuntamento resta nel round.
- Sessioni automatiche: funzione comune `appendCallToAutoSession(pipelineId, nome, call)`.
- Follow-up Venditore: tolti dal tool (Simone, 30/10: li gestisce fuori). Le vecchie chiamate `isLeadFollowUpCall` restano nelle sessioni "Follow-up Venditore" e nelle statistiche (`logLeadFollowUpCall`, `LEAD_FU_AUTO_PIPELINE_ID` non scrivono più niente di nuovo).
- No show Venditore: **un posto solo, il Round Recupero** (Simone, 24/10; prima stava nelle Task). Il lead tiene come prossima azione "🔁 Recupero no show", ma in lista e nella scheda si vede "🔁 Nel Round Recupero" (tasto "Chiamalo ora" = round aperto su di lui) e NON compare nelle Task della Dashboard (`inRecoveryRound` in lead.js). Gli esiti del round aggiornano il lead aperto (`LeadCRM.onRecoveryOutcome`): Non più interessato = Perso; Da richiamare = un Da richiamare normale (Simone 30/10, come per il Setter). "Appuntamento fissato" crea un nuovo appuntamento **Venditore** dello stesso lead (`LeadCRM.addApptFromRecovery`; con la parte Venditore spenta resta l'appuntamento Setter "Recuperato"). Un lead Cliente non cambia.

**Appuntamenti (mini-CRM)**
- Modello: `newAppointment(role)`. Stati Venditore: `DEAL_STAGES`, `dealStageDef`.
- Setter (Setting → Appuntamenti): `renderAppuntamenti`, `renderApptRow`, `wireAppuntamentiEvents`. Dall'alto: Round Recupero, Round Conferme, filtri `SETTER_APPT_FILTERS` (Prossimi, Da esitare, Tutti, No show e annullati, Da richiamare = i `db.callbacks` nella stessa lista), ricerca, tendina "Lista appuntamenti" (localStorage `comms_listaAppuntamentiAperta`), calendario. Riga senza telefono; Chiuso, Cash e Totale dietro il tasto €; ⋯ = `openApptChecklistModal` (checklist **modificabile**: ogni spunta si salva subito su `apt.checklist` + `apt.checklistPct`, richiesta di Hamza 24/10; telefono; elimina). "+ Nuovo Appuntamento" = `openNewSetterApptModal`. Esiti Setter: `SETTER_PRESENTED_LABEL`. Rate: `openInstallmentsModal`.
- Chiusura: `openClosingDataModal` chiede il nome del centro (Setter anche il venditore, con suggerimenti `usedVenditoreNames`). Venditore: anche dal ⋯ dell'appuntamento (esito Chiuso / Contratto firmato) e nella scheda → Pagamenti.
- Calendario appuntamenti grande, uno per ruolo: `renderApptCalendar(role)` + `wireApptCalendar(role)` (Setting → Appuntamenti e Venditore → Lead; sotto 900 px elenco per giorno).
- Registrazioni call: tasto 🎙️ in Venditore → Lead → `openCallRecordingsModal`.
- Spostato: `openRescheduleModal` → `rescheduleAppointment` crea un appuntamento NUOVO collegato (`rescheduledFromId` / `rescheduledToId`).
- Soldi: `apptTotalSold`, `getEffectiveInstallments` (l'acconto incassato diventa una rata pagata sintetica).
- Calendario commissioni per giorno: `renderCommissioniCalendarSection` (Dashboard).

**Parte Venditore a lead (lead.js)**
- `LeadCRM.ensureLeads()` collega ogni appuntamento Venditore a un lead (`apt.leadId`): stesso nome (senza la sigla " - MJ - N") o stesso telefono = stesso lead.
- Venditore → Lead (`renderLeadList`): 🎙️ Registrazioni, Report, "+ Nuovo lead" (`openNewLead`: lead + primo appuntamento; è l'unico modo di creare appuntamenti Venditore), filtri in una tendina (localStorage `comms_filtriLeadAperti`), lista con ⋯ (`openLeadMenu`), calendario Venditore.
- Scheda (`renderLead`): testata con nome, stato (tendina), centro, telefono; gli altri dati in "✎ Modifica dati" (`openEditLeadData`). Appuntamenti come righe di testo (`apptsCardHtml`); data, esito, € Pagamenti ed Elimina nel ⋯ (`openApptMenu`, `wireApptControls`), "+ Appuntamento" (`openAddAppt`; su un lead Perso o Freddo lo riporta In trattativa, `reopenLeadForAppt`), a destra Storico (con le note) e Pagamenti, 🗑 elimina lead (`openDeleteLead`).
- **Follow-up fuori dal tool (Simone, 30/10)**: niente prossima azione, Round Follow-up, "Com'è finita?", "Cosa fare adesso", "Manca la prossima azione" né regola dei 6 follow-up. L'esito si mette dal ⋯ dell'appuntamento; "Metti l'esito" nelle Task (`openEsito`) apre quel ⋯. Il lead segue gli esiti (`onDealStageChanged`: chiuso → Cliente con il nome del centro, perso → Perso, no show/annullato → Round Recupero Venditore). Lista Lead: colonna "Prossimo passo" = appuntamento in programma, da esitare o "🔁 Nel Round Recupero". `l.next` resta solo come segno interno del recupero (`inRecoveryRound`). Appuntamento cancellato: se il lead resta senza appuntamenti sparisce anche lui (`onApptDeleted`).
- Note: solo nello storico della scheda lead (`k: 'nota'`). Le vecchie note degli appuntamenti e la data di follow-up della tabella passano nel lead da sole (`moveApptExtras`, dentro `ensureLeads`).
- Soldi: la scheda Pagamenti scrive sull'ultimo appuntamento chiuso del lead, o su quello scelto (tasto € o tendina se ce n'è più di uno). Stesse regole di commissione.
- Interruttore `db.settings.venditoreOn` in 👤 Account: spento nasconde la voce Venditore, le righe Venditore delle Task e dei Prossimi pagamenti e le ciambelle Venditore.

**Dati**
- `exportData` / `importData` (backup .json). Importa sostituisce tutto anche online.

---

## 5. Modello dati

Tutto sta in un unico oggetto `db`. Struttura completa e commentata in `storage.js` → `defaultData()`.

Dove viene salvato (vedi `cloud-sync.js`):
- Online su Supabase: tabella `appuntamenti` (una riga per appuntamento), `sessioni` (una riga per sessione, chiamate dentro), `lead` (una riga per lead, tutto in `data`), `stato` (tutto il resto, una riga per utente). Si inviano solo le righe cambiate.
- Due schede dello stesso browser: la scheda che apre il tool per ultima è quella attiva; le altre mostrano "Il tool è aperto in un'altra scheda" e non salvano più finché non si ricaricano (`announceThisTab`, `blockThisTab`: BroadcastChannel + evento `storage`).
- Due dispositivi: la riga `stato` ha dentro un numero di versione `_rev`. Prima di ogni invio il tool controlla la versione online (`_onlineRev`); se un altro dispositivo ha salvato, riscarica e unisce (`_reconcile`): liste per id (task, richiami, Round Recupero, pipeline...) con le cancellazioni dei due lati; appuntamenti, sessioni e lead: vince chi li ha cambiati, una riga cancellata altrove resta cancellata. La scrittura di `stato` è condizionata alla versione (PATCH con `data->>_rev`): non sovrascrive mai una versione che non ha letto. Anche all'apertura, una copia locale con modifiche non inviate passa da questa unione.
- Round Recupero: se lo stesso appuntamento finisce nel round da tutti e due i dispositivi, dopo l'unione resta una voce sola (`mergeDuplicateRecoveryEntries` in storage.js: anche all'apertura).
- Limite rimasto: la STESSA voce (stesso appuntamento, task, impostazione...) cambiata su due dispositivi insieme: resta una sola versione (la più recente se la voce ha una data, se no quella del dispositivo che salva).
- Copia locale illeggibile: `Storage.load` restituisce null, il tool usa i dati online e non invia niente (la copia rovinata resta in `...__illeggibile`).
- Se la tabella `lead` non esiste, i lead restano dentro `stato`; al primo caricamento dopo averla creata (è dentro `supabase/schema.sql`) passano nella tabella da soli (`CloudSync.leadTable`).
- Copia locale per utente: localStorage `chiamateTrackerData_v1__<id utente>`.
- La chiave vecchia `chiamateTrackerData_v1` (versione senza login) non viene mai toccata: al primo login il tool la legge, scarica un backup e la carica online.
- Date nel database: timestamptz. `scheduledAt`/`presentedAt` restano stringhe locali nel tool e sono convertite come ora italiana solo in `cloud-sync.js`.

- `pipelines[]`: liste di chiamata, ognuna con i suoi `outcomes[]` (`isConversion`, `isNoAnswer`).
- `sessions[]` e `activeSession`: ogni sessione ha `calls[]`, `startedAt`, `endedAt`, `pausedTotalMs`, `skips` (la sessione aperta anche `checklist`, spunte in corso).
- Chiamata: `{ id, timestamp, outcomeId, outcomeLabel, isConversion, isNoAnswer, isSecondAttempt, groupId, undoState? }` + al massimo un flag di tipo: `isCallbackCall`, `isConfirmCall`, `isRecoveryCall`, `isLeadFollowUpCall` (senza flag = sessione normale; `CALL_TYPES`, `callTypeOf` in utils.js).
  - `groupId` = il lead. Più chiamate con lo stesso `groupId` = un solo lead.
- `appointments[]`: campi in `newAppointment()`. `role` è `'setter'` o `'venditore'`.
  - Setter: `presentedStatus` ∈ `no`, `confirmed24h`, `presented`, `no_show`, `annullato`, `spostato`.
  - Venditore: `dealStage` (vedi `DEAL_STAGES`), `notes[]`, `nextFollowUpDate` (YYYY-MM-DD).
  - Soldi: `cashCollected`, `totalSold`, `installments[]` (`amount`, `paid`, `paidDate`, `dueDate`).
  - Campi del restyling (assenti nei dati vecchi = "appuntamento di prima"): `centerName` (chiesto alla chiusura), `venditoreName` (solo Setter), `checklist: { <id>: true/false }` + `checklistPct` (solo Setter: fissati in chiamata o completati in conferma). Voci in `CHECKLIST_ITEMS` (storage.js): l'`id` non si cambia mai. `inCallChecklist` = spunte in corso del Round Conferme (sparisce all'esito).
- `leads[]`: lead della parte Venditore `{ id, name, centro, city, phone, email, setter, stato, next, promises[], history[], fuNoAnswer, wasFollowUp, callGroupId?, callGroupDate? }` (`callGroup*` = lead delle chiamate di oggi). Stati: Nuovo, Trattativa, Follow-up, Cliente, Perso, Freddo.
  - **Nomi identici:** due persone diverse con lo stesso nome identico finiscono in un lead solo (stesso nome = stesso lead, `ensureLeads`). Succede di rado e non c'è un controllo automatico. Se lo noti (dati, mail, appuntamenti dettati da Simone, due telefoni diversi nello stesso lead), **dillo a Simone** prima di toccare qualcosa: decide lui se separarli.
- `callbacks[]`: i "Da richiamare" (+ `notifiedAt`, `dismissedAt` per le notifiche).
- `recoveryRound[]`: i lead del Round Recupero.
- `tasks[]`: task scritte a mano con "+ Task" `{ id, text, role, dueDate, dueTime, createdAt, doneAt }`. Fatte = `doneAt`, non si cancellano.
- `goals`, `settings` (`accent`, `accentCustom`, `themeMode`, `textSize`, `venditoreOn`, `toggles.animatedNumbers`), `callRecordings[]`.
- Campi nuovi globali vanno in `defaultData()` e `mergeWithDefaults()` (finiscono nella riga `stato`). Campi nuovi di appuntamenti e sessioni passano online da soli (`extra` / `calls` in cloud-sync.js).

**Date**: gli input `datetime-local` salvano stringhe locali senza fuso (`2026-10-14T15:30`). Per i valori di default usa sempre `localDateTimeValue(new Date())` e `dateInputValue(new Date())` (utils.js). **Mai** `toISOString().slice(...)`: dà l'ora UTC, 2 ore indietro in Italia (bug corretto il 13/10).

### Chiave service_role (accesso admin al database)

- Sta nella variabile d'ambiente `SUPABASE_SERVICE_KEY`. **Mai** stamparla, metterla nel repo o scriverla in chat.
- REST: `https://<progetto>.supabase.co/rest/v1/<tabella>` con header `apikey` e `Authorization: Bearer`. Filtri su `user_id` sempre con `eq.<uuid completo>`.
- Non crea tabelle (niente SQL via REST): per un cambio di schema dai il codice a Simone, che lo lancia in Supabase → SQL Editor.
- Ogni modifica fatta con la chiave finisce in `storico_modifiche` con `origine = 'admin'`.
- Dopo una modifica ai dati, chiedi a chi ha il tool aperto di **ricaricarlo**: la sua copia locale potrebbe rimandare la versione vecchia della riga.
- I dati di un utente si toccano solo con il suo ok (quelli di Hamza: mai senza l'ok esplicito di Simone).

---

## 6. Regole sui numeri (decise da Simone)

Prima di cambiarne una, chiedi a Simone.

**Lead e chiamate**
- Un lead chiamato più volte conta **1 volta**, con l'**ultimo** esito (ordinato per orario). Vale anche per gli esiti nel dettaglio sessione (`sessionOutcomeCountsByLead`).
- "Senza risposta" solo se nessun tentativo ha avuto risposta.
- "Da richiamare" richiamato lo stesso giorno = stesso lead. Un altro giorno = lead nuovo.
- Le conferme dello stesso appuntamento lo stesso giorno = un lead; un altro giorno = lead nuovo (`ensureConfirmGroupId`).
- Contatori di sessione: `countSessionLeads`.
- Un solo "Non risp" per sessione (richiesta di Hamza, scelta di Simone 19/10): i "Non risposto" di Round Conferme, Round Recupero e follow-up Venditore finiti in una sessione normale si contano sotto l'esito senza risposta della sua pipeline (`callOutcomeLabelIn` in utils.js, vale anche per le sessioni già salvate; le chiamate nuove lo prendono già, `roundCallAsSessionOutcome`). Stessa cosa per "Appuntamento fissato" di Round Recupero e follow-up: va nell'esito della pipeline che si chiama "Appuntamento fissato" (maiuscole e spazi a parte; mai in un altro esito di conversione come "conferma appuntamento"; se la pipeline non ce l'ha resta com'è). In Stats, nel report e nel dettaglio sessione anche le chiamate dei round nelle sessioni automatiche vanno sotto "Non risp" / "Appuntamento Fissato": con più pipeline che li chiamano in modo diverso vince l'etichetta più usata (`statsRoundCallLabels`). Stessa etichetta anche nel dettaglio di una sessione automatica (Simone, 19/10: `sessionOutcomeCountsByLead` → `autoSessionCallLabel`).
- Chiamate all'ora: tempo di sessione **senza le pause**.

**Appuntamenti Setter**
- Fissati: contati per **data di inserimento** (`createdAt`). Gli spostati non contano come nuovi (`isCountedAsNewBooking`).
- Show rate = Presentati / (Presentati + No Show + Annullati), solo appuntamenti già passati. Spostati fuori. Quelli lasciati su "No" o "Confermato24h" non contano (Simone, 16/10: stessa regola del Venditore).

**Appuntamenti Venditore**
- Assegnati: contati per **data dell'appuntamento** (`scheduledAt`), spostati esclusi.
- Show rate = presentati / (presentati + no show + annullati). Spostati fuori (Simone, 16/10).
- Closing rate = chiusi / presentati in target.
- Annullato: conta come "non presentato" nello show rate, fuori dal closing rate. Spostato: fuori da tutti e due.
- Non in target: conta come show, fuori dal closing rate.
- Chiusi = Contratto Firmato + Chiuso.

**Commissioni** (`commissionEventsForAppointment` in utils.js)
- Setter: 40 € per ogni presentato + 3% dell'incassato sui chiusi.
- Venditore: 10% dell'**incassato**: cash collected + rate spuntate come pagate. Le rate future contano solo quando vengono spuntate.
- Data della commissione: l'acconto va al giorno della presentazione (`appointmentCashDate`), ogni rata al giorno in cui è stata pagata. Mai al giorno in cui la riga viene segnata "chiuso".
- "Totale venduto" in dashboard somma Setter + Venditore: va bene così.

**Lead (parte Venditore)**
- No show / annullato: la prossima azione diventa sempre "🔁 Recupero no show". Un tentativo senza risposta conta come un follow-up senza risposta (6 → Freddo).
- No show corretto dalla tendina in un altro esito: "🔁 Recupero no show" diventa "📞 Chiamata" con la stessa data e ora (Simone, 19/10; `onDealStageChanged`). Rimesso su "— Da impostare —": la prossima azione si toglie (il prossimo passo torna l'appuntamento, come prima del no show). Vale solo se prima del no show non c'era una prossima azione (vedi sotto).
- Chiuso / Contratto firmato o Perso / Non in target messo per errore e cambiato dalla tendina della scheda: il lead torna aperto (In trattativa se ha appuntamenti svolti, se no Nuovo; Follow-up se lo era prima), se non resta un altro appuntamento chiuso (Cliente) o se era l'ultimo appuntamento con un esito (Perso) (`onDealStageChanged(apt, prevStage)`).
- Prossima azione di prima (Simone, 19/10): un esito che chiude il lead o ne cambia la prossima azione (Chiuso, Contratto firmato, Perso, Non in target, No show, Annullato, dalla tendina) salva una copia sul lead (`l.prevNext`: prossima azione, follow-up senza risposta, `wasFollowUp`, stato, appuntamento). Se quell'esito viene corretto e il lead torna aperto, tornano la prossima azione di prima (se è già scaduta, spostata a oggi alla stessa ora: Simone, 24/10) e i contatori, con la riga "Ripristinata la prossima azione di prima" nello storico. Se intanto la prossima azione è stata cambiata (a mano o con un "Fatto") non si tocca. Stessa cosa con lo stato del lead cambiato a mano (aperto → Cliente / Perso / Freddo → di nuovo aperto). La copia si usa una volta sola. Dati vecchi senza copia: come prima.
- Lead Perso o Freddo riaperto da un No show / Annullato messo per errore: corretto l'esito, torna Perso o Freddo, senza prossima azione (Simone, 24/10).
- No show Venditore segnato prima dell'ora dell'appuntamento: "🔁 Recupero no show" prende giorno e ora dell'appuntamento; nel Round Recupero compare solo quando l'ora è passata (`isFutureNoShowEntry`). L'Annullato entra subito.
- Numero dell'appuntamento (1°, 2°…): solo appuntamenti svolti (presentati, anche non in target). Spostati senza numero.
- Follow-up, prossima azione e regola dei 6 follow-up → Freddo: tolti dal tool il 30/10 (Simone li gestisce fuori). Lo stato del lead (tendina) resta.
- Chiuso: esito "Chiuso" (ha pagato) o "Contratto firmato" dal ⋯ dell'appuntamento; chiede il nome del centro.
- Nuovo appuntamento ("+ Appuntamento", o "+ Nuovo lead" con il nome di un lead che c'è già) su un lead Perso o Freddo: torna In trattativa, con una riga nello storico, e i follow-up senza risposta ripartono da 0 (Simone, 18/10).

**Restyling (Simone, 17/10/2026)**
- Le chiamate di Round Conferme, Da richiamare, Round Recupero e follow-up dei lead Venditore contano tutte come chiamate di Setting (Stats ed esiti), con la regola "stesso lead stesso giorno = 1".
- Ciambella commissioni Venditore: Acconti incassati + Rate pagate + Rate future (10% delle rate non pagate degli appuntamenti con commissioni nel periodo). Al centro il totale delle tre e "di cui X € incassati" = acconti + rate pagate = commissioni Venditore delle Stats. Le rate future non entrano mai nelle commissioni.
- Checklist: % = voci spuntate / 8, salvata sui fissati e anche con la conferma (Round Conferme, esito "conferma appuntamento" in sessione e nella richiamata; non nel Round Recupero, che non ha un esito di conferma), ma solo se almeno una voce è spuntata: si unisce a quella già salvata (una voce presa resta presa). Grafico in Sessioni: una barra per giorno di inserimento (`createdAt`) = media delle % (solo appuntamenti con checklist, spostati esclusi); un appuntamento completato in conferma aggiorna la media del giorno in cui era stato fissato. Legenda = le 3 voci prese meno spesso.

**Risposte di Simone (18/10/2026)**
- Prossimi pagamenti: tutte le rate non pagate di tutti gli appuntamenti chiusi (anche più chiusure dello stesso lead Venditore).
- Ciambelle Dashboard "Appuntamenti per esito": per **data dell'appuntamento** (`scheduledAt`) e solo appuntamenti **già passati** (ora ≤ adesso) nel periodo. Setting: Presentati, No show, Annullati, Spostati, Confermati 24h, Da esitare; Presentati e Presentati + No show + Annullati sono uguali a "Presentati" e "Già svolti" delle Stats. Venditore: il centro è "assegnati già passati", quindi può essere minore di "Assegnati" delle Stats se il periodo comprende giorni futuri. Fissati per `createdAt` e show rate non cambiano.
- Gli appuntamenti futuri non sono mai "da esitare" (filtri, bollini, Task, ciambelle).

**Obiettivi e pace**
- Giorno = ore 9-19. Settimana e mese = solo giorni lun-ven.

---

## 7. Come testare

Niente test automatici nel repo: si testa nel browser vero con Playwright.

- Apri `index.html` con `file://`, carica i dati in localStorage, ricarica.
- Usa sempre `timezoneId: 'Europe/Rome'`.
- Per fissare l'ora (es. testare il Round Conferme alle 18) sostituisci `Date` con `addInitScript`.
- Dati realistici: il backup di Simone (.json, formato identico a localStorage). **Non sta nel repo** perché contiene nomi e telefoni dei lead: è nei file del progetto. Non committarlo mai.
- Dati finti (tutti i casi: sessioni automatiche, rate, callback, recupero, checklist): `node tools/dati-finti.js 2026-10-16 > /tmp/finti.json`, poi prova con lo stesso giorno come ora finta.
- Con localStorage vuoto non ci sono pipeline: aggiungine una con `defaultOutcomesList()` (storage.js).
- Controlla sempre che non ci siano errori in console (`page.on('pageerror')`) passando per tutte le route.

Script di base: `tools/prova-tracker.js` (vedi commento in testa al file).

```bash
node tools/prova-tracker.js /percorso/backup.json 2026-10-16T11:00
# VIEWPORT=390x844 = telefono (conta come errore lo scroll orizzontale), SENZA_TABELLA_LEAD=1, CARTELLA_SCREENSHOT=...
```

Per gli screenshot da mandare a Simone: viewport 1440×900, salva PNG fuori dal repo; per la mail a Hamza convertili in JPG dentro `aggiornamenti/AAAA-MM-GG/`.

---

## 8. Git

- Lavora su un branch, merge su `main` solo dopo l'ok di Simone.
- Messaggi di commit in italiano, con il "cosa" visibile all'utente: `Sessione: tasto Annulla ultimo esito (richiesta di Hamza)`.
- Se la richiesta viene da Hamza, scrivilo nel messaggio.
- Dopo il push controlla lo stato del commit su GitHub: context "Vercel" deve essere `success` sul commit giusto. Dal cloud `*.vercel.app` non si raggiunge: per vedere il sito chiedi a Simone di aprirlo.

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

- Fatto: login + database Supabase, tool pubblicato su **Vercel (piano Hobby)** (ottobre 2026).
- Fatto: restyling (ottobre 2026): barra laterale, Dashboard con Task e Prossimi pagamenti, checklist in chiamata e in conferma, notifiche dei richiami, guida colori.
- Chiavi Supabase: nel codice solo la chiave pubblica (anon) con le regole RLS attive. La chiave `service_role` mai nel repo.
- Dopo il database: **gestione appuntamenti del venditore via chat** (Simone scrive cosa è successo, Claude aggiorna esito, nota, follow-up, calendario e promemoria). Dettagli e domande aperte nel file di passaggio.
