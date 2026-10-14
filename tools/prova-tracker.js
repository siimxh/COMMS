/* Prova rapida del Chiamate Tracker nel browser vero (Playwright + Chromium).
 *
 * Uso:   node tools/prova-tracker.js [backup.json] [AAAA-MM-GGTHH:MM]
 *   - backup.json: export del tool (stesso formato di localStorage). Facoltativo:
 *     senza, parte con una pipeline vuota. Il backup reale NON va nel repo.
 *   - data/ora: "adesso" finto, ora italiana (es. 2026-10-10T18:00). Facoltativo.
 *
 * Cosa fa: apre index.html, carica i dati, passa per tutte le pagine, stampa le
 * statistiche principali del mese corrente e gli eventuali errori JavaScript.
 * Salva uno screenshot di ogni pagina in /tmp/prova-tracker/.
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

  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

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
  await page.waitForTimeout(500);

  const outDir = '/tmp/prova-tracker';
  fs.mkdirSync(outDir, { recursive: true });
  const routes = ['#/dashboard', '#/setting-appuntamenti', '#/sessioni', '#/setting-statistiche', '#/venditore-appuntamenti', '#/venditore-statistiche', '#/impostazioni'];
  for (const r of routes) {
    await page.evaluate(h => { location.hash = h; renderRoute(); }, r);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outDir, r.replace(/[#/]+/g, '_').replace(/^_/, '') + '.png') });
  }

  const stats = await page.evaluate(() => {
    const rg = getTimeframeRange('mese_corrente');
    const st = computeStats(getFilteredSessions(db, rg, 'all'));
    return {
      sessioni: db.sessions.length,
      appuntamenti: db.appointments.length,
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
