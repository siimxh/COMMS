/* Generatore di dati FINTI per le prove del Chiamate Tracker.
 *
 * Uso:   node tools/dati-finti.js [AAAA-MM-GG] > /percorso/fuori/dal/repo.json
 *   - AAAA-MM-GG: il giorno "oggi" a cui sono riferite tutte le date (default 2026-10-17).
 *     Per la prova conviene usare lo stesso giorno dell'ora finta di prova-tracker.js:
 *       node tools/dati-finti.js 2026-10-16 > /tmp/finti.json
 *       node tools/prova-tracker.js /tmp/finti.json 2026-10-16T11:00
 *
 * Cosa genera (stesso formato di localStorage / Esporta, vedi storage.js defaultData):
 *   - 1 pipeline "Prova" con gli esiti di default (come defaultOutcomesList)
 *   - sessioni di chiamata nei giorni lun-ven delle ultime 3 settimane, con tentativi
 *     doppi, appuntamenti fissati e da richiamare; più le sessioni automatiche del giorno
 *     "Conferme", "Richiami", "Recupero" e "Follow-up Venditore" (chiamate isConfirmCall /
 *     isCallbackCall / isRecoveryCall / isLeadFollowUpCall)
 *   - appuntamenti Setter con tutti i presentedStatus (no, confermato 24h, presentato,
 *     presentato e chiuso con rate, no show, annullato, spostato + il nuovo collegato),
 *     anche per domani e il prossimo lunedì (Round Conferme)
 *   - appuntamenti Venditore con tutti i dealStage, rate pagate e future, note e follow-up
 *     (i lead li crea il tool da solo con LeadCRM.ensureLeads al primo caricamento)
 *   - "Da richiamare" di oggi, scaduti e futuri; voci del Round Recupero; obiettivi;
 *     registrazioni call
 *
 * Tutto è inventato: nomi "Lead Prova N", "Centro Prova N", telefoni 33300000NN.
 * Il file generato NON va nel repo (resta comunque buona regola tenerlo fuori).
 * I dati sono sempre uguali a parità di giorno (numeri casuali con seme fisso).
 */
process.env.TZ = 'Europe/Rome'; // le date "locali" sono sempre ora italiana

const TODAY = process.argv[2] || '2026-10-17';
if (!/^\d{4}-\d{2}-\d{2}$/.test(TODAY)) {
  console.error('Data non valida: usa AAAA-MM-GG (es. 2026-10-17).');
  process.exit(1);
}

/* ---------- Numeri casuali ripetibili ---------- */
let seed = 20261017;
function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));

let idCounter = 0;
const uid = prefix => `${prefix}_finto${String(++idCounter).padStart(4, '0')}`;

/* ---------- Date (ora locale italiana) ---------- */
const pad = n => String(n).padStart(2, '0');
function parseDay(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); }
function dayKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addDays(key, n) { const d = parseDay(key); d.setDate(d.getDate() + n); return dayKey(d); }
const isWeekday = key => { const g = parseDay(key).getDay(); return g >= 1 && g <= 5; };
function nextWorkday(key) { let k = addDays(key, 1); while (!isWeekday(k)) k = addDays(k, 1); return k; }
/** "2026-10-14" + "15:30" -> stringa locale come gli input datetime-local */
const local = (key, hm) => `${key}T${hm}`;
/** stessa ora locale -> ISO (UTC), come new Date().toISOString() nel tool */
const iso = (key, hm, sec) => new Date(`${key}T${hm}:${pad(sec || 0)}`).toISOString();
function addMinutes(key, hm, min) {
  const d = new Date(`${key}T${hm}:00`); d.setMinutes(d.getMinutes() + min);
  return { key: dayKey(d), hm: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/* ---------- Persone finte ---------- */
let personN = 0;
function person() {
  personN++;
  return { name: `Lead Prova ${personN}`, centro: `Centro Prova ${personN}`, phone: `33300000${pad(personN)}` };
}

/* ---------- Struttura base (come defaultData in storage.js) ---------- */
const OUTCOMES = [
  { label: 'Non risp', isNoAnswer: true, isConversion: false },
  { label: 'Da richiamare', isNoAnswer: false, isConversion: false },
  { label: 'Fake', isNoAnswer: false, isConversion: false },
  { label: 'Appuntamento Fissato', isNoAnswer: false, isConversion: true },
  { label: 'Non interessato', isNoAnswer: false, isConversion: false },
  { label: 'conferma appuntamento', isNoAnswer: false, isConversion: true },
  { label: 'Non in target', isNoAnswer: false, isConversion: false },
  { label: 'Già con noi', isNoAnswer: false, isConversion: false }
].map(o => Object.assign({ id: uid('esito'), isDefault: true }, o));
const OUT = label => OUTCOMES.find(o => o.label === label);

const pipeline = { id: uid('pipe'), name: 'Prova', createdAt: iso(addDays(TODAY, -30), '09:00'), outcomes: OUTCOMES };

const goalSet = (o) => Object.assign({ appuntamentiFissati: 0, presentati: 0, chiusi: 0, commissioniShowUp: 0, commissioniChiusure: 0, commissioniTot: 0 }, o);
const db = {
  pipelines: [pipeline],
  sessions: [],
  activeSession: null,
  sessionCounter: 0,
  appointments: [],
  leads: [], // li crea il tool (LeadCRM.ensureLeads) dagli appuntamenti Venditore
  goals: {
    setter: {
      month: goalSet({ appuntamentiFissati: 40, presentati: 25, chiusi: 4, commissioniShowUp: 1000, commissioniChiusure: 300, commissioniTot: 1300 }),
      week: goalSet({ appuntamentiFissati: 10, presentati: 6, chiusi: 1, commissioniShowUp: 240, commissioniChiusure: 75, commissioniTot: 315 }),
      day: goalSet({ appuntamentiFissati: 2, presentati: 1, chiusi: 0, commissioniShowUp: 40, commissioniChiusure: 15, commissioniTot: 55 })
    },
    venditore: {
      month: goalSet({ presentati: 20, chiusi: 5, commissioniChiusure: 2000, commissioniTot: 2000 }),
      week: goalSet({ presentati: 5, chiusi: 1, commissioniChiusure: 500, commissioniTot: 500 }),
      day: goalSet({ presentati: 1, chiusi: 0, commissioniChiusure: 100, commissioniTot: 100 })
    }
  },
  // settings: lasciati ai default del tool (mergeWithDefaults li riempie)
  callRecordings: [
    { id: uid('rec'), label: 'Call Lead Prova (esempio)', url: 'https://example.com/registrazione-1', createdAt: iso(addDays(TODAY, -5), '16:00') }
  ],
  recoveryRound: [],
  recoveryRoundActive: false,
  recoveryRoundCurrentLeadId: null,
  callbacks: [],
  callbackCallActiveId: null,
  confirmRoundActive: false,
  confirmRoundCurrentApptId: null,
  confirmRoundReturnMode: null,
  confirmRoundPendingPipelineId: null
};

/* ---------- Appuntamenti (stessi campi di newAppointment in app.js) ---------- */
function appt(role, p, o) {
  return Object.assign({
    id: uid('appt'), createdAt: iso(TODAY, '10:00'), role, clientName: p.name, phone: p.phone,
    scheduledAt: local(TODAY, '15:00'), presentedStatus: 'no', presentedAt: null, closed: false, closedAt: null,
    cashCollected: 0, totalSold: 0, installments: [], linkedAppointmentId: null,
    dealStage: null, notes: [], nextFollowUpDate: null, recoveredFromNoShow: false, recoveredFromRole: null,
    rescheduledFromId: null, rescheduledToId: null, confirmGroupId: null, confirmCallAttempts: 0,
    confirmRetryPending: false, confirmLastInteractionAt: null
  }, o);
}
let rataN = 0;
const rata = (amount, dueDate, paidDate) => ({ id: uid('rata'), label: `Rata ${++rataN}`, amount, dueDate, paid: !!paidDate, paidDate: paidDate || null });

function addRecovery(a, role, reason, callCount) {
  db.recoveryRound.push({
    id: uid('recov'), sourceAppointmentId: a.id, sourceRole: role, sourceReason: reason,
    clientName: a.clientName, phone: a.phone || '', status: 'active', callCount: callCount || 0,
    lastInteractionAt: callCount ? iso(addDays(TODAY, -1), '17:00') : null,
    createdAt: iso(addDays(TODAY, -2), '18:00'), notes: [], resolvedAppointmentId: null
  });
}

/* ---------- Sessioni di chiamata ---------- */
// Giorni lun-ven delle ultime 3 settimane, oggi escluso (oggi la sessione la apre chi prova).
const workDays = [];
for (let i = 21; i >= 1; i--) { const k = addDays(TODAY, -i); if (isWeekday(k)) workDays.push(k); }

const settingBookings = []; // { day, time, groupId } appuntamenti fissati in sessione
const callbacksFromSessions = [];

function newSession(pipelineId, pipelineName, day, startHm) {
  db.sessionCounter += 1;
  return {
    id: uid('sess'), number: db.sessionCounter, pipelineId, pipelineName,
    startedAt: iso(day, startHm), endedAt: null, calls: [], skips: 0,
    retryCallsPending: false, callAttemptsOnLead: 0, pausedAt: null, pausedTotalMs: 0, currentLeadGroupId: null
  };
}
function call(day, hm, sec, outcome, groupId, extra) {
  return Object.assign({
    id: uid('call'), timestamp: iso(day, hm, sec), outcomeId: outcome.id || null, outcomeLabel: outcome.label,
    isConversion: !!outcome.isConversion, isNoAnswer: !!outcome.isNoAnswer, isSecondAttempt: false, groupId
  }, extra || {});
}

workDays.forEach((day, di) => {
  const nSess = di % 3 === 0 ? 2 : 1;
  for (let si = 0; si < nSess; si++) {
    const startHm = si === 0 ? '09:30' : '14:30';
    const s = newSession(pipeline.id, pipeline.name, day, startHm);
    let t = { key: day, hm: startHm };
    const nLeads = between(10, 22);
    for (let li = 0; li < nLeads; li++) {
      const g = uid('lead');
      t = addMinutes(t.key, t.hm, between(2, 5));
      const r = rnd();
      if (r < 0.45) {
        // Non risponde: a volte richiamato subito (secondo tentativo, stesso lead)
        s.calls.push(call(t.key, t.hm, 0, OUT('Non risp'), g));
        if (rnd() < 0.5) {
          s.calls.push(call(t.key, t.hm, 40, rnd() < 0.7 ? OUT('Non risp') : OUT('Non interessato'), g, { isSecondAttempt: true }));
        }
      } else if (r < 0.58) {
        s.calls.push(call(t.key, t.hm, 0, OUT('Non interessato'), g));
      } else if (r < 0.66) {
        s.calls.push(call(t.key, t.hm, 0, OUT('Da richiamare'), g));
        callbacksFromSessions.push({ day, hm: t.hm, groupId: g, sessionId: s.id });
      } else if (r < 0.74) {
        s.calls.push(call(t.key, t.hm, 0, OUT('Appuntamento Fissato'), g));
        settingBookings.push({ day, hm: t.hm });
      } else {
        s.calls.push(call(t.key, t.hm, 0, pick([OUT('Fake'), OUT('Non in target'), OUT('Già con noi'), OUT('Non risp')]), g));
      }
    }
    if (rnd() < 0.4) s.skips = between(1, 3);
    if (rnd() < 0.5) s.pausedTotalMs = between(5, 15) * 60000;
    s.endedAt = iso(t.key, addMinutes(t.key, t.hm, 3).hm);
    db.sessions.push(s);
  }
});

/* Sessioni automatiche del giorno (vedi app.js: appendConfirmCallToSession,
 * appendCallbackCallToSession, appendRecoveryCallToSession). */
function autoSession(pipelineId, pipelineName, day, startHm, calls) {
  const s = newSession(pipelineId, pipelineName, day, startHm);
  delete s.currentLeadGroupId;
  s.calls = calls;
  s.endedAt = calls.length ? calls[calls.length - 1].timestamp : s.startedAt;
  db.sessions.push(s);
}
const yesterdayWork = workDays[workDays.length - 1];
const twoDaysAgoWork = workDays[workDays.length - 2];
// Conferme di ieri: 3 lead, uno richiamato due volte nello stesso giorno (= 1 lead)
{
  const g1 = uid('lead'), g2 = uid('lead'), g3 = uid('lead');
  autoSession('conferme-auto', 'Conferme', yesterdayWork, '18:05', [
    call(yesterdayWork, '18:05', 0, { label: 'Confermato 24h', isConversion: true }, g1, { isConfirmCall: true }),
    call(yesterdayWork, '18:08', 0, { label: 'Non risposto', isNoAnswer: true }, g2, { isConfirmCall: true }),
    call(yesterdayWork, '18:09', 0, { label: 'Confermato 24h', isConversion: true }, g2, { isConfirmCall: true, isSecondAttempt: true }),
    call(yesterdayWork, '18:12', 0, { label: 'Annullato' }, g3, { isConfirmCall: true })
  ]);
}
// Richiami di due giorni fa e Recupero di ieri
autoSession('richiami-auto', 'Richiami', twoDaysAgoWork, '17:30', [
  call(twoDaysAgoWork, '17:30', 0, OUT('Non interessato'), uid('lead'), { isCallbackCall: true }),
  call(twoDaysAgoWork, '17:45', 0, OUT('Appuntamento Fissato'), uid('lead'), { isCallbackCall: true })
]);
{
  const g = uid('lead');
  autoSession('recupero-auto', 'Recupero', yesterdayWork, '16:00', [
    call(yesterdayWork, '16:00', 0, { label: 'Non risposto', isNoAnswer: true }, g, { isRecoveryCall: true }),
    call(yesterdayWork, '16:40', 0, { label: 'Da richiamare' }, g, { isRecoveryCall: true }),
    call(yesterdayWork, '16:50', 0, { label: 'Non interessato' }, uid('lead'), { isRecoveryCall: true })
  ]);
}
// Follow-up Venditore di ieri: un lead chiamato due volte (= 1 lead), uno una volta
{
  const g = uid('lead');
  autoSession('followup-venditore-auto', 'Follow-up Venditore', yesterdayWork, '12:00', [
    call(yesterdayWork, '12:00', 0, { label: 'Non risposto', isNoAnswer: true }, g, { isLeadFollowUpCall: true }),
    call(yesterdayWork, '12:30', 0, { label: 'Ha risposto' }, g, { isLeadFollowUpCall: true }),
    call(yesterdayWork, '12:40', 0, { label: 'Non interessato' }, uid('lead'), { isLeadFollowUpCall: true })
  ]);
}

/* ---------- Appuntamenti Setter ---------- */
// Ogni "Appuntamento Fissato" in sessione diventa un appuntamento Setter, fissato 2-4 giorni lavorativi dopo.
const SETTER_PAST_STATUSES = ['presented', 'presented', 'no_show', 'annullato', 'presented', 'no', 'confirmed24h'];
settingBookings.forEach((b, i) => {
  const p = person();
  let when = b.day; for (let k = between(1, 3); k > 0; k--) when = nextWorkday(when);
  const hm = pick(['10:00', '11:30', '15:00', '16:30', '18:00']);
  const a = appt('setter', p, { createdAt: iso(b.day, b.hm), scheduledAt: local(when, hm) });
  if (when < TODAY) {
    a.presentedStatus = SETTER_PAST_STATUSES[i % SETTER_PAST_STATUSES.length];
    if (a.presentedStatus === 'presented') a.presentedAt = local(when, hm);
    if (a.presentedStatus === 'no_show' || a.presentedStatus === 'annullato') addRecovery(a, 'setter', a.presentedStatus, i % 2);
  } else if (when === TODAY || i % 2) {
    a.presentedStatus = 'confirmed24h';
  }
  db.appointments.push(a);
});
// Setter: presentati e chiusi, con acconto e rate (pagate e future)
{
  const d1 = addDays(TODAY, -9), d2 = addDays(TODAY, -4);
  const p1 = person(), p2 = person();
  db.appointments.push(appt('setter', p1, {
    createdAt: iso(addDays(d1, -3), '10:20'), scheduledAt: local(d1, '11:00'), presentedStatus: 'presented', presentedAt: local(d1, '11:00'),
    closed: true, closedAt: iso(d1, '12:30'), cashCollected: 1000, totalSold: 3000,
    installments: [rata(1000, addDays(d1, 7), addDays(d1, 7)), rata(1000, addDays(TODAY, 12))]
  }));
  db.appointments.push(appt('setter', p2, {
    createdAt: iso(addDays(d2, -2), '15:10'), scheduledAt: local(d2, '16:00'), presentedStatus: 'presented', presentedAt: local(d2, '16:00'),
    closed: true, closedAt: iso(d2, '17:00'), cashCollected: 500, totalSold: 2000,
    installments: [rata(500, addDays(TODAY, -1)), rata(500, addDays(TODAY, 20)), rata(500, addDays(TODAY, 50))]
  }));
}
// Setter: spostato (il vecchio resta "spostato", il nuovo punta al vecchio e non conta come nuovo)
{
  const p = person();
  const old = appt('setter', p, { createdAt: iso(addDays(TODAY, -6), '10:00'), scheduledAt: local(addDays(TODAY, -2), '15:00'), presentedStatus: 'spostato' });
  const nuovo = appt('setter', p, { createdAt: iso(addDays(TODAY, -2), '11:00'), scheduledAt: local(nextWorkday(TODAY), '17:00'), rescheduledFromId: old.id });
  old.rescheduledToId = nuovo.id;
  db.appointments.push(old, nuovo);
}
// Setter: da confermare per il Round Conferme (prossimo giorno lavorativo e lunedì dopo un weekend)
{
  const nw = nextWorkday(TODAY);
  db.appointments.push(appt('setter', person(), { createdAt: iso(addDays(TODAY, -1), '10:30'), scheduledAt: local(nw, '10:00') }));
  db.appointments.push(appt('setter', person(), { createdAt: iso(addDays(TODAY, -1), '11:15'), scheduledAt: local(nw, '15:30') }));
  db.appointments.push(appt('setter', person(), { createdAt: iso(addDays(TODAY, -3), '09:50'), scheduledAt: local(addDays(TODAY, 1), '11:00') })); // domani (anche se weekend)
  db.appointments.push(appt('setter', person(), { createdAt: iso(TODAY, '09:40'), scheduledAt: local(addDays(TODAY, 4), '16:00') }));
}

// Setter: checklist delle informazioni (restyling step 12-13) sugli appuntamenti fissati
// negli ultimi 14 giorni (non gli spostati). Quelli più vecchi restano senza: sono gli
// "appuntamenti precedenti". Voci in ordine di quanto spesso vengono prese (id come
// CHECKLIST_ITEMS in storage.js): fatturato e obiettivo le meno prese.
{
  const ORDER = ['dove', 'struttura', 'pain', 'esperienze', 'agenzia', 'vendita', 'obiettivo', 'fatturato'];
  const since = addDays(TODAY, -14);
  db.appointments.filter(a => a.role === 'setter' && !a.rescheduledFromId && a.createdAt >= iso(since, '00:00'))
    .forEach((a, k) => {
      const taken = 2 + (k * 5) % 7; // 2..8 voci
      a.checklist = {};
      ORDER.forEach((id, i) => { a.checklist[id] = i < taken; });
      a.checklistPct = Math.round(taken / 8 * 1000) / 10;
    });
}

/* ---------- Appuntamenti Venditore ---------- */
// I nomi a volte hanno la sigla del setter ("Nome - MJ - N"), come nei dati veri.
// Giorno a dayOffset da oggi; se cade nel weekend si sposta al giorno lavorativo più vicino
// nella stessa direzione (oggi resta oggi anche se è sabato).
function vndDay(dayOffset) {
  let k = addDays(TODAY, dayOffset);
  while (dayOffset !== 0 && !isWeekday(k)) k = addDays(k, dayOffset < 0 ? -1 : 1);
  return k;
}
function vnd(p, dayOffset, hm, o) {
  const day = vndDay(dayOffset);
  const a = appt('venditore', p, Object.assign({ createdAt: iso(addDays(day, -3), '12:00'), scheduledAt: local(day, hm) }, o));
  if (a.presentedStatus === 'presented') a.presentedAt = a.scheduledAt;
  if (a.closed && !a.closedAt) a.closedAt = iso(day, '18:00');
  return a;
}
const presented = () => ({ presentedStatus: 'presented' });
{
  // Chiuso con acconto + rate pagate e future
  const pC = person();
  const dC = -12;
  db.appointments.push(vnd(Object.assign({}, pC, { name: pC.name + ' - MJ - N' }), dC, '10:00', Object.assign(presented(), {
    dealStage: 'chiuso', closed: true, cashCollected: 1500, totalSold: 4500,
    installments: [rata(1000, addDays(TODAY, -5), addDays(TODAY, -4)), rata(1000, addDays(TODAY, 3)), rata(1000, addDays(TODAY, 33))]
  })));
  // Contratto firmato con rata scaduta non pagata
  const pF = person();
  db.appointments.push(vnd(pF, -6, '15:00', Object.assign(presented(), {
    dealStage: 'contratto_firmato', closed: true, cashCollected: 0, totalSold: 2400,
    installments: [rata(800, addDays(TODAY, -2)), rata(800, addDays(TODAY, 28)), rata(800, addDays(TODAY, 58))]
  })));
  // Trattative con follow-up ieri, oggi, domani (diventano prossime azioni dei lead)
  db.appointments.push(vnd(person(), -5, '11:00', Object.assign(presented(), { dealStage: 'trattativa', nextFollowUpDate: addDays(TODAY, -1),
    notes: [{ id: uid('nota'), text: 'Vuole sentire il socio prima di decidere', author: 'Prova', createdAt: iso(addDays(TODAY, -5), '12:00') }] })));
  db.appointments.push(vnd(person(), -3, '16:00', Object.assign(presented(), { dealStage: 'trattativa', nextFollowUpDate: TODAY })));
  db.appointments.push(vnd(person(), -2, '10:30', Object.assign(presented(), { dealStage: 'trattativa', nextFollowUpDate: addDays(TODAY, 1) })));
  // Trattativa senza prossima azione (in Oggi compare in rosso)
  db.appointments.push(vnd(person(), -8, '14:00', Object.assign(presented(), { dealStage: 'trattativa' })));
  // Perso e non in target
  db.appointments.push(vnd(person(), -10, '17:00', Object.assign(presented(), { dealStage: 'perso' })));
  db.appointments.push(vnd(person(), -7, '12:00', Object.assign(presented(), { dealStage: 'non_in_target' })));
  // No show e annullato (vanno nel Round Recupero / prossima azione "Recupero no show")
  const ns = vnd(person(), -1, '11:00', { dealStage: 'no_show', presentedStatus: 'no_show' });
  const an = vnd(person(), -4, '15:30', { dealStage: 'annullato', presentedStatus: 'annullato' });
  db.appointments.push(ns, an);
  addRecovery(ns, 'venditore', 'no_show', 0);
  addRecovery(an, 'venditore', 'annullato', 1);
  // Spostato + nuovo collegato (stesso lead)
  const pS = person();
  const sOld = vnd(pS, -3, '09:30', { dealStage: 'spostato' });
  const sNew = vnd(pS, 2, '09:30', { createdAt: iso(addDays(TODAY, -3), '09:40'), rescheduledFromId: sOld.id });
  sOld.rescheduledToId = sNew.id;
  db.appointments.push(sOld, sNew);
  // Secondo appuntamento dello stesso lead (dopo una trattativa): 1° presentato, 2° da fare
  const p2 = person();
  db.appointments.push(vnd(p2, -9, '10:00', Object.assign(presented(), { dealStage: 'trattativa' })));
  db.appointments.push(vnd(p2, 1, '15:00', {}));
  // Appuntamenti di oggi e futuri, ancora da esitare
  db.appointments.push(vnd(person(), 0, '12:00', {}));
  db.appointments.push(vnd(person(), 0, '17:30', {}));
  db.appointments.push(vnd(person(), 3, '11:00', {}));
  // Passato e mai esitato (compare tra "da esitare")
  db.appointments.push(vnd(person(), -1, '17:00', {}));
}

/* ---------- Da richiamare ---------- */
function callback(p, scheduledAt, createdDay, o) {
  return Object.assign({
    id: uid('callback'), leadName: p.name, phone: p.phone, scheduledAt, createdAt: iso(createdDay, '10:00'),
    createdDateKey: createdDay, leadGroupId: null, sourcePipelineId: pipeline.id, sourcePipelineName: pipeline.name,
    sourceSessionId: null, sourceCallId: null, status: 'pending', callCount: 0, lastCalledAt: null,
    inCallAttempts: 0, inCallRetryPending: false, inCallGroupId: null, resolvedOutcomeLabel: null, resolvedAt: null, notes: []
  }, o);
}
// Dalle sessioni passate: i più vecchi già fatti, gli altri scaduti e mai richiamati
callbacksFromSessions.forEach((c, i) => {
  const done = i < callbacksFromSessions.length - 2;
  // fatto: richiamato il giorno lavorativo dopo; scaduto: era per la sera stessa (giorno passato)
  const when = done ? local(nextWorkday(c.day), '17:00') : local(c.day, '18:30');
  db.callbacks.push(callback(person(), when, c.day, Object.assign(
    { leadGroupId: c.groupId, sourceSessionId: c.sessionId },
    done ? { status: 'done', callCount: 1, lastCalledAt: iso(nextWorkday(c.day), '17:05'), resolvedOutcomeLabel: 'Non interessato', resolvedAt: iso(nextWorkday(c.day), '17:05') } : {}
  )));
});
// Oggi (mattina, pomeriggio, sera) e futuri
db.callbacks.push(callback(person(), local(TODAY, '11:30'), addDays(TODAY, -1)));
db.callbacks.push(callback(person(), local(TODAY, '15:00'), addDays(TODAY, -1), { notes: [{ id: uid('nota'), text: 'Richiamare dopo pranzo', createdAt: iso(addDays(TODAY, -1), '10:00') }] }));
db.callbacks.push(callback(person(), local(TODAY, '18:00'), TODAY));
db.callbacks.push(callback(person(), local(addDays(TODAY, 1), '10:00'), TODAY));
db.callbacks.push(callback(person(), local(addDays(TODAY, 5), '16:00'), TODAY));

process.stdout.write(JSON.stringify(db, null, 2) + '\n');
