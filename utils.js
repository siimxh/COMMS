/* utils.js — helper per date, timeframe, formattazione e aggregazione statistiche */

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

const TIMEFRAME_LABELS = {
  oggi: 'Oggi',
  ieri: 'Ieri',
  '7g': '7 giorni',
  '30g': '30 giorni',
  '90g': '90 giorni',
  mese_corrente: 'Mese corrente',
  mese_scorso: 'Mese scorso',
  custom: 'Periodo personalizzato'
};

function getTimeframeRange(preset, customFrom, customTo) {
  const now = new Date();
  switch (preset) {
    case 'oggi':
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'ieri': {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }
    case '7g': {
      const s = new Date(now); s.setDate(s.getDate() - 6);
      return { start: startOfDay(s), end: endOfDay(now) };
    }
    case '30g': {
      const s = new Date(now); s.setDate(s.getDate() - 29);
      return { start: startOfDay(s), end: endOfDay(now) };
    }
    case '90g': {
      const s = new Date(now); s.setDate(s.getDate() - 89);
      return { start: startOfDay(s), end: endOfDay(now) };
    }
    case 'mese_corrente': {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: startOfDay(s), end: endOfDay(now) };
    }
    case 'mese_scorso': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: startOfDay(s), end: endOfDay(e) };
    }
    case 'custom': {
      if (!customFrom || !customTo) return { start: startOfDay(now), end: endOfDay(now) };
      return { start: startOfDay(new Date(customFrom)), end: endOfDay(new Date(customTo)) };
    }
    default:
      return { start: startOfDay(now), end: endOfDay(now) };
  }
}

/** Periodo immediatamente precedente, della stessa durata, usato per l'andamento. */
function previousPeriod(range) {
  // Stesso numero di giorni di calendario, contati con le date (non in millisecondi):
  // a cavallo del cambio ora legale/solare il periodo precedente partiva/finiva a
  // un'ora sbagliata invece che a mezzanotte.
  const days = Math.round((startOfDay(range.end) - startOfDay(range.start)) / 86400000) + 1;
  const prevEnd = new Date(range.start.getTime() - 1);
  const prevStart = startOfDay(prevEnd);
  prevStart.setDate(prevStart.getDate() - (days - 1));
  return { start: prevStart, end: prevEnd };
}

function fmtDate(d) { return new Date(d).toLocaleDateString('it-IT'); }
function fmtDateTime(d) {
  return new Date(d).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtTime(d) {
  return new Date(d).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function pct(n, d) { return d > 0 ? Math.round((n / d) * 1000) / 10 : 0; }
function round1(n) { return Math.round(n * 10) / 10; }

/**
 * "Domani alle 9:00" / "Oggi alle 15:00" / "07/10 alle 9:00" — usato nel Round Conferme
 * per mostrare l'orario dell'appuntamento in modo immediato durante la chiamata (vedi
 * renderConfirmRoundScreen in app.js), evitando di dover fare il calcolo a mente.
 */
function fmtRelativeDayTime(d) {
  const target = new Date(d);
  const targetKey = dateInputValue(target);
  const todayKey = dateInputValue(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = dateInputValue(tomorrow);
  const timeStr = fmtTime(target);
  if (targetKey === todayKey) return `Oggi alle ${timeStr}`;
  if (targetKey === tomorrowKey) return `Domani alle ${timeStr}`;
  return `${fmtDate(target)} alle ${timeStr}`;
}

/** "AAAA-MM-GGTHH:MM" in ORA LOCALE, per gli input datetime-local (bug 13/10: prima si usava
 * toISOString, che è in UTC, e gli orari proposti risultavano indietro di 2 ore). */
function localDateTimeValue(d) {
  const x = new Date(d);
  return `${dateInputValue(x)}T${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
}

function dateInputValue(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Ritorna le sessioni (concluse) che ricadono nel range e, se richiesto, in una pipeline specifica. */
function getFilteredSessions(db, range, pipelineId) {
  return db.sessions.filter(s => {
    const started = new Date(s.startedAt);
    if (started < range.start || started > range.end) return false;
    if (pipelineId && pipelineId !== 'all' && s.pipelineId !== pipelineId) return false;
    return true;
  });
}

/**
 * Calcola le statistiche aggregate per un insieme di sessioni.
 *
 * Ogni voce in session.calls è UNA telefonata reale (un dial). Una voce con
 * isSecondAttempt=true è il richiamo dello stesso lead subito dopo un esito
 * "nessuna risposta" (vedi logCallAction in app.js) e va raggruppata con la
 * chiamata precedente: conta come chiamata in più, ma non come nuovo lead.
 *
 * CORREZIONE (segnalata dall'utente): "Esiti nel periodo" deve contare LEAD UNICI, non
 * singole chiamate — un lead richiamato 2-3 volte (max MAX_CALL_ATTEMPTS) perché non
 * risponde va contato UNA volta sola come "Non risp", non una volta per ogni tentativo
 * (altrimenti il numero di "Non risp" può superare il numero di lead contattati). Per
 * ogni lead si usa l'esito dell'ULTIMO tentativo (quello "definitivo" per quel lead).
 *
 * Raggruppamento per groupId: ogni chiamata "di apertura" su un lead riceve un groupId
 * univoco (vedi logCallAction/logCallbackCall in app.js); i tentativi immediati di
 * richiamo (isSecondAttempt) riusano lo stesso groupId. Per i lead "Da richiamare"
 * richiamati più tardi (anche in un'altra sessione, es. la sessione automatica
 * "Richiami" del giorno — vedi appendCallbackCallToSession), la chiamata di richiamo
 * riusa lo STESSO groupId del lead originale se il richiamo avviene lo stesso giorno in
 * cui è diventato "da richiamare" (così non si conta un lead in più), oppure riceve un
 * groupId NUOVO se avviene un giorno diverso (conta giustamente come lead del giorno in
 * cui lo richiami). Le chiamate più vecchie senza groupId (dati salvati prima di questa
 * modifica) usano il vecchio raggruppamento posizionale isSecondAttempt come fallback.
 */
/**
 * Tipi di chiamata del Setting (restyling 17/10/2026, divisione in Setting → Stats).
 * Una chiamata ha al massimo un flag di tipo; senza flag è di una sessione normale.
 */
const CALL_TYPES = [
  { key: 'normale',   label: 'Sessioni normali' },
  { key: 'conferme',  label: 'Conferme' },
  { key: 'richiamate', label: 'Richiamate' },
  { key: 'recupero',  label: 'Recupero' },
  { key: 'followup',  label: 'Follow-up Venditore' }
];
function callTypeOf(c) {
  if (c.isConfirmCall) return 'conferme';
  if (c.isCallbackCall) return 'richiamate';
  if (c.isRecoveryCall) return 'recupero';
  if (c.isLeadFollowUpCall) return 'followup';
  return 'normale';
}

/**
 * Chiamate e lead per tipo, nelle sessioni date. Lead: stessa regola di computeStats
 * (groupId = 1 lead su tutte le sessioni, isSecondAttempt senza groupId = stesso lead
 * della chiamata prima). Un lead finisce nel tipo della sua PRIMA chiamata, così la
 * somma dei lead per tipo è uguale ai lead totali di computeStats.
 */
function computeCallTypeStats(sessions) {
  const out = {};
  CALL_TYPES.forEach(t => { out[t.key] = { calls: 0, leads: 0 }; });
  const seen = new Set();
  sessions.forEach(s => {
    let currentType = null;
    (s.calls || []).forEach(c => {
      const t = callTypeOf(c);
      out[t].calls++;
      if (c.groupId) {
        if (seen.has(c.groupId)) return;
        seen.add(c.groupId);
        out[t].leads++;
      } else if (c.isSecondAttempt && currentType) {
        return;
      } else {
        currentType = t;
        out[t].leads++;
      }
    });
  });
  return out;
}

/**
 * Lead "nuovi" contati in UNA sessione (contatori della sessione e della lista sessioni).
 * Un tentativo di richiamo immediato (isSecondAttempt) non è un lead nuovo. Inoltre una
 * chiamata a un lead "Da richiamare" fatta lo stesso giorno riusa il groupId del lead
 * originale (vedi startCallbackCall in app.js): se quel groupId compare già in una
 * chiamata precedente di un'ALTRA sessione, il lead è già stato contato lì e qui non
 * conta di nuovo (vale anche per le chiamate del Round Conferme fatte in due round dello
 * stesso giorno). Stessa logica di computeStats, ma limitata alla singola sessione.
 */
function countSessionLeads(s, allSessions) {
  const seen = new Set();
  let n = 0;
  s.calls.forEach(c => {
    if (c.isSecondAttempt) return;
    if (c.groupId) {
      if (seen.has(c.groupId)) return;
      seen.add(c.groupId);
      if (callTypeOf(c) !== 'normale') {
        const t = new Date(c.timestamp).getTime();
        const countedElsewhere = (allSessions || []).some(o => o !== s && o.id !== s.id &&
          (o.calls || []).some(oc => oc.groupId === c.groupId && new Date(oc.timestamp).getTime() < t));
        if (countedElsewhere) return;
      }
    }
    n++;
  });
  return n;
}

/**
 * "Non risposto" dei round dentro una sessione normale (fix A, richiesta di Hamza 19/10/2026,
 * scelta di Simone). Le chiamate di Round Conferme, Round Recupero e follow-up Venditore
 * finite nella sessione aperta avevano la loro etichetta ("Non risposto"), così nella
 * sessione comparivano due esiti: "Non risp" (della pipeline) e "Non risposto".
 * Regola: negli esiti, una chiamata senza risposta che non è un esito della pipeline della
 * sessione (outcomeId null, o di un'altra pipeline) si conta sotto l'esito "senza risposta"
 * della pipeline della sessione. Vale anche per le sessioni già salvate: i dati non cambiano,
 * cambia solo il raggruppamento. Le sessioni automatiche (Conferme, Recupero, Richiami,
 * Follow-up Venditore) non hanno una pipeline vera: lì si usa l'etichetta più usata tra le
 * pipeline (statsRoundCallLabels), come in Stats e nel report (Simone, 19/10).
 * I conti (chiamate, lead, senza risposta) non cambiano: si sposta solo l'etichetta.
 */
function sessionPipelineOf(s, pipelines) {
  const list = pipelines || (typeof db !== 'undefined' && db && db.pipelines) || [];
  return s && s.pipelineId ? list.find(p => p.id === s.pipelineId) || null : null;
}
function pipelineNoAnswerOutcome(pipeline) {
  return pipeline && Array.isArray(pipeline.outcomes) ? pipeline.outcomes.find(o => o.isNoAnswer) || null : null;
}
/* "Appuntamento fissato" dei round (Recupero e follow-up Venditore) nello stesso esito
 * "Appuntamento Fissato" della pipeline (Simone, 19/10, punto A): solo con l'esito della
 * pipeline che si chiama così (maiuscole e spazi a parte), non con un altro esito di
 * conversione come "conferma appuntamento". Se la pipeline non ce l'ha, resta com'è. */
const APPT_SET_LABEL_NORM = 'appuntamento fissato';
function normOutcomeLabel(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function pipelineApptSetOutcome(pipeline) {
  return pipeline && Array.isArray(pipeline.outcomes) ? pipeline.outcomes.find(o => normOutcomeLabel(o.label) === APPT_SET_LABEL_NORM) || null : null;
}
/** 'noAnswer' | 'apptSet' | null: in quale esito della pipeline può finire la chiamata. */
function roundCallKind(c) {
  if (c.isNoAnswer) return 'noAnswer';
  if (c.isConversion && normOutcomeLabel(c.outcomeLabel) === APPT_SET_LABEL_NORM) return 'apptSet';
  return null;
}
function pipelineOutcomeForKind(pipeline, kind) {
  return kind === 'noAnswer' ? pipelineNoAnswerOutcome(pipeline) : kind === 'apptSet' ? pipelineApptSetOutcome(pipeline) : null;
}
function callOutcomeLabelIn(c, pipeline) {
  const kind = roundCallKind(c);
  if (!kind || !pipeline) return c.outcomeLabel;
  const outs = Array.isArray(pipeline.outcomes) ? pipeline.outcomes : [];
  if (c.outcomeId && outs.some(o => o.id === c.outcomeId)) return c.outcomeLabel;
  const t = pipelineOutcomeForKind(pipeline, kind);
  return t ? t.label : c.outcomeLabel;
}

/**
 * Stats su più sessioni (Simone, 19/10, punto C): anche le chiamate dei round nelle
 * sessioni automatiche (Conferme, Recupero, Richiami, Follow-up: senza pipeline) vanno
 * sotto "Non risp" e "Appuntamento Fissato". Le pipeline possono chiamarli in modo
 * diverso: si usa l'etichetta più usata nelle chiamate di queste sessioni (a parità, o se
 * non è mai usata, quella della prima pipeline che ce l'ha). Le chiamate che hanno già un
 * esito di una pipeline (es. i Da richiamare richiamati) tengono il loro.
 */
function statsRoundCallLabels(sessions, pipelines) {
  const list = pipelines || (typeof db !== 'undefined' && db && db.pipelines) || [];
  const allIds = new Set();
  const byKind = { noAnswer: new Map(), apptSet: new Map() }; // id -> etichetta
  const order = { noAnswer: [], apptSet: [] };
  list.forEach(p => (p.outcomes || []).forEach(o => {
    allIds.add(o.id);
    ['noAnswer', 'apptSet'].forEach(k => {
      if ((k === 'noAnswer' ? o.isNoAnswer : normOutcomeLabel(o.label) === APPT_SET_LABEL_NORM)) {
        byKind[k].set(o.id, o.label);
        if (!order[k].includes(o.label)) order[k].push(o.label);
      }
    });
  }));
  const out = { allIds };
  ['noAnswer', 'apptSet'].forEach(k => {
    const uses = {};
    (sessions || []).forEach(s => (s.calls || []).forEach(c => { if (byKind[k].has(c.outcomeId)) uses[c.outcomeLabel] = (uses[c.outcomeLabel] || 0) + 1; }));
    let best = order[k][0] || null;
    order[k].forEach(l => { if ((uses[l] || 0) > (uses[best] || 0)) best = l; });
    Object.keys(uses).forEach(l => { if (uses[l] > (uses[best] || 0)) best = l; });
    out[k] = best;
  });
  return out;
}
/** Etichetta di una chiamata in una sessione senza pipeline (automatica), con le etichette
 *  di statsRoundCallLabels. Le chiamate con un esito di una pipeline tengono il loro. */
function autoSessionCallLabel(c, roundLabels) {
  const kind = roundCallKind(c);
  if (kind && !(c.outcomeId && roundLabels.allIds.has(c.outcomeId)) && roundLabels[kind]) return roundLabels[kind];
  return c.outcomeLabel;
}

/**
 * Esiti di UNA sessione contati per LEAD (ultimo esito di ogni lead), non per chiamata —
 * stessa regola di computeStats: un lead chiamato 3 volte senza risposta è "1 Non risp",
 * non 3 (bug 13/10). Le chiamate vecchie senza groupId usano il raggruppamento posizionale.
 */
function sessionOutcomeCountsByLead(s, pipelines, allSessions) {
  const pipeline = sessionPipelineOf(s, pipelines);
  // Sessione automatica (senza pipeline): "Non risposto" / "Appuntamento fissato" dei round
  // sotto la stessa etichetta di Stats e report (Simone, 19/10). Etichetta più usata su tutte
  // le sessioni. Solo l'etichetta: i conti e i dati non cambiano.
  const roundLabels = pipeline ? null : statsRoundCallLabels(allSessions || (typeof db !== 'undefined' && db && db.sessions) || [s], pipelines);
  const groups = [];
  const byId = {};
  let current = null;
  s.calls.forEach(c => {
    if (c.groupId) {
      if (byId[c.groupId]) byId[c.groupId].push(c);
      else { byId[c.groupId] = [c]; groups.push(byId[c.groupId]); }
    } else if (c.isSecondAttempt && current) {
      current.push(c);
    } else {
      current = [c];
      groups.push(current);
    }
  });
  const counts = {};
  groups.forEach(g => {
    const last = g[g.length - 1];
    const label = pipeline ? callOutcomeLabelIn(last, pipeline) : autoSessionCallLabel(last, roundLabels);
    counts[label] = (counts[label] || 0) + 1;
  });
  return counts;
}

function computeStats(sessions, pipelines) {
  let totalCalls = 0, totalDurationMs = 0, totalSkips = 0;
  const leads = []; // ogni elemento raggruppa le chiamate (1 o più) fatte allo stesso lead
  const groupIndexByGroupId = {}; // groupId -> indice in leads[], valido su TUTTE le sessioni passate
  const roundLabels = statsRoundCallLabels(sessions, pipelines);

  sessions.forEach(s => {
    const end = s.endedAt ? new Date(s.endedAt) : new Date();
    // Tempo effettivo: senza le pause (stesso calcolo del timer e del dettaglio sessione).
    const ongoingPauseMs = (!s.endedAt && s.pausedAt) ? Math.max(0, Date.now() - new Date(s.pausedAt).getTime()) : 0;
    totalDurationMs += Math.max(0, end.getTime() - new Date(s.startedAt).getTime() - (s.pausedTotalMs || 0) - ongoingPauseMs);
    totalSkips += s.skips || 0;
    totalCalls += s.calls.length;

    let currentLead = null;
    const pipeline = sessionPipelineOf(s, pipelines);
    s.calls.forEach(c => {
      // Etichetta per gli esiti (fix A): i "Non risposto" / "Appuntamento fissato" dei round
      // vanno sotto l'esito della pipeline della sessione; nelle sessioni senza pipeline
      // (automatiche) sotto quello più usato (punto C). Copia: i dati non si toccano.
      const label = pipeline ? callOutcomeLabelIn(c, pipeline) : autoSessionCallLabel(c, roundLabels);
      if (label !== c.outcomeLabel) c = Object.assign({}, c, { outcomeLabel: label });
      if (c.groupId) {
        if (Object.prototype.hasOwnProperty.call(groupIndexByGroupId, c.groupId)) {
          leads[groupIndexByGroupId[c.groupId]].push(c);
        } else {
          groupIndexByGroupId[c.groupId] = leads.length;
          leads.push([c]);
        }
      } else if (c.isSecondAttempt && currentLead) {
        currentLead.push(c);
      } else {
        currentLead = [c];
        leads.push(currentLead);
      }
    });
  });

  // Esiti per LEAD UNICO (non per chiamata): ogni lead conta una volta, con l'esito
  // del suo ultimo tentativo (ordinato per timestamp: le chiamate di un lead possono
  // arrivare da sessioni diverse processate fuori ordine cronologico).
  const outcomeCounts = {};
  leads.forEach(calls => {
    const sorted = calls.length > 1 ? [...calls].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)) : calls;
    const last = sorted[sorted.length - 1];
    outcomeCounts[last.outcomeLabel] = (outcomeCounts[last.outcomeLabel] || 0) + 1;
  });

  const totalLeads = leads.length;
  // Un lead conta come "senza risposta" solo se NESSUNO dei tentativi ha avuto risposta.
  const noAnswer = leads.filter(calls => calls.every(c => c.isNoAnswer)).length;
  const conversion = leads.filter(calls => calls.some(c => c.isConversion)).length;

  const sortedOutcomes = Object.entries(outcomeCounts).sort((a, b) => b[1] - a[1]);
  const mostFrequent = sortedOutcomes[0] ? { label: sortedOutcomes[0][0], count: sortedOutcomes[0][1] } : null;
  const durationHours = totalDurationMs / 3600000;

  return {
    totalCalls,
    totalLeads,
    noAnswer,
    conversion,
    totalSkips,
    responseRate: pct(totalLeads - noAnswer, totalLeads),
    conversionRate: pct(conversion, totalLeads),
    outcomeCounts,
    sortedOutcomes,
    mostFrequent,
    sessionsCount: sessions.length,
    avgCallsPerSession: sessions.length ? round1(totalCalls / sessions.length) : 0,
    avgLeadsPerSession: sessions.length ? round1(totalLeads / sessions.length) : 0,
    totalDurationMs,
    callsPerHour: durationHours > 0.0166 ? round1(totalCalls / durationHours) : 0
  };
}

/** Variazione percentuale tra due valori, per le card di andamento. */
function trendDelta(current, previous) {
  if (previous === 0) {
    if (current === 0) return { diff: 0, dir: 'flat' };
    return { diff: 100, dir: 'up' };
  }
  const diff = round1(((current - previous) / previous) * 100);
  return { diff: Math.abs(diff), dir: diff > 0 ? 'up' : (diff < 0 ? 'down' : 'flat') };
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ============================================================================
 * Mini-CRM appuntamenti (Setter/Venditore) — funnel, goals, commissioni
 * ==========================================================================*/

/** Lunedì 00:00:00 della settimana che contiene d (settimana ISO, inizia di lunedì). */
function startOfWeek(d) {
  const x = startOfDay(d);
  const day = x.getDay(); // 0=domenica..6=sabato
  const diffToMonday = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diffToMonday);
  return x;
}
function endOfWeek(d) {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  return endOfDay(e);
}

function startOfMonth(d) { const x = new Date(d); return startOfDay(new Date(x.getFullYear(), x.getMonth(), 1)); }
function endOfMonth(d) { const x = new Date(d); return endOfDay(new Date(x.getFullYear(), x.getMonth() + 1, 0)); }

/** Range correnti (non storici/filtrabili) per le 3 card Giorno/Settimana/Mese dei funnel. */
function currentPeriodRanges() {
  const now = new Date();
  return {
    day: { start: startOfDay(now), end: endOfDay(now) },
    week: { start: startOfWeek(now), end: endOfWeek(now) },
    month: { start: startOfMonth(now), end: endOfMonth(now) }
  };
}

function inRange(dateVal, range) {
  if (!dateVal) return false;
  const d = new Date(dateVal);
  return d >= range.start && d <= range.end;
}

/**
 * Trova il giorno/settimana/mese con le commissioni totali più alte in assoluto su
 * tutto lo storico registrato — usato dal toggle "Migliore di sempre" delle card
 * "Migliore di sempre" della barra periodo in dashboard (vedi renderDashboardPeriodBar/getDashboardRange in
 * app.js). Raggruppa ogni evento di commissione (allCommissionEvents) nel periodo a cui
 * appartiene (giorno esatto / settimana lun-dom / mese) e ritorna il range con il
 * totale più alto. Ritorna null se non ci sono ancora commissioni registrate (es. tool
 * appena iniziato) — chi chiama questa funzione deve gestire il fallback al periodo
 * corrente in quel caso.
 */
function findBestPeriod(db, granularity) {
  const events = allCommissionEvents(db);
  if (!events.length) return null;

  const buckets = {}; // key -> { range, total }
  events.forEach(ev => {
    const d = new Date(ev.date);
    if (isNaN(d)) return;
    let key, range;
    if (granularity === 'day') {
      key = dateInputValue(d);
      range = { start: startOfDay(d), end: endOfDay(d) };
    } else if (granularity === 'week') {
      const s = startOfWeek(d);
      key = dateInputValue(s);
      range = { start: s, end: endOfWeek(d) };
    } else {
      key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      range = { start: startOfMonth(d), end: endOfMonth(d) };
    }
    if (!buckets[key]) buckets[key] = { range, total: 0 };
    buckets[key].total += ev.amount;
  });

  let best = null;
  Object.values(buckets).forEach(entry => {
    if (!best || entry.total > best.total) best = entry;
  });
  return best ? { range: best.range, total: round2(best.total) } : null;
}

/**
 * Data di incasso "effettiva" del cashCollected iniziale di un appuntamento.
 *
 * CORREZIONE (segnalata dall'utente): la commissione sul cash collected iniziale va
 * segnata nel calendario alla data dell'appuntamento presentato/incassato, NON al
 * giorno in cui l'utente marca la riga come "chiuso" nel CRM (closedAt) — quel giorno
 * può essere molto dopo la data reale dell'appuntamento (es. appuntamento del 6, marcato
 * chiuso il 10: la commissione va sul 6, non sul 10). Usiamo quindi presentedAt se
 * presente (il giorno in cui il cliente si è presentato/l'incasso è avvenuto),
 * altrimenti scheduledAt come fallback (appuntamenti senza presentedAt, es. legacy o
 * chiusi senza passare per "presentato").
 */
function appointmentCashDate(apt) {
  return apt.presentedAt || apt.scheduledAt;
}

/**
 * Elenco di "eventi di commissione" generati da un singolo appuntamento, ciascuno
 * con: data, importo, fonte ('showup' | 'setting' | 'vendita'), e riferimento al
 * cliente. Un evento per ogni rata pagata (l'"Acconto" sintetico dal cash collected
 * incluso — vedi getEffectiveInstallments in app.js), più uno "showup" da 40€ per i
 * setter quando presentedStatus === 'presented'.
 *
 * Regole di business (vedi brief):
 * - setter: 3% di ogni importo incassato (acconto + rate paid), + 40€ fissi
 *   al momento del "presentato".
 * - venditore: 10% di ogni importo incassato (acconto + rate paid).
 *
 * CORREZIONE (segnalata dall'utente): prima l'acconto (cashCollected) generava un
 * evento di commissione indipendente dalle rate ("_cash0") — se l'utente inseriva poi
 * il totale pacchetto reale (es. 5100€) come rate, il cash collected (200€) veniva
 * contato due volte nelle commissioni. Ora l'acconto è semplicemente la prima "rata"
 * (vedi getEffectiveInstallments), quindi qui basta scorrere le rate effettive: niente
 * più doppio conteggio, e resta comunque richiesto closed=true perché un appuntamento
 * generi commissioni sull'incassato (coerente col comportamento precedente).
 */
function commissionEventsForAppointment(apt) {
  const events = [];
  const isSetter = apt.role === 'setter';
  const rate = isSetter ? 0.03 : 0.10;
  const source = isSetter ? 'setting' : 'vendita';

  if (apt.presentedStatus === 'presented' && isSetter) {
    events.push({
      id: apt.id + '_showup',
      appointmentId: apt.id,
      clientName: apt.clientName,
      role: apt.role,
      date: apt.presentedAt || apt.scheduledAt,
      amount: 40,
      source: 'showup'
    });
  }

  if (apt.closed) {
    getEffectiveInstallments(apt).forEach(inst => {
      if (inst.paid && inst.amount > 0) {
        events.push({
          id: apt.id + '_' + inst.id,
          appointmentId: apt.id,
          clientName: apt.clientName,
          role: apt.role,
          date: inst.paidDate || inst.dueDate,
          amount: round2(inst.amount * rate),
          source
        });
      }
    });
  }

  return events;
}

function round2(n) { return Math.round(n * 100) / 100; }

/** Tutti gli eventi di commissione dell'intero dataset (usato dal calendario Commissioni). */
function allCommissionEvents(db) {
  const out = [];
  (db.appointments || []).forEach(apt => { out.push(...commissionEventsForAppointment(apt)); });
  return out;
}

/** Eventi di commissione in un range, opzionalmente filtrati per ruolo. */
function commissionEventsInRange(db, range, role) {
  return allCommissionEvents(db).filter(ev => {
    if (role && ev.role !== role) return false;
    return inRange(ev.date, range);
  });
}

function sumEvents(events) { return round2(events.reduce((s, e) => s + e.amount, 0)); }

/**
 * Calcola i valori attuali del funnel per un ruolo in un range.
 * Setter: appuntamentiFissati, presentati, chiusi, commissioniShowUp, commissioniChiusure, commissioniTot.
 * Venditore: assegnati (auto-calcolato dal CRM), presentati, chiusi (+ commissioni chiusure).
 *
 * CORREZIONE (segnalata dall'utente): "Appuntamenti Fissati/Assegnati" per un timeframe
 * (es. Giornaliero) deve contare quanti appuntamenti sono stati REGISTRATI nel sistema
 * in quel periodo (createdAt — l'attività di fissaggio fatta oggi/questa settimana), NON
 * quanti appuntamenti sono IN AGENDA per quel periodo (scheduledAt). Prima, fissando oggi
 * un appuntamento per il 16 mentre l'obiettivo giornaliero guardava "oggi 16", il tool
 * mostrava 0 fissati oggi ma 1 (quello fissato ieri, per oggi) — comportamento invertito.
 * "Presentati" e "Chiusi" invece restano filtrati su scheduledAt: l'esito di un
 * appuntamento appartiene al giorno in cui si è effettivamente svolto, non a quando è
 * stato creato nel sistema — quindi qui servono DUE sottoinsiemi distinti.
 */
/**
 * Appuntamento spostato (vedi app.js, rescheduleAppointment): il nuovo appuntamento nato
 * da uno spostamento NON è un appuntamento in più — il fissaggio è già stato contato sul
 * vecchio. Usato da tutti i conteggi "fissati/assegnati".
 */
function isCountedAsNewBooking(a) { return !a.rescheduledFromId; }

/** true se l'appuntamento è stato spostato (esito "Spostato" in Setter o Venditore). */
function isMovedAppointment(a) {
  return a.role === 'venditore' ? a.dealStage === 'spostato' : a.presentedStatus === 'spostato';
}

function computeFunnelValues(db, role, range) {
  const roleAppts = (db.appointments || []).filter(a => a.role === role);
  // Setter: fissati = registrati nel periodo (createdAt). Venditore: assegnati = con DATA
  // APPUNTAMENTO nel periodo (scheduledAt) — Simone, 2026-10-08: gli appuntamenti di fine
  // settembre inseriti a ottobre finivano negli assegnati di ottobre.
  const bookingField = role === 'venditore' ? 'scheduledAt' : 'createdAt';
  // Spostati: per il Setter (contato per data di inserimento) il fissaggio vale sul vecchio
  // appuntamento; per il Venditore (contato per data appuntamento) vale sul NUOVO, quello
  // che si svolge davvero — altrimenti uno spostato a cavallo di due mesi finiva assegnato
  // a un mese e presentato/chiuso nell'altro (bug 13/10).
  const fissatiAppts = roleAppts.filter(a => (role === 'venditore' ? !isMovedAppointment(a) : isCountedAsNewBooking(a)) && inRange(a[bookingField], range));
  const appts = roleAppts.filter(a => inRange(a.scheduledAt, range));
  // "Presentati": per il Setter segue presentedStatus (invariato); per il Venditore
  // segue il nuovo dealStage — presentato = isPresented (vedi
  // DEAL_STAGES.isPresented in app.js): esclusi No Show, Annullato e Spostato;
  const presentati = role === 'venditore'
    ? appts.filter(a => a.dealStage && dealStageDef(a.dealStage) && dealStageDef(a.dealStage).isPresented).length
    : appts.filter(a => a.presentedStatus === 'presented').length;
  const chiusi = appts.filter(a => a.closed).length;

  const events = commissionEventsInRange(db, range, role);
  const showUpEvents = events.filter(e => e.source === 'showup');
  const chiusureEvents = events.filter(e => e.source === 'setting' || e.source === 'vendita');

  // "Fatturato" (solo Venditore): il TOTALE VENDUTO (non le commissioni) sugli appuntamenti
  // chiusi nel periodo — richiesto esplicitamente dall'utente come 4a tappa della card
  // Obiettivi Venditore, accanto a Presentati/Chiusi. Stesso criterio di "chiusi" sopra
  // (scheduledAt nel range, closed=true), sommando apptTotalSold() invece di contare le righe.
  const fatturato = round2(appts.filter(a => a.closed).reduce((sum, a) => sum + apptTotalSold(a), 0));

  return {
    // Commissioni venditore = 10% dell'INCASSATO (Simone, 2026-10-13): cash collected +
    // rate spuntate come pagate, alla loro data. Le rate future contano quando le spunti.
    // Stessa fonte del calendario commissioni e delle Statistiche Venditore.
    commissioniVendita: role === 'venditore' ? sumEvents(chiusureEvents) : 0,
    appuntamentiFissati: fissatiAppts.length,
    presentati,
    chiusi,
    fatturato,
    commissioniShowUp: sumEvents(showUpEvents),
    commissioniChiusure: sumEvents(chiusureEvents),
    commissioniTot: sumEvents(events)
  };
}

/** Riassunto commissioni complessive (tutti i ruoli) in un range, diviso per fonte. */
function computeCommissionSummary(db, range) {
  const events = commissionEventsInRange(db, range);
  const bySource = { showup: 0, setting: 0, vendita: 0 };
  events.forEach(e => { bySource[e.source] = round2(bySource[e.source] + e.amount); });
  return {
    total: sumEvents(events),
    showup: bySource.showup,
    setting: bySource.setting,
    vendita: bySource.vendita,
    events
  };
}

/**
 * Statistiche aggregate Venditore per un range (o "all time" se range è null) — analoghe
 * a quelle già mostrate per le sessioni Setter (conversion rate, ecc.), richieste
 * esplicitamente dall'utente per capire il proprio rendimento sui vari timeframe.
 *
 * - assegnati: appuntamenti Venditore con data appuntamento nel periodo (scheduledAt,
 *   stesso criterio di "Appuntamenti Assegnati" nel funnel — vedi computeFunnelValues).
 * - presentati/chiusi/persi/noShow: filtrati su scheduledAt (quando si è svolto
 *   l'appuntamento), stesso criterio del funnel, ma qui contati sull'intero dataset
 *   Venditore (non solo sul periodo di "assegnazione") così lo show rate/conversion
 *   rate riflettono gli ESITI avvenuti nel periodo scelto, a prescindere da quando il
 *   lead era stato assegnato.
 * - showRate: presentati / (presentati + noShow) — quanti dei lead che dovevano
 *   presentarsi si sono davvero presentati.
 * - conversionRate: chiusi (contratto_firmato + chiuso) / presentati in target (esclusi
 *   i "Non in target") — quanti dei
 *   presentati si chiudono.
 * - scontrinoMedio: totale venduto (su appuntamenti chiusi) / numero di chiusi.
 */
function computeVenditoreStats(db, range) {
  const all = (db.appointments || []).filter(a => a.role === 'venditore');
  const inR = (a, field) => !range || inRange(a[field], range);

  const assegnati = all.filter(a => !isMovedAppointment(a) && inR(a, 'scheduledAt')).length; // data appuntamento, vedi computeFunnelValues
  const scoped = all.filter(a => inR(a, 'scheduledAt'));

  const noShow = scoped.filter(a => a.dealStage === 'no_show').length;
  const persi = scoped.filter(a => a.dealStage === 'perso').length;
  const annullati = scoped.filter(a => a.dealStage === 'annullato').length;
  const nonInTarget = scoped.filter(a => a.dealStage === 'non_in_target').length;
  const presentati = scoped.filter(a => a.dealStage && dealStageDef(a.dealStage) && dealStageDef(a.dealStage).isPresented).length;
  const chiusiAppts = scoped.filter(a => a.closed);
  const chiusi = chiusiAppts.length;

  // Show rate (Simone, 16/10, bug 7): buoni tutti gli appuntamenti tranne no show e
  // annullati; gli spostati restano fuori. Stessa regola del Setter (computeSetterStats).
  const showRateBase = presentati + noShow + annullati;
  const showRate = showRateBase > 0 ? pct(presentati, showRateBase) : 0;
  // "Non in target" conta come presentato (show rate) ma NON entra nel closing rate.
  const presentatiInTarget = scoped.filter(a => a.dealStage && dealStageDef(a.dealStage) && dealStageDef(a.dealStage).isPresented && !dealStageDef(a.dealStage).excludeFromClosing).length;
  const conversionRate = presentatiInTarget > 0 ? pct(chiusi, presentatiInTarget) : 0;

  const totalVenduto = chiusiAppts.reduce((s, a) => s + apptTotalSold(a), 0);
  const scontrinoMedio = chiusi > 0 ? round2(totalVenduto / chiusi) : 0;

  const commEvents = range ? commissionEventsInRange(db, range, 'venditore') : allCommissionEvents(db).filter(e => e.role === 'venditore');
  const commissioniTot = sumEvents(commEvents);

  // Ciambelle della Dashboard (restyling 17/10/2026, step 8): stessi insiemi di sopra,
  // così i numeri sono per costruzione quelli delle Statistiche.
  // Esiti degli ASSEGNATI GIÀ PASSATI (scheduledAt nel periodo e ≤ adesso, spostati
  // esclusi; Simone, 18/10/2026: i futuri non sono mai "da esitare"). Ogni appuntamento
  // finisce in una sola voce, quindi la somma = assegnatiPassati (che può essere minore di
  // "assegnati" se il periodo comprende giorni futuri). Chiuso vince sullo stato.
  const now = new Date();
  const assegnatiPerEsito = { chiusi: 0, trattativa: 0, perso: 0, no_show: 0, annullato: 0, non_in_target: 0, altro: 0 };
  const assegnatiPassatiList = all.filter(a => !isMovedAppointment(a) && inR(a, 'scheduledAt') && a.scheduledAt && new Date(a.scheduledAt) <= now);
  assegnatiPassatiList.forEach(a => {
    if (a.closed) assegnatiPerEsito.chiusi++;
    else if (Object.prototype.hasOwnProperty.call(assegnatiPerEsito, a.dealStage) && a.dealStage !== 'chiusi' && a.dealStage !== 'altro') assegnatiPerEsito[a.dealStage]++;
    else assegnatiPerEsito.altro++; // passato senza esito = da esitare
  });
  const assegnatiPassati = assegnatiPassatiList.length;
  // Commissioni divise: acconto (rata sintetica 'deposit') e rate pagate, dagli STESSI
  // eventi di commissioniTot (acconti + rate = commissioniTot). Rate future = 10% delle
  // rate non ancora pagate degli appuntamenti chiusi che hanno almeno un evento di
  // commissione nel periodo: solo informazione, MAI dentro commissioniTot (CLAUDE.md).
  const commAcconti = sumEvents(commEvents.filter(e => /_deposit$/.test(e.id)));
  const commRatePagate = round2(commissioniTot - commAcconti);
  const apptIdsInPeriod = new Set(commEvents.map(e => e.appointmentId));
  let futureCents = 0;
  all.filter(a => a.closed && apptIdsInPeriod.has(a.id)).forEach(a => {
    (a.installments || []).forEach(inst => {
      if (!inst.paid && inst.amount > 0) futureCents += Math.round(round2(inst.amount * 0.10) * 100);
    });
  });
  const commRateFuture = futureCents / 100;

  return {
    assegnati, presentati, chiusi, persi, noShow, annullati, nonInTarget,
    showRate, showRateBase, conversionRate, totalVenduto, scontrinoMedio, commissioniTot,
    assegnatiPerEsito, assegnatiPassati, commAcconti, commRatePagate, commRateFuture
  };
}

/**
 * Pace del mese (richiesto 2026-10-08): commissioni del mese corrente fatte finora,
 * proiettate su tutto il mese in base ai giorni lavorativi (lun-ven) passati, oggi incluso.
 * Setter: commissioni totali (show up + chiusure). Venditore: 10% dell'incassato del mese.
 */
function computeMonthPace(db, role) {
  const now = new Date();
  const month = currentPeriodRanges().month;
  const v = computeFunnelValues(db, role, month);
  const soFar = role === 'venditore' ? v.commissioniVendita : v.commissioniTot;
  const total = countWeekdays(month.start, month.end);
  const elapsed = countWeekdays(month.start, now);
  const pace = elapsed > 0 ? Math.round(soFar / elapsed * total) : Math.round(soFar);
  return { soFar: Math.round(soFar), pace, elapsed, total };
}

/** Numero di giorni feriali (lun-ven) tra due date, incluso entrambi gli estremi — usato
 * per la media "appuntamenti fissati/giorno" del Setter (weekend escluso su richiesta
 * esplicita dell'utente: nessun lavoro atteso sab/dom, non va a diluire la media). */
function countWeekdays(start, end) {
  let count = 0;
  const d = startOfDay(start);
  const last = startOfDay(end);
  while (d <= last) {
    const dow = d.getDay(); // 0=domenica, 6=sabato
    if (dow !== 0 && dow !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

/**
 * Statistiche aggregate Setter per un range (o "all time" se range è null) — sezione
 * "Statistiche" dentro Setting, richiesta esplicitamente dall'utente sullo stile di
 * computeVenditoreStats ma con metriche specifiche del ruolo Setter:
 * - fissati: appuntamenti Setter REGISTRATI nel periodo (createdAt), stesso criterio di
 *   computeFunnelValues ("l'attività di fissaggio fatta in quel periodo").
 * - presentati: tra gli appuntamenti IN AGENDA nel periodo (scheduledAt), quelli con
 *   presentedStatus === 'presented'.
 * - showUpRate: CORREZIONE esplicita dell'utente — non va calcolato sui fissati totali,
 *   ma solo sugli appuntamenti GIÀ SVOLTI (scheduledAt <= adesso): quelli ancora futuri
 *   non possono avere un esito e abbasserebbero artificialmente il tasso.
 * - mediaFissatiGiorno: fissati / giorni feriali (lun-ven) nel range.
 * - closingRate: quota di "presentati" (SOLO quelli, non tutti gli scoped) che risultano
 *   chiusi — "quanti apt presentati (solamente i presentati) vengono chiusi".
 */
function computeSetterStats(db, range) {
  const all = (db.appointments || []).filter(a => a.role === 'setter');
  const now = new Date();
  const inR = (a, field) => !range || inRange(a[field], range);

  const fissatiAppts = all.filter(a => isCountedAsNewBooking(a) && inR(a, 'createdAt'));
  const scoped = all.filter(a => inR(a, 'scheduledAt'));

  // "Svolti" = appuntamenti passati con un esito vero: Presentato, No Show o Annullato
  // (show rate unico con il Venditore, Simone 16/10: buoni tutti tranne no show e
  // annullati, spostati fuori). Quelli passati ma lasciati su "No"/"Confermato24h" non
  // hanno ancora un esito e abbasserebbero il tasso come se fossero no show (bug 13/10).
  const svolti = scoped.filter(a => !isMovedAppointment(a) && (a.presentedStatus === 'presented' || a.presentedStatus === 'no_show' || a.presentedStatus === 'annullato') && a.scheduledAt && new Date(a.scheduledAt) <= now);
  const presentati = scoped.filter(a => a.presentedStatus === 'presented');
  const presentatiSvolti = svolti.filter(a => a.presentedStatus === 'presented');

  const showUpRate = svolti.length > 0 ? pct(presentatiSvolti.length, svolti.length) : 0;
  const closingRate = presentati.length > 0 ? pct(presentati.filter(a => a.closed).length, presentati.length) : 0;

  // Range effettivo per la media/giorno: se "all time" (range=null) usa dal primo
  // appuntamento fissato ad oggi, altrimenti il range del timeframe scelto.
  let spanStart = range ? range.start : null;
  const spanEnd = range ? range.end : now;
  if (!range) {
    const earliest = all.filter(isCountedAsNewBooking).reduce((min, a) => {
      const d = new Date(a.createdAt);
      return (!min || d < min) ? d : min;
    }, null);
    spanStart = earliest || now;
  }
  const weekdays = countWeekdays(spanStart, spanEnd);
  const mediaFissatiGiorno = weekdays > 0 ? round1(fissatiAppts.length / weekdays) : 0;

  // Ciambella "Appuntamenti per esito" della Dashboard (Simone, 18/10/2026): per DATA
  // DELL'APPUNTAMENTO (scheduledAt nel periodo) e solo appuntamenti già passati (ora ≤
  // adesso), così mostra solo cose già successe. Spostati compresi (fetta a parte). Ogni
  // appuntamento in una sola voce: somma = passatiNelPeriodo. Presentati + No show +
  // Annullati = "svolti" qui sopra (stesse regole), Presentati = presentatiSvolti.
  // I fissati (createdAt) e lo show rate NON cambiano.
  // 'no' = passato senza esito (da esitare). I futuri non sono mai "da esitare".
  const passatiPerEsito = { presented: 0, no_show: 0, annullato: 0, spostato: 0, confirmed24h: 0, no: 0 };
  const passati = scoped.filter(a => a.scheduledAt && new Date(a.scheduledAt) <= now);
  passati.forEach(a => {
    const k = Object.prototype.hasOwnProperty.call(passatiPerEsito, a.presentedStatus) ? a.presentedStatus : 'no';
    passatiPerEsito[k]++;
  });

  return {
    passatiPerEsito,
    passatiNelPeriodo: passati.length,
    fissati: fissatiAppts.length,
    presentati: presentati.length,
    svolti: svolti.length,
    presentatiSvolti: presentatiSvolti.length,
    showUpRate,
    closingRate,
    mediaFissatiGiorno,
    weekdays
  };
}

/** Raggruppa gli eventi di commissione per giorno (YYYY-MM-DD) per il calendario. */
function groupEventsByDay(events) {
  const map = {};
  events.forEach(ev => {
    const key = dateInputValue(ev.date);
    if (!map[key]) map[key] = [];
    map[key].push(ev);
  });
  return map;
}

