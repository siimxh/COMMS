/* Report di fine giornata (EOD): i numeri del giorno di ogni utente, letti dal
 * database Supabase, già pronti per il "Modulo di fine giornata".
 *
 * Uso:   SUPABASE_SERVICE_KEY=... node tools/eod-report.js [AAAA-MM-GG]
 *   - data: giorno del report, ora italiana. Senza, oggi.
 *   - serve la chiave service_role (legge i dati di tutti). Mai nel repo.
 *   - nel cloud di Claude la rete passa da un proxy: aggiungi davanti
 *     NODE_USE_ENV_PROXY=1 NODE_NO_WARNINGS=1
 *
 * Stampa un JSON: per ogni utente con attività nel giorno, email, voci del
 * modulo (solo quelle diverse da zero) e testo della mail già pronto.
 * Gli utenti senza attività nel giorno non compaiono.
 *
 * I conti usano le stesse funzioni del tool (utils.js e cloud-sync.js, più le
 * poche di app.js che servono), così i numeri combaciano con la dashboard.
 *
 * Regole decise da Simone (15/10/2026):
 * - Nuovi e vecchi lead non si distinguono: un solo blocco.
 * - Chiamati = persone chiamate (un lead chiamato 3 volte conta 1), esiti per
 *   lead con l'ultimo esito. "Non interessato" e "Già con noi" restano fuori.
 * - Da svolgere = appuntamenti in agenda quel giorno (spostati esclusi).
 * - No show = No Show + Annullato. Gli spostati non sono no show.
 * - Prodotti, referral, rinnovi e upsell: il tool non li registra.
 */
process.env.TZ = 'Europe/Rome';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SUPABASE_URL = 'https://frxgqzwlqsrtocpzcwbk.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!KEY) { console.error('Manca SUPABASE_SERVICE_KEY'); process.exit(1); }

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

// Funzioni di app.js che servono ai conti (app.js intero non si carica fuori dal browser).
function extractFromApp(src, name) {
  const start = src.search(new RegExp('^(const|function) ' + name + '\\b', 'm'));
  if (start < 0) throw new Error('Non trovo ' + name + ' in app.js');
  const end = src.indexOf('\n}', start) >= 0 && src.slice(start).startsWith('function')
    ? src.indexOf('\n}', start) + 2
    : src.indexOf('\n];', start) + 3;
  return src.slice(start, end);
}
const appSrc = read('app.js');
const fromApp = ['DEAL_STAGES', 'dealStageDef', 'apptTotalSold', 'getEffectiveInstallments']
  .map(n => extractFromApp(appSrc, n)).join('\n');

// window finto: cloud-sync.js aggancia un evento "online" al caricamento.
const ctx = vm.createContext({ console, Date, Math, JSON, Object, Array, Number, String, isNaN, Set, window: { addEventListener() {} } });
vm.runInContext([read('utils.js'), read('cloud-sync.js'), fromApp, computeSource()].join('\n;\n'), ctx);

async function api(p) {
  const res = await fetch(SUPABASE_URL + p, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } });
  if (!res.ok) throw new Error(p + ' -> ' + res.status);
  return res.json();
}

/* Il codice qui sotto gira dentro il contesto con utils.js caricato. */
function computeSource() {
  return String(function eodForUser(dayKey, sessions, appts, activeSession) {
    const range = { start: startOfDay(new Date(dayKey + 'T12:00')), end: endOfDay(new Date(dayKey + 'T12:00')) };
    const on = v => inRange(v, range);

    /* ---- Setting: chiamate del giorno, anche della sessione ancora aperta ---- */
    const all = sessions.concat(activeSession ? [activeSession] : []);
    const dayCalls = all.map(s => Object.assign({}, s, { calls: (s.calls || []).filter(c => on(c.timestamp)) }))
      .filter(s => s.calls.length);
    const st = computeStats(dayCalls);
    const byLabel = re => Object.entries(st.outcomeCounts)
      .filter(([label]) => re.test(label.trim())).reduce((n, [, v]) => n + v, 0);

    const setter = appts.filter(a => a.role === 'setter');
    const vend = appts.filter(a => a.role === 'venditore');

    // Appuntamenti in agenda oggi: spostati esclusi (stessa regola degli assegnati del tool).
    const agendaSetter = setter.filter(a => !isMovedAppointment(a) && on(a.scheduledAt));
    const agendaVend = vend.filter(a => !isMovedAppointment(a) && on(a.scheduledAt));
    const vendScoped = vend.filter(a => on(a.scheduledAt));
    const chiusi = vendScoped.filter(a => a.closed);

    // Incassato: acconto al giorno della presentazione + rate pagate quel giorno (Venditore).
    let incassato = 0;
    vend.filter(a => a.closed).forEach(a => getEffectiveInstallments(a).forEach(i => {
      if (i.paid && i.amount > 0 && on(i.paidDate || i.dueDate)) incassato += i.amount;
    }));

    return {
      setting: {
        chiamati: st.totalLeads,
        nonRisposte: st.noAnswer,
        daRichiamare: byLabel(/^da richiamare$/i),
        nonInTarget: byLabel(/^non in target$/i),
        fake: byLabel(/^fake$/i),
        fissati: setter.filter(a => isCountedAsNewBooking(a) && on(a.createdAt)).length,
        daSvolgere: agendaSetter.length,
        presentati: agendaSetter.filter(a => a.presentedStatus === 'presented').length,
        noShow: agendaSetter.filter(a => a.presentedStatus === 'no_show' || a.presentedStatus === 'annullato').length
      },
      vendita: {
        daSvolgere: agendaVend.length,
        presentati: vendScoped.filter(a => dealStageDef(a.dealStage) && dealStageDef(a.dealStage).isPresented).length,
        noShow: vendScoped.filter(a => a.dealStage === 'no_show' || a.dealStage === 'annullato').length,
        chiusure: chiusi.length,
        contrattualizzato: round2(chiusi.reduce((s, a) => s + apptTotalSold(a), 0)),
        incassato: round2(incassato)
      }
    };
  }) + '\nthis.eodForUser = eodForUser;';
}

const LABELS = {
  setting: [
    ['chiamati', 'N° chiamati'], ['nonRisposte', 'N° non risposte'], ['daRichiamare', 'N° da richiamare'],
    ['nonInTarget', 'N° non in target'], ['fake', 'N° fake'], ['fissati', 'N° appuntamenti fissati'],
    ['daSvolgere', 'N° appuntamenti da svolgere'], ['presentati', 'N° appuntamenti presentati'], ['noShow', 'N° no show']
  ],
  vendita: [
    ['daSvolgere', 'N° appuntamenti da svolgere'], ['presentati', 'N° appuntamenti presentati'], ['noShow', 'N° no show'],
    ['chiusure', 'N° chiusure'], ['contrattualizzato', 'Contrattualizzato (€)'], ['incassato', 'Incassato (€)']
  ]
};
const fmt = v => Number.isInteger(v) ? String(v) : v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function section(title, values, labels) {
  const rows = labels.filter(([k]) => values[k]).map(([k, l]) => `• ${l}: ${fmt(values[k])}`);
  return rows.length ? `${title}\n\n${rows.join('\n')}` : '';
}

(async () => {
  const dayKey = process.argv[2] || new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
  const [users, stato, sessioni, appuntamenti] = await Promise.all([
    api('/auth/v1/admin/users?per_page=200'),
    api('/rest/v1/stato?select=user_id,data'),
    api('/rest/v1/sessioni?select=*'),
    api('/rest/v1/appuntamenti?select=*')
  ]);
  const dayLabel = new Date(dayKey + 'T12:00').toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: '2-digit' });

  const out = [];
  for (const u of users.users || users) {
    const st = stato.find(r => r.user_id === u.id);
    const sess = sessioni.filter(r => r.user_id === u.id).map(r => ctx.rowToSession(r));
    const appts = appuntamenti.filter(r => r.user_id === u.id).map(r => ctx.rowToAppt(r));
    if (!st && !sess.length && !appts.length) continue;
    const res = ctx.eodForUser(dayKey, sess, appts, st && st.data && st.data.activeSession);
    const hasAny = Object.values(res.setting).some(Boolean) || Object.values(res.vendita).some(Boolean);
    if (!hasAny) continue;
    const parts = [section('📞 SETTING', res.setting, LABELS.setting), section('🤝 VENDITA', res.vendita, LABELS.vendita)].filter(Boolean);
    out.push({ email: u.email, giorno: dayKey, ...res, testo: parts.join('\n\n') });
  }
  console.log(JSON.stringify({ giorno: dayKey, giornoLabel: dayLabel, utenti: out }, null, 2));
})().catch(e => { console.error(e.message); process.exit(1); });
