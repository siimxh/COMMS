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
- **Versione in uso**: https://comms-wine.vercel.app — login + database Supabase. Vercel (progetto "comms", piano Hobby) pubblica il branch `main`: push su `main` = online in 1-2 minuti.
- Dal 16/10/2026 c'è **una sola versione del codice**: `main`. Il branch `supabase` è fermo (era il cantiere del login) e non si usa più.
- GitHub Pages https://siimxh.github.io/CRM-SETTER-VENDITORE/ pubblica anche lui `main` (stesso login, stessi dati). Nessuno lo usa: il link da dare è quello di Vercel.
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
- Screenshot: JPG in `aggiornamenti/AAAA-MM-GG/` nel repo, inseriti nella mail come `<img>` con link `raw.githubusercontent.com/siimxh/CRM-SETTER-VENDITORE/main/aggiornamenti/...`.

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
| `supabase/schema.sql` | Tabelle, regole RLS, foto notturna, storico modifiche. Si lancia dal SQL Editor di Supabase |
| `supabase/lead.sql` | Solo la tabella `lead` (per un database che ha già lo schema) |
| `lead.js` | Parte Venditore a lead: righe Venditore delle Task in Dashboard, lista Lead, scheda lead, "Com'è finita?", Fatto/Sposta, numeri nuovi. Tutto dentro `LeadCRM` |
| `app.js` | Tutta l'interfaccia: routing, render, eventi, modali (~6.500 righe) |
| `style.css` | Stile. In testa i token della guida colori (`--accent-100..500`, `--neutral-0..900`, `--success`, `--danger`, raggi); i nomi vecchi (`--accent`, `--bg`...) puntano ai token. Niente colori scritti a mano nei componenti |
| `aggiornamenti/` | Screenshot delle mail a Hamza, una cartella per rilascio |
| `tools/` | `prova-tracker.js` (prova nel browser), `dati-finti.js` (dati di prova inventati, vedi sezione 7), `anonimizza-backup.js` (copia anonima di un backup), `eod-report.js` (numeri del modulo di fine giornata, letti dal database: lo usa la mail EOD delle 19) |

Il codice è commentato in italiano e i commenti spiegano spesso **perché** una regola è così ("richiesto dall'utente", "CORREZIONE"). Leggili prima di cambiare una regola: di solito è una decisione di Simone.

---

## 4. Mappa di app.js

Cerca per nome funzione (`grep -n "function nome"`), i numeri di riga cambiano.

**Base e routing**
- `persist()` salva nella copia locale e accoda il salvataggio online (`CloudSync.schedule`). Chiamala dopo ogni modifica a `db`.
- Avvio: `bootApp` → login (`loginSubmitAction`) → `startForUser` → `openUserData` (dati online, o import dei dati del browser al primo login). Account ed Esci: `openAccountModal`, `logoutAction` (Esci ricarica la pagina). Dentro 👤 ci sono Esporta, Importa, l'interruttore Parte Venditore e il permesso per le notifiche di sistema.
- Layout (restyling, ottobre 2026): barra laterale `initSidebar`, `updateSidebarActive`, `openMobileSidebar`/`closeMobileSidebar` (compressa ricordata in localStorage `comms_barraCompatta`). Barra della pagina: `renderPageBar(section, tab)`; tab `SETTING_SUBROUTES`, `VENDITORE_SUBROUTES`. Un solo pulsante nero (`.btn-primary`) per vista.
- Periodo **unico**: Dashboard, Sessioni e Stats usano la stessa barra (`renderPeriodBar`, `wirePeriodBar`) e lo stesso periodo (`getPeriod`, `setPeriod`, `getPeriodRange`; `getPeriodRangeOrNull`, null = "Tutto"). Il browser si ricorda la scelta (localStorage `chiamateTracker_periodo`).
- `renderRoute()` decide cosa mostrare da `location.hash`. Route (piatte, con trattino):
  - `#/dashboard` (pagina d'apertura)
  - Setting: `#/setting-appuntamenti`, `#/sessioni` (dettaglio: `#/sessioni/<id>`), `#/setting-statistiche` (tab Stats)
  - Venditore: `#/venditore-lead` (scheda: `#/lead/<id>`), `#/venditore-statistiche`
  - 🎨 Aspetto: `#/impostazioni`
  - Route vecchie → `ROUTE_REDIRECTS`: `#/oggi` → Dashboard, `#/venditore-appuntamenti` e `#/venditore-tabella` → Lead. La pagina Oggi e la tabella Appuntamenti Venditore non esistono più.
  - Cambiando route si torna in cima alla pagina (`lastRenderedRouteKey`).
- Priorità prima della route: richiamata in corso (`callbackCallActiveId`), sessione attiva non minimizzata, Round Conferme, Round Recupero. Se uno di questi è attivo, la route viene ignorata (e barra laterale e barra della pagina si nascondono).
- Tema (🎨 Aspetto, `renderBuilderPage`): accento a rampa. `ACCENT_PRESETS` (Arancione = default, Indaco, Teal, Magenta) o colore a scelta (`accentRampFromHex` genera 500-100), Chiaro/Scuro (`settings.themeMode`), testo Normale/Grande, un effetto ("Numeri che contano"). `applyTheme` scrive inline solo le variabili d'accento (e il testo sopra l'accento, scuro se il bianco non arriva a 4,5:1). Accento verde → trend in blu; accento rosso → trend in viola. Preset e effetti vecchi spariti: `migrateSettings` (storage.js) riporta tutti su Arancione tenendo chiaro/scuro.

**Dashboard** (`renderDashboard`, eventi `wireDashboardSections`), dall'alto:
1. Task da fare: `collectDashboardTasks`, `renderDashboardTasks`, `wireDashboardTasks`, "+ Task" → `openNewTaskModal`. Priorità 1 conferme di domani (da mezzanotte), 2 Da richiamare di oggi e scaduti + una riga "N da recuperare" + righe Venditore (`LeadCRM.dashboardTaskItems`: da esitare, senza prossima azione, azioni di oggi e scadute), 3 `db.tasks`. Prime 8 + "Mostra tutte".
2. Prossimi pagamenti: `collectUpcomingPayments`, `renderDashboardPayments`, `wireDashboardPayments` (spunta "Pagato" sulla rata vera). Nome del centro, mai la persona. Venditore: solo l'ultimo appuntamento chiuso del lead (`LeadCRM.paymentsApptOf`).
3. Barra periodo `renderDashboardPeriodBar` (+ "Migliore di sempre", `renderBestPeriodCaption`).
4. Quattro ciambelle `renderDashboardDonuts` (Setting a sinistra, Venditore a destra), componente unico `renderDonut(data, opts)` in SVG. Numeri da `computeSetterStats` (`fissatiPerEsito`), `computeVenditoreStats` (`assegnatiPerEsito`, `commAcconti`, `commRatePagate`, `commRateFuture`) e `computeFunnelValues`: uguali alle pagine Stats.
5. Pace mese `renderMonthPaceSection` (obiettivo del mese ✎: è l'unico posto dove si cambiano i `db.goals`), Commissioni totali `renderCommissionKpiSection`, grafici nel tempo `renderAndamentoCharts` (`buildAndamentoSeries`, `renderLineChart`), calendario commissioni `renderCommissioniCalendarSection`.
- Funnel, obiettivi a barre e tassi in Dashboard sono stati tolti (decisione di Simone, 17/10): non rimetterli.
- Report da copiare: `generateSessionReport`, `generateAppointmentsReport`, `generateVenditoreAppointmentsReport`.

**Stats**
- Setting: `renderSettingStatistiche` (KPI, divisione per tipo di chiamata `renderCallTypesSection`). Venditore: `renderVenditoreStatistiche` (+ `LeadCRM.renderNewStatsSection`). Niente "Esiti nel periodo" (Simone, 16/10).

**Sessioni di chiamata (Setter)**
- Nuova sessione: `openNewSessionModal` → `startSessionAction` → `beginPipelineSession` / `createPipelineSession`.
- Schermata sessione: `renderSessioneAttiva`, `logCallAction` (registra un esito), `skipLeadAction`, `endSessionAction`, `toggleSessionPause`, `undoLastCallAction` (tasto "Annulla ultimo esito"; rimette anche le spunte della checklist).
- A sinistra solo i Da richiamare di oggi (`todayPendingCallbacks`); a destra la checklist (`renderLiveChecklistPanel`, `wireLiveChecklist`): stato in corso su `db.activeSession.checklist`, `cb.inCallChecklist`, `entry.inCallChecklist` (richiamata e Round Recupero hanno la stessa checklist).
- Appuntamento fissato in sessione: `openAppointmentSetModal({ checklist, onSaved })` salva `apt.checklist` + `apt.checklistPct`; lista sotto gli esiti `renderSessionApptList`.
- Elenco e dettaglio: `renderSessioniList` (un filtro pipeline, ultime 20 sessioni + "Mostra altre", attività `renderCallActivitySection`, ricerca per giorno `renderSessionDaySearch`/`parseDaySearch`, grafico checklist `renderChecklistChartSection`/`checklistChartData`), `renderSessioneDetail`.

**Da richiamare (callback)**
- Esito "Da richiamare" → `openCallbackModal`. Lista: filtro "Da richiamare" in Setting → Appuntamenti (`pendingCallbacksSorted`, `renderCallbackListRow`); gli scaduti stanno anche nelle Task della Dashboard. Modifica `openEditCallbackModal`, cestino `removeCallback`.
- Richiamata: `startCallbackCall`, `renderCallbackCallScreen`, `logCallbackCall`, `appendCallbackCallToSession`.
- Senza sessione aperta, le richiamate finiscono nella sessione automatica del giorno "Richiami" (`CALLBACK_AUTO_PIPELINE_ID`).
- Notifica all'ora del richiamo, su ogni pagina: `startCallbackNotifications` (timer ogni 20 s, avviato a fine `startForUser`, uno solo), `refreshCallbackNotifications` (anche da `persist` e `renderRoute`), clic → `openCallbackFromNotification`, X → `cb.dismissedAt`. Notifica di sistema solo se il permesso è dato da 👤 Account (`cb.notifiedAt`). Funziona solo con il tool aperto.

**Round Conferme**
- Richiama gli appuntamenti Setter del giorno lavorativo dopo (il venerdì quelli del lunedì): `getConfirmTargetDateKeys`, `getPendingConfirmAppointments`.
- Schermata: `renderConfirmRoundScreen`, `applyConfirmOutcome`, `exitConfirmRound`. Banner dalle 18: `renderConfirmAlertBanner`.
- Le chiamate vanno nella sessione aperta se c'è (`appendConfirmCallToSession`), altrimenti nella sessione automatica del giorno "Conferme".
- Messaggio WhatsApp: `CONFIRM_WHATSAPP_TEMPLATE`, `buildWhatsAppConfirmMessage`.

**Round Recupero Appuntamenti**
- Unico round fisso per no show e annullati, sia Setter sia Venditore: `addToRecoveryRound`, `renderRecoveryRoundScreen`, `applyRecoveryOutcome`.
- Le chiamate del round contano nell'attività del giorno (dal 16/10): vanno nella sessione aperta se c'è, altrimenti nella sessione automatica del giorno "Recupero" (`logRecoveryCall`, `appendRecoveryCallToSession`). "Posticipato" e "Rimuovi" non sono chiamate.
- Sessioni automatiche: funzione comune `appendCallToAutoSession(pipelineId, nome, call)`.
- Follow-up Venditore (restyling): "Fatto" su una prossima azione 📞 Chiamata scrive una chiamata `isLeadFollowUpCall` (`logLeadFollowUpCall`, sessione aperta o "Follow-up Venditore", `LEAD_FU_AUTO_PIPELINE_ID`). Stesso lead lo stesso giorno = 1 lead (`leadCallGroupIdToday`, anche tra recupero e follow-up). WhatsApp, audio, contratto, contenuto e "Com'è finita?" non sono chiamate.
- No show Venditore (dal 16/10): **un posto solo**. Se il lead è aperto, il no show NON compare nel round (`visibleRecoveryEntries`, `LeadCRM.handlesRecovery`) ma nelle Task della Dashboard, come prossima azione "🔁 Recupero no show". "Fatto" su quella azione è una chiamata di recupero (conta nell'attività del giorno) e, se non risponde, vale come un follow-up senza risposta: dopo 6 il lead diventa Freddo. La voce del round resta nei dati e si chiude quando il lead risponde o esce dal giro.

**Appuntamenti (mini-CRM)**
- Modello: `newAppointment(role)`. Stati Venditore: `DEAL_STAGES`, `dealStageDef`.
- Setter (Setting → Appuntamenti): `renderAppuntamenti`, `renderApptRow`, `wireAppuntamentiEvents`. Dall'alto: Round Recupero, Round Conferme, filtri `SETTER_APPT_FILTERS` (Prossimi, Da esitare, Tutti, No show e annullati, Da richiamare = i `db.callbacks` nella stessa lista), ricerca, tendina "Lista appuntamenti" (localStorage `comms_listaAppuntamentiAperta`), calendario. Riga senza telefono; Chiuso, Cash e Totale dietro il tasto €; ⋯ = `openApptChecklistModal` (checklist, telefono, elimina). "+ Nuovo Appuntamento" = `openNewSetterApptModal`. Esiti Setter: `SETTER_PRESENTED_LABEL`. Rate: `openInstallmentsModal`.
- Chiusura: `openClosingDataModal` chiede il nome del centro (Setter anche il venditore, con suggerimenti `usedVenditoreNames`). Venditore: anche in "Com'è finita?" (`#eCentro`) e nella scheda → Pagamenti.
- Calendario appuntamenti grande, uno per ruolo: `renderApptCalendar(role)` + `wireApptCalendar(role)` (Setting → Appuntamenti e Venditore → Lead; sotto 900 px elenco per giorno).
- Registrazioni call: tasto 🎙️ in Venditore → Lead → `openCallRecordingsModal`.
- Spostato: `openRescheduleModal` → `rescheduleAppointment` crea un appuntamento NUOVO collegato (`rescheduledFromId` / `rescheduledToId`).
- Soldi: `apptTotalSold`, `getEffectiveInstallments` (l'acconto incassato diventa una rata pagata sintetica).
- Calendario commissioni per giorno: `renderCommissioniCalendarSection` (Dashboard).

**Parte Venditore a lead (lead.js, dal 16/10/2026)**
- `LeadCRM.ensureLeads()` collega ogni appuntamento Venditore a un lead (`apt.leadId`): stesso nome (senza la sigla " - MJ - N") o stesso telefono = stesso lead.
- Venditore → Lead (`renderLeadList`): 🎙️ Registrazioni, Report, "+ Nuovo lead" (`openNewLead`: lead + primo appuntamento; è l'unico modo di creare appuntamenti Venditore), filtri in una tendina (localStorage `comms_filtriLeadAperti`), lista con ⋯ (`openLeadMenu`), calendario Venditore.
- Scheda (`renderLead`): appuntamenti con data e stato (`apptsCardHtml`/`wireApptsCard`, stesse regole della vecchia tabella), "+ Appuntamento" (`openAddAppt`), 🗑 elimina lead (`openDeleteLead`: lead + appuntamenti Venditore + rate, con il conto delle commissioni; gli appuntamenti Setter con lo stesso nome restano). "Cose promesse" non si mostrano più: i `promises[]` restano nei dati.
- `openEsito` ("Com'è finita?"), `openFatto`, `openSposta`, `openSetNext`, `renderNewStatsSection`. Il lead segue i cambi di stato degli appuntamenti: `onDealStageChanged`. Appuntamento cancellato: se il lead resta senza appuntamenti sparisce anche lui (`onApptDeleted`).
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
- Se la tabella `lead` non esiste, i lead restano dentro `stato`; al primo caricamento dopo averla creata (`supabase/lead.sql`) passano nella tabella da soli (`CloudSync.leadTable`).
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
  - Restyling (assenti nei dati vecchi = "appuntamento di prima"): `centerName` (chiesto alla chiusura), `venditoreName` (solo Setter), `checklist: { <id>: true/false }` + `checklistPct` (solo Setter fissati in chiamata). Voci in `CHECKLIST_ITEMS` (storage.js): l'`id` non si cambia mai.
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
- Numero dell'appuntamento (1°, 2°…): solo appuntamenti svolti (presentati, anche non in target). Spostati senza numero.
- Appuntamento presentato ma lead perso: bollino "Presentato · Perso" (`apBadge` in lead.js).
- Follow-up = "no chiaro per adesso". Dopo 6 follow-up senza risposta il lead diventa Freddo.
- Nessun lead aperto senza prossima azione (se manca compare in rosso nelle Task della Dashboard).
- "Chiuso?": Sì, ha pagato (Chiuso) / Sì, contratto firmato / No.

**Restyling (Simone, 17/10/2026)**
- Le chiamate di Round Conferme, Da richiamare, Round Recupero e follow-up dei lead Venditore contano tutte come chiamate di Setting (Stats ed esiti), con la regola "stesso lead stesso giorno = 1".
- Ciambella commissioni Venditore: Acconti incassati + Rate pagate + Rate future (10% delle rate non pagate degli appuntamenti con commissioni nel periodo). Al centro il totale delle tre e "di cui X € incassati" = acconti + rate pagate = commissioni Venditore delle Stats. Le rate future non entrano mai nelle commissioni.
- Checklist: % = voci spuntate / 8, salvata solo sui fissati. Grafico in Sessioni: una barra per giorno di inserimento = media delle % (solo appuntamenti con checklist, spostati esclusi); legenda = le 3 voci prese meno spesso.

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

Decisione di Simone (14/10/2026): **login + database Supabase**, il prima possibile, con il tool pubblicato su **Vercel (piano Hobby)**.

- Fatto: login e database online dal 14/10, `main` portato alla versione nuova il 16/10.
- Fatto: restyling (ottobre 2026, branch `restyling`): barra laterale, Dashboard con Task e Prossimi pagamenti, checklist in sessione, notifiche dei richiami, guida colori. Va su `main` solo dopo l'ok di Simone.
- Chiavi Supabase: nel codice solo la chiave pubblica (anon) con le regole RLS attive. La chiave `service_role` mai nel repo.
- Dopo il database: **gestione appuntamenti del venditore via chat** (Simone scrive cosa è successo, Claude aggiorna esito, nota, follow-up, calendario e promemoria). Dettagli e domande aperte nel file di passaggio.
