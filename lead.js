/* lead.js — parte Venditore a LEAD (mini-CRM): righe Venditore delle Task in Dashboard, lista Lead,
 * scheda lead, numeri dei lead.
 *
 * Decisioni di Simone (non cambiarle senza chiedere):
 * - 30/10: i follow-up NON si gestiscono più nel tool (Simone li segue fuori, con un'automazione):
 *   niente prossima azione, Round Follow-up, "Com'è finita?" né regola dei 6 follow-up. La scheda
 *   ha i dati del lead (stato a tendina compreso), gli appuntamenti con l'esito, i pagamenti e le
 *   note. L'esito si mette dal ⋯ dell'appuntamento; nelle Task restano i "da esitare" (openEsito
 *   apre quel ⋯).
 * - Stati lead: Nuovo, In trattativa, Follow-up, Cliente, Perso, Freddo. Separati dagli stati
 *   dell'appuntamento (DEAL_STAGES in app.js); il lead segue gli esiti (onDealStageChanged).
 * - Numero dell'appuntamento (1°, 2°…): conta solo gli appuntamenti SVOLTI (presentati,
 *   anche non in target). Gli spostati restano nello storico ma non prendono numero.
 * - Soldi: restano sull'APPUNTAMENTO chiuso (cashCollected, totalSold, installments), così
 *   commissioni e statistiche si calcolano come prima (utils.js). La scheda Pagamenti li
 *   legge e li scrive lì.
 * - Interruttore "Parte Venditore" in 👤 Account (db.settings.venditoreOn, per utente).
 * - No show / annullato (Simone, 24/10): il lead va nel Round Recupero Venditore e si richiama
 *   solo da lì (l.next = "🔁 Recupero no show" resta come segno interno: inRecoveryRound). Gli
 *   esiti del round aggiornano il lead (onRecoveryOutcome: Non più interessato = Perso);
 *   "Appuntamento fissato" crea l'appuntamento Venditore del lead (addApptFromRecovery).
 *
 * Dati: db.leads[] (vedi storage.js) e apt.leadId sugli appuntamenti Venditore. Salvati
 * online nella tabella "lead" (o nella riga "stato" finché la tabella non c'è, vedi
 * cloud-sync.js).
 *
 * Tutto il codice sta dentro LeadCRM per non scontrarsi con i nomi di app.js. Usa le
 * funzioni globali del tool (openModal, closeModal, showToast, persist, escapeHtml,
 * applyDealStage, rescheduleAppointment, ...). Si carica PRIMA di app.js: le funzioni
 * vengono chiamate solo dopo l'avvio.
 */

const LeadCRM = (function () {
  /* ===================== Costanti ===================== */
  const STATI = ['Nuovo', 'Trattativa', 'Follow-up', 'Cliente', 'Perso', 'Freddo'];
  const STATO_LABEL = { 'Nuovo': 'Nuovo', 'Trattativa': 'In trattativa', 'Follow-up': 'Follow-up', 'Cliente': 'Cliente', 'Perso': 'Perso', 'Freddo': 'Freddo' };
  const APERTI = ['Nuovo', 'Trattativa', 'Follow-up'];
  const AZIONI = {
    // Simone, 24/10: tre tipi di follow-up. "Audio WhatsApp" e "Mandare contratto" non ci sono
    // più: chi li aveva passa a 💬 WhatsApp (migrateOldNextTypes).
    chiamata: { i: '📞', l: 'Chiamata' }, whatsapp: { i: '💬', l: 'Messaggio WhatsApp' }, contenuto: { i: '🎬', l: 'Mandare contenuto' },
    recupero: { i: '🔁', l: 'Recupero no show' }
  };
  // Icona outline delle righe nelle Task della Dashboard (app.js TASK_ICONS).
  const GG = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  
  const ui = { leadFilter: 'aperti', search: '', leadTab: 'storico' };

  /* ===================== Date (sempre ora locale, vedi CLAUDE.md sezione 5) ===================== */
  const pad = n => String(n).padStart(2, '0');
  const TODAY = () => dateInputValue(new Date());
  const NOWV = () => localDateTimeValue(new Date());
  // "2026-10-14" o "2026-10-14T15:30" -> Date locale (new Date("2026-10-14") sarebbe UTC).
  function parseLocal(s) {
    const [a, b] = String(s).split('T');
    const [y, m, d] = a.split('-').map(Number);
    const [h, mi] = (b || '00:00').split(':').map(Number);
    return new Date(y, m - 1, d, h || 0, mi || 0);
  }
  const isWeekday = d => d.getDay() !== 0 && d.getDay() !== 6;
  function workDay(n) { // giorno lavorativo (lun-ven) a n giorni da oggi
    const d = new Date(); d.setHours(12, 0, 0, 0);
    const step = n < 0 ? -1 : 1; let left = Math.abs(n);
    while (left > 0) { d.setDate(d.getDate() + step); if (isWeekday(d)) left--; }
    return dateInputValue(d);
  }
  function workDaysBetween(aKey, bKey) { // giorni lavorativi da a (escluso) a b (incluso)
    const a = parseLocal(aKey), b = parseLocal(bKey); let n = 0; if (b <= a) return 0;
    const d = new Date(a); while (d < b) { d.setDate(d.getDate() + 1); if (isWeekday(d)) n++; } return n;
  }
  // Data mancante o non valida (appuntamenti vecchi senza data): "—" invece di un errore.
  function fmtShort(key) { const d = parseLocal(String(key).slice(0, 10)); if (isNaN(d.getTime())) return '—'; return GG[d.getDay()].slice(0, 3) + ' ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1); }
  const fmtDT = s => s ? fmtShort(s) + ' · ' + String(s).slice(11, 16) : 'senza data';
  function relDay(key) {
    const t = TODAY(); if (key === t) return 'oggi';
    if (key < t) { const n = workDaysBetween(key, t); return n <= 1 ? 'ieri' : 'da ' + n + ' giorni'; }
    return workDaysBetween(t, key) === 1 ? 'domani' : fmtShort(key);
  }
  const euro = n => '€' + Math.round(n || 0).toLocaleString('it-IT');
  const esc = escapeHtml;

  /* ===================== Accesso ai dati ===================== */
  const leads = () => (db.leads = Array.isArray(db.leads) ? db.leads : []);
  const leadById = id => leads().find(l => l.id === id);
  const isOn = () => !db.settings || db.settings.venditoreOn !== false;
  const vndAppts = () => db.appointments.filter(a => a.role === 'venditore');
  const apptsOf = l => vndAppts().filter(a => a.leadId === l.id).sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)));
  const stageDef = a => (a.dealStage ? dealStageDef(a.dealStage) : null);
  const isSvolto = a => { const d = stageDef(a); return !!(d && d.isPresented); };
  const isPending = a => !a.dealStage;
  const isDue = a => isPending(a) && a.scheduledAt && parseLocal(a.scheduledAt) <= new Date();
  const isClosedAppt = a => a.dealStage === 'chiuso' || a.dealStage === 'contratto_firmato';
  const isOpen = l => APERTI.includes(l.stato);

  function apptNumber(a) { // solo appuntamenti svolti; uno non ancora svolto prende il prossimo numero
    const l = leadById(a.leadId); if (!l) return 1;
    return apptsOf(l).filter(x => x.id !== a.id && isSvolto(x) && String(x.scheduledAt) < String(a.scheduledAt)).length + 1;
  }
  const svoltiCount = l => apptsOf(l).filter(isSvolto).length;
  const pendingAppt = l => apptsOf(l).find(isPending);
  const lastClosedAppt = l => apptsOf(l).filter(isClosedAppt).pop() || null;
  function daEsitare() {
    return vndAppts().filter(a => a.leadId && leadById(a.leadId) && isDue(a)).sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)));
  }
  function addHistory(l, entry) { l.history = l.history || []; l.history.push(Object.assign({ d: NOWV(), s: '' }, entry)); }

  /* ===================== Lead dagli appuntamenti =====================
   * Ogni appuntamento Venditore con un nome appartiene a un lead. Gli appuntamenti senza
   * lead (quelli che c'erano prima, o creati con "+ Nuovo Appuntamento") vengono collegati
   * qui: stesso nome (o quasi) o stesso telefono = stesso lead, altrimenti lead nuovo.
   * Il nome in tabella è spesso "Nome - MJ - N": la sigla in mezzo è il setter. */
  function parseApptName(raw) {
    let s = String(raw || '').replace(/\s+/g, ' ').trim();
    let setter = '';
    let m = s.match(/^(.*?)\s+-\s+([A-Za-z]{1,3})(?:\s+-\s+[NnVv])?\s*$/);
    if (m && m[1]) { s = m[1]; setter = m[2]; }
    else if ((m = s.match(/^(.*?)\s+(OB)\s*$/i))) { s = m[1]; setter = 'OB'; }
    setter = setter.toLowerCase() === 's' ? 's' : setter.toUpperCase();
    // TUTTO MAIUSCOLO -> Iniziali Maiuscole (più leggibile); il resto resta com'è.
    if (s && s === s.toUpperCase() && /[A-Z]/.test(s)) s = s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (x, a, b) => a + b.toUpperCase());
    return { name: s.trim(), setter };
  }
  const normName = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const phoneKey = p => { const d = String(p || '').replace(/\D/g, ''); return d.length >= 8 ? d.slice(-9) : ''; };

  function newLead(o) {
    return Object.assign({
      id: uid('lead'), name: '', centro: '', city: '', phone: '', email: '', setter: '',
      stato: 'Nuovo', next: null, promises: [], history: [], fuNoAnswer: 0, wasFollowUp: false,
      createdAt: new Date().toISOString()
    }, o);
  }

  /** Stato iniziale di un lead creato da appuntamenti che esistevano già. */
  function initialStateFromAppts(l) {
    const list = apptsOf(l).filter(a => a.dealStage !== 'spostato');
    const last = list.filter(a => a.dealStage).pop();
    if (!last) { l.stato = 'Nuovo'; return; }
    const st = last.dealStage;
    if (st === 'chiuso' || st === 'contratto_firmato') l.stato = 'Cliente';
    else if (st === 'perso' || st === 'non_in_target') l.stato = 'Perso';
    else if (st === 'trattativa') {
      l.stato = 'Trattativa';
      if (last.nextFollowUpDate) l.next = { type: 'chiamata', date: last.nextFollowUpDate, time: '', note: 'Follow-up (dalla tabella appuntamenti)' };
    } else if (st === 'no_show' || st === 'annullato') {
      l.stato = 'Nuovo';
      const inRound = (db.recoveryRound || []).some(r => r.sourceAppointmentId === last.id && r.status === 'active');
      if (inRound) l.next = { type: 'recupero', date: TODAY(), time: '', note: 'Nel Round Recupero: richiamare per fissare di nuovo' };
    }
    if (pendingAppt(l)) l.stato = l.stato === 'Cliente' || l.stato === 'Perso' ? l.stato : (svoltiCount(l) ? 'Trattativa' : 'Nuovo');
  }

  /** Collega gli appuntamenti Venditore ai lead. Ritorna true se ha cambiato qualcosa. */
  function ensureLeads() {
    const L = leads();
    let changed = false;
    const created = [];
    const byName = {}, byPhone = {};
    L.forEach(l => { byName[normName(l.name)] = byName[normName(l.name)] || l; const k = phoneKey(l.phone); if (k) byPhone[k] = byPhone[k] || l; });
    // Prima i più vecchi, così il lead prende i dati del primo appuntamento.
    const todo = vndAppts().filter(a => (!a.leadId || !leadById(a.leadId)) && String(a.clientName || '').trim())
      .sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)));
    todo.forEach(a => {
      // Un appuntamento spostato porta il lead del vecchio.
      const from = a.rescheduledFromId && db.appointments.find(x => x.id === a.rescheduledFromId);
      let l = from && from.leadId && leadById(from.leadId);
      const p = parseApptName(a.clientName);
      if (!l) l = byName[normName(p.name)] || (phoneKey(a.phone) && byPhone[phoneKey(a.phone)]);
      if (!l) {
        l = newLead({ name: p.name, setter: p.setter, phone: a.phone ? String(a.phone).trim() : '' });
        L.push(l); created.push(l);
        byName[normName(l.name)] = l; if (phoneKey(l.phone)) byPhone[phoneKey(l.phone)] = l;
      }
      if (!l.phone && a.phone) l.phone = String(a.phone).trim();
      if (!l.setter && p.setter) l.setter = p.setter;
      a.leadId = l.id;
      changed = true;
    });
    created.forEach(initialStateFromAppts);
    if (migrateOldNextTypes()) changed = true;
    if (moveApptExtras()) changed = true;
    if (syncRecoveryNext()) changed = true;
    return changed;
  }

  /** "📅 Fissare appuntamento" non c'è più (Simone, 18/10/2026): chi l'aveva salvata come
   * prossima azione passa a "📞 Chiamata" con la stessa data e ora. apptAt resta: il
   * "Fatto" lo propone già nel campo "Appuntamento fissato per". */
  function migrateOldNextTypes() {
    let changed = false;
    leads().forEach(l => {
      if (l.next && l.next.type === 'appuntamento') { l.next.type = 'chiamata'; changed = true; }
      if (l.next && (l.next.type === 'audio' || l.next.type === 'contratto')) {
        if (l.next.type === 'contratto' && !l.next.note) l.next.note = 'Mandare contratto';
        l.next.type = 'whatsapp'; changed = true;
      }
    });
    return changed;
  }

  /** Note e follow-up degli appuntamenti -> scheda lead (una volta sola, poi restano vuoti). */
  function moveApptExtras() {
    let changed = false;
    vndAppts().forEach(a => {
      const l = a.leadId && leadById(a.leadId); if (!l) return;
      (a.notes || []).forEach(n => {
        if (!n || !String(n.text || '').trim()) return;
        addHistory(l, { k: 'nota', t: 'Nota', s: String(n.text).trim(), d: n.createdAt ? localDateTimeValue(new Date(n.createdAt)) : String(a.scheduledAt || NOWV()).slice(0, 16) });
      });
      if ((a.notes || []).length) { a.notes = []; changed = true; }
      if (a.nextFollowUpDate) {
        const d = a.nextFollowUpDate;
        if (isOpen(l) && !l.next && !pendingAppt(l)) {
          l.next = { type: 'chiamata', date: d, time: '', note: 'Follow-up (dalla tabella appuntamenti)' };
          addHistory(l, { k: 'stato', t: 'Follow-up per ' + fmtShort(d), s: 'dalla tabella appuntamenti' });
        } else addHistory(l, { k: 'nota', t: 'Follow-up segnato in tabella per ' + fmtShort(d), s: l.next ? 'la prossima azione era già impostata, non l\'ho cambiata' : '' });
        a.nextFollowUpDate = null; changed = true;
      }
    });
    return changed;
  }

  /* ---------- Recupero collegato al lead ---------- */
  /** Voce attiva del Round Recupero nata da un appuntamento Venditore di questo lead. */
  function recoveryEntryFor(l) {
    return (db.recoveryRound || []).find(r => r.status === 'active' && r.sourceRole === 'venditore' && (() => {
      const a = db.appointments.find(x => x.id === r.sourceAppointmentId); return a && a.leadId === l.id;
    })()) || null;
  }
  /** true = il lead aspetta il Round Recupero: la prossima azione è il recupero e la voce è
   * nel round. Non compare nelle Task (un posto solo: il round, Simone 24/10). */
  const inRecoveryRound = l => !!(l.next && l.next.type === 'recupero' && recoveryEntryFor(l));
  /** Lead Venditore di una voce del round (o null). */
  function leadOfEntry(entry) {
    if (!entry || entry.sourceRole !== 'venditore') return null;
    const a = db.appointments.find(x => x.id === entry.sourceAppointmentId);
    return (a && a.leadId && leadById(a.leadId)) || null;
  }
  /** Esito del Round Recupero su una voce Venditore: il lead segue (Simone, 24/10). Solo lead
   * aperti (un Cliente che salta un appuntamento resta com'è). Ritorna un testo per il
   * messaggio in basso, o ''.
   * - non_risposto: un follow-up senza risposta; al 6° il lead è Freddo ed esce dal round;
   * - non_interessato: il lead è Perso;
   * - rimosso: niente prossima azione ("Manca" nelle Task: decide Simone). */
  function onRecoveryOutcome(entry, outcome) {
    const l = leadOfEntry(entry);
    if (!l || !isOpen(l)) return '';
    const T = { non_risposto: 'non ha risposto', non_interessato: 'non più interessato', rimosso: 'tolto dal round' };
    if (!T[outcome]) return '';
    addHistory(l, { k: 'azione', t: AZIONI.recupero.l + ' · ' + T[outcome], s: 'Round Recupero' });
    let msg = '';
    if (outcome === 'non_interessato') {
      addHistory(l, { k: 'stato', t: 'Stato: Perso', s: 'non più interessato (Round Recupero)' });
      l.stato = 'Perso'; l.next = null;
    } else if (outcome === 'rimosso') l.next = null;
    return msg;
  }
  /** "Appuntamento fissato" dal round su un no show Venditore (Simone, 24/10): nuovo
   * appuntamento Venditore sullo stesso lead (non più un appuntamento Setter). Ritorna
   * l'appuntamento, o null se la voce non ha un lead (allora resta la regola Setter). */
  function addApptFromRecovery(entry, when) {
    const l = isOn() && leadOfEntry(entry);
    if (!l) return null;
    const apt = addApptToLead(l, when, '');
    addHistory(l, { k: 'azione', t: AZIONI.recupero.l + ' · appuntamento fissato', s: 'Round Recupero · ' + fmtDT(when) });
    return apt;
  }
  /** Un lead aperto con un no show da recuperare ha sempre una prossima azione. */
  function syncRecoveryNext() {
    let changed = false;
    leads().forEach(l => {
      if (isOpen(l) && !l.next && !pendingAppt(l) && recoveryEntryFor(l)) { l.next = recoveryNext(); changed = true; }
    });
    return changed;
  }
  /** No show segnato su un appuntamento futuro (Simone, 24/10): il recupero parte dal giorno e
   * dall'ora dell'appuntamento (nel round compare solo dopo, isFutureNoShowEntry in app.js). */
  const recoveryNext = apt => {
    const at = apt && apt.dealStage === 'no_show' && String(apt.scheduledAt || '');
    const future = at && new Date(at).getTime() > Date.now();
    return { type: 'recupero', date: future ? at.slice(0, 10) : TODAY(), time: future ? at.slice(11, 16) : '', note: 'Richiamare per fissare di nuovo' };
  };
  /** Il lead è uscito dal giro (cliente, perso, freddo, nuovo appuntamento): la voce del round si chiude. */
  function closeRecovery(l, status, apptId) {
    const r = recoveryEntryFor(l); if (!r) return;
    r.status = status || 'removed';
    if (apptId) r.resolvedAppointmentId = apptId;
    r.lastInteractionAt = new Date().toISOString();
  }
  /** No show / annullato su un appuntamento del lead: si riparte dal recupero. */
  function startRecovery(l, apt) {
    if (!isOpen(l)) { if (l.stato === 'Cliente') return; addHistory(l, { k: 'stato', t: 'Stato: Nuovo', s: 'riaperto dopo il no show' }); l.stato = 'Nuovo'; }
    l.next = recoveryNext(apt);
    l.fuNoAnswer = 0;
  }

  /* ---------- Prossima azione di prima (esito sbagliato e poi corretto) ----------
   * Simone, 19/10: "se lo tolgo deve tornare com'era". Un esito che chiude il lead o ne cambia
   * la prossima azione (Chiuso, Contratto firmato, Perso, Non in target, No show, Annullato)
   * salva sul lead una copia di prima: l.prevNext = { next, fuNoAnswer, wasFollowUp, stato,
   * apptId, at, after, afterFu } (after/afterFu = come li ha lasciati l'esito). Se quell'esito
   * viene corretto e il lead torna aperto, la prossima azione di prima torna (se la sua
   * data è passata, spostata a oggi: Simone 24/10), con il contatore dei follow-up. Se intanto la
   * prossima azione è stata cambiata (a mano o con un "Fatto"), non si tocca niente. */
  const STATO_A_MANO = { id: 'stato-a-mano' }; // copia fatta cambiando a mano lo stato del lead
  const WRONG_STAGES = ['chiuso', 'contratto_firmato', 'perso', 'non_in_target', 'no_show', 'annullato'];
  const nextKey = n => JSON.stringify(n || null);
  const clone = o => (o ? JSON.parse(JSON.stringify(o)) : null);
  /** true = il lead è ancora come l'ha lasciato l'esito salvato nella copia. */
  const prevNextUntouched = (l, p) => nextKey(l.next) === nextKey(p.after) && (l.fuNoAnswer || 0) === (p.afterFu || 0);
  /** Prima di un esito "che chiude": salva la copia. Se c'è già una copia per lo stesso
   * appuntamento e nessuno ha toccato il lead (es. Chiuso → Perso), resta quella più vecchia. */
  function savePrevNext(l, apt) {
    const p = l.prevNext;
    if (p && p.apptId === apt.id && prevNextUntouched(l, p)) return;
    l.prevNext = { next: clone(l.next), fuNoAnswer: l.fuNoAnswer || 0, wasFollowUp: !!l.wasFollowUp, stato: l.stato, apptId: apt.id, at: new Date().toISOString() };
  }
  /** Dopo l'esito: ricorda come l'ha lasciato (per capire poi se è stato toccato). */
  function markPrevNextAfter(l, apt) {
    const p = l.prevNext; if (!p || p.apptId !== apt.id) return;
    p.after = clone(l.next); p.afterFu = l.fuNoAnswer || 0;
  }
  /** Copia valida per correggere l'esito di questo appuntamento, o null. */
  function prevNextFor(l, apt) {
    const p = l.prevNext;
    return p && p.apptId === apt.id && prevNextUntouched(l, p) ? p : null;
  }
  /** Rimette prossima azione e contatori di prima. Se prima non c'era una prossima azione,
   * resta la regola di oggi (solo i contatori tornano). keepCounters = lascia i contatori. */
  function restorePrevNext(l, p, keepCounters) {
    if (!keepCounters) { l.fuNoAnswer = p.fuNoAnswer || 0; l.wasFollowUp = !!p.wasFollowUp; }
    if (p.next) {
      l.next = clone(p.next);
      // Simone, 24/10: se la sua data è già passata torna spostata a oggi (stessa ora), non scaduta.
      if (l.next.date && l.next.date < TODAY()) l.next.date = TODAY();
      addHistory(l, { k: 'stato', t: 'Ripristinata la prossima azione di prima', s: actLabel(l.next) + (l.next.date ? ' · ' + fmtShort(l.next.date) : '') });
    }
  }

  /** Da chiamare quando cambia lo stato di un appuntamento (scheda lead → Appuntamenti):
   * il lead segue (chiuso -> Cliente, perso -> Perso, no show -> Recupero...). */
  function onDealStageChanged(apt, prevStage) {
    if (!apt || apt.role !== 'venditore') return;
    const st = apt.dealStage;
    const isWrong = WRONG_STAGES.includes(st);
    // Esito "che chiude": copia di prima. Prima di ensureLeads, che a un lead senza prossima
    // azione con un no show nel round mette subito "🔁 Recupero" (non è l'azione di prima).
    const l0 = apt.leadId && leadById(apt.leadId);
    if (isWrong && l0) savePrevNext(l0, apt);
    ensureLeads();
    const l = leadById(apt.leadId); if (!l) return;
    // Esito corretto: la copia, se il lead non è stato toccato.
    const prevCopy = isWrong ? null : prevNextFor(l, apt);
    // CORREZIONE (Simone, 19/10: "se lo tolgo deve tornare com'era"): Chiuso / Contratto
    // firmato o Perso / Non in target messo per errore e poi cambiato dalla tendina. Prima il
    // lead restava Cliente (o Perso). Torna aperto se:
    // - era Cliente per questo appuntamento e non resta nessun appuntamento chiuso;
    // - era Perso per questo appuntamento (l'ultimo con un esito).
    // In trattativa se ha appuntamenti svolti, se no Nuovo; Follow-up se lo era prima
    // dell'esito sbagliato (copia l.prevNext). La prossima azione di prima torna più sotto.
    const LOST = ['perso', 'non_in_target'];
    const wasClosedStage = prevStage === 'chiuso' || prevStage === 'contratto_firmato';
    const undoClient = l.stato === 'Cliente' && wasClosedStage && !isClosedAppt(apt) && !apptsOf(l).some(isClosedAppt);
    const undoLost = l.stato === 'Perso' && LOST.includes(prevStage) && !LOST.includes(st) && !isClosedAppt(apt)
      && !apptsOf(l).some(x => x.id !== apt.id && x.dealStage && x.dealStage !== 'spostato' && String(x.scheduledAt) > String(apt.scheduledAt));
    if (undoClient || undoLost) {
      const to = LOST.includes(st) ? 'Perso'
        : (prevCopy && prevCopy.stato === 'Follow-up') ? 'Follow-up'
        : (svoltiCount(l) ? 'Trattativa' : 'Nuovo');
      if (to !== l.stato) addHistory(l, { k: 'stato', t: 'Stato: ' + STATO_LABEL[to], s: 'corretto l\'esito dell\'appuntamento' });
      l.stato = to;
    }
    if (st === 'chiuso' || st === 'contratto_firmato') { if (l.stato !== 'Cliente') addHistory(l, { k: 'stato', t: 'Stato: Cliente', s: 'dallo stato dell\'appuntamento' }); l.stato = 'Cliente'; l.next = null; }
    else if (st === 'perso' || st === 'non_in_target') { if (isOpen(l)) { addHistory(l, { k: 'stato', t: 'Stato: Perso', s: 'dallo stato dell\'appuntamento' }); l.stato = 'Perso'; l.next = null; } }
    else if (st === 'trattativa') { if (l.stato === 'Nuovo') l.stato = 'Trattativa'; }
    else if (st === 'no_show' || st === 'annullato') startRecovery(l, apt);
    if (!isOpen(l) && st !== 'no_show' && st !== 'annullato') closeRecovery(l);
    if (isWrong) markPrevNextAfter(l, apt);
    else if (l.prevNext && l.prevNext.apptId === apt.id) {
      // Esito corretto: se il lead è di nuovo aperto torna la prossima azione di prima. La copia
      // si usa una volta sola (anche quando non serve: il lead è stato toccato o resta chiuso).
      if (prevCopy && isOpen(l)) {
        // Lead Perso o Freddo riaperto da un No show / Annullato messo per errore (Simone, 24/10:
        // "deve tornare com'era"): torna Perso o Freddo, senza prossima azione.
        if ((prevStage === 'no_show' || prevStage === 'annullato') && (prevCopy.stato === 'Perso' || prevCopy.stato === 'Freddo')) {
          addHistory(l, { k: 'stato', t: 'Stato: ' + STATO_LABEL[prevCopy.stato], s: 'corretto l\'esito dell\'appuntamento' });
          l.stato = prevCopy.stato; l.next = null;
          l.fuNoAnswer = prevCopy.fuNoAnswer || 0; l.wasFollowUp = !!prevCopy.wasFollowUp;
          closeRecovery(l);
        } else restorePrevNext(l, prevCopy);
      }
      delete l.prevNext;
    }
    // No show corretto (es. in "Presentato · trattativa") dalla tendina (Simone, 19/10): se non
    // resta nessun no show da recuperare, "🔁 Recupero no show" diventa "📞 Chiamata" con la
    // stessa data e ora (la nota automatica del recupero non vale più e si toglie).
    if (st !== 'no_show' && st !== 'annullato' && isOpen(l) && l.next && l.next.type === 'recupero' && !recoveryEntryFor(l)) {
      // CORREZIONE (Simone, 19/10: "se lo tolgo deve tornare com'era"): No show rimesso su
      // "— Da impostare —" = l'appuntamento è di nuovo da esitare (o ancora da fare), quindi
      // il prossimo passo è lui, come prima del no show: niente "📞 Chiamata" in più per oggi.
      if (!st && pendingAppt(l)) l.next = null;
      else {
        l.next = Object.assign({}, l.next, { type: 'chiamata' });
        if (/richiamare per fissare di nuovo$/i.test(l.next.note || '')) l.next.note = '';
      }
    }
    persist();
  }

  /* ===================== Pezzi di interfaccia ===================== */
  function stPill(s) { return `<span class="stpill st-${s}">${STATO_LABEL[s] || esc(s)}</span>`; }
  const nOrd = n => n + '°';
  const actDef = n => AZIONI[n && n.type] || AZIONI.chiamata;
  const actLabel = n => actDef(n).i + ' ' + actDef(n).l;
  const setterOf = a => { const l = leadById(a.leadId); return (l && l.setter) || parseApptName(a.clientName).setter || ''; };
  const leadName = l => esc(l.name || '(senza nome)');
  const centroTxt = l => [l.centro, l.city].filter(Boolean).map(esc).join(' · ');
  /** Cliente senza nome del centro (Simone, 18/10): etichetta "centro mancante" in lista e
   * nella scheda. Manca se il lead non ha il centro e almeno un appuntamento chiuso non ce
   * l'ha (o non ci sono appuntamenti chiusi). */
  function leadMissingCenter(l) {
    if (!l || l.stato !== 'Cliente' || String(l.centro || '').trim()) return false;
    const closed = apptsOf(l).filter(a => a.closed);
    return !closed.length || closed.some(a => !String(a.centerName || '').trim());
  }
  const centerTargetOf = l => ({ key: 'lead:' + l.id, role: 'venditore', name: l.name || '(senza nome)', apts: apptsOf(l).filter(a => a.closed), lead: l });

  /** Apre un modal del tool e, se serve, ne prepara gli eventi. */
  function modal(html, onMount) {
    openModal(`<div class="lead-modal">${html}</div>`);
    const box = modalRoot.querySelector('.modal-box');
    if (onMount) onMount(box);
    const f = box.querySelector('button, input'); if (f) f.focus({ preventScroll: true });
  }
  function rerender() { closeModal(); renderRoute(); }

  /* ===================== Task della Dashboard (riga 2c) =====================
   * Da esitare, lead senza prossima azione, azioni in ritardo e di oggi: righe delle
   * "Task da fare" della Dashboard. Qui ci sono solo i dati di
   * ogni riga; la lista (ordine, stile, "Mostra tutte") la disegna app.js
   * (renderDashboardTasks). Le cose promesse non compaiono più: i dati promises[]
   * restano salvati. Gli appuntamenti di oggi non ancora svolti non sono task: quando
   * passano l'ora diventano "da esitare". */
  function dashboardTaskItems() {
    if (!isOn()) return [];
    if (ensureLeads()) persist();
    const t = TODAY(), out = [];
    // Righe semplici (Simone, 24/10: T4): nome, cosa fare, quando, un tasto. Sposta e il
    // resto stanno nella scheda del lead (clic sul nome).
    const who = l => `<button class="who" data-lead="${l.id}">${leadName(l)}</button>`;
    daEsitare().forEach(a => {
      const l = leadById(a.leadId);
      out.push({
        id: 'esita-' + a.id, due: String(a.scheduledAt).slice(0, 16), hasTime: true, late: true, icon: 'clock',
        titleHtml: who(l), subHtml: `${nOrd(apptNumber(a))} appuntamento da esitare`,
        actionsHtml: `<button class="btn-ghost btn-sm" data-esita="${a.id}">Metti l'esito</button>`
      });
    });
    return out;
  }

  /** Eventi comuni dei tasti nelle righe (Task della Dashboard, lista, scheda). */
  function wireRowButtons(root) {
    root.querySelectorAll('[data-lead]').forEach(b => b.addEventListener('click', () => { ui.leadTab = 'storico'; location.hash = '#/lead/' + b.dataset.lead; }));
    root.querySelectorAll('[data-esita]').forEach(b => b.addEventListener('click', () => openEsito(b.dataset.esita)));
  }

  /* ===================== Esito di un appuntamento =====================
   * Simone, 30/10: niente più "Com'è finita?" e niente follow-up nel tool (li gestisce fuori).
   * "Metti l'esito" (Task della Dashboard, riga da esitare) apre il ⋯ dell'appuntamento: data
   * ed esito con la tendina, con le stesse regole della scheda (onDealStageChanged: Cliente,
   * Perso, no show → Round Recupero, chiusura → nome del centro). */
  function openEsito(apptId) {
    const a = db.appointments.find(x => x.id === apptId); if (!a) return;
    if (ensureLeads()) persist();
    const l = leadById(a.leadId); if (!l) return;
    openApptMenu(l, apptId, () => renderRoute());
  }

  /** Nuovo appuntamento Venditore per un lead ("Appuntamento fissato per" nel Fatto, "+ Appuntamento"). */
  function createApptForLead(l, when) {
    const apt = newAppointment('venditore');
    apt.clientName = l.name + (l.setter ? ' - ' + l.setter : '');
    apt.phone = l.phone || null;
    apt.scheduledAt = when;
    apt.leadId = l.id;
    db.appointments.unshift(apt);
    addHistory(l, { k: 'azione', t: 'Appuntamento fissato', s: 'Per ' + fmtDT(when) });
    return apt;
  }

  /* ===================== Venditore → Lead (lista) =====================
   * Restyling 5.6, dall'alto: tasti (🎙️ Registrazioni, Report, "+ Nuovo lead" = l'unico
   * nero della vista) · filtri dentro una tendina apri/chiudi (ricordata nel browser) ·
   * lista lead (⋯ a destra: apri, + appuntamento, elimina) · calendario appuntamenti
   * Venditore. La vecchia tabella Appuntamenti Venditore non c'è più: tutto si fa da qui
   * e dalla scheda lead. */
  const LEAD_FILTERS = {
    aperti: ['Aperti', l => isOpen(l)], 'Nuovo': ['Nuovi', l => l.stato === 'Nuovo'], 'Trattativa': ['In trattativa', l => l.stato === 'Trattativa'],
    'Follow-up': ['Follow-up', l => l.stato === 'Follow-up'], 'Cliente': ['Clienti', l => l.stato === 'Cliente'], 'Freddo': ['Freddi', l => l.stato === 'Freddo'],
    'Perso': ['Persi', l => l.stato === 'Perso'], tutti: ['Tutti', () => true]
  };
  const FILTERS_OPEN_KEY = 'comms_filtriLeadAperti';
  function filtersOpen() {
    if (typeof ui.filtersOpen !== 'boolean') {
      let v = null;
      try { v = localStorage.getItem(FILTERS_OPEN_KEY); } catch (e) { /* browser senza memoria: chiusa */ }
      ui.filtersOpen = v === '1';
    }
    return ui.filtersOpen;
  }
  function setFiltersOpen(open) {
    ui.filtersOpen = !!open;
    try { localStorage.setItem(FILTERS_OPEN_KEY, open ? '1' : '0'); } catch (e) { /* resta in memoria */ }
  }
  /** Appuntamenti Venditore senza nome: non hanno lead (ensureLeads li salta). Prima si
   * vedevano solo nella tabella; ora compaiono in fondo alla lista per poterli eliminare. */
  const orphanAppts = () => vndAppts().filter(a => !String(a.clientName || '').trim() && !(a.leadId && leadById(a.leadId)));

  function renderLeadList() {
    if (ensureLeads()) persist();
    const F = LEAD_FILTERS;
    if (!F[ui.leadFilter]) ui.leadFilter = 'aperti';
    const q = normName(ui.search);
    const qPhone = String(ui.search).replace(/\D/g, '');
    let rows = leads().filter(F[ui.leadFilter][1]).filter(l => !q || normName(l.name + ' ' + l.centro + ' ' + l.city).includes(q) || (qPhone.length >= 3 && String(l.phone).replace(/\D/g, '').includes(qPhone)));
    const sortKey = l => {
      const pa = pendingAppt(l); if (pa) return '1' + String(pa.scheduledAt).replace('T', '');
      if (inRecoveryRound(l)) return '2';
      return '9' + normName(l.name);
    };
    rows.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    const open = filtersOpen();
    const orphans = orphanAppts();
    const nRec = (db.callRecordings || []).length;
    appRoot.innerHTML = `
      <section class="card crm-toolbar lead-toolbar">
        <button class="btn-ghost" id="btnCallRecordings">🎙️ Registrazioni <span class="pill-count">${nRec}</span></button>
        <div class="lead-toolbar-right">
          <button class="btn-ghost" id="btnLeadReport" title="Copia il report degli appuntamenti Venditore">Report</button>
          <button class="btn-primary" id="btnNewLead">+ Nuovo lead</button>
        </div>
      </section>
      <section class="card appt-list-card lead-filters-card ${open ? 'is-open' : ''}">
        <button class="appt-list-toggle" id="btnToggleLeadFilters" aria-expanded="${open}">
          <span class="appt-list-title">Filtri</span>
          <span class="lead-filters-now">${F[ui.leadFilter][0]}${ui.search ? ' · “' + esc(ui.search) + '”' : ''}</span>
          <span class="appt-list-caret" aria-hidden="true">▾</span>
        </button>
        ${open ? `<div class="lead-filters-body">
          <div class="crm-filters">${Object.keys(F).map(k => `<button class="pill ${ui.leadFilter === k ? 'active' : ''}" data-lf="${k}">${F[k][0]} <span class="pill-count">${leads().filter(F[k][1]).length}</span></button>`).join('')}</div>
          <div class="crm-search-wrap"><input type="search" class="crm-search-input" id="leadSearch" placeholder="Cerca per nome, centro o telefono..." value="${esc(ui.search)}"></div>
        </div>` : ''}
      </section>
      <section class="card crm-table-wrap lead-list-card">
        <div class="lead-list-head"><span class="appt-list-title">Lead</span><span class="count-pill">${rows.length}</span></div>
        ${rows.length ? `<table class="crm-table leads-tbl"><thead><tr><th>Lead</th><th>Stato</th><th>Appuntamenti</th><th>Prossimo passo</th><th>Quando</th><th>Setter</th><th></th></tr></thead><tbody>
        ${rows.map(l => {
          const sv = svoltiCount(l); const pend = pendingAppt(l);
          let azione = '<span class="sub">—</span>', quando = '';
          // Simone, 30/10: niente più follow-up nel tool. Il prossimo passo è l'appuntamento
          // in programma (o da esitare) oppure il Round Recupero.
          if (pend) { azione = '📅 ' + nOrd(apptNumber(pend)) + ' appuntamento'; quando = isDue(pend) ? '<span class="red">da esitare</span>' : relDay(String(pend.scheduledAt).slice(0, 10)) + ' ' + String(pend.scheduledAt).slice(11, 16); }
          else if (inRecoveryRound(l)) azione = '🔁 Nel Round Recupero';
          return `<tr data-lead-row="${l.id}">
            <td class="crm-cell-center"><button class="who" data-lead="${l.id}">${leadName(l)}</button>${centroTxt(l) ? `<div class="sub">${centroTxt(l)}</div>` : ''}${leadMissingCenter(l) ? `<div><button type="button" class="cm-tag-btn" data-lead-center="${l.id}" title="Aggiungi il nome del centro">${centerMissingTagHtml()}</button></div>` : ''}</td>
            <td class="crm-cell-center">${stPill(l.stato)}</td>
            <td class="crm-cell-center"><span class="nchip">${sv} svolt${sv === 1 ? 'o' : 'i'}</span></td>
            <td class="crm-cell-center">${azione}</td>
            <td class="crm-cell-center">${quando}</td>
            <td class="crm-cell-center">${esc(l.setter || '')}</td>
            <td class="crm-row-actions"><button class="btn-icon appt-more-btn" data-lead-more="${l.id}" title="Altre azioni" aria-label="Altre azioni per ${leadName(l)}">⋯</button></td></tr>`;
        }).join('')}</tbody></table>` : `<p class="text-dim">${leads().length ? 'Nessun lead con questo filtro.' : 'Ancora nessun lead. Crea il primo con "+ Nuovo lead".'}</p>`}
        ${orphans.length ? `<p class="text-dim ld-foot lead-orphans">${orphans.length} appuntament${orphans.length === 1 ? 'o' : 'i'} Venditore senza nome (non collegat${orphans.length === 1 ? 'o' : 'i'} a un lead). <button class="linkish" id="btnDelOrphans">Elimina</button></p>` : ''}
      </section>
      ${renderApptCalendar('venditore')}`;
    wireApptCalendar('venditore');
    document.getElementById('btnCallRecordings').addEventListener('click', openCallRecordingsModal);
    document.getElementById('btnLeadReport').addEventListener('click', generateVenditoreAppointmentsReport);
    document.getElementById('btnNewLead').addEventListener('click', openNewLead);
    document.getElementById('btnToggleLeadFilters').addEventListener('click', () => { setFiltersOpen(!filtersOpen()); renderLeadList(); });
    appRoot.querySelectorAll('[data-lf]').forEach(b => b.addEventListener('click', () => { ui.leadFilter = b.dataset.lf; renderLeadList(); }));
    const s = document.getElementById('leadSearch');
    if (s) s.addEventListener('input', () => {
      ui.search = s.value; const pos = s.selectionStart; renderLeadList();
      const s2 = document.getElementById('leadSearch'); s2.focus(); s2.setSelectionRange(pos, pos);
    });
    appRoot.querySelectorAll('[data-lead-more]').forEach(b => b.addEventListener('click', () => openLeadMenu(b.dataset.leadMore)));
    appRoot.querySelectorAll('[data-lead-center]').forEach(b => b.addEventListener('click', () => {
      const l = leadById(b.dataset.leadCenter); if (l) openCenterNameModal([centerTargetOf(l)], renderLeadList);
    }));
    const delOrph = document.getElementById('btnDelOrphans');
    if (delOrph) delOrph.addEventListener('click', () => showConfirm(`Eliminare ${orphans.length} appuntament${orphans.length === 1 ? 'o' : 'i'} Venditore senza nome?`, () => {
      const ids = new Set(orphans.map(a => a.id));
      removeVndAppts(ids); persist(); renderLeadList(); showToast('Eliminati.');
    }, { confirmLabel: 'Elimina' }));
    wireRowButtons(appRoot);
  }

  /** Menu ⋯ della riga in lista. */
  function openLeadMenu(leadId) {
    const l = leadById(leadId); if (!l) return;
    modal(`
      <h3>${leadName(l)}</h3>
      <p class="modal-sub">${STATO_LABEL[l.stato] || esc(l.stato)}${centroTxt(l) ? ' · ' + centroTxt(l) : ''}</p>
      <div class="lead-menu">
        <button class="btn-ghost" id="lmOpen">Apri la scheda</button>
        <button class="btn-ghost" id="lmAppt">+ Appuntamento</button>
        <button class="btn-danger-ghost" id="lmDel">🗑 Elimina lead</button>
      </div>
      <div class="modal-actions"><button class="btn-ghost" id="lmClose">Chiudi</button></div>
    `, box => {
      box.querySelector('#lmClose').addEventListener('click', closeModal);
      box.querySelector('#lmOpen').addEventListener('click', () => { closeModal(); ui.leadTab = 'storico'; location.hash = '#/lead/' + l.id; });
      box.querySelector('#lmAppt').addEventListener('click', () => openAddAppt(l.id));
      box.querySelector('#lmDel').addEventListener('click', () => openDeleteLead(l.id));
    });
  }

  /* ---------- "+ Nuovo lead": lead + primo appuntamento (prima solo dalla tabella) ---------- */
  function usedSetters() {
    const set = new Set();
    leads().forEach(l => { if (l.setter) set.add(l.setter); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }
  function openNewLead() {
    modal(`
      <h3>Nuovo lead</h3>
      <p class="modal-sub">Crea il lead e il suo primo appuntamento Venditore.</p>
      <label class="mblock" style="display:block"><span class="mlabel">Nome e cognome</span><input type="text" class="ld-input" id="nlName" maxlength="120" placeholder="Es. Lead Prova 1"></label>
      <div class="mrow">
        <label><span class="mlabel">Telefono (facoltativo)</span><input type="tel" class="ld-input" id="nlPhone" maxlength="40"></label>
        <label><span class="mlabel">Setter</span><input type="text" class="ld-input" id="nlSetter" maxlength="20" list="nlSetterList" placeholder="Es. MJ"><datalist id="nlSetterList">${usedSetters().map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>
      </div>
      <div class="mrow">
        <label><span class="mlabel">Giorno dell'appuntamento</span><input type="date" class="ld-input" id="nlDate" value="${workDay(1)}"></label>
        <label><span class="mlabel">Ora</span><input type="time" class="ld-input" id="nlTime" value=""></label>
      </div>
      <p class="mhint" id="nlSame" hidden></p>
      <div class="mwarn" id="nlWarn"></div>
      <div class="modal-actions"><button class="btn-ghost" id="nlCancel">Annulla</button><button class="btn-primary" id="nlSave">Crea lead</button></div>
    `, box => {
      const nameIn = box.querySelector('#nlName'), phoneIn = box.querySelector('#nlPhone');
      // Stesso nome o stesso telefono = stesso lead (regola di ensureLeads): l'appuntamento
      // va nella scheda di quello che c'è già, non si crea un doppione.
      const existing = () => {
        const n = normName(parseApptName(nameIn.value).name), k = phoneKey(phoneIn.value);
        return leads().find(l => (n && normName(l.name) === n) || (k && phoneKey(l.phone) === k)) || null;
      };
      const showSame = () => {
        const ex = existing(), el = box.querySelector('#nlSame');
        el.hidden = !ex;
        if (ex) el.innerHTML = `C'è già il lead <b>${leadName(ex)}</b> (${STATO_LABEL[ex.stato] || esc(ex.stato)}): l'appuntamento va nella sua scheda${ex.stato === 'Perso' || ex.stato === 'Freddo' ? ' e il lead torna In trattativa' : ''}.`;
      };
      nameIn.addEventListener('input', showSame); phoneIn.addEventListener('input', showSame);
      box.querySelector('#nlCancel').addEventListener('click', closeModal);
      box.querySelector('#nlSave').addEventListener('click', () => {
        const warn = box.querySelector('#nlWarn');
        const p = parseApptName(nameIn.value);
        const d = box.querySelector('#nlDate').value, t = box.querySelector('#nlTime').value;
        if (!p.name) { warn.textContent = 'Scrivi il nome del lead.'; nameIn.focus(); return; }
        if (!d || !t) { warn.textContent = 'Scegli giorno e ora dell\'appuntamento.'; return; }
        const setter = box.querySelector('#nlSetter').value.trim() || p.setter;
        const phone = phoneIn.value.trim();
        let l = existing();
        if (!l) { l = newLead({ name: p.name, setter, phone }); leads().push(l); addHistory(l, { k: 'stato', t: 'Lead creato', s: '' }); }
        else { if (!l.phone && phone) l.phone = phone; if (!l.setter && setter) l.setter = setter; }
        addApptToLead(l, d + 'T' + t, '');
        persist(); closeModal(); ui.leadTab = 'storico';
        location.hash = '#/lead/' + l.id; renderRoute();
        showToast('Lead salvato. Appuntamento per ' + fmtDT(d + 'T' + t) + '.');
      });
    });
  }

  /* ---------- "+ Appuntamento" dalla scheda lead (restyling 5.6) ----------
   * Crea un appuntamento Venditore del lead. Dalla scheda (o dal ⋯): Nuovo → In trattativa.
   * Da "+ Nuovo lead" il lead resta Nuovo (è il suo primo appuntamento). Su un lead Perso
   * o Freddo (anche da "+ Nuovo lead" con lo stesso nome) torna In trattativa. La prossima azione
   * diventa quell'appuntamento (l.next si svuota: la scheda e la lista mostrano
   * "📅 N° appuntamento"); un recupero no show aperto si chiude come risolto. */
  function addApptToLead(l, when, note) {
    const apt = createApptForLead(l, when);
    if (note) addHistory(l, { k: 'nota', t: 'Nota sull\'appuntamento del ' + fmtShort(when), s: note });
    l.next = null;
    l.fuNoAnswer = 0; // appuntamento fissato: il conto dei 6 follow-up riparte (Simone, 24/10)
    closeRecovery(l, 'resolved', apt.id);
    reopenLeadForAppt(l);
    return apt;
  }
  /** Nuovo appuntamento su un lead Perso o Freddo (Simone, 18/10/2026): il lead torna
   * "In trattativa", con una riga nello storico. Il conteggio dei follow-up senza risposta
   * riparte da 0 (scelta prudente: con 6 già segnati, il primo "non risponde" dopo
   * l'appuntamento lo rimanderebbe subito in Freddo). */
  function reopenLeadForAppt(l) {
    if (l.stato !== 'Perso' && l.stato !== 'Freddo') return;
    addHistory(l, { k: 'stato', t: 'Stato: In trattativa', s: 'riaperto con un nuovo appuntamento (era ' + STATO_LABEL[l.stato] + ')' });
    l.stato = 'Trattativa';
    l.fuNoAnswer = 0;
  }
  function openAddAppt(leadId) {
    const l = leadById(leadId); if (!l) return;
    modal(`
      <h3>Nuovo appuntamento · ${leadName(l)}</h3>
      <p class="modal-sub">Diventa la prossima azione del lead${l.stato === 'Nuovo' || l.stato === 'Perso' || l.stato === 'Freddo' ? ', che passa a In trattativa' : ''}.</p>
      <div class="mrow">
        <label><span class="mlabel">Giorno</span><input type="date" class="ld-input" id="naDate" value="${workDay(1)}"></label>
        <label><span class="mlabel">Ora</span><input type="time" class="ld-input" id="naTime" value=""></label>
      </div>
      <label class="mblock" style="display:block"><span class="mlabel">Nota (facoltativa)</span><input type="text" class="ld-input" id="naNote" maxlength="300" placeholder="Es. vuole vedere i risultati con il socio"></label>
      <div class="mwarn" id="naWarn"></div>
      <div class="modal-actions"><button class="btn-ghost" id="naCancel">Annulla</button><button class="btn-primary" id="naSave">Salva</button></div>
    `, box => {
      box.querySelector('#naCancel').addEventListener('click', closeModal);
      box.querySelector('#naSave').addEventListener('click', () => {
        const d = box.querySelector('#naDate').value, t = box.querySelector('#naTime').value;
        if (!d || !t) { box.querySelector('#naWarn').textContent = 'Scegli giorno e ora.'; return; }
        addApptToLead(l, d + 'T' + t, box.querySelector('#naNote').value.trim());
        if (l.stato === 'Nuovo') { addHistory(l, { k: 'stato', t: 'Stato: In trattativa', s: 'nuovo appuntamento' }); l.stato = 'Trattativa'; }
        persist(); rerender(); showToast('Appuntamento salvato per ' + fmtDT(d + 'T' + t) + '.');
      });
    });
  }

  /* ---------- Cancella lead (restyling 5.6, deciso da Simone: cancella TUTTO) ----------
   * Il lead, i suoi appuntamenti Venditore (con rate e soldi, quindi anche le commissioni)
   * e i riferimenti (voci del Round Recupero di quegli appuntamenti, collegamenti degli
   * spostati, apt.leadId). Gli appuntamenti Setter non si toccano, anche con lo stesso
   * nome. Online le righe spariscono da "lead" e "appuntamenti" (cloud-sync confronta
   * gli id). Task, Prossimi pagamenti e calendario si calcolano dai dati: spariscono da soli. */
  function removeVndAppts(ids) {
    db.appointments.filter(a => ids.has(a.id)).forEach(a => unlinkRescheduleOnDelete(a));
    db.appointments = db.appointments.filter(a => !ids.has(a.id));
    db.appointments.forEach(a => { if (a.linkedAppointmentId && ids.has(a.linkedAppointmentId)) a.linkedAppointmentId = null; });
    db.recoveryRound = (db.recoveryRound || []).filter(r => !ids.has(r.sourceAppointmentId));
    db.recoveryRound.forEach(r => { if (r.resolvedAppointmentId && ids.has(r.resolvedAppointmentId)) r.resolvedAppointmentId = null; });
  }
  function leadDeleteSummary(l) {
    const aps = vndAppts().filter(a => a.leadId === l.id);
    const comm = round2(aps.reduce((s, a) => s + sumEvents(commissionEventsForAppointment(a)), 0));
    return { aps, comm };
  }
  function openDeleteLead(leadId) {
    const l = leadById(leadId); if (!l) return;
    const { aps, comm } = leadDeleteSummary(l);
    const msg = `Elimini ${l.name || '(senza nome)'}, ${aps.length} appuntament${aps.length === 1 ? 'o' : 'i'} e ${fmtNumIt(comm, true)} di commissioni. Non si può annullare.`;
    modal(`
      <h3>Eliminare il lead?</h3>
      <p class="lead-del-msg" id="ldMsg">${esc(msg)}</p>
      <p class="mhint">Gli appuntamenti del Setting con lo stesso nome restano.</p>
      <div class="modal-actions"><button class="btn-ghost" id="ldCancel">Annulla</button><button class="btn-danger" id="ldOk">Elimina</button></div>
    `, box => {
      box.querySelector('#ldCancel').addEventListener('click', closeModal);
      box.querySelector('#ldOk').addEventListener('click', () => {
        removeVndAppts(new Set(aps.map(a => a.id)));
        db.leads = leads().filter(x => x.id !== l.id);
        persist(); closeModal();
        if (location.hash !== '#/venditore-lead') location.hash = '#/venditore-lead';
        renderRoute();
        showToast('Lead eliminato.');
      });
    });
  }

  /* ===================== Scheda lead ===================== */
  /** "✎ Modifica dati": nome, centro, città, telefono, mail, setter in una finestra. */
  function openEditLeadData(l, focus) {
    const F = [['name', 'Nome e cognome', ''], ['centro', 'Centro', ''], ['city', 'Città', ''], ['phone', 'Telefono', ''], ['email', 'Mail', ''], ['setter', 'Setter', 'Es. MJ, HS, GM, s, OB']];
    modal(`
      <h3>Dati del lead</h3>
      ${F.map(([k, lab, ph]) => `<label class="mblock" style="display:block"><span class="mlabel">${lab}</span><input type="text" class="ld-input" id="ed_${k}" value="${esc(l[k] || '')}" placeholder="${esc(ph || lab)}"></label>`).join('')}
      <div class="mwarn" id="edWarn"></div>
      <div class="modal-actions"><button class="btn-ghost" id="edCancel">Annulla</button><button class="btn-primary" id="edSave">Salva</button></div>
    `, box => {
      box.querySelector('#edCancel').addEventListener('click', closeModal);
      if (focus) box.querySelector('#ed_' + focus).focus();
      box.querySelector('#edSave').addEventListener('click', () => {
        const name = box.querySelector('#ed_name').value.trim();
        if (!name) { box.querySelector('#edWarn').textContent = 'Il nome non può essere vuoto.'; return; }
        F.forEach(([k]) => { l[k] = box.querySelector('#ed_' + k).value.trim(); });
        persist(); closeModal(); renderLead(l.id); showToast('Dati salvati.');
      });
    });
  }
  function renderLead(id) {
    if (ensureLeads()) persist();
    const l = leadById(id); if (!l) { location.hash = '#/venditore-lead'; return; }
    const tab = ui.leadTab;
    appRoot.innerHTML = `
      <div class="ld-top"><button class="ld-back" data-back="1">← Tutti i lead</button><button class="btn-icon ld-del-btn" id="leadDelete" title="Elimina il lead e i suoi appuntamenti" aria-label="Elimina il lead">🗑</button></div>
      <div class="lead-grid">
        <div class="lead-col">
          <section class="card ld-head">
            <div class="ld-head-top">
              <h2 class="ld-name">${leadName(l)}</h2>
              <select class="ld-input ld-auto ld-stato-select" id="leadStato" aria-label="Stato del lead">${STATI.map(s => `<option value="${s}" ${s === l.stato ? 'selected' : ''}>${STATO_LABEL[s]}</option>`).join('')}</select>
            </div>
            <div class="ld-head-line">${centroTxt(l) || '<span class="text-dim">Centro non segnato</span>'}${leadMissingCenter(l) ? ` <button type="button" class="cm-tag-btn" id="leadCenterTag" title="Scrivi il nome del centro">${centerMissingTagHtml()}</button>` : ''}</div>
            <div class="ld-head-line ld-phone">${l.phone ? `<a href="tel:${esc(String(l.phone).replace(/\s/g, ''))}">${esc(l.phone)}</a> <button class="copy-mini" id="leadCopy">copia</button>` : '<span class="text-dim">Nessun telefono</span>'}</div>
            <button class="linkish ld-edit-link" id="leadEditData">✎ Modifica dati</button>
          </section>
          ${apptsCardHtml(l)}
        </div>
        <div class="lead-col">
          <section class="card">
            <div class="sub-tabs inner">
              <button class="tf-tab ${tab === 'storico' ? 'active' : ''}" data-ltab="storico">Storico</button>
              <button class="tf-tab ${tab === 'pagamenti' ? 'active' : ''}" data-ltab="pagamenti">Pagamenti</button>
            </div>
            ${tab === 'pagamenti' ? payHtml(l) : `<div class="inline-add ld-note-add"><input type="text" class="ld-input" id="leadNoteText" placeholder="Scrivi una nota su questo lead"><button class="btn-ghost" id="leadNoteAdd">+ Nota</button></div>${histHtml(l)}`}
          </section>
        </div>
      </div>`;
    wireRowButtons(appRoot);
    appRoot.querySelector('[data-back]').addEventListener('click', () => { location.hash = '#/venditore-lead'; });
    appRoot.querySelectorAll('[data-ltab]').forEach(b => b.addEventListener('click', () => { ui.leadTab = b.dataset.ltab; renderLead(id); }));
    // Dati del lead dietro "✎ Modifica dati" (Simone, 24/10: L1). "centro mancante" apre la
    // stessa finestra sul campo Centro.
    document.getElementById('leadEditData').addEventListener('click', () => openEditLeadData(l));
    const cTag = document.getElementById('leadCenterTag');
    if (cTag) cTag.addEventListener('click', () => openEditLeadData(l, 'centro'));
    const copyBtn = document.getElementById('leadCopy');
    if (copyBtn) copyBtn.addEventListener('click', async () => {
      if (!l.phone) { showToast('Nessun numero da copiare.', true); return; }
      const ok = await copyToClipboard(l.phone); showToast(ok ? 'Numero copiato.' : 'Seleziona e copia il numero.', !ok);
    });
    document.getElementById('leadStato').addEventListener('change', e => {
      const v = e.target.value;
      // Prossima azione di prima anche qui (Simone, 19/10): aperto → Cliente / Perso / Freddo
      // a mano salva la copia; rimesso aperto, la prossima azione torna (se nessuno l'ha toccata).
      const wasOpen = isOpen(l);
      const copy = !wasOpen && APERTI.includes(v) ? prevNextFor(l, STATO_A_MANO) : null;
      if (wasOpen && !APERTI.includes(v)) savePrevNext(l, STATO_A_MANO);
      addHistory(l, { k: 'stato', t: 'Stato: ' + STATO_LABEL[v], s: 'cambiato a mano' });
      if (v === 'Follow-up' && l.stato !== 'Follow-up') { l.wasFollowUp = true; l.fuNoAnswer = 0; }
      l.stato = v; if (!APERTI.includes(v)) { l.next = null; closeRecovery(l); }
      if (wasOpen && !APERTI.includes(v)) markPrevNextAfter(l, STATO_A_MANO);
      else if (APERTI.includes(v) && l.prevNext && l.prevNext.apptId === STATO_A_MANO.id) {
        if (copy) {
          // Contatori di prima solo se torna lo stesso stato (Follow-up scelto ora riparte da 0).
          restorePrevNext(l, copy, v !== copy.stato);
          // Il round è stato chiuso con il cambio a mano: il recupero torna una Chiamata.
          if (l.next && l.next.type === 'recupero' && !recoveryEntryFor(l)) l.next = Object.assign({}, l.next, { type: 'chiamata' });
        }
        delete l.prevNext;
      }
      persist(); renderLead(id);
    });
    document.getElementById('leadDelete').addEventListener('click', () => openDeleteLead(l.id));
    wireApptsCard(l);
    if (tab === 'pagamenti') wirePay(l);
    else {
      const noteInput = document.getElementById('leadNoteText');
      const addNote = () => {
        const t = noteInput.value.trim(); if (!t) { noteInput.focus(); return; }
        addHistory(l, { k: 'nota', t: 'Nota', s: t });
        persist(); renderLead(id); showToast('Nota salvata.');
      };
      document.getElementById('leadNoteAdd').addEventListener('click', addNote);
      noteInput.addEventListener('keydown', e => { if (e.key === 'Enter') addNote(); });
    }
  }

  /* ---------- Appuntamenti nella scheda lead (restyling 5.6) ----------
   * Prima si gestivano nella tabella Appuntamenti Venditore (tolta): data e ora, stato
   * della trattativa (stesse regole: Spostato chiede la nuova data, Chiuso / Contratto
   * firmato chiedono il centro, il lead segue con onDealStageChanged), elimina, € per i
   * soldi del singolo appuntamento chiuso. "+ Appuntamento" ne crea uno nuovo. */
  /** Appuntamenti della scheda (Simone, 24/10: L3): una riga di testo per appuntamento,
   * "1° · ven 23/10 · 10:00 · esito". Data, esito, Pagamenti ed Elimina stanno nel ⋯
   * (openApptMenu), con le stesse regole di prima (wireApptControls). */
  function apptsCardHtml(l) {
    const list = apptsOf(l).slice().reverse(); // il più recente in alto
    const stageHtml = a => {
      if (a.dealStage) { const d = dealStageDef(a.dealStage); return `<span class="ap-stage" data-stage="${a.dealStage}">${esc(d ? d.label : a.dealStage)}</span>`; }
      return isDue(a) ? '<span class="late-tag">da esitare</span>' : '<span class="ap-stage">in arrivo</span>';
    };
    return `<section class="card ld-appts">
      <div class="card-label">Appuntamenti <button class="btn-ghost btn-sm" id="leadAddAppt">+ Appuntamento</button></div>
      ${list.length ? `<div class="ld-appt-rows">${list.map(a => `
        <div class="ld-appt-row ${a.dealStage === 'spostato' ? 'is-moved' : ''}">
          <span class="ld-appt-num">${a.dealStage === 'spostato' ? '—' : nOrd(apptNumber(a))}</span>
          <span class="ld-appt-date">${fmtDT(a.scheduledAt)}</span>
          ${stageHtml(a)}
          <button class="btn-icon ld-appt-menu" data-appt-menu="${a.id}" title="Cambia data o esito, pagamenti, elimina" aria-label="Opzioni dell'appuntamento">⋯</button>
        </div>`).join('')}</div>` : '<p class="text-dim ld-p">Nessun appuntamento.</p>'}
    </section>`;
  }
  function wireApptsCard(l) {
    document.getElementById('leadAddAppt').addEventListener('click', () => openAddAppt(l.id));
    appRoot.querySelectorAll('[data-appt-menu]').forEach(b => b.addEventListener('click', () => openApptMenu(l, b.dataset.apptMenu)));
  }
  /** ⋯ di un appuntamento: data e ora, esito (tendina colorata), € Pagamenti se chiuso, Elimina. */
  function openApptMenu(l, apptId, onDone) {
    const a = db.appointments.find(x => x.id === apptId); if (!a) return;
    const opts = `<option value="" ${!a.dealStage ? 'selected' : ''}>— Da impostare —</option>` +
      DEAL_STAGES.map(s => `<option value="${s.key}" ${a.dealStage === s.key ? 'selected' : ''}>${esc(s.label)}</option>`).join('');
    modal(`
      <h3>${a.dealStage === 'spostato' ? 'Appuntamento spostato' : nOrd(apptNumber(a)) + ' appuntamento'} · ${leadName(l)}</h3>
      <label class="mblock" style="display:block"><span class="mlabel">Data e ora</span><input type="datetime-local" class="ld-input" data-appt-when="${a.id}" value="${esc(String(a.scheduledAt || '').slice(0, 16))}"></label>
      <label class="mblock" style="display:block"><span class="mlabel">Esito</span><select class="ld-input deal-stage-select" data-stage="${a.dealStage || ''}" data-appt-stage="${a.id}">${opts}</select></label>
      <div class="modal-actions ld-menu-actions">
        <button class="btn-danger-ghost" data-appt-del="${a.id}">Elimina</button>
        ${isClosedAppt(a) ? `<button class="btn-ghost" data-appt-pay="${a.id}">€ Pagamenti</button>` : ''}
        <button class="btn-primary" id="apMenuClose">Chiudi</button>
      </div>
    `, box => {
      box.querySelector('#apMenuClose').addEventListener('click', closeModal);
      wireApptControls(l, box, onDone);
    });
  }
  /** Comandi di un appuntamento (dentro il ⋯): stesse regole della vecchia riga. */
  function wireApptControls(l, root, onDone) {
    const again = () => { closeModal(); if (onDone) { onDone(); return; } if (leadById(l.id)) renderLead(l.id); else { location.hash = '#/venditore-lead'; renderRoute(); } };
    const find = id => db.appointments.find(a => a.id === id);
    root.querySelectorAll('[data-appt-when]').forEach(inp => inp.addEventListener('change', () => {
      const a = find(inp.dataset.apptWhen); if (!a || !inp.value) return;
      // presentedAt segue la data se era uguale (statistiche e commissioni sul giorno giusto).
      if (a.presentedAt && a.presentedAt === a.scheduledAt) a.presentedAt = inp.value;
      a.scheduledAt = inp.value;
      persist(); again();
    }));
    root.querySelectorAll('[data-appt-stage]').forEach(sel => sel.addEventListener('change', () => {
      const a = find(sel.dataset.apptStage); if (!a) return;
      const v = sel.value;
      if (v === 'spostato') {
        if (a.dealStage === 'spostato') return;
        openRescheduleModal(a.id, again);
        sel.value = a.dealStage || ''; // finché non si salva resta com'era
        return;
      }
      const def = dealStageDef(v);
      const prev = a.dealStage || null; // per correggere un esito sbagliato (onDealStageChanged)
      if (def && def.isClosed && !a.closed) {
        openClosingDataModal(a, {
          defaultCentro: l.centro || '',
          onCancel: again,
          onSave: centro => {
            if (centro && !l.centro) l.centro = centro;
            applyDealStage(a, v);
            onDealStageChanged(a, prev);
            again();
          }
        });
        return;
      }
      applyDealStage(a, v || null);
      onDealStageChanged(a, prev);
      again();
    }));
    root.querySelectorAll('[data-appt-pay]').forEach(b => b.addEventListener('click', () => {
      closeModal(); ui.payApptId = b.dataset.apptPay; ui.leadTab = 'pagamenti'; location.hash = '#/lead/' + l.id; renderRoute();
    }));
    root.querySelectorAll('[data-appt-del]').forEach(b => b.addEventListener('click', () => {
      const a = find(b.dataset.apptDel); if (!a) return;
      const last = apptsOf(l).length === 1;
      showConfirm(`Eliminare l'appuntamento del ${fmtDT(a.scheduledAt)}?${last ? ' È l\'unico: sparisce anche il lead.' : ''}`, () => {
        unlinkRescheduleOnDelete(a);
        deactivateRecoveryEntryForAppointment(a);
        db.appointments = db.appointments.filter(x => x.id !== a.id);
        onApptDeleted(a); // lead rimasto senza appuntamenti: sparisce anche lui
        persist(); again();
      }, { confirmLabel: 'Elimina' });
    }));
  }

  /** Storico: appuntamenti (calcolati dai dati, sempre aggiornati) + azioni, stati, soldi. */
  function histHtml(l) {
    const aps = apptsOf(l).map(a => {
      const setter = setterOf(a);
      const notes = (a.notes || []).map(x => x.text).filter(Boolean);
      if (a.dealStage === 'spostato') {
        const to = a.rescheduledToId && db.appointments.find(x => x.id === a.rescheduledToId);
        return { d: a.scheduledAt, k: 'moved', t: 'Appuntamento ' + fmtDT(a.scheduledAt) + ' → spostato', s: to ? 'Nuova data: ' + fmtDT(to.scheduledAt) : '' };
      }
      const n = nOrd(apptNumber(a)) + ' appuntamento';
      let t;
      if (isPending(a)) t = n + ' · ' + (isDue(a) ? 'da esitare' : 'in arrivo');
      else if (a.dealStage === 'chiuso') t = n + ' · Presentato · CHIUSO';
      else if (a.dealStage === 'contratto_firmato') t = n + ' · Presentato · CONTRATTO FIRMATO';
      else if (a.dealStage === 'trattativa' || a.dealStage === 'perso') t = n + ' · Presentato · non chiuso';
      else t = n + ' · ' + ((stageDef(a) || {}).label || a.dealStage);
      if (a.dealStage === 'no_show' || a.dealStage === 'annullato') t = 'Appuntamento ' + fmtDT(a.scheduledAt) + ' · ' + stageDef(a).label;
      return { d: a.scheduledAt, k: 'appt', t, s: [setter ? 'Setter ' + setter : '', notes.join(' · ')].filter(Boolean).join(' · ') };
    });
    const all = aps.concat(l.history || []).filter(e => e.d).sort((a, b) => String(b.d).localeCompare(String(a.d)));
    return `<div class="tl">${all.map(e => `<div class="ev"><span class="dt">${fmtShort(String(e.d).slice(0, 10))}${String(e.d).length > 10 ? '<br>' + String(e.d).slice(11, 16) : ''}</span><span class="mk"><i class="k-${e.k === 'late' ? 'late' : e.k}"></i></span><div class="tx"><b>${esc(e.t)}</b>${e.s ? `<span class="s">${esc(e.s)}</span>` : ''}</div></div>`).join('') || '<p class="text-dim">Ancora niente.</p>'}</div>`;
  }

  /* ===================== Pagamenti (sui campi dell'appuntamento chiuso) ===================== */
  function payCalc(a) {
    const paidRate = (a.installments || []).filter(r => r.paid).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const incassato = (Number(a.cashCollected) || 0) + paidRate;
    const comm = sumEvents(commissionEventsForAppointment(a));
    return { incassato, daIncassare: Math.max(0, apptTotalSold(a) - incassato), comm };
  }
  /** Appuntamento chiuso mostrato in Pagamenti: quello scelto (€ nella lista appuntamenti
   * o tendina in alto), altrimenti l'ultimo chiuso (come prima). */
  function payAppt(l) {
    const closed = apptsOf(l).filter(isClosedAppt);
    return closed.find(a => a.id === ui.payApptId) || closed[closed.length - 1] || null;
  }
  function payHtml(l) {
    const a = payAppt(l);
    const closedAll = apptsOf(l).filter(isClosedAppt);
    if (!a) return `<p class="text-dim ld-p">Nessun appuntamento chiuso. Incassato e rate si segnano quando il lead chiude (Com'è finita? → Sì).</p>`;
    const c = payCalc(a); const rate = a.installments || [];
    return `
      ${closedAll.length > 1 ? `<label class="pay-which"><span class="mlabel">Appuntamento chiuso</span><select class="ld-input ld-small" id="payApptSel">${closedAll.map(x => `<option value="${x.id}" ${x.id === a.id ? 'selected' : ''}>${fmtDT(x.scheduledAt)} · ${x.dealStage === 'contratto_firmato' ? 'Contratto firmato' : 'Chiuso'}</option>`).join('')}</select></label>` : ''}
      <div class="pay-sum"><div class="ok"><b>${euro(c.incassato)}</b><span>Incassato</span></div><div><b>${euro(c.daIncassare)}</b><span>Da incassare</span></div><div><b>${euro(c.comm)}</b><span>Commissione 10%</span></div></div>
      <div class="pay-form">
        <label class="pay-centro">Nome del centro<input type="text" class="ld-input" id="payCentro" maxlength="120" value="${esc(a.centerName || '')}" placeholder="${esc(l.centro || 'Nome del centro')}"></label>
        <label>Totale venduto<input type="number" min="0" step="50" class="ld-input" id="payTotal" value="${Number(a.totalSold) || 0}"></label>
        <label>Cash collected<input type="number" min="0" step="50" class="ld-input" id="payCash" value="${Number(a.cashCollected) || 0}"></label>
        <label>Incassato il<span class="ld-static">${fmtShort(String(appointmentCashDate(a)).slice(0, 10))} (giorno della call)</span></label>
      </div>
      <div class="crm-table-wrap"><table class="rate-tbl"><thead><tr><th>Rata</th><th>Importo</th><th>Scadenza</th><th>Pagata</th><th>Pagata il</th><th></th></tr></thead><tbody>
        ${rate.length ? rate.map((r, i) => { const over = !r.paid && r.dueDate && r.dueDate < TODAY(); return `<tr class="${r.paid ? 'paid' : ''}"><td>${esc(r.label || 'Rata ' + (i + 1))}</td><td>${euro(r.amount)}</td><td class="${over ? 'over' : ''}">${r.dueDate ? fmtShort(r.dueDate) : '—'}${over ? ' · scaduta' : ''}</td><td><input type="checkbox" data-rate="${r.id}" ${r.paid ? 'checked' : ''} aria-label="Rata ${i + 1} pagata"></td><td>${r.paidDate ? fmtShort(r.paidDate) : ''}</td><td><button class="crm-row-del" data-delrate="${r.id}" title="Elimina rata">×</button></td></tr>`; }).join('') : '<tr><td colspan="6" class="text-dim">Nessuna rata.</td></tr>'}
      </tbody></table></div>
      <div class="inline-add"><input type="number" min="0" step="50" class="ld-input" id="rateAmt" placeholder="Importo rata"><input type="date" class="ld-input" id="rateDue" value="${workDay(20)}"><button class="btn-ghost" id="rateAdd">+ Rata</button></div>
      <p class="text-dim ld-foot">${a.dealStage === 'contratto_firmato' ? 'Contratto firmato. ' : ''}Commissione: 10% dell'incassato. Le rate contano solo quando le spunti, nel giorno in cui sono state pagate. Dati dell'appuntamento del ${fmtDT(a.scheduledAt)}.</p>`;
  }
  function wirePay(l) {
    const a = payAppt(l); if (!a) return;
    const id = l.id;
    const which = document.getElementById('payApptSel');
    if (which) which.addEventListener('change', () => { ui.payApptId = which.value; renderLead(id); });
    const num = v => Math.max(0, Number(v) || 0);
    // Nome del centro dell'appuntamento chiuso (Prossimi pagamenti in Dashboard).
    document.getElementById('payCentro').addEventListener('change', e => {
      a.centerName = e.target.value.trim();
      if (a.centerName && !l.centro) l.centro = a.centerName;
      persist(); renderLead(id);
    });
    document.getElementById('payTotal').addEventListener('change', e => { a.totalSold = num(e.target.value); persist(); renderLead(id); });
    document.getElementById('payCash').addEventListener('change', e => {
      const v = num(e.target.value);
      if (v !== (Number(a.cashCollected) || 0)) addHistory(l, { k: 'soldi', t: 'Cash collected ' + euro(v), s: '' });
      a.cashCollected = v; persist(); renderLead(id);
    });
    appRoot.querySelectorAll('[data-rate]').forEach(c => c.addEventListener('change', () => {
      const r = (a.installments || []).find(x => x.id === c.dataset.rate); if (!r) return;
      r.paid = c.checked; r.paidDate = c.checked ? TODAY() : null;
      if (c.checked) addHistory(l, { k: 'soldi', t: 'Rata pagata ' + euro(r.amount), s: '' });
      persist(); renderLead(id);
    }));
    appRoot.querySelectorAll('[data-delrate]').forEach(b => b.addEventListener('click', () => {
      showConfirm('Eliminare questa rata?', () => { a.installments = (a.installments || []).filter(x => x.id !== b.dataset.delrate); persist(); renderLead(id); }, { confirmLabel: 'Elimina' });
    }));
    document.getElementById('rateAdd').addEventListener('click', () => {
      const v = num(document.getElementById('rateAmt').value); const d = document.getElementById('rateDue').value;
      if (!v || !d) { showToast('Scrivi importo e scadenza.', true); return; }
      a.installments = a.installments || [];
      a.installments.push({ id: uid('rata'), label: 'Rata ' + (a.installments.length + 1), amount: v, dueDate: d, paid: false, paidDate: null });
      persist(); renderLead(id);
    });
  }

  /* ===================== Numeri nuovi (in Venditore → Statistiche) ===================== */
  /** Numeri dei lead nel periodo (show rate 2° appuntamento, chiuse in follow-up,
   * follow-up in tempo/in ritardo). Dal 16/10 li mostra la Dashboard sotto Obiettivi Venditore. */
  function newStatsValues(range) {
    if (ensureLeads()) persist();
    const inR = v => !range || (v && inRange(v, range));
    const A = vndAppts().filter(a => a.leadId && leadById(a.leadId) && a.dealStage && a.dealStage !== 'spostato' && inR(a.scheduledAt));
    const second = A.filter(a => apptNumber(a) >= 2 && (isSvolto(a) || a.dealStage === 'no_show'));
    const p2 = second.filter(a => a.dealStage !== 'no_show').length, n2 = second.filter(a => a.dealStage === 'no_show').length;
    const show2 = p2 + n2 ? Math.round(p2 / (p2 + n2) * 100) : 0;
    const clienti = leads().filter(l => l.stato === 'Cliente' && (() => { const c = lastClosedAppt(l); return !range || (c && inR(c.scheduledAt)); })());
    const cFu = clienti.filter(l => l.wasFollowUp).length;
    const pctFu = clienti.length ? Math.round(cFu / clienti.length * 100) : 0;
    return { show2, p2, n2, pctFu, cFu, clienti: clienti.length };
  }

  function renderNewStatsSection(range) {
    const { show2, p2, n2, pctFu, cFu, clienti } = newStatsValues(range);
    return `
      <section class="card">
        <h3 class="ld-h3">Numeri dei lead</h3>
        <div class="new-stats">
          <div class="nstat"><span class="lab">Show rate 2° appuntamento</span><span class="val">${show2}%</span><div class="meter"><i class="ok" style="width:${show2}%"></i></div><span class="formula">${p2} presentati ÷ (${p2} presentati + ${n2} no show) dal 2° appuntamento in poi</span></div>
          <div class="nstat"><span class="lab">Chiuse in follow-up</span><span class="val">${pctFu}%</span><div class="meter"><i style="width:${pctFu}%"></i></div><span class="formula">${cFu} clienti passati da Follow-up ÷ ${clienti} clienti</span></div>
        </div>
      </section>`;
  }

  /* ===================== Appuntamento cancellato (bug 16/10) ===================== */
  /** Da chiamare DOPO aver tolto l'appuntamento da db.appointments: se il lead non ha più
   * appuntamenti, sparisce anche lui (prima restava un lead "a 0 appuntamenti"). */
  function onApptDeleted(apt) {
    if (!apt || apt.role !== 'venditore' || !apt.leadId) return;
    const l = leadById(apt.leadId); if (!l) return;
    if (!apptsOf(l).length) db.leads = leads().filter(x => x.id !== l.id);
  }

  /* ===================== Prossimi pagamenti (Dashboard, restyling step 7) ===================== */
  /** Rata spuntata "Pagato" fuori dalla scheda (Dashboard): stessa riga di storico della scheda. */
  function onInstallmentPaid(a, r) {
    const l = a && a.leadId && leadById(a.leadId); if (!l || !r) return;
    addHistory(l, { k: 'soldi', t: 'Rata pagata ' + euro(r.amount), s: '' });
  }

  /** Per il report Appuntamenti Venditore: prossima azione e ultima nota del lead. */
  function reportInfo(a) {
    const l = a.leadId && leadById(a.leadId); if (!l) return {};
    const notes = (l.history || []).filter(h => h.k === 'nota' && h.s);
    return {
      next: l.next ? actDef(l.next).l + ' · ' + fmtShort(l.next.date) + (l.next.time ? ' ' + l.next.time : '') : '',
      lastNote: notes.length ? notes[notes.length - 1].s : ''
    };
  }

  /* ===================== 👤 Account: interruttore Parte Venditore ===================== */
  function accountToggleHtml() {
    const on = isOn();
    return `<div class="setrow"><div><b>Parte Venditore</b><p>Voce Venditore, azioni dei lead nelle Task della Dashboard.</p></div><button type="button" class="tog ${on ? '' : 'off'}" id="togVenditore" aria-pressed="${on}" aria-label="Parte Venditore"></button></div>
      <p class="mhint">Ogni utente ha il suo interruttore. Spegnere nasconde e basta: i dati restano.</p>`;
  }
  function wireAccountToggle() {
    const t = document.getElementById('togVenditore'); if (!t) return;
    t.addEventListener('click', () => {
      db.settings.venditoreOn = !isOn();
      t.classList.toggle('off', !isOn()); t.setAttribute('aria-pressed', isOn());
      persist(); applyNav(); renderRoute();
      showToast(isOn() ? 'Parte Venditore accesa.' : 'Parte Venditore spenta.');
    });
  }
  /** Nasconde o mostra la voce Venditore nella barra laterale. */
  function applyNav() {
    document.querySelectorAll('[data-venditore-only]').forEach(el => { el.hidden = !isOn(); });
  }

  return {
    isOn, applyNav, ensureLeads, dashboardTaskItems, renderLeadList, renderLead, renderNewStatsSection, newStatsValues,
    wireRowButtons, accountToggleHtml, wireAccountToggle,
    parseApptName, onRecoveryOutcome, addApptFromRecovery, reportInfo, onInstallmentPaid
  };
})();
