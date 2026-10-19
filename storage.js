/* storage.js — livello dati: localStorage + strutture di default */

const STORAGE_KEY = 'chiamateTrackerData_v1';

function uid(prefix) {
  prefix = prefix || 'id';
  if (window.crypto && crypto.randomUUID) return prefix + '_' + crypto.randomUUID();
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

/**
 * Esiti di default per una nuova pipeline (vedi screenshot "esiti").
 * isNoAnswer = "nessuna risposta": selezionare un esito con questo flag apre
 * automaticamente la finestra di "seconda chiamata" sullo stesso lead (vedi app.js).
 */
function defaultOutcomesList() {
  return [
    { id: uid('esito'), label: 'Non risp',            isNoAnswer: true,  isConversion: false, isDefault: true },
    { id: uid('esito'), label: 'Da richiamare',        isNoAnswer: false, isConversion: false, isDefault: true },
    { id: uid('esito'), label: 'Fake',                 isNoAnswer: false, isConversion: false, isDefault: true },
    { id: uid('esito'), label: 'Appuntamento Fissato',  isNoAnswer: false, isConversion: true,  isDefault: true },
    { id: uid('esito'), label: 'Non interessato',       isNoAnswer: false, isConversion: false, isDefault: true },
    { id: uid('esito'), label: 'conferma appuntamento', isNoAnswer: false, isConversion: true,  isDefault: true },
    { id: uid('esito'), label: 'Non in target',         isNoAnswer: false, isConversion: false, isDefault: true },
    { id: uid('esito'), label: 'Già con noi',           isNoAnswer: false, isConversion: false, isDefault: true },
  ];
}

/**
 * Nuovo default per una riga di goals (funnel Setter e Venditore), per un singolo
 * timeframe (month/week/day). I target sono impostabili dall'utente in dashboard;
 * partono a 0 (nessun obiettivo impostato) finché l'utente non li edita.
 */
function defaultGoalSet() {
  return {
    appuntamentiFissati: 0, // solo Setter
    presentati: 0,
    chiusi: 0,
    commissioniShowUp: 0,    // solo Setter (EUR)
    commissioniChiusure: 0,  // EUR
    commissioniTot: 0        // EUR
  };
}

function defaultGoals() {
  return {
    setter: { month: defaultGoalSet(), week: defaultGoalSet(), day: defaultGoalSet() },
    venditore: { month: defaultGoalSet(), week: defaultGoalSet(), day: defaultGoalSet() }
  };
}

/** Impostazioni di default. Aspetto (restyling step 16): accento Arancione (rampa della
 *  guida colori), tema chiaro, testo normale. Vedi "Tema — accento a rampa" in app.js. */
function defaultSettings() {
  return {
    accent: 'arancione',   // 'arancione' | 'indaco' | 'teal' | 'magenta' | 'custom'
    accentCustom: '',      // '#RRGGBB' del colore a scelta (solo con accent 'custom')
    themeMode: 'light',    // 'light' | 'dark'
    textSize: 'normal',    // 'normal' | 'large'
    venditoreOn: true, // interruttore "Parte Venditore" in 👤 Account (Oggi, tab Venditore, obiettivi venditore)
    toggles: {
      animatedNumbers: false // "Numeri che contano" (unico effetto rimasto in 🎨)
    }
  };
}

/* Campi del builder vecchio (prima del restyling): non servono più, si tolgono. */
const OLD_SETTINGS_KEYS = ['preset', 'colors', 'radiusStyle', 'fontStyle', 'accentSaturation', 'cardContrast',
  'glowLevel', 'readableV1', 'simpleBuilderV1', 'simpleMode', 'skin', 'cashDayThreshold'];
const ACCENT_KEYS = ['arancione', 'indaco', 'teal', 'magenta', 'custom'];

/** "#rgb"/"#rrggbb" scuro? (per capire se il vecchio tema salvato era scuro) */
function oldBgIsDark(hex) {
  if (typeof hex !== 'string' || !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) return false;
  const c = hex.slice(1);
  const n = parseInt(c.length === 3 ? c.split('').map(x => x + x).join('') : c, 16);
  return (0.299 * ((n >> 16) & 0xff) + 0.587 * ((n >> 8) & 0xff) + 0.114 * (n & 0xff)) < 128;
}

/**
 * Migrazione dell'aspetto (restyling step 16). Chi aveva salvato un preset/tema vecchio
 * (Carta, Notte Morbida, colori a mano...) o qualsiasi valore sconosciuto riparte
 * dall'Arancione; chiaro/scuro si tiene (prima si capiva dallo sfondo salvato).
 * Si può rilanciare ogni volta: sui dati già nuovi non cambia niente.
 */
function migrateSettings(saved) {
  const src = (saved && typeof saved === 'object') ? saved : {};
  const out = Object.assign({}, defaultSettings(), src);
  if (src.themeMode !== 'light' && src.themeMode !== 'dark') {
    out.themeMode = oldBgIsDark((src.colors || {}).bg) ? 'dark' : 'light';
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(out.accentCustom || '')) out.accentCustom = '';
  if (ACCENT_KEYS.indexOf(out.accent) === -1 || (out.accent === 'custom' && !out.accentCustom)) out.accent = 'arancione';
  if (out.textSize !== 'large') out.textSize = 'normal';
  out.venditoreOn = out.venditoreOn !== false;
  const oldToggles = (src.toggles && typeof src.toggles === 'object') ? src.toggles : {};
  out.toggles = { animatedNumbers: oldToggles.animatedNumbers === true };
  OLD_SETTINGS_KEYS.forEach(k => { delete out[k]; });
  return out;
}

function defaultData() {
  return {
    pipelines: [],       // { id, name, createdAt, outcomes: [...] }
    sessions: [],         // sessioni concluse
    // Chiamata dentro session.calls[]: { id, timestamp, outcomeId, outcomeLabel, isConversion,
    //   isNoAnswer, isSecondAttempt, groupId (= il lead), undoState? } + UN flag di tipo:
    //   isCallbackCall (Da richiamare), isConfirmCall (Round Conferme), isRecoveryCall (Round
    //   Recupero / recupero no show dal lead), isLeadFollowUpCall (follow-up dei lead Venditore,
    //   restyling 17/10/2026). Senza flag = chiamata di una sessione normale.
    activeSession: null,  // sessione in corso (o null)
    sessionCounter: 0,

    // --- Mini-CRM appuntamenti (setter/venditore) — sistema parallelo, indipendente
    // dalle sessioni/pipeline di chiamata outbound qui sopra. Vedi struttura riga
    // in app.js (newAppointment) e le regole di calcolo commissioni in utils.js.
    appointments: [],
    // --- Lead della parte Venditore (lead.js): una scheda per persona, con stato,
    // prossima azione, cose promesse e storico. Gli appuntamenti Venditore puntano qui
    // con apt.leadId. I soldi restano sugli appuntamenti.
    leads: [],
    goals: defaultGoals(),
    settings: defaultSettings(),

    // Registro link registrazioni call (solo sezione Venditore) — vedi openCallRecordingsModal
    // in app.js. Elenco semplice di { id, label, url, createdAt }, nessun'altra struttura.
    callRecordings: [],

    // --- Round Recupero Appuntamenti — sessione fissa/non eliminabile (vedi app.js,
    // renderRecoveryRoundScreen e dintorni) per richiamare i lead che hanno fatto no-show
    // sia in Setting (presentedStatus) sia in Venditore (dealStage). Ogni entry è agganciata
    // a un preciso appuntamento sorgente (sourceAppointmentId), non alla "persona" in
    // astratto: così rimuovere un lead dal round o risolverlo con un nuovo appuntamento non
    // blocca un futuro no-show sullo stesso nominativo, che genera una entry NUOVA da zero.
    recoveryRound: [],          // [{ id, sourceAppointmentId, sourceRole, clientName, phone,
                                 //    status: 'active'|'resolved'|'removed', callCount,
                                 //    lastInteractionAt, createdAt, notes: [], resolvedAppointmentId }]
    recoveryRoundActive: false, // true mentre l'utente è dentro la schermata a schermo intero del round
    recoveryRoundCurrentLeadId: null, // lead attualmente mostrato a schermo (stabile tra i re-render)

    // --- "Da richiamare" — lead da ririchiamare creati premendo l'esito "Da richiamare"
    // durante una sessione (vedi app.js, openCallbackModal/logCallAction/logCallbackCall).
    // Indipendente dal Round Recupero Appuntamenti: qui l'orario è scelto dall'utente (quick
    // button o personalizzato), non una rotazione automatica. Ogni entry:
    // { id, leadName, phone, scheduledAt, createdAt, createdDateKey, leadGroupId,
    //   sourcePipelineId, sourcePipelineName, sourceSessionId, status: 'pending'|'done',
    //   callCount, lastCalledAt, resolvedOutcomeLabel, resolvedAt,
    //   inCallAttempts, inCallRetryPending, inCallGroupId } — i campi inCall* sono stato
    // transitorio della singola chiamata in corso (vedi renderCallbackCallScreen).
    // Campi aggiunti col restyling (17/10/2026), assenti nei dati vecchi:
    //   notifiedAt  — ISO: quando è comparsa la notifica "Richiama X adesso" (una volta sola)
    //   dismissedAt — ISO: quando è stata chiusa con la X (non ricompare per quel giorno)
    callbacks: [],
    callbackCallActiveId: null, // id del callback attualmente aperto a schermo intero (o null)

    // --- Round Conferme — richiama sistematicamente gli appuntamenti Setter di DOMANI
    // non ancora confermati/annullati (vedi app.js, renderConfirmRoundScreen e dintorni).
    // Due punti d'ingresso: "standalone" dal tasto in Appuntamenti (si chiude e basta alla
    // fine) oppure "pre-sessione", proposto con un Sì/No appena si avvia una sessione
    // normale (alla fine prosegue automaticamente nella sessione scelta — vedi
    // startSessionAction/beginPipelineSession).
    confirmRoundActive: false,           // true mentre si è nella schermata a schermo intero del round
    confirmRoundCurrentApptId: null,     // appuntamento attualmente mostrato (stabile tra i re-render)
    confirmRoundReturnMode: null,        // 'standalone' | 'session' — cosa fare quando il round finisce
    confirmRoundPendingPipelineId: null, // solo con returnMode 'session': pipeline da avviare a fine round

    // --- Task da fare (Dashboard, restyling 17/10/2026) — cose generiche scritte a mano
    // con "+ Task". Restano finché non vengono spuntate (doneAt), data rossa se scadute.
    // Vanno nella riga "stato" online come tutto il resto (vedi cloud-sync.js dbToState).
    // { id, text, role: 'setter'|'venditore', dueDate: 'YYYY-MM-DD', dueTime: 'HH:MM'|'',
    //   createdAt (ISO), doneAt (ISO o null) }
    tasks: []
  };
}

/**
 * Riempie i campi nuovi (dealStage/notes/nextFollowUpDate, split Setter/Venditore) su
 * un appuntamento salvato con la vecchia struttura, senza perdere dati. Per righe
 * Venditore preesistenti, deriva un dealStage ragionevole dal vecchio
 * presentedStatus/closed così lo storico resta coerente col nuovo funnel invece di
 * apparire "vuoto": chiuso -> "chiuso", presentato ma non chiuso -> "trattativa",
 * mai presentato -> nessuno stato (l'utente lo classificherà quando riprende in mano
 * la riga — non possiamo distinguere in automatico un vecchio "no" da un no-show reale).
 */
function migrateAppointment(a) {
  const out = Object.assign({
    dealStage: null,
    notes: [],
    nextFollowUpDate: null,
    recoveredFromNoShow: false, // true se creato dal Round Recupero Appuntamenti (vedi app.js)
    recoveredFromRole: null,    // 'setter' | 'venditore' — dove è avvenuto il no-show originale

    // --- Appuntamento spostato (vedi app.js, openRescheduleModal) — il vecchio
    // appuntamento resta con esito "Spostato" e punta al nuovo (rescheduledToId); il
    // nuovo punta al vecchio (rescheduledFromId) e NON conta come appuntamento in più.
    rescheduledFromId: null,
    rescheduledToId: null,

    // --- Round Conferme (solo Setter, vedi app.js) — stato di rotazione/chiamata per
    // questo specifico appuntamento. confirmGroupId identifica "questa chiamata di
    // conferma" ai fini di computeStats (tutte le chiamate fatte per confermare QUESTO
    // appuntamento contano come 1 lead, anche se fatte in momenti diversi della giornata);
    // viene azzerato quando l'appuntamento viene spostato (è di fatto un nuovo slot).
    confirmGroupId: null,
    confirmCallAttempts: 0,      // tentativi consecutivi di "Non risposto" nel round (doppio squillo)
    confirmRetryPending: false,  // true mentre si mostra il banner "richiama subito" nel round
    confirmLastInteractionAt: null // usato per la rotazione "meno recentemente mostrato" nel round

    // Campi del restyling (17/10/2026), volutamente NON aggiunti qui: se mancano vuol dire
    // "appuntamento di prima di questa versione" (es. "Checklist non compilata",
    // "Centro mancante" in grigio). Vedi newAppointment in app.js.
    //   centerName    — nome del centro, chiesto alla chiusura
    //   venditoreName — solo Setter: chi ha preso l'appuntamento, chiesto alla chiusura
    //   checklist     — solo Setter fissati in chiamata: { <id di CHECKLIST_ITEMS>: true/false }
    //   checklistPct  — % voci prese (0-100), vedi checklistPctOf
  }, a);
  if (out.role === 'venditore' && !out.dealStage) {
    if (out.closed) out.dealStage = 'chiuso';
    else if (out.presentedStatus === 'presented') out.dealStage = 'trattativa';
  }
  if (!Array.isArray(out.notes)) out.notes = [];
  return out;
}

/**
 * Checklist delle informazioni da prendere in chiamata (schermata sessione, restyling
 * 17/10/2026). L'id è STABILE: è la chiave salvata in apt.checklist, quindi non si
 * cambia mai. La label si può ritoccare. Se un giorno le voci cambiano, il calcolo
 * della % (checklistPctOf) resta giusto perché conta solo le voci di questa lista.
 */
const CHECKLIST_ITEMS = [
  { id: 'struttura',   label: 'Struttura del centro (Nr. cabine, dipendenti, soci)' },
  { id: 'dove',        label: "Dov'è il centro" },
  { id: 'fatturato',   label: 'Fatturato attuale' },
  { id: 'obiettivo',   label: 'Obiettivo fatturato' },
  { id: 'vendita',     label: 'Info vendita (tasso di chiusura, gestione rinnovi)' },
  { id: 'pain',        label: 'Pain point' },
  { id: 'esperienze',  label: 'Esperienze passate' },
  { id: 'agenzia',     label: "Cosa faceva l'agenzia?" }
];

/** % (0-100) di voci prese in una checklist { id: bool }. null se la checklist manca. */
function checklistPctOf(checklist) {
  if (!checklist || typeof checklist !== 'object') return null;
  const taken = CHECKLIST_ITEMS.filter(it => checklist[it.id] === true).length;
  return Math.round(taken / CHECKLIST_ITEMS.length * 1000) / 10; // 5/8 = 62.5
}

/**
 * Aggiunge alle pipeline già esistenti (salvate prima dell'introduzione di un nuovo
 * esito di default) gli esiti mancanti, così l'utente li vede subito senza dover
 * creare una nuova pipeline da zero. Il confronto è per label (case-insensitive,
 * trim) per non duplicare un esito che l'utente ha già, magari rinominato a mano.
 */
function ensureDefaultOutcomesOnPipelines(pipelines) {
  const mustHave = [
    { label: 'Non in target', isNoAnswer: false, isConversion: false },
    { label: 'Già con noi',   isNoAnswer: false, isConversion: false }
  ];
  return (pipelines || []).map(p => {
    const outcomes = Array.isArray(p.outcomes) ? p.outcomes.slice() : [];
    const existingLabels = outcomes.map(o => (o.label || '').trim().toLowerCase());
    mustHave.forEach(def => {
      if (!existingLabels.includes(def.label.toLowerCase())) {
        outcomes.push({
          id: uid('esito'),
          label: def.label,
          isNoAnswer: def.isNoAnswer,
          isConversion: def.isConversion,
          isDefault: true
        });
      }
    });
    return Object.assign({}, p, { outcomes });
  });
}

/**
 * Merge "profondo ma mirato" dei dati salvati sopra i default: necessario perché
 * defaultData() ora contiene oggetti annidati (goals.setter.month, settings.toggles, ...)
 * e un semplice Object.assign(defaultData(), parsed) sovrascriverebbe l'intero ramo
 * annidato con quello salvato, perdendo eventuali chiavi nuove aggiunte in un
 * aggiornamento successivo (es. un nuovo toggle) per chi ha già dati salvati.
 */
/**
 * Round Recupero: una sola voce ATTIVA per appuntamento (CORREZIONE 19/10). Con due
 * dispositivi lo stesso appuntamento segnato No show su tutti e due creava due voci
 * (id diversi: l'unione di cloud-sync le tiene entrambe) e il round lo contava due volte.
 * Tiene la voce creata per prima, ci unisce tentativi, note e ultima chiamata delle altre,
 * e chiude le altre ('removed', mergedInto = id tenuto). Restituisce true se ha cambiato qualcosa.
 */
function mergeDuplicateRecoveryEntries(list) {
  if (!Array.isArray(list)) return false;
  const byApt = {};
  let changed = false;
  list.forEach(r => {
    if (!r || r.status !== 'active' || !r.sourceAppointmentId) return;
    const keep = byApt[r.sourceAppointmentId];
    if (!keep) { byApt[r.sourceAppointmentId] = r; return; }
    const [k, d] = String(r.createdAt || '') < String(keep.createdAt || '') ? [r, keep] : [keep, r];
    byApt[r.sourceAppointmentId] = k;
    k.callCount = Math.max(k.callCount || 0, d.callCount || 0);
    if (d.lastInteractionAt && (!k.lastInteractionAt || d.lastInteractionAt > k.lastInteractionAt)) k.lastInteractionAt = d.lastInteractionAt;
    const ids = new Set((k.notes || []).map(n => n && n.id));
    k.notes = (k.notes || []).concat((d.notes || []).filter(n => n && !ids.has(n.id)));
    if (d.sourceReason) k.sourceReason = d.sourceReason;
    d.status = 'removed';
    d.mergedInto = k.id;
    changed = true;
  });
  return changed;
}

function mergeWithDefaults(parsed) {
  const base = defaultData();
  const out = Object.assign({}, base, parsed);

  out.goals = Object.assign({}, base.goals, parsed.goals);
  ['setter', 'venditore'].forEach(role => {
    out.goals[role] = Object.assign({}, base.goals[role], (parsed.goals || {})[role]);
    ['month', 'week', 'day'].forEach(tf => {
      out.goals[role][tf] = Object.assign({}, base.goals[role][tf], ((parsed.goals || {})[role] || {})[tf]);
    });
  });

  out.settings = migrateSettings(parsed.settings);

  out.pipelines = ensureDefaultOutcomesOnPipelines(out.pipelines);
  out.appointments = (parsed.appointments || []).map(migrateAppointment);
  out.leads = Array.isArray(parsed.leads) ? parsed.leads : [];
  out.callRecordings = Array.isArray(parsed.callRecordings) ? parsed.callRecordings : [];
  out.recoveryRound = Array.isArray(parsed.recoveryRound) ? parsed.recoveryRound : [];
  mergeDuplicateRecoveryEntries(out.recoveryRound);
  out.recoveryRoundActive = !!parsed.recoveryRoundActive;
  out.recoveryRoundCurrentLeadId = parsed.recoveryRoundCurrentLeadId || null;
  out.callbacks = Array.isArray(parsed.callbacks) ? parsed.callbacks : [];
  out.callbackCallActiveId = parsed.callbackCallActiveId || null;
  // Task da fare: i dati salvati prima del restyling non le hanno (vedi defaultData).
  out.tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];

  out.confirmRoundActive = !!parsed.confirmRoundActive;
  out.confirmRoundCurrentApptId = parsed.confirmRoundCurrentApptId || null;
  out.confirmRoundReturnMode = parsed.confirmRoundReturnMode || null;
  out.confirmRoundPendingPipelineId = parsed.confirmRoundPendingPipelineId || null;

  return out;
}

const Storage = {
  // Chiave della copia locale. Col login diventa una per utente
  // (STORAGE_KEY + '__' + id utente, vedi app.js openUserData): la chiave
  // vecchia senza utente resta intatta, è la fonte dell'import al primo login.
  key: STORAGE_KEY,
  // true quando il tool è aperto in un'altra scheda (app.js blockThisTab): questa scheda
  // non scrive più la copia locale, che ora è della scheda nuova.
  readOnly: false,
  /** Copia locale dell'utente. CORREZIONE (18/10, bug 2): se c'è ma non si legge
   * (rovinata) restituisce null, MAI dati vuoti: con dati vuoti il tool avrebbe
   * mandato online le cancellazioni di tutto. Chi la chiama scarica i dati online. */
  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return defaultData();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('copia locale non valida');
      return mergeWithDefaults(parsed);
    } catch (e) {
      console.warn('Copia locale illeggibile: uso i dati online', e);
      return null;
    }
  },
  save(data) {
    if (this.readOnly) return;
    try {
      localStorage.setItem(this.key, JSON.stringify(data));
    } catch (e) {
      console.error('Errore salvataggio dati locali', e);
      if (typeof showToast === 'function') {
        showToast('Impossibile salvare i dati nel browser. Esporta un backup se possibile.', true);
      }
    }
  }
};

