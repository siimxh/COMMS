/* cloud-sync.js — login e salvataggio dei dati sul database Supabase.
 *
 * Niente librerie: parla direttamente con le API di Supabase (Auth + REST) con
 * fetch. Indirizzo e chiave pubblica in supabase-config.js, tabelle e regole in
 * supabase/schema.sql.
 *
 * Come salva:
 * - Il tool lavora sempre sull'oggetto `db` in memoria e lo salva subito nel
 *   browser (copia locale, una per utente). Così funziona anche senza rete.
 * - Dopo ogni modifica (persist), con un piccolo ritardo, manda al database SOLO
 *   le righe cambiate: appuntamenti e sessioni una riga ciascuno, il resto
 *   (pipeline, sessione in corso, da richiamare, obiettivi, tema...) nella riga
 *   unica "stato". I lead della parte Venditore (lead.js) vanno nella tabella
 *   "lead", una riga per lead; finché quella tabella non esiste nel database
 *   restano dentro "stato" e ci passano da soli appena viene creata.
 *   Per capire cosa è cambiato tiene un'impronta (hash) di ogni riga già
 *   salvata online.
 * - Se la rete manca o il salvataggio fallisce, riprova da solo (ogni 15 secondi
 *   e appena torna la rete). Le impronte stanno nel browser, quindi anche
 *   chiudendo la pagina le modifiche non ancora inviate partono alla riapertura.
 * - Spia in alto: "Salvato" / "Salvataggio…" / "In attesa di rete".
 *
 * Date: nel tool restano nei formati di sempre. Solo qui, al confine col
 * database, gli orari "locali" senza fuso (scheduledAt, presentedAt, es.
 * "2026-10-14T15:30") diventano istanti precisi letti come ora italiana, e
 * tornano indietro nello stesso formato.
 */

const CLOUD_SESSION_KEY = 'chiamateTrackerAuth_v1';
const CLOUD_SYNCED_PREFIX = 'chiamateTrackerSynced_v1__';
const CLOUD_DEBOUNCE_MS = 1200;
const CLOUD_RETRY_MS = 15000;
const CLOUD_BATCH = 25;

/* ---------- Conversione date al confine col database ---------- */

/** "2026-10-14T15:30" (ora del browser, cioè italiana) -> ISO UTC. null se vuoto o non valido. */
function cloudLocalToIso(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Istante dal database -> "2026-10-14T15:30" in ora del browser. */
function cloudIsoToLocal(v) {
  if (!v) return null;
  return localDateTimeValue(new Date(v));
}

/** Istante con fuso (createdAt, closedAt, startedAt...) -> ISO UTC, come li salva il tool. */
function cloudIsoNorm(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Data semplice "AAAA-MM-GG" (o null). */
function cloudDateOnly(v) {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/* ---------- Righe del database <-> oggetti del tool ---------- */

// Campi dell'appuntamento che hanno una colonna propria. Tutto il resto va in "extra".
const APPT_FIELDS = ['id', 'role', 'clientName', 'phone', 'createdAt', 'scheduledAt', 'presentedStatus',
  'presentedAt', 'closed', 'closedAt', 'dealStage', 'cashCollected', 'totalSold', 'installments', 'notes',
  'nextFollowUpDate', 'linkedAppointmentId', 'rescheduledFromId', 'rescheduledToId',
  'recoveredFromNoShow', 'recoveredFromRole'];

function apptToRow(a, userId) {
  const extra = {};
  Object.keys(a).forEach(k => { if (!APPT_FIELDS.includes(k)) extra[k] = a[k]; });
  // Un valore che il database non saprebbe leggere (data non valida, ruolo
  // sconosciuto, numero strano) resta com'era dentro "extra": così non si perde
  // e torna identico alla rilettura.
  const keepRaw = (field, ok) => { if (!ok && a[field] != null && a[field] !== '') extra[field] = a[field]; };

  const scheduledAt = cloudLocalToIso(a.scheduledAt);   keepRaw('scheduledAt', scheduledAt);
  const presentedAt = cloudLocalToIso(a.presentedAt);   keepRaw('presentedAt', presentedAt);
  const createdAt = cloudIsoNorm(a.createdAt);          keepRaw('createdAt', createdAt);
  const closedAt = cloudIsoNorm(a.closedAt);            keepRaw('closedAt', closedAt);
  const followUp = cloudDateOnly(a.nextFollowUpDate);   keepRaw('nextFollowUpDate', followUp);
  const role = a.role === 'venditore' ? 'venditore' : 'setter';
  keepRaw('role', a.role === role);
  const cash = Number(a.cashCollected);                 keepRaw('cashCollected', Number.isFinite(cash));
  const sold = Number(a.totalSold);                     keepRaw('totalSold', Number.isFinite(sold));

  return {
    user_id: userId,
    id: a.id,
    role,
    client_name: a.clientName || '',
    phone: a.phone ?? null,
    created_at: createdAt || new Date().toISOString(),
    scheduled_at: scheduledAt,
    presented_status: a.presentedStatus ?? null,
    presented_at: presentedAt,
    closed: !!a.closed,
    closed_at: closedAt,
    deal_stage: a.dealStage ?? null,
    cash_collected: Number.isFinite(cash) ? cash : 0,
    total_sold: Number.isFinite(sold) ? sold : 0,
    installments: Array.isArray(a.installments) ? a.installments : [],
    notes: Array.isArray(a.notes) ? a.notes : [],
    next_follow_up_date: followUp,
    linked_appointment_id: a.linkedAppointmentId ?? null,
    rescheduled_from_id: a.rescheduledFromId ?? null,
    rescheduled_to_id: a.rescheduledToId ?? null,
    recovered_from_no_show: !!a.recoveredFromNoShow,
    recovered_from_role: a.recoveredFromRole ?? null,
    extra
  };
}

function rowToAppt(r) {
  const a = {
    id: r.id,
    createdAt: cloudIsoNorm(r.created_at),
    role: r.role,
    clientName: r.client_name || '',
    phone: r.phone,
    scheduledAt: cloudIsoToLocal(r.scheduled_at),
    presentedStatus: r.presented_status,
    presentedAt: cloudIsoToLocal(r.presented_at),
    closed: !!r.closed,
    closedAt: cloudIsoNorm(r.closed_at),
    cashCollected: Number(r.cash_collected) || 0,
    totalSold: Number(r.total_sold) || 0,
    installments: r.installments || [],
    linkedAppointmentId: r.linked_appointment_id,
    dealStage: r.deal_stage,
    notes: r.notes || [],
    nextFollowUpDate: r.next_follow_up_date,
    recoveredFromNoShow: !!r.recovered_from_no_show,
    recoveredFromRole: r.recovered_from_role,
    rescheduledFromId: r.rescheduled_from_id,
    rescheduledToId: r.rescheduled_to_id
  };
  return Object.assign(a, r.extra || {});
}

const SESSION_FIELDS = ['id', 'number', 'pipelineId', 'pipelineName', 'startedAt', 'endedAt', 'pausedTotalMs', 'calls'];

function sessionToRow(s, userId) {
  const extra = {};
  Object.keys(s).forEach(k => { if (!SESSION_FIELDS.includes(k)) extra[k] = s[k]; });
  const startedAt = cloudIsoNorm(s.startedAt);
  const endedAt = cloudIsoNorm(s.endedAt);
  if (!startedAt && s.startedAt) extra.startedAt = s.startedAt;
  if (!endedAt && s.endedAt) extra.endedAt = s.endedAt;
  // pausedTotalMs non c'è nelle sessioni senza pause: lo segniamo per non aggiungerlo alla rilettura.
  if (!('pausedTotalMs' in s)) extra.__noPausedTotalMs = true;
  const number = Number.isInteger(s.number) ? s.number : null;
  if (number === null && s.number != null) extra.number = s.number;
  return {
    user_id: userId,
    id: s.id,
    number,
    pipeline_id: s.pipelineId ?? null,
    pipeline_name: s.pipelineName ?? null,
    started_at: startedAt,
    ended_at: endedAt,
    paused_total_ms: Math.round(Number(s.pausedTotalMs) || 0),
    calls: Array.isArray(s.calls) ? s.calls : [],
    extra
  };
}

function rowToSession(r) {
  const extra = Object.assign({}, r.extra || {});
  const s = {
    id: r.id,
    number: r.number,
    pipelineId: r.pipeline_id,
    pipelineName: r.pipeline_name,
    startedAt: cloudIsoNorm(r.started_at),
    endedAt: cloudIsoNorm(r.ended_at),
    calls: r.calls || []
  };
  if (extra.__noPausedTotalMs) delete extra.__noPausedTotalMs;
  else s.pausedTotalMs = Number(r.paused_total_ms) || 0;
  return Object.assign(s, extra);
}

/** Tutto quello che non è appuntamenti o sessioni concluse va nella riga "stato".
 * Anche i lead, ma solo se la tabella "lead" non c'è ancora (vedi CloudSync.leadTable). */
function dbToState(data) {
  const st = Object.assign({}, data);
  delete st.appointments;
  delete st.sessions;
  if (CloudSync.leadTable) delete st.leads;
  return st;
}

/* ---------- Impronte (hash) per capire cosa è cambiato ---------- */

function cloudHash(obj) {
  // cyrb53: veloce, 53 bit, più che sufficiente per riconoscere una riga cambiata.
  const str = JSON.stringify(obj) || '';
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function cloudFingerprints(data) {
  const a = {}, s = {}, l = {};
  (data.appointments || []).forEach(x => { a[x.id] = cloudHash(x); });
  (data.sessions || []).forEach(x => { s[x.id] = cloudHash(x); });
  if (CloudSync.leadTable) (data.leads || []).forEach(x => { l[x.id] = cloudHash(x); });
  return { a, s, l, st: cloudHash(dbToState(data)) };
}

/* ---------- Client Supabase minimo (Auth + REST) ---------- */

class CloudError extends Error {
  constructor(message, status, offline) {
    super(message);
    this.status = status;
    this.offline = !!offline;
  }
}

const CloudSync = {
  session: null,        // { access_token, refresh_token, expires_at, user: { id, email } }
  synced: null,         // impronte dell'ultima versione salvata online
  status: 'idle',       // saved | saving | pending
  _timer: null,
  _retryTimer: null,
  _flushing: null,
  _again: false,
  getData: null,        // funzione che restituisce il db corrente (impostata da app.js)
  leadTable: false,     // true se nel database c'è la tabella "lead" (si scopre al pull)
  _leadsToMove: false,  // true se i lead stanno ancora in "stato" e vanno spostati nella tabella
  onStatus: null,       // callback per la spia in topbar

  /* --- Sessione di login --- */

  loadSession() {
    try {
        const raw = localStorage.getItem(CLOUD_SESSION_KEY);
        this.session = raw ? JSON.parse(raw) : null;
      } catch (e) {
        this.session = null;
      }
      return this.session;
    },

    _saveSession(s) {
      this.session = s;
      if (s) localStorage.setItem(CLOUD_SESSION_KEY, JSON.stringify(s));
      else localStorage.removeItem(CLOUD_SESSION_KEY);
    },

    _storeAuthResponse(json) {
      this._saveSession({
        access_token: json.access_token,
        refresh_token: json.refresh_token,
        expires_at: json.expires_at || (Math.floor(Date.now() / 1000) + (json.expires_in || 3600)),
        user: { id: json.user.id, email: json.user.email }
      });
    },

    async _fetch(url, opts) {
      try {
        return await fetch(url, opts);
      } catch (e) {
        throw new CloudError('Rete non disponibile', 0, true);
      }
    },

    async signIn(email, password) {
      const res = await this._fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new CloudError(json.error_description || json.msg || 'Login non riuscito', res.status);
      this._storeAuthResponse(json);
      return this.session.user;
    },

    async _refresh() {
      if (!this.session || !this.session.refresh_token) throw new CloudError('Sessione scaduta', 401);
      const res = await this._fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: this.session.refresh_token })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Refresh token non più valido (es. password cambiata): serve un nuovo login.
        if (res.status === 400 || res.status === 401) throw new CloudError('Sessione scaduta', 401);
        throw new CloudError('Rinnovo sessione non riuscito', res.status);
      }
      this._storeAuthResponse(json);
    },

    async _token() {
      if (!this.session) throw new CloudError('Non hai fatto login', 401);
      if (this.session.expires_at - 60 < Date.now() / 1000) await this._refresh();
      return this.session.access_token;
    },

    async signOut() {
      const s = this.session;
      this._saveSession(null);
      if (s) {
        try {
          await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
            method: 'POST',
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${s.access_token}` }
          });
        } catch (e) { /* senza rete il token scade da solo */ }
      }
    },

    /** Chiamata REST con rinnovo automatico del token (una volta) se scaduto. */
    async _rest(method, path, body, extraHeaders) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const token = await this._token();
        const res = await this._fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
          method,
          headers: Object.assign({
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }, extraHeaders || {}),
          body: body === undefined ? undefined : JSON.stringify(body)
        });
        if (res.status === 401 && attempt === 0) { await this._refresh(); continue; }
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new CloudError(`Errore database (${res.status}): ${txt.slice(0, 300)}`, res.status);
        }
        if (res.status === 204) return null;
        const txt = await res.text();
        return txt ? JSON.parse(txt) : null;
      }
    },

    async _selectAll(table, order) {
      const out = [];
      const page = 500;
      for (let from = 0; ; from += page) {
        const rows = await this._rest('GET', `${table}?select=*&order=${order}`, undefined,
          { Range: `${from}-${from + page - 1}`, 'Range-Unit': 'items' });
        out.push(...(rows || []));
        if (!rows || rows.length < page) return out;
      }
    },

    async _upsert(table, rows, conflict) {
      for (let i = 0; i < rows.length; i += CLOUD_BATCH) {
        await this._rest('POST', `${table}?on_conflict=${conflict}`, rows.slice(i, i + CLOUD_BATCH),
          { Prefer: 'resolution=merge-duplicates,return=minimal' });
      }
    },

    async _deleteIds(table, ids) {
      for (let i = 0; i < ids.length; i += CLOUD_BATCH) {
        const list = ids.slice(i, i + CLOUD_BATCH).map(id => '"' + String(id).replace(/["\\]/g, '\\$&') + '"').join(',');
        await this._rest('DELETE', `${table}?id=in.(${encodeURIComponent(list)})`, undefined, { Prefer: 'return=minimal' });
      }
    },

    /* --- Dati --- */

    _syncedKey() { return CLOUD_SYNCED_PREFIX + this.session.user.id; },

    _loadSynced() {
      try {
        const raw = localStorage.getItem(this._syncedKey());
        this.synced = raw ? JSON.parse(raw) : null;
      } catch (e) {
        this.synced = null;
      }
      // Fino al prossimo pull vale quello che si sapeva all'ultimo salvataggio.
      this.leadTable = !!(this.synced && this.synced.leadTable);
    },

    _saveSynced() {
      if (this.synced) this.synced.leadTable = this.leadTable;
      try { localStorage.setItem(this._syncedKey(), JSON.stringify(this.synced)); } catch (e) { /* non bloccante */ }
    },

    /** Scarica tutti i dati dell'utente. null se online non c'è ancora niente (primo login). */
    async pull() {
      const [stato, appts, sessions, leadRows] = await Promise.all([
        this._rest('GET', 'stato?select=data'),
        this._selectAll('appuntamenti', 'created_at.asc,id.asc'),
        this._selectAll('sessioni', 'started_at.asc,id.asc'),
        this._selectLeads()
      ]);
      this.leadTable = leadRows !== null;
      this._leadsToMove = false;
      if (!stato || !stato.length) return null;
      const data = Object.assign({}, stato[0].data || {}, {
        appointments: appts.map(rowToAppt),
        sessions: sessions.map(rowToSession)
      });
      if (this.leadTable) {
        const fromState = Array.isArray(data.leads) ? data.leads : [];
        if (leadRows.length || !fromState.length) data.leads = leadRows.map(r => r.data);
        else this._leadsToMove = true; // tabella appena creata: i lead sono ancora in "stato"
      }
      return data;
    },

    /** Righe della tabella "lead", oppure null se la tabella non esiste ancora. */
    async _selectLeads() {
      try {
        return await this._selectAll('lead', 'id.asc');
      } catch (e) {
        if (e.status === 404) return null;
        throw e;
      }
    },

    /** Dopo un pull: la versione appena scaricata è quella salvata online. */
    markSynced(data) {
      this.synced = cloudFingerprints(data);
      // Lead ancora dentro "stato": li segniamo come "non salvati" nella tabella, così
      // partono al prossimo invio, e "stato" viene riscritto senza di loro.
      if (this._leadsToMove) { this.synced.l = {}; this.synced.st = null; this._leadsToMove = false; }
      this._saveSynced();
    },

    /** true se nella copia locale ci sono modifiche non ancora inviate. */
    hasPending(data) {
      if (!this.synced) return true;
      const fp = cloudFingerprints(data);
      if (fp.st !== this.synced.st) return true;
      for (const k of ['a', 's', 'l']) {
        const cur = fp[k], old = this.synced[k] || {};
        if (Object.keys(cur).some(id => cur[id] !== old[id])) return true;
        if (Object.keys(old).some(id => !(id in cur))) return true;
      }
      return false;
    },

    /** Da chiamare dopo ogni modifica: invia le righe cambiate dopo un piccolo ritardo. */
    schedule() {
      if (!this.session) return;
      this._setStatus('saving');
      clearTimeout(this._timer);
      this._timer = setTimeout(() => this.flush(), CLOUD_DEBOUNCE_MS);
    },

    /** Invia subito le righe cambiate. Restituisce true se online è tutto allineato. */
    async flush() {
      clearTimeout(this._timer);
      // getData() è null finché i dati dell'utente non sono caricati: niente da inviare.
      if (!this.session || !this.getData || !this.getData()) return false;
      if (this._flushing) { this._again = true; return this._flushing; }
      this._flushing = (async () => {
        try {
          await this._pushChanges(this.getData());
          clearTimeout(this._retryTimer);
          return true;
        } catch (e) {
          if (e.status === 401 && !e.offline) {
            console.error('Sessione scaduta: serve un nuovo login', e);
            this._setStatus('pending');
            if (typeof onCloudSessionExpired === 'function') onCloudSessionExpired();
            return false;
          }
          console.error('Salvataggio online non riuscito, riprovo', e);
          this._setStatus('pending');
          clearTimeout(this._retryTimer);
          this._retryTimer = setTimeout(() => this.flush(), CLOUD_RETRY_MS);
          return false;
        }
      })();
      const ok = await this._flushing;
      this._flushing = null;
      if (this._again) { this._again = false; return this.flush(); }
      if (ok) this._setStatus(this.hasPending(this.getData()) ? 'saving' : 'saved');
      return ok;
    },

    async _pushChanges(data) {
      const uid = this.session.user.id;
      const fp = cloudFingerprints(data);
      // Le impronte si aggiornano passo per passo: se un invio fallisce a metà,
      // quello già arrivato online non viene rimandato al prossimo tentativo.
      if (!this.synced) this.synced = { a: {}, s: {}, l: {}, st: null };
      const old = this.synced;
      if (!old.l) old.l = {};

      const changedA = (data.appointments || []).filter(x => fp.a[x.id] !== old.a[x.id]);
      const changedS = (data.sessions || []).filter(x => fp.s[x.id] !== old.s[x.id]);
      const changedL = this.leadTable ? (data.leads || []).filter(x => fp.l[x.id] !== old.l[x.id]) : [];
      const deletedA = Object.keys(old.a).filter(id => !(id in fp.a));
      const deletedS = Object.keys(old.s).filter(id => !(id in fp.s));
      const deletedL = this.leadTable ? Object.keys(old.l).filter(id => !(id in fp.l)) : [];
      const stateChanged = fp.st !== old.st;

      if (!changedA.length && !changedS.length && !changedL.length && !deletedA.length && !deletedS.length && !deletedL.length && !stateChanged) return;

      try {
      // Ordine: prima i lead nuovi (se stanno passando da "stato" alla tabella non
      // devono mai mancare in tutti e due i posti), poi stato, poi le altre righe.
      if (changedL.length) {
        await this._upsert('lead', changedL.map(x => ({ user_id: uid, id: x.id, data: x })), 'user_id,id');
        changedL.forEach(x => { old.l[x.id] = fp.l[x.id]; });
      }
      if (stateChanged) {
        await this._upsert('stato', [{ user_id: uid, data: dbToState(data) }], 'user_id');
        old.st = fp.st;
      }
      if (changedA.length) {
        await this._upsert('appuntamenti', changedA.map(x => apptToRow(x, uid)), 'user_id,id');
        changedA.forEach(x => { old.a[x.id] = fp.a[x.id]; });
      }
      if (changedS.length) {
        await this._upsert('sessioni', changedS.map(x => sessionToRow(x, uid)), 'user_id,id');
        changedS.forEach(x => { old.s[x.id] = fp.s[x.id]; });
      }
      if (deletedA.length) {
        await this._deleteIds('appuntamenti', deletedA);
        deletedA.forEach(id => { delete old.a[id]; });
      }
      if (deletedS.length) {
        await this._deleteIds('sessioni', deletedS);
        deletedS.forEach(id => { delete old.s[id]; });
      }
      if (deletedL.length) {
        await this._deleteIds('lead', deletedL);
        deletedL.forEach(id => { delete old.l[id]; });
      }
    } finally {
      this._saveSynced();
    }
  },

  _setStatus(st) {
    this.status = st;
    if (typeof this.onStatus === 'function') this.onStatus(st);
  }
};

window.addEventListener('online', () => { if (CloudSync.session) CloudSync.flush(); });
