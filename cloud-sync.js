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
 * - Due dispositivi (CORREZIONE 18/10, bug 1): la riga "stato" porta dentro i dati
 *   un numero di versione `_rev`, nuovo a ogni scrittura. Prima di ogni invio il
 *   tool controlla che online ci sia ancora la versione che conosce; se no (ha
 *   salvato un altro dispositivo) riscarica tutto e UNISCE (`_reconcile`):
 *   liste per id (task, richiami, Round Recupero, pipeline...), con le cancellazioni
 *   di tutti e due i lati; appuntamenti, sessioni e lead: vince chi li ha cambiati,
 *   una riga cancellata altrove resta cancellata. La scrittura di "stato" è
 *   condizionata (PATCH ...&data->>_rev=eq.<versione>): se nel frattempo un altro
 *   ha salvato, non sovrascrive e riprova dopo aver unito.
 *   Non coperto: lo STESSO appuntamento (o sessione, lead, task, impostazione)
 *   cambiato su due dispositivi insieme: resta una sola versione (la più recente
 *   se ha una data, se no quella del dispositivo che salva).
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
  return cloudHashStr(JSON.stringify(obj) || '');
}

function cloudHashStr(str) {
  // cyrb53: veloce, 53 bit, più che sufficiente per riconoscere una riga cambiata.
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

/* ---------- Due dispositivi: unione sicura (bug 1, 18/10) ---------- */

/** JSON con le chiavi in ordine: il database (jsonb) non conserva l'ordine delle chiavi. */
function cloudStable(v) {
  if (Array.isArray(v)) return '[' + v.map(x => cloudStable(x === undefined ? null : x)).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).filter(k => v[k] !== undefined && typeof v[k] !== 'function').sort()
      .map(k => JSON.stringify(k) + ':' + cloudStable(v[k])).join(',') + '}';
  }
  const j = JSON.stringify(v);
  return j === undefined ? 'null' : j;
}
function cloudStableHash(v) { return cloudHashStr(cloudStable(v)); }

/** true se è una lista di oggetti con id (task, richiami, pipeline...): si unisce voce per voce. */
function cloudIsIdList(v) {
  return Array.isArray(v) && v.every(x => x && typeof x === 'object' && !Array.isArray(x) && (typeof x.id === 'string' || typeof x.id === 'number'));
}

/** Impronta della riga "stato" com'era online: una per chiave, e per le liste una per voce. */
function cloudStateBase(st) {
  const b = {};
  Object.keys(st || {}).forEach(k => {
    const v = st[k];
    if (v === undefined) return;
    if (cloudIsIdList(v)) {
      const l = {};
      v.forEach(x => { l[String(x.id)] = cloudStableHash(x); });
      b[k] = { l };
    } else {
      b[k] = { h: cloudStableHash(v) };
    }
  });
  return b;
}

/** Il momento più recente scritto nella voce (campi che finiscono in "At"): serve a scegliere
 * la versione più nuova quando la stessa voce è cambiata su tutti e due i dispositivi. */
function cloudLastTouched(x) {
  let max = 0;
  Object.keys(x || {}).forEach(k => {
    if (!/At$/.test(k) || !x[k]) return;
    const t = new Date(x[k]).getTime();
    if (Number.isFinite(t) && t > max) max = t;
  });
  return max;
}

/**
 * Unione di una lista per id. L = qui, R = online, base = impronte della versione online
 * che conoscevamo (null = non la conosciamo: si tiene tutto, niente cancellazioni).
 * - voce cambiata da una parte sola: vince quella cambiata;
 * - cambiata da tutte e due: la più recente (cloudLastTouched), a pari merito quella di qui;
 * - voce che c'era e una parte l'ha cancellata: resta cancellata;
 * - voce nuova (da una parte o dall'altra): si tiene.
 */
function cloudMergeList(lv, rv, base) {
  const L = Array.isArray(lv) ? lv : [], R = Array.isArray(rv) ? rv : [];
  const rMap = new Map(R.map(x => [String(x.id), x]));
  const lIds = new Set();
  const out = [];
  L.forEach(x => {
    const id = String(x.id);
    lIds.add(id);
    const r = rMap.get(id);
    if (!r) {
      if (base && id in base) return;   // cancellata sull'altro dispositivo
      out.push(x);                      // nuova qui
      return;
    }
    const lh = cloudStableHash(x), rh = cloudStableHash(r);
    if (lh === rh) { out.push(x); return; }
    const b = base ? base[id] : undefined;
    const lCh = b === undefined || lh !== b;
    const rCh = b === undefined || rh !== b;
    if (rCh && !lCh) out.push(r);
    else if (lCh && !rCh) out.push(x);
    else out.push(cloudLastTouched(r) > cloudLastTouched(x) ? r : x);
  });
  R.forEach(r => {
    const id = String(r.id);
    if (lIds.has(id)) return;
    if (base && id in base) return;     // cancellata qui
    out.push(r);                        // nuova sull'altro dispositivo
  });
  return out;
}

/** Unione della riga "stato" chiave per chiave. Ritorna { merged, unsafe } (unsafe = c'era una
 * differenza che non si poteva decidere: in quel caso vince la versione online). */
function cloudMergeState(L, R, B) {
  const merged = {};
  let unsafe = false;
  const keys = new Set([...Object.keys(L || {}), ...Object.keys(R || {})]);
  keys.forEach(k => {
    if (k === '_rev') return;
    const lv = L[k], rv = R[k], b = B ? B[k] : undefined;
    const listy = (lv !== undefined || rv !== undefined) &&
      (lv === undefined || cloudIsIdList(lv)) && (rv === undefined || cloudIsIdList(rv));
    let v;
    if (listy) {
      v = cloudMergeList(lv, rv, b && b.l ? b.l : null);
    } else {
      const lh = cloudStableHash(lv), rh = cloudStableHash(rv);
      if (lh === rh) v = lv;
      else if (b && 'h' in b) {
        const lCh = lh !== b.h, rCh = rh !== b.h;
        v = (rCh && !lCh) ? rv : lv;
      } else { unsafe = true; v = rv; }
    }
    if (v !== undefined) merged[k] = v;
  });
  return { merged, unsafe };
}

/**
 * Unione di appuntamenti / sessioni / lead (una riga ciascuno). base = impronte (cloudHash)
 * delle righe com'erano online all'ultimo salvataggio.
 * - cambiata qui: vince quella di qui (sarà inviata);
 * - non cambiata qui: prende quella online;
 * - c'era e online non c'è più: cancellata altrove → sparisce anche qui (anche se qui era
 *   stata modificata: una riga cancellata non torna);
 * - nuova qui o nuova online: si tiene.
 * Aggiorna base per le righe prese da online / sparite.
 */
function cloudMergeRows(lv, rv, base) {
  const L = Array.isArray(lv) ? lv : [], R = Array.isArray(rv) ? rv : [];
  const rMap = new Map(R.map(x => [x.id, x]));
  const lIds = new Set();
  const out = [];
  L.forEach(x => {
    lIds.add(x.id);
    const r = rMap.get(x.id);
    if (r) {
      if (cloudHash(x) !== base[x.id]) out.push(x);
      else { out.push(r); base[x.id] = cloudHash(r); }
    } else if (x.id in base) {
      delete base[x.id];
    } else {
      out.push(x);
    }
  });
  R.forEach(r => {
    if (lIds.has(r.id) || r.id in base) return;
    out.push(r);
    base[r.id] = cloudHash(r);
  });
  return out;
}

function cloudNewRev() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
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
  onStatus: null,       // callback per la spia "Salvato" nella barra della pagina
  onMerged: null,       // callback dopo un'unione con le modifiche di un altro dispositivo
  normalize: null,      // funzione che sistema i dati scaricati (mergeWithDefaults, da app.js)
  blocked: false,       // true se il tool è aperto in un'altra scheda: questa non salva più
  _pulledRev: null,     // versione (_rev) della riga "stato" letta all'ultimo pull

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
      if (this.blocked) return; // scheda vecchia: le impronte giuste sono quelle della scheda nuova
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
      this._pulledRev = null;
      if (!stato || !stato.length) return null;
      const st = Object.assign({}, stato[0].data || {});
      this._pulledRev = typeof st._rev === 'string' ? st._rev : null;
      delete st._rev;
      const data = Object.assign(st, {
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
      // Versione della riga "stato" appena letta: il prossimo invio controlla che online sia ancora questa.
      this.synced.rev = this._pulledRev;
      this.synced.revKnown = true;
      this.synced.stBase = cloudStateBase(dbToState(data));
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
      if (!this.session || this.blocked) return;
      this._setStatus('saving');
      clearTimeout(this._timer);
      this._timer = setTimeout(() => this.flush(), CLOUD_DEBOUNCE_MS);
    },

    /** Invia subito le righe cambiate. Restituisce true se online è tutto allineato. */
    async flush() {
      clearTimeout(this._timer);
      // getData() è null finché i dati dell'utente non sono caricati: niente da inviare.
      if (!this.session || this.blocked || !this.getData || !this.getData()) return false;
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

    /** Cosa c'è da inviare rispetto all'ultima versione salvata online. */
    _changes(data, old) {
      const fp = cloudFingerprints(data);
      const c = {
        fp,
        changedA: (data.appointments || []).filter(x => fp.a[x.id] !== old.a[x.id]),
        changedS: (data.sessions || []).filter(x => fp.s[x.id] !== old.s[x.id]),
        changedL: this.leadTable ? (data.leads || []).filter(x => fp.l[x.id] !== old.l[x.id]) : [],
        deletedA: Object.keys(old.a).filter(id => !(id in fp.a)),
        deletedS: Object.keys(old.s).filter(id => !(id in fp.s)),
        deletedL: this.leadTable ? Object.keys(old.l).filter(id => !(id in fp.l)) : [],
        stateChanged: fp.st !== old.st
      };
      c.deletes = c.deletedA.length + c.deletedS.length + c.deletedL.length;
      c.any = c.changedA.length || c.changedS.length || c.changedL.length || c.deletes || c.stateChanged;
      return c;
    },

    /** Versione della riga "stato" online: { exists, rev }. Lettura leggera (solo _rev). */
    async _onlineRev() {
      const rows = await this._rest('GET', 'stato?select=rev:data->>_rev');
      if (!Array.isArray(rows) || !rows.length) return { exists: false, rev: null };
      return { exists: true, rev: typeof rows[0].rev === 'string' ? rows[0].rev : null };
    },

    /**
     * Online è cambiato (un altro dispositivo ha salvato): riscarica tutto e unisce con
     * i dati di qui, SENZA perdere né le modifiche di qui né quelle dell'altro.
     * I dati uniti vanno nello stesso oggetto `data` (il db del tool), così le schermate
     * aperte continuano a lavorare sugli stessi oggetti.
     */
    async _reconcile(data) {
      const raw = await this.pull();
      if (!raw) return false; // online non c'è niente: si scrive e basta
      const remote = typeof this.normalize === 'function' ? this.normalize(raw) : raw;
      const old = this.synced;
      if (!old.l) old.l = {};
      const out = {};
      out.appointments = cloudMergeRows(data.appointments, remote.appointments, old.a);
      out.sessions = cloudMergeRows(data.sessions, remote.sessions, old.s);
      if (this.leadTable) out.leads = cloudMergeRows(data.leads, remote.leads, old.l);
      const { merged, unsafe } = cloudMergeState(dbToState(data), dbToState(remote), old.stBase || null);
      Object.assign(merged, out);
      Object.keys(data).forEach(k => { if (!(k in merged)) delete data[k]; });
      Object.assign(data, merged);
      // Online adesso c'è la versione appena letta: la prossima scrittura parte da lì.
      old.rev = this._pulledRev;
      old.revKnown = true;
      old.stBase = cloudStateBase(dbToState(remote));
      old.st = null; // riscrive "stato" (con le modifiche unite e una versione nuova)
      if (this._leadsToMove) { old.l = {}; this._leadsToMove = false; }
      this._saveSynced();
      if (typeof this.onMerged === 'function') this.onMerged({ unsafe });
      return true;
    },

    async _pushChanges(data) {
      const uid = this.session.user.id;
      // Le impronte si aggiornano passo per passo: se un invio fallisce a metà,
      // quello già arrivato online non viene rimandato al prossimo tentativo.
      if (!this.synced) this.synced = { a: {}, s: {}, l: {}, st: null };
      for (let attempt = 0; ; attempt++) {
        const old = this.synced;
        if (!old.l) old.l = {};
        let c = this._changes(data, old);
        if (!c.any) return;

        // 1. Online c'è ancora la versione che conosciamo? Se no: unione prima di scrivere.
        const online = await this._onlineRev();
        if (online.exists && (!old.revKnown || online.rev !== old.rev)) {
          await this._reconcile(data);
          c = this._changes(data, old);
          if (!c.any) return;
        }

        let conflict = false;
        try {
          // Ordine: prima i lead nuovi (se stanno passando da "stato" alla tabella non
          // devono mai mancare in tutti e due i posti), poi stato, poi le altre righe.
          if (c.changedL.length) {
            await this._upsert('lead', c.changedL.map(x => ({ user_id: uid, id: x.id, data: x })), 'user_id,id');
            c.changedL.forEach(x => { old.l[x.id] = c.fp.l[x.id]; });
          }
          // "stato" si riscrive anche quando si cancella qualcosa: la versione nuova
          // avvisa gli altri dispositivi, che così non rimandano online la riga cancellata.
          if (c.stateChanged || c.deletes || !old.revKnown) {
            const st = dbToState(data);
            const rev = cloudNewRev();
            const body = Object.assign({}, st, { _rev: rev });
            if (online.exists) {
              const cond = old.rev ? 'data->>_rev=eq.' + encodeURIComponent(old.rev) : 'data->>_rev=is.null';
              const rows = await this._rest('PATCH', `stato?user_id=eq.${encodeURIComponent(uid)}&${cond}&select=user_id`,
                { data: body }, { Prefer: 'return=representation' });
              // Nessuna riga aggiornata: un altro dispositivo ha salvato proprio adesso.
              if (!Array.isArray(rows) || !rows.length) conflict = true;
            } else {
              await this._upsert('stato', [{ user_id: uid, data: body }], 'user_id');
            }
            if (!conflict) {
              old.st = c.fp.st;
              old.rev = rev;
              old.revKnown = true;
              old.stBase = cloudStateBase(st);
            }
          }
          if (!conflict) {
            if (c.changedA.length) {
              await this._upsert('appuntamenti', c.changedA.map(x => apptToRow(x, uid)), 'user_id,id');
              c.changedA.forEach(x => { old.a[x.id] = c.fp.a[x.id]; });
            }
            if (c.changedS.length) {
              await this._upsert('sessioni', c.changedS.map(x => sessionToRow(x, uid)), 'user_id,id');
              c.changedS.forEach(x => { old.s[x.id] = c.fp.s[x.id]; });
            }
            if (c.deletedA.length) {
              await this._deleteIds('appuntamenti', c.deletedA);
              c.deletedA.forEach(id => { delete old.a[id]; });
            }
            if (c.deletedS.length) {
              await this._deleteIds('sessioni', c.deletedS);
              c.deletedS.forEach(id => { delete old.s[id]; });
            }
            if (c.deletedL.length) {
              await this._deleteIds('lead', c.deletedL);
              c.deletedL.forEach(id => { delete old.l[id]; });
            }
          }
        } finally {
          this._saveSynced();
        }
        if (!conflict) return;
        if (attempt >= 3) throw new CloudError('I dati online cambiano di continuo: riprovo tra poco', 409);
      }
    },

  _setStatus(st) {
    this.status = st;
    if (typeof this.onStatus === 'function') this.onStatus(st);
  }
};

window.addEventListener('online', () => { if (CloudSync.session) CloudSync.flush(); });
