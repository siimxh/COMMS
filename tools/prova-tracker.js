/* Prova rapida del Chiamate Tracker nel browser vero (Playwright + Chromium).
 *
 * Uso:   node tools/prova-tracker.js [backup.json] [AAAA-MM-GGTHH:MM]
 *   - backup.json: export del tool (stesso formato di localStorage). Facoltativo:
 *     senza, parte con una pipeline vuota. Il backup reale NON va nel repo.
 *   - data/ora: "adesso" finto, ora italiana (es. 2026-10-10T18:00). Facoltativo.
 *
 * Cosa fa: apre index.html, carica i dati, passa per tutte le pagine, stampa le
 * statistiche principali del mese corrente e gli eventuali errori JavaScript.
 * Salva uno screenshot di ogni pagina in /tmp/prova-tracker/ (o nella cartella
 * indicata con CARTELLA_SCREENSHOT=/percorso; PAGINA_INTERA=1 = pagina intera,
 * non solo 1440x900). Passa anche per il dettaglio dell'ultima sessione e per
 * la scheda del primo lead, se ci sono.
 * Errori: conta sia gli errori JavaScript sia i console.error della pagina.
 *
 * Dati finti per la prova: tools/dati-finti.js (vedi commento in testa al file).
 *
 * Login: il database Supabase qui è FINTO (in memoria, intercettato da
 * Playwright), così la prova non tocca i dati veri e non serve una password.
 * I dati entrano come "dati della versione senza login" e il tool li carica al
 * primo accesso, come farà con Hamza.
 * Con SENZA_TABELLA_LEAD=1 il database finto non ha la tabella "lead" (come
 * prima di lanciare supabase/lead.sql): i lead restano nella riga "stato".
 *
 * Playwright: usa quello installato (require('playwright')); se non lo trova prova
 * il percorso globale dei container cloud. Chromium: PLAYWRIGHT_CHROMIUM o
 * /opt/pw-browsers/chromium se esiste.
 */
const fs = require('fs');
const path = require('path');

function loadPlaywright() {
  for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try { return require(p); } catch (e) { /* prova il prossimo */ }
  }
  throw new Error('Playwright non trovato: installalo con "npm i -g playwright".');
}

(async () => {
  const { chromium } = loadPlaywright();
  const [backupPath, fakeNow] = process.argv.slice(2);
  const exe = process.env.PLAYWRIGHT_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Europe/Rome' });

  if (fakeNow) {
    await ctx.addInitScript(iso => {
      const R = Date;
      const off = new R(iso).getTime() - R.now();
      window.Date = class extends R {
        constructor(...a) { a.length ? super(...a) : super(R.now() + off); }
        static now() { return R.now() + off; }
      };
    }, fakeNow);
  }

  // Supabase finto: login sempre valido, tabelle in memoria.
  const fake = { stato: [], appuntamenti: [], sessioni: [], lead: [] };
  const noLeadTable = process.env.SENZA_TABELLA_LEAD === '1';
  await ctx.route(/supabase\.co\//, async route => {
    const req = route.request();
    const url = new URL(req.url());
    const reply = (status, body) => route.fulfill({ status, contentType: 'application/json', body: body === undefined ? '' : JSON.stringify(body) });
    if (url.pathname.startsWith('/auth/v1/')) {
      return reply(200, { access_token: 't', refresh_token: 'r', expires_in: 3600, user: { id: 'prova', email: 'prova@example.com' } });
    }
    const table = url.pathname.split('/').pop();
    if (table === 'lead' && noLeadTable) return reply(404, { code: 'PGRST205', message: "Could not find the table 'public.lead'" });
    if (req.method() === 'GET') return reply(200, url.searchParams.get('select') === 'data' ? fake[table].map(r => ({ data: r.data })) : fake[table]);
    if (req.method() === 'POST') {
      JSON.parse(req.postData()).forEach(r => {
        const i = fake[table].findIndex(x => x.user_id === r.user_id && x.id === r.id);
        if (i >= 0) fake[table][i] = r; else fake[table].push(r);
      });
      return reply(201);
    }
    if (req.method() === 'DELETE') {
      // Cancellazioni del tool (cloud-sync _deleteIds): ?id=in.(a,b,c)
      const m = /^in\.\((.*)\)$/.exec(url.searchParams.get('id') || '');
      const ids = m ? m[1].split(',').map(x => x.replace(/^"|"$/g, '')) : [];
      fake[table] = fake[table].filter(r => !ids.includes(r.id));
      return reply(204);
    }
    return reply(204);
  });

  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    // Il 404 della tabella "lead" mancante è voluto (SENZA_TABELLA_LEAD=1): non è un errore.
    if (noLeadTable && /status of 404/.test(m.text())) return;
    errors.push('console.error: ' + m.text());
  });

  const indexUrl = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(indexUrl);
  if (backupPath) {
    const data = fs.readFileSync(backupPath, 'utf8');
    await page.evaluate(d => localStorage.setItem('chiamateTrackerData_v1', d), data);
  } else {
    await page.evaluate(() => {
      const d = defaultData();
      d.pipelines.push({ id: 'pl1', name: 'Prova', createdAt: new Date().toISOString(), outcomes: defaultOutcomesList() });
      localStorage.setItem('chiamateTrackerData_v1', JSON.stringify(d));
    });
  }
  await page.reload();
  await page.fill('#loginEmail', 'prova@example.com');
  await page.fill('#loginPassword', 'prova');
  await page.click('#loginSubmit');
  await page.waitForFunction(() => document.getElementById('loginScreen').hidden && !!document.querySelector('#app *'));
  await page.waitForTimeout(500);

  const outDir = process.env.CARTELLA_SCREENSHOT || '/tmp/prova-tracker';
  fs.mkdirSync(outDir, { recursive: true });
  const routes = ['#/oggi', '#/venditore-lead', '#/dashboard', '#/setting-appuntamenti', '#/sessioni', '#/venditore-appuntamenti', '#/impostazioni'];
  // Dettagli: la sessione più recente con chiamate e il primo lead (nomi file fissi).
  const details = await page.evaluate(() => {
    const s = db.sessions.filter(x => (x.calls || []).length).slice(-1)[0];
    const l = (db.leads || [])[0];
    return { sessione: s ? '#/sessioni/' + s.id : null, lead: l ? '#/lead/' + l.id : null };
  });
  const shots = routes.map(r => [r, r.replace(/[#/]+/g, '_').replace(/^_/, '')]);
  if (details.sessione) shots.push([details.sessione, 'sessioni_dettaglio']);
  if (details.lead) shots.push([details.lead, 'lead_scheda']);
  for (const [r, name] of shots) {
    await page.evaluate(h => { location.hash = h; renderRoute(); }, r);
    await page.waitForTimeout(400);
    // Il messaggio del primo accesso ("Ho trovato i tuoi dati...") coprirebbe la pagina.
    await page.evaluate(() => { const t = document.getElementById('appToast'); if (t) t.className = 'toast'; });
    await page.screenshot({ path: path.join(outDir, name + '.png'), fullPage: process.env.PAGINA_INTERA === '1' });
  }

  const stats = await page.evaluate(() => {
    const rg = getTimeframeRange('mese_corrente');
    const st = computeStats(getFilteredSessions(db, rg, 'all'));
    return {
      sessioni: db.sessions.length,
      appuntamenti: db.appointments.length,
      lead: (db.leads || []).length,
      meseCorrente: { chiamate: st.totalCalls, lead: st.totalLeads, risposta: st.responseRate + '%' },
      setter: computeSetterStats(db, rg),
      venditore: computeVenditoreStats(db, rg)
    };
  });

  console.log(JSON.stringify(stats, null, 2));
  console.log('Screenshot in', outDir);
  console.log(errors.length ? 'ERRORI:\n' + errors.join('\n') : 'Nessun errore JavaScript.');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
