
// I dati veri arrivano dopo il login (openUserData, in fondo al file).
let db = defaultData();
let uiState = {
  pipelineFilter: 'all',
  crmSetterFilter: 'prossimi', // vedi SETTER_APPT_FILTERS — lista Appuntamenti Setter
  crmSetterSearch: '',         // testo ricerca per nome/telefono — tabella Appuntamenti Setter
  calMonthOffset: 0,           // scostamento in mesi dal mese corrente, per la navigazione del calendario
  editingPaceGoal: null,       // 'setter' | 'venditore' quando l'obiettivo del mese di Pace mese è in modifica
  goalsTimeframe: 'month',     // "Migliore di sempre" della Dashboard: giorno | settimana | mese (day|week|month)
  goalsPeriodMode: 'current',  // 'current' (periodo della barra) | 'best' ("Migliore di sempre" per commissioni) in Dashboard
  settingTab: 'appuntamenti',  // tab attiva dentro Setting: 'appuntamenti' | 'sessioni' | 'statistiche'
  venditoreTab: 'lead',        // tab attiva dentro Venditore: 'lead' | 'statistiche'
  period: null,                // periodo UNICO (Dashboard, Sessioni, Statistiche): vedi getPeriod()
  andamentoCommRole: 'all',    // 'all' | 'setter' | 'venditore' — filtro ruolo solo per il grafico Commissioni
  sessionMinimized: false      // true quando l'utente è "uscito" dalla sessione attiva per navigare altrove, senza terminarla (vedi renderActiveSessionIndicator)
};
let sessionTimerInterval = null;

const appRoot = document.getElementById('app');
const modalRoot = document.getElementById('modalRoot');

function persist() {
  Storage.save(db);
  CloudSync.schedule();
  refreshCallbackNotifications();
}

/* ---------- Spia di salvataggio online (vedi cloud-sync.js) ---------- */

function setSyncStatus(status) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  const map = {
    saving: '⟳ Salvataggio…',
    saved: '✓ Salvato',
    pending: '⚠ In attesa di rete'
  };
  const titles = {
    saving: 'Sto salvando le ultime modifiche online.',
    saved: 'Tutti i dati sono salvati online.',
    pending: 'Il salvataggio online non è riuscito (rete assente?). I dati sono al sicuro in questo browser e partono da soli appena torna la rete.'
  };
  el.textContent = map[status] || '';
  el.title = titles[status] || '';
  el.dataset.status = status;
  el.style.display = map[status] ? 'inline' : 'none';
}

/* ============================================================================
 * Tema — accento a rampa (restyling 17/10/2026, step 16)
 * C'è UN solo stile, quello della guida colori. Da 🎨 Aspetto si sceglie solo:
 *  - l'accento: i 4 preset della guida (Arancione = default, Indaco, Teal, Magenta) o
 *    un colore a scelta, da cui il tool genera la rampa 500-100 (guida §5);
 *  - Chiaro / Scuro (i neutri scuri stanno in style.css, data-theme="dark");
 *  - la grandezza del testo e l'effetto "Numeri che contano".
 * applyTheme scrive sulla pagina SOLO i token dell'accento (--accent-500..100,
 * --accent-ink, --on-accent) e, se l'accento è verde o rosso, i colori di trend.
 * Tutto il resto del CSS legge quei token: nessun colore d'accento scritto a mano.
 * Salvato in db.settings: accent ('arancione'|'indaco'|'teal'|'magenta'|'custom'),
 * accentCustom ('#RRGGBB', solo per 'custom'), themeMode ('light'|'dark').
 * ==========================================================================*/

/** Rampe della guida (§5, "Esempi di rampe alternative"): 500, 400, 300, 200, 100. */
const ACCENT_PRESETS = {
  arancione: { label: 'Arancione', ramp: ['#FF5A1F', '#FA8A5F', '#FCB497', '#FDD8C7', '#FFEDE5'],
    // Testo arancione: gli stessi valori scelti allo step 1 (il 500 sul bianco non passa il contrasto).
    ink: '#C2410C', inkDark: '#FF8A5F' },
  indaco: { label: 'Indaco', ramp: ['#4F46E5', '#7C75EE', '#A9A4F4', '#D4D1FA', '#EEEDFD'] },
  teal: { label: 'Teal', ramp: ['#0D9488', '#4DB3AA', '#8ACFC8', '#C4E8E4', '#E6F5F3'] },
  magenta: { label: 'Magenta', ramp: ['#D9267A', '#E5639F', '#EE99C0', '#F7CCE0', '#FCEAF2'] }
};
const DEFAULT_ACCENT = 'arancione';
const ACCENT_LEVELS = [500, 400, 300, 200, 100];
/* Luminosità HSL della guida per 400-100 (il 500 resta quello scelto, tenuto tra 45 e 60%). */
const ACCENT_RAMP_L = { 400: 68, 300: 78, 200: 88, 100: 95 };
const ACCENT_L500_MIN = 45, ACCENT_L500_MAX = 60;
/* Superfici dei due temi (uguali a style.css) per i calcoli di contrasto e le tinte scure. */
const THEME_SURFACE = { light: { card: '#FFFFFF', page: '#F5F5F6' }, dark: { card: '#1B1B1E', page: '#26262A' } };
const ON_ACCENT_DARK = '#111113';
/* Colori di trend quando l'accento li confonderebbe (guida §5.4).
 * REGOLA: accento VERDE (tinta 90-160°) → variazione positiva ↑ in BLU;
 *         accento ROSSO (tinta 345-15°) → variazione negativa ↓ (e scadenze) in VIOLA.
 * Sotto il 20% di saturazione (quasi grigio) la tinta non conta: niente spostamento. */
const TREND_SHIFT = {
  success: { light: ['#2563EB', '#E8EFFD'], dark: ['#6E9BFF', '#16233F'] },
  danger: { light: ['#7C3AED', '#F1EAFD'], dark: ['#A98BFF', '#2A1F45'] }
};
const THEME_INLINE_VARS = ['--accent-500', '--accent-400', '--accent-300', '--accent-200', '--accent-100',
  '--accent-ink', '--on-accent', '--success', '--success-bg', '--danger', '--danger-bg'];

/* ---------- Colori: conversioni e contrasto (WCAG) ---------- */
function hexToRgb(hex) {
  const c = String(hex).replace('#', '');
  const full = c.length === 3 ? c.split('').map(x => x + x).join('') : c;
  const n = parseInt(full, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
function rgbToHex(rgb) {
  return '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function isHexColor(v) { return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v); }
/** → { h: 0-360, s: 0-100, l: 0-100 } */
function hexToHsl(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}
/** Mescola due colori hex: t=0 → a, t=1 → b. */
function mixHex(a, b, t) {
  const x = hexToRgb(a), y = hexToRgb(b);
  return rgbToHex(x.map((v, i) => v + (y[i] - v) * t));
}
/** Luminanza relativa WCAG 2.x. */
function relLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(a, b) {
  const la = relLuminance(a), lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Rampa 500-100 da un colore qualsiasi (guida §5): stessa tinta e saturazione,
 *  luminosità 500 = quella scelta tenuta tra 45 e 60%, poi 68 / 78 / 88 / 95%. */
function accentRampFromHex(hex) {
  const { h, s, l } = hexToHsl(hex);
  const l500 = Math.max(ACCENT_L500_MIN, Math.min(ACCENT_L500_MAX, l));
  return [hslToHex(h, s, l500)].concat([400, 300, 200, 100].map(k => hslToHex(h, s, ACCENT_RAMP_L[k])));
}

/** La stessa tinta, scurita (chiaro) o schiarita (scuro) finché si legge come testo sulle superfici. */
function accentInkFor(base, mode) {
  const surf = THEME_SURFACE[mode];
  const ok = c => contrastRatio(c, surf.card) >= 4.5 && contrastRatio(c, surf.page) >= 4.5;
  const { h, s, l } = hexToHsl(base);
  if (ok(base)) return base.toUpperCase();
  for (let i = 1; i <= 100; i++) {
    const c = hslToHex(h, s, mode === 'dark' ? Math.min(100, l + i) : Math.max(0, l - i));
    if (ok(c)) return c;
  }
  return mode === 'dark' ? '#FFFFFF' : ON_ACCENT_DARK;
}

/** 'green' | 'red' | null: l'accento si confonde con i colori di trend? */
function accentTrendConflict(hex) {
  const { h, s } = hexToHsl(hex);
  if (s < 20) return null;
  if (h >= 90 && h <= 160) return 'green';
  if (h >= 345 || h <= 15) return 'red';
  return null;
}

/** Accento salvato → { key, label, base (500 della rampa chiara) , ramp chiara }. Valori sconosciuti = Arancione. */
function currentAccent(settings) {
  const s = settings || {};
  if (s.accent === 'custom' && isHexColor(s.accentCustom)) {
    return { key: 'custom', label: 'Colore a scelta', ramp: accentRampFromHex(s.accentCustom) };
  }
  const key = ACCENT_PRESETS[s.accent] ? s.accent : DEFAULT_ACCENT;
  return Object.assign({ key }, ACCENT_PRESETS[key]);
}

/** Tutti i token da scrivere sulla pagina per un accento in un tema. */
function accentTokens(acc, mode) {
  const [c500, c400, c300, c200, c100] = acc.ramp;
  const t = { '--accent-500': c500, '--accent-400': c400 };
  if (mode === 'dark') {
    // Tema scuro: le tinte tenui (sfondi) diventano tinte SCURE della stessa tinta,
    // altrimenti un accent-100 quasi bianco abbaglia sulle card scure (come lo step 1).
    const card = THEME_SURFACE.dark.card;
    t['--accent-300'] = mixHex(card, c500, 0.55);
    t['--accent-200'] = mixHex(card, c500, 0.30);
    t['--accent-100'] = mixHex(card, c500, 0.14);
    t['--accent-ink'] = acc.inkDark || accentInkFor(c500, 'dark');
  } else {
    t['--accent-300'] = c300;
    t['--accent-200'] = c200;
    t['--accent-100'] = c100;
    t['--accent-ink'] = acc.ink || accentInkFor(c500, 'light');
  }
  // Testo sopra l'accento pieno: bianco solo se arriva a 4.5:1, altrimenti neutral-900.
  t['--on-accent'] = contrastRatio('#FFFFFF', c500) >= 4.5 ? '#FFFFFF' : ON_ACCENT_DARK;
  const conflict = accentTrendConflict(c500);
  if (conflict === 'green') { t['--success'] = TREND_SHIFT.success[mode][0]; t['--success-bg'] = TREND_SHIFT.success[mode][1]; }
  if (conflict === 'red') { t['--danger'] = TREND_SHIFT.danger[mode][0]; t['--danger-bg'] = TREND_SHIFT.danger[mode][1]; }
  return t;
}

/** Chiaro o scuro, dalla scelta salvata in 🎨. */
function themeModeFromSettings(settings) {
  return (settings && settings.themeMode === 'dark') ? 'dark' : 'light';
}

/**
 * Applica db.settings al DOM: data-theme (chiaro/scuro), token dell'accento, grandezza
 * del testo. Si chiama a ogni renderRoute e dopo ogni cambio in 🎨.
 */
function applyTheme(settings) {
  if (!settings) return;
  const root = document.documentElement;
  const mode = themeModeFromSettings(settings);
  root.setAttribute('data-theme', mode);
  const tokens = accentTokens(currentAccent(settings), mode);
  THEME_INLINE_VARS.forEach(v => {
    if (tokens[v]) root.style.setProperty(v, tokens[v]);
    else root.style.removeProperty(v);
  });
  // Grandezza del testo (🎨, 16/10): "Grande" ingrandisce tutto il tool.
  root.style.fontSize = settings.textSize === 'large' ? '121%' : '';
}

/* ---------- Numeri che contano (unico effetto rimasto in 🎨) ---------- */
function animateKpiValues(root) {
  if (!db.settings.toggles || !db.settings.toggles.animatedNumbers) return;
  root.querySelectorAll('[data-kpi-num]').forEach(el => {
    const target = parseFloat(el.dataset.kpiNum);
    if (isNaN(target)) return;
    const money = /€/.test(el.dataset.kpiDisplay || '');
    const duration = 600;
    const start = performance.now();
    function step(now) {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmtNumIt(Math.round(target * eased), money);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = el.dataset.kpiDisplay || String(target);
    }
    requestAnimationFrame(step);
  });
}

/* ---------- Router ---------- */

/* ---------- Route (restyling 17/10, step 2) ----------
 * Barra laterale: Dashboard / Setting / Venditore. Dentro Setting e Venditore la scelta
 * si fa con le tab centrate in alto (barra della pagina):
 *   Setting   = Appuntamenti · Sessioni · Stats
 *   Venditore = Lead · Statistiche
 * Route piatte con trattino. Le vecchie restano valide e vengono girate:
 *   #/oggi -> #/dashboard, #/venditore-appuntamenti -> #/venditore-lead.
 * Anche #/venditore-tabella porta alla lista Lead. */
const SETTING_SUBROUTES = { appuntamenti: 'setting-appuntamenti', sessioni: 'sessioni', statistiche: 'setting-statistiche' };
const VENDITORE_SUBROUTES = { lead: 'venditore-lead', statistiche: 'venditore-statistiche' };
const ROUTE_REDIRECTS = { oggi: 'dashboard', 'venditore-appuntamenti': 'venditore-lead', 'venditore-tabella': 'venditore-lead' };
const SETTING_TAB_LABELS = { appuntamenti: 'Appuntamenti', sessioni: 'Sessioni', statistiche: 'Stats' };
const VENDITORE_TAB_LABELS = { lead: 'Lead', statistiche: 'Statistiche' };

function isSettingRouteName(route) {
  return route === 'setting' || Object.values(SETTING_SUBROUTES).includes(route);
}
function isVenditoreRouteName(route) {
  return route === 'venditore' || route === 'lead' || Object.values(VENDITORE_SUBROUTES).includes(route);
}

function renderRoute() {
  // Indicatore fisso "sessione in corso" + etichetta del tasto "+ Nuova sessione" — vanno
  // aggiornati PRIMA di qualunque return anticipato qui sotto, perché dipendono solo dallo
  // stato (db.activeSession/uiState.sessionMinimized) e non dalla route effettivamente resa.
  renderActiveSessionIndicator();
  updateNuovaSessioneButtonLabel();
  renderConfirmAlertBanner();
  renderStaleSessionBanner();
  closeMobileSidebar();
  refreshCallbackNotifications();

  // La schermata di una chiamata di richiamo ("Chiama" su un lead "Da richiamare") ha
  // SEMPRE priorità, anche su una sessione attiva: è un flusso "sopra" la sessione, che
  // quando finisce torna automaticamente alla sessione (se ancora aperta) o alla route
  // normale (vedi logCallbackCall/startCallbackCall).
  if (db.callbackCallActiveId) {
    renderCallbackCallScreen();
    return;
  }
  // La sessione attiva resta la vista forzata DI DEFAULT, a meno che l'utente non abbia
  // premuto "Esci" per navigare altrove senza terminarla (uiState.sessionMinimized) — in
  // quel caso si prosegue con il routing normale qui sotto, e l'indicatore lampeggiante
  // (appena reso sopra) resta visibile per poter rientrare.
  if (db.activeSession && !uiState.sessionMinimized) {
    renderSessioneAttiva();
    return;
  }
  if (db.confirmRoundActive) {
    renderConfirmRoundScreen();
    return;
  }
  if (db.recoveryRoundActive) {
    renderRecoveryRoundScreen();
    return;
  }
  // Round Follow-up della parte Venditore (lead.js, Simone 24/10).
  if (db.followUpRoundActive) {
    if (LeadCRM.isOn()) { LeadCRM.renderFollowUpRound(); return; }
    db.followUpRoundActive = false;
  }
  document.body.classList.remove('in-session');
  clearInterval(sessionTimerInterval);

  // Parte Venditore (lead.js): spenta = spariscono la voce Venditore e le sue pagine.
  LeadCRM.applyNav();
  const venditoreOn = LeadCRM.isOn();
  let parts = (location.hash || '#/dashboard').replace('#/', '').split('/');
  let route = parts[0] || 'dashboard';
  if (ROUTE_REDIRECTS[route]) {
    route = ROUTE_REDIRECTS[route];
    parts = [route];
    try { history.replaceState(null, '', '#/' + route); } catch (e) { /* solo l'indirizzo, la pagina va lo stesso */ }
  }
  if (!venditoreOn && isVenditoreRouteName(route)) route = 'dashboard';

  // Sezione e tab attive (barra laterale + tab in alto).
  let section = 'dashboard';
  let tab = null;
  if (isSettingRouteName(route)) {
    section = 'setting';
    if (route === 'sessioni') tab = 'sessioni';
    else if (route === 'setting-appuntamenti') tab = 'appuntamenti';
    else if (route === 'setting-statistiche') tab = 'statistiche';
    else tab = SETTING_TAB_LABELS[uiState.settingTab] ? uiState.settingTab : 'appuntamenti';
    uiState.settingTab = tab;
  } else if (isVenditoreRouteName(route)) {
    section = 'venditore';
    if (route === 'venditore-statistiche') tab = 'statistiche';
    else if (route === 'venditore') tab = VENDITORE_TAB_LABELS[uiState.venditoreTab] ? uiState.venditoreTab : 'lead';
    else tab = 'lead';
    uiState.venditoreTab = tab;
  } else if (route === 'impostazioni') {
    section = 'impostazioni';
  }
  updateSidebarActive(section);
  renderPageBar(section, tab);

  applyTheme(db.settings);

  if (route === 'sessioni' && parts[1]) renderSessioneDetail(parts[1]);
  else if (section === 'setting') renderSettingPage();
  else if (route === 'lead' && parts[1]) LeadCRM.renderLead(parts[1]);
  else if (section === 'venditore') renderVenditorePage();
  else if (route === 'impostazioni') renderBuilderPage();
  else renderDashboard();

  // Pagina NUOVA (route diversa dall'ultima disegnata): si riparte dall'alto. Senza, chi
  // passa dal fondo della Dashboard a Venditore → Lead si ritrovava a metà pagina. Lo
  // stesso disegno ripetuto sulla stessa route (dopo un salvataggio) non sposta niente.
  const routeKey = parts.join('/');
  if (lastRenderedRouteKey !== null && routeKey !== lastRenderedRouteKey) window.scrollTo(0, 0);
  lastRenderedRouteKey = routeKey;
}
/** Ultima route disegnata da renderRoute (per riportare in cima la pagina quando cambia). */
let lastRenderedRouteKey = null;

/** Voce attiva della barra laterale. */
function updateSidebarActive(section) {
  document.querySelectorAll('#sidebar .navlink[data-route]').forEach(l => {
    l.classList.toggle('active', l.dataset.route === section);
    if (l.dataset.route === section) l.setAttribute('aria-current', 'page');
    else l.removeAttribute('aria-current');
  });
}

/** Barra in cima alla pagina: titolo della sezione + tab centrate (Setting / Venditore). */
function renderPageBar(section, tab) {
  const titles = { dashboard: 'Dashboard', setting: 'Setting', venditore: 'Venditore', impostazioni: 'Aspetto' };
  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = titles[section] || 'Dashboard';
  // "+ Task": il pulsante nero della Dashboard (uno solo per vista).
  const taskBtn = document.getElementById('btnNewTask');
  if (taskBtn) taskBtn.hidden = section !== 'dashboard';
  const tabsEl = document.getElementById('pageTabs');
  if (!tabsEl) return;
  let defs = null;
  if (section === 'setting') defs = Object.keys(SETTING_TAB_LABELS).map(k => [k, SETTING_TAB_LABELS[k], SETTING_SUBROUTES[k]]);
  if (section === 'venditore') defs = Object.keys(VENDITORE_TAB_LABELS).map(k => [k, VENDITORE_TAB_LABELS[k], VENDITORE_SUBROUTES[k]]);
  tabsEl.innerHTML = defs ? `<div class="tabs" role="tablist">${defs.map(([k, label, r]) =>
    `<button class="tab ${k === tab ? 'active' : ''}" role="tab" aria-selected="${k === tab}" data-tab-route="${r}">${label}</button>`).join('')}</div>` : '';
}

/* ---------- Barra laterale: compressa / menu a scomparsa ---------- */
const SIDEBAR_STORE_KEY = 'comms_barraCompatta';

function initSidebar() {
  let compact = false;
  try { compact = localStorage.getItem(SIDEBAR_STORE_KEY) === '1'; } catch (e) { compact = false; }
  document.body.classList.toggle('sb-collapsed', compact);
  updateSidebarCollapseButton();

  document.getElementById('btnSidebarCollapse').addEventListener('click', () => {
    const now = !document.body.classList.contains('sb-collapsed');
    document.body.classList.toggle('sb-collapsed', now);
    try { localStorage.setItem(SIDEBAR_STORE_KEY, now ? '1' : '0'); } catch (e) { /* solo comodità */ }
    updateSidebarCollapseButton();
  });
  document.getElementById('btnMenu').addEventListener('click', () => {
    if (document.body.classList.contains('sb-open')) closeMobileSidebar();
    else openMobileSidebar();
  });
  document.getElementById('sidebarBackdrop').addEventListener('click', closeMobileSidebar);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMobileSidebar(); });
  document.getElementById('pageTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab-route]');
    if (btn) location.hash = '#/' + btn.dataset.tabRoute;
  });
}

function updateSidebarCollapseButton() {
  const btn = document.getElementById('btnSidebarCollapse');
  if (!btn) return;
  const compact = document.body.classList.contains('sb-collapsed');
  btn.title = compact ? 'Allarga la barra' : 'Comprimi la barra';
  btn.setAttribute('aria-label', btn.title);
}

function openMobileSidebar() {
  document.body.classList.add('sb-open');
  const bd = document.getElementById('sidebarBackdrop');
  if (bd) bd.hidden = false;
  const m = document.getElementById('btnMenu');
  if (m) m.setAttribute('aria-expanded', 'true');
}

function closeMobileSidebar() {
  document.body.classList.remove('sb-open');
  const bd = document.getElementById('sidebarBackdrop');
  if (bd) bd.hidden = true;
  const m = document.getElementById('btnMenu');
  if (m) m.setAttribute('aria-expanded', 'false');
}

/**
 * Pallino rosso lampeggiante fisso ("sessione in corso, premi per rientrare"), mostrato
 * SOLO quando c'è una sessione attiva E l'utente l'ha minimizzata (uiState.sessionMinimized)
 * per navigare altrove — vedi il tasto "Esci" in renderSessioneAttiva. È un elemento DOM
 * creato una sola volta e tenuto fuori da #app (appeso a document.body), così sopravvive
 * ad ogni appRoot.innerHTML = ... dei re-render normali invece di dover essere ridisegnato
 * ogni volta; qui lo si aggiorna/nasconde in base allo stato corrente.
 */
function renderActiveSessionIndicator() {
  const show = !!(db.activeSession && uiState.sessionMinimized);
  let el = document.getElementById('activeSessionIndicator');
  if (!show) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('button');
    el.id = 'activeSessionIndicator';
    el.className = 'active-session-indicator';
    el.addEventListener('click', () => {
      uiState.sessionMinimized = false;
      renderRoute();
    });
    document.body.appendChild(el);
  }
  el.innerHTML = `<span class="blink-dot"></span>In sessione — torna`;
}

/** Il tasto "+ Nuova sessione" nella barra della pagina non va mai cliccato per AVVIARE una seconda
 * sessione sopra quella già in corso (sovrascriverebbe db.activeSession perdendo i dati
 * della prima) — mentre una sessione è attiva, diventa invece un modo rapido per
 * rientrarci (utile soprattutto quando è minimizzata, come scorciatoia in più oltre
 * all'indicatore lampeggiante). La barra è markup statico fuori da #app, quindi questa
 * etichetta va aggiornata esplicitamente ad ogni renderRoute(), non si rigenera da sola. */
function updateNuovaSessioneButtonLabel() {
  const btn = document.getElementById('btnNuovaSessione');
  if (!btn) return;
  // Sul telefono la parola "Nuova"/"alla" sparisce (lascia spazio al titolo e a "+ Task").
  btn.innerHTML = db.activeSession ? '↩ Torna <span class="hide-xs">alla </span>sessione' : '+ <span class="hide-xs">Nuova </span>sessione';
}

/** Setting: Appuntamenti · Sessioni · Stats (tab in alto). */
function renderSettingPage() {
  const tab = uiState.settingTab || 'appuntamenti';
  if (tab === 'sessioni') renderSessioniList();
  else if (tab === 'statistiche') renderSettingStatistiche();
  else renderAppuntamenti();
}

/** Venditore: Lead · Statistiche (tab in alto). */
function renderVenditorePage() {
  const tab = uiState.venditoreTab || 'lead';
  if (tab === 'statistiche') renderVenditoreStatistiche();
  else LeadCRM.renderLeadList();
}

/* ============================================================================
 * Pagine statistiche (restyling 17/10, step 2). Erano state tolte il 16/10 (i tassi
 * stavano sotto le card Obiettivi della Dashboard); tornano come tab "Stats" in
 * Setting e "Statistiche" in Venditore, con la barra del periodo unica.
 * Stesse funzioni di calcolo di sempre: computeSetterStats / computeVenditoreStats
 * (utils.js) e LeadCRM.newStatsValues. Niente "Esiti nel periodo" (Simone, 16/10).
 * ==========================================================================*/

function renderSettingStatistiche() {
  const range = getPeriodRangeOrNull();
  const st = computeSetterStats(db, range);
  const comm = computeFunnelValues(db, 'setter', range || getPeriodRange());
  appRoot.innerHTML = `
    ${renderPeriodBar()}
    <section class="kpi-grid">
      <div class="kpi-card"><div class="kpi-value">${st.fissati}</div><div class="kpi-label">Appuntamenti fissati</div></div>
      <div class="kpi-card"><div class="kpi-value">${st.presentati}</div><div class="kpi-label">Presentati</div></div>
      <div class="kpi-card"><div class="kpi-value">${fmtPctIt(st.showUpRate)}</div><div class="kpi-label">Show rate · ${st.presentatiSvolti} su ${st.svolti} svolti</div></div>
      <div class="kpi-card"><div class="kpi-value">${fmtPctIt(st.closingRate)}</div><div class="kpi-label">Closing · chiusi su presentati</div></div>
    </section>
    <section class="card">
      <h3>Ritmo e commissioni</h3>
      <div class="rates-row">
        ${rateCell(String(st.mediaFissatiGiorno).replace('.', ','), 'Fissati al giorno', 'giorni lun-ven')}
        ${rateCell(st.svolti, 'Già svolti', 'presentati, no show e annullati')}
        ${rateCell('€' + round2(comm.commissioniShowUp || 0), 'Commissioni show', '40 € a presentato')}
        ${rateCell('€' + round2(comm.commissioniChiusure || 0), 'Commissioni venduto', '3% dell\'incassato')}
      </div>
    </section>
    ${renderCallTypesSection(range)}
  `;
  wirePeriodBar(renderSettingStatistiche);
}

/**
 * Setting → Stats: chiamate e lead per tipo nel periodo (restyling 17/10/2026, prompt 5.5).
 * Tutte le chiamate stanno nelle sessioni (normali o automatiche del giorno), quindi i
 * totali sono gli stessi di computeStats (Chiamate totali / Lead contattati in Sessioni).
 * range null = "Tutto".
 */
function renderCallTypesSection(range) {
  const sessions = range ? getFilteredSessions(db, range, 'all') : db.sessions.slice();
  const byType = computeCallTypeStats(sessions);
  const tot = computeStats(sessions);
  const rows = CALL_TYPES.map(t => `
    <tr><td>${escapeHtml(t.label)}</td><td class="num">${byType[t.key].calls}</td><td class="num">${byType[t.key].leads}</td></tr>`).join('');
  return `
    <section class="card call-types">
      <h3>Chiamate per tipo</h3>
      <p class="text-dim call-types-note">Stesso lead nello stesso giorno = 1 lead. Il lead conta nel tipo della sua prima chiamata.</p>
      <table class="simple-table">
        <thead><tr><th>Tipo</th><th class="num">Chiamate</th><th class="num">Lead</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><th>Totale</th><th class="num">${tot.totalCalls}</th><th class="num">${tot.totalLeads}</th></tr></tfoot>
      </table>
    </section>`;
}

function renderVenditoreStatistiche() {
  const range = getPeriodRangeOrNull();
  const st = computeVenditoreStats(db, range);
  appRoot.innerHTML = `
    ${renderPeriodBar()}
    <section class="kpi-grid">
      <div class="kpi-card"><div class="kpi-value">${st.assegnati}</div><div class="kpi-label">Assegnati</div></div>
      <div class="kpi-card"><div class="kpi-value">${st.presentati}</div><div class="kpi-label">Presentati</div></div>
      <div class="kpi-card"><div class="kpi-value">${st.chiusi}</div><div class="kpi-label">Chiusi</div></div>
      <div class="kpi-card"><div class="kpi-value">${fmtNumIt(st.commissioniTot, true)}</div><div class="kpi-label">Commissioni</div></div>
    </section>
    <section class="card">
      <h3>Tassi</h3>
      <div class="rates-row">
        ${rateCell(fmtPctIt(st.showRate), 'Show rate', `${st.presentati} presentati su ${st.showRateBase}`)}
        ${rateCell(fmtPctIt(st.conversionRate), 'Closing', 'chiusi su presentati in target')}
        ${rateCell(fmtNumIt(st.scontrinoMedio, true), 'Scontrino medio', `${st.chiusi} ${st.chiusi === 1 ? 'chiuso' : 'chiusi'}`)}
        ${rateCell(fmtNumIt(st.totalVenduto, true), 'Totale venduto', 'appuntamenti chiusi')}
      </div>
    </section>
    ${LeadCRM.renderNewStatsSection(range)}
  `;
  wirePeriodBar(renderVenditoreStatistiche);
}

/* ---------- Dashboard ---------- */

/* ---------- Dashboard: Task da fare (restyling 17/10/2026, step 5; semplificate 24/10) ----------
 * Due blocchi, Setting e Venditore (Simone, 24/10: T2; con la parte Venditore spenta uno solo).
 * Righe tutte uguali (T4): icona, nome, cosa fare, quando, UN tasto a destra. In ogni blocco
 * l'ordine è prima per priorità e poi per scadenza (la più vicina in alto):
 *   1  Conferme degli appuntamenti Setter (getPendingConfirmAppointments, da mezzanotte:
 *      il banner delle 18 resta): una riga sola "N da confermare" (T1).
 *   2  Da richiamare di oggi e scaduti non fatti · "N da recuperare" (Round Recupero,
 *      una riga sola) · azioni dei lead Venditore (oggi + scadute, da esitare, lead senza
 *      prossima azione: LeadCRM.dashboardTaskItems, solo con la parte Venditore accesa).
 *      Le tre stanno nella stessa priorità e si ordinano per scadenza tra loro.
 *   3  Task scritte a mano (db.tasks): restano finché non sono spuntate (doneAt), data
 *      rossa se scadute. Spuntate non si cancellano.
 * Più di 8 righe: prime 8 +
 * "Mostra tutte (N)". Un solo pulsante nero nella vista: "+ Task" in alto a destra. */
const DASH_TASKS_LIMIT = 6; // righe per blocco prima di "Mostra tutte"
const DAY_SHORT_IT = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

/** "oggi", "ieri", "domani" o "gio 15/10" per una data YYYY-MM-DD. */
function relDayLabel(key) {
  const d = new Date(key + 'T12:00');
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'oggi';
  if (diff === -1) return 'ieri';
  if (diff === 1) return 'domani';
  return DAY_SHORT_IT[d.getDay()] + ' ' + String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
}
/* Icone outline (stesso tratto della barra laterale) per le righe delle Task. */
const TASK_ICONS = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
  message: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  play: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>'
};
function taskIconSvg(name) {
  return `<svg class="task-ico" viewBox="0 0 24 24" aria-hidden="true">${TASK_ICONS[name] || TASK_ICONS.check}</svg>`;
}
function dueLabel(due, hasTime) {
  return relDayLabel(String(due).slice(0, 10)) + (hasTime ? ' · ' + String(due).slice(11, 16) : '');
}

function collectDashboardTasks() {
  const items = [];
  const todayKey = dateInputValue(new Date());
  // 1 — Conferme: una riga sola (T1). Il tasto apre il round dal primo appuntamento.
  const conf = getPendingConfirmAppointments().slice().sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)));
  if (conf.length) {
    const days = [...new Set(conf.map(a => String(a.scheduledAt).slice(0, 10)))].sort();
    items.push({
      prio: 1, id: 'conf', role: 'setter', icon: 'check', noLate: true,
      due: todayKey + 'T00:00', hasTime: false,
      titleHtml: `${conf.length} da confermare`,
      subHtml: 'Round Conferme',
      whenHtml: 'per ' + days.map(relDayLabel).join(', '),
      actionsHtml: `<button class="btn-ghost btn-sm" data-task-confirm="${conf[0].id}">Inizia</button>`
    });
  }
  // 2a — Da richiamare: oggi e scaduti non fatti.
  (db.callbacks || []).filter(c => c.status === 'pending' && c.scheduledAt && String(c.scheduledAt).slice(0, 10) <= todayKey).forEach(c => items.push({
    prio: 2, id: 'cb-' + c.id, role: 'setter', icon: 'phone',
    due: String(c.scheduledAt).slice(0, 16), hasTime: true,
    titleHtml: escapeHtml(c.leadName || '(senza nome)'),
    subHtml: 'Da richiamare',
    actionsHtml: `<button class="btn-ghost btn-sm" data-task-call="${c.id}">Chiama</button>`
  }));
  // 2b — Round Recupero: una riga per ruolo (Simone, 24/10), con i conteggi che il round
  // mostra davvero. Ognuna apre il round solo con le sue persone.
  ['setter', 'venditore'].forEach(role => {
    const n = visibleRecoveryEntries().filter(e => recoveryEntryRole(e) === role).length;
    if (n > 0) items.push({
      prio: 2, id: 'recovery-' + role, role, icon: 'refresh', noLate: true,
      due: todayKey + 'T00:00', hasTime: false,
      titleHtml: `${n} da recuperare`,
      subHtml: 'Round Recupero', whenHtml: 'oggi',
      actionsHtml: `<button class="btn-ghost btn-sm" data-task-recovery="${role}">Inizia</button>`
    });
  });
  // 2c — Lead Venditore (vuoto se la parte Venditore è spenta).
  LeadCRM.dashboardTaskItems().forEach(it => items.push(Object.assign({ prio: 2, role: 'venditore' }, it)));
  // 3 — Task scritte a mano.
  // Con la parte Venditore spenta le task Venditore stanno nell'unico blocco.
  (db.tasks || []).filter(t => !t.doneAt).forEach(t => items.push({
    prio: 3, id: 'task-' + t.id, role: t.role === 'venditore' && LeadCRM.isOn() ? 'venditore' : 'setter', icon: 'check',
    due: (t.dueDate || todayKey) + 'T' + (t.dueTime || '00:00'), hasTime: !!t.dueTime,
    titleHtml: escapeHtml(t.text || ''), subHtml: 'Task',
    actionsHtml: `<button class="btn-ghost btn-sm" data-task-done="${t.id}">Fatto</button>`
  }));

  const nowV = localDateTimeValue(new Date());
  items.forEach(it => {
    if (it.late === undefined) it.late = !it.noLate && (it.hasTime ? it.due < nowV : it.due.slice(0, 10) < todayKey);
    if (it.whenHtml === undefined) it.whenHtml = escapeHtml(dueLabel(it.due, it.hasTime));
  });
  items.sort((a, b) => a.prio - b.prio || a.due.localeCompare(b.due) || a.id.localeCompare(b.id));
  return items;
}

/** Riga uguale per tutti (T4): icona, nome, cosa fare, quando, un tasto. */
function renderDashboardTaskRow(it) {
  return `
    <div class="task-row ${it.late ? 'is-late' : ''}">
      <div class="task-lead">${taskIconSvg(it.icon)}</div>
      <div class="task-main">
        <div class="task-title">${it.titleHtml}</div>
        ${it.subHtml ? `<div class="task-sub">${it.subHtml}</div>` : ''}
      </div>
      <span class="task-when ${it.late ? 'late' : ''}">${it.whenHtml}</span>
      <div class="task-actions">${it.actionsHtml || ''}</div>
    </div>`;
}

/** Un blocco (Setting o Venditore): titolo, righe, "Mostra tutte" se sono tante. */
function renderDashboardTaskGroup(role, title, items) {
  const showAll = !!(uiState.dashTasksAll && uiState.dashTasksAll[role]);
  const visible = showAll ? items : items.slice(0, DASH_TASKS_LIMIT);
  return `
    <div class="task-group">
      ${title ? `<div class="task-group-head"><h3>${title}</h3>${items.length ? `<span class="count-pill">${items.length}</span>` : ''}</div>` : ''}
      ${items.length ? `<div class="task-list">${visible.map(renderDashboardTaskRow).join('')}</div>` : '<p class="dash-list-empty">Niente da fare.</p>'}
      ${items.length > DASH_TASKS_LIMIT ? `<button class="linkish dash-list-more" data-tasks-more="${role}">${showAll ? 'Mostra meno' : `Mostra tutte (${items.length})`}</button>` : ''}
    </div>`;
}

function renderDashboardTasks() {
  const items = collectDashboardTasks();
  const two = LeadCRM.isOn();
  return `
    <section class="card dash-list-card" id="dashTasks">
      <div class="dash-list-head"><h2>Task da fare</h2></div>
      <div class="task-cols ${two ? 'two' : ''}">
        ${renderDashboardTaskGroup('setter', two ? 'Setting' : '', items.filter(it => it.role !== 'venditore'))}
        ${two ? renderDashboardTaskGroup('venditore', 'Venditore', items.filter(it => it.role === 'venditore')) : ''}
      </div>
    </section>`;
}

function wireDashboardTasks() {
  const root = document.getElementById('dashTasks');
  if (!root) return;
  root.querySelectorAll('[data-tasks-more]').forEach(b => b.addEventListener('click', () => {
    uiState.dashTasksAll = Object.assign({}, uiState.dashTasksAll);
    uiState.dashTasksAll[b.dataset.tasksMore] = !uiState.dashTasksAll[b.dataset.tasksMore];
    renderDashboard();
  }));
  root.querySelectorAll('[data-task-done]').forEach(b => b.addEventListener('click', () => {
    const t = (db.tasks || []).find(x => x.id === b.dataset.taskDone);
    if (!t) return;
    t.doneAt = new Date().toISOString(); // non si cancella: resta nei dati come fatta
    persist();
    renderDashboard();
    showToast('Fatto: ' + t.text);
  }));
  root.querySelectorAll('[data-task-confirm]').forEach(b => b.addEventListener('click', () => {
    db.confirmRoundActive = true;
    db.confirmRoundCurrentApptId = b.dataset.taskConfirm;
    db.confirmRoundReturnMode = 'standalone';
    db.confirmRoundPendingPipelineId = null;
    persist();
    renderRoute();
  }));
  root.querySelectorAll('[data-task-call]').forEach(b => b.addEventListener('click', () => startCallbackCall(b.dataset.taskCall)));
  root.querySelectorAll('[data-task-recovery]').forEach(b => b.addEventListener('click', () => {
    db.recoveryRoundActive = true;
    db.recoveryRoundRole = b.dataset.taskRecovery;
    db.recoveryRoundCurrentLeadId = null;
    persist();
    renderRoute();
  }));
  // Righe Venditore: scheda lead, Com'è finita?, Fatto, Sposta, Imposta prossima azione (lead.js).
  LeadCRM.wireRowButtons(root);
}

/** "+ Task": cosa devo fare (obbligatorio), ruolo, giorno (obbligatorio) e ora (facoltativa). */
function openNewTaskModal() {
  let role = 'setter';
  openModal(`
    <div class="lead-modal">
      <h3>Nuova task</h3>
      <label class="field">Cosa devo fare<input type="text" id="taskText" maxlength="200" placeholder="Es. mandare il listino a Centro Prova"></label>
      <span class="mlabel">Ruolo</span>
      <div class="choice" id="taskRole">
        <button type="button" data-v="setter" class="sel">Setter</button>
        <button type="button" data-v="venditore">Venditore</button>
      </div>
      <div class="mrow">
        <label class="field">Giorno<input type="date" id="taskDate" value="${dateInputValue(new Date())}"></label>
        <label class="field">Ora (facoltativa)<input type="time" id="taskTime" value=""></label>
      </div>
      <div class="mwarn" id="taskWarn"></div>
      <div class="modal-actions">
        <button class="btn-ghost" id="taskCancel">Annulla</button>
        <button class="btn-primary" id="taskSave">Aggiungi</button>
      </div>
    </div>
  `);
  const text = document.getElementById('taskText');
  text.focus();
  document.querySelectorAll('#taskRole button').forEach(b => b.addEventListener('click', () => {
    role = b.dataset.v;
    document.querySelectorAll('#taskRole button').forEach(x => x.classList.toggle('sel', x === b));
  }));
  document.getElementById('taskCancel').addEventListener('click', closeModal);
  const save = () => {
    const warn = document.getElementById('taskWarn');
    const t = text.value.trim();
    const d = document.getElementById('taskDate').value;
    if (!t) { warn.textContent = 'Scrivi cosa devi fare.'; text.focus(); return; }
    if (!d) { warn.textContent = 'Scegli il giorno.'; return; }
    db.tasks = Array.isArray(db.tasks) ? db.tasks : [];
    db.tasks.push({ id: uid('task'), text: t, role, dueDate: d, dueTime: document.getElementById('taskTime').value || '', createdAt: new Date().toISOString(), doneAt: null });
    persist();
    closeModal();
    renderRoute();
    showToast('Task aggiunta.');
  };
  document.getElementById('taskSave').addEventListener('click', save);
  text.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
}


/* ---------- Dashboard: Prossimi pagamenti (restyling 17/10/2026, step 7) ----------
 * Tutte le rate NON pagate degli appuntamenti chiusi, Setter e Venditore insieme, per
 * scadenza. Fonte: getEffectiveInstallments (l'acconto sintetico è sempre già pagato e
 * non compare). Venditore: TUTTI gli appuntamenti chiusi del lead (Simone, 18/10: "voglio
 * vederle tutte"). Ogni riga resta
 * legata alla sua rata vera. Righe Venditore nascoste se la parte Venditore è spenta.
 * Riga: nome del CENTRO (mai la persona: se manca, nome del lead in grigio + etichetta
 * "centro mancante" che pulsa + "Aggiungi centro"; in cima l'avviso "N clienti senza nome
 * del centro", vedi clientsMissingCenter), scadenza (rossa se passata), importo, ruolo, venditore (solo Setter),
 * spunta "Pagato": rata vera in apt.installments -> paid + paidDate di oggi. La
 * commissione la ricalcola commissionEventsForAppointment (giorno del pagamento). */
const DASH_PAYMENTS_LIMIT = 10;

function collectUpcomingPayments() {
  const out = [];
  const leadsById = {};
  (db.leads || []).forEach(l => { leadsById[l.id] = l; });
  db.appointments.forEach(a => {
    if (!a.closed) return;
    let lead = null;
    if (a.role === 'venditore') {
      if (!LeadCRM.isOn()) return;
      lead = a.leadId ? leadsById[a.leadId] : null;
    } else if (a.role !== 'setter') return;
    getEffectiveInstallments(a).forEach(inst => {
      if (inst.paid || inst.isDeposit) return;
      const centro = String(a.centerName || (lead && lead.centro) || '').trim();
      const person = lead ? lead.name : (a.role === 'venditore' ? LeadCRM.parseApptName(a.clientName).name : a.clientName);
      const dueRaw = String(inst.dueDate || '');
      const due = /^\d{4}-\d{2}-\d{2}/.test(dueRaw) ? dueRaw.slice(0, 10) : (dueRaw ? dateInputValue(dueRaw) : '');
      out.push({ apt: a, inst, role: a.role, centro, person: person || '(senza nome)', due, missingKey: centerMissingKeyOf(a, lead) });
    });
  });
  // Per scadenza; quelle senza data in fondo.
  out.sort((x, y) => (x.due || '9999').localeCompare(y.due || '9999') || x.centro.localeCompare(y.centro));
  return out;
}

/* ---------- Centro mancante (Simone, 18/10/2026) ----------
 * Senza il nome del centro Simone fatica a ritrovare le rate sul gruppo: deve saltare
 * all'occhio. Etichetta unica centerMissingTagHtml (pallino che pulsa piano, accento;
 * fermo con prefers-reduced-motion) su: righe di Prossimi pagamenti, appuntamenti Setter
 * chiusi in Setting → Appuntamenti, lead Cliente in Venditore → Lead e nella scheda.
 * "Aggiungi centro" apre openCenterNameModal: scrive apt.centerName (solo dove è vuoto)
 * e, per il Venditore, lead.centro se è vuoto. Un cliente = un appuntamento Setter chiuso,
 * oppure un lead Venditore (tutti i suoi appuntamenti chiusi insieme). */
function centerMissingTagHtml() {
  return '<span class="cm-tag"><i class="cm-dot" aria-hidden="true"></i>centro mancante</span>';
}
function aptCenterOf(a, lead) { return String((a && a.centerName) || (lead && lead.centro) || '').trim(); }

/** Clienti chiusi senza nome del centro: [{ key, role, name, apts, lead }]. Venditore
 * solo se la parte Venditore è accesa (come le righe di Prossimi pagamenti). */
function clientsMissingCenter() {
  const out = [];
  const byKey = {};
  const leadsById = {};
  (db.leads || []).forEach(l => { leadsById[l.id] = l; });
  db.appointments.forEach(a => {
    if (!a.closed) return;
    if (a.role === 'setter') {
      if (!aptCenterOf(a, null)) out.push({ key: a.id, role: 'setter', name: a.clientName || '(senza nome)', apts: [a], lead: null });
      return;
    }
    if (a.role !== 'venditore' || !LeadCRM.isOn()) return;
    const lead = a.leadId ? leadsById[a.leadId] || null : null;
    if (aptCenterOf(a, lead)) return;
    const key = lead ? 'lead:' + lead.id : a.id;
    if (byKey[key]) { byKey[key].apts.push(a); return; }
    const it = { key, role: 'venditore', name: (lead ? lead.name : LeadCRM.parseApptName(a.clientName).name) || '(senza nome)', apts: [a], lead };
    byKey[key] = it;
    out.push(it);
  });
  return out;
}
function centerMissingKeyOf(a, lead) { return a.role === 'venditore' && lead ? 'lead:' + lead.id : a.id; }

/** Scrive il centro sul cliente: appuntamenti chiusi senza centro + lead.centro se vuoto. */
function saveClientCenter(t, value) {
  t.apts.forEach(a => { if (!String(a.centerName || '').trim()) a.centerName = value; });
  if (t.lead && !String(t.lead.centro || '').trim()) t.lead.centro = value;
}

/** Modale "Aggiungi centro": un campo per cliente (uno solo dal tasto di una riga, tutti
 * dall'avviso in cima a Prossimi pagamenti). I campi lasciati vuoti non cambiano niente. */
function openCenterNameModal(targets, onDone) {
  targets = (targets || []).filter(Boolean);
  if (!targets.length) return;
  const single = targets.length === 1;
  const roleTag = t => `<span class="role-pill ${t.role}">${t.role === 'venditore' ? 'Venditore' : 'Setter'}</span>`;
  openModal(`
    <h3>${single ? 'Nome del centro · ' + escapeHtml(targets[0].name) : 'Clienti senza nome del centro'}</h3>
    <p class="text-dim cm-modal-sub">Serve a ritrovare le rate del cliente in Prossimi pagamenti.${single ? '' : ' Lascia vuoto chi non sai ancora.'}</p>
    <div class="cm-list">
      ${targets.map((t, i) => `<label class="field cm-field">${single ? 'Nome del centro' : `<span class="cm-field-name">${escapeHtml(t.name)} ${roleTag(t)}</span>`}<input type="text" data-cm-input="${i}" maxlength="120" placeholder="Es. Centro Prova 1"></label>`).join('')}
    </div>
    <div class="modal-actions">
      <button class="btn-ghost" id="cmCancel">Annulla</button>
      <button class="btn-primary" id="cmSave">Salva</button>
    </div>
  `);
  const first = modalRoot.querySelector('[data-cm-input]');
  if (first) first.focus();
  document.getElementById('cmCancel').addEventListener('click', closeModal);
  const save = () => {
    let n = 0;
    modalRoot.querySelectorAll('[data-cm-input]').forEach(inp => {
      const v = inp.value.trim();
      if (!v) return;
      saveClientCenter(targets[Number(inp.dataset.cmInput)], v);
      n++;
    });
    if (!n) { showToast('Scrivi il nome del centro.', true); if (first) first.focus(); return; }
    persist();
    closeModal();
    showToast(n === 1 ? 'Centro salvato.' : `Centri salvati: ${n}.`);
    if (onDone) onDone();
  };
  document.getElementById('cmSave').addEventListener('click', save);
  modalRoot.querySelectorAll('[data-cm-input]').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') save(); }));
}

/** Tasti "Aggiungi centro" ([data-add-center-key]) dentro root. */
function wireAddCenterButtons(root, onDone) {
  if (!root) return;
  root.querySelectorAll('[data-add-center-key]').forEach(b => b.addEventListener('click', e => {
    e.preventDefault();
    const t = clientsMissingCenter().find(x => x.key === b.dataset.addCenterKey);
    if (t) openCenterNameModal([t], onDone);
  }));
}

function fmtEuroIt(n) { return '€' + round2(Number(n) || 0).toLocaleString('it-IT'); }

function renderDashboardPayments() {
  const items = collectUpcomingPayments();
  const showAll = !!uiState.dashPaymentsAll;
  const visible = showAll ? items : items.slice(0, DASH_PAYMENTS_LIMIT);
  const todayKey = dateInputValue(new Date());
  const row = p => {
    const late = !!p.due && p.due < todayKey;
    const title = p.centro
      ? `<span class="task-title">${escapeHtml(p.centro)}</span>`
      : `<span class="task-title pay-noname">${escapeHtml(p.person)}</span> ${centerMissingTagHtml()} <button type="button" class="linkish cm-add" data-add-center-key="${escapeHtml(p.missingKey)}">Aggiungi centro</button>`;
    const sub = [escapeHtml(p.inst.label || 'Rata'), p.role === 'setter' && p.apt.venditoreName ? 'Venditore: ' + escapeHtml(p.apt.venditoreName) : ''].filter(Boolean).join(' · ');
    return `
      <div class="task-row pay-row ${late ? 'is-late' : ''} ${p.centro ? '' : 'no-center'}">
        <div class="task-lead">${taskIconSvg('calendar')}</div>
        <div class="task-main"><div>${title}</div><div class="task-sub">${sub}</div></div>
        <div class="task-meta">
          <span class="task-when ${late ? 'late' : ''}">${p.due ? escapeHtml(relDayLabel(p.due)) + (late ? ' · scaduta' : '') : 'senza data'}</span>
          <span class="role-pill ${p.role}">${p.role === 'venditore' ? 'Venditore' : 'Setter'}</span>
        </div>
        <div class="task-actions">
          <span class="pay-amount">${fmtEuroIt(p.inst.amount)}</span>
          <label class="pay-tick"><input type="checkbox" data-pay-apt="${p.apt.id}" data-pay-inst="${p.inst.id}"> Pagato</label>
        </div>
      </div>`;
  };
  const missing = clientsMissingCenter();
  const warn = missing.length ? `
      <div class="cm-warn" role="status">
        <i class="cm-dot" aria-hidden="true"></i>
        <span><b>${missing.length} client${missing.length === 1 ? 'e' : 'i'}</b> senza nome del centro</span>
        <button type="button" class="btn-ghost btn-sm" id="btnAddCenters">Aggiungi</button>
      </div>` : '';
  return `
    <section class="card dash-list-card" id="dashPayments">
      <div class="dash-list-head">
        <h2>Prossimi pagamenti</h2>
        ${items.length ? `<span class="count-pill">${items.length}</span>` : ''}
      </div>
      ${warn}
      ${items.length ? `<div class="task-list">${visible.map(row).join('')}</div>` : '<p class="dash-list-empty">Nessuna rata da incassare.</p>'}
      ${items.length > DASH_PAYMENTS_LIMIT ? `<button class="linkish dash-list-more" id="btnPaymentsMore">${showAll ? 'Mostra meno' : `Mostra tutti (${items.length})`}</button>` : ''}
    </section>`;
}

function wireDashboardPayments() {
  const root = document.getElementById('dashPayments');
  if (!root) return;
  const more = document.getElementById('btnPaymentsMore');
  if (more) more.addEventListener('click', () => { uiState.dashPaymentsAll = !uiState.dashPaymentsAll; renderDashboard(); });
  const addAll = document.getElementById('btnAddCenters');
  if (addAll) addAll.addEventListener('click', () => openCenterNameModal(clientsMissingCenter(), renderDashboard));
  wireAddCenterButtons(root, renderDashboard);
  root.querySelectorAll('[data-pay-inst]').forEach(cb => cb.addEventListener('change', () => {
    const apt = db.appointments.find(a => a.id === cb.dataset.payApt);
    // La rata VERA (non la copia di getEffectiveInstallments): è quella che vedono la
    // tabella Setting, il popup rate e la scheda lead → Pagamenti.
    const inst = apt && (apt.installments || []).find(i => i.id === cb.dataset.payInst);
    if (!inst || inst.paid) return;
    inst.paid = true;
    inst.paidDate = dateInputValue(new Date());
    if (apt.role === 'venditore') LeadCRM.onInstallmentPaid(apt, inst);
    persist();
    renderDashboard();
    showToast('Pagato: ' + fmtEuroIt(inst.amount) + (apt.centerName ? ' · ' + apt.centerName : '') + '.');
  }));
}

/* ---------- Grafico a ciambella (restyling 17/10/2026, step 8) ----------
 * Un solo componente SVG, senza librerie: renderDonut(data, opts).
 * Forma dalla reference "Chiamata per stato": totale grande al centro con la scritta
 * sotto, etichette fuori con linea di collegamento (nome, numero, percentuale).
 * Colori SOLO dalla guida: fetta più grande accent-500, poi 400/300/200/100 in ordine
 * decrescente, il resto neutral-200. Una fetta "muted" (es. rate future) è sempre
 * neutral-200 e non entra nella classifica dei colori.
 * - Fetta a 0: non disegnata, ma nella legenda con 0.
 * - Totale 0: anello grigio + "Nessun dato nel periodo".
 * - Le etichette di un lato si spingono in giù/su per non sovrapporsi; la colonna del
 *   testo resta dentro il viewBox (l'SVG non deborda dalla card).
 * - Card stretta (sotto 470 px, container query): niente etichette esterne, solo
 *   l'anello + legenda sotto con numero e percentuale.
 * data: [{ key, label, value, muted?, note? }]
 * opts: { money, centerLabel, centerLines: [testo], id, ariaLabel }
 */
const DONUT_RAMP = ['var(--accent-500)', 'var(--accent-400)', 'var(--accent-300)', 'var(--accent-200)', 'var(--accent-100)'];
const DONUT_W = 540;      // larghezza del viewBox (le etichette stanno dentro)
const DONUT_R = 84;       // raggio esterno
const DONUT_RI = 62;      // raggio interno (spessore 22)
const DONUT_LH = 36;      // altezza di un'etichetta (due righe)

/** Numero in italiano ("1.234,5"), con " €" se money. */
function fmtNumIt(n, money) {
  const v = round2(Number(n) || 0).toLocaleString('it-IT', { maximumFractionDigits: 2 });
  return money ? v + ' €' : v;
}
function fmtPctIt(p) { return round1(p).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + '%'; }

/** Colori per rango (vedi commento sopra). Ritorna gli item con color e pct. */
function donutItems(data) {
  const items = (data || []).map(d => Object.assign({}, d, { value: Math.max(0, round2(Number(d.value) || 0)) }));
  const total = round2(items.reduce((s, d) => s + d.value, 0));
  items.filter(d => d.value > 0 && !d.muted)
    .slice().sort((a, b) => b.value - a.value) // sort stabile: a pari valore vince l'ordine dato
    .forEach((d, i) => { d.color = DONUT_RAMP[i] || 'var(--neutral-200)'; });
  items.forEach(d => {
    if (!d.color) d.color = 'var(--neutral-200)';
    d.pct = total > 0 ? d.value / total * 100 : 0;
  });
  return { items, total };
}

/** Anello: un cerchio per fetta con stroke-dasharray (gestisce anche la fetta al 100%). */
function donutRingSvg(items, total, cx, cy) {
  const rm = (DONUT_R + DONUT_RI) / 2, sw = DONUT_R - DONUT_RI;
  const C = 2 * Math.PI * rm;
  const drawn = items.filter(d => d.value > 0);
  if (!(total > 0)) {
    return `<circle class="donut-empty-ring" cx="${cx}" cy="${cy}" r="${rm}" stroke-width="${sw}" fill="none"/>`;
  }
  const gap = drawn.length > 1 ? 2.5 : 0; // 2 px di superficie tra le fette
  let cum = 0;
  return drawn.map(d => {
    const frac = d.value / total;
    const len = Math.max(0.6, frac * C - gap);
    const off = -(cum * C + gap / 2);
    cum += frac;
    const tip = `${d.label}: ${fmtNumIt(d.value, d.money)} (${fmtPctIt(d.pct)})`;
    return `<circle class="donut-slice" data-key="${escapeHtml(d.key)}" cx="${cx}" cy="${cy}" r="${rm}" fill="none"
      stroke="${d.color}" stroke-width="${sw}" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}"
      stroke-dashoffset="${off.toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"><title>${escapeHtml(tip)}</title></circle>`;
  }).join('');
}

/** Testo al centro: totale grande + righe piccole (o "Nessun dato nel periodo"). */
function donutCenterSvg(total, cx, cy, opts) {
  if (!(total > 0)) {
    return `<text class="donut-center-sub" x="${cx}" y="${cy - 3}" text-anchor="middle">Nessun dato</text>
      <text class="donut-center-sub" x="${cx}" y="${cy + 13}" text-anchor="middle">nel periodo</text>`;
  }
  const big = fmtNumIt(total, opts.money);
  const size = big.length <= 5 ? 26 : (big.length <= 8 ? 21 : 17);
  const lines = [opts.centerLabel].concat(opts.centerLines || []).filter(Boolean);
  const blockH = size + lines.length * 15;
  let y = cy - blockH / 2 + size * 0.8;
  let out = `<text class="donut-center-num" x="${cx}" y="${y.toFixed(1)}" text-anchor="middle" style="font-size:${size}px">${escapeHtml(big)}</text>`;
  lines.forEach((t, i) => {
    y += i === 0 ? size * 0.2 + 14 : 15;
    out += `<text class="donut-center-sub" x="${cx}" y="${y.toFixed(1)}" text-anchor="middle">${escapeHtml(t)}</text>`;
  });
  return out;
}

/** Etichette esterne con linea: per lato, ordinate per altezza e spinte per non toccarsi. */
function donutLabelsSvg(items, total, cx, cy, H) {
  if (!(total > 0)) return '';
  let cum = 0;
  const labels = [];
  items.forEach(d => {
    if (!(d.value > 0)) return;
    const frac = d.value / total;
    const th = -Math.PI / 2 + (cum + frac / 2) * 2 * Math.PI;
    cum += frac;
    const cos = Math.cos(th), sin = Math.sin(th);
    labels.push({
      d, side: cos >= 0 ? 'r' : 'l',
      ax: cx + cos * (DONUT_R + 3), ay: cy + sin * (DONUT_R + 3),
      ey: cy + sin * (DONUT_R + 14)
    });
  });
  const top = 14, bottom = H - DONUT_LH + 8;
  ['l', 'r'].forEach(side => {
    const list = labels.filter(l => l.side === side).sort((a, b) => a.ey - b.ey);
    const push = () => list.forEach((l, i) => { l.y = Math.max(l.y, top, i ? list[i - 1].y + DONUT_LH : top); });
    list.forEach(l => { l.y = l.ey; });
    push(); // in giù, dall'alto
    const over = list.length ? list[list.length - 1].y - bottom : 0;
    if (over > 0) { list.forEach(l => { l.y -= over; }); push(); } // troppo in basso: tutto su
  });
  const colR = cx + DONUT_R + 40, colL = cx - DONUT_R - 40;
  return labels.map(l => {
    const right = l.side === 'r';
    // Gomito alla stessa x per tutte le etichette di un lato (fuori dall'anello): le linee
    // seguono l'ordine delle fette e non si incrociano.
    const kneeX = right ? cx + DONUT_R + 22 : cx - DONUT_R - 22;
    const endX = right ? colR - 6 : colL + 6;
    const tx = right ? colR : colL;
    const anchor = right ? 'start' : 'end';
    const pts = [[l.ax, l.ay], [kneeX, l.y], [endX, l.y]].map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const name = l.d.label + (l.d.note ? ' (' + l.d.note + ')' : '');
    return `<polyline class="donut-leader" points="${pts}" fill="none"/>
      <text class="donut-lab-name" x="${tx}" y="${(l.y + 4).toFixed(1)}" text-anchor="${anchor}">${escapeHtml(name)}</text>
      <text class="donut-lab-val" x="${tx}" y="${(l.y + 21).toFixed(1)}" text-anchor="${anchor}"><tspan class="v">${escapeHtml(fmtNumIt(l.d.value, l.d.money))}</tspan><tspan class="p"> · ${fmtPctIt(l.d.pct)}</tspan></text>`;
  }).join('');
}

function renderDonut(data, opts) {
  opts = opts || {};
  const money = !!opts.money;
  const { items, total } = donutItems((data || []).map(d => Object.assign({ money }, d)));
  // Altezza: abbastanza per l'anello e per tutte le etichette del lato più affollato.
  const perSide = { l: 0, r: 0 };
  let cum = 0;
  items.forEach(d => {
    if (!(d.value > 0) || !(total > 0)) return;
    const frac = d.value / total;
    const th = -Math.PI / 2 + (cum + frac / 2) * 2 * Math.PI; cum += frac;
    perSide[Math.cos(th) >= 0 ? 'r' : 'l']++;
  });
  const H = Math.max(2 * DONUT_R + 44, Math.max(perSide.l, perSide.r) * DONUT_LH + 24);
  const cx = DONUT_W / 2, cy = H / 2;
  const S = 2 * DONUT_R + 8, c2 = S / 2;
  const aria = escapeHtml(opts.ariaLabel || 'Grafico a ciambella');
  const legend = items.map(d => `
      <li class="donut-leg${d.value > 0 ? '' : ' zero'}" data-key="${escapeHtml(d.key)}" data-value="${d.value}">
        <i class="donut-dot" style="background:${d.color}"></i>
        <span class="donut-leg-lab">${escapeHtml(d.label)}${d.note ? ` <em>${escapeHtml(d.note)}</em>` : ''}</span>
        <span class="donut-leg-val">${escapeHtml(fmtNumIt(d.value, money))}</span>
        <span class="donut-leg-pct">${total > 0 ? fmtPctIt(d.pct) : '–'}</span>
      </li>`).join('');
  return `
    <div class="donut" ${opts.id ? `data-donut="${escapeHtml(opts.id)}"` : ''} data-total="${total}">
      <svg class="donut-wide" viewBox="0 0 ${DONUT_W} ${H}" role="img" aria-label="${aria}">
        ${donutRingSvg(items, total, cx, cy)}
        ${donutLabelsSvg(items, total, cx, cy, H)}
        ${donutCenterSvg(total, cx, cy, opts)}
      </svg>
      <svg class="donut-narrow" viewBox="0 0 ${S} ${S}" role="img" aria-label="${aria}">
        ${donutRingSvg(items, total, c2, c2)}
        ${donutCenterSvg(total, c2, c2, opts)}
      </svg>
      <ul class="donut-legend">${legend}</ul>
    </div>`;
}

/* ---------- Dashboard: i 4 grafici (restyling step 8, prompt 5.1.4) ----------
 * Setting a sinistra, Venditore a destra, due ciambelle per blocco. Numeri presi dalle
 * STESSE funzioni delle pagine Stats, con lo stesso periodo (getPeriodRangeOrNull:
 * "Tutto" = tutto lo storico), così sono identici per costruzione:
 * 1 Setting · Appuntamenti per esito: computeSetterStats().passatiPerEsito (Simone,
 *   18/10: per DATA DELL'APPUNTAMENTO, solo quelli già passati; spostati compresi).
 *   Centro = appuntamenti passati del periodo. Presentati/No show/Annullati = Stats.
 * 2 Setting · Commissioni: computeFunnelValues('setter') come le Stats (show 40 € a
 *   presentato + 3% dell'incassato). Centro = somma.
 * 3 Venditore · Appuntamenti per esito: computeVenditoreStats().assegnatiPerEsito
 *   (scheduledAt nel periodo, spostati esclusi, solo già passati: i futuri non sono mai
 *   "da esitare"). Centro = assegnati già passati: se il periodo comprende giorni futuri
 *   può essere minore di "Assegnati" delle Statistiche.
 * 4 Venditore · Commissioni: computeVenditoreStats() → acconti + rate pagate (=
 *   commissioniTot, la commissione effettiva) + rate future (solo informazione).
 * In "Migliore di sempre" il periodo è quello migliore (come il resto della Dashboard). */
function dashboardDonutRange() {
  return uiState.goalsPeriodMode === 'best' ? getDashboardRange() : getPeriodRangeOrNull();
}

function renderDashboardDonuts() {
  const range = dashboardDonutRange();
  const st = computeSetterStats(db, range);
  const sc = computeFunnelValues(db, 'setter', range || getPeriodRange());
  const fe = st.passatiPerEsito;
  const setterAppts = renderDonut([
    { key: 'presented', label: 'Presentati', value: fe.presented },
    { key: 'no_show', label: 'No show', value: fe.no_show },
    { key: 'annullato', label: 'Annullati', value: fe.annullato },
    { key: 'spostato', label: 'Spostati', value: fe.spostato },
    { key: 'confirmed24h', label: 'Confermati 24h', value: fe.confirmed24h },
    { key: 'no', label: 'Da esitare', value: fe.no }
  ], { id: 'setter-esiti', centerLabel: 'appuntamenti', ariaLabel: 'Appuntamenti Setter già passati, per esito' });
  const setterComm = renderDonut([
    { key: 'show', label: 'Da show', value: sc.commissioniShowUp || 0 },
    { key: 'venduto', label: 'Da venduto', value: sc.commissioniChiusure || 0 }
  ], { id: 'setter-comm', money: true, centerLabel: 'commissioni', ariaLabel: 'Commissioni Setter' });

  let venditoreBlock = '';
  if (LeadCRM.isOn()) {
    const vs = computeVenditoreStats(db, range);
    const ve = vs.assegnatiPerEsito;
    const vAppts = [
      { key: 'chiusi', label: 'Chiusi', value: ve.chiusi },
      { key: 'trattativa', label: 'In trattativa / follow-up', value: ve.trattativa },
      { key: 'perso', label: 'Persi', value: ve.perso },
      { key: 'no_show', label: 'No show', value: ve.no_show },
      { key: 'annullato', label: 'Annullati', value: ve.annullato },
      { key: 'non_in_target', label: 'Non in target', value: ve.non_in_target }
    ];
    // Passati senza esito (da esitare): fuori dalle 6 voci decise, ma senza di loro la
    // somma non tornerebbe. Compare solo se ce ne sono. I futuri non entrano.
    if (ve.altro > 0) vAppts.push({ key: 'altro', label: 'Da esitare', value: ve.altro });
    const incassati = vs.commissioniTot;
    venditoreBlock = `
      <div class="card donut-block">
        <div class="donut-block-head"><h3>Venditore</h3><a class="donut-more" href="#/venditore-statistiche">Statistiche →</a></div>
        <div class="donut-item">
          <h4>Appuntamenti per esito</h4>
          <p class="donut-sub">Già passati, per data dell'appuntamento</p>
          ${renderDonut(vAppts, { id: 'venditore-esiti', centerLabel: 'appuntamenti', ariaLabel: 'Appuntamenti Venditore già passati, per esito' })}
        </div>
        <div class="donut-item">
          <h4>Commissioni</h4>
          ${renderDonut([
            { key: 'acconti', label: 'Acconti incassati', value: vs.commAcconti },
            { key: 'rate', label: 'Rate pagate', value: vs.commRatePagate },
            { key: 'future', label: 'Rate future', note: 'in arrivo', value: vs.commRateFuture, muted: true }
          ], { id: 'venditore-comm', money: true, centerLines: ['di cui ' + fmtNumIt(incassati, true), 'incassati'], ariaLabel: 'Commissioni Venditore' })}
          <p class="donut-foot" data-incassati="${incassati}">Le rate future non sono commissioni incassate: contano quando le segni pagate.</p>
        </div>
      </div>`;
  }

  return `
    <section class="donut-blocks${venditoreBlock ? '' : ' single'}">
      <div class="card donut-block">
        <div class="donut-block-head"><h3>Setting</h3><a class="donut-more" href="#/setting-statistiche">Stats →</a></div>
        <div class="donut-item">
          <h4>Appuntamenti per esito</h4>
          <p class="donut-sub">Già passati, per data dell'appuntamento</p>
          ${setterAppts}
        </div>
        <div class="donut-item">
          <h4>Commissioni</h4>
          ${setterComm}
        </div>
      </div>
      ${venditoreBlock}
    </section>`;
}

/**
 * Dashboard (restyling 17/10/2026, prompt 5.1), in quest'ordine e nient'altro:
 * 1 Task da fare · 2 Prossimi pagamenti · 3 barra del periodo · 4 i quattro grafici a
 * ciambella (Setting a sinistra, Venditore a destra) · 5 sezioni a tutta larghezza:
 * Pace mese, Commissioni totali, Commissioni nel tempo, Totale venduto nel tempo ·
 * 6 Calendario commissioni.
 * Tolti (Simone, 17/10): funnel e barre degli obiettivi, righe dei tassi (stanno nelle
 * pagine Stats), countdown/frase/streak, ritmo di chiusura, personal best.
 * db.goals resta: l'obiettivo del mese serve a Pace mese.
 * Un solo pulsante nero nella vista: "+ Task" in alto a destra.
 */
function renderDashboard() {
  appRoot.innerHTML = `
    ${renderDashboardTasks()}
    ${renderDashboardPayments()}
    ${renderDashboardPeriodBar()}
    ${renderBestPeriodCaption()}
    ${renderDashboardDonuts()}
    ${renderMonthPaceSection()}
    ${renderCommissionKpiSection()}
    ${renderAndamentoCharts()}
    ${renderCommissioniCalendarSection()}
  `;
  wireDashboardTasks();
  wireDashboardPayments();
  wireDashboardSections();
  wireCommissioniCalendarSection();
  animateKpiValues(appRoot);
}

function rateCell(value, label, sub) {
  return `<div class="rate-cell"><div class="rate-val">${value}</div><div class="rate-lab">${escapeHtml(label)}</div>${sub ? `<div class="rate-sub">${sub}</div>` : ''}</div>`;
}

function trendItem(label, t) {
  const arrow = t.dir === 'up' ? '▲' : (t.dir === 'down' ? '▼' : '—');
  const cls = t.dir === 'up' ? 'trend-up' : (t.dir === 'down' ? 'trend-down' : 'trend-flat');
  return `
    <div class="trend-item">
      <div class="trend-label">${label}</div>
      <div class="trend-value ${cls}">${arrow} ${fmtPctIt(t.diff)}</div>
    </div>`;
}

/** Badge di trend della guida (↑ verde / ↓ rosso / = grigio). Unico posto con verde e rosso. */
function trendBadge(cur, prev) {
  if (!(prev > 0)) return '';
  const t = trendDelta(cur, prev);
  const sym = t.dir === 'up' ? '↑' : (t.dir === 'down' ? '↓' : '=');
  return `<span class="trend-badge ${t.dir}">${sym} ${String(t.diff).replace('.', ',')}%</span>`;
}

/* ---------- Pace mese (5.1.5 n. 1) ----------
 * A che cifra di commissioni chiudi il mese se tieni il ritmo attuale (computeMonthPace,
 * sempre sul mese corrente, non segue la barra del periodo). Con l'obiettivo del mese
 * (db.goals[ruolo].month) una barra pace / obiettivo; l'obiettivo si cambia con ✎. */
const MONTH_PACE_GOAL_KEY = { setter: 'commissioniTot', venditore: 'commissioniVendita' };

function renderMonthPaceCell(role, label) {
  const p = computeMonthPace(db, role);
  const key = MONTH_PACE_GOAL_KEY[role];
  const goal = Number(((db.goals[role] || {}).month || {})[key]) || 0;
  const editing = uiState.editingPaceGoal === role;
  const pctGoal = goal > 0 ? Math.min(100, Math.round(p.pace / goal * 100)) : 0;
  const goalHtml = editing
    ? `<label class="pace-goal-edit">Obiettivo del mese <input type="number" min="0" step="50" id="paceGoalInput" data-role="${role}" value="${goal || ''}" placeholder="€"></label>`
    : `<button class="pace-goal-btn" data-pace-goal="${role}" title="Modifica l'obiettivo del mese">${goal > 0 ? 'Obiettivo ' + fmtNumIt(goal, true) : 'Imposta obiettivo'} ✎</button>`;
  return `
    <div class="pace-cell">
      <div class="pace-cell-head"><span class="pace-cell-label">${escapeHtml(label)}</span>${goalHtml}</div>
      <div class="pace-cell-num" data-kpi-num="${p.pace}" data-kpi-money="0" data-kpi-display="${fmtNumIt(p.pace, true)}">${fmtNumIt(p.pace, true)}</div>
      <div class="pace-cell-sub">finora ${fmtNumIt(p.soFar, true)} · giorno ${p.elapsed} di ${p.total} (lun-ven)</div>
      ${goal > 0 ? `<div class="pace-goal-bar" title="Pace sul ${pctGoal}% dell'obiettivo"><i style="width:${pctGoal}%"></i></div>
      <div class="pace-cell-sub">${p.pace >= goal ? 'Al ritmo attuale arrivi all\'obiettivo' : 'Al ritmo attuale mancano ' + fmtNumIt(goal - p.pace, true)}</div>` : ''}
    </div>`;
}

function renderMonthPaceSection() {
  const month = new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  return `
    <section class="card dash-section">
      <div class="dash-section-head">
        <h3>Pace mese</h3>
        <span class="dash-section-note">${escapeHtml(month)} · commissioni a fine mese se tieni questo ritmo</span>
      </div>
      <div class="pace-grid">
        ${renderMonthPaceCell('setter', 'Setter')}
        ${LeadCRM.isOn() ? renderMonthPaceCell('venditore', 'Venditore') : ''}
      </div>
    </section>`;
}

/** Eventi delle sezioni sotto i pagamenti (periodo, Migliore di sempre, obiettivo Pace
 * mese, filtro ruolo del grafico Commissioni, cursore dei grafici a linee). */
function wireDashboardSections() {
  wirePeriodBar(renderDashboard, () => { uiState.goalsPeriodMode = 'current'; });
  appRoot.querySelectorAll('[data-goals-tf]').forEach(btn => btn.addEventListener('click', () => {
    uiState.goalsTimeframe = btn.dataset.goalsTf;
    renderDashboard();
  }));
  appRoot.querySelectorAll('[data-goals-period-mode]').forEach(btn => btn.addEventListener('click', () => {
    uiState.goalsPeriodMode = 'best';
    renderDashboard();
  }));
  appRoot.querySelectorAll('[data-pace-goal]').forEach(btn => btn.addEventListener('click', () => {
    uiState.editingPaceGoal = btn.dataset.paceGoal;
    renderDashboard();
    const inp = document.getElementById('paceGoalInput');
    if (inp) { inp.focus(); inp.select(); }
  }));
  const goalInput = document.getElementById('paceGoalInput');
  if (goalInput) {
    let done = false;
    const commit = (save) => {
      if (done) return; done = true;
      const role = goalInput.dataset.role;
      if (save) {
        db.goals[role].month[MONTH_PACE_GOAL_KEY[role]] = Math.max(0, parseFloat(goalInput.value) || 0);
        persist();
      }
      uiState.editingPaceGoal = null;
      renderDashboard();
    };
    goalInput.addEventListener('keydown', e => { if (e.key === 'Enter') commit(true); if (e.key === 'Escape') commit(false); });
    goalInput.addEventListener('blur', () => commit(true));
  }
  appRoot.querySelectorAll('[data-andamento-comm-role]').forEach(btn => btn.addEventListener('click', () => {
    uiState.andamentoCommRole = btn.dataset.andamentoCommRole;
    renderDashboard();
  }));
  wireLineCharts(appRoot);
}

const TIMEFRAME_KEYS = ['day', 'week', 'month'];
const BEST_PERIOD_LABELS = { day: 'Miglior giorno', week: 'Migliore settimana', month: 'Miglior mese' };

/* ---------- "Migliore di sempre" (Simone, 2026-10-15) ----------
 * Tasto in più nella barra del periodo, solo in Dashboard: il giorno/settimana/mese con
 * più commissioni (scelta Giorno / Settimana / Mese visibile solo in quella modalità),
 * usato da tutta la dashboard. Pace mese e calendario commissioni restano sul mese.
 */

/* ---------- Periodo unico (Simone, 16/10) ----------
 * Prima Dashboard, Sessioni e le due Statistiche avevano quattro selettori diversi e,
 * cambiando pagina, il periodo cambiava. Ora la barra è una sola, uguale ovunque, e il
 * browser si ricorda la scelta (localStorage: solo comodità, se manca si parte dal mese). */
const PERIOD_KEYS = ['oggi', 'ieri', '7g', '30g', '90g', 'mese_corrente', 'mese_scorso', 'all'];
const PERIOD_LABELS = Object.assign({}, TIMEFRAME_LABELS, { all: 'Tutto', custom: 'Personalizzato' });
const PERIOD_STORE_KEY = 'chiamateTracker_periodo';

function getPeriod() {
  if (!uiState.period) {
    let p = null;
    try { p = JSON.parse(localStorage.getItem(PERIOD_STORE_KEY) || 'null'); } catch (e) { p = null; }
    const ok = p && (PERIOD_KEYS.includes(p.tf) || (p.tf === 'custom' && p.from && p.to));
    uiState.period = ok ? { tf: p.tf, from: p.from || null, to: p.to || null } : { tf: 'mese_corrente', from: null, to: null };
  }
  return uiState.period;
}

function setPeriod(tf, from, to) {
  uiState.period = { tf, from: from || null, to: to || null };
  try { localStorage.setItem(PERIOD_STORE_KEY, JSON.stringify(uiState.period)); } catch (e) { /* solo comodità */ }
}

/** Range del periodo scelto. "Tutto" = dal primo dato registrato a oggi. */
function getPeriodRange() {
  const p = getPeriod();
  if (p.tf === 'all') {
    const dates = [];
    (db.sessions || []).forEach(x => { if (x.startedAt) dates.push(new Date(x.startedAt)); });
    (db.appointments || []).forEach(a => { [a.createdAt, a.scheduledAt].forEach(v => { if (v) dates.push(new Date(v)); }); });
    const valid = dates.filter(d => !isNaN(d));
    const first = valid.length ? new Date(Math.min(...valid)) : new Date();
    return { start: startOfDay(first), end: endOfDay(new Date()) };
  }
  return getTimeframeRange(p.tf, p.from, p.to);
}

/** Per le Statistiche: null = tutto lo storico (come prima con "All time"). */
function getPeriodRangeOrNull() {
  return getPeriod().tf === 'all' ? null : getPeriodRange();
}

function periodLabelText() {
  const p = getPeriod();
  if (p.tf === 'custom') { const r = getPeriodRange(); return `dal ${fmtDate(r.start)} al ${fmtDate(r.end)}`; }
  return PERIOD_LABELS[p.tf] || p.tf;
}

/** "1 – 17 ott 2026" / "18 set – 17 ott 2026" / "17 ott 2026" (testo a destra della barra). */
function periodRangeShort(r) {
  const f = (d, o) => new Date(d).toLocaleDateString('it-IT', o);
  const a = new Date(r.start), b = new Date(r.end);
  if (dateInputValue(a) === dateInputValue(b)) return f(b, { day: 'numeric', month: 'short', year: 'numeric' });
  const sameYear = a.getFullYear() === b.getFullYear();
  const sameMonth = sameYear && a.getMonth() === b.getMonth();
  return (sameMonth ? a.getDate() : f(a, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }))
    + ' – ' + f(b, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** La barra del periodo, uguale in tutte le pagine. extraPills: tasti in più (dashboard). */
function renderPeriodBar(opts) {
  opts = opts || {};
  const p = getPeriod();
  const off = !!opts.inactive; // es. dashboard in "Migliore di sempre"
  const pills = PERIOD_KEYS.map(k => `<button class="pill ${!off && p.tf === k ? 'active' : ''}" data-period="${k}">${PERIOD_LABELS[k]}</button>`).join('');
  const range = getPeriodRange();
  return `
    <section class="card filters-bar period-bar">
      <div class="timeframe-pills">
        ${pills}
        <button class="pill ${!off && p.tf === 'custom' ? 'active' : ''}" data-period="custom">Personalizzato</button>
        ${opts.extraPills || ''}
      </div>
      ${off ? '' : `<span class="period-range-text">${p.tf === 'all' ? 'Tutto lo storico' : escapeHtml(periodRangeShort(range))}</span>`}
      ${!off && p.tf === 'custom' ? `
      <div class="custom-range">
        <label>dal <input type="date" id="periodFrom" value="${p.from || dateInputValue(range.start)}"></label>
        <label>al <input type="date" id="periodTo" value="${p.to || dateInputValue(range.end)}"></label>
        <button class="btn-ghost" id="btnPeriodApply">Applica</button>
      </div>` : ''}
      ${opts.after || ''}
    </section>`;
}

/** Eventi della barra: rerender ridisegna la pagina, onPick (facoltativo) gira prima. */
function wirePeriodBar(rerender, onPick) {
  appRoot.querySelectorAll('[data-period]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tf = btn.dataset.period;
      const cur = getPeriod();
      if (tf === 'custom') {
        const r = getPeriodRange();
        setPeriod('custom', cur.tf === 'custom' ? cur.from : dateInputValue(r.start), cur.tf === 'custom' ? cur.to : dateInputValue(r.end));
      } else setPeriod(tf);
      if (onPick) onPick(tf);
      rerender();
    });
  });
  const apply = document.getElementById('btnPeriodApply');
  if (apply) apply.addEventListener('click', () => {
    const from = document.getElementById('periodFrom').value;
    const to = document.getElementById('periodTo').value;
    if (!from || !to) return;
    setPeriod('custom', from, to);
    rerender();
  });
}

/** Range del periodo scelto nella barra della dashboard. */
function getDashboardRange() {
  if (uiState.goalsPeriodMode === 'best') {
    const best = findBestPeriod(db, uiState.goalsTimeframe);
    if (best) return best.range;
    return currentPeriodRanges()[uiState.goalsTimeframe];
  }
  return getPeriodRange();
}

/** Quale obiettivo (day/week/month) usare per il periodo scelto; null = nessuno. */
/** Barra del periodo in cima alla dashboard: la barra unica + "Migliore di sempre". */
function renderDashboardPeriodBar() {
  const best = uiState.goalsPeriodMode === 'best';
  const bestTabs = best ? `
      <div class="tf-tabs">
        ${TIMEFRAME_KEYS.map(k => `<button class="tf-tab ${uiState.goalsTimeframe === k ? 'active' : ''}" data-goals-tf="${k}">${BEST_PERIOD_LABELS[k]}</button>`).join('')}
      </div>` : '';
  return renderPeriodBar({
    inactive: best,
    extraPills: `<button class="pill ${best ? 'active' : ''}" data-goals-period-mode="best">🏆 Migliore di sempre</button>`,
    after: bestTabs
  });
}

/** Quando la modalità è "Migliore di sempre", mostra QUALE giorno/settimana/mese esatto
 * si sta guardando (altrimenti sarebbe ambiguo) e il totale commissioni di quel periodo. */
function renderBestPeriodCaption() {
  if (uiState.goalsPeriodMode !== 'best') return '';
  const tf = uiState.goalsTimeframe;
  const best = findBestPeriod(db, tf);
  if (!best) {
    return `<div class="eyebrow">Nessuna commissione registrata ancora: mostro il periodo corrente.</div>`;
  }
  const label = tf === 'day' ? fmtDate(best.range.start)
    : tf === 'week' ? `${fmtDate(best.range.start)} – ${fmtDate(best.range.end)}`
    : best.range.start.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  return `<div class="eyebrow">🏆 ${BEST_PERIOD_LABELS[tf]}: ${label} — €${best.total} di commissioni</div>`;
}

/* ============================================================================
 * Commissioni totali e grafici nel tempo (dashboard, 5.1.5 n. 2-4). Seguono la barra
 * del periodo. Card KPI della guida: etichetta, numero grande, "vs periodo prima" con
 * badge di trend verde/rosso (periodo precedente della stessa durata, previousPeriod).
 * Con "Tutto" non c'è un periodo prima: niente badge.
 * Stesso range delle Stats Setting per "Tutto" (dal primo dato a oggi).
 * ==========================================================================*/

function renderCommissionKpiSection() {
  const tf = getPeriod().tf;
  const best = uiState.goalsPeriodMode === 'best';
  const range = getDashboardRange();
  const summary = computeCommissionSummary(db, range);
  const prev = (!best && tf === 'all') ? null : computeCommissionSummary(db, previousPeriod(range));
  const vOn = LeadCRM.isOn();
  const cell = (label, val, prevVal, anchor) => `
      <div class="kpi-card${anchor ? ' accented' : ''}">
        <div class="kpi-label">${escapeHtml(label)}</div>
        <div class="kpi-value" data-kpi-num="${val}" data-kpi-money="0" data-kpi-display="${fmtNumIt(val, true)}">${fmtNumIt(val, true)}</div>
        <div class="kpi-vs">${prev ? `${trendBadge(val, prevVal)}<span>vs periodo prima (${fmtNumIt(prevVal, true)})</span>` : '<span>tutto lo storico</span>'}</div>
      </div>`;
  const p = prev || { total: 0, showup: 0, setting: 0, vendita: 0 };
  return `
    <section class="card dash-section">
      <div class="dash-section-head"><h3>Commissioni totali</h3><span class="dash-section-note">${best ? '' : escapeHtml(tf === 'all' ? 'Tutto lo storico' : periodRangeShort(range))}</span></div>
      <div class="kpi-grid dash-kpis${vOn ? '' : ' three'}">
        ${cell('Totale', summary.total, p.total, true)}
        ${cell('Setter · da show', summary.showup, p.showup)}
        ${cell('Setter · da venduto', summary.setting, p.setting)}
        ${vOn ? cell('Venditore · incassato', summary.vendita, p.vendita) : ''}
      </div>
    </section>`;
}

function renderAndamentoCharts() {
  const tf = getPeriod().tf;
  const range = getDashboardRange();
  const commRole = uiState.andamentoCommRole || 'all';
  const commSeries = buildAndamentoSeries(range, tf, 'commissioni', commRole);
  const venditoSeries = buildAndamentoSeries(range, tf, 'venduto', 'all');
  const roleTab = (k, l) => `<button class="tab ${commRole === k ? 'active' : ''}" data-andamento-comm-role="${k}">${l}</button>`;
  return `
    <section class="card dash-section chart-card">
      <div class="dash-section-head">
        <h3>Commissioni nel tempo</h3>
        <div class="tabs">${roleTab('all', 'Tutti')}${roleTab('setter', 'Setter')}${LeadCRM.isOn() ? roleTab('venditore', 'Venditore') : ''}</div>
      </div>
      ${renderLineChart(commSeries.values, commSeries.labels, { money: true, name: 'Commissioni' })}
    </section>
    <section class="card dash-section chart-card">
      <div class="dash-section-head"><h3>Totale venduto nel tempo</h3><span class="dash-section-note">appuntamenti chiusi, Setter e Venditore</span></div>
      ${renderLineChart(venditoSeries.values, venditoSeries.labels, { money: true, name: 'Venduto' })}
    </section>`;
}

/**
 * Serie storica per i grafici a linea "Andamento generale" — divide il range scelto in
 * bucket temporali (più punti quando il range è ampio, per dare un vero andamento "a
 * linea che sale" invece di pochi punti) e somma commissioni o totale venduto in ciascun bucket.
 * - metric 'commissioni': somma commissionEventsInRange (opzionalmente filtrata per ruolo).
 * - metric 'venduto': somma apptTotalSold() degli appuntamenti CHIUSI con scheduledAt nel
 *   bucket (coerente con come viene calcolato "Totale Venduto" altrove — vedi
 *   computeVenditoreStats.totalVenduto — ma qui su entrambi i ruoli).
 */
function buildAndamentoSeries(range, timeframe, metric, role) {
  const totalMs = range.end.getTime() - range.start.getTime();
  const totalDays = Math.max(1, Math.round(totalMs / 86400000));
  // Un punto per giorno fino a 31gg, altrimenti ~30 bucket per non affollare il grafico
  // su range molto ampi (90gg, mese scorso vs mese corrente ravvicinati, personalizzati lunghi).
  const numBuckets = Math.min(totalDays, totalDays <= 31 ? totalDays : 30);
  const stepMs = totalMs / numBuckets;

  const buckets = [];
  if (totalDays <= 31) {
    // Un bucket per giorno di CALENDARIO (mezzanotte-mezzanotte): con passi fissi da 24h
    // il cambio ora legale/solare (25/10, fine marzo) spostava i giorni di un'ora.
    const d0 = startOfDay(range.start);
    for (let i = 0; i < numBuckets; i++) {
      const day = new Date(d0); day.setDate(d0.getDate() + i);
      buckets.push({ start: day, end: i === numBuckets - 1 ? range.end : endOfDay(day) });
    }
  } else {
    for (let i = 0; i < numBuckets; i++) {
      const bStart = new Date(range.start.getTime() + stepMs * i);
      const bEnd = i === numBuckets - 1 ? range.end : new Date(range.start.getTime() + stepMs * (i + 1) - 1);
      buckets.push({ start: bStart, end: bEnd });
    }
  }

  const values = buckets.map(b => {
    if (metric === 'commissioni') {
      const events = commissionEventsInRange(db, b, role === 'all' ? undefined : role);
      return sumEvents(events);
    }
    const closedAppts = (db.appointments || []).filter(a => a.closed && a.scheduledAt && inRange(a.scheduledAt, b));
    return round2(closedAppts.reduce((s, a) => s + apptTotalSold(a), 0));
  });
  const labels = buckets.map(formatBucketLabel);

  return { values, labels };
}

/** Etichetta leggibile di un bucket temporale per l'asse/tooltip dei grafici a linea:
 * un giorno singolo ("16 set") se il bucket è ~1 giorno, altrimenti un range ("10–13 set")
 * per i bucket aggregati (range molto ampi, dove buildAndamentoSeries usa ~30 bucket
 * invece di uno per giorno). Così l'hover mostra sempre il "giorno/microperiodo" giusto,
 * come richiesto esplicitamente dall'utente. */
function formatBucketLabel(b) {
  const fmtShort = (d) => new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  if (dateInputValue(b.start) === dateInputValue(b.end)) return fmtShort(b.start);
  return `${fmtShort(b.start)} – ${fmtShort(b.end)}`;
}

/**
 * Tick "puliti" per l'asse Y in stile normale-grafico (0 / 500 / 1.000 / ...), invece di
 * dividere il massimo in parti uguali senza senso. tickCount è indicativo: il numero
 * finale di tick dipende da quale step "pulito" (1/2/5 × potenza di 10) copre il range.
 */
function niceTicks(maxVal, tickCount) {
  if (maxVal <= 0) return [0, 1];
  const rawStep = maxVal / tickCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  let niceResidual;
  if (residual > 5) niceResidual = 10;
  else if (residual > 2) niceResidual = 5;
  else if (residual > 1) niceResidual = 2;
  else niceResidual = 1;
  const step = niceResidual * magnitude;
  const niceMax = Math.ceil(maxVal / step) * step;
  const ticks = [];
  for (let v = 0; v <= niceMax + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

/**
 * Grafico a linee SVG (nessuna libreria). Restyling 17/10 (step 9), stile della guida:
 * griglia orizzontale tratteggiata neutral-200, assi in neutral-400, una linea accent-500
 * da 2 px con un'area tenue sotto, niente pallini fissi (solo quello del cursore),
 * tooltip neutral-900. Asse Y in euro "puliti" (niceTicks) e qualche data sotto.
 * Altezza fissa da CSS (.line-chart-plot-wrap): l'SVG si stira in larghezza
 * (preserveAspectRatio none) e le linee restano da 2 px (vector-effect); il pallino del
 * cursore è un elemento HTML, così resta tondo.
 * Il cursore segue il mouse/tocco e si aggancia al punto più vicino: vedi wireLineCharts.
 */
let lineChartIdCounter = 0;
let lineChartRegistry = {};
function renderLineChart(series, labels, opts) {
  opts = opts || {};
  const money = !!opts.money;
  const w = 1000, h = 240, padY = 12;
  const gradId = 'lcGrad' + (lineChartIdCounter++);
  const chartId = 'lc' + lineChartIdCounter;

  if (!series.length || series.every(v => v === 0)) {
    return `<div class="chart-empty">Nessun dato nel periodo selezionato.</div>`;
  }

  const ticks = niceTicks(Math.max(...series), 4);
  const domainMax = ticks[ticks.length - 1] || 1;
  const n = series.length;
  const xFor = (i) => n > 1 ? (w * i) / (n - 1) : w / 2;
  const yFor = (v) => padY + (1 - v / domainMax) * (h - padY * 2);
  const points = series.map((v, i) => [xFor(i), yFor(v)]);
  const fmtVal = (v) => money ? fmtNumIt(v, true) : String(v);

  const linePath = points.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const areaPath = linePath + ` L${points[n - 1][0].toFixed(1)},${(h - padY).toFixed(1)} L${points[0][0].toFixed(1)},${(h - padY).toFixed(1)} Z`;
  const gridlinesHtml = ticks.map(t => `<line class="line-chart-grid" x1="0" y1="${yFor(t).toFixed(1)}" x2="${w}" y2="${yFor(t).toFixed(1)}" vector-effect="non-scaling-stroke"/>`).join('');
  const axisLabelsHtml = ticks.map(t => `<div class="line-chart-yaxis-tick" style="top:${((yFor(t) / h) * 100).toFixed(2)}%;">${fmtVal(t)}</div>`).join('');
  // Date sotto: al massimo 5, distribuite (prima e ultima sempre).
  const xIdx = n <= 5 ? series.map((_, i) => i) : [0, Math.round((n - 1) / 4), Math.round((n - 1) / 2), Math.round(3 * (n - 1) / 4), n - 1];
  const xLabelsHtml = [...new Set(xIdx)].map((i, k, arr) => {
    const cls = k === 0 ? ' first' : (k === arr.length - 1 ? ' last' : '');
    return `<span class="line-chart-xtick${cls}" style="left:${(xFor(i) / w * 100).toFixed(2)}%">${escapeHtml(labels[i] || '')}</span>`;
  }).join('');

  lineChartRegistry[chartId] = { points, values: series, labels: labels || [], money, w, h, name: opts.name || '' };

  return `
    <div class="line-chart-wrap" data-chart-id="${chartId}">
      <div class="line-chart-body">
        <div class="line-chart-yaxis">${axisLabelsHtml}</div>
        <div class="line-chart-plot-wrap">
          <svg class="line-chart-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(opts.name || 'Grafico')}">
            <defs>
              <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--accent-500)" stop-opacity="0.16"/>
                <stop offset="100%" stop-color="var(--accent-500)" stop-opacity="0"/>
              </linearGradient>
            </defs>
            ${gridlinesHtml}
            <path d="${areaPath}" fill="url(#${gradId})" stroke="none"/>
            <path class="line-chart-line" d="${linePath}" fill="none" vector-effect="non-scaling-stroke"/>
            <line class="line-chart-crosshair" x1="0" y1="${padY}" x2="0" y2="${h - padY}" vector-effect="non-scaling-stroke" hidden/>
            <rect class="line-chart-hit" x="0" y="0" width="${w}" height="${h}" fill="transparent"/>
          </svg>
          <div class="line-chart-dot" hidden></div>
          <div class="line-chart-tooltip" hidden>
            <div class="line-chart-tooltip-label"></div>
            <div class="line-chart-tooltip-value"></div>
          </div>
        </div>
      </div>
      <div class="line-chart-xaxis">${xLabelsHtml}</div>
    </div>`;
}

/**
 * Cursore/tooltip per ogni grafico a linee in root (da chiamare dopo aver messo l'HTML
 * nel DOM). I dati arrivano dal registry di renderLineChart.
 */
function wireLineCharts(root) {
  (root || appRoot).querySelectorAll('[data-chart-id]').forEach(wrap => {
    const chart = lineChartRegistry[wrap.dataset.chartId];
    if (!chart) return;
    const svg = wrap.querySelector('.line-chart-svg');
    const hit = wrap.querySelector('.line-chart-hit');
    const crosshair = wrap.querySelector('.line-chart-crosshair');
    const dot = wrap.querySelector('.line-chart-dot');
    const tooltip = wrap.querySelector('.line-chart-tooltip');
    if (!svg || !hit || !crosshair || !dot || !tooltip) return;
    const tipValue = tooltip.querySelector('.line-chart-tooltip-value');
    const tipLabel = tooltip.querySelector('.line-chart-tooltip-label');
    const fmtVal = (v) => chart.money ? fmtNumIt(v, true) : String(v);

    function showAt(index) {
      const p = chart.points[index];
      if (!p) return;
      const leftPct = (p[0] / chart.w) * 100;
      const topPct = (p[1] / chart.h) * 100;
      crosshair.setAttribute('x1', p[0]); crosshair.setAttribute('x2', p[0]);
      crosshair.removeAttribute('hidden');
      dot.style.left = leftPct + '%'; dot.style.top = topPct + '%'; dot.hidden = false;
      tipValue.textContent = (chart.name ? chart.name + ' ' : '') + fmtVal(chart.values[index]);
      tipLabel.textContent = chart.labels[index] || '';
      tooltip.style.left = leftPct + '%';
      tooltip.style.top = topPct + '%';
      tooltip.style.transform = leftPct < 20 ? 'translate(0, calc(-100% - 12px))' : (leftPct > 80 ? 'translate(-100%, calc(-100% - 12px))' : 'translate(-50%, calc(-100% - 12px))');
      tooltip.hidden = false;
    }
    function hide() { crosshair.setAttribute('hidden', ''); dot.hidden = true; tooltip.hidden = true; }
    function handleMove(clientX) {
      const rect = svg.getBoundingClientRect();
      if (!rect.width) return;
      const xUser = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * chart.w;
      let nearest = 0, best = Infinity;
      chart.points.forEach((p, i) => { const d = Math.abs(p[0] - xUser); if (d < best) { best = d; nearest = i; } });
      showAt(nearest);
    }
    hit.addEventListener('pointermove', (e) => handleMove(e.clientX));
    hit.addEventListener('pointerdown', (e) => handleMove(e.clientX));
    hit.addEventListener('pointerleave', hide);
  });
}

/* ---------- Report Sessione (testo pronto da incollare, es. per il direttore commerciale) ---------- */

function buildSessionReportText(stats, periodLabel, pipelineLabel) {
  const lines = [];
  lines.push(`Report chiamate — ${periodLabel}`);
  lines.push(`Pipeline: ${pipelineLabel}`);
  lines.push('');
  lines.push(`Chiamate svolte: ${stats.totalCalls}`);
  lines.push(`Lead unici: ${stats.totalLeads}`);
  lines.push('');
  if (stats.sortedOutcomes.length) {
    stats.sortedOutcomes.forEach(([label, count]) => lines.push(`${label}: ${count}`));
  } else {
    lines.push('Nessuna chiamata registrata in questo periodo.');
  }
  return lines.join('\n');
}

async function generateSessionReport() {
  const range = getPeriodRange();
  const filteredSessions = getFilteredSessions(db, range, uiState.pipelineFilter);
  const stats = computeStats(filteredSessions);

  const periodLabel = periodLabelText();
  const pipeline = uiState.pipelineFilter !== 'all' ? db.pipelines.find(p => p.id === uiState.pipelineFilter) : null;
  const pipelineLabel = pipeline ? pipeline.name : 'Tutte le pipeline';

  const text = buildSessionReportText(stats, periodLabel, pipelineLabel);
  const copied = await copyToClipboard(text);
  showReportModal(text, copied);
}

/**
 * Report copia-incolla della schermata Appuntamenti Setter — una riga per appuntamento
 * con le stesse voci della tabella (nome, data/ora, presentato, chiuso) più cash
 * collected, totale venduto e la commissione che spetta su quella riga, così può essere
 * condiviso col direttore commerciale a fine mese per verificare chi si è presentato e
 * quanto spetta. Vive nella sezione Setting (split Setter/Venditore): sempre e solo
 * righe role:'setter' — vedi generateAppointmentsReport.
 */
function buildAppointmentsReportText(rows, filterLabel) {
  const lines = [];
  lines.push(`Report Appuntamenti — ${filterLabel}`);
  lines.push(`Generato il ${fmtDate(new Date())}`);
  lines.push('');

  if (!rows.length) {
    lines.push('Nessun appuntamento in questo elenco.');
    return lines.join('\n');
  }

  const presentedLabel = (a) => {
    if (a.presentedStatus === 'presented') return 'Presentato';
    if (a.presentedStatus === 'confirmed24h') return 'Confermato24h';
    if (a.presentedStatus === 'no_show') return 'No Show';
    if (a.presentedStatus === 'annullato') return 'Annullato';
    if (a.presentedStatus === 'spostato') return 'Spostato';
    return 'No';
  };

  let totalCash = 0, totalSold = 0, totalCommission = 0;

  rows.forEach(a => {
    const roleLabel = 'Setter';
    const cash = a.cashCollected || 0;
    const sold = apptTotalSold(a);
    const commission = sumEvents(commissionEventsForAppointment(a));
    totalCash += cash;
    totalSold += sold;
    totalCommission += commission;

    lines.push(`${a.clientName || '(senza nome)'} — ${roleLabel}`);
    lines.push(`  Data/ora: ${a.scheduledAt ? fmtDateTime(a.scheduledAt) : '—'}`);
    lines.push(`  Presentato: ${presentedLabel(a)} · Chiuso: ${a.closed ? 'Sì' : 'No'}`);
    lines.push(`  Cash collected: €${round2(cash)} · Totale venduto: €${round2(sold)}`);
    lines.push(`  Commissione: €${round2(commission)}`);
    lines.push('');
  });

  lines.push('---');
  lines.push(`Totale appuntamenti: ${rows.length}`);
  lines.push(`Totale cash collected: €${round2(totalCash)}`);
  lines.push(`Totale venduto: €${round2(totalSold)}`);
  lines.push(`Totale commissioni: €${round2(totalCommission)}`);

  return lines.join('\n');
}

// Report per il direttore commerciale — vive nella sezione Setting (split Setter/
// Venditore), quindi copre sempre e solo gli appuntamenti Setter, rispettando l'eventuale
// filtro "Solo No Show" attivo sulla tabella così il report riflette quello che si vede.
async function generateAppointmentsReport() {
  const filter = uiState.crmSetterFilter || 'all';
  const onlyNoShow = filter === 'noshow_annullati' || filter === 'no_show';
  let rows = db.appointments.filter(a => a.role === 'setter');
  if (onlyNoShow) rows = rows.filter(a => a.presentedStatus === 'no_show' || a.presentedStatus === 'annullato');
  rows = [...rows].sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));
  const filterLabel = onlyNoShow ? 'Setter — no show e annullati' : 'Setter';

  const text = buildAppointmentsReportText(rows, filterLabel);
  const copied = await copyToClipboard(text);
  showReportModal(text, copied, 'Report Appuntamenti');
}

/**
 * Report copia-incolla della schermata Appuntamenti Venditore — stessa idea del report
 * Setter, ma con le voci proprie del funnel Venditore: stato trattativa (dealStage) al
 * posto di presentato/chiuso booleani, e nota sull'eventuale prossimo follow-up così chi
 * legge il report vede anche cosa è ancora aperto, non solo i chiusi. Rispetta il filtro
 * attivo sulla tabella (Tutti/Trattativa/No Show/Perso) come già fa quello Setter.
 */
function buildVenditoreAppointmentsReportText(rows, filterLabel) {
  const lines = [];
  lines.push(`Report Appuntamenti — ${filterLabel}`);
  lines.push(`Generato il ${fmtDate(new Date())}`);
  lines.push('');

  if (!rows.length) {
    lines.push('Nessun appuntamento in questo elenco.');
    return lines.join('\n');
  }

  let totalCash = 0, totalSold = 0, totalCommission = 0, totalChiusi = 0;

  rows.forEach(a => {
    const stageLabel = a.dealStage && dealStageDef(a.dealStage) ? dealStageDef(a.dealStage).label : 'Da impostare';
    const cash = a.cashCollected || 0;
    const sold = apptTotalSold(a);
    const commission = sumEvents(commissionEventsForAppointment(a));
    totalCash += cash;
    totalSold += sold;
    totalCommission += commission;
    if (a.closed) totalChiusi += 1;

    const info = LeadCRM.reportInfo(a); // note e prossima azione stanno nella scheda lead

    lines.push(`${a.clientName || '(senza nome)'} — Venditore`);
    lines.push(`  Data/ora: ${a.scheduledAt ? fmtDateTime(a.scheduledAt) : '—'}`);
    lines.push(`  Stato trattativa: ${stageLabel}`);
    lines.push(`  Cash collected: €${round2(cash)} · Totale venduto: €${round2(sold)}`);
    lines.push(`  Commissione: €${round2(commission)}`);
    if (info.next) lines.push(`  Prossima azione: ${info.next}`);
    if (info.lastNote) lines.push(`  Ultima nota: ${info.lastNote}`);
    lines.push('');
  });

  lines.push('---');
  lines.push(`Totale appuntamenti: ${rows.length}`);
  lines.push(`Chiusi: ${totalChiusi}`);
  lines.push(`Totale cash collected: €${round2(totalCash)}`);
  lines.push(`Totale venduto: €${round2(totalSold)}`);
  lines.push(`Totale commissioni: €${round2(totalCommission)}`);

  return lines.join('\n');
}

// Report per il direttore commerciale — sezione Venditore: tutti gli appuntamenti Venditore
// (tasto "Report" in Venditore → Lead; la tabella con i suoi filtri non c'è più, step 15).
async function generateVenditoreAppointmentsReport() {
  const rows = db.appointments.filter(a => a.role === 'venditore')
    .sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));
  const text = buildVenditoreAppointmentsReportText(rows, 'Venditore');
  const copied = await copyToClipboard(text);
  showReportModal(text, copied, 'Report Appuntamenti');
}

/** Copia negli appunti con fallback per contesti (es. iframe sandbox) dove l'API moderna non è concessa. */
async function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      console.error('Clipboard API non riuscita, provo il fallback', e);
    }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.top = '0';
    ta.style.left = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    console.error('Fallback copia non riuscito', e);
    return false;
  }
}

function showReportModal(text, copied, title) {
  openModal(`
    <h3>${escapeHtml(title || 'Report sessione')}</h3>
    <p class="text-dim" style="font-size:0.85rem;">
      ${copied
        ? 'Copiato negli appunti — incollalo dove preferisci.'
        : 'Non sono riuscito a copiarlo automaticamente: seleziona il testo qui sotto e copialo (Ctrl/Cmd+C), oppure riprova col pulsante.'}
    </p>
    <textarea id="reportText" class="fb-config-textarea" style="min-height:220px;" readonly>${escapeHtml(text)}</textarea>
    <div class="modal-actions">
      <button class="btn-ghost" data-close-modal="1">Chiudi</button>
      <button class="btn-primary" id="btnCopyReportAgain">Copia</button>
    </div>
  `);
  modalRoot.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', closeModal));

  const ta = document.getElementById('reportText');
  ta.focus();
  ta.select();

  document.getElementById('btnCopyReportAgain').addEventListener('click', async () => {
    ta.focus();
    ta.select();
    const ok = await copyToClipboard(text);
    showToast(ok ? 'Copiato negli appunti.' : 'Seleziona il testo e copia manualmente.', !ok);
  });
}

/* ---------- Sessioni (elenco + dettaglio) ---------- */

function renderSessioniList() {
  uiState.settingTab = 'sessioni';
  // Lettera G (Simone, 16/10): un filtro pipeline solo (quello in cima, vale per numeri
  // ed elenco) e solo le ultime 20 sessioni, con "Mostra altre 20".
  const filterId = uiState.pipelineFilter || 'all';
  const allSessions = [...db.sessions]
    .filter(s => filterId === 'all' || s.pipelineId === filterId)
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  const shown = uiState.sessioniShown || 20;
  const sessions = allSessions.slice(0, shown);
  const remaining = allSessions.length - sessions.length;

  const rows = sessions.length ? sessions.map(sessionCardHtml).join('') : '<p class="text-dim">Nessuna sessione registrata ancora. Inizia la prima!</p>';

  const activityHtml = renderCallActivitySection();

  appRoot.innerHTML = `
    ${activityHtml}
    <div class="section-separator"><span class="eyebrow">Elenco sessioni${filterId !== 'all' ? ' · ' + escapeHtml((db.pipelines.find(p => p.id === filterId) || {}).name || '') : ''}</span></div>
    <section class="session-list">${rows}</section>
    ${remaining > 0 ? `<div class="show-more-wrap"><button class="btn-ghost" id="btnMoreSessions">Mostra altre ${Math.min(20, remaining)} (ne restano ${remaining})</button></div>` : ''}
    ${renderSessionDaySearch()}
    ${renderChecklistChartSection()}
  `;

  wireCallActivitySection();
  wireSessionDaySearch();
  wireChecklistChart();
  const moreBtn = document.getElementById('btnMoreSessions');
  if (moreBtn) moreBtn.addEventListener('click', () => { uiState.sessioniShown = shown + 20; renderSessioniList(); });
  appRoot.querySelectorAll('.session-list .session-card').forEach(card => {
    card.addEventListener('click', () => { location.hash = '#/sessioni/' + card.dataset.sid; });
  });
  animateKpiValues(appRoot);
}

function sessionCardHtml(s) {
  const totalCalls = s.calls.length;
  const totalLeads = countSessionLeads(s, db.sessions);
  const duration = (s.endedAt ? (new Date(s.endedAt) - new Date(s.startedAt)) : (Date.now() - new Date(s.startedAt))) - (s.pausedTotalMs || 0);
  return `
      <div class="session-card" data-sid="${s.id}">
        <div class="session-card-main">
          <div class="session-card-title">Sessione ${s.number} - ${fmtDate(s.startedAt)}</div>
          <div class="session-card-sub">${escapeHtml(s.pipelineName)} · ${fmtTime(s.startedAt)}</div>
        </div>
        <div class="session-card-stats">
          <span>${fmtDuration(duration)}</span>
          <span>${totalCalls} ${totalCalls === 1 ? 'chiamata' : 'chiamate'}</span>
          <span>${totalLeads} lead</span>
        </div>
      </div>`;
}

/* ---------- Sessioni: ricerca per giorno (restyling 5.3, step 13) ----------
 * Accetta "14/10", "14/10/2026", "14-10", "14.10.26", "14 ottobre", "14 ott 2026",
 * "oggi", "ieri" + il selettore data. Senza anno: l'anno in corso, o quello prima se la
 * data sarebbe nel futuro (le sessioni sono sempre passate). Cerca in TUTTE le sessioni
 * (anche le automatiche), senza il filtro pipeline. Risultati ridisegnati da soli, senza
 * ridisegnare la pagina (così il campo non perde il fuoco). */
const IT_MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/** Testo → 'YYYY-MM-DD' oppure null (vuoto) oppure false (non riconosciuto). */
function parseDaySearch(text, now) {
  const t = String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return null;
  now = now || new Date();
  if (t === 'oggi') return dateInputValue(now);
  if (t === 'ieri') { const d = new Date(now); d.setDate(d.getDate() - 1); return dateInputValue(d); }
  let day, month, year = null;
  let m = /^(\d{1,2})\s*[\/.\-]\s*(\d{1,2})(?:\s*[\/.\-]\s*(\d{2}|\d{4}))?$/.exec(t);
  if (m) { day = +m[1]; month = +m[2]; if (m[3]) year = +m[3]; }
  else if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t))) { year = +m[1]; month = +m[2]; day = +m[3]; }
  else if ((m = /^(\d{1,2})\s+([a-zà]+)\.?(?:\s+(\d{2}|\d{4}))?$/.exec(t))) {
    day = +m[1];
    const name = m[2];
    const idx = name.length >= 3 ? IT_MONTHS.findIndex(x => x.startsWith(name)) : -1;
    if (idx < 0) return false;
    month = idx + 1;
    if (m[3]) year = +m[3];
  } else return false;
  if (year !== null && year < 100) year += 2000;
  const guessYear = year === null;
  if (guessYear) year = now.getFullYear();
  let d = new Date(year, month - 1, day);
  if (isNaN(d) || d.getDate() !== day || d.getMonth() !== month - 1) return false;
  if (guessYear && d > endOfDay(now)) d = new Date(year - 1, month - 1, day);
  return dateInputValue(d);
}

/** 'YYYY-MM-DD' → "14/10" (con l'anno solo se non è quello in corso). */
function fmtDayShort(key) {
  const [y, m, d] = key.split('-');
  return `${d}/${m}` + (+y !== new Date().getFullYear() ? `/${y}` : '');
}

/** 'YYYY-MM-DD' → "14/10/2026". */
function fmtDayFull(key) { const [y, m, d] = key.split('-'); return `${d}/${m}/${y}`; }

function sessionDayResultsHtml() {
  const text = uiState.sessionDaySearch || '';
  const key = parseDaySearch(text);
  if (key === null) return '';
  if (key === false) return '<p class="text-dim day-search-msg">Data non riconosciuta. Scrivi per esempio 14/10, 14 ottobre, oggi o ieri.</p>';
  const list = (db.sessions || []).concat(db.activeSession ? [db.activeSession] : [])
    .filter(s => s.startedAt && dateInputValue(new Date(s.startedAt)) === key)
    .sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));
  if (!list.length) return `<p class="text-dim day-search-msg" data-day-empty>Nessuna sessione il ${fmtDayShort(key)}</p>`;
  return `<p class="day-search-count">${list.length} ${list.length === 1 ? 'sessione' : 'sessioni'} il ${fmtDayShort(key)}</p>
    <div class="session-list">${list.map(sessionCardHtml).join('')}</div>`;
}

function renderSessionDaySearch() {
  const key = parseDaySearch(uiState.sessionDaySearch || '');
  return `
    <section class="card day-search-card">
      <div class="day-search-head">
        <h3>Cerca per giorno</h3>
      </div>
      <div class="day-search-row">
        <input type="search" id="sessDaySearch" class="crm-search-input day-search-input" placeholder="14/10, 14 ottobre, oggi, ieri…" value="${escapeHtml(uiState.sessionDaySearch || '')}" aria-label="Cerca sessioni per giorno" autocomplete="off">
        <input type="date" id="sessDayPicker" class="crm-search-input day-search-date" value="${key || ''}" aria-label="Scegli il giorno">
      </div>
      <div id="sessDayResults">${sessionDayResultsHtml()}</div>
    </section>`;
}

function setSessionDaySearch(text, opts) {
  uiState.sessionDaySearch = text;
  const box = document.getElementById('sessDayResults');
  if (box) box.innerHTML = sessionDayResultsHtml();
  const key = parseDaySearch(text);
  const picker = document.getElementById('sessDayPicker');
  if (picker && !(opts && opts.fromPicker)) picker.value = key || '';
  markChecklistChartSelected(key || null);
}

function wireSessionDaySearch() {
  const input = document.getElementById('sessDaySearch');
  const picker = document.getElementById('sessDayPicker');
  const box = document.getElementById('sessDayResults');
  if (!input) return;
  input.addEventListener('input', () => setSessionDaySearch(input.value));
  picker.addEventListener('change', () => {
    const v = picker.value;
    input.value = v ? fmtDayFull(v) : '';
    setSessionDaySearch(input.value, { fromPicker: true });
  });
  box.addEventListener('click', e => {
    const card = e.target.closest('.session-card');
    if (card) location.hash = '#/sessioni/' + card.dataset.sid;
  });
}

/* ---------- Sessioni: grafico checklist (restyling 5.3, step 13) ----------
 * Una barra per giorno con appuntamenti Setter fissati (createdAt, spostati esclusi
 * come per i Fissati: isCountedAsNewBooking) nel periodo unico e con la checklist
 * salvata. Altezza = % media della checklist di quel giorno (0-100). Gli appuntamenti
 * fissati prima della checklist non contano. Legenda: le 3 voci prese meno spesso. */
function checklistChartData(range) {
  const appts = (db.appointments || []).filter(a => a.role === 'setter'
    && a.checklist && typeof a.checklist === 'object'
    && isCountedAsNewBooking(a) && a.createdAt
    && (!range || inRange(a.createdAt, range)));
  const byDay = {};
  appts.forEach(a => {
    const k = dateInputValue(new Date(a.createdAt));
    const pctV = a.checklistPct != null ? Number(a.checklistPct) : checklistPctOf(a.checklist);
    (byDay[k] = byDay[k] || []).push(pctV);
  });
  const days = Object.keys(byDay).sort().map(k => ({
    key: k,
    count: byDay[k].length,
    avg: Math.round(byDay[k].reduce((x, y) => x + y, 0) / byDay[k].length * 10) / 10
  }));
  const items = CHECKLIST_ITEMS.map((it, i) => ({
    id: it.id, label: it.label, order: i,
    pct: appts.length ? Math.round(appts.filter(a => a.checklist[it.id] === true).length / appts.length * 1000) / 10 : 0
  })).sort((a, b) => a.pct - b.pct || a.order - b.order);
  return { days, total: appts.length, leastTaken: items.slice(0, 3) };
}

/** Etichetta corta della voce per la legenda (senza la parte tra parentesi). */
function checklistShortLabel(label) { return label.replace(/\s*\(.*\)\s*$/, ''); }

function renderChecklistChartSection() {
  const range = getPeriodRangeOrNull();
  const data = checklistChartData(range);
  const p = getPeriod();
  const pills = PERIOD_KEYS.map(k => `<button class="tab ${p.tf === k ? 'active' : ''}" data-period="${k}">${PERIOD_LABELS[k]}</button>`).join('')
    + (p.tf === 'custom' ? `<button class="tab active" data-period="custom">Personalizzato</button>` : '');
  const selKey = parseDaySearch(uiState.sessionDaySearch || '') || null;
  let body;
  if (!data.days.length) {
    body = `<p class="text-dim checklist-chart-empty">Nessun appuntamento fissato con la checklist in questo periodo.</p>`;
  } else {
    const maxAvg = Math.max(...data.days.map(d => d.avg));
    const topKey = data.days.find(d => d.avg === maxAvg).key; // a pari merito il primo
    const bars = data.days.map(d => {
      const tip = `${d.count} ${d.count === 1 ? 'fissato' : 'fissati'} · ${fmtPctIt(d.avg)} medio`;
      return `<button type="button" class="cchart-col${d.key === topKey ? ' is-top' : ''}${d.key === selKey ? ' is-selected' : ''}" data-cchart-day="${d.key}" data-tip="${escapeHtml(tip)}" aria-label="${escapeHtml(fmtDayShort(d.key) + ': ' + tip)}">
          <span class="cchart-plot"><span class="cchart-bar" style="height:${Math.max(0, Math.min(100, d.avg))}%"><span class="cchart-val">${fmtPctIt(d.avg)}</span></span></span>
          <span class="cchart-date">${fmtDayShort(d.key)}</span>
        </button>`;
    }).join('');
    const legend = data.leastTaken.map((it, i) => `
        <li class="cchart-legend-item">
          <span class="cchart-legend-rank">${i + 1}</span>
          <span class="cchart-legend-label">${escapeHtml(checklistShortLabel(it.label))}</span>
          <span class="cchart-legend-pct">${fmtPctIt(it.pct)}</span>
        </li>`).join('');
    body = `
      <div class="cchart-layout${selKey && data.days.some(d => d.key === selKey) ? ' has-selected' : ''}">
        <div class="cchart-wrap">
          <div class="cchart-grid" aria-hidden="true"><span><i>100%</i></span><span><i>50%</i></span><span><i>0%</i></span></div>
          <div class="cchart-scroll"><div class="cchart-cols">${bars}</div></div>
          <div class="cchart-tooltip" hidden></div>
        </div>
        <aside class="cchart-legend">
          <div class="cchart-legend-title">Prese meno spesso</div>
          <ol class="cchart-legend-list">${legend}</ol>
          <p class="cchart-legend-note">${data.total} ${data.total === 1 ? 'appuntamento' : 'appuntamenti'} con checklist nel periodo</p>
        </aside>
      </div>`;
  }
  return `
    <section class="card checklist-chart-card" data-checklist-chart>
      <div class="cchart-head">
        <div>
          <h3>Checklist degli appuntamenti fissati</h3>
          <p class="text-dim cchart-sub">% media delle informazioni prese, per giorno · ${p.tf === 'all' ? 'tutto lo storico' : escapeHtml(periodRangeShort(getPeriodRange()))}</p>
        </div>
        <div class="tabs cchart-period">${pills}</div>
      </div>
      ${body}
    </section>`;
}

/** Barra evidenziata: il giorno cercato se è nel grafico, altrimenti il giorno più alto. */
function markChecklistChartSelected(key) {
  const layout = appRoot.querySelector('.cchart-layout');
  if (!layout) return;
  let found = false;
  layout.querySelectorAll('[data-cchart-day]').forEach(col => {
    const on = col.dataset.cchartDay === key;
    if (on) found = true;
    col.classList.toggle('is-selected', on);
  });
  layout.classList.toggle('has-selected', found);
}

function wireChecklistChart() {
  // Telefono: le tab del periodo scorrono, porta in vista quella attiva.
  const per = appRoot.querySelector('.cchart-period');
  const act = per && per.querySelector('.tab.active');
  if (per && act && per.scrollWidth > per.clientWidth) per.scrollLeft = Math.max(0, act.offsetLeft - per.offsetLeft - 8);
  const wrap = appRoot.querySelector('.cchart-wrap');
  if (!wrap) return;
  const tipEl = wrap.querySelector('.cchart-tooltip');
  const show = col => {
    const bar = col.querySelector('.cchart-bar');
    const wr = wrap.getBoundingClientRect();
    const br = bar.getBoundingClientRect();
    tipEl.textContent = col.dataset.tip;
    tipEl.hidden = false;
    const x = br.left - wr.left + br.width / 2;
    const half = tipEl.offsetWidth / 2;
    tipEl.style.left = Math.max(half, Math.min(wr.width - half, x)) + 'px';
    tipEl.style.top = Math.max(0, br.top - wr.top - 34) + 'px';
  };
  wrap.querySelectorAll('[data-cchart-day]').forEach(col => {
    col.addEventListener('mouseenter', () => show(col));
    col.addEventListener('focus', () => show(col));
    col.addEventListener('mouseleave', () => { tipEl.hidden = true; });
    col.addEventListener('blur', () => { tipEl.hidden = true; });
    // Clic su una barra = cerca le sessioni di quel giorno.
    col.addEventListener('click', () => {
      const text = fmtDayFull(col.dataset.cchartDay);
      const input = document.getElementById('sessDaySearch');
      if (input) input.value = text;
      setSessionDaySearch(text);
      const box = document.querySelector('.day-search-card');
      if (box) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  });
  const sc = wrap.querySelector('.cchart-scroll');
  if (sc) sc.scrollLeft = sc.scrollWidth; // i giorni più recenti in vista
}

/**
 * Blocco "Attività di chiamata" (timeframe/pipeline, KPI chiamate/lead/risposta/conversione,
 * andamento vs periodo precedente, esiti nel periodo, confronto pipeline, produttività) —
 * SPOSTATO dalla Dashboard qui in Setting > Sessioni su richiesta esplicita dell'utente
 * ("non deve esserci la sezione attività di chiamata [in dashboard], quella và nella parte
 * setting"). Logica invariata, solo la posizione è cambiata; usa il periodo unico
 * (getPeriod) e uiState.pipelineFilter.
 */
function renderCallActivitySection() {
  const range = getPeriodRange();
  const filteredSessions = getFilteredSessions(db, range, uiState.pipelineFilter);
  const stats = computeStats(filteredSessions);

  const prevRange = previousPeriod(range);
  const prevSessions = getFilteredSessions(db, prevRange, uiState.pipelineFilter);
  const prevStats = computeStats(prevSessions);

  const callsTrend = trendDelta(stats.totalCalls, prevStats.totalCalls);
  const leadsTrend = trendDelta(stats.totalLeads, prevStats.totalLeads);
  const convTrend = trendDelta(stats.conversionRate, prevStats.conversionRate);

  const allInRange = getFilteredSessions(db, range, 'all');
  const byPipeline = {};
  allInRange.forEach(s => {
    if (!byPipeline[s.pipelineId]) byPipeline[s.pipelineId] = { name: s.pipelineName, sessions: [] };
    byPipeline[s.pipelineId].sessions.push(s);
  });
  const pipelineRows = Object.values(byPipeline)
    .map(p => ({ name: p.name, ...computeStats(p.sessions) }))
    .sort((a, b) => b.conversionRate - a.conversionRate);

  const pipelineOptions = db.pipelines.map(p =>
    `<option value="${p.id}" ${uiState.pipelineFilter === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
  ).join('');

  const outcomeBars = stats.sortedOutcomes.length ? stats.sortedOutcomes.map(([label, count]) => {
    const width = pct(count, stats.totalLeads);
    return `
      <div class="bar-row">
        <div class="bar-label">${escapeHtml(label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
        <div class="bar-value">${count}</div>
      </div>`;
  }).join('') : '<p class="text-dim">Nessuna chiamata registrata in questo periodo.</p>';

  const pipelineTableRows = pipelineRows.length ? pipelineRows.map(p => `
    <tr>
      <td>${escapeHtml(p.name)}</td>
      <td>${p.totalLeads}</td>
      <td>${fmtPctIt(p.responseRate)}</td>
      <td>${fmtPctIt(p.conversionRate)}</td>
    </tr>`).join('') : `<tr><td colspan="4" class="text-dim">Nessun dato</td></tr>`;

  return `
    <div class="section-separator"><span class="eyebrow">Attività di chiamata</span></div>

    ${renderPeriodBar({ after: `
      <div class="pipeline-filter">
        <select id="pipelineFilter">
          <option value="all" ${uiState.pipelineFilter === 'all' ? 'selected' : ''}>Tutte le pipeline</option>
          ${pipelineOptions}
        </select>
      </div>
      <div class="filters-bar-actions">
        <button class="btn-ghost" id="btnSessionReport">Report Sessione</button>
      </div>` })}

    <section class="kpi-grid">
      <div class="card kpi-card"><div class="kpi-value">${stats.totalCalls}</div><div class="kpi-label">Chiamate totali</div></div>
      <div class="card kpi-card"><div class="kpi-value">${stats.totalLeads}</div><div class="kpi-label">Lead contattati</div></div>
      <div class="card kpi-card"><div class="kpi-value">${fmtPctIt(stats.responseRate)}</div><div class="kpi-label">Tasso di risposta</div></div>
      <div class="card kpi-card"><div class="kpi-value">${fmtPctIt(stats.conversionRate)}</div><div class="kpi-label">Tasso di conversione</div></div>
    </section>

    <section class="card trend-row">
      <h3>Andamento vs periodo precedente</h3>
      <div class="trend-grid">
        ${trendItem('Chiamate', callsTrend)}
        ${trendItem('Lead', leadsTrend)}
        ${trendItem('Conversione', convTrend)}
      </div>
    </section>

    <section class="two-col">
      <div class="card">
        <h3>Esiti nel periodo - Lead unici</h3>
        <p class="text-dim">Come si chiudono le chiamate (un lead conta una sola volta, con l'esito del suo ultimo tentativo).</p>
        <div class="bar-list">${outcomeBars}</div>
      </div>
      <div class="card">
        <h3>Confronto pipeline</h3>
        <table class="simple-table">
          <thead><tr><th>Pipeline</th><th>Lead</th><th>Risposta</th><th>Conversione</th></tr></thead>
          <tbody>${pipelineTableRows}</tbody>
        </table>
      </div>
    </section>

    <section class="card productivity">
      <h3>Produttività</h3>
      <div class="productivity-grid">
        <div><div class="stat-value">${stats.sessionsCount}</div><div class="stat-label">Sessioni</div></div>
        <div><div class="stat-value">${stats.avgCallsPerSession}</div><div class="stat-label">Chiamate/sessione</div></div>
        <div><div class="stat-value">${stats.avgLeadsPerSession}</div><div class="stat-label">Lead/sessione</div></div>
        <div><div class="stat-value">${stats.callsPerHour}</div><div class="stat-label">Chiamate/ora</div></div>
        <div><div class="stat-value stat-value-sm">${stats.mostFrequent ? escapeHtml(stats.mostFrequent.label) : '—'}</div><div class="stat-label">Esito più frequente</div></div>
      </div>
    </section>
  `;
}

function wireCallActivitySection() {
  wirePeriodBar(renderSessioniList);
  document.getElementById('pipelineFilter').addEventListener('change', (e) => {
    uiState.pipelineFilter = e.target.value;
    renderSessioniList();
  });
  document.getElementById('btnSessionReport').addEventListener('click', generateSessionReport);
}

function renderSessioneDetail(id) {
  const s = db.sessions.find(x => x.id === id);
  if (!s) {
    appRoot.innerHTML = `<a href="#/sessioni" class="back-link">← Torna alle sessioni</a><p class="text-dim">Sessione non trovata.</p>`;
    return;
  }
  const totalCalls = s.calls.length;
  const totalLeads = countSessionLeads(s, db.sessions);
  const duration = (s.endedAt ? (new Date(s.endedAt) - new Date(s.startedAt)) : (Date.now() - new Date(s.startedAt))) - (s.pausedTotalMs || 0);
  const counts = {};
  Object.assign(counts, sessionOutcomeCountsByLead(s));
  const breakdown = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([label, count]) => `
    <div class="bar-row">
      <div class="bar-label">${escapeHtml(label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct(count, s.calls.length)}%"></div></div>
      <div class="bar-value">${count}</div>
    </div>`).join('') || '<p class="text-dim">Nessuna chiamata registrata.</p>';

  appRoot.innerHTML = `
    <a href="#/sessioni" class="back-link">← Torna alle sessioni</a>
    <section class="card">
      <h2>Sessione ${s.number} - ${fmtDate(s.startedAt)}</h2>
      <p class="text-dim">${escapeHtml(s.pipelineName)} · ${fmtTime(s.startedAt)}${s.endedAt ? ' – ' + fmtTime(s.endedAt) : ' (in corso)'}</p>
      <div class="kpi-grid">
        <div class="card kpi-card"><div class="kpi-value">${fmtDuration(duration)}</div><div class="kpi-label">Durata</div></div>
        <div class="card kpi-card"><div class="kpi-value">${totalCalls}</div><div class="kpi-label">Chiamate</div></div>
        <div class="card kpi-card"><div class="kpi-value">${totalLeads}</div><div class="kpi-label">Lead</div></div>
        <div class="card kpi-card"><div class="kpi-value">${s.skips || 0}</div><div class="kpi-label">Saltati</div></div>
      </div>
      <h3>Esiti</h3>
      <div class="bar-list">${breakdown}</div>
      <button class="btn-danger-ghost" id="btnDeleteSession">Elimina sessione</button>
    </section>
  `;

  document.getElementById('btnDeleteSession').addEventListener('click', () => {
    showConfirm('Eliminare definitivamente questa sessione?', () => {
      db.sessions = db.sessions.filter(x => x.id !== s.id);
      persist();
      location.hash = '#/sessioni';
      renderRoute();
    }, { confirmLabel: 'Elimina' });
  });
}

/* ============================================================================
 * Round Recupero Appuntamenti — sessione FISSA e non eliminabile (non è una pipeline
 * editabile: vive del tutto fuori dal sistema db.pipelines/db.sessions), richiesta
 * esplicitamente dall'utente per richiamare sistematicamente i lead che hanno fatto
 * no-show sia lato Setting (presentedStatus) sia lato Venditore (dealStage).
 *
 * Ogni entry (db.recoveryRound) è agganciata al singolo APPUNTAMENTO sorgente che ha
 * generato il no-show (sourceAppointmentId), non al nominativo in astratto: così
 * "Rimuovi dal round" o la risoluzione con un nuovo appuntamento non impediscono a un
 * futuro no-show sullo stesso nome di generare una entry NUOVA, con contatore e note
 * azzerati — esattamente come richiesto ("se mai rifisso un lead con stessi dati,
 * riappaia come nuovo").
 *
 * Algoritmo di estrazione (pickNextRecoveryLead) — CORRETTO dopo il secondo esempio
 * esplicito dell'utente (lead1 chiamato 2 volte, poi entra un nuovo no-show con 0
 * chiamate -> il nuovo ha priorità la prima volta; MA quando rientro nel round dopo
 * quella prima chiamata, il tool NON deve "pareggiare" i contatori tenendo il lead
 * nuovo in testa finché non raggiunge le 2 chiamate degli altri — la rotazione deve
 * seguire SOLO l'ultima chiamata, non il numero di chiamate). Una prima versione qui
 * isolava il gruppo con callCount più basso ad ogni estrazione: sbagliato, perché
 * rimetteva sempre in testa lo stesso lead "indietro a chiamate" finché non pareggiava
 * gli altri. L'algoritmo giusto è una pura rotazione per "meno recentemente chiamato",
 * dove un lead mai chiamato (lastInteractionAt null) è per definizione il più
 * "scaduto" di tutti e va sempre prima:
 * 1. tra i lead ATTIVI, se ce n'è almeno uno MAI mostrato (lastInteractionAt null), la
 *    scelta avviene CASUALMENTE tra questi (richiesto esplicitamente: l'ordine non deve
 *    essere per data) — copre sia il primo giro sia un nuovo no-show che entra a metà
 *    round, che così ottiene la priorità richiesta senza bisogno di guardare i contatori;
 * 2. altrimenti (tutti già chiamati almeno una volta) si sceglie chi ha
 *    lastInteractionAt più vecchio — rotazione "a turno" pura, i contatori (callCount)
 *    NON entrano nel confronto e quindi non vengono mai "pareggiati" artificialmente.
 */

/**
 * Aggiunge (o mantiene) un appuntamento come lead attivo nel Round Recupero Appuntamenti,
 * quando viene marcato "No Show" — sia da Setting sia da Venditore. Non duplica se
 * esiste già una entry ATTIVA per lo stesso appuntamento (es. click ripetuto).
 */
function addToRecoveryRound(apt, role, reason) {
  db.recoveryRound = db.recoveryRound || [];
  const existingActive = db.recoveryRound.find(l => l.sourceAppointmentId === apt.id && l.status === 'active');
  if (existingActive) {
    // CORREZIONE (19/10): No show poi Annullato (o il contrario) sullo stesso appuntamento:
    // la voce resta una sola, ma il motivo segue l'ultimo esito (prima restava "No Show").
    if (reason) existingActive.sourceReason = reason;
    return;
  }
  // No show → Presentato (correzione) → di nuovo No show (Simone, 19/10): si riprende la
  // voce di prima, con tentativi e note, invece di crearne una nuova da zero. Solo le voci
  // chiuse da un cambio di stato (closedBy 'stato', vedi deactivateRecoveryEntryForAppointment):
  // quelle tolte a mano, non interessate o passate ai Da richiamare restano chiuse.
  const closed = db.recoveryRound.filter(l => l.sourceAppointmentId === apt.id && l.status === 'removed' && l.closedBy === 'stato');
  if (closed.length) {
    const back = closed[closed.length - 1];
    back.status = 'active';
    delete back.closedBy;
    back.sourceRole = role;
    if (reason) back.sourceReason = reason;
    return;
  }
  db.recoveryRound.push({
    id: uid('recov'),
    sourceAppointmentId: apt.id,
    sourceRole: role, // 'setter' | 'venditore' — dove è avvenuto QUESTO no-show/annullamento
    sourceReason: reason || 'no_show', // 'no_show' | 'annullato'
    clientName: apt.clientName || '',
    phone: apt.phone || '',
    status: 'active', // 'active' | 'resolved' (appuntamento rifissato) | 'removed' (tolto dal round)
    callCount: 0,
    lastInteractionAt: null,
    createdAt: new Date().toISOString(),
    notes: [],
    resolvedAppointmentId: null
  });
}

/**
 * Disattiva silenziosamente l'eventuale entry ATTIVA collegata a un appuntamento quando
 * il suo stato non è più "No Show" (es. l'utente corregge un click sbagliato) — non è
 * un "Rimuovi dal round" esplicito dell'utente, quindi non passa per applyRecoveryOutcome.
 */
function deactivateRecoveryEntryForAppointment(apt) {
  (db.recoveryRound || []).forEach(l => {
    if (l.sourceAppointmentId === apt.id && l.status === 'active') { l.status = 'removed'; l.closedBy = 'stato'; }
  });
}

/**
 * Voci "fantasma" (Simone, 19/10): voci ATTIVE il cui appuntamento non esiste più (es.
 * cancellato da ⋯ prima della correzione del 19/10). Si chiudono all'apertura del tool,
 * senza cancellarle (status 'removed', closedBy 'fantasma'). Nel dubbio non si chiude:
 * - nessun appuntamento caricato: non si tocca niente;
 * - voce Venditore: resta se esiste ancora un lead con lo stesso nome.
 * Restituisce true se ha chiuso qualcosa.
 */
function closeGhostRecoveryEntries() {
  if (!Array.isArray(db.recoveryRound) || !Array.isArray(db.appointments) || !db.appointments.length) return false;
  const ids = new Set(db.appointments.map(a => a.id));
  const leadNames = new Set((db.leads || []).map(l => String(l.name || '').trim().toLowerCase()).filter(Boolean));
  let changed = false;
  db.recoveryRound.forEach(r => {
    if (!r || r.status !== 'active' || !r.sourceAppointmentId || ids.has(r.sourceAppointmentId)) return;
    if (r.sourceRole === 'venditore') {
      const name = String(LeadCRM.parseApptName(r.clientName || '').name || '').trim().toLowerCase();
      if (!name || leadNames.has(name)) return;
    }
    r.status = 'removed';
    r.closedBy = 'fantasma';
    changed = true;
  });
  return changed;
}

/** Voci del round da mostrare qui: Setter e Venditore. I no show Venditore si richiamano solo
 * da qui (Simone, 24/10: "devono stare solamente nel round"; prima erano nelle Task della
 * Dashboard). Gli esiti aggiornano anche il lead (LeadCRM.onRecoveryOutcome). */
function visibleRecoveryEntries() {
  return (db.recoveryRound || []).filter(l => l.status === 'active' && !isFutureNoShowEntry(l));
}

/** No show su un appuntamento non ancora passato (Simone, 19/10): è per forza un errore,
 * quindi la voce non si vede nel round (né nei contatori) finché l'ora dell'appuntamento
 * non è passata; dopo entra da sola. Vale solo per il No show: un Annullato si sa prima
 * dell'appuntamento ed entra subito. */
function isFutureNoShowEntry(entry) {
  const a = db.appointments.find(x => x.id === entry.sourceAppointmentId);
  if (!a || !a.scheduledAt) return false;
  const st = a.role === 'venditore' ? a.dealStage : a.presentedStatus;
  if (st !== 'no_show') return false;
  const t = new Date(a.scheduledAt).getTime();
  return Number.isFinite(t) && t > Date.now();
}

/** Ruolo di una voce del round: i no show Venditore sono "venditore" solo con la parte
 * Venditore accesa (spenta, stanno con il Setting: Simone 19/10). */
function recoveryEntryRole(entry) {
  return entry.sourceRole === 'venditore' && LeadCRM.isOn() ? 'venditore' : 'setter';
}
/** Voci del round aperto: solo quelle del ruolo da cui si è entrati (Simone, 24/10: Setting e
 * Venditore separati; db.recoveryRoundRole, null = tutte). */
function roundRecoveryEntries() {
  const role = db.recoveryRoundRole;
  return visibleRecoveryEntries().filter(e => !role || recoveryEntryRole(e) === role);
}

/** Vedi commento algoritmo sopra la sezione. */
function pickNextRecoveryLead() {
  const active = roundRecoveryEntries();
  if (!active.length) return null;
  const neverShown = active.filter(l => !l.lastInteractionAt);
  if (neverShown.length) return neverShown[Math.floor(Math.random() * neverShown.length)];
  active.sort((a, b) => new Date(a.lastInteractionAt) - new Date(b.lastInteractionAt));
  return active[0];
}

/**
 * Card d'ingresso al round, sempre presente — vive in cima alla sezione Appuntamenti
 * (riga 1 dei due "round launcher": riga 2 è renderConfirmRoundEntryCard), non più in
 * Setting > Sessioni, su richiesta esplicita dell'utente per renderla più visibile.
 */
function renderRecoveryRoundEntryCard() {
  const waiting = visibleRecoveryEntries().filter(e => recoveryEntryRole(e) === 'setter').length;
  return `
    <section class="card recov-entry-card">
      <div class="recov-entry-info">
        <h3>🔁 Round Recupero Appuntamenti</h3>
        <p class="text-dim" style="font-size:0.84rem;">Richiama i lead che hanno fatto no-show o hanno annullato, un lead a caso alla volta, finché tutti non sono stati sentiti almeno una volta.${LeadCRM.isOn() ? ' I no show del Venditore hanno il loro round: dalla Dashboard, blocco Venditore.' : ''}</p>
      </div>
      <div class="recov-entry-action">
        <div class="recov-entry-count">${waiting}</div>
        <div class="recov-entry-count-label">da richiamare</div>
        <button class="btn-ghost btn-round-start" id="btnStartRecoveryRound">${waiting ? 'Inizia round' : 'Apri round'}</button>
      </div>
    </section>`;
}

function wireRecoveryRoundEntryCard() {
  const btn = document.getElementById('btnStartRecoveryRound');
  if (!btn) return;
  btn.addEventListener('click', () => {
    db.recoveryRoundActive = true;
    db.recoveryRoundRole = 'setter';
    db.recoveryRoundCurrentLeadId = null;
    persist();
    renderRoute();
  });
}

/**
 * Schermata a schermo intero del round (stesso linguaggio visivo di renderSessioneAttiva:
 * .session-screen/.session-topbar/.outcome-grid), presa in carico da renderRoute() finché
 * db.recoveryRoundActive resta true — indipendente dall'hash, esattamente come il
 * meccanismo di sessione di chiamata esistente (db.activeSession).
 */
function renderRecoveryRoundScreen() {
  document.body.classList.add('in-session');
  db.recoveryRound = db.recoveryRound || [];

  let lead = db.recoveryRoundCurrentLeadId
    ? roundRecoveryEntries().find(l => l.id === db.recoveryRoundCurrentLeadId)
    : null;
  if (!lead) {
    lead = pickNextRecoveryLead();
    db.recoveryRoundCurrentLeadId = lead ? lead.id : null;
    persist();
  }

  if (!lead) {
    appRoot.innerHTML = `
      <div class="session-screen">
        <div class="session-topbar">
          <button id="btnExitRecoveryRound" class="btn-danger-ghost">■ Esci dal round</button>
          <div class="session-pipeline-name">🔁 Round Recupero${db.recoveryRoundRole === 'venditore' ? ' · Venditore' : db.recoveryRoundRole === 'setter' && LeadCRM.isOn() ? ' · Setting' : ' Appuntamenti'}</div>
          <div></div>
        </div>
        <div class="card" style="text-align:center; padding:60px 20px;">
          <h2>Nessun lead da recuperare 🎉</h2>
          <p class="text-dim">Non ci sono No Show attivi al momento. Torna qui quando ne arriva uno nuovo.</p>
        </div>
      </div>`;
    document.getElementById('btnExitRecoveryRound').addEventListener('click', exitRecoveryRound);
    return;
  }

  const srcApt = db.appointments.find(a => a.id === lead.sourceAppointmentId);
  const displayName = (srcApt && srcApt.clientName) || lead.clientName || '(senza nome)';
  const displayPhone = (srcApt && srcApt.phone) || lead.phone || '';
  // Motivo: lo stato attuale dell'appuntamento se c'è (le voci delle prime versioni non
  // hanno sourceReason e un annullato compariva come "No Show"), altrimenti quello salvato.
  const srcStatus = srcApt ? (srcApt.role === 'venditore' ? srcApt.dealStage : srcApt.presentedStatus) : null;
  const reasonNow = srcStatus === 'annullato' || srcStatus === 'no_show' ? srcStatus : lead.sourceReason;
  const roleLabel = (reasonNow === 'annullato' ? 'Annullato' : 'No Show') + (lead.sourceRole === 'venditore' ? ' da Venditore' : ' da Setting');

  const notes = [...(lead.notes || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const notesHtml = notes.length ? notes.map(n => `
    <div class="note-card">
      <div class="note-card-text">${escapeHtml(n.text)}</div>
      <div class="note-card-meta">${fmtDateTime(n.createdAt)}</div>
    </div>`).join('') : '<p class="text-dim">Nessuna nota ancora su questo lead.</p>';

  appRoot.innerHTML = `
    <div class="session-screen">
      <div class="session-topbar">
        <button id="btnExitRecoveryRound" class="btn-danger-ghost">■ Esci dal round</button>
        <div class="session-pipeline-name">🔁 Round Recupero${db.recoveryRoundRole === 'venditore' ? ' · Venditore' : db.recoveryRoundRole === 'setter' && LeadCRM.isOn() ? ' · Setting' : ' Appuntamenti'}</div>
        <div></div>
      </div>
      <div class="session-body">
        <div class="session-main-col">

      <div class="card recov-hero">
        <span class="role-badge ${lead.sourceRole}">${roleLabel}</span>
        <div class="recov-hero-name">${escapeHtml(displayName)}</div>
        <div class="recov-hero-phone-row">
          <span class="recov-hero-phone">${displayPhone ? escapeHtml(displayPhone) : 'Nessun numero salvato'}</span>
          ${displayPhone ? `<button class="crm-copy-phone-btn" id="btnCopyRecovPhone" title="Copia numero">⧉</button>` : ''}
        </div>
        <div class="recov-hero-counter">Tentativi di recupero finora: <strong>${lead.callCount || 0}</strong></div>
      </div>

      <div class="card">
        <h3>Note su questo lead</h3>
        <div class="note-add-row">
          <textarea id="recovNoteText" placeholder="Scrivi una nota (la rivedrai solo qui, la prossima volta che ricapita questo lead)…"></textarea>
          <button class="btn-ghost" id="btnAddRecovNote" style="align-self:flex-end;">+ Aggiungi nota</button>
        </div>
        <div class="notes-list">${notesHtml}</div>
      </div>

      <div class="outcome-grid">
        <button class="outcome-btn" data-recov-outcome="non_risposto">Non risposto<span class="outcome-btn-sub">dopo ~2 squilli, passa al prossimo</span></button>
        <button class="outcome-btn" data-recov-outcome="non_interessato">Non più interessato</button>
        <button class="outcome-btn" data-recov-outcome="da_richiamare">Da richiamare</button>
        <button class="outcome-btn" data-recov-outcome="appuntamento_fissato">Appuntamento fissato</button>
        <button class="outcome-btn" data-recov-outcome="posticipato">Posticipato<span class="outcome-btn-sub">resta nel round, richiamato dopo</span></button>
        <button class="outcome-btn outcome-btn-danger" data-recov-outcome="rimosso">Rimuovi dal round</button>
      </div>
        </div>
        ${renderLiveChecklistPanel(lead.inCallChecklist)}
      </div>
    </div>
  `;
  wireLiveChecklist(appRoot, () => lead.inCallChecklist, items => { lead.inCallChecklist = items; });

  document.getElementById('btnExitRecoveryRound').addEventListener('click', exitRecoveryRound);

  const copyBtn = document.getElementById('btnCopyRecovPhone');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const ok = await copyToClipboard(displayPhone);
      showToast(ok ? 'Numero copiato.' : 'Seleziona e copia manualmente.', !ok);
    });
  }

  document.getElementById('btnAddRecovNote').addEventListener('click', () => {
    const ta = document.getElementById('recovNoteText');
    const text = ta.value.trim();
    if (!text) { ta.focus(); return; }
    lead.notes = lead.notes || [];
    lead.notes.push({ id: uid('nota'), text, createdAt: new Date().toISOString() });
    persist();
    renderRecoveryRoundScreen();
  });

  appRoot.querySelectorAll('[data-recov-outcome]').forEach(btn => {
    btn.addEventListener('click', () => {
      const outcome = btn.dataset.recovOutcome;
      if (outcome === 'appuntamento_fissato') { openRecoveryAppointmentModal(lead.id); return; }
      if (outcome === 'da_richiamare') { openRecoveryCallbackModal(lead.id); return; }
      if (outcome === 'rimosso') {
        showConfirm(`Rimuovere "${displayName}" dal round di recupero? Se in futuro fissi un nuovo appuntamento con gli stessi dati e fa di nuovo no-show, riapparirà come lead nuovo.`, () => {
          applyRecoveryOutcome(lead.id, 'rimosso');
        }, { confirmLabel: 'Rimuovi dal round' });
        return;
      }
      applyRecoveryOutcome(lead.id, outcome);
    });
  });
}

function exitRecoveryRound() {
  const fromVenditore = db.recoveryRoundRole === 'venditore';
  db.recoveryRoundActive = false;
  db.recoveryRoundCurrentLeadId = null;
  db.recoveryRoundRole = null;
  persist();
  document.body.classList.remove('in-session');
  location.hash = fromVenditore ? '#/dashboard' : '#/sessioni';
  renderRoute();
}

/* Chiamate del Round Recupero nell'attività del giorno (richiesta di Simone, 2026-10-16).
 * Prima il round contava solo i tentativi sul lead (callCount) e le chiamate non finivano
 * in nessuna sessione: non comparivano in dashboard, statistiche Setting e mail EOD.
 * Ora funziona come il Round Conferme: se c'è una sessione aperta la chiamata va lì,
 * altrimenti nella sessione automatica del giorno "Recupero".
 * Stesso lead chiamato più volte lo STESSO giorno = 1 lead (groupId del giorno);
 * un altro giorno = lead nuovo. "Posticipato" e "Rimuovi" non sono chiamate: non contano. */
const RECOVERY_AUTO_PIPELINE_ID = 'recupero-auto';
const RECOVERY_AUTO_PIPELINE_NAME = 'Recupero';
const RECOVERY_CALL_LABELS = {
  non_risposto: { label: 'Non risposto', noAnswer: true, conversion: false },
  non_interessato: { label: 'Non interessato', noAnswer: false, conversion: false },
  da_richiamare: { label: 'Da richiamare', noAnswer: false, conversion: false },
  appuntamento_fissato: { label: 'Appuntamento fissato', noAnswer: false, conversion: true }
};

function logRecoveryCall(lead, outcome) {
  const def = RECOVERY_CALL_LABELS[outcome];
  if (!def) return;
  const todayKey = dateInputValue(new Date());
  if (!lead.callGroupId || lead.callGroupDate !== todayKey) {
    lead.callGroupId = uid('lead');
    lead.callGroupDate = todayKey;
  }
  appendRecoveryCallToSession({
    id: uid('call'), timestamp: new Date().toISOString(), outcomeId: null, outcomeLabel: def.label,
    isConversion: def.conversion, isNoAnswer: def.noAnswer, isSecondAttempt: false,
    groupId: lead.callGroupId, isRecoveryCall: true
  });
}

function appendRecoveryCallToSession(callRecord) {
  appendCallToAutoSession(RECOVERY_AUTO_PIPELINE_ID, RECOVERY_AUTO_PIPELINE_NAME, callRecord);
}

/**
 * Fix A (richiesta di Hamza, scelta di Simone, 19/10/2026): una chiamata senza risposta di
 * un round (Conferme, Recupero, follow-up Venditore) che entra nella sessione APERTA prende
 * l'esito "senza risposta" della pipeline di quella sessione (outcomeId + outcomeLabel), così
 * nella sessione c'è un solo chip "Non risp". Stessa cosa per "Appuntamento fissato" (Recupero
 * e follow-up) con l'esito "Appuntamento Fissato" della pipeline, se c'è (roundCallKind). Il flag di tipo (isConfirmCall, isRecoveryCall,
 * isLeadFollowUpCall) resta: la chiamata conta sempre nel suo tipo. Le chiamate già salvate
 * con "Non risposto" le sistema il conteggio (callOutcomeLabelIn in utils.js).
 */
function roundCallAsSessionOutcome(session, callRecord) {
  if (callRecord.outcomeId) return callRecord;
  const t = pipelineOutcomeForKind(sessionPipelineOf(session, db.pipelines), roundCallKind(callRecord));
  if (t) {
    callRecord.outcomeId = t.id;
    callRecord.outcomeLabel = t.label;
  }
  return callRecord;
}

/**
 * Mette una chiamata "fuori sessione" nell'attività del giorno: nella sessione aperta se
 * c'è, altrimenti nella sessione automatica del giorno con questo pipelineId (creata alla
 * prima chiamata, endedAt aggiornato a ogni chiamata). Stesso modello delle sessioni
 * "Conferme" e "Richiami". I pipelineId automatici non esistono in db.pipelines.
 */
function appendCallToAutoSession(pipelineId, pipelineName, callRecord) {
  const live = sessionForNewCalls();
  if (live) {
    live.calls.push(roundCallAsSessionOutcome(live, callRecord));
    return;
  }
  const todayKey = dateInputValue(new Date());
  let autoSession = db.sessions.find(s => s.pipelineId === pipelineId && dateInputValue(s.startedAt) === todayKey);
  if (!autoSession) {
    db.sessionCounter += 1;
    autoSession = {
      id: uid('sess'),
      number: db.sessionCounter,
      pipelineId,
      pipelineName,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      calls: [],
      skips: 0,
      retryCallsPending: false,
      callAttemptsOnLead: 0,
      pausedAt: null,
      pausedTotalMs: 0
    };
    db.sessions.push(autoSession);
  }
  autoSession.calls.push(callRecord);
  autoSession.endedAt = new Date().toISOString();
}

/* Chiamate di follow-up dei lead Venditore nell'attività del giorno (restyling 17/10/2026,
 * decisione di Simone n. 9: "sono telefonate come quelle del Setter, quindi contano come
 * chiamate di Setting"). Le scrive lead.js (openFatto) quando la prossima azione fatta è
 * una 📞 Chiamata. Un recupero no show NON passa di qui: resta chiamata di recupero
 * (logRecoveryCall), così la stessa telefonata non conta due volte.
 * Sessione: quella aperta se c'è, altrimenti la sessione automatica "Follow-up Venditore".
 * Stesso lead lo STESSO giorno = 1 lead (groupId del giorno salvato sul lead,
 * callGroupId/callGroupDate); un altro giorno = lead nuovo. */
const LEAD_FU_AUTO_PIPELINE_ID = 'followup-venditore-auto';
const LEAD_FU_AUTO_PIPELINE_NAME = 'Follow-up Venditore';
const LEAD_FU_CALL_LABELS = {
  non_risposto: { label: 'Non risposto', noAnswer: true, conversion: false },
  ha_risposto: { label: 'Ha risposto', noAnswer: false, conversion: false },
  non_interessato: { label: 'Non interessato', noAnswer: false, conversion: false },
  cliente: { label: 'Cliente', noAnswer: false, conversion: false },
  appuntamento_fissato: { label: 'Appuntamento fissato', noAnswer: false, conversion: true }
};

/** groupId "di oggi" del lead Venditore: lo crea se manca o se è di un altro giorno. */
function leadCallGroupIdToday(lead) {
  const todayKey = dateInputValue(new Date());
  if (!lead.callGroupId || lead.callGroupDate !== todayKey) {
    lead.callGroupId = uid('lead');
    lead.callGroupDate = todayKey;
  }
  return lead.callGroupId;
}

function logLeadFollowUpCall(lead, outcome) {
  const def = LEAD_FU_CALL_LABELS[outcome];
  if (!def) return;
  appendCallToAutoSession(LEAD_FU_AUTO_PIPELINE_ID, LEAD_FU_AUTO_PIPELINE_NAME, {
    id: uid('call'), timestamp: new Date().toISOString(), outcomeId: null, outcomeLabel: def.label,
    isConversion: def.conversion, isNoAnswer: def.noAnswer, isSecondAttempt: false,
    groupId: leadCallGroupIdToday(lead), isLeadFollowUpCall: true
  });
}

/**
 * Applica un esito al lead corrente e passa al prossimo (pickNextRecoveryLead sceglie
 * di nuovo alla prossima renderRecoveryRoundScreen, azzerando recoveryRoundCurrentLeadId).
 * - non_risposto / non_interessato / da_richiamare: sono vere chiamate effettuate ->
 *   incrementano callCount e aggiornano lastInteractionAt (usato per la rotazione).
 *   non_interessato chiude anche la voce (Simone, 19/10); da_richiamare arriva da
 *   openRecoveryCallbackModal, che crea il Da richiamare e chiude la voce.
 * - posticipato: l'utente ESPLICITAMENTE non chiama in questo momento -> callCount NON
 *   incrementa (non è una chiamata reale), ma lastInteractionAt sì, altrimenti il lead
 *   ricomparirebbe subito di nuovo (stesso callCount minimo, mai "toccato" prima) invece
 *   di lasciare spazio agli altri prima di ripresentarsi.
 * - rimosso: esce dal pool attivo, per qualunque motivo, finché non viene rifissato un
 *   nuovo appuntamento con gli stessi dati (nuova entry, vedi addToRecoveryRound).
 */
function applyRecoveryOutcome(leadId, outcome) {
  const lead = (db.recoveryRound || []).find(l => l.id === leadId);
  if (!lead) return;
  const now = new Date().toISOString();
  // Checklist (5.4.3): nessun appuntamento → si azzera per la prossima chiamata.
  lead.inCallChecklist = null;
  if (outcome === 'non_risposto' || outcome === 'non_interessato' || outcome === 'da_richiamare') {
    logRecoveryCall(lead, outcome);
    lead.callCount = (lead.callCount || 0) + 1;
    lead.lastInteractionAt = now;
    // "Non più interessato" (Simone, 19/10): la chiamata conta e il lead esce dal round.
    if (outcome === 'non_interessato') { lead.status = 'removed'; lead.closedBy = 'non_interessato'; }
  } else if (outcome === 'posticipato') {
    lead.lastInteractionAt = now;
  } else if (outcome === 'rimosso') {
    lead.status = 'removed';
    lead.closedBy = 'utente';
    lead.lastInteractionAt = now;
  }
  // No show Venditore: il lead segue l'esito (Freddo dopo 6, Perso, Manca...). "Da richiamare"
  // lo aggiorna openRecoveryCallbackModal, che ha il giorno e l'ora del richiamo.
  const msg = outcome === 'da_richiamare' ? '' : LeadCRM.onRecoveryOutcome(lead, outcome);
  db.recoveryRoundCurrentLeadId = null;
  persist();
  renderRecoveryRoundScreen();
  if (msg) showToast(msg);
}

/**
 * "Da richiamare" dal round (Simone, 19/10): chiede giorno e ora con la stessa finestra
 * degli esiti di sessione (openCallbackModal, nome e telefono già scritti, note del round
 * copiate) e crea un vero Da richiamare. Solo al Salva: la chiamata conta (Non risposto
 * escluso, è "Da richiamare"), la voce esce dal round (il lead ora è nei Da richiamare).
 * Il richiamo usa il lead "di oggi" della voce: richiamato oggi = stesso lead.
 * Annulla = non succede niente.
 */
function openRecoveryCallbackModal(leadId) {
  const lead = (db.recoveryRound || []).find(l => l.id === leadId);
  if (!lead) return;
  // Lead Venditore aperto (Simone, 24/10: una riga sola): una 📞 Chiamata nel Round
  // Follow-up per il giorno scelto, niente Da richiamare Setter.
  if (LeadCRM.recoveryCallLater(lead, () => {
    applyRecoveryOutcome(lead.id, 'da_richiamare');
    lead.status = 'removed';
    lead.closedBy = 'da_richiamare';
    persist();
    renderRecoveryRoundScreen();
  })) return;
  const srcApt = db.appointments.find(a => a.id === lead.sourceAppointmentId);
  openCallbackModal({
    prefillName: (srcApt && srcApt.clientName) || lead.clientName || '',
    prefillPhone: (srcApt && srcApt.phone) || lead.phone || '',
    prefillNotes: lead.notes || [],
    groupId: leadCallGroupIdToday(lead),
    sourcePipelineId: null,
    sourcePipelineName: RECOVERY_AUTO_PIPELINE_NAME,
    afterSave: cb => {
      if (!cb) return;
      applyRecoveryOutcome(lead.id, 'da_richiamare');
      lead.status = 'removed';
      lead.closedBy = 'da_richiamare';
      lead.callbackId = cb.id;
      persist();
      renderRecoveryRoundScreen();
    }
  });
}

/**
 * "Appuntamento fissato" dal round: stessa dinamica di creazione già usata altrove
 * (nome/telefono/data-ora), ma qui in un modal perché lo schermo del round non ha una
 * tabella. L'appuntamento nasce in Setting (role:'setter') con l'etichetta "Recuperato" (vedi
 * recoveredFromNoShow/recoveredFromRole e renderApptRow). Eccezione (Simone, 24/10): un no show
 * Venditore con il suo lead diventa un nuovo appuntamento Venditore dello stesso lead
 * (LeadCRM.addApptFromRecovery; con la parte Venditore spenta resta la regola Setter).
 * Il lead viene marcato 'resolved' (esce dal pool attivo del round).
 */
function openRecoveryAppointmentModal(leadId) {
  const lead = (db.recoveryRound || []).find(l => l.id === leadId);
  if (!lead) return;
  const srcApt = db.appointments.find(a => a.id === lead.sourceAppointmentId);
  const prefillName = (srcApt && srcApt.clientName) || lead.clientName || '';
  const prefillPhone = (srcApt && srcApt.phone) || lead.phone || '';
  const nowLocal = localDateTimeValue(new Date());
  const toLead = lead.sourceRole === 'venditore' && LeadCRM.isOn() && !!(srcApt && srcApt.leadId && (db.leads || []).some(x => x.id === srcApt.leadId));

  openModal(`
    <h3>Appuntamento fissato — recupero appuntamento</h3>
    <p class="text-dim" style="font-size:0.85rem;">${toLead ? 'Nuovo appuntamento Venditore dello stesso lead.' : 'Va in Setting, con l\'etichetta "Recuperato".'}</p>
    <label class="field">Nome e cognome<input type="text" id="recovApptName" value="${escapeHtml(prefillName)}" placeholder="Nome e cognome"></label>
    <label class="field">Telefono<input type="text" id="recovApptPhone" value="${escapeHtml(prefillPhone)}" placeholder="Telefono (facoltativo)"></label>
    <label class="field">Data e ora appuntamento<input type="datetime-local" id="recovApptWhen" value="${nowLocal}"></label>
    <div class="modal-actions">
      <button class="btn-ghost" id="recovApptCancelBtn">Annulla</button>
      <button class="btn-primary" id="recovApptConfirmBtn">Salva</button>
    </div>
  `);

  const nameInput = document.getElementById('recovApptName');
  nameInput.focus();

  document.getElementById('recovApptCancelBtn').addEventListener('click', closeModal);
  document.getElementById('recovApptConfirmBtn').addEventListener('click', () => {
    const name = nameInput.value.trim();
    const phone = document.getElementById('recovApptPhone').value.trim();
    const when = document.getElementById('recovApptWhen').value;
    if (!name) { showToast('Inserisci il nome dell\'appuntamento.', true); nameInput.focus(); return; }
    if (!when) { showToast('Inserisci data e ora dell\'appuntamento.', true); return; }

    if (toLead) {
      const vApt = LeadCRM.addApptFromRecovery(lead, when);
      if (vApt) {
        lead.inCallChecklist = null;
        lead.status = 'resolved';
        lead.resolvedAppointmentId = vApt.id;
        logRecoveryCall(lead, 'appuntamento_fissato');
        lead.callCount = (lead.callCount || 0) + 1;
        lead.lastInteractionAt = new Date().toISOString();
        db.recoveryRoundCurrentLeadId = null;
        persist();
        closeModal();
        showToast('Appuntamento Venditore aggiunto al lead.');
        renderRecoveryRoundScreen();
        return;
      }
    }

    const apt = newAppointment('setter');
    apt.clientName = name;
    apt.phone = phone || null;
    apt.scheduledAt = when;
    apt.recoveredFromNoShow = true;
    apt.recoveredFromRole = lead.sourceRole;
    // Checklist del lead in chiamata (5.4.3): salvata sul fissato, poi si azzera.
    apt.checklist = checklistSnapshot(lead.inCallChecklist);
    apt.checklistPct = checklistPctOf(apt.checklist);
    lead.inCallChecklist = null;
    db.appointments.unshift(apt);

    lead.status = 'resolved';
    lead.resolvedAppointmentId = apt.id;
    logRecoveryCall(lead, 'appuntamento_fissato');
    lead.callCount = (lead.callCount || 0) + 1;
    lead.lastInteractionAt = new Date().toISOString();

    db.recoveryRoundCurrentLeadId = null;
    persist();
    closeModal();
    showToast('Appuntamento aggiunto in Setting.');
    renderRecoveryRoundScreen();
  });
}

/* ============================================================================
 * Round Conferme — richiama sistematicamente gli appuntamenti Setter di DOMANI non
 * ancora confermati (presentedStatus diverso da 'confirmed24h'/'annullato'), richiesto
 * esplicitamente dall'utente per rendere più efficace la procedura di conferma 24h
 * prima dell'appuntamento. Due punti d'ingresso (vedi db.confirmRoundReturnMode):
 * - "standalone": tasto dedicato in cima ad Appuntamenti (riga 2, sotto il Round
 *   Recupero Appuntamenti) — alla fine si chiude e basta, si torna ad Appuntamenti;
 * - "session": proposto con un Sì/No ogni volta che si avvia una sessione NORMALE
 *   (qualunque pipeline — non il Round Recupero Appuntamenti, non una chiamata di
 *   richiamo), SOLO se ci sono appuntamenti di domani da confermare — vedi
 *   startSessionAction. Alla fine prosegue automaticamente nella sessione scelta
 *   (vedi exitConfirmRound/beginPipelineSession).
 *
 * Le chiamate del round contano sempre come chiamate "vere" ma NON appartengono a
 * nessuna pipeline: finiscono in una sessione automatica giornaliera dedicata
 * ("Conferme", CONFIRM_AUTO_PIPELINE_ID) esattamente come le chiamate di richiamo fuori
 * sessione (vedi appendCallbackCallToSession) — così restano nelle statistiche del
 * giorno senza sporcare il mix di esiti della pipeline che si stava per chiamare.
 *
 * Un appuntamento chiamato 10 volte nello stesso giorno per confermarlo resta 1 LEAD
 * solo (apt.confirmGroupId, riusato per tutte le chiamate su quell'appuntamento finché
 * non viene spostato — vedi stesso meccanismo di computeStats già usato per i richiami).
 * "Non risposto" ha doppio squillo (CONFIRM_MAX_CALL_ATTEMPTS=2): primo tentativo resta
 * sullo stesso appuntamento con un banner di richiamo immediato, il secondo passa al
 * prossimo — entrambi i tentativi contano come chiamate sullo stesso lead.
 */
const CONFIRM_AUTO_PIPELINE_ID = 'conferme-auto';
const CONFIRM_AUTO_PIPELINE_NAME = 'Conferme';
const CONFIRM_MAX_CALL_ATTEMPTS = 2;
// Dalle 18:00 in poi, se restano appuntamenti di domani non confermati, compare il
// banner lampeggiante in cima al tool (vedi renderConfirmAlertBanner) — soglia
// modificabile qui in un punto solo.
const CONFIRM_ALERT_HOUR = 18;
// Messaggio WhatsApp precompilato per i non confermati rimasti a fine giornata — {nome}
// e {ora} vengono sostituiti automaticamente (vedi buildWhatsAppConfirmMessage). Testo
// esatto fornito dall'utente — "NOME" resta un placeholder letterale apposta (il tool è
// usato da più persone di Salone Vincente, quindi non va precompilato con un nome fisso:
// lo sostituisce a mano chi invia il messaggio). Facilmente modificabile: basta cambiare
// questa stringa.
const CONFIRM_WHATSAPP_TEMPLATE = 'Buonasera {nome}, sono NOME di Salone Vincente 😊\nti scrivo perché domani {ora} hai un appuntamento con uno dei nostri consulenti.\nMi confermi la tua presenza?\n\nDomani mattina ti contatterà il consulente per mandarti il link della videochiamata.';

function getTomorrowDateKey() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return dateInputValue(d);
}

/**
 * Giorni da confermare oggi (Simone, 2026-10-09): gli appuntamenti del PROSSIMO GIORNO
 * LAVORATIVO, più eventuali sabato/domenica in mezzo. Lun-gio = domani; venerdì = sabato,
 * domenica e lunedì; sabato = domenica e lunedì; domenica = lunedì.
 */
function getConfirmTargetDateKeys() {
  const keys = [];
  const d = new Date();
  for (let i = 0; i < 7; i++) {
    d.setDate(d.getDate() + 1);
    keys.push(dateInputValue(d));
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) break;
  }
  return keys;
}

/** "domani" oppure il nome del giorno ("lunedì") quando si conferma oltre il weekend. */
function getConfirmTargetLabel() {
  const keys = getConfirmTargetDateKeys();
  if (keys.length === 1) return 'domani';
  const last = new Date(keys[keys.length - 1] + 'T12:00');
  return last.toLocaleDateString('it-IT', { weekday: 'long' });
}

/** Appuntamenti Setter del prossimo giorno lavorativo (vedi getConfirmTargetDateKeys)
 * ancora da confermare (né confermati né annullati). */
function getPendingConfirmAppointments() {
  const targetKeys = getConfirmTargetDateKeys();
  return db.appointments.filter(a =>
    a.role === 'setter' &&
    targetKeys.indexOf(dateInputValue(a.scheduledAt)) !== -1 &&
    a.presentedStatus !== 'confirmed24h' &&
    a.presentedStatus !== 'annullato' &&
    a.presentedStatus !== 'spostato'
  );
}

/** Stessa rotazione "equa" del Round Recupero Appuntamenti: mai mostrato -> a caso tra questi,
 * altrimenti il meno recentemente mostrato. */
function pickNextConfirmAppt() {
  const pending = getPendingConfirmAppointments();
  if (!pending.length) return null;
  const neverShown = pending.filter(a => !a.confirmLastInteractionAt);
  if (neverShown.length) return neverShown[Math.floor(Math.random() * neverShown.length)];
  pending.sort((a, b) => new Date(a.confirmLastInteractionAt) - new Date(b.confirmLastInteractionAt));
  return pending[0];
}

/** Dove finiscono le chiamate del round (richiesta di Hamza, 2026-10-12): se c'è una
 * sessione aperta, DENTRO quella sessione, come lead chiamati in più (così i numeri della
 * sessione tornano senza doverle segnare a mano). Se il round è partito dal Sì/No di
 * inizio sessione, la sessione scelta viene aperta subito (in background) e le chiamate
 * vanno lì. Solo senza nessuna sessione (round da Appuntamenti) restano nella sessione
 * automatica giornaliera "Conferme". */
function appendConfirmCallToSession(callRecord) {
  if (!db.activeSession && db.confirmRoundReturnMode === 'session' && db.confirmRoundPendingPipelineId) {
    createPipelineSession(db.confirmRoundPendingPipelineId);
    uiState.sessionMinimized = true;
  }
  const live = sessionForNewCalls();
  if (live) {
    live.calls.push(roundCallAsSessionOutcome(live, callRecord));
    return;
  }
  const todayKey = dateInputValue(new Date());
  let autoSession = db.sessions.find(s => s.pipelineId === CONFIRM_AUTO_PIPELINE_ID && dateInputValue(s.startedAt) === todayKey);
  if (!autoSession) {
    db.sessionCounter += 1;
    autoSession = {
      id: uid('sess'),
      number: db.sessionCounter,
      pipelineId: CONFIRM_AUTO_PIPELINE_ID,
      pipelineName: CONFIRM_AUTO_PIPELINE_NAME,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      calls: [],
      skips: 0,
      retryCallsPending: false,
      callAttemptsOnLead: 0,
      pausedAt: null,
      pausedTotalMs: 0
    };
    db.sessions.push(autoSession);
  }
  autoSession.calls.push(callRecord);
  autoSession.endedAt = new Date().toISOString();
}

/**
 * Card d'ingresso al Round Conferme — riga 2 dei "round launcher" in cima ad
 * Appuntamenti, sotto quella del Round Recupero Appuntamenti (vedi renderAppuntamenti).
 */
function renderConfirmRoundEntryCard() {
  const waiting = getPendingConfirmAppointments().length;
  return `
    <section class="card recov-entry-card confirm-variant">
      <div class="recov-entry-info">
        <h3>✅ Round Conferme</h3>
        <p class="text-dim" style="font-size:0.84rem;">Richiama gli appuntamenti di ${getConfirmTargetLabel()} ancora da confermare, uno alla volta, finché non sono tutti confermati (24h prima).</p>
      </div>
      <div class="recov-entry-action">
        <div class="recov-entry-count">${waiting}</div>
        <div class="recov-entry-count-label">da confermare</div>
        <button class="btn-ghost btn-round-start" id="btnStartConfirmRoundStandalone">${waiting ? 'Inizia round' : 'Apri round'}</button>
      </div>
    </section>`;
}

function wireConfirmRoundEntryCard() {
  const btn = document.getElementById('btnStartConfirmRoundStandalone');
  if (!btn) return;
  btn.addEventListener('click', () => {
    db.confirmRoundActive = true;
    db.confirmRoundCurrentApptId = null;
    db.confirmRoundReturnMode = 'standalone';
    db.confirmRoundPendingPipelineId = null;
    persist();
    renderRoute();
  });
}

/**
 * Sì/No proposto appena si prova ad avviare una sessione normale, SOLO se ci sono
 * appuntamenti di domani da confermare (vedi startSessionAction). "Sì" apre il round in
 * modalità "session": alla fine prosegue automaticamente nella pipeline scelta.
 */
function openConfirmRoundPromptModal(pipelineId, count) {
  openModal(`
    <h3>Round di conferme</h3>
    <p>Hai <strong>${count}</strong> appuntament${count === 1 ? 'o' : 'i'} di ${getConfirmTargetLabel()} ancora da confermare. Vuoi farlo ora, prima di iniziare la sessione?</p>
    <div class="modal-actions">
      <button class="btn-ghost" id="confirmRoundNoBtn">No, vai alla sessione</button>
      <button class="btn-primary" id="confirmRoundYesBtn">Sì, fai il round</button>
    </div>
  `);
  document.getElementById('confirmRoundNoBtn').addEventListener('click', () => {
    closeModal();
    beginPipelineSession(pipelineId);
  });
  document.getElementById('confirmRoundYesBtn').addEventListener('click', () => {
    closeModal();
    db.confirmRoundActive = true;
    db.confirmRoundCurrentApptId = null;
    db.confirmRoundReturnMode = 'session';
    db.confirmRoundPendingPipelineId = pipelineId;
    persist();
    renderRoute();
  });
}

/**
 * Schermata a schermo intero del Round Conferme (stesso linguaggio visivo di
 * renderSessioneAttiva/renderRecoveryRoundScreen: .session-screen/.outcome-grid).
 */
function renderConfirmRoundScreen() {
  document.body.classList.add('in-session');
  const pending = getPendingConfirmAppointments();

  let apt = db.confirmRoundCurrentApptId ? pending.find(a => a.id === db.confirmRoundCurrentApptId) : null;
  if (!apt) {
    apt = pickNextConfirmAppt();
    db.confirmRoundCurrentApptId = apt ? apt.id : null;
    persist();
  }

  if (!apt) {
    appRoot.innerHTML = `
      <div class="session-screen">
        <div class="session-topbar">
          <button id="btnExitConfirmRound" class="btn-danger-ghost">■ Esci dal round</button>
          <div class="session-pipeline-name">✅ Round Conferme</div>
          <div></div>
        </div>
        <div class="card" style="text-align:center; padding:60px 20px;">
          <h2>Tutto confermato 🎉</h2>
          <p class="text-dim">Non ci sono appuntamenti di ${getConfirmTargetLabel()} ancora da confermare.</p>
        </div>
      </div>`;
    document.getElementById('btnExitConfirmRound').addEventListener('click', exitConfirmRound);
    return;
  }

  const attemptNum = (apt.confirmCallAttempts || 0) + 1;
  const retryBannerHtml = apt.confirmRetryPending ? `
    <div class="second-call-banner">
      <span class="blink-dot"></span>Richiamo subito — ${attemptNum}ª chiamata, stesso appuntamento
      <span class="scb-hint">Doppio squillo massimo: al prossimo "Non risposto" si passa avanti.</span>
    </div>` : '';

  appRoot.innerHTML = `
    <div class="session-screen">
      <div class="session-topbar">
        <button id="btnExitConfirmRound" class="btn-danger-ghost">■ Esci dal round</button>
        <div class="session-pipeline-name">✅ Round Conferme</div>
        <div class="session-topbar-right">
          <button id="btnConfirmSkip" class="btn-skip">Skip →</button>
        </div>
      </div>

      <div class="session-body">
        <div class="session-main-col">
      <div class="card recov-hero">
        <div class="recov-hero-name">${escapeHtml(apt.clientName || '(senza nome)')}</div>
        <div class="recov-hero-phone-row">
          <span class="confirm-hero-phone">${apt.phone ? escapeHtml(apt.phone) : 'Nessun numero salvato'}</span>
          ${apt.phone ? `<button class="crm-copy-phone-btn" id="btnCopyConfirmPhone" title="Copia numero">⧉</button>` : ''}
        </div>
        <div class="confirm-hero-when">${fmtRelativeDayTime(apt.scheduledAt)}</div>
      </div>

      ${retryBannerHtml}

      <div class="outcome-grid outcome-grid-2">
        <button class="outcome-btn" data-confirm-outcome="confermato">Confermato 24h</button>
        <button class="outcome-btn" data-confirm-outcome="spostato">Appuntamento spostato<span class="outcome-btn-sub">cambia data/ora</span></button>
        <button class="outcome-btn outcome-btn-danger" data-confirm-outcome="annullato">Annullato</button>
        <button class="outcome-btn" data-confirm-outcome="non_risposto">Non risposto<span class="outcome-btn-sub">doppio squillo</span></button>
      </div>
        </div>
        ${renderLiveChecklistPanel(confirmChecklistItems(apt), { locked: checklistOnIds(apt.checklist), hint: 'Già spuntate quelle salvate. Le nuove si aggiungono quando confermi (se ne spunti almeno una).' })}
      </div>
    </div>
  `;
  wireLiveChecklist(appRoot, () => confirmChecklistItems(apt), items => { apt.inCallChecklist = items; });

  document.getElementById('btnExitConfirmRound').addEventListener('click', exitConfirmRound);
  document.getElementById('btnConfirmSkip').addEventListener('click', () => skipConfirmAppt(apt.id));

  const copyBtn = document.getElementById('btnCopyConfirmPhone');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const ok = await copyToClipboard(apt.phone);
      showToast(ok ? 'Numero copiato.' : 'Seleziona e copia manualmente.', !ok);
    });
  }

  appRoot.querySelectorAll('[data-confirm-outcome]').forEach(btn => {
    btn.addEventListener('click', () => {
      const outcome = btn.dataset.confirmOutcome;
      if (outcome === 'spostato') { openConfirmMoveModal(apt.id); return; }
      if (outcome === 'annullato') {
        showConfirm(`Annullare l'appuntamento di "${apt.clientName || '(senza nome)'}"?`, () => {
          applyConfirmOutcome(apt.id, 'annullato');
        }, { confirmLabel: 'Annulla appuntamento' });
        return;
      }
      applyConfirmOutcome(apt.id, outcome);
    });
  });
}

/** Spunte del Round Conferme: quelle già salvate sull'appuntamento (bloccate) + quelle
 * in corso (apt.inCallChecklist, sopravvive a un ricaricamento). */
function confirmChecklistItems(apt) {
  return Object.assign({}, checklistOnIds(apt.checklist), apt.inCallChecklist || {});
}

function exitConfirmRound() {
  const mode = db.confirmRoundReturnMode;
  const pendingPid = db.confirmRoundPendingPipelineId;
  db.confirmRoundActive = false;
  db.confirmRoundCurrentApptId = null;
  db.confirmRoundReturnMode = null;
  db.confirmRoundPendingPipelineId = null;
  persist();
  document.body.classList.remove('in-session');
  if (db.activeSession && mode === 'session') {
    // Sessione già aperta dal round stesso (vedi appendConfirmCallToSession):
    // si torna lì invece di crearne una nuova.
    uiState.sessionMinimized = false;
    location.hash = '#/sessione-attiva';
    renderRoute();
  } else if (mode === 'session' && pendingPid) {
    beginPipelineSession(pendingPid);
  } else {
    location.hash = '#/setting-appuntamenti';
    renderRoute();
  }
}

/** Skip: passa al prossimo senza che conti come chiamata (ma lo "tocca" ai fini della
 * rotazione, altrimenti ricomparirebbe subito). */
function skipConfirmAppt(apptId) {
  const apt = db.appointments.find(a => a.id === apptId);
  if (apt) {
    apt.confirmLastInteractionAt = new Date().toISOString();
    apt.confirmCallAttempts = 0;
    apt.confirmRetryPending = false;
    delete apt.inCallChecklist; // saltato: le spunte in corso non si salvano
  }
  db.confirmRoundCurrentApptId = null;
  persist();
  renderConfirmRoundScreen();
}

/**
 * Applica l'esito di una chiamata di conferma e logga SEMPRE la chiamata (vedi
 * appendConfirmCallToSession) — tutti e tre gli esiti qui dentro sono vere chiamate.
 * - confermato/annullato: l'appuntamento esce dal pool (presentedStatus aggiornato).
 * - non_risposto: doppio squillo (CONFIRM_MAX_CALL_ATTEMPTS) — resta sullo stesso
 *   appuntamento al primo tentativo, passa al prossimo al secondo.
 */
/** Lead della conferma: uno per appuntamento PER GIORNO (bug 13/10: prima restava lo
 * stesso anche il giorno dopo, e le chiamate di due giorni diversi contavano 1 lead). */
function ensureConfirmGroupId(apt) {
  const todayKey = dateInputValue(new Date());
  if (!apt.confirmGroupId || apt.confirmGroupDate !== todayKey) {
    apt.confirmGroupId = uid('lead');
    apt.confirmGroupDate = todayKey;
  }
}

function applyConfirmOutcome(apptId, outcome) {
  const apt = db.appointments.find(a => a.id === apptId);
  if (!apt) return;
  ensureConfirmGroupId(apt);
  const now = new Date().toISOString();
  const isRetryAttempt = !!apt.confirmRetryPending;

  if (outcome === 'confermato') {
    appendConfirmCallToSession({
      id: uid('call'), timestamp: now, outcomeId: null, outcomeLabel: 'Confermato 24h',
      isConversion: true, isNoAnswer: false, isSecondAttempt: isRetryAttempt,
      groupId: apt.confirmGroupId, isConfirmCall: true
    });
    apt.presentedStatus = 'confirmed24h';
    apt.presentedAt = apt.scheduledAt;
    deactivateRecoveryEntryForAppointment(apt);
    apt.confirmLastInteractionAt = now;
    apt.confirmCallAttempts = 0;
    apt.confirmRetryPending = false;
    // Checklist: unione con quella salvata, solo se c'è almeno una voce spuntata.
    const savedCk = mergeChecklistIntoAppt(apt, confirmChecklistItems(apt));
    delete apt.inCallChecklist;
    db.confirmRoundCurrentApptId = null;
    persist();
    showToast(savedCk ? `Appuntamento confermato. Checklist salvata (${CHECKLIST_ITEMS.filter(it => apt.checklist[it.id]).length}/${CHECKLIST_ITEMS.length}).` : 'Appuntamento confermato.');
    renderConfirmRoundScreen();
    return;
  }

  if (outcome === 'annullato') {
    appendConfirmCallToSession({
      id: uid('call'), timestamp: now, outcomeId: null, outcomeLabel: 'Annullato',
      isConversion: false, isNoAnswer: false, isSecondAttempt: isRetryAttempt,
      groupId: apt.confirmGroupId, isConfirmCall: true
    });
    apt.presentedStatus = 'annullato';
    addToRecoveryRound(apt, 'setter', 'annullato');
    delete apt.inCallChecklist;
    apt.confirmLastInteractionAt = now;
    apt.confirmCallAttempts = 0;
    apt.confirmRetryPending = false;
    db.confirmRoundCurrentApptId = null;
    persist();
    showToast('Appuntamento annullato.');
    renderConfirmRoundScreen();
    return;
  }

  if (outcome === 'non_risposto') {
    appendConfirmCallToSession({
      id: uid('call'), timestamp: now, outcomeId: null, outcomeLabel: 'Non risposto',
      isConversion: false, isNoAnswer: true, isSecondAttempt: isRetryAttempt,
      groupId: apt.confirmGroupId, isConfirmCall: true
    });
    const attemptsSoFar = isRetryAttempt ? (apt.confirmCallAttempts || 1) + 1 : 1;
    apt.confirmLastInteractionAt = now;
    if (attemptsSoFar < CONFIRM_MAX_CALL_ATTEMPTS) {
      apt.confirmCallAttempts = attemptsSoFar;
      apt.confirmRetryPending = true;
      // db.confirmRoundCurrentApptId resta invariato: stesso appuntamento al prossimo render.
    } else {
      apt.confirmCallAttempts = 0;
      apt.confirmRetryPending = false;
      db.confirmRoundCurrentApptId = null;
    }
    persist();
    renderConfirmRoundScreen();
  }
}

/** "Appuntamento spostato" (Round Conferme): chiede la nuova data/ora, logga la chiamata
 * e sposta l'appuntamento con rescheduleAppointment (il vecchio resta "Spostato", ne
 * nasce uno nuovo con rotazione/gruppo a zero — è di fatto un nuovo slot). */
function openConfirmMoveModal(apptId) {
  const apt = db.appointments.find(a => a.id === apptId);
  if (!apt) return;
  const currentVal = (apt.scheduledAt || '').slice(0, 16);

  openModal(`
    <h3>Appuntamento spostato</h3>
    <p class="text-dim" style="font-size:0.85rem;">A quando è stato spostato l'appuntamento di "${escapeHtml(apt.clientName || '(senza nome)')}"?</p>
    <label class="field">Nuova data e ora<input type="datetime-local" id="confirmMoveWhen" value="${currentVal}"></label>
    <p class="text-dim" style="font-size:0.78rem;">Il vecchio appuntamento resta segnato come "Spostato". Ne viene creato uno nuovo alla nuova data. Nei dati conta come un solo appuntamento.</p>
    <div class="modal-actions">
      <button class="btn-ghost" id="confirmMoveCancelBtn">Annulla</button>
      <button class="btn-primary" id="confirmMoveConfirmBtn">Salva</button>
    </div>
  `);

  document.getElementById('confirmMoveCancelBtn').addEventListener('click', closeModal);
  document.getElementById('confirmMoveConfirmBtn').addEventListener('click', () => {
    const when = document.getElementById('confirmMoveWhen').value;
    if (!when) { showToast('Inserisci la nuova data e ora.', true); return; }

    ensureConfirmGroupId(apt);
    appendConfirmCallToSession({
      id: uid('call'), timestamp: new Date().toISOString(), outcomeId: null, outcomeLabel: 'Appuntamento spostato',
      isConversion: false, isNoAnswer: false, isSecondAttempt: !!apt.confirmRetryPending,
      groupId: apt.confirmGroupId, isConfirmCall: true
    });

    // Stessa regola della tabella Appuntamenti: il vecchio resta "Spostato", ne nasce uno
    // nuovo alla nuova data (con gruppo/tentativi/rotazione a zero — è un nuovo slot).
    apt.confirmRetryPending = false;
    delete apt.inCallChecklist; // spostato: le spunte in corso non si salvano (solo "Confermato")
    rescheduleAppointment(apt, when);

    db.confirmRoundCurrentApptId = null;
    persist();
    closeModal();
    showToast('Appuntamento spostato.');
    renderConfirmRoundScreen();
  });
}

/**
 * "alle 9" se l'appuntamento è in punto, "alle 9:30" altrimenti — italiano naturale da
 * messaggio, invece del formato fisso "09:00" usato nel resto del tool (vedi
 * buildWhatsAppConfirmMessage, richiesto esplicitamente dall'utente come "ora
 * dell'appuntamento in italiano corretto").
 */
function fmtItalianHourPhrase(d) {
  const target = new Date(d);
  const h = target.getHours();
  const m = target.getMinutes();
  return m === 0 ? `alle ${h}` : `alle ${h}:${String(m).padStart(2, '0')}`;
}

/** Messaggio WhatsApp precompilato per un appuntamento non confermato (vedi
 * renderConfirmAlertBanner) — {nome} usa solo il primo nome per un tono più diretto. */
function buildWhatsAppConfirmMessage(apt) {
  const firstName = (apt.clientName || '').trim().split(/\s+/)[0] || '';
  const orarioPhrase = fmtItalianHourPhrase(apt.scheduledAt);
  // Oltre il weekend "domani" diventa il giorno vero ("lunedì").
  const giorno = dateInputValue(apt.scheduledAt) === getTomorrowDateKey() ? 'domani' : new Date(apt.scheduledAt).toLocaleDateString('it-IT', { weekday: 'long' });
  const Giorno = giorno.charAt(0).toUpperCase() + giorno.slice(1);
  return CONFIRM_WHATSAPP_TEMPLATE.replace('domani {ora}', `${giorno} {ora}`).replace('Domani mattina', `${Giorno} mattina`).replace('{nome}', firstName).replace('{ora}', orarioPhrase);
}

/**
 * Banner fisso lampeggiante ("ci sono ancora conferme da fare"), mostrato dalle 18:00
 * (CONFIRM_ALERT_HOUR) in poi se restano appuntamenti di domani non confermati — vive
 * fuori da #app, subito sotto la barra della pagina, così è visibile su qualunque schermata (tranne
 * durante una sessione/round a schermo intero, dove si nasconde via CSS .in-session).
 * Espandibile: elenco con nome/telefono/orario e un tasto per copiare un messaggio
 * WhatsApp precompilato pronto da incollare (vedi buildWhatsAppConfirmMessage).
 */
function renderConfirmAlertBanner() {
  const pending = getPendingConfirmAppointments();
  const show = pending.length > 0 && new Date().getHours() >= CONFIRM_ALERT_HOUR;
  let el = document.getElementById('confirmAlertBanner');

  if (!show) {
    if (el) el.remove();
    return;
  }

  const wasOpen = el ? el.classList.contains('open') : false;
  if (!el) {
    el = document.createElement('div');
    el.id = 'confirmAlertBanner';
    el.className = 'confirm-alert-banner';
    // Sotto la barra della pagina.
    const pageBar = document.getElementById('pageBar');
    pageBar.insertAdjacentElement('afterend', el);
  }

  const sorted = [...pending].sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  const itemsHtml = sorted.map(a => `
    <div class="confirm-alert-item">
      <div class="confirm-alert-item-main">
        <span class="confirm-alert-item-name">${escapeHtml(a.clientName || '(senza nome)')}</span>
        <span class="confirm-alert-item-phone">${a.phone ? escapeHtml(a.phone) : 'nessun numero'}</span>
      </div>
      <span class="confirm-alert-item-time">${fmtRelativeDayTime(a.scheduledAt)}</span>
      <button class="btn-ghost confirm-alert-copy-btn" data-copy-wa="${a.id}">📋 Copia messaggio</button>
    </div>`).join('');

  el.classList.toggle('open', wasOpen);
  el.innerHTML = `
    <button class="confirm-alert-toggle" id="confirmAlertToggle">
      <span class="blink-dot"></span>
      <span>Hai ${pending.length} appuntament${pending.length === 1 ? 'o' : 'i'} di ${getConfirmTargetLabel()} non confermat${pending.length === 1 ? 'o' : 'i'}!</span>
      <span class="confirm-alert-chevron">▾</span>
    </button>
    <div class="confirm-alert-list">${itemsHtml}</div>
  `;

  document.getElementById('confirmAlertToggle').addEventListener('click', () => {
    el.classList.toggle('open');
  });
  el.querySelectorAll('[data-copy-wa]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const apt = db.appointments.find(a => a.id === btn.dataset.copyWa);
      if (!apt) return;
      const msg = buildWhatsAppConfirmMessage(apt);
      const ok = await copyToClipboard(msg);
      showToast(ok ? 'Messaggio copiato: incollalo su WhatsApp.' : 'Seleziona e copia manualmente.', !ok);
    });
  });
}

/* ============================================================================
 * Appuntamenti (mini-CRM) — sistema parallelo alle sessioni/pipeline di chiamata
 * outbound qui sopra. Non condivide dati con esse.
 * ==========================================================================*/

/**
 * Crea una nuova riga appuntamento con i default del modello dati (vedi commento
 * su db.appointments in storage.js). closedAt resta null finché non viene marcato
 * closed=true (vedi setAppointmentClosed) — è il campo che determina il mese di
 * incasso del cashCollected iniziale (vedi utils.js:appointmentCashDate).
 *
 * Split Setter/Venditore: presentedStatus/presentedAt restano il modello del Setter
 * (invariato). Il Venditore usa invece dealStage (vedi DEAL_STAGES) — uno stato
 * trattativa a scelta singola che sostituisce sia "presentato" sia "chiuso" per quel
 * ruolo; note[] e nextFollowUpDate sono campi vecchi del Venditore: dal 16/10 note e
 * follow-up stanno nella scheda lead e lead.js li sposta lì (LeadCRM, moveApptExtras).
 */
function newAppointment(role) {
  return {
    id: uid('appt'),
    createdAt: new Date().toISOString(),
    role: role || 'setter',
    clientName: '',
    phone: null,
    scheduledAt: localDateTimeValue(new Date()),
    presentedStatus: 'no',
    presentedAt: null,
    closed: false,
    closedAt: null,
    cashCollected: 0,
    totalSold: 0,
    installments: [],
    linkedAppointmentId: null,
    dealStage: null,          // solo Venditore — vedi DEAL_STAGES
    notes: [],                // solo Venditore — { id, text, author, createdAt }
    nextFollowUpDate: null,   // solo Venditore — YYYY-MM-DD (solo data, non ora)
    recoveredFromNoShow: false, // true se creato dal Round Recupero Appuntamenti
    recoveredFromRole: null,    // 'setter' | 'venditore' — ruolo in cui è avvenuto il no-show originale
    rescheduledFromId: null,    // vedi openRescheduleModal — appuntamento da cui è stato spostato
    rescheduledToId: null,      // vedi openRescheduleModal — nuovo appuntamento creato dallo spostamento
    confirmGroupId: null,       // vedi Round Conferme più sotto
    confirmCallAttempts: 0,
    confirmRetryPending: false,
    confirmLastInteractionAt: null,
    // Restyling (17/10/2026) — vedi migrateAppointment in storage.js
    centerName: '',             // nome del centro, chiesto alla chiusura
    venditoreName: '',          // solo Setter — a chi è passato l'appuntamento, chiesto alla chiusura
    checklist: null,            // solo Setter fissati in chiamata — { <id CHECKLIST_ITEMS>: bool }
    checklistPct: null          // 0-100, vedi checklistPctOf
  };
}

/**
 * Stati trattativa del Venditore (sostituiscono Presentato/Chiuso per questo ruolo).
 * Scelti dall'utente. "isClosed" marca gli stati che
 * contano come chiusura ai fini di commissioni/funnel "Chiusi" (Contratto Firmato e
 * Chiuso — entrambi implicano soldi incassati/da incassare); "isPresented" marca gli
 * stati che implicano che il lead si sia presentato (tutti tranne No Show, che per
 * definizione è l'assenza del lead — vedi computeFunnelValues per come viene usato).
 */
const DEAL_STAGES = [
  { key: 'no_show',           label: 'No Show',           isClosed: false, isPresented: false },
  // Annullato: né presentato né no-show — fuori da show rate e closing rate (come Spostato).
  { key: 'annullato',         label: 'Annullato',         isClosed: false, isPresented: false },
  { key: 'trattativa',        label: 'Trattativa',        isClosed: false, isPresented: true },
  { key: 'contratto_firmato', label: 'Contratto Firmato', isClosed: true,  isPresented: true },
  { key: 'chiuso',            label: 'Chiuso',            isClosed: true,  isPresented: true },
  { key: 'perso',             label: 'Perso',             isClosed: false, isPresented: true },
  // "Non in target": il lead si è presentato (conta come show) ma non era in target —
  // escluso dal closing/conversion rate (vedi utils.js computeVenditoreStats).
  { key: 'non_in_target',     label: 'Non in target',     isClosed: false, isPresented: true, excludeFromClosing: true },
  // "Spostato": l'appuntamento non si è svolto in questa data ma è stato riprogrammato —
  // né presentato né no-show. Selezionarlo apre openRescheduleModal (nuova data).
  { key: 'spostato',          label: 'Spostato',          isClosed: false, isPresented: false }
];
function dealStageDef(key) { return DEAL_STAGES.find(s => s.key === key) || null; }

/* ============================================================================
 * Appuntamento spostato (Setter e Venditore) — richiesto esplicitamente dall'utente.
 * Regole:
 * - Il vecchio appuntamento RESTA in tabella con esito "Spostato" (Setter:
 *   presentedStatus, Venditore: dealStage).
 * - Viene creato un NUOVO appuntamento con la nuova data, stesso lead, ancora da esitare.
 * - Ai fini di dati e statistiche è UN SOLO appuntamento: il nuovo ha rescheduledFromId
 *   e non conta come fissato/assegnato (vedi utils.js isCountedAsNewBooking); il vecchio
 *   non conta né come presentato né come no-show né come "svolto".
 * ==========================================================================*/

/** Sposta un appuntamento: marca il vecchio come "Spostato" e crea il nuovo alla data
 * `when` (valore datetime-local). Restituisce il nuovo appuntamento. */
function rescheduleAppointment(apt, when) {
  const fresh = newAppointment(apt.role);
  fresh.clientName = apt.clientName;
  fresh.phone = apt.phone;
  fresh.scheduledAt = when;
  fresh.linkedAppointmentId = apt.linkedAppointmentId;
  fresh.recoveredFromNoShow = apt.recoveredFromNoShow;
  fresh.recoveredFromRole = apt.recoveredFromRole;
  fresh.notes = (apt.notes || []).map(n => Object.assign({}, n)); // storico note Venditore
  fresh.nextFollowUpDate = apt.nextFollowUpDate;
  fresh.rescheduledFromId = apt.id;
  if (apt.leadId) fresh.leadId = apt.leadId; // stesso lead (parte Venditore, lead.js)

  if (apt.role === 'venditore') {
    apt.dealStage = 'spostato';
    apt.closed = false;
    apt.closedAt = null;
  } else {
    apt.presentedStatus = 'spostato';
  }
  apt.rescheduledToId = fresh.id;
  deactivateRecoveryEntryForAppointment(apt);

  // Il nuovo va subito sopra al vecchio nella lista dati.
  const idx = db.appointments.findIndex(a => a.id === apt.id);
  db.appointments.splice(idx < 0 ? 0 : idx, 0, fresh);
  return fresh;
}

/** Finestra "Appuntamento spostato": chiede la nuova data/ora. Se si annulla non cambia
 * nulla. `onDone` ridisegna la schermata da cui è stato aperto. */
function openRescheduleModal(apptId, onDone) {
  const apt = db.appointments.find(a => a.id === apptId);
  if (!apt) return;

  openModal(`
    <h3>Appuntamento spostato</h3>
    <p class="text-dim" style="font-size:0.85rem;">A quando è stato spostato l'appuntamento di "${escapeHtml(apt.clientName || '(senza nome)')}"?</p>
    <label class="field">Nuova data e ora<input type="datetime-local" id="rescheduleWhen" value=""></label>
    <p class="text-dim" style="font-size:0.78rem;">Il vecchio appuntamento resta segnato come "Spostato". Ne viene creato uno nuovo alla nuova data, ancora da esitare. Nei dati conta come un solo appuntamento.</p>
    <div class="modal-actions">
      <button class="btn-ghost" id="rescheduleCancelBtn">Annulla</button>
      <button class="btn-primary" id="rescheduleConfirmBtn">Salva</button>
    </div>
  `);

  document.getElementById('rescheduleCancelBtn').addEventListener('click', closeModal);
  document.getElementById('rescheduleConfirmBtn').addEventListener('click', () => {
    const when = document.getElementById('rescheduleWhen').value;
    if (!when) { showToast('Inserisci la nuova data e ora.', true); return; }
    rescheduleAppointment(apt, when);
    persist();
    closeModal();
    showToast('Appuntamento spostato al ' + fmtDateTime(when) + '.');
    if (typeof onDone === 'function') onDone();
  });
}

/** Badge in tabella: sul vecchio "→ Spostato al …", sul nuovo "↻ Spostato dal …". */
function rescheduleBadgesHtml(a) {
  let out = '';
  if (a.rescheduledToId) {
    const to = db.appointments.find(x => x.id === a.rescheduledToId);
    if (to) out += `<span class="badge moved-badge">→ Spostato al ${escapeHtml(fmtDateTime(to.scheduledAt))}</span>`;
  }
  if (a.rescheduledFromId) {
    const from = db.appointments.find(x => x.id === a.rescheduledFromId);
    if (from) out += `<span class="badge moved-badge">↻ Spostato dal ${escapeHtml(fmtDateTime(from.scheduledAt))}</span>`;
  }
  return out;
}

/** Eliminando uno dei due appuntamenti collegati, l'altro torna "normale": se si elimina
 * il vecchio, il nuovo torna a contare come appuntamento (altrimenti sparirebbe dai dati). */
function unlinkRescheduleOnDelete(apt) {
  db.appointments.forEach(x => {
    if (x.rescheduledFromId === apt.id) x.rescheduledFromId = null;
    if (x.rescheduledToId === apt.id) x.rescheduledToId = null;
  });
}

function apptTotalSold(apt) {
  // Il totale venduto è editabile direttamente, ma se ci sono rate esplicite che
  // superano il valore salvato, mostriamo il massimo tra i due per coerenza visiva
  // (l'utente può comunque editare totalSold a mano in qualunque momento). Le rate
  // esplicite includono la rata sintetica "Acconto" (vedi getEffectiveInstallments),
  // quindi il cash collected è già conteggiato qui una sola volta.
  const instSum = getEffectiveInstallments(apt).reduce((s, i) => s + (i.amount || 0), 0);
  return Math.max(apt.totalSold || 0, instSum);
}

/**
 * CORREZIONE (segnalata dall'utente): prima il cash collected generava un evento di
 * commissione a parte ("_cash0"), indipendente dalle rate — se l'utente inseriva poi
 * il totale pacchetto reale come rate (es. 5100€), il tool sommava commissioni sia sul
 * cash collected (200€) sia sulle rate, contando quei 200€ due volte.
 *
 * Ora il cash collected è semplicemente la PRIMA rata, automatica e già pagata: questa
 * funzione restituisce le rate "effettive" di un appuntamento — una rata sintetica
 * "Acconto" pari a cashCollected (se > 0), seguita dalle rate vere e proprie inserite
 * dall'utente. Usata sia per il calcolo del totale (apptTotalSold) sia per generare gli
 * eventi di commissione (commissionEventsForAppointment) — così l'acconto viene contato
 * una volta sola ovunque, e l'utente nel popup rate deve aggiungere solo l'importo
 * MANCANTE rispetto a quanto già incassato.
 */
function getEffectiveInstallments(apt) {
  const real = apt.installments || [];
  if (!apt.cashCollected || apt.cashCollected <= 0) return real;
  const depositInst = {
    id: 'deposit',
    label: 'Acconto (cash collected)',
    amount: apt.cashCollected,
    dueDate: appointmentCashDate(apt),
    paid: true,
    paidDate: appointmentCashDate(apt),
    isDeposit: true
  };
  return [depositInst, ...real];
}

/**
 * Sezione Appuntamenti — SOLO Setter (split Setter/Venditore): questa tabella e tutte
 * le funzioni sottostanti (renderApptRow/wireAppuntamentiEvents/openNewSetterApptModal)
 * mostrano/creano sempre e solo righe role:'setter'. Gli appuntamenti Venditore (dealStage)
 * si gestiscono dalla scheda lead (lead.js, dal restyling step 15).
 */
function renderAppuntamenti() {
  uiState.settingTab = 'appuntamenti';
  // Filtri (restyling 17/10, step 10): Prossimi · Da esitare · Tutti · No show e annullati ·
  // Da richiamare. Prima c'era un filtro unico "Prossimi e da esitare" (Lettera F, 16/10):
  // ora sono due tasti separati, ognuno col suo contatore.
  let filter = uiState.crmSetterFilter || 'prossimi';
  if (filter === 'aperti') filter = 'prossimi';
  if (filter === 'no_show') filter = 'noshow_annullati';
  if (!SETTER_APPT_FILTERS.some(f => f.key === filter)) filter = 'prossimi';
  uiState.crmSetterFilter = filter;
  const search = uiState.crmSetterSearch || '';
  const q = search.trim();
  const allSetter = db.appointments.filter(a => a.role === 'setter');
  const pendingCbs = pendingCallbacksSorted();
  const counts = {};
  SETTER_APPT_FILTERS.forEach(f => { counts[f.key] = f.key === 'callbacks' ? pendingCbs.length : allSetter.filter(f.test).length; });

  let listHtml;
  let shown = 0;
  if (filter === 'callbacks') {
    // Da richiamare: i db.callbacks in attesa, nella stessa lista e con lo stesso stile.
    const cbs = q ? pendingCbs.filter(cb => matchesApptSearch({ clientName: cb.leadName, phone: cb.phone }, q)) : pendingCbs;
    shown = cbs.length;
    listHtml = cbs.length ? cbs.map(renderCallbackListRow).join('') : '';
  } else {
    const def = SETTER_APPT_FILTERS.find(f => f.key === filter);
    let rows = q ? allSetter.filter(a => matchesApptSearch(a, q)) : allSetter.filter(def.test); // la ricerca guarda sempre tutti
    rows = filter === 'prossimi' && !q
      ? [...rows].sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
      : [...rows].sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));
    shown = rows.length;
    listHtml = rows.map(renderApptRow).join('');
  }
  const emptyMsg = q
    ? (filter === 'callbacks' ? 'Nessun "da richiamare" trovato per questa ricerca.' : 'Nessun appuntamento trovato per questa ricerca.')
    : ({
        prossimi: allSetter.length ? 'Nessun appuntamento in arrivo. Gli altri sono in "Tutti".' : 'Nessun appuntamento ancora. Crea il primo con "+ Nuovo Appuntamento".',
        esitare: 'Niente da esitare: tutti gli appuntamenti passati hanno un esito.',
        all: 'Nessun appuntamento ancora. Crea il primo con "+ Nuovo Appuntamento".',
        noshow_annullati: 'Nessun no show o annullato.',
        callbacks: 'Nessun lead da richiamare al momento.'
      })[filter];

  const listOpen = isApptListOpen();
  const listTitle = filter === 'callbacks' ? 'Lista da richiamare' : 'Lista appuntamenti';

  // Tasti dei round in cima: prima Recupero, poi Conferme (restyling 5.2). Il loro tasto
  // è secondario: l'unico pulsante nero della vista è "+ Nuovo Appuntamento".
  appRoot.innerHTML = `
    <div class="round-launchers">
      ${renderRecoveryRoundEntryCard()}
      ${renderConfirmRoundEntryCard()}
    </div>
    <section class="card crm-toolbar appt-toolbar">
      <div class="crm-filters" role="tablist">
        ${SETTER_APPT_FILTERS.map(f => `<button class="pill ${filter === f.key ? 'active' : ''}" data-crm-setter-filter="${f.key}">${f.label} <span class="pill-count ${f.key === 'esitare' && counts[f.key] ? 'hot' : ''}">${counts[f.key]}</span></button>`).join('')}
      </div>
      <div class="appt-toolbar-row">
        <div class="crm-search-wrap">
          <input type="search" class="crm-search-input" id="crmSetterSearchInput" placeholder="${filter === 'callbacks' ? 'Cerca un da richiamare per nome o telefono...' : 'Cerca per nome o telefono...'}" value="${escapeHtml(search)}">
        </div>
        <button class="btn-ghost" id="btnApptReport">Report</button>
        <button class="btn-primary" id="btnNewAppt">+ Nuovo Appuntamento</button>
      </div>
    </section>
    <section class="card appt-list-card ${listOpen ? 'is-open' : ''}">
      <button class="appt-list-toggle" id="btnToggleApptList" aria-expanded="${listOpen}">
        <span class="appt-list-title">${listTitle}</span>
        <span class="count-pill">${shown}</span>
        <span class="appt-list-caret" aria-hidden="true">▾</span>
      </button>
      ${listOpen ? (listHtml ? `
      <div class="crm-table-wrap">
        <table class="crm-table appt-table">
          <thead>
            <tr><th>Nome</th><th>Data e ora</th><th>Esito</th><th>${filter === 'callbacks' ? '' : 'Soldi'}</th><th></th></tr>
          </thead>
          <tbody>${listHtml}</tbody>
        </table>
      </div>` : `<p class="text-dim appt-list-empty">${emptyMsg}</p>`) : ''}
    </section>
    ${renderApptCalendar('setter')}
  `;

  wireAppuntamentiEvents();
}

/** Filtri della lista Appuntamenti Setter (in ordine). "callbacks" non filtra appuntamenti:
 * mostra i Da richiamare (db.callbacks) nella stessa lista. */
const SETTER_APPT_FILTERS = [
  { key: 'prossimi', label: 'Prossimi', test: a => isSetterApptUpcoming(a) },
  { key: 'esitare', label: 'Da esitare', test: a => isSetterApptToEsitare(a) },
  { key: 'all', label: 'Tutti', test: () => true },
  { key: 'noshow_annullati', label: 'No show e annullati', test: a => a.presentedStatus === 'no_show' || a.presentedStatus === 'annullato' },
  { key: 'callbacks', label: 'Da richiamare', test: () => false }
];

/** Tendina "Lista appuntamenti ▾": aperta o chiusa, ricordata nel browser. */
const APPT_LIST_OPEN_KEY = 'comms_listaAppuntamentiAperta';
function isApptListOpen() {
  if (typeof uiState.apptListOpen !== 'boolean') {
    let v = null;
    try { v = localStorage.getItem(APPT_LIST_OPEN_KEY); } catch (e) { /* browser senza memoria: aperta */ }
    uiState.apptListOpen = v !== '0';
  }
  return uiState.apptListOpen;
}
function setApptListOpen(open) {
  uiState.apptListOpen = !!open;
  try { localStorage.setItem(APPT_LIST_OPEN_KEY, open ? '1' : '0'); } catch (e) { /* niente: resta in memoria */ }
}

/** Da richiamare ancora in attesa, dal più vicino. */
function pendingCallbacksSorted() {
  return [...(db.callbacks || [])]
    .filter(c => c.status === 'pending')
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
}

/** Riga di un "Da richiamare" nella lista Appuntamenti (filtro "Da richiamare"): stesso
 * stile delle righe appuntamento. Azioni: Chiama, Modifica ✎, Note, Cestino. */
function renderCallbackListRow(cb) {
  const overdue = cb.scheduledAt && new Date(cb.scheduledAt) < new Date();
  return `
    <tr class="appt-row cb-list-row" data-cb-row="${cb.id}">
      <td class="appt-cell-name">
        <div class="appt-name-text">${escapeHtml(cb.leadName || '(senza nome)')}</div>
        ${cb.sourcePipelineName ? `<div class="appt-sub">${escapeHtml(cb.sourcePipelineName)}</div>` : ''}
      </td>
      <td class="appt-cell-when"><span class="appt-when-text ${overdue ? 'late' : ''}">${cb.scheduledAt ? escapeHtml(fmtApptWhen(cb.scheduledAt)) : '—'}</span>${overdue ? '<div class="to-esitare-tag">scaduto</div>' : ''}</td>
      <td><span class="appt-status-pill cb">Da richiamare</span></td>
      <td><button class="btn-ghost btn-sm" data-call-callback="${cb.id}">Chiama</button></td>
      <td class="crm-row-actions">
        ${callbackNotesButton(cb)}
        <button class="btn-icon appt-more-btn" data-edit-callback="${cb.id}" title="Modifica dati del lead" aria-label="Modifica">✎</button>
        <button class="btn-icon appt-more-btn" data-delete-callback="${cb.id}" title="Togli dai da richiamare" aria-label="Togli">🗑</button>
      </td>
    </tr>`;
}

/** "sab 18/10/2026 · 11:00" — data e ora leggibili per righe e calendario. */
function fmtApptWhen(v) {
  const d = new Date(v);
  if (isNaN(d)) return '';
  const day = d.toLocaleDateString('it-IT', { weekday: 'short' }).replace('.', '');
  return `${day} ${d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })} · ${fmtTime(d)}`;
}

/** Appuntamento Setter passato e ancora senza esito vero ("No" o "Confermato 24h"). */
function isSetterApptToEsitare(a) {
  return !!a.scheduledAt && new Date(a.scheduledAt) <= new Date() && (a.presentedStatus === 'no' || a.presentedStatus === 'confirmed24h' || !a.presentedStatus);
}
/** "Prossimi": in arrivo, non spostati né annullati (filtro della lista Setter). */
function isSetterApptUpcoming(a) {
  return !!a.scheduledAt && new Date(a.scheduledAt) > new Date() && a.presentedStatus !== 'spostato' && a.presentedStatus !== 'annullato';
}

/**
 * Ricerca condivisa (Setter + Venditore): confronta il testo digitato con nome cliente
 * e numero di telefono, case-insensitive e ignorando spazi/punteggiatura nel telefono
 * cosi' che "333 123 4567" trovi anche "3331234567".
 */
function matchesApptSearch(a, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = (a.clientName || '').toLowerCase();
  if (name.includes(q)) return true;
  const phone = (a.phone || '').toLowerCase();
  if (phone.includes(q)) return true;
  const qDigits = q.replace(/\D/g, '');
  if (qDigits) {
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.includes(qDigits)) return true;
  }
  return false;
}

/**
 * Wiring condiviso per gli input di ricerca Setter/Venditore. Il re-render ad ogni
 * digitazione sostituisce tutto il DOM (come le altre viste), quindi qui si salva
 * posizione del cursore prima del render e la si ripristina subito dopo, cosi'
 * l'utente puo' continuare a digitare senza perdere il focus sul campo.
 */
function wireCrmSearchInput(inputId, stateKey, renderFn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.addEventListener('input', () => {
    uiState[stateKey] = input.value;
    const cursorPos = input.selectionStart;
    renderFn();
    const newInput = document.getElementById(inputId);
    if (newInput) {
      newInput.focus();
      newInput.setSelectionRange(cursorPos, cursorPos);
    }
  });
}

function renderApptRow(a) {
  // Riga compatta (restyling 17/10, step 10): nome (modificabile, senza telefono: il
  // telefono sta nella scheda ⋯), data e ora, esito a tendina, € e ⋯. Chiuso, cash e
  // totale restano dietro il tasto €; telefono, checklist ed Elimina dietro ⋯.
  const presentedOptions = Object.entries(SETTER_PRESENTED_LABEL).map(([key, label]) =>
    `<option value="${key}" ${a.presentedStatus === key ? 'selected' : ''}>${escapeHtml(label)}</option>`
  ).join('');
  const presentedChips = `
      <select class="deal-stage-select setter-status-select" data-pstatus="${a.presentedStatus || 'no'}" data-set-presented-sel="${a.id}" aria-label="Esito">
        ${presentedOptions}
      </select>`;

  const closedChips = `
      <div class="crm-chip-group">
        <button class="crm-chip ${!a.closed ? 'active' : ''}" data-set-closed="${a.id}" data-val="0">No</button>
        <button class="crm-chip ${a.closed ? 'active' : ''}" data-set-closed="${a.id}" data-val="1">Sì</button>
      </div>`;

  const totalSold = apptTotalSold(a);
  const linkNote = a.linkedAppointmentId ? `<span class="crm-link-note">collegato</span>` : '';
  const recoveredBadge = a.recoveredFromNoShow
    ? `<span class="badge recov-badge" title="Nato dal Round Recupero Appuntamenti (appuntamento originale da ${a.recoveredFromRole === 'venditore' ? 'Venditore' : 'Setting'})">↻ Recuperato</span>`
    : '';
  // Chiuso senza nome del centro (Simone, 18/10): deve saltare all'occhio.
  const centerTag = a.closed && !String(a.centerName || '').trim()
    ? `<button type="button" class="cm-tag-btn" data-add-center-key="${a.id}" title="Aggiungi il nome del centro">${centerMissingTagHtml()}</button>` : '';
  const badges = `${centerTag}${recoveredBadge}${rescheduleBadgesHtml(a)}${linkNote}`;

  const moneyOpen = !!(uiState.setterMoneyOpen && uiState.setterMoneyOpen[a.id]);
  const hasMoney = a.closed || (a.cashCollected || 0) > 0 || totalSold > 0;
  const toEsitare = isSetterApptToEsitare(a);

  return `
    <tr data-appt-row="${a.id}" class="appt-row ${a.presentedStatus === 'spostato' ? 'appt-row-moved' : ''} ${moneyOpen ? 'money-open' : ''}">
      <td class="appt-cell-name">
        <input type="text" class="crm-inline-input crm-name-input" data-name-input="${a.id}" value="${escapeHtml(a.clientName || '')}" placeholder="Nome e cognome" aria-label="Nome">
        ${badges.trim() ? `<div class="appt-badges">${badges}</div>` : ''}
      </td>
      <td class="appt-cell-when"><input type="datetime-local" class="crm-inline-input crm-datetime-input" data-scheduled-input="${a.id}" value="${(a.scheduledAt || '').slice(0, 16)}" aria-label="Data e ora">${toEsitare ? '<div class="to-esitare-tag">da esitare</div>' : ''}</td>
      <td>${presentedChips}</td>
      <td><button class="money-btn ${hasMoney ? 'has-money' : ''} ${moneyOpen ? 'open' : ''}" data-toggle-money="${a.id}" title="Chiuso, cash collected e totale venduto" aria-expanded="${moneyOpen}">€${hasMoney ? ` ${round2(totalSold)}` : ''}</button></td>
      <td class="crm-row-actions"><button class="btn-icon appt-more-btn" data-appt-more="${a.id}" title="Checklist, telefono ed elimina" aria-label="Altro">⋯</button></td>
    </tr>
    ${moneyOpen ? `<tr class="money-row" data-money-row="${a.id}">
      <td colspan="5">
        <div class="money-panel">
          <label class="money-field"><span>Chiuso</span>${closedChips}</label>
          <label class="money-field"><span>Cash collected</span><input type="number" min="0" step="1" class="assigned-edit-input" data-cash-input="${a.id}" value="${a.cashCollected || 0}" style="width:110px;"></label>
          <label class="money-field"><span>Totale venduto</span><button class="crm-amount-link" data-open-installments="${a.id}">€${round2(totalSold)}</button></label>
          ${a.closed ? `<label class="money-field"><span>Centro</span><input type="text" class="assigned-edit-input money-text-input" data-center-input="${a.id}" value="${escapeHtml(a.centerName || '')}" placeholder="Nome del centro"></label>
          <label class="money-field"><span>Venditore</span><input type="text" class="assigned-edit-input money-text-input" data-vend-name-input="${a.id}" list="vendNames-${a.id}" value="${escapeHtml(a.venditoreName || '')}" placeholder="Nome del venditore">${venditoreDatalistHtml('vendNames-' + a.id)}</label>` : ''}
        </div>
      </td>
    </tr>` : ''}`;
}

/* ---------- Scheda checklist (tre puntini ⋯ della riga, restyling 5.2.2) ----------
 * Nome + data in cui è stato fissato (createdAt), barra % e le 8 voci di CHECKLIST_ITEMS
 * con ✓/✗. Gli appuntamenti senza checklist (fissati prima, o a mano) mostrano
 * "Checklist non compilata". Qui ci sono anche il telefono (facoltativo: serve al
 * WhatsApp delle conferme e al collegamento dei lead) ed Elimina. La compilazione
 * della checklist si fa in sessione (step 12). */
function checklistBarHtml(pct) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  return `<div class="checklist-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}">
      <div class="checklist-bar-track"><div class="checklist-bar-fill" style="width:${p}%"></div></div>
      <span class="checklist-bar-pct">${fmtPctIt(p)}</span>
    </div>`;
}

/* ---------- Checklist in chiamata (restyling 5.4.3, step 12) ----------
 * Pannello a destra della schermata sessione, della richiamata e del Round Recupero.
 * Si compila per il lead in chiamata. Lo stato in corso sta sui dati (così sopravvive a
 * un ricaricamento): sessione → db.activeSession.checklist, richiamata →
 * cb.inCallChecklist, Round Recupero → voce del round .inCallChecklist. Forma: { id: true }.
 * Si salva sull'appuntamento SOLO quando nasce un appuntamento fissato (modale
 * salvata): apt.checklist { <id>: true/false } con tutte le 8 voci + apt.checklistPct.
 * Con qualsiasi altro esito, o "Skip", si azzera per il lead dopo. */
/* Checklist anche in conferma (Simone, 18/10/2026: "a volte recuperiamo info in conferma
 * dopo averlo fissato giorni prima"). Con l'esito di conferma (Round Conferme
 * "Confermato 24h", o in sessione l'altro esito isConversion "conferma appuntamento") le
 * spunte si salvano sull'appuntamento Setter SOLO se almeno una voce è spuntata, in
 * UNIONE con quelle già salvate: una voce già presa resta presa. checklistPct si
 * ricalcola. Il grafico checklist in Sessioni resta per data di inserimento (createdAt):
 * un appuntamento completato in conferma aggiorna la media del giorno in cui era stato
 * fissato. */
function checklistOnIds(items) {
  const out = {};
  CHECKLIST_ITEMS.forEach(it => { if (items && items[it.id] === true) out[it.id] = true; });
  return out;
}
function checklistHasAny(items) { return Object.keys(checklistOnIds(items)).length > 0; }
/** Unisce le spunte nuove a quelle dell'appuntamento. Ritorna lo stato di prima (per
 * "Annulla ultimo esito") o null se non c'era niente da salvare. */
function mergeChecklistIntoAppt(apt, items) {
  if (!apt || !checklistHasAny(items)) return null;
  const before = {
    apptId: apt.id,
    hadChecklist: Object.prototype.hasOwnProperty.call(apt, 'checklist'),
    checklist: apt.checklist && typeof apt.checklist === 'object' ? Object.assign({}, apt.checklist) : (apt.checklist === undefined ? undefined : apt.checklist),
    hadPct: Object.prototype.hasOwnProperty.call(apt, 'checklistPct'),
    checklistPct: apt.checklistPct
  };
  apt.checklist = checklistSnapshot(Object.assign({}, checklistOnIds(apt.checklist), checklistOnIds(items)));
  apt.checklistPct = checklistPctOf(apt.checklist);
  return before;
}
function restoreApptChecklist(before) {
  if (!before) return;
  const apt = db.appointments.find(a => a.id === before.apptId);
  if (!apt) return;
  if (before.hadChecklist) apt.checklist = before.checklist; else delete apt.checklist;
  if (before.hadPct) apt.checklistPct = before.checklistPct; else delete apt.checklistPct;
}

function checklistSnapshot(items) {
  const out = {};
  CHECKLIST_ITEMS.forEach(it => { out[it.id] = !!(items && items[it.id] === true); });
  return out;
}

function renderLiveChecklistPanel(items, opts) {
  items = items || {};
  opts = opts || {};
  const locked = opts.locked || {};
  const pct = checklistPctOf(checklistSnapshot(items));
  const rows = CHECKLIST_ITEMS.map(it => {
    const on = items[it.id] === true;
    const lock = locked[it.id] === true;
    return `<label class="live-check-item${on ? ' on' : ''}${lock ? ' locked' : ''}"${lock ? ' title="Già presa (salvata sull\'appuntamento)"' : ''}>
        <input type="checkbox" data-live-check="${it.id}"${on ? ' checked' : ''}${lock ? ' disabled' : ''}>
        <span class="live-check-box" aria-hidden="true"></span>
        <span class="live-check-label">${escapeHtml(it.label)}</span>
      </label>`;
  }).join('');
  return `
    <aside class="live-checklist" aria-label="Checklist del lead in chiamata">
      <div class="live-checklist-head">
        <strong>Checklist</strong>
        <span class="live-checklist-count" data-live-check-count>${CHECKLIST_ITEMS.filter(it => items[it.id] === true).length}/${CHECKLIST_ITEMS.length}</span>
      </div>
      <div data-live-check-bar>${checklistBarHtml(pct)}</div>
      <div class="live-checklist-items">${rows}</div>
      <p class="live-checklist-hint">${escapeHtml(opts.hint || 'Si salva solo se fissi l\'appuntamento.')}</p>
    </aside>`;
}

/** Spunte del pannello: aggiorna i dati e la barra senza ridisegnare la schermata
 * (il timer e quello che stai scrivendo restano). getItems/setItems leggono e scrivono
 * l'oggetto { id: true } del contesto (sessione, richiamata, recupero). */
function wireLiveChecklist(root, getItems, setItems) {
  root.querySelectorAll('[data-live-check]').forEach(input => {
    input.addEventListener('change', () => {
      const items = Object.assign({}, getItems() || {});
      if (input.checked) items[input.dataset.liveCheck] = true;
      else delete items[input.dataset.liveCheck];
      setItems(items);
      persist();
      const n = CHECKLIST_ITEMS.filter(it => items[it.id] === true).length;
      input.closest('.live-check-item').classList.toggle('on', input.checked);
      const bar = root.querySelector('[data-live-check-bar]');
      if (bar) bar.innerHTML = checklistBarHtml(checklistPctOf(checklistSnapshot(items)));
      const cnt = root.querySelector('[data-live-check-count]');
      if (cnt) cnt.textContent = `${n}/${CHECKLIST_ITEMS.length}`;
    });
  });
}

/** ⋯ di un appuntamento Setter (Setting → Appuntamenti e lista della sessione): checklist,
 * telefono, elimina. La checklist si può aggiornare (Simone, 24/10, fix di Hamza: le spunte
 * non messe in chiamata o le informazioni prese dopo, per esempio in conferma). Ogni spunta si
 * salva subito: apt.checklist + apt.checklistPct (grafico checklist in Sessioni). Un
 * appuntamento senza checklist resta senza finché non si spunta almeno una voce. */
function openApptChecklistModal(apptId, onDone) {
  const apt = db.appointments.find(x => x.id === apptId);
  if (!apt) return;
  const hadChecklist = !!(apt.checklist && typeof apt.checklist === 'object');
  openModal(`
    <h3>${escapeHtml(apt.clientName || '(senza nome)')}</h3>
    <p class="text-dim checklist-sub">Fissato il ${apt.createdAt ? escapeHtml(fmtDateTime(apt.createdAt)) : '—'} · appuntamento ${apt.scheduledAt ? escapeHtml(fmtApptWhen(apt.scheduledAt)) : '—'}</p>
    <div class="appt-checklist-edit">${renderLiveChecklistPanel(hadChecklist ? apt.checklist : {}, { hint: hadChecklist ? 'Spunta o togli le voci: si salva subito.' : 'Checklist non compilata: spunta le voci che hai preso, si salva subito.' })}</div>
    <label class="field">Telefono (facoltativo)<input type="tel" id="apptMorePhone" value="${escapeHtml(apt.phone || '')}" placeholder="Per il WhatsApp delle conferme"></label>
    <div class="modal-actions modal-actions-split">
      <button class="btn-danger-ghost" id="apptMoreDel">Elimina appuntamento</button>
      <span class="modal-actions-gap"></span>
      <button class="btn-ghost" id="apptMoreClose">Chiudi</button>
    </div>
  `);
  wireLiveChecklist(modalRoot, () => apt.checklist, items => {
    const any = CHECKLIST_ITEMS.some(it => items[it.id] === true);
    if (!any && !hadChecklist) { apt.checklist = null; apt.checklistPct = null; return; }
    apt.checklist = checklistSnapshot(items);
    apt.checklistPct = checklistPctOf(apt.checklist);
  });
  const phoneInput = document.getElementById('apptMorePhone');
  const savePhone = () => {
    const v = phoneInput.value.trim() || null;
    if ((apt.phone || null) !== v) { apt.phone = v; persist(); }
  };
  phoneInput.addEventListener('change', savePhone);
  document.getElementById('apptMoreClose').addEventListener('click', () => { savePhone(); closeModal(); if (onDone) onDone(); });
  document.getElementById('apptMoreDel').addEventListener('click', () => {
    showConfirm(`Eliminare l'appuntamento di "${apt.clientName || '(senza nome)'}"?`, () => {
      unlinkRescheduleOnDelete(apt);
      // CORREZIONE (19/10): come per il Venditore (scheda lead), un appuntamento cancellato
      // esce dal Round Recupero; prima la voce restava attiva senza appuntamento.
      deactivateRecoveryEntryForAppointment(apt);
      db.appointments = db.appointments.filter(x => x.id !== apt.id);
      persist();
      if (onDone) onDone();
    }, { confirmLabel: 'Elimina' });
  });
}

/** "+ Nuovo Appuntamento" (Setter): nome, telefono facoltativo, data e ora. */
function openNewSetterApptModal() {
  openModal(`
    <h3>Nuovo appuntamento</h3>
    <label class="field">Nome appuntamento<input type="text" id="newApptName" placeholder="Nome e cognome" maxlength="120"></label>
    <label class="field">Telefono (facoltativo)<input type="tel" id="newApptPhone" placeholder="Per il WhatsApp delle conferme"></label>
    <label class="field">Data e ora<input type="datetime-local" id="newApptWhen" value="${localDateTimeValue(new Date())}"></label>
    <div class="modal-actions">
      <button class="btn-ghost" id="newApptCancel">Annulla</button>
      <button class="btn-primary" id="newApptSave">Salva</button>
    </div>
  `);
  const nameInput = document.getElementById('newApptName');
  nameInput.focus();
  document.getElementById('newApptCancel').addEventListener('click', closeModal);
  document.getElementById('newApptSave').addEventListener('click', () => {
    const name = nameInput.value.trim();
    const when = document.getElementById('newApptWhen').value;
    if (!name) { showToast('Inserisci il nome dell\'appuntamento.', true); nameInput.focus(); return; }
    if (!when) { showToast('Inserisci data e ora dell\'appuntamento.', true); return; }
    const apt = newAppointment('setter');
    apt.clientName = name;
    apt.phone = document.getElementById('newApptPhone').value.trim() || null;
    apt.scheduledAt = when;
    db.appointments.unshift(apt);
    persist();
    closeModal();
    showToast('Appuntamento aggiunto.');
    renderAppuntamenti();
    highlightSetterApptRow(apt.id);
  });
}

/** Porta in vista una riga della lista Setter e la fa lampeggiare (nuovo appuntamento,
 * clic dal calendario). Se la riga non è nel filtro attivo passa a "Tutti". */
function highlightSetterApptRow(id) {
  let row = appRoot.querySelector(`[data-appt-row="${id}"]`);
  if (!row) {
    uiState.crmSetterFilter = 'all';
    uiState.crmSetterSearch = '';
    setApptListOpen(true);
    renderAppuntamenti();
    row = appRoot.querySelector(`[data-appt-row="${id}"]`);
  }
  if (!row) return;
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  row.classList.add('row-flash');
  setTimeout(() => row.classList.remove('row-flash'), 2200);
}

function wireAppuntamentiEvents() {
  appRoot.querySelectorAll('[data-crm-setter-filter]').forEach(btn => {
    btn.addEventListener('click', () => { uiState.crmSetterFilter = btn.dataset.crmSetterFilter; renderAppuntamenti(); });
  });
  appRoot.querySelectorAll('[data-toggle-money]').forEach(btn => {
    btn.addEventListener('click', () => {
      uiState.setterMoneyOpen = uiState.setterMoneyOpen || {};
      const id = btn.dataset.toggleMoney;
      uiState.setterMoneyOpen[id] = !uiState.setterMoneyOpen[id];
      renderAppuntamenti();
    });
  });
  wireCrmSearchInput('crmSetterSearchInput', 'crmSetterSearch', renderAppuntamenti);
  document.getElementById('btnNewAppt').addEventListener('click', openNewSetterApptModal);
  document.getElementById('btnApptReport').addEventListener('click', generateAppointmentsReport);
  document.getElementById('btnToggleApptList').addEventListener('click', () => { setApptListOpen(!isApptListOpen()); renderAppuntamenti(); });
  wireRecoveryRoundEntryCard();
  wireConfirmRoundEntryCard();
  wireApptCalendar('setter');
  wireAddCenterButtons(appRoot, renderAppuntamenti);

  // Tre puntini ⋯: scheda checklist (+ telefono ed Elimina).
  appRoot.querySelectorAll('[data-appt-more]').forEach(btn => {
    btn.addEventListener('click', () => openApptChecklistModal(btn.dataset.apptMore, renderAppuntamenti));
  });
  // Righe "Da richiamare": Chiama, Modifica, Note, Cestino.
  appRoot.querySelectorAll('[data-call-callback]').forEach(btn => {
    btn.addEventListener('click', () => startCallbackCall(btn.dataset.callCallback));
  });
  appRoot.querySelectorAll('[data-edit-callback]').forEach(btn => {
    btn.addEventListener('click', () => openEditCallbackModal(btn.dataset.editCallback, renderAppuntamenti));
  });
  appRoot.querySelectorAll('[data-delete-callback]').forEach(btn => {
    btn.addEventListener('click', () => removeCallback(btn.dataset.deleteCallback, renderAppuntamenti));
  });
  wireCallbackNotesButtons(appRoot, renderAppuntamenti);

  appRoot.querySelectorAll('[data-name-input]').forEach(input => {
    input.addEventListener('change', () => {
      const apt = db.appointments.find(x => x.id === input.dataset.nameInput);
      if (!apt) return;
      apt.clientName = input.value;
      persist();
    });
  });

  appRoot.querySelectorAll('[data-scheduled-input]').forEach(input => {
    input.addEventListener('change', () => {
      const apt = db.appointments.find(x => x.id === input.dataset.scheduledInput);
      if (!apt || !input.value) return;
      // presentedAt era la vecchia data: se l'utente corregge la data, la segue
      // (altrimenti statistiche e commissioni restano sul giorno sbagliato).
      if (apt.presentedAt && apt.presentedAt === apt.scheduledAt) apt.presentedAt = input.value;
      apt.scheduledAt = input.value;
      persist();
      renderAppuntamenti();
    });
  });

  appRoot.querySelectorAll('[data-set-presented-sel]').forEach(sel => {
    sel.addEventListener('change', () => {
      const apt = db.appointments.find(x => x.id === sel.dataset.setPresentedSel);
      if (!apt) return;
      const val = sel.value;
      // "Spostato" non cambia subito lo stato: apre la finestra per la nuova data e
      // crea il nuovo appuntamento (vedi openRescheduleModal). Se si annulla, resta tutto com'era.
      if (val === 'spostato') {
        if (apt.presentedStatus === 'spostato') return;
        openRescheduleModal(apt.id, renderAppuntamenti);
        renderAppuntamenti(); // rimette la tendina allo stato attuale finché non si salva
        return;
      }
      apt.presentedStatus = val;
      // CORREZIONE (segnalata dall'utente): presentedAt deve seguire la data/ora
      // dell'appuntamento stesso (scheduledAt), NON il momento in cui l'utente clicca
      // "Presentato" nell'app — spesso si registra un appuntamento già svolto giorni
      // prima (es. oggi 10, appuntamento del 6): le commissioni derivate (show-up,
      // cash collected) vanno segnate al 6, non al giorno del click.
      apt.presentedAt = val === 'presented' ? apt.scheduledAt : apt.presentedAt;
      // No Show da Setting -> entra (o resta) nel Round Recupero Appuntamenti; qualunque altro
      // stato disattiva l'eventuale entry attiva (es. click corretto per errore).
      if (val === 'no_show' || val === 'annullato') addToRecoveryRound(apt, 'setter', val);
      else deactivateRecoveryEntryForAppointment(apt);
      persist();
      renderAppuntamenti();
    });
  });

  appRoot.querySelectorAll('[data-set-closed]').forEach(btn => {
    btn.addEventListener('click', () => {
      const apt = db.appointments.find(x => x.id === btn.dataset.setClosed);
      if (!apt) return;
      const value = btn.dataset.val === '1';
      // Chiusura nuova: prima centro e venditore (step 6), poi chiuso.
      if (value && !apt.closed) {
        openClosingDataModal(apt, { onSave: () => { setAppointmentClosed(apt, true); renderAppuntamenti(); } });
        return;
      }
      setAppointmentClosed(apt, value);
      renderAppuntamenti();
    });
  });

  // Centro e venditore, modificabili dopo la chiusura (pannello €).
  appRoot.querySelectorAll('[data-center-input]').forEach(input => {
    input.addEventListener('change', () => {
      const apt = db.appointments.find(x => x.id === input.dataset.centerInput);
      if (!apt) return;
      const had = !!String(apt.centerName || '').trim();
      apt.centerName = input.value.trim();
      persist();
      if (had !== !!apt.centerName) renderAppuntamenti(); // etichetta "centro mancante"
    });
  });
  appRoot.querySelectorAll('[data-vend-name-input]').forEach(input => {
    input.addEventListener('change', () => {
      const apt = db.appointments.find(x => x.id === input.dataset.vendNameInput);
      if (!apt) return;
      apt.venditoreName = input.value.trim();
      persist();
    });
  });

  appRoot.querySelectorAll('[data-cash-input]').forEach(input => {
    input.addEventListener('change', () => {
      const apt = db.appointments.find(x => x.id === input.dataset.cashInput);
      if (!apt) return;
      // L'acconto (cash collected) è ora la rata sintetica "_deposit" (vedi
      // getEffectiveInstallments) — il suo id evento è apt.id + '_deposit'.
      apt.cashCollected = Math.max(0, parseFloat(input.value) || 0);
      persist();
      renderAppuntamenti();
    });
  });

  appRoot.querySelectorAll('[data-open-installments]').forEach(btn => {
    btn.addEventListener('click', () => openInstallmentsModal(btn.dataset.openInstallments));
  });

}

/**
 * "+ Nuovo Appuntamento" della tabella Venditore (il Setter usa openNewSetterApptModal,
 * con il telefono facoltativo): niente modal — crea subito una riga vuota (data/ora = adesso) e la mette in cima
 * alla tabella, editabile inline esattamente come le righe esistenti (stesso pattern di
 * autosave su ogni campo). L'utente compila Nome/Ruolo/Data direttamente nella riga; il
 * focus va subito sul campo Nome.
 */
/* ---------- Dati richiesti alla chiusura (restyling 17/10/2026, step 6) ----------
 * Chiudendo un appuntamento il tool chiede il nome del CENTRO (serve a "Prossimi
 * pagamenti" in Dashboard: lì compare il centro, mai la persona) e, solo per il
 * Setter, il nome del VENDITORE a cui è passato (suggerimenti dai nomi già usati).
 * I campi si possono lasciare vuoti ("centro mancante") e cambiare dopo: Setter nel
 * pannello € della riga, Venditore nella scheda lead → Pagamenti. */
function usedVenditoreNames() {
  const set = new Set();
  db.appointments.forEach(a => { const n = String(a.venditoreName || '').trim(); if (n) set.add(n); });
  return [...set].sort((a, b) => a.localeCompare(b, 'it'));
}
function venditoreDatalistHtml(id) {
  return `<datalist id="${id}">${usedVenditoreNames().map(n => `<option value="${escapeHtml(n)}"></option>`).join('')}</datalist>`;
}

/** Modale "Chiuso": centro (+ venditore per il Setter). onSave(centro, venditore) fa la
 * chiusura vera; Annulla non cambia niente. */
function openClosingDataModal(apt, opts) {
  opts = opts || {};
  const isSetter = apt.role === 'setter';
  const centro = apt.centerName || opts.defaultCentro || '';
  openModal(`
    <h3>Chiuso · ${escapeHtml(apt.clientName || '(senza nome)')}</h3>
    <p class="text-dim" style="font-size:0.85rem;">${isSetter ? 'Nome del centro e del venditore' : 'Nome del centro'}: servono ai Prossimi pagamenti in Dashboard. Puoi cambiarli dopo.</p>
    <label class="field">Nome del centro<input type="text" id="closeCentro" maxlength="120" value="${escapeHtml(centro)}" placeholder="Es. Centro Prova 1"></label>
    ${isSetter ? `<label class="field">Nome del venditore<input type="text" id="closeVenditore" maxlength="80" list="closeVenditoreList" value="${escapeHtml(apt.venditoreName || '')}" placeholder="A chi è passato l'appuntamento">${venditoreDatalistHtml('closeVenditoreList')}</label>` : ''}
    <div class="modal-actions">
      <button class="btn-ghost" id="closeDataCancel">Annulla</button>
      <button class="btn-primary" id="closeDataSave">Segna chiuso</button>
    </div>
  `);
  const c = document.getElementById('closeCentro');
  c.focus();
  document.getElementById('closeDataCancel').addEventListener('click', () => { closeModal(); if (opts.onCancel) opts.onCancel(); });
  const save = () => {
    const v = document.getElementById('closeVenditore');
    const centroVal = c.value.trim();
    const vendVal = v ? v.value.trim() : '';
    apt.centerName = centroVal;
    if (isSetter) apt.venditoreName = vendVal;
    closeModal();
    opts.onSave(centroVal, vendVal);
  };
  document.getElementById('closeDataSave').addEventListener('click', save);
  modalRoot.querySelectorAll('input[type="text"]').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') save(); }));
}

/**
 * Marca closed=true/false su un appuntamento, gestendo closedAt (vedi commento in
 * newAppointment). Suoni e confetti del builder vecchio: tolti (restyling step 16).
 */
function setAppointmentClosed(apt, value) {
  apt.closed = value;
  if (value && !apt.closedAt) apt.closedAt = new Date().toISOString();
  if (!value) apt.closedAt = null;
  persist();
}

/* ============================================================================
 * Appuntamenti — VENDITORE (split Setter/Venditore). Layout e modello di stato
 * completamente separati dalla tabella Setter qui sopra: qui il "Presentato"/"Chiuso"
 * booleani sono sostituiti da un unico stato trattativa a scelta singola (dealStage —
 * vedi DEAL_STAGES), e al posto di Accordi/Touchpoint ci sono Note (cronologia) e Data
 * Prossimo Follow-up.
 * ==========================================================================*/

function applyDealStage(apt, stageKey) {
  apt.dealStage = stageKey || null;
  const def = dealStageDef(stageKey);
  apt.closed = !!(def && def.isClosed);
  if (apt.closed && !apt.closedAt) apt.closedAt = new Date().toISOString();
  if (!apt.closed) apt.closedAt = null;
  // No Show da Venditore -> entra (o resta) nel Round Recupero Appuntamenti; qualunque altro
  // stato disattiva l'eventuale entry attiva (es. correzione di un click sbagliato).
  if (stageKey === 'no_show' || stageKey === 'annullato') addToRecoveryRound(apt, 'venditore', stageKey);
  else deactivateRecoveryEntryForAppointment(apt);
  persist();
}

/**
 * Sistema di note (quadernino): elenco con data e ora + "Aggiungi nota". Lo usano i
 * "Da richiamare" (richiesta di Hamza, 2026-10-14). Le note del Venditore stanno nella
 * scheda lead (lead.js, dal 16/10).
 * `holder` è l'oggetto che contiene l'array `notes`; `onClose` ridisegna la pagina sotto.
 */
function openNotesEditor(holder, leadName, onClose) {
  const notes = [...(holder.notes || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const notesHtml = notes.length ? notes.map(n => `
    <div class="note-card">
      <div class="note-card-text">${escapeHtml(n.text)}</div>
      <div class="note-card-meta">${fmtDateTime(n.createdAt)}</div>
    </div>`).join('') : '<p class="text-dim">Nessuna nota ancora.</p>';

  openModal(`
    <h3>Note — ${escapeHtml(leadName || '(senza nome)')}</h3>
    <div class="note-add-row">
      <textarea id="newNoteText" placeholder="Scrivi una nota su questo lead…"></textarea>
      <button class="btn-primary" id="btnAddNote" style="align-self:flex-end;">+ Aggiungi nota</button>
    </div>
    <div class="notes-list">${notesHtml}</div>
    <div class="modal-actions">
      <button class="btn-ghost" data-close-modal="1">Chiudi</button>
    </div>
  `);
  modalRoot.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => { closeModal(); if (onClose) onClose(); }));

  document.getElementById('btnAddNote').addEventListener('click', () => {
    const ta = document.getElementById('newNoteText');
    const text = ta.value.trim();
    if (!text) { ta.focus(); return; }
    holder.notes = holder.notes || [];
    holder.notes.push({ id: uid('nota'), text, createdAt: new Date().toISOString() });
    persist();
    openNotesEditor(holder, leadName, onClose);
  });
}

/* ---------- Registrazione Call (link Drive/Fathom/ecc., solo Venditore) ---------- */

/**
 * Widget "Registrazione Call": ancorato in fondo a destra (fixed, sopra il resto del
 * contenuto) invece che come card a piena larghezza, come richiesto esplicitamente
 * dall'utente ("in fondo a destra"). Si apre/chiude con un toggle per non ingombrare
 * la vista sulla tabella appuntamenti; lo stato aperto/chiuso è tenuto in uiState
 * (non persistito: si riapre chiuso ad ogni refresh, comportamento voluto per un widget
 * di utilità secondaria).
 */
/* Registrazioni call (lettera J, Simone 16/10): prima un riquadro fisso in basso a destra
 * che copriva la tabella. Ora un tasto "🎙️ Registrazioni (n)" nella barra apre questa
 * finestra con l'elenco e "Aggiungi link". Dati invariati: db.callRecordings. */
function openCallRecordingsModal() {
  const recs = [...(db.callRecordings || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const rowsHtml = recs.length ? recs.map(r => `
    <div class="call-rec-row">
      <a href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(r.label || r.url)}</a>
      <span class="text-dim" style="font-size:0.74rem;">${r.createdAt ? fmtDate(r.createdAt) : ''}</span>
      <button class="crm-row-del" data-del-rec="${r.id}" title="Elimina">×</button>
    </div>`).join('') : '<p class="text-dim">Nessuna registrazione ancora.</p>';

  openModal(`
    <h3>🎙️ Registrazioni call</h3>
    <p class="text-dim" style="font-size:0.82rem;">Incolla il link della registrazione (Drive, Fathom, ecc.) e dagli un nome.</p>
    <div class="call-rec-add-row">
      <input type="text" id="newRecLabel" placeholder="Etichetta (es. nome cliente)">
      <input type="text" id="newRecUrl" placeholder="https://…">
      <button class="btn-primary" id="btnAddRec">+ Aggiungi link</button>
    </div>
    <div class="call-rec-list">${rowsHtml}</div>
    <div class="modal-actions"><button class="btn-ghost" id="btnCloseRec">Chiudi</button></div>
  `);
  const close = () => { closeModal(); renderRoute(); };
  document.getElementById('btnCloseRec').addEventListener('click', close);
  const add = () => {
    const labelInput = document.getElementById('newRecLabel');
    const urlInput = document.getElementById('newRecUrl');
    let url = urlInput.value.trim();
    if (!url) { urlInput.focus(); showToast('Incolla il link della registrazione.', true); return; }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    db.callRecordings = db.callRecordings || [];
    db.callRecordings.push({ id: uid('rec'), label: labelInput.value.trim(), url, createdAt: new Date().toISOString() });
    persist();
    showToast('Registrazione salvata.');
    openCallRecordingsModal();
  };
  document.getElementById('btnAddRec').addEventListener('click', add);
  document.getElementById('newRecUrl').addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  modalRoot.querySelectorAll('[data-del-rec]').forEach(btn => {
    btn.addEventListener('click', () => {
      db.callRecordings = (db.callRecordings || []).filter(r => r.id !== btn.dataset.delRec);
      persist();
      openCallRecordingsModal();
    });
  });
}

/* ---------- Popup rate (installments) ---------- */

function openInstallmentsModal(apptId, role) {
  const apt = db.appointments.find(x => x.id === apptId);
  if (!apt) return;
  renderInstallmentsModal(apt, role);
}

function renderInstallmentsModal(apt, role) {
  const returnToRoleScreen = () => renderRoute(); // Setter: pannello € della lista (il Venditore usa la scheda lead → Pagamenti)
  // Rata sintetica "Acconto" (dal cash collected, vedi getEffectiveInstallments):
  // mostrata per prima, bloccata (non cancellabile, importo non editabile qui — si
  // modifica dal campo Cash Collected nella riga della tabella) così l'utente vede
  // subito quanto è già stato incassato e aggiunge solo l'importo MANCANTE come rate.
  const depositRowHtml = (apt.cashCollected && apt.cashCollected > 0) ? `
    <div class="installment-row installment-row-deposit">
      <span class="installment-deposit-label">Acconto (cash collected)</span>
      <span class="installment-deposit-amount">€${round2(apt.cashCollected)}</span>
      <span class="text-dim" style="font-size:0.72rem;">già incassato</span>
      <span class="badge badge-yes">pagata</span>
      <span></span>
      <span class="text-dim" style="font-size:0.72rem;" title="Modifica dal campo Cash Collected nella tabella">🔒</span>
    </div>` : '';

  const rowsHtml = (apt.installments || []).map(inst => `
    <div class="installment-row" data-inst-row="${inst.id}">
      <input type="text" data-inst-field="label" value="${escapeHtml(inst.label || '')}" placeholder="Es. Rata 2">
      <input type="number" min="0" data-inst-field="amount" value="${inst.amount || 0}" placeholder="Importo €">
      <input type="date" data-inst-field="dueDate" value="${inst.dueDate ? dateInputValue(inst.dueDate) : ''}">
      <label class="checkbox-inline"><input type="checkbox" data-inst-field="paid" ${inst.paid ? 'checked' : ''}> pagata</label>
      <input type="date" data-inst-field="paidDate" value="${inst.paidDate ? dateInputValue(inst.paidDate) : ''}" ${inst.paid ? 'required aria-required="true"' : 'disabled'} aria-label="Data di pagamento" title="Data di pagamento (obbligatoria per una rata pagata)">
      <button class="crm-row-del" data-del-inst="${inst.id}" title="Elimina rata">×</button>
    </div>`).join('');

  const total = apptTotalSold(apt);

  openModal(`
    <h3>Rate — ${escapeHtml(apt.clientName || '(senza nome)')}</h3>
    <p class="text-dim" style="font-size:0.8rem;">Il cash collected è già conteggiato come acconto (prima riga, bloccata). Aggiungi qui solo l'importo MANCANTE rispetto al totale venduto reale.</p>
    <div class="installments-list" id="instList">${depositRowHtml}${rowsHtml || (depositRowHtml ? '' : '<p class="text-dim">Nessuna rata aggiunta ancora.</p>')}</div>
    <button class="btn-ghost" id="btnAddInstallment">+ Aggiungi rata</button>
    <div class="installment-total-row"><span>Totale (acconto + rate)</span><span>€${round2(total)}</span></div>
    <div class="modal-actions">
      <button class="btn-primary" data-close-modal="1">Chiudi</button>
    </div>
  `);
  modalRoot.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => { closeModal(); returnToRoleScreen(); }));

  document.getElementById('btnAddInstallment').addEventListener('click', () => {
    apt.installments = apt.installments || [];
    apt.installments.push({
      id: uid('rata'),
      label: `Rata ${apt.installments.length + 1}`,
      amount: 0,
      dueDate: dateInputValue(new Date()),
      paid: false,
      paidDate: null
    });
    persist();
    renderInstallmentsModal(apt);
  });

  modalRoot.querySelectorAll('[data-del-inst]').forEach(btn => {
    btn.addEventListener('click', () => {
      apt.installments = apt.installments.filter(i => i.id !== btn.dataset.delInst);
      persist();
      renderInstallmentsModal(apt);
    });
  });

  modalRoot.querySelectorAll('[data-inst-row]').forEach(row => {
    const instId = row.dataset.instRow;
    const inst = apt.installments.find(i => i.id === instId);
    row.querySelectorAll('[data-inst-field]').forEach(fieldEl => {
      const field = fieldEl.dataset.instField;
      const evt = (fieldEl.type === 'checkbox') ? 'change' : 'change';
      fieldEl.addEventListener(evt, () => {
        if (field === 'label') inst.label = fieldEl.value;
        else if (field === 'amount') inst.amount = Math.max(0, parseFloat(fieldEl.value) || 0);
        else if (field === 'dueDate') inst.dueDate = fieldEl.value;
        else if (field === 'paid') {
          inst.paid = fieldEl.checked;
          if (inst.paid && !inst.paidDate) inst.paidDate = dateInputValue(new Date());
        } else if (field === 'paidDate') {
          // CORREZIONE (18/10, bug 8): una rata pagata ha sempre la data di pagamento
          // (la commissione va a quel giorno). Campo svuotato → si rimette quella di prima, o oggi.
          if (inst.paid && !fieldEl.value) {
            inst.paidDate = inst.paidDate || dateInputValue(new Date());
            showToast('La data di pagamento serve per una rata pagata: ho rimesso ' + fmtDate(inst.paidDate) + '.', true);
          } else inst.paidDate = fieldEl.value;
        }

        persist();
        renderInstallmentsModal(apt);
      });
    });
  });
}

/* ============================================================================
 * Commissioni — calendario mensile
 * ==========================================================================*/

/**
 * Calendario Commissioni, in fondo alla Dashboard. Funziona come prima (mese per mese,
 * clic su un giorno = dettaglio), restyling 17/10 (step 9): card con titolo e frecce,
 * giorni con commissioni colorati come la heatmap della guida (4 livelli della rampa
 * accento rispetto al giorno migliore del mese), oggi con il bordo scuro.
 */
function renderCommissioniCalendarSection() {
  const now = new Date();
  const viewDate = new Date(now.getFullYear(), now.getMonth() + uiState.calMonthOffset, 1);
  const monthRange = { start: startOfMonth(viewDate), end: endOfMonth(viewDate) };
  const summary = computeCommissionSummary(db, monthRange);
  const byDay = groupEventsByDay(summary.events);

  const firstOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7; // 0=lunedì
  const daysInMonth = endOfMonth(viewDate).getDate();
  const todayKey = dateInputValue(now);
  const maxDay = Math.max(0, ...Object.values(byDay).map(sumEvents));

  const dowLabels = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  let cells = '';
  for (let i = 0; i < firstWeekday; i++) cells += `<div class="cal-cell empty"></div>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const cellDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    const key = dateInputValue(cellDate);
    const events = byDay[key] || [];
    const dayTotal = sumEvents(events);
    const hasEvents = events.length > 0;
    const detail = summarizeDayEvents(events);
    const classes = ['cal-cell'];
    if (hasEvents) classes.push('has-events', 'lvl-' + (maxDay > 0 ? Math.max(1, Math.ceil(dayTotal / maxDay * 4)) : 1));
    if (key === todayKey) classes.push('today');
    cells += `
      <div class="${classes.join(' ')}" ${hasEvents ? `data-cal-day="${key}" title="${escapeHtml(detail)}"` : ''}>
        <div class="cal-daynum">${day}</div>
        ${hasEvents ? `<div class="cal-day-total">${fmtNumIt(dayTotal, true)}</div><div class="cal-day-detail">${escapeHtml(detail)}</div>` : ''}
      </div>`;
  }

  return `
    <section class="card dash-section comm-cal">
      <div class="dash-section-head">
        <h3>Calendario commissioni</h3>
        <div class="cal-nav">
          <button class="btn-icon" id="calPrev" title="Mese prima" aria-label="Mese prima">‹</button>
          <div class="cal-month-label">${viewDate.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</div>
          <button class="btn-icon" id="calNext" title="Mese dopo" aria-label="Mese dopo">›</button>
        </div>
      </div>
      <div class="cal-grid">
        ${dowLabels.map(d => `<div class="cal-dow">${d}</div>`).join('')}
        ${cells}
      </div>
      <div class="cal-foot">
        <span>Totale del mese <strong>${fmtNumIt(summary.total, true)}</strong></span>
        <span class="cal-heat-legend" aria-hidden="true">meno <i class="lvl-1"></i><i class="lvl-2"></i><i class="lvl-3"></i><i class="lvl-4"></i> più</span>
      </div>
    </section>
  `;
}

function wireCommissioniCalendarSection() {
  const now = new Date();
  const viewDate = new Date(now.getFullYear(), now.getMonth() + uiState.calMonthOffset, 1);
  const monthRange = { start: startOfMonth(viewDate), end: endOfMonth(viewDate) };
  const summary = computeCommissionSummary(db, monthRange);
  const byDay = groupEventsByDay(summary.events);

  document.getElementById('calPrev').addEventListener('click', () => { uiState.calMonthOffset -= 1; renderDashboard(); });
  document.getElementById('calNext').addEventListener('click', () => { uiState.calMonthOffset += 1; renderDashboard(); });
  appRoot.querySelectorAll('[data-cal-day]').forEach(cell => {
    cell.addEventListener('click', () => openCommissionDayModal(cell.dataset.calDay, byDay[cell.dataset.calDay] || []));
  });
}

const SETTER_PRESENTED_LABEL = { no: 'No', confirmed24h: 'Confermato24h', presented: 'Presentato', no_show: 'No Show', annullato: 'Annullato', spostato: 'Spostato' };

/* ============================================================================
 * Calendario appuntamenti — componente unico (restyling 17/10/2026, step 11, 5.2.1)
 * renderApptCalendar(role) + wireApptCalendar(role). Setter: in fondo a Setting →
 * Appuntamenti. Venditore: in fondo a Venditore → Lead (step 15).
 * Stessa struttura del calendario commissioni (mese lun-dom, ◀ ▶, "Oggi"), ma pensato
 * per leggere: celle alte, testo da 13 px, un blocco per appuntamento con ora + nome
 * (+ centro se c'è), colore per esito (rampa accento + neutri, legenda sotto), oggi con
 * bordo accento. Più di 4 in un giorno: i primi 4 + "+N altri" (dettaglio del giorno).
 * Clic su un appuntamento: Setter = riga nella lista (evidenziata), Venditore = scheda lead.
 * Sotto i 900 px la griglia lascia il posto a un elenco per giorno (solo CSS).
 * Il mese mostrato è ricordato in memoria (uiState.apptCalOffset), non nel browser.
 * ==========================================================================*/
const APPT_CAL_MAX_PER_DAY = 4;

/** Categorie colore per ruolo, in ordine di legenda. */
const APPT_CAL_CATS = {
  setter: [
    { key: 'presented', label: 'Presentato' },
    { key: 'confirmed', label: 'Confermato 24h' },
    { key: 'waiting', label: 'Da confermare' },
    { key: 'noshow', label: 'No show' },
    { key: 'cancelled', label: 'Annullato' },
    { key: 'moved', label: 'Spostato' }
  ],
  venditore: [
    { key: 'presented', label: 'Chiuso / contratto' },
    { key: 'confirmed', label: 'Trattativa' },
    { key: 'soft', label: 'Non in target' },
    { key: 'waiting', label: 'Senza esito' },
    { key: 'noshow', label: 'No show' },
    { key: 'cancelled', label: 'Annullato / perso' },
    { key: 'moved', label: 'Spostato' }
  ]
};

function apptCalCategory(a, role) {
  if (role === 'venditore') {
    const st = a.dealStage || '';
    if (a.closed || st === 'chiuso' || st === 'contratto_firmato') return 'presented';
    if (st === 'trattativa') return 'confirmed';
    if (st === 'non_in_target') return 'soft';
    if (st === 'no_show') return 'noshow';
    if (st === 'annullato' || st === 'perso') return 'cancelled';
    if (st === 'spostato') return 'moved';
    return 'waiting';
  }
  return ({ presented: 'presented', confirmed24h: 'confirmed', no_show: 'noshow', annullato: 'cancelled', spostato: 'moved' })[a.presentedStatus] || 'waiting';
}

function apptCalLabel(a, role) {
  if (role === 'venditore') { const d = a.dealStage && dealStageDef(a.dealStage); return d ? d.label : 'Senza esito'; }
  return SETTER_PRESENTED_LABEL[a.presentedStatus] || SETTER_PRESENTED_LABEL.no;
}

/** Centro da mostrare accanto al nome: quello dell'appuntamento, o del lead (Venditore). */
function apptCalCentro(a) {
  if (a.centerName) return a.centerName;
  if (a.role === 'venditore' && a.leadId) {
    const l = (db.leads || []).find(x => x.id === a.leadId);
    if (l && l.centro) return l.centro;
  }
  return '';
}

function apptCalViewDate(role) {
  uiState.apptCalOffset = uiState.apptCalOffset || {};
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + (uiState.apptCalOffset[role] || 0), 1);
}

/** Appuntamenti del ruolo nel mese, per giorno (YYYY-MM-DD), ordinati per ora. */
function apptCalByDay(role, viewDate) {
  const range = { start: startOfMonth(viewDate), end: endOfMonth(viewDate) };
  const byDay = {};
  db.appointments
    .filter(a => a.role === role && a.scheduledAt && inRange(a.scheduledAt, range))
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
    .forEach(a => { const k = dateInputValue(a.scheduledAt); (byDay[k] = byDay[k] || []).push(a); });
  return byDay;
}

function apptCalEventHtml(a, role) {
  const cat = apptCalCategory(a, role);
  const centro = apptCalCentro(a);
  // Venditore: il nome del lead (senza la sigla " - MJ - N" dell'appuntamento).
  const lead = role === 'venditore' && a.leadId ? (db.leads || []).find(l => l.id === a.leadId) : null;
  const name = (lead && lead.name) || a.clientName || '(senza nome)';
  const title = `${fmtTime(a.scheduledAt)} · ${name}${centro ? ' · ' + centro : ''} · ${apptCalLabel(a, role)}`;
  return `<button type="button" class="acal-ev acal-${cat}" data-acal-appt="${a.id}" title="${escapeHtml(title)}">
      <span class="acal-time">${fmtTime(a.scheduledAt)}</span>
      <span class="acal-name">${escapeHtml(name)}${centro ? `<span class="acal-centro"> · ${escapeHtml(centro)}</span>` : ''}</span>
    </button>`;
}

function renderApptCalendar(role) {
  role = role === 'venditore' ? 'venditore' : 'setter';
  const now = new Date();
  const viewDate = apptCalViewDate(role);
  const byDay = apptCalByDay(role, viewDate);
  const firstWeekday = (viewDate.getDay() + 6) % 7; // 0 = lunedì
  const daysInMonth = endOfMonth(viewDate).getDate();
  const todayKey = dateInputValue(now);
  const monthTotal = Object.values(byDay).reduce((s, l) => s + l.length, 0);
  const dow = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

  let cells = '';
  for (let i = 0; i < firstWeekday; i++) cells += `<div class="acal-cell empty" aria-hidden="true"></div>`;
  let listDays = '';
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    const key = dateInputValue(d);
    const list = byDay[key] || [];
    const isToday = key === todayKey;
    const wknd = d.getDay() === 0 || d.getDay() === 6;
    const shown = list.slice(0, APPT_CAL_MAX_PER_DAY);
    const more = list.length - shown.length;
    cells += `
      <div class="acal-cell ${isToday ? 'today' : ''} ${wknd ? 'weekend' : ''} ${list.length ? 'has-appts' : ''}">
        <div class="acal-daynum">${day}${isToday ? '<span class="acal-today-tag">oggi</span>' : ''}</div>
        ${shown.map(a => apptCalEventHtml(a, role)).join('')}
        ${more > 0 ? `<button type="button" class="acal-more" data-acal-day="${key}">+${more} ${more === 1 ? 'altro' : 'altri'}</button>` : ''}
      </div>`;
    if (list.length) {
      const dayLabel = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
      listDays += `
        <div class="acal-lday ${isToday ? 'today' : ''}">
          <div class="acal-lday-head"><span>${escapeHtml(dayLabel)}</span>${isToday ? '<span class="acal-today-tag">oggi</span>' : ''}<span class="acal-lday-count">${list.length}</span></div>
          ${list.map(a => apptCalEventHtml(a, role)).join('')}
        </div>`;
    }
  }
  const trailing = (7 - ((firstWeekday + daysInMonth) % 7)) % 7;
  for (let i = 0; i < trailing; i++) cells += `<div class="acal-cell empty" aria-hidden="true"></div>`;

  const monthLabel = viewDate.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  const isCurrent = !(uiState.apptCalOffset && uiState.apptCalOffset[role]);
  return `
    <section class="card dash-section acal" data-acal="${role}">
      <div class="dash-section-head acal-head">
        <h3>Calendario appuntamenti${role === 'venditore' ? ' Venditore' : ''}</h3>
        <div class="cal-nav acal-nav">
          <button class="btn-ghost btn-sm" data-acal-nav="today" ${isCurrent ? 'disabled' : ''}>Oggi</button>
          <button class="btn-icon" data-acal-nav="-1" title="Mese prima" aria-label="Mese prima">‹</button>
          <div class="cal-month-label acal-month">${escapeHtml(monthLabel)}</div>
          <button class="btn-icon" data-acal-nav="1" title="Mese dopo" aria-label="Mese dopo">›</button>
        </div>
      </div>
      <div class="acal-grid" role="grid" aria-label="Appuntamenti di ${escapeHtml(monthLabel)}">
        ${dow.map(x => `<div class="acal-dow">${x}</div>`).join('')}
        ${cells}
      </div>
      <div class="acal-list">
        ${listDays || '<p class="text-dim acal-list-empty">Nessun appuntamento in questo mese.</p>'}
      </div>
      <div class="acal-foot">
        <span class="acal-total">${monthTotal} ${monthTotal === 1 ? 'appuntamento' : 'appuntamenti'} nel mese</span>
        <div class="acal-legend">
          ${APPT_CAL_CATS[role].map(c => `<span class="acal-legend-item"><i class="acal-${c.key}"></i>${escapeHtml(c.label)}</span>`).join('')}
        </div>
      </div>
    </section>`;
}

function wireApptCalendar(role) {
  role = role === 'venditore' ? 'venditore' : 'setter';
  const root = appRoot.querySelector(`[data-acal="${role}"]`);
  if (!root) return;
  const rerender = () => {
    const cur = appRoot.querySelector(`[data-acal="${role}"]`);
    if (!cur) return;
    cur.outerHTML = renderApptCalendar(role);
    wireApptCalendar(role);
  };
  root.querySelectorAll('[data-acal-nav]').forEach(btn => btn.addEventListener('click', () => {
    uiState.apptCalOffset = uiState.apptCalOffset || {};
    const v = btn.dataset.acalNav;
    uiState.apptCalOffset[role] = v === 'today' ? 0 : (uiState.apptCalOffset[role] || 0) + Number(v);
    rerender();
  }));
  root.querySelectorAll('[data-acal-appt]').forEach(btn => btn.addEventListener('click', () => openApptFromCalendar(btn.dataset.acalAppt)));
  root.querySelectorAll('[data-acal-day]').forEach(btn => btn.addEventListener('click', () => openApptCalendarDay(role, btn.dataset.acalDay)));
}

/** Clic su un appuntamento del calendario. */
function openApptFromCalendar(id) {
  const a = db.appointments.find(x => x.id === id);
  if (!a) return;
  if (a.role === 'venditore') {
    const lead = a.leadId && (db.leads || []).find(l => l.id === a.leadId);
    location.hash = lead ? '#/lead/' + lead.id : '#/venditore-lead'; // senza nome = senza lead: in fondo alla lista Lead
    return;
  }
  if (!location.hash.startsWith('#/setting-appuntamenti')) {
    location.hash = '#/setting-appuntamenti';
    renderRoute();
  }
  highlightSetterApptRow(a.id);
}

/** Dettaglio del giorno ("+N altri"): tutti gli appuntamenti, cliccabili. */
function openApptCalendarDay(role, key) {
  const list = (apptCalByDay(role, new Date(key + 'T12:00'))[key]) || [];
  const d = new Date(key + 'T12:00');
  openModal(`
    <h3>${escapeHtml(d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }))}</h3>
    <p class="text-dim" style="font-size:0.85rem;">${list.length} ${list.length === 1 ? 'appuntamento' : 'appuntamenti'}</p>
    <div class="acal-daylist" data-acal="${role}">
      ${list.map(a => `<div class="acal-dayrow">${apptCalEventHtml(a, role)}<span class="acal-dayrow-label">${escapeHtml(apptCalLabel(a, role))}</span></div>`).join('')}
    </div>
    <div class="modal-actions"><button class="btn-ghost" data-close-modal="1">Chiudi</button></div>
  `);
  modalRoot.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', closeModal));
  modalRoot.querySelectorAll('[data-acal-appt]').forEach(btn => btn.addEventListener('click', () => { closeModal(); openApptFromCalendar(btn.dataset.acalAppt); }));
}

const COMMISSION_SOURCE_LABELS = { showup: 'presentati', setting: 'chiusura setting', vendita: 'chiusura closer' };

function summarizeDayEvents(events) {
  const bySource = {};
  events.forEach(e => { bySource[e.source] = (bySource[e.source] || 0) + e.amount; });
  return Object.entries(bySource).map(([src, amt]) => `${round2(amt)}€ ${COMMISSION_SOURCE_LABELS[src] || src}`).join(' · ');
}

function openCommissionDayModal(dayKey, events) {
  const rows = events.map(ev => `
    <div class="cal-detail-row">
      <div>
        <div>${escapeHtml(ev.clientName || '(senza nome)')}</div>
        <div class="cal-detail-source">${COMMISSION_SOURCE_LABELS[ev.source] || ev.source} · ${ev.role === 'setter' ? 'Setter' : 'Venditore'}</div>
      </div>
      <div class="cal-detail-amount">€${round2(ev.amount)}</div>
    </div>`).join('');

  openModal(`
    <h3>Commissioni del ${fmtDate(dayKey)}</h3>
    <div class="cal-detail-list">${rows || '<p class="text-dim">Nessun evento.</p>'}</div>
    <div class="modal-actions">
      <button class="btn-primary" data-close-modal="1">Chiudi</button>
    </div>
  `);
  modalRoot.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', closeModal));
}

/* ---------- Sessione attiva (schermata isolata) ---------- */

function renderSessioneAttiva() {
  document.body.classList.add('in-session');
  const s = db.activeSession;
  if (!s) { document.body.classList.remove('in-session'); location.hash = '#/dashboard'; renderRoute(); return; }

  const pipeline = db.pipelines.find(p => p.id === s.pipelineId);
  const outcomes = pipeline ? pipeline.outcomes : [];

  const counts = {};
  Object.assign(counts, sessionOutcomeCountsByLead(s));
  const totalCalls = s.calls.length;
  const totalLeads = countSessionLeads(s, db.sessions);

  const breakdownHtml = Object.keys(counts).length
    ? Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([label, count]) =>
        `<div class="breakdown-chip"><span class="bc-count">${count}</span><span class="bc-label">${escapeHtml(label)}</span></div>`).join('')
    : '<span class="text-dim">Ancora nessuna chiamata registrata</span>';

  const buttonsHtml = outcomes.map(o => `
    <button class="outcome-btn" data-outcome-id="${o.id}">
      ${escapeHtml(o.label)}
      ${o.isNoAnswer && MAX_CALL_ATTEMPTS > 1 ? `<span class="outcome-btn-sub">attiva richiamo (max ${MAX_CALL_ATTEMPTS} tentativi)</span>` : ''}
    </button>
  `).join('');

  const attemptNum = (s.callAttemptsOnLead || 0) + 1;
  const secondCallBannerHtml = s.retryCallsPending ? `
    <div class="second-call-banner">
      <span class="blink-dot"></span>Richiamo ${attemptNum}ª chiamata — stesso lead
      <span class="scb-hint">Segna l'esito di questo tentativo, oppure premi Skip per annullare e passare al prossimo lead.</span>
    </div>
  ` : '';

  const isPaused = !!s.pausedAt;
  const pauseBannerHtml = isPaused ? `
    <div class="pause-banner">
      <span class="blink-dot"></span>Sessione in pausa — il tempo non sta scorrendo
      <span class="scb-hint">Premi "Riprendi" quando torni operativo per ripartire con il conteggio.</span>
    </div>
  ` : '';

  // Lead "Da richiamare" ancora in attesa (status 'pending'): SOLO quelli fissati per
  // OGGI, in ordine di ora (restyling 5.4.1). Gli arretrati dei giorni prima stanno nelle
  // Task della Dashboard; quelli dei giorni dopo compaiono il loro giorno.
  const sessionCallbacks = todayPendingCallbacks();
  const sidebarHtml = sessionCallbacks.length ? renderSessionCallbackSidebar(sessionCallbacks) : '';

  const lastCall = s.calls[s.calls.length - 1];
  const undoBtnHtml = lastCall && lastCall.undoState
    ? `<div class="session-undo-row"><button id="btnUndoLastCall" class="btn-undo" title="Cancella l'ultimo esito che hai segnato e torna indietro">↶ Annulla ultimo esito <span class="session-undo-label">${escapeHtml(lastCall.outcomeLabel)}</span></button></div>`
    : '';
  appRoot.innerHTML = `
    <div class="session-screen${isPaused ? ' is-paused' : ''}">
      <div class="session-body">
        ${sidebarHtml}
        <div class="session-main-col">
          <div class="session-topbar">
            <button id="btnEndSession" class="btn-danger-ghost">■ Fine sessione</button>
            <div class="session-pipeline-name">${escapeHtml(s.pipelineName)}</div>
            <div class="session-topbar-right">
              <button id="btnMinimizeSession" class="btn-skip" title="La sessione resta attiva: puoi rientrare quando vuoi">↩ Esci</button>
              <button id="btnPauseSession" class="btn-pause${isPaused ? ' is-paused' : ''}">${isPaused ? '▶ Riprendi' : '⏸ Pausa'}</button>
              <button id="btnSkip" class="btn-skip">Skip →</button>
            </div>
          </div>
          ${undoBtnHtml}

          <div class="session-stats">
            <div class="stat-block">
              <div class="stat-value" id="sessionTimer">00:00</div>
              <div class="stat-label">Durata sessione${isPaused ? ' (in pausa)' : ''}</div>
            </div>
            <div class="stat-block">
              <div class="stat-value">${totalCalls}</div>
              <div class="stat-label">Chiamate fatte</div>
            </div>
            <div class="stat-block">
              <div class="stat-value">${totalLeads}</div>
              <div class="stat-label">Lead contattati</div>
            </div>
            ${s.skips ? `<div class="stat-block"><div class="stat-value">${s.skips}</div><div class="stat-label">Saltati</div></div>` : ''}
          </div>

          ${pauseBannerHtml}
          ${secondCallBannerHtml}

          <div class="session-breakdown">${breakdownHtml}</div>

          <div class="outcome-grid">${buttonsHtml}</div>

          ${renderSessionApptList(s)}
        </div>
        ${renderLiveChecklistPanel(s.checklist, { hint: 'Si salva se fissi l\'appuntamento, o se lo confermi (con almeno una voce spuntata).' })}
      </div>
    </div>
  `;
  wireLiveChecklist(appRoot, () => db.activeSession && db.activeSession.checklist, items => { if (db.activeSession) db.activeSession.checklist = items; });

  appRoot.querySelectorAll('[data-outcome-id]').forEach(btn => {
    btn.addEventListener('click', () => { if (!db.activeSession.pausedAt) logCallAction(btn.dataset.outcomeId); });
  });
  document.getElementById('btnSkip').addEventListener('click', () => { if (!db.activeSession.pausedAt) skipLeadAction(); });
  const undoBtn = document.getElementById('btnUndoLastCall');
  if (undoBtn) undoBtn.addEventListener('click', undoLastCallAction);
  document.getElementById('btnEndSession').addEventListener('click', endSessionAction);
  document.getElementById('btnPauseSession').addEventListener('click', toggleSessionPause);
  document.getElementById('btnMinimizeSession').addEventListener('click', () => {
    uiState.sessionMinimized = true;
    location.hash = '#/dashboard';
    renderRoute();
  });
  appRoot.querySelectorAll('[data-edit-callback]').forEach(btn => {
    btn.addEventListener('click', () => openEditCallbackModal(btn.dataset.editCallback, () => renderRoute()));
  });
  wireCallbackNotesButtons(appRoot, () => renderRoute());
  appRoot.querySelectorAll('[data-delete-callback]').forEach(btn => {
    btn.addEventListener('click', () => removeCallback(btn.dataset.deleteCallback, () => renderRoute()));
  });
  // Lista appuntamenti fissati in sessione: si salva al cambio campo, senza ridisegnare
  // la schermata (così non si perde quello che stai scrivendo).
  appRoot.querySelectorAll('[data-sess-apt]').forEach(input => {
    input.addEventListener('change', () => {
      const apt = db.appointments.find(a => a.id === input.dataset.sessApt);
      if (!apt) return;
      const field = input.dataset.field;
      const val = input.value.trim();
      if (field === 'clientName' && !val) { input.value = apt.clientName || ''; return; }
      apt[field] = field === 'phone' ? (val || '') : val;
      persist();
      showToast('Appuntamento aggiornato.');
    });
  });
  // ⋯ di un appuntamento fissato: checklist da aggiornare (Simone, 24/10, fix di Hamza).
  appRoot.querySelectorAll('[data-sess-apt-more]').forEach(btn => {
    btn.addEventListener('click', () => openApptChecklistModal(btn.dataset.sessAptMore, () => { closeModal(); renderRoute(); }));
  });
  appRoot.querySelectorAll('[data-call-callback]').forEach(btn => {
    btn.addEventListener('click', () => { if (!db.activeSession.pausedAt) startCallbackCall(btn.dataset.callCallback); });
  });

  clearInterval(sessionTimerInterval);
  updateSessionTimer();
  sessionTimerInterval = setInterval(updateSessionTimer, 1000);
}

/** Lista breve sotto gli esiti (Simone, 2026-10-08): gli appuntamenti fissati in QUESTA
 * sessione, con nome e cognome, telefono e data modificabili al volo. */
function renderSessionApptList(s) {
  const appts = (db.appointments || []).filter(a => a.sourceSessionId === s.id);
  if (!appts.length) return '';
  const rows = appts.map(a => `
    <div class="sess-apt-row">
      <input type="text" class="crm-inline-input" data-sess-apt="${a.id}" data-field="clientName" value="${escapeHtml(a.clientName || '')}" placeholder="Nome e cognome">
      <input type="text" class="crm-inline-input" data-sess-apt="${a.id}" data-field="phone" value="${escapeHtml(a.phone || '')}" placeholder="Telefono">
      <input type="datetime-local" class="crm-inline-input" data-sess-apt="${a.id}" data-field="scheduledAt" value="${(a.scheduledAt || '').slice(0, 16)}">
      <span class="sess-apt-check" title="Voci della checklist prese">${a.checklist ? CHECKLIST_ITEMS.filter(it => a.checklist[it.id] === true).length + '/' + CHECKLIST_ITEMS.length : '—'}</span>
      <button class="btn-icon sess-apt-more" data-sess-apt-more="${a.id}" title="Checklist e telefono" aria-label="Checklist e telefono">⋯</button>
    </div>`).join('');
  return `
    <section class="sess-apt-list">
      <div class="sess-apt-title">Appuntamenti fissati in questa sessione (${appts.length})</div>
      ${rows}
    </section>`;
}

/** Colonna laterale "Da richiamare" — vedi renderSessioneAttiva. */
function renderSessionCallbackSidebar(sessionCallbacks) {
  const itemsHtml = sessionCallbacks.map(cb => `
    <div class="session-callback-item">
      <div class="session-callback-item-name">${escapeHtml(cb.leadName)}${callbackNotesButton(cb)}<button class="callback-edit-btn" data-edit-callback="${cb.id}" title="Modifica dati del lead">✎</button><button class="callback-edit-btn" data-delete-callback="${cb.id}" title="Togli dai da richiamare">🗑</button></div>
      ${cb.phone ? `<div class="session-callback-item-phone">${escapeHtml(cb.phone)}</div>` : ''}
      <div class="session-callback-item-when">Oggi · ${fmtTime(cb.scheduledAt)}</div>
      <button class="btn-ghost session-callback-item-btn" data-call-callback="${cb.id}">Chiama</button>
    </div>`).join('');
  return `
    <aside class="session-callback-sidebar">
      <div class="session-callback-sidebar-title">Da richiamare</div>
      ${itemsHtml}
    </aside>`;
}

/**
 * Blocca/riprende il timer della sessione attiva senza toccare startedAt: accumula
 * il tempo passato in pausa in pausedTotalMs (sommato quando l'utente riprende) e,
 * mentre è in pausa, tiene il timestamp d'inizio pausa in pausedAt così
 * updateSessionTimer() può sottrarre anche la pausa ancora in corso dal conteggio
 * (vedi sotto) — il tempo mostrato riflette solo il lavoro reale, non le pause.
 */
function toggleSessionPause() {
  const s = db.activeSession;
  if (!s) return;
  if (s.pausedAt) {
    const pausedMs = Date.now() - new Date(s.pausedAt).getTime();
    s.pausedTotalMs = (s.pausedTotalMs || 0) + Math.max(0, pausedMs);
    s.pausedAt = null;
  } else {
    s.pausedAt = new Date().toISOString();
  }
  persist();
  renderSessioneAttiva();
}

function updateSessionTimer() {
  const s = db.activeSession;
  if (!s) { clearInterval(sessionTimerInterval); return; }
  const el = document.getElementById('sessionTimer');
  if (!el) { clearInterval(sessionTimerInterval); return; }
  const pausedTotalMs = s.pausedTotalMs || 0;
  const ongoingPauseMs = s.pausedAt ? (Date.now() - new Date(s.pausedAt).getTime()) : 0;
  const elapsed = Date.now() - new Date(s.startedAt).getTime() - pausedTotalMs - ongoingPauseMs;
  el.textContent = fmtDuration(Math.max(0, elapsed));
}

// Label esatta (case-sensitive) dell'esito di default che aggancia il popup CRM — vedi
// defaultOutcomesList() in storage.js. Solo questo esito specifico apre il popup: un
// "conferma appuntamento" (altro isConversion:true) o un esito custom non lo attivano mai.
const APPOINTMENT_SET_OUTCOME_LABEL = 'Appuntamento Fissato';

// Stesso principio per l'esito "Da richiamare": solo questa label esatta apre la tendina
// per programmare un richiamo (nome/telefono + quando) — vedi openCallbackModal.
const CALLBACK_OUTCOME_LABEL = 'Da richiamare';

// Numero massimo di tentativi TOTALI sullo stesso lead quando l'esito è "nessuna risposta"
// (es. squilli a vuoto). 1 = nessun richiamo (si passa subito al lead successivo dopo il
// primo "non risponde"), 2 = un richiamo (2 chiamate totali, comportamento storico), 3 = due
// richiami (3 chiamate totali — regola indicata il 14/09/2026). Se le indicazioni cambiano
// di nuovo, basta aggiornare questo numero: tutto il resto del flusso si adatta da solo.
const MAX_CALL_ATTEMPTS = 3;

function logCallAction(outcomeId) {
  const s = db.activeSession;
  const pipeline = db.pipelines.find(p => p.id === s.pipelineId);
  const outcome = pipeline.outcomes.find(o => o.id === outcomeId);
  if (!outcome) return;

  // Se eravamo in attesa di un richiamo, questo click è un ulteriore tentativo sullo
  // STESSO lead (non un lead nuovo), qualunque sia l'esito di questa chiamata.
  const isRetryAttempt = (s.retryCallsPending || 0) > 0;
  // Stato del giro PRIMA di questa chiamata: serve al tasto "Annulla ultima" (vedi
  // undoLastCallAction) per rimettere tutto com'era.
  const undoState = {
    retryCallsPending: s.retryCallsPending,
    callAttemptsOnLead: s.callAttemptsOnLead,
    currentLeadGroupId: s.currentLeadGroupId,
    // Spunte della checklist prima di questo esito: "Annulla ultimo esito" le rimette.
    checklist: Object.assign({}, s.checklist || {})
  };

  // groupId: identifica univocamente "questo lead" a prescindere dalla posizione nell'array
  // (vedi computeStats in utils.js) — un nuovo lead riceve un id nuovo, un tentativo di
  // richiamo immediato (isRetryAttempt) riusa quello del lead corrente. Serve anche per
  // collegare correttamente, più avanti nel tempo, l'eventuale chiamata di richiamo fatta
  // da un lead "Da richiamare" (vedi logCallbackCall/appendCallbackCallToSession).
  if (!isRetryAttempt) s.currentLeadGroupId = uid('lead');

  const callRecord = {
    id: uid('call'),
    timestamp: new Date().toISOString(),
    outcomeId: outcome.id,
    outcomeLabel: outcome.label,
    isConversion: !!outcome.isConversion,
    isNoAnswer: !!outcome.isNoAnswer,
    isSecondAttempt: isRetryAttempt,
    groupId: s.currentLeadGroupId,
    undoState
  };
  s.calls.push(callRecord);

  // Quanti tentativi abbiamo già fatto su questo lead in questo giro (1 = solo la chiamata
  // appena fatta, oppure quelli precedenti +1 se eravamo già in un richiamo).
  const attemptsSoFar = isRetryAttempt ? (s.callAttemptsOnLead || 1) + 1 : 1;
  s.callAttemptsOnLead = attemptsSoFar;

  // Un esito "nessuna risposta" apre la finestra per un ulteriore richiamo sullo stesso
  // lead, finché non si raggiunge MAX_CALL_ATTEMPTS tentativi totali su quel lead.
  const canRetry = !!outcome.isNoAnswer && attemptsSoFar < MAX_CALL_ATTEMPTS;
  s.retryCallsPending = canRetry;
  if (!canRetry) s.callAttemptsOnLead = 0;

  // Checklist (5.4.3): con "Appuntamento Fissato" resta finché la modale non viene
  // salvata (se la annulli resta com'era); con qualsiasi altro esito si azzera per il
  // lead dopo — anche "Da richiamare" e i tentativi senza risposta.
  // Con l'altro esito isConversion ("conferma appuntamento", Simone 18/10) le spunte si
  // salvano sull'appuntamento confermato, se ce n'è almeno una: la sessione non sa il
  // nome del lead, quindi si chiede quale appuntamento (openConfirmChecklistPickModal).
  const isApptSet = outcome.label === APPOINTMENT_SET_OUTCOME_LABEL;
  const isConfirmOutcome = isConfirmOutcomeDef(outcome);
  const checklistNow = Object.assign({}, s.checklist || {});
  if (!isApptSet) s.checklist = {};

  // La chiamata è già registrata a prescindere da quel che succede dopo (persist() qui sotto):
  // i popup "Appuntamento Fissato"/"Da richiamare" (se scattano) sono un'aggiunta al CRM/ai
  // richiami, non devono mai poter bloccare o alterare il conteggio normale della sessione.
  persist();
  renderSessioneAttiva();

  if (isApptSet) {
    uiState.pendingApptCallId = callRecord.id;
    openAppointmentSetModal({
      checklist: checklistNow,
      onSaved: () => { if (db.activeSession) db.activeSession.checklist = {}; }
    });
  } else if (isConfirmOutcome && checklistHasAny(checklistNow)) {
    openConfirmChecklistPickModal(callRecord.id, checklistNow);
  } else if (outcome.label === CALLBACK_OUTCOME_LABEL) {
    openCallbackModal({
      mode: 'create',
      groupId: callRecord.groupId,
      sourceCallId: callRecord.id,
      sourceSessionId: s.id,
      sourcePipelineId: pipeline.id,
      sourcePipelineName: pipeline.name,
      afterSave: renderSessioneAttiva
    });
  }
}

/**
 * "Quale appuntamento?" (Simone, 18/10/2026): esito "conferma appuntamento" in sessione
 * con almeno una voce della checklist spuntata. Elenco degli appuntamenti Setter di oggi
 * e futuri ancora aperti (da confermare o confermati), con ricerca per nome o telefono.
 * Clic = unione delle spunte sull'appuntamento (mergeChecklistIntoAppt); lo stato di prima
 * va nell'undoState della chiamata, così "Annulla ultimo esito" lo rimette. "Salta" = non
 * salva niente.
 */
/** Esito "conferma appuntamento": l'esito isConversion che non è "Appuntamento Fissato". */
function isConfirmOutcomeDef(outcome) {
  return !!(outcome && outcome.isConversion && outcome.label !== APPOINTMENT_SET_OUTCOME_LABEL);
}
/** Collegamento sicuro richiamata → appuntamento: UN solo appuntamento candidato con lo
 * stesso telefono (ultime 9 cifre, almeno 6 cifre). Il nome da solo non basta (due
 * persone possono chiamarsi uguale): in quel caso si chiede "Quale appuntamento?". */
function sureConfirmApptForPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 6) return null;
  const key = digits.slice(-9);
  const hits = confirmChecklistCandidates().filter(a => String(a.phone || '').replace(/\D/g, '').slice(-9) === key);
  return hits.length === 1 ? hits[0] : null;
}
function confirmChecklistCandidates() {
  const start = startOfDay(new Date());
  return db.appointments
    .filter(a => a.role === 'setter' && a.scheduledAt && new Date(a.scheduledAt) >= start
      && (a.presentedStatus === 'no' || a.presentedStatus === 'confirmed24h' || !a.presentedStatus))
    .sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)));
}
function openConfirmChecklistPickModal(callId, items, opts) {
  opts = opts || {};
  const n = Object.keys(checklistOnIds(items)).length;
  const list = q => confirmChecklistCandidates().filter(a => matchesApptSearch(a, q || ''));
  const rowsHtml = q => {
    const l = list(q);
    if (!l.length) return `<p class="text-dim cpick-empty">${confirmChecklistCandidates().length ? 'Nessun appuntamento con questo nome.' : 'Nessun appuntamento Setter da oggi in poi.'}</p>`;
    return l.map(a => `
      <button type="button" class="cpick-row" data-cpick="${a.id}">
        <span class="cpick-name">${escapeHtml(a.clientName || '(senza nome)')}</span>
        <span class="cpick-when">${escapeHtml(fmtApptWhen(a.scheduledAt))}${a.presentedStatus === 'confirmed24h' ? ' · confermato' : ''}</span>
        <span class="cpick-ck">${a.checklist && typeof a.checklist === 'object' ? 'checklist ' + fmtPctIt(a.checklistPct != null ? a.checklistPct : checklistPctOf(a.checklist)) : 'senza checklist'}</span>
      </button>`).join('');
  };
  openModal(`
    <h3>Quale appuntamento?</h3>
    <p class="text-dim cpick-sub">Hai spuntato ${n} ${n === 1 ? 'voce' : 'voci'} della checklist. Scegli l'appuntamento che hai confermato: le aggiungo a quelle già salvate.</p>
    <input type="search" class="crm-search-input cpick-search" id="cpickSearch" placeholder="Cerca per nome o telefono..." aria-label="Cerca appuntamento" value="${escapeHtml(opts.initialQuery || '')}">
    <div class="cpick-list" id="cpickList">${rowsHtml(opts.initialQuery || '')}</div>
    <div class="modal-actions">
      <button class="btn-ghost" id="cpickSkip">Salta</button>
    </div>
  `);
  const search = document.getElementById('cpickSearch');
  const listEl = document.getElementById('cpickList');
  const wireRows = () => listEl.querySelectorAll('[data-cpick]').forEach(b => b.addEventListener('click', () => {
    const apt = db.appointments.find(a => a.id === b.dataset.cpick);
    const before = mergeChecklistIntoAppt(apt, items);
    if (opts.onSaved) opts.onSaved(before, apt);
    else {
      const s = db.activeSession;
      const call = s && s.calls.find(c => c.id === callId);
      if (call && call.undoState && before) call.undoState.apptChecklist = before;
    }
    persist();
    closeModal();
    showToast(`Checklist salvata su ${apt.clientName || '(senza nome)'} (${CHECKLIST_ITEMS.filter(it => apt.checklist[it.id]).length}/${CHECKLIST_ITEMS.length}).`);
    renderRoute();
  }));
  wireRows();
  search.addEventListener('input', () => { listEl.innerHTML = rowsHtml(search.value); wireRows(); });
  search.focus();
  document.getElementById('cpickSkip').addEventListener('click', () => { closeModal(); showToast('Checklist non salvata.'); });
}

/**
 * Popup aperto SOLO quando l'esito cliccato in sessione è esattamente "Appuntamento
 * Fissato" (vedi APPOINTMENT_SET_OUTCOME_LABEL). Chiede solo nome, data/ora e telefono
 * facoltativo (restyling step 10: il telefono non sta più nelle righe) dell'appuntamento appena fissato ("da lì poi compilo il resto" — l'utente completa
 * gli altri campi dopo, nella schermata Appuntamenti). Alla conferma crea una riga
 * db.appointments identica in tutto e per tutto a quella creata da "+ Nuovo
 * Appuntamento" (vedi openNewSetterApptModal/newAppointment), con role:'setter' fisso
 * (il flusso da sessione è sempre lato Setter) e i campi forniti già impostati.
 */
function openAppointmentSetModal(opts) {
  opts = opts || {};
  const nowLocal = localDateTimeValue(new Date());
  openModal(`
    <h3>Appuntamento fissato</h3>
    <p class="text-dim" style="font-size:0.85rem;">Aggiungilo subito al CRM come Setter — completerai gli altri campi dopo, nella schermata Appuntamenti.</p>
    <label class="field">
      Nome appuntamento
      <input type="text" id="apptSetName" placeholder="Nome e cognome" autofocus>
    </label>
    <label class="field">
      Data e ora appuntamento
      <input type="datetime-local" id="apptSetWhen" value="${nowLocal}">
    </label>
    <label class="field">
      Telefono (facoltativo)
      <input type="tel" id="apptSetPhone" placeholder="Per il WhatsApp delle conferme">
    </label>
    <div class="modal-actions">
      <button class="btn-ghost" id="apptSetCancelBtn">Annulla</button>
      <button class="btn-primary" id="apptSetConfirmBtn">Salva</button>
    </div>
  `);

  const nameInput = document.getElementById('apptSetName');
  nameInput.focus();

  document.getElementById('apptSetCancelBtn').addEventListener('click', closeModal);
  document.getElementById('apptSetConfirmBtn').addEventListener('click', () => {
    const name = nameInput.value.trim();
    const when = document.getElementById('apptSetWhen').value;
    if (!name) { showToast('Inserisci il nome dell\'appuntamento.', true); nameInput.focus(); return; }
    if (!when) { showToast('Inserisci data e ora dell\'appuntamento.', true); return; }

    const apt = newAppointment('setter');
    apt.clientName = name;
    apt.scheduledAt = when;
    apt.phone = (document.getElementById('apptSetPhone').value || '').trim() || null;
    // Sessione in cui è stato fissato: serve alla lista sotto gli esiti (vedi renderSessionApptList).
    apt.sourceSessionId = db.activeSession ? db.activeSession.id : null;
    apt.sourceCallId = uiState.pendingApptCallId || null;
    uiState.pendingApptCallId = null;
    // Checklist del lead in chiamata (5.4.3): si salva solo qui, sul fissato.
    if (opts.checklist) {
      apt.checklist = checklistSnapshot(opts.checklist);
      apt.checklistPct = checklistPctOf(apt.checklist);
    }
    db.appointments.unshift(apt);
    if (opts.onSaved) opts.onSaved(apt);
    persist();
    closeModal();
    showToast('Appuntamento aggiunto al CRM.');
    if (db.activeSession && location.hash.indexOf('sessione') !== -1) renderSessioneAttiva();
  });
}

function skipLeadAction() {
  const s = db.activeSession;
  // Se era aperta la finestra "richiamo", Skip la annulla (es. non hai richiamato
  // davvero, o è stato un errore) e si passa al prossimo lead senza contare nulla in più.
  s.retryCallsPending = false;
  s.callAttemptsOnLead = 0;
  s.skips = (s.skips || 0) + 1;
  s.checklist = {}; // lead saltato: la checklist riparte vuota per il prossimo
  persist();
  renderSessioneAttiva();
}

/* ---------- Sessione dimenticata aperta (CORREZIONE 18/10, bug 6) ----------
 * Una sessione aperta un giorno e mai chiusa: all'apertura del tool (e quando cambia
 * il giorno) compare l'avviso "Hai una sessione aperta da ieri: chiudila". Si chiude
 * all'ora dell'ultima chiamata (o all'inizio se non ne ha), NON adesso, così il tempo
 * di sessione non si gonfia. Finché resta aperta, le chiamate automatiche (richiami,
 * conferme, recupero, follow-up Venditore) vanno nella sessione automatica di OGGI. */

/** La sessione aperta, se è stata aperta in un giorno prima di oggi. */
function staleActiveSession() {
  const s = db.activeSession;
  if (!s || !s.startedAt) return null;
  const day = dateInputValue(new Date(s.startedAt));
  return day && day < dateInputValue(new Date()) ? s : null;
}

/** Dove vanno le chiamate fatte fuori dalla schermata della sessione: la sessione aperta,
 * ma non se è di un giorno prima (allora null = sessione automatica di oggi). */
function sessionForNewCalls() {
  return db.activeSession && !staleActiveSession() ? db.activeSession : null;
}

function staleSessionEndIso(s) {
  let end = 0;
  (s.calls || []).forEach(c => { const t = new Date(c.timestamp).getTime(); if (Number.isFinite(t) && t > end) end = t; });
  if (!end) end = new Date(s.startedAt).getTime();
  if (s.pausedAt) {
    // Pausa iniziata prima dell'ultima chiamata: conta fino a lì; dopo, non conta.
    const p = new Date(s.pausedAt).getTime();
    if (Number.isFinite(p) && p < end) s.pausedTotalMs = (s.pausedTotalMs || 0) + (end - p);
    s.pausedAt = null;
  }
  return new Date(end).toISOString();
}

function staleSessionDayLabel(s) {
  const day = dateInputValue(new Date(s.startedAt));
  const y = new Date(); y.setDate(y.getDate() - 1);
  return day === dateInputValue(y) ? 'da ieri' : 'dal ' + fmtDate(s.startedAt);
}

function closeStaleSession() {
  const s = staleActiveSession();
  if (!s) return;
  s.endedAt = staleSessionEndIso(s);
  delete s.checklist;
  db.sessions.push(s);
  db.activeSession = null;
  uiState.sessionMinimized = false;
  persist();
  clearInterval(sessionTimerInterval);
  document.body.classList.remove('in-session');
  showToast('Sessione chiusa alle ' + fmtTime(s.endedAt) + ' del ' + fmtDate(s.endedAt) + '.');
  renderRoute();
}

function renderStaleSessionBanner() {
  const s = staleActiveSession();
  let el = document.getElementById('staleSessionBanner');
  if (!s) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'staleSessionBanner';
    el.className = 'stale-session-banner';
    el.setAttribute('role', 'alert');
    document.getElementById('pageBar').insertAdjacentElement('afterend', el);
  }
  const n = (s.calls || []).length;
  const html = `
    <span class="blink-dot"></span>
    <span class="stale-session-text"><strong>Hai una sessione aperta ${escapeHtml(staleSessionDayLabel(s))}: chiudila.</strong>
      <span class="text-dim">${escapeHtml(s.pipelineName || 'Sessione')} · ${n} chiamat${n === 1 ? 'a' : 'e'}. Si chiude all'ora ${n ? "dell'ultima chiamata" : "d'inizio"}; le chiamate di oggi non ci finiscono dentro.</span></span>
    <button class="btn-ghost" id="btnCloseStaleSession">Chiudi la sessione</button>`;
  if (el.dataset.html !== html) {
    el.dataset.html = html;
    el.innerHTML = html;
    document.getElementById('btnCloseStaleSession').addEventListener('click', closeStaleSession);
  }
}

function endSessionAction() {
  showConfirm('Terminare la sessione? Potrai rivederla nella sezione Sessioni.', () => {
    const s = db.activeSession;
    if (s.pausedAt) {
      // Sessione terminata mentre era in pausa: chiude la pausa aperta prima di
      // salvare, altrimenti quel tratto di tempo non verrebbe mai sottratto.
      s.pausedTotalMs = (s.pausedTotalMs || 0) + Math.max(0, Date.now() - new Date(s.pausedAt).getTime());
      s.pausedAt = null;
    }
    // Sessione dimenticata aperta da un altro giorno: si chiude all'ultima chiamata (bug 6).
    s.endedAt = staleActiveSession() ? staleSessionEndIso(s) : new Date().toISOString();
    delete s.checklist; // stato in corso: non serve nella sessione chiusa
    db.sessions.push(s);
    db.activeSession = null;
    uiState.sessionMinimized = false;
    persist();
    clearInterval(sessionTimerInterval);
    document.body.classList.remove('in-session');
    location.hash = '#/sessioni/' + s.id;
    renderRoute();
  }, { confirmLabel: 'Termina sessione' });
}

/* ============================================================================
 * "Da richiamare" — lead da richiamare programmati durante una sessione (tasto esito
 * "Da richiamare" — vedi logCallAction) o riprogrammati dalla schermata di richiamo
 * stessa (vedi logCallbackCall). Due punti d'accesso per richiamarli:
 * - la colonna laterale della sessione in cui sono nati (vedi renderSessionCallbackSidebar),
 *   finché quella sessione resta aperta;
 * - il filtro "Da richiamare" della lista in Setting > Appuntamenti (renderCallbackListRow),
 *   accessibile in qualunque momento, anche a sessione chiusa o giorni dopo.
 * In entrambi i casi il tasto "Chiama" apre la STESSA schermata a schermo intero
 * (renderCallbackCallScreen, presa in carico da renderRoute() tramite db.callbackCallActiveId
 * con priorità sulla sessione attiva — vedi lì).
 * ==========================================================================*/

// Pipeline "virtuale" usata per le chiamate di richiamo fatte SENZA una sessione attiva in
// quel momento (es. si richiama il giorno dopo, da Setting): non esiste in db.pipelines,
// serve solo per avere una sessione in cui accodare la chiamata ai fini delle statistiche
// (chiamate fatte/lead contattati del giorno) — vedi appendCallbackCallToSession.
const CALLBACK_AUTO_PIPELINE_ID = 'richiami-auto';
const CALLBACK_AUTO_PIPELINE_NAME = 'Richiami';

// "Doppio squillo, non triplo" per le chiamate di richiamo, richiesto esplicitamente
// dall'utente — a differenza di MAX_CALL_ATTEMPTS (3) usato nelle sessioni normali.
const CALLBACK_MAX_CALL_ATTEMPTS = 2;

/**
 * Aggiunge una chiamata di richiamo alla sessione "giusta" ai fini delle statistiche:
 * - se c'è una sessione attiva in questo momento (db.activeSession, qualunque pipeline),
 *   la chiamata entra lì, esattamente come una chiamata normale;
 * - altrimenti entra nella sessione automatica "Richiami" DI OGGI (una per giorno,
 *   creata al bisogno) in db.sessions, così compare comunque nelle statistiche del
 *   giorno in cui la fai davvero, non in quelle della sessione/giorno in cui il lead
 *   era stato originariamente creato.
 */
function appendCallbackCallToSession(callRecord) {
  const live = sessionForNewCalls();
  if (live) {
    live.calls.push(callRecord);
    return;
  }
  const todayKey = dateInputValue(new Date());
  let autoSession = db.sessions.find(s => s.pipelineId === CALLBACK_AUTO_PIPELINE_ID && dateInputValue(s.startedAt) === todayKey);
  if (!autoSession) {
    db.sessionCounter += 1;
    autoSession = {
      id: uid('sess'),
      number: db.sessionCounter,
      pipelineId: CALLBACK_AUTO_PIPELINE_ID,
      pipelineName: CALLBACK_AUTO_PIPELINE_NAME,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      calls: [],
      skips: 0,
      retryCallsPending: false,
      callAttemptsOnLead: 0,
      pausedAt: null,
      pausedTotalMs: 0
    };
    db.sessions.push(autoSession);
  }
  autoSession.calls.push(callRecord);
  autoSession.endedAt = new Date().toISOString();
}

/** Avvia il flusso "Chiama" per un lead "Da richiamare": decide il groupId da usare per
 * questa chiamata (vedi commento su computeStats in utils.js) e apre la schermata. */
function startCallbackCall(callbackId) {
  const cb = (db.callbacks || []).find(c => c.id === callbackId);
  if (!cb) return;
  const todayKey = dateInputValue(new Date());
  cb.inCallGroupId = (cb.createdDateKey === todayKey && cb.leadGroupId) ? cb.leadGroupId : uid('lead');
  cb.inCallAttempts = 0;
  cb.inCallRetryPending = false;
  cb.inCallChecklist = {}; // checklist della richiamata: parte vuota (5.4.3)
  db.callbackCallActiveId = cb.id;
  persist();
  renderRoute();
}

/**
 * Schermata a schermo intero "Chiama" per un singolo lead "Da richiamare" — stesso
 * linguaggio visivo delle sessioni normali (.session-screen/.session-topbar/.outcome-grid),
 * ma per UN lead solo, non per una pipeline intera. Presa in carico da renderRoute() con
 * priorità sulla sessione attiva (se presente, resta "in pausa" finché non si esce da qui).
 * Gli esiti sono quelli della pipeline di origine del lead (quella in cui è nato come "Da
 * richiamare"), così restano coerenti con gli esiti già visti durante la sessione originale.
 */
function renderCallbackCallScreen() {
  document.body.classList.add('in-session');
  const cb = (db.callbacks || []).find(c => c.id === db.callbackCallActiveId);
  if (!cb) { db.callbackCallActiveId = null; renderRoute(); return; }

  const pipeline = db.pipelines.find(p => p.id === cb.sourcePipelineId);
  const outcomes = pipeline ? pipeline.outcomes : defaultOutcomesList();

  const attemptNum = (cb.inCallAttempts || 0) + 1;
  const retryBannerHtml = cb.inCallRetryPending ? `
    <div class="second-call-banner">
      <span class="blink-dot"></span>Richiamo ${attemptNum}ª chiamata — stesso lead
      <span class="scb-hint">Segna l'esito di questo tentativo (max ${CALLBACK_MAX_CALL_ATTEMPTS} tentativi per i richiami).</span>
    </div>` : '';

  const buttonsHtml = outcomes.map(o => `
    <button class="outcome-btn" data-cb-outcome-id="${o.id}">
      ${escapeHtml(o.label)}
      ${o.isNoAnswer && CALLBACK_MAX_CALL_ATTEMPTS > 1 ? `<span class="outcome-btn-sub">attiva richiamo (max ${CALLBACK_MAX_CALL_ATTEMPTS} tentativi)</span>` : ''}
    </button>`).join('');

  appRoot.innerHTML = `
    <div class="session-screen">
      <div class="session-topbar">
        <button id="btnExitCallbackCall" class="btn-danger-ghost">■ Esci</button>
        <div class="session-pipeline-name">📞 Richiamo${pipeline ? ' — ' + escapeHtml(pipeline.name) : ''}</div>
        <div></div>
      </div>
      <div class="session-body">
        <div class="session-main-col">

      <div class="card recov-hero">
        <div class="recov-hero-name">${escapeHtml(cb.leadName || '(senza nome)')}</div>
        <div class="recov-hero-phone-row">
          <span class="recov-hero-phone">${cb.phone ? escapeHtml(cb.phone) : 'Nessun numero salvato'}</span>
          ${cb.phone ? `<button class="crm-copy-phone-btn" id="btnCopyCbPhone" title="Copia numero">⧉</button>` : ''}
        </div>
        <div class="recov-hero-counter">Richiamo programmato per: <strong>${fmtDateTime(cb.scheduledAt)}</strong></div>
        ${callbackLastNoteHtml(cb)}
        <div style="margin-top:10px;">${callbackNotesButton(cb, true)}</div>
      </div>

      ${retryBannerHtml}

      <div class="outcome-grid">${buttonsHtml}</div>
        </div>
        ${renderLiveChecklistPanel(cb.inCallChecklist, { hint: 'Si salva se fissi l\'appuntamento, o se lo confermi (con almeno una voce spuntata).' })}
      </div>
    </div>
  `;
  wireLiveChecklist(appRoot, () => cb.inCallChecklist, items => { cb.inCallChecklist = items; });

  document.getElementById('btnExitCallbackCall').addEventListener('click', () => {
    cb.inCallAttempts = 0;
    cb.inCallRetryPending = false;
    db.callbackCallActiveId = null;
    persist();
    renderRoute();
  });

  wireCallbackNotesButtons(appRoot, renderCallbackCallScreen);

  const copyBtn = document.getElementById('btnCopyCbPhone');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const ok = await copyToClipboard(cb.phone);
      showToast(ok ? 'Numero copiato.' : 'Seleziona e copia manualmente.', !ok);
    });
  }

  appRoot.querySelectorAll('[data-cb-outcome-id]').forEach(btn => {
    btn.addEventListener('click', () => logCallbackCall(btn.dataset.cbOutcomeId));
  });
}

/**
 * Esito di una chiamata di richiamo. Stessa logica di base di logCallAction (richiamo
 * immediato su "nessuna risposta", fino a CALLBACK_MAX_CALL_ATTEMPTS), con due differenze:
 * - la chiamata viene accodata alla sessione "giusta" (vedi appendCallbackCallToSession),
 *   non necessariamente a db.activeSession;
 * - se l'esito finale è di nuovo "Da richiamare", NON si esce: si riapre la tendina per
 *   riprogrammare il richiamo (il lead resta 'pending'). Per qualunque altro esito finale
 *   (compreso "nessuna risposta" dopo aver esaurito i tentativi) il lead viene segnato
 *   'done' e si esce subito dalla schermata, come richiesto esplicitamente dall'utente.
 */
function logCallbackCall(outcomeId) {
  const cb = (db.callbacks || []).find(c => c.id === db.callbackCallActiveId);
  if (!cb) return;
  const pipeline = db.pipelines.find(p => p.id === cb.sourcePipelineId);
  const outcomes = pipeline ? pipeline.outcomes : defaultOutcomesList();
  const outcome = outcomes.find(o => o.id === outcomeId);
  if (!outcome) return;

  const isRetryAttempt = !!cb.inCallRetryPending;
  // Stato del richiamo prima di questa chiamata: serve ad "Annulla ultimo esito" se la
  // chiamata finisce nella sessione aperta e salva la checklist in conferma.
  const cbBefore = {};
  CALLBACK_UNDO_FIELDS.forEach(k => { cbBefore[k] = cb[k]; });
  // Checklist (5.4.3): passa alla modale solo se nasce un appuntamento; con ogni altro
  // esito si azzera. Con l'esito di conferma (Simone, 18/10) si salva sull'appuntamento
  // confermato, come in sessione (saveCallbackConfirmChecklist).
  const checklistNow = Object.assign({}, cb.inCallChecklist || {});
  if (outcome.label !== APPOINTMENT_SET_OUTCOME_LABEL) cb.inCallChecklist = null;

  const callRecord = {
    id: uid('call'),
    timestamp: new Date().toISOString(),
    outcomeId: outcome.id,
    outcomeLabel: outcome.label,
    isConversion: !!outcome.isConversion,
    isNoAnswer: !!outcome.isNoAnswer,
    isSecondAttempt: isRetryAttempt,
    groupId: cb.inCallGroupId,
    isCallbackCall: true
  };
  appendCallbackCallToSession(callRecord);

  cb.callCount = (cb.callCount || 0) + 1;
  cb.lastCalledAt = callRecord.timestamp;

  const attemptsSoFar = isRetryAttempt ? (cb.inCallAttempts || 1) + 1 : 1;
  cb.inCallAttempts = attemptsSoFar;
  const canRetry = !!outcome.isNoAnswer && attemptsSoFar < CALLBACK_MAX_CALL_ATTEMPTS;
  cb.inCallRetryPending = canRetry;

  if (canRetry) {
    persist();
    renderCallbackCallScreen();
    return;
  }

  if (outcome.label === CALLBACK_OUTCOME_LABEL) {
    // Esito "Da richiamare" di nuovo: riprogramma invece di chiudere — riapre la stessa
    // tendina usata alla creazione, precompilata, per scegliere il nuovo quando.
    cb.inCallAttempts = 0;
    persist();
    openCallbackModal({
      mode: 'reschedule',
      existingCallbackId: cb.id,
      afterSave: () => { db.callbackCallActiveId = null; persist(); renderRoute(); }
    });
    return;
  }

  cb.status = 'done';
  cb.resolvedOutcomeLabel = outcome.label;
  cb.resolvedAt = callRecord.timestamp;
  cb.inCallAttempts = 0;
  cb.inCallRetryPending = false;
  db.callbackCallActiveId = null;
  persist();
  renderRoute();

  if (outcome.label === APPOINTMENT_SET_OUTCOME_LABEL) {
    openAppointmentSetModal({ checklist: checklistNow, onSaved: () => { cb.inCallChecklist = null; } });
  } else if (isConfirmOutcomeDef(outcome) && checklistHasAny(checklistNow)) {
    saveCallbackConfirmChecklist(cb, callRecord, checklistNow, cbBefore);
  }
}

/* Checklist con l'esito di conferma in una RICHIAMATA (Simone, 18/10/2026): stessa regola
 * della sessione. Si salva solo con almeno una voce, in unione (mergeChecklistIntoAppt).
 * Collegamento sicuro (stesso telefono, un solo candidato) → salva subito; altrimenti
 * "Quale appuntamento?" con la ricerca già sul nome del richiamo. Se la chiamata è finita
 * nella sessione aperta, "Annulla ultimo esito" la toglie, rimette la checklist
 * dell'appuntamento com'era e riporta il richiamo tra i Da richiamare. Senza sessione
 * aperta (sessione automatica "Richiami") non c'è il tasto, come per ogni richiamata. */
const CALLBACK_UNDO_FIELDS = ['status', 'resolvedOutcomeLabel', 'resolvedAt', 'callCount', 'lastCalledAt'];
function saveCallbackConfirmChecklist(cb, callRecord, items, cbBefore) {
  const onSaved = (before) => {
    const s = db.activeSession;
    if (!before || !s || s.calls[s.calls.length - 1] !== callRecord) return;
    callRecord.undoState = {
      retryCallsPending: s.retryCallsPending,
      callAttemptsOnLead: s.callAttemptsOnLead,
      currentLeadGroupId: s.currentLeadGroupId,
      apptChecklist: before,
      callback: Object.assign({ id: cb.id }, cbBefore)
    };
  };
  const sure = sureConfirmApptForPhone(cb.phone);
  if (sure) {
    onSaved(mergeChecklistIntoAppt(sure, items), sure);
    persist();
    showToast(`Checklist salvata su ${sure.clientName || '(senza nome)'} (${CHECKLIST_ITEMS.filter(it => sure.checklist[it.id]).length}/${CHECKLIST_ITEMS.length}).`);
    renderRoute();
    return;
  }
  const q = cb.leadName || '';
  openConfirmChecklistPickModal(callRecord.id, items, {
    initialQuery: confirmChecklistCandidates().some(a => matchesApptSearch(a, q)) ? q : '',
    onSaved
  });
}

/** Calcola la data/ora per i quick button della tendina "Da richiamare" — 'custom' non ha
 * un valore precalcolato, lascia che sia l'utente a scegliere manualmente. */
function computeQuickCallbackTime(key) {
  const now = new Date();
  if (key === '10m') return localDateTimeValue(new Date(now.getTime() + 10 * 60000));
  if (key === '1h') return localDateTimeValue(new Date(now.getTime() + 60 * 60000));
  if (key === 'afternoon') { const d = new Date(now); d.setHours(15, 0, 0, 0); return localDateTimeValue(d); }
  if (key === 'tomorrow') { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return localDateTimeValue(d); }
  if (key === 'nextweek') { const d = startOfWeek(now); d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); return localDateTimeValue(d); }
  return null;
}

/**
 * Tendina "Da richiamare": due modalità.
 * - 'create' (opts.groupId/sourceSessionId/sourcePipelineId/sourcePipelineName): chiede
 *   nome e telefono del lead (nuova entry in db.callbacks), usata quando si preme l'esito
 *   "Da richiamare" durante una sessione normale (vedi logCallAction).
 * - 'reschedule' (opts.existingCallbackId): nome/telefono restano quelli già salvati,
 *   si cambia solo quando richiamarlo — usata quando l'esito "Da richiamare" viene scelto
 *   di nuovo dentro la schermata "Chiama" stessa (vedi logCallbackCall).
 * In entrambi i casi: quick button + un campo data/ora libero per un orario personalizzato.
 */
function openCallbackModal(opts) {
  opts = opts || {};
  const isReschedule = opts.mode === 'reschedule';
  const defaultWhen = computeQuickCallbackTime('1h');

  openModal(`
    <h3>${isReschedule ? 'Richiama più tardi' : 'Da richiamare'}</h3>
    <p class="text-dim" style="font-size:0.85rem;">Quando vuoi essere ricordato di richiamare questo lead?</p>
    ${!isReschedule ? `
    <label class="field">Nome lead<input type="text" id="cbName" placeholder="Nome e cognome" value="${escapeHtml(opts.prefillName || '')}" autofocus></label>
    <label class="field">Telefono (facoltativo)<input type="text" id="cbPhone" placeholder="Numero di telefono" value="${escapeHtml(opts.prefillPhone || '')}"></label>
    <button type="button" class="btn-ghost cb-notes-toggle" id="cbNotesToggle">📒 Note</button>
    <label class="field" id="cbNoteField" style="display:none;">Nota sul lead<textarea id="cbNote" rows="3" placeholder="Es. richiamare dopo le 18, vuole sapere i prezzi…"></textarea></label>
    ` : ''}
    <div class="field">
      <span>Quando</span>
      <div class="chip-select-row">
        <button class="chip-select" data-quick-time="10m">Fra 10 minuti</button>
        <button class="chip-select active" data-quick-time="1h">Fra 1 ora</button>
        <button class="chip-select" data-quick-time="afternoon">Oggi pomeriggio</button>
        <button class="chip-select" data-quick-time="tomorrow">Domani</button>
        <button class="chip-select" data-quick-time="nextweek">Settimana prossima</button>
        <button class="chip-select" data-quick-time="custom">Data/ora personalizzata</button>
      </div>
    </div>
    <label class="field">Data e ora richiamo<input type="datetime-local" id="cbWhen" value="${defaultWhen}"></label>
    <div class="modal-actions">
      <button class="btn-ghost" id="cbCancelBtn">Annulla</button>
      <button class="btn-primary" id="cbConfirmBtn">Salva</button>
    </div>
  `);

  const nameInput = document.getElementById('cbName');
  if (nameInput) nameInput.focus();
  const notesToggle = document.getElementById('cbNotesToggle');
  if (notesToggle) {
    notesToggle.addEventListener('click', () => {
      document.getElementById('cbNoteField').style.display = '';
      notesToggle.style.display = 'none';
      document.getElementById('cbNote').focus();
    });
  }

  modalRoot.querySelectorAll('[data-quick-time]').forEach(btn => {
    btn.addEventListener('click', () => {
      modalRoot.querySelectorAll('[data-quick-time]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const key = btn.dataset.quickTime;
      if (key === 'custom') { document.getElementById('cbWhen').focus(); return; }
      const val = computeQuickCallbackTime(key);
      if (val) document.getElementById('cbWhen').value = val;
    });
  });

  document.getElementById('cbCancelBtn').addEventListener('click', () => {
    closeModal();
    if (typeof opts.onCancel === 'function') opts.onCancel();
    if (isReschedule) {
      db.callbackCallActiveId = null;
      persist();
      renderRoute();
    }
  });

  document.getElementById('cbConfirmBtn').addEventListener('click', () => {
    const when = document.getElementById('cbWhen').value;
    if (!when) { showToast('Scegli quando richiamarlo.', true); return; }
    let savedCallback = null;

    if (isReschedule) {
      const cb = (db.callbacks || []).find(c => c.id === opts.existingCallbackId);
      if (!cb) { closeModal(); return; }
      cb.scheduledAt = when;
      // Il lead "di oggi" è quello della chiamata appena fatta: un richiamo più tardi oggi
      // deve riusare QUEL groupId, non quello del giorno in cui era nato (bug 13/10).
      if (cb.inCallGroupId) cb.leadGroupId = cb.inCallGroupId;
      cb.createdDateKey = dateInputValue(new Date());
      cb.createdAt = new Date().toISOString();
      cb.status = 'pending';
      cb.inCallAttempts = 0;
      cb.inCallRetryPending = false;
      persist();
      closeModal();
      showToast('Richiamo riprogrammato.');
    } else {
      const name = document.getElementById('cbName').value.trim();
      if (!name) { showToast('Inserisci il nome del lead.', true); document.getElementById('cbName').focus(); return; }
      const phone = document.getElementById('cbPhone').value.trim();
      const noteText = document.getElementById('cbNote').value.trim();
      db.callbacks = db.callbacks || [];
      // Note già scritte altrove (Round Recupero): passano nel richiamo, prima di quella nuova.
      const oldNotes = (opts.prefillNotes || []).map(n => Object.assign({}, n));
      db.callbacks.push({
        id: uid('callback'),
        leadName: name,
        phone: phone || null,
        scheduledAt: when,
        createdAt: new Date().toISOString(),
        createdDateKey: dateInputValue(new Date()),
        leadGroupId: opts.groupId || null,
        sourcePipelineId: opts.sourcePipelineId || null,
        sourcePipelineName: opts.sourcePipelineName || '',
        sourceSessionId: opts.sourceSessionId || null,
        sourceCallId: opts.sourceCallId || null,
        status: 'pending',
        callCount: 0,
        lastCalledAt: null,
        inCallAttempts: 0,
        inCallRetryPending: false,
        inCallGroupId: null,
        resolvedOutcomeLabel: null,
        resolvedAt: null,
        notes: oldNotes.concat(noteText ? [{ id: uid('nota'), text: noteText, createdAt: new Date().toISOString() }] : [])
      });
      savedCallback = db.callbacks[db.callbacks.length - 1];
      persist();
      closeModal();
      showToast('Richiamo programmato.');
    }

    if (typeof opts.afterSave === 'function') opts.afterSave(savedCallback);
  });
}

/* ---------- Note dei "Da richiamare" (richiesta di Hamza, 2026-10-14) ---------- */

/** Quadernino 📒 con il numero di note. `big` = versione con scritta, per la schermata di richiamata. */
function callbackNotesButton(cb, big) {
  const n = (cb.notes || []).length;
  const label = big ? `📒 Note${n ? ' (' + n + ')' : ''}` : `📒${n ? '<span class="cb-notes-count">' + n + '</span>' : ''}`;
  return `<button class="${big ? 'btn-ghost' : 'callback-edit-btn'}" data-callback-notes="${cb.id}" title="Note sul lead">${label}</button>`;
}

/** L'ultima nota scritta, visibile subito durante la richiamata. */
function callbackLastNoteHtml(cb) {
  const notes = cb.notes || [];
  if (!notes.length) return '';
  const last = [...notes].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  return `<div class="cb-last-note">📒 ${escapeHtml(last.text)}</div>`;
}

function wireCallbackNotesButtons(root, onClose) {
  root.querySelectorAll('[data-callback-notes]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cb = (db.callbacks || []).find(c => c.id === btn.dataset.callbackNotes);
      if (cb) openNotesEditor(cb, cb.leadName, onClose);
    });
  });
}

/** Cestino 🗑 su un "Da richiamare" (Simone, 2026-10-09): lo toglie dalla lista quando
 * non vuoi più richiamarlo. Non lo cancella dai dati: passa a status 'removed', così le
 * chiamate già fatte restano nelle statistiche. */
function removeCallback(callbackId, onDone) {
  const cb = (db.callbacks || []).find(c => c.id === callbackId);
  if (!cb) return;
  showConfirm(`Togliere "${cb.leadName || "(senza nome)"}" dai da richiamare?`, () => {
    cb.status = 'removed';
    persist();
    showToast('Tolto dai da richiamare.');
    if (onDone) onDone();
  }, { confirmLabel: 'Togli' });
}

/* ---------- Notifiche delle richiamate (restyling 5.4.2) ----------
 * Un timer globale (avviato in startForUser, ogni 20 s) guarda i "Da richiamare" di OGGI
 * ancora in attesa con ora ≤ adesso e mostra una notifica in alto a destra, su qualsiasi
 * pagina (anche in sessione, nei round e durante un'altra richiamata). Tool aperto dopo
 * l'ora = la notifica compare subito. Funziona solo con il tool aperto in una scheda.
 * - Clic sulla notifica → startCallbackCall (schermata di richiamata).
 * - X → cb.dismissedAt: non torna più per quell'ora fissata. Se il richiamo viene spostato
 *   a un'ora dopo, la nuova ora è dopo dismissedAt e la notifica torna (è un altro richiamo).
 * - Notifica di sistema (Notification API): una volta sola per ora fissata (cb.notifiedAt),
 *   solo se il permesso è stato dato col tasto in 👤 Account. */
const CALLBACK_NOTIFY_EVERY_MS = 20000;
let callbackNotifyTimer = null;

/** "Da richiamare" in attesa fissati per oggi, in ordine di ora (sessione e notifiche). */
function todayPendingCallbacks() {
  const todayKey = dateInputValue(new Date());
  return (db.callbacks || [])
    .filter(c => c.status === 'pending' && c.scheduledAt && dateInputValue(new Date(c.scheduledAt)) === todayKey)
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
}

/** Vero se il segno (dismissedAt / notifiedAt) vale per l'ora fissata ATTUALE del richiamo. */
function callbackMarkCovers(cb, field) {
  if (!cb[field]) return false;
  return new Date(cb[field]).getTime() >= new Date(cb.scheduledAt).getTime();
}

/** I richiami da notificare adesso (escluso quello che si sta già chiamando). */
function dueCallbackNotifications() {
  const now = Date.now();
  return todayPendingCallbacks().filter(cb =>
    new Date(cb.scheduledAt).getTime() <= now &&
    cb.id !== db.callbackCallActiveId &&
    !callbackMarkCovers(cb, 'dismissedAt'));
}

function callbackNotifyRoot() {
  let root = document.getElementById('cbNotifyStack');
  if (!root) {
    root = document.createElement('div');
    root.id = 'cbNotifyStack';
    root.className = 'cb-notify-stack';
    root.setAttribute('aria-live', 'polite');
    document.body.appendChild(root);
    root.addEventListener('click', onCallbackNotifyClick);
  }
  return root;
}

/** Ridisegna la pila delle notifiche (chiamata dal timer, da renderRoute e da persist). */
function refreshCallbackNotifications() {
  if (!callbackNotifyTimer || !db) return;
  const due = dueCallbackNotifications();
  const root = callbackNotifyRoot();
  const html = due.map(cb => `
    <div class="cb-notify" data-cb-notify-card="${cb.id}" role="group" aria-label="Richiamo">
      <button type="button" class="cb-notify-open" data-cb-notify="${cb.id}" title="Apri la richiamata">
        <span class="cb-notify-ico" aria-hidden="true">${taskIconSvg('phone')}</span>
        <span class="cb-notify-main">
          <span class="cb-notify-title">Richiama <strong>${escapeHtml(cb.leadName || '(senza nome)')}</strong> adesso</span>
          <span class="cb-notify-sub">ore ${fmtTime(cb.scheduledAt)}</span>
        </span>
      </button>
      <button type="button" class="cb-notify-close" data-cb-notify-close="${cb.id}" aria-label="Chiudi la notifica" title="Chiudi">×</button>
    </div>`).join('');
  if (root.dataset.html !== html) { root.innerHTML = html; root.dataset.html = html; }
  showSystemCallbackNotifications(due);
}

function showSystemCallbackNotifications(due) {
  if (typeof window.Notification === 'undefined' || Notification.permission !== 'granted') return;
  let changed = false;
  due.forEach(cb => {
    if (callbackMarkCovers(cb, 'notifiedAt')) return;
    cb.notifiedAt = new Date().toISOString();
    changed = true;
    try {
      const n = new Notification('Richiama ' + (cb.leadName || '(senza nome)') + ' adesso', { body: 'ore ' + fmtTime(cb.scheduledAt), tag: 'cb-' + cb.id });
      n.onclick = () => { try { window.focus(); } catch (e) {} openCallbackFromNotification(cb.id); n.close(); };
    } catch (e) { /* alcuni browser (es. Chrome su telefono) non le creano da qui: resta quella nella pagina */ }
  });
  if (changed) { Storage.save(db); CloudSync.schedule(); }
}

/** Clic su una notifica: avvia la richiamata (chiude un'eventuale modale aperta). */
function openCallbackFromNotification(cbId) {
  const cb = (db.callbacks || []).find(c => c.id === cbId);
  if (!cb || cb.status !== 'pending') { refreshCallbackNotifications(); return; }
  // Se stavo già richiamando un altro lead, lo lascio come se avessi premuto "Esci".
  const prev = db.callbackCallActiveId && (db.callbacks || []).find(c => c.id === db.callbackCallActiveId);
  if (prev && prev.id !== cb.id) { prev.inCallAttempts = 0; prev.inCallRetryPending = false; }
  cb.dismissedAt = new Date().toISOString(); // aperta = gestita: non torna dopo la richiamata
  if (modalRoot.innerHTML) closeModal();
  startCallbackCall(cb.id);
}

function onCallbackNotifyClick(e) {
  const close = e.target.closest('[data-cb-notify-close]');
  if (close) {
    e.stopPropagation();
    const cb = (db.callbacks || []).find(c => c.id === close.dataset.cbNotifyClose);
    if (cb) { cb.dismissedAt = new Date().toISOString(); persist(); }
    return;
  }
  // CORREZIONE (18/10, bug 9): niente più pulsante dentro un pulsante. La notifica è un
  // gruppo con due pulsanti fratelli (apri / chiudi); un clic sul bordo apre lo stesso.
  const open = e.target.closest('[data-cb-notify]');
  const card = e.target.closest('[data-cb-notify-card]');
  if (open) openCallbackFromNotification(open.dataset.cbNotify);
  else if (card) openCallbackFromNotification(card.dataset.cbNotifyCard);
}

function startCallbackNotifications() {
  if (callbackNotifyTimer) return;
  // Lo stesso giro controlla anche se è cambiato il giorno con una sessione aperta (bug 6).
  callbackNotifyTimer = setInterval(() => { refreshCallbackNotifications(); renderStaleSessionBanner(); }, CALLBACK_NOTIFY_EVERY_MS);
  callbackNotifyRoot(); // Invio e spazio li gestisce il pulsante stesso
  refreshCallbackNotifications();
}

/** Riga "Notifiche di sistema" in 👤 Account: il permesso si chiede solo da qui. */
function systemNotifyStateHtml() {
  if (typeof window.Notification === 'undefined') return '<span class="text-dim">Questo browser non le supporta. Restano quelle dentro il tool.</span>';
  if (Notification.permission === 'granted') return '<span class="text-dim">Attive ✓</span>';
  if (Notification.permission === 'denied') return '<span class="text-dim">Bloccate: riattivale dalle impostazioni del browser.</span>';
  return '<button type="button" class="btn-ghost btn-sm" id="btnAskNotify">Attiva</button>';
}
function accountNotifyHtml() {
  return `
    <div class="account-notify">
      <div>
        <div class="account-notify-title">🔔 Notifiche di sistema</div>
        <div class="text-dim account-notify-sub">Avvisano all'ora dei Da richiamare anche se stai guardando un'altra finestra. Solo con il tool aperto in una scheda.</div>
      </div>
      <div class="account-notify-state" id="accountNotifyState">${systemNotifyStateHtml()}</div>
    </div>`;
}
function wireAccountNotify() {
  const box = document.getElementById('accountNotifyState');
  if (!box) return;
  box.addEventListener('click', async e => {
    if (!e.target.closest('#btnAskNotify')) return;
    try {
      const r = Notification.requestPermission();
      if (r && r.then) await r;
    } catch (err) { /* vecchi Safari: solo callback, ignorato */ }
    box.innerHTML = systemNotifyStateHtml();
    refreshCallbackNotifications();
  });
}

/**
 * Tasto "↶ Annulla ultimo esito" in sessione (richiesta di Hamza, 2026-10-12): cancella
 * l'ultima chiamata segnata con i bottoni degli esiti e rimette il giro com'era prima
 * (lead in corso, richiamo immediato, tentativi). Se quell'esito aveva creato un "Da
 * richiamare" o un appuntamento, li toglie insieme. Si può premere più volte di fila.
 * Non vale per le chiamate del Round Conferme o dei richiami (non hanno undoState), tranne
 * la richiamata con esito di conferma che ha salvato la checklist (saveCallbackConfirmChecklist).
 */
function undoLastCallAction() {
  const s = db.activeSession;
  if (!s || !s.calls.length) return;
  const call = s.calls[s.calls.length - 1];
  if (!call.undoState) return;
  const linkedCbs = (db.callbacks || []).filter(c => c.sourceCallId === call.id);
  const linkedApts = (db.appointments || []).filter(a => a.sourceCallId === call.id);
  const extra = [];
  if (linkedCbs.length) extra.push(`il "Da richiamare" di ${linkedCbs.map(c => c.leadName || '(senza nome)').join(', ')}`);
  if (linkedApts.length) extra.push(`l'appuntamento di ${linkedApts.map(a => a.clientName || '(senza nome)').join(', ')}`);
  const ckApt = call.undoState.apptChecklist && db.appointments.find(a => a.id === call.undoState.apptChecklist.apptId);
  if (ckApt) extra.push(`la checklist salvata su ${ckApt.clientName || '(senza nome)'}`);
  const undoCb = call.undoState.callback && (db.callbacks || []).find(c => c.id === call.undoState.callback.id);
  if (undoCb) extra.push(`l'esito del richiamo di ${undoCb.leadName || '(senza nome)'} (torna da richiamare)`);
  const msg = `Annullare l'ultimo esito "${call.outcomeLabel}"?` + (extra.length ? ` Verrà tolto anche ${extra.join(' e ')}.` : '');
  showConfirm(msg, () => {
    s.calls.pop();
    s.retryCallsPending = call.undoState.retryCallsPending;
    s.callAttemptsOnLead = call.undoState.callAttemptsOnLead;
    s.currentLeadGroupId = call.undoState.currentLeadGroupId;
    if (call.undoState.checklist) s.checklist = Object.assign({}, call.undoState.checklist);
    // Checklist salvata con "conferma appuntamento": l'appuntamento torna com'era.
    if (call.undoState.apptChecklist) restoreApptChecklist(call.undoState.apptChecklist);
    // Richiamata (conferma con checklist): il richiamo torna com'era prima della chiamata.
    if (undoCb) {
      CALLBACK_UNDO_FIELDS.forEach(k => {
        if (call.undoState.callback[k] === undefined) delete undoCb[k]; else undoCb[k] = call.undoState.callback[k];
      });
      undoCb.inCallAttempts = 0;
      undoCb.inCallRetryPending = false;
    }
    if (linkedCbs.length) db.callbacks = db.callbacks.filter(c => c.sourceCallId !== call.id);
    if (linkedApts.length) {
      // CORREZIONE (19/10): come ⋯ → Elimina. Se intanto l'appuntamento era finito nel Round
      // Recupero (No show / Annullato) la voce si chiude, e un eventuale spostato si scollega:
      // prima restava una voce attiva di un appuntamento che non esiste più.
      linkedApts.forEach(a => { unlinkRescheduleOnDelete(a); deactivateRecoveryEntryForAppointment(a); });
      db.appointments = db.appointments.filter(a => a.sourceCallId !== call.id);
    }
    persist();
    showToast('Esito annullato.');
    renderSessioneAttiva();
  }, { confirmLabel: 'Annulla esito', cancelLabel: 'Lascia così' });
}

/** Pennetta ✎ su un "Da richiamare" (Simone, 2026-10-08): corregge nome, telefono e
 * data/ora del richiamo se erano stati inseriti sbagliati. Non tocca storico e stato. */
function openEditCallbackModal(callbackId, onDone) {
  const cb = (db.callbacks || []).find(c => c.id === callbackId);
  if (!cb) return;
  const pad = (n) => String(n).padStart(2, '0');
  const d = cb.scheduledAt ? new Date(cb.scheduledAt) : null;
  const whenVal = d && !isNaN(d) ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` : '';
  openModal(`
    <h3>Modifica lead da richiamare</h3>
    <label class="field">Nome lead<input type="text" id="cbEditName" value="${escapeHtml(cb.leadName || '')}"></label>
    <label class="field">Telefono<input type="text" id="cbEditPhone" value="${escapeHtml(cb.phone || '')}"></label>
    <label class="field">Data e ora richiamo<input type="datetime-local" id="cbEditWhen" value="${whenVal}"></label>
    <div class="modal-actions">
      <button class="btn-ghost" id="cbEditCancel">Annulla</button>
      <button class="btn-primary" id="cbEditSave">Salva</button>
    </div>
  `);
  document.getElementById('cbEditName').focus();
  document.getElementById('cbEditCancel').addEventListener('click', () => { closeModal(); if (onDone) onDone(); });
  document.getElementById('cbEditSave').addEventListener('click', () => {
    const name = document.getElementById('cbEditName').value.trim();
    if (!name) { showToast('Inserisci il nome del lead.', true); return; }
    const when = document.getElementById('cbEditWhen').value;
    cb.leadName = name;
    cb.phone = document.getElementById('cbEditPhone').value.trim() || null;
    if (when) cb.scheduledAt = when;
    persist();
    closeModal();
    showToast('Dati del lead aggiornati.');
    if (onDone) onDone();
  });
}

/* ---------- Modale "Nuova sessione" ---------- */

let npStep = 'pick';
let npSelectedPipelineId = null;
let npDraft = null;

/* Finestre modali (CORREZIONE 18/10, bug 9): role="dialog" + aria-modal, titolo collegato,
 * il fuoco entra nella finestra (primo campo, o la finestra stessa), Tab gira dentro,
 * Esc la chiude (come il clic fuori), e alla chiusura il fuoco torna dov'era. */
let modalReturnFocus = null;
const MODAL_FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function openModal(html) {
  const reopening = !!modalRoot.innerHTML; // stessa finestra ridisegnata (es. Rate dopo una modifica)
  if (!reopening) modalReturnFocus = document.activeElement;
  modalRoot.innerHTML = `<div class="modal-overlay" id="modalOverlay"><div class="modal-box" role="dialog" aria-modal="true" tabindex="-1">${html}</div></div>`;
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') closeModal();
  });
  const box = modalRoot.querySelector('.modal-box');
  const title = box.querySelector('h1, h2, h3, h4');
  if (title) {
    if (!title.id) title.id = 'modalTitle';
    box.setAttribute('aria-labelledby', title.id);
  } else {
    box.setAttribute('aria-label', 'Finestra');
  }
  const first = box.querySelector('input:not([disabled]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), select:not([disabled]), textarea:not([disabled])');
  // Sul telefono niente fuoco sul campo (aprirebbe la tastiera): va sulla finestra.
  let finePointer = true;
  try { finePointer = window.matchMedia('(pointer: fine)').matches; } catch (e) { /* niente */ }
  try { ((finePointer && !reopening && first) || box).focus({ preventScroll: true }); } catch (e) { /* niente */ }
}

function closeModal() {
  const hadModal = !!modalRoot.innerHTML;
  modalRoot.innerHTML = '';
  const back = modalReturnFocus;
  modalReturnFocus = null;
  if (hadModal && back && back !== document.body && document.contains(back) && typeof back.focus === 'function') {
    try { back.focus({ preventScroll: true }); } catch (e) { /* niente */ }
  }
}

document.addEventListener('keydown', e => {
  const box = modalRoot.querySelector('.modal-box');
  if (!box) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    closeModal();
    return;
  }
  if (e.key !== 'Tab') return;
  const items = [...box.querySelectorAll(MODAL_FOCUSABLE)].filter(el => el.offsetParent !== null || el === document.activeElement);
  if (!items.length) { e.preventDefault(); box.focus(); return; }
  const firstEl = items[0], lastEl = items[items.length - 1];
  if (!box.contains(document.activeElement)) { e.preventDefault(); firstEl.focus(); }
  else if (e.shiftKey && (document.activeElement === firstEl || document.activeElement === box)) { e.preventDefault(); lastEl.focus(); }
  else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
});

/**
 * Conferma "sì/no" nello stile della pagina, al posto di window.confirm().
 * Necessario perché i dialog nativi del browser (confirm/alert) non sono
 * affidabili quando la pagina gira dentro un iframe sandbox (es. anteprima
 * Artifact): lì restano bloccati e il bottone sembra "non fare niente".
 */
function showConfirm(message, onConfirm, options) {
  options = options || {};
  const confirmLabel = options.confirmLabel || 'Conferma';
  const cancelLabel = options.cancelLabel || 'Annulla';
  openModal(`
    <p style="margin-bottom:18px;">${escapeHtml(message)}</p>
    <div class="modal-actions">
      <button class="btn-ghost" id="confirmCancelBtn">${escapeHtml(cancelLabel)}</button>
      <button class="btn-danger-ghost" id="confirmOkBtn">${escapeHtml(confirmLabel)}</button>
    </div>
  `);
  document.getElementById('confirmCancelBtn').addEventListener('click', closeModal);
  document.getElementById('confirmOkBtn').addEventListener('click', () => {
    closeModal();
    onConfirm();
  });
}

/** Piccolo messaggio temporaneo, al posto di window.alert() (stesso motivo di showConfirm). */
function showToast(message, isError) {
  let toast = document.getElementById('appToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = 'toast show' + (isError ? ' toast-error' : '');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => { toast.className = 'toast'; }, 3000);
}

function openNewSessionModal() {
  npStep = 'pick';
  npSelectedPipelineId = null;
  npDraft = null;
  renderModal();
}

function renderModal() {
  const html = npStep === 'pick' ? renderPickStep(npSelectedPipelineId) : renderCreateStep(npDraft);
  openModal(html);
  wireModalEvents();
}

function renderPickStep(selectedId) {
  const tiles = db.pipelines.map(p => `
    <div class="pipeline-tile ${p.id === selectedId ? 'selected' : ''}" data-pid="${p.id}">
      <button class="pipeline-tile-delete" data-del-pid="${p.id}" title="Elimina pipeline">×</button>
      <div class="pipeline-tile-name">${escapeHtml(p.name)}</div>
      <div class="pipeline-tile-meta">${p.outcomes.length} esiti</div>
    </div>`).join('');
  return `
    <h3>Quale pipeline vuoi chiamare?</h3>
    <div class="pipeline-grid">
      ${tiles}
      <div class="pipeline-tile pipeline-tile-add" data-new-pipeline="1">
        <div class="plus">+</div>
        <div>Nuova pipeline</div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn-ghost" data-close-modal="1">Annulla</button>
      <button class="btn-primary" id="btnStartSession" ${selectedId ? '' : 'disabled'}>Inizia sessione</button>
    </div>
  `;
}

function renderCreateStep(draft) {
  const chips = draft.outcomes.map(o => `
    <div class="outcome-chip" data-oid="${o.id}">
      <span>${escapeHtml(o.label)}</span>
      ${o.isConversion ? '<span class="tag tag-conv">appuntamento</span>' : ''}
      ${o.isNoAnswer ? '<span class="tag tag-x2">2ª chiamata</span>' : ''}
      <button class="chip-remove" data-remove-oid="${o.id}">×</button>
    </div>`).join('');
  return `
    <h3>Nuova pipeline</h3>
    <label class="field">
      Nome pipeline
      <input type="text" id="npName" placeholder="Es. Lead Instagram Agosto" value="${escapeHtml(draft.name)}">
    </label>
    <div class="field">
      <span>Esiti</span>
      <div class="outcome-chip-list">${chips || '<span class="text-dim">Nessun esito, aggiungine almeno uno</span>'}</div>
    </div>
    <div class="add-outcome-row">
      <input type="text" id="npNewOutcomeLabel" placeholder="Nuovo esito personalizzato">
      <label class="checkbox-inline"><input type="checkbox" id="npNewOutcomeConv"> conta come appuntamento</label>
      <label class="checkbox-inline"><input type="checkbox" id="npNewOutcomeNoAnswer"> nessuna risposta (attiva 2ª chiamata)</label>
      <button class="btn-ghost" id="btnAddOutcome">+ Aggiungi esito</button>
    </div>
    <div class="modal-actions">
      <button class="btn-ghost" id="btnBackToPick">← Indietro</button>
      <button class="btn-primary" id="btnCreatePipeline">Crea pipeline e inizia sessione</button>
    </div>
  `;
}

function wireModalEvents() {
  modalRoot.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', closeModal));

  if (npStep === 'pick') {
    modalRoot.querySelectorAll('.pipeline-tile[data-pid]').forEach(tile => {
      tile.addEventListener('click', (e) => {
        if (e.target.closest('[data-del-pid]')) return;
        npSelectedPipelineId = tile.dataset.pid;
        renderModal();
      });
    });
    modalRoot.querySelectorAll('[data-del-pid]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pid = btn.dataset.delPid;
        const p = db.pipelines.find(x => x.id === pid);
        if (!p) return;
        showConfirm(`Eliminare la pipeline "${p.name}"? Le sessioni già registrate restano salvate.`, () => {
          db.pipelines = db.pipelines.filter(x => x.id !== pid);
          if (npSelectedPipelineId === pid) npSelectedPipelineId = null;
          if (uiState.pipelineFilter === pid) uiState.pipelineFilter = 'all';
          persist();
          renderModal();
        }, { confirmLabel: 'Elimina' });
      });
    });
    const addTile = modalRoot.querySelector('[data-new-pipeline]');
    if (addTile) addTile.addEventListener('click', () => {
      npStep = 'create';
      npDraft = { name: '', outcomes: defaultOutcomesList() };
      renderModal();
    });
    const startBtn = document.getElementById('btnStartSession');
    if (startBtn) startBtn.addEventListener('click', () => {
      if (!npSelectedPipelineId) return;
      startSessionAction(npSelectedPipelineId);
    });
  } else {
    document.getElementById('btnBackToPick').addEventListener('click', () => {
      npDraft.name = document.getElementById('npName').value;
      npStep = 'pick';
      renderModal();
    });
    document.getElementById('btnAddOutcome').addEventListener('click', () => {
      const labelInput = document.getElementById('npNewOutcomeLabel');
      const label = labelInput.value.trim();
      npDraft.name = document.getElementById('npName').value;
      if (!label) { labelInput.focus(); return; }
      const isConv = document.getElementById('npNewOutcomeConv').checked;
      const isNoAnswer = document.getElementById('npNewOutcomeNoAnswer').checked;
      npDraft.outcomes.push({
        id: uid('esito'), label, isNoAnswer, isConversion: isConv, isDefault: false
      });
      renderModal();
      const newInput = document.getElementById('npNewOutcomeLabel');
      if (newInput) newInput.focus();
    });
    modalRoot.querySelectorAll('[data-remove-oid]').forEach(btn => {
      btn.addEventListener('click', () => {
        npDraft.name = document.getElementById('npName').value;
        npDraft.outcomes = npDraft.outcomes.filter(o => o.id !== btn.dataset.removeOid);
        renderModal();
      });
    });
    document.getElementById('btnCreatePipeline').addEventListener('click', () => {
      const name = document.getElementById('npName').value.trim();
      if (!name) { showToast('Dai un nome alla pipeline.', true); document.getElementById('npName').focus(); return; }
      if (npDraft.outcomes.length === 0) { showToast('Aggiungi almeno un esito.', true); return; }
      const pipeline = { id: uid('pipe'), name, createdAt: new Date().toISOString(), outcomes: npDraft.outcomes };
      db.pipelines.push(pipeline);
      persist();
      startSessionAction(pipeline.id);
    });
  }
}

/**
 * Punto d'ingresso pubblico per avviare una sessione NORMALE (qualunque pipeline): fa da
 * "cancello" per il Round Conferme — se ci sono appuntamenti di domani da confermare,
 * propone prima il Sì/No (vedi openConfirmRoundPromptModal), altrimenti avvia la sessione
 * direttamente. La creazione vera e propria della sessione è in beginPipelineSession,
 * richiamata sia da qui (risposta "No") sia da exitConfirmRound (risposta "Sì", a fine
 * round) così il codice di avvio sessione resta in un punto solo.
 */
function startSessionAction(pipelineId) {
  const pending = getPendingConfirmAppointments();
  if (pending.length > 0) {
    openConfirmRoundPromptModal(pipelineId, pending.length);
    return;
  }
  beginPipelineSession(pipelineId);
}

function beginPipelineSession(pipelineId) {
  if (!createPipelineSession(pipelineId)) return;
  uiState.sessionMinimized = false;
  persist();
  closeModal();
  location.hash = '#/sessione-attiva';
  renderRoute();
}

/** Crea la sessione senza aprirla a schermo (usata anche dal Round Conferme, vedi
 * appendConfirmCallToSession). */
function createPipelineSession(pipelineId) {
  const pipeline = db.pipelines.find(p => p.id === pipelineId);
  if (!pipeline) return false;
  db.sessionCounter += 1;
  db.activeSession = {
    id: uid('sess'),
    number: db.sessionCounter,
    pipelineId: pipeline.id,
    pipelineName: pipeline.name,
    startedAt: new Date().toISOString(),
    endedAt: null,
    calls: [],
    skips: 0,
    retryCallsPending: false,
    callAttemptsOnLead: 0,
    pausedAt: null,
    pausedTotalMs: 0,
    currentLeadGroupId: null, // id del lead attualmente in corso (vedi logCallAction/computeStats)
    checklist: {}             // checklist del lead in chiamata { id: true } (5.4.3, renderLiveChecklistPanel)
  };
  return true;
}

/* ---------- Backup: esporta / importa ---------- */

async function exportData(data, filename) {
  filename = filename || `chiamate-tracker-backup-${dateInputValue(new Date())}.json`;
  const jsonStr = JSON.stringify(data || db, null, 2);

  // Se la pagina gira come Artifact pubblicato, usa la capability "downloads"
  // (il download diretto via link non funziona in quel contesto).
  if (window.claude && typeof window.claude.use === 'function') {
    try {
      const downloads = await window.claude.use('downloads');
      if (downloads) {
        try {
          await downloads.save({ filename, data: jsonStr });
          return;
        } catch (err) {
          if (err && err.code === 'declined') return; // l'utente ha annullato il salvataggio
          console.error('Salvataggio tramite capability non riuscito, uso il metodo standard', err);
        }
      }
    } catch (e) {
      console.error('Capability downloads non disponibile', e);
    }
  }

  // Download standard nel browser (usato quando la pagina è ospitata normalmente, es. GitHub Pages)
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(reader.result);
      if (!parsed || !Array.isArray(parsed.pipelines) || !Array.isArray(parsed.sessions)) {
        throw new Error('formato non valido');
      }
    } catch (e) {
      showToast('File non valido: impossibile importare il backup.', true);
      return;
    }
    showConfirm('Importare questo backup sostituirà tutti i dati attuali. Continuare?', () => {
      db = mergeWithDefaults(parsed);
      persist();
      renderRoute();
      showToast('Backup importato correttamente.');
    }, { confirmLabel: 'Importa e sostituisci' });
  };
  reader.readAsText(file);
}

/* ============================================================================
 * 🎨 Aspetto (#/impostazioni) — restyling step 16.
 * Scheletro di prima (preset rapidi + colore a scelta + Chiaro/Scuro, grandezza del
 * testo, effetti), ma i preset sono le rampe della guida e il colore a scelta genera la
 * rampa da solo (vedi "Tema — accento a rampa"). Lo stile vecchio non si può più scegliere.
 * ==========================================================================*/

/* Unico effetto rimasto: gli altri (Grind, Boss, confetti, suoni, ticker, Cash Day,
 * slot machine, tema auto...) non facevano più niente dopo il restyling e sono stati tolti. */
const BUILDER_TOGGLES = [
  { key: 'animatedNumbers', title: 'Numeri che contano', desc: 'I numeri delle commissioni salgono da zero quando apri la Dashboard.' }
];

function accentSwatchHtml(key, label, ramp, active) {
  return `
    <button type="button" class="accent-swatch${active ? ' active' : ''}" data-accent-preset="${key}" aria-pressed="${active ? 'true' : 'false'}">
      <span class="accent-swatch-ramp" aria-hidden="true">${ramp.map(c => `<i style="background:${c}"></i>`).join('')}</span>
      <span class="accent-swatch-name">${escapeHtml(label)}</span>
    </button>`;
}

/** Anteprima della rampa applicata adesso (valori veri del tema in uso) + contrasto. */
function accentPreviewHtml(acc, mode) {
  const t = accentTokens(acc, mode);
  const white = contrastRatio('#FFFFFF', t['--accent-500']);
  const onWhite = t['--on-accent'] === '#FFFFFF';
  const fmtRatio = r => r.toLocaleString('it-IT', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + ':1';
  const conflict = accentTrendConflict(t['--accent-500']);
  const conflictNote = conflict === 'green'
    ? '<p class="accent-note">Accento verde: le variazioni in salita ↑ diventano <b>blu</b>, per non confonderle col colore del tool.</p>'
    : conflict === 'red'
      ? '<p class="accent-note">Accento rosso: le variazioni in discesa ↓ e le scadenze diventano <b>viola</b>, per non confonderle col colore del tool.</p>'
      : '';
  return `
    <div class="accent-preview" data-accent-preview>
      <div class="accent-ramp">
        ${ACCENT_LEVELS.map(lv => {
          const c = t['--accent-' + lv];
          return `<div class="accent-ramp-step"><span class="accent-ramp-chip" style="background:${c}"></span><span class="accent-ramp-lv">${lv}</span><span class="accent-ramp-hex">${c}</span></div>`;
        }).join('')}
      </div>
      <div class="accent-sample">
        <span class="accent-sample-btn">Esempio</span>
        <span class="accent-sample-text">Testo sull'accento: <b>${onWhite ? 'bianco' : 'scuro'}</b> · il bianco arriva a ${fmtRatio(white)}${onWhite ? '' : ' (serve 4,5:1)'}</span>
      </div>
      ${conflictNote}
      ${mode === 'dark' ? '<p class="accent-note">Tema scuro: 300, 200 e 100 diventano tinte scure dello stesso colore, per non abbagliare sulle card scure.</p>' : ''}
    </div>`;
}

function renderBuilderPage() {
  const s = db.settings;
  const mode = themeModeFromSettings(s);
  const acc = currentAccent(s);
  const customHex = isHexColor(s.accentCustom) ? s.accentCustom.toUpperCase() : '#0EA5E9';
  const togglesHtml = BUILDER_TOGGLES.map(t => `
    <div class="toggle-row">
      <div class="toggle-row-text">
        <div class="toggle-row-title">${t.title}</div>
        <div class="toggle-row-desc">${t.desc}</div>
      </div>
      <label class="switch">
        <input type="checkbox" data-toggle="${t.key}" ${s.toggles && s.toggles[t.key] ? 'checked' : ''}>
        <span class="switch-track"></span>
      </label>
    </div>`).join('');

  appRoot.innerHTML = `
    <div class="page-header"><h2>🎨 Aspetto</h2></div>

    <section class="card builder-section">
      <h3>1 · Colore</h3>
      <div class="accent-swatches">
        ${Object.keys(ACCENT_PRESETS).map(k => accentSwatchHtml(k, ACCENT_PRESETS[k].label, ACCENT_PRESETS[k].ramp, acc.key === k)).join('')}
        <div class="accent-swatch accent-custom${acc.key === 'custom' ? ' active' : ''}" id="accentCustomBox" title="Scegli un colore qualsiasi: il tool crea la rampa da solo">
          <span class="accent-custom-pick"><input type="color" id="accentCustomPicker" value="${customHex.toLowerCase()}" aria-label="Scegli un colore"></span>
          <span class="accent-swatch-name">A scelta</span>
          <input type="text" id="accentCustomText" class="accent-custom-hex" value="${customHex}" maxlength="7" spellcheck="false" aria-label="Codice colore">
        </div>
      </div>
      ${accentPreviewHtml(acc, mode)}
    </section>

    <section class="card builder-section">
      <h3>2 · Chiaro o scuro?</h3>
      <div class="chip-select-row">
        <button class="chip-select big ${mode === 'light' ? 'active' : ''}" data-theme-mode="light">☀️ Chiaro</button>
        <button class="chip-select big ${mode === 'dark' ? 'active' : ''}" data-theme-mode="dark">🌙 Scuro</button>
      </div>
    </section>

    <section class="card builder-section">
      <h3>3 · Grandezza del testo</h3>
      <div class="chip-select-row">
        <button class="chip-select big ${s.textSize !== 'large' ? 'active' : ''}" data-text-size="normal">Normale</button>
        <button class="chip-select big ${s.textSize === 'large' ? 'active' : ''}" data-text-size="large">Grande</button>
      </div>
    </section>

    <section class="card builder-section">
      <h3>Effetti</h3>
      <div class="toggle-list">${togglesHtml}</div>
    </section>
  `;

  wireBuilderEvents();
}

/** Salva l'accento, lo applica e ridisegna la pagina. */
function setAccent(key, customHex) {
  db.settings.accent = key;
  if (customHex) db.settings.accentCustom = customHex.toUpperCase();
  persist();
  applyTheme(db.settings);
  renderBuilderPage();
}

function wireBuilderEvents() {
  appRoot.querySelectorAll('[data-accent-preset]').forEach(btn => btn.addEventListener('click', () => setAccent(btn.dataset.accentPreset)));

  // Colore a scelta: mentre trascini si vede subito (solo pagina), al rilascio si salva.
  const picker = document.getElementById('accentCustomPicker');
  const text = document.getElementById('accentCustomText');
  picker.addEventListener('input', () => {
    text.value = picker.value.toUpperCase();
    const preview = { accent: 'custom', accentCustom: picker.value, themeMode: db.settings.themeMode, textSize: db.settings.textSize };
    applyTheme(preview);
  });
  picker.addEventListener('change', () => setAccent('custom', picker.value));
  // Clic sul riquadro (fuori dai due campi) quando c'è già un colore a scelta salvato: lo riattiva.
  document.getElementById('accentCustomBox').addEventListener('click', e => {
    if (e.target.closest('input')) return;
    if (db.settings.accent !== 'custom' && isHexColor(db.settings.accentCustom)) setAccent('custom');
  });
  text.addEventListener('change', () => {
    let v = text.value.trim();
    if (/^[0-9a-fA-F]{6}$/.test(v)) v = '#' + v;
    if (!isHexColor(v)) { showToast('Codice colore non valido: scrivi tipo #0EA5E9.', true); text.value = picker.value.toUpperCase(); return; }
    setAccent('custom', v);
  });

  appRoot.querySelectorAll('[data-theme-mode]').forEach(btn => btn.addEventListener('click', () => {
    db.settings.themeMode = btn.dataset.themeMode === 'dark' ? 'dark' : 'light';
    persist();
    applyTheme(db.settings);
    renderBuilderPage();
  }));
  appRoot.querySelectorAll('[data-text-size]').forEach(btn => btn.addEventListener('click', () => {
    db.settings.textSize = btn.dataset.textSize === 'large' ? 'large' : 'normal';
    persist();
    applyTheme(db.settings);
    renderBuilderPage();
  }));
  appRoot.querySelectorAll('[data-toggle]').forEach(input => input.addEventListener('change', () => {
    db.settings.toggles[input.dataset.toggle] = input.checked;
    persist();
  }));
}

/* ---------- Init ---------- */

document.querySelectorAll('#sidebar .navlink[data-route]').forEach(l => {
  l.addEventListener('click', () => {
    const r = l.dataset.route;
    // Setting e Venditore riaprono l'ultima tab usata (uiState.settingTab / venditoreTab).
    const target = r === 'setting' ? (SETTING_SUBROUTES[uiState.settingTab] || 'setting-appuntamenti')
      : r === 'venditore' ? (VENDITORE_SUBROUTES[uiState.venditoreTab] || 'venditore-lead')
      : r;
    if (location.hash === '#/' + target) { closeMobileSidebar(); renderRoute(); }
    else location.hash = '#/' + target;
  });
});
document.getElementById('btnLogoutSide').addEventListener('click', () => { closeMobileSidebar(); logoutAction(); });
initSidebar();
document.getElementById('btnNuovaSessione').addEventListener('click', () => {
  // Una sessione è già in corso (magari minimizzata) -> il tasto rientra invece di
  // aprirne una seconda, che sovrascriverebbe db.activeSession perdendo la prima.
  if (db.activeSession) {
    uiState.sessionMinimized = false;
    renderRoute();
    return;
  }
  openNewSessionModal();
});
document.getElementById('btnAccount').addEventListener('click', () => { closeMobileSidebar(); openAccountModal(); });
document.getElementById('btnNewTask').addEventListener('click', openNewTaskModal);

document.getElementById('loginForm').addEventListener('submit', loginSubmitAction);

// CORREZIONE (17/10): finché i dati dell'utente non sono caricati, "db" è vuoto.
// Se in quel momento partiva un salvataggio (scheda in background, rete che torna),
// il tool mandava online i dati vuoti e cancellava tutto. Ora non salva niente
// finché openUserData non ha messo in "db" i dati veri.
let dbLoaded = false;
CloudSync.getData = () => dbLoaded ? db : null;
CloudSync.onStatus = setSyncStatus;
CloudSync.normalize = mergeWithDefaults;
CloudSync.onMerged = onCloudMerged;

/** Un altro dispositivo aveva salvato: cloud-sync.js ha unito le sue modifiche con le
 * nostre dentro "db". Si salva la copia locale e si ridisegna (non con una finestra aperta). */
function onCloudMerged(info) {
  // Le due copie possono avere ognuna la sua voce del round per lo stesso appuntamento.
  mergeDuplicateRecoveryEntries(db.recoveryRound);
  Storage.save(db);
  if (!modalRoot.innerHTML.trim()) renderRoute();
  showToast(info && info.unsafe
    ? 'Dati aggiornati da un altro dispositivo: dove non si potevano unire ho tenuto quelli online.'
    : 'Ho unito le modifiche fatte su un altro dispositivo.', !!(info && info.unsafe));
}

/* ---------- Una scheda sola (CORREZIONE 18/10, bug 1) ----------
 * Due schede dello stesso browser condividono la copia locale: la vecchia la
 * sovrascriverebbe. Ogni scheda che apre il tool lo annuncia (BroadcastChannel e,
 * di riserva, l'evento "storage"); le altre si fermano: niente più salvataggi né
 * in locale né online, e una finestra che invita a usare la scheda nuova o a
 * ricaricare questa (ricaricando diventa lei quella buona). */
const TAB_ID = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const TAB_KEY = 'comms_schedaAttiva';
let tabBlocked = false;
let tabChannel = null;
try { if (typeof BroadcastChannel !== 'undefined') tabChannel = new BroadcastChannel('comms_schede'); } catch (e) { tabChannel = null; }

function announceThisTab() {
  const msg = JSON.stringify({ tab: TAB_ID, t: Date.now() });
  try { localStorage.setItem(TAB_KEY, msg); } catch (e) { /* senza localStorage resta il canale */ }
  try { if (tabChannel) tabChannel.postMessage(msg); } catch (e) { /* niente */ }
}

function onOtherTabMessage(raw) {
  let msg = null;
  try { msg = JSON.parse(raw); } catch (e) { return; }
  if (!msg || msg.tab === TAB_ID || !dbLoaded) return;
  blockThisTab();
}

function blockThisTab() {
  if (tabBlocked) return;
  tabBlocked = true;
  Storage.readOnly = true;
  CloudSync.blocked = true;
  clearTimeout(CloudSync._timer);
  clearTimeout(CloudSync._retryTimer);
  closeModal();
  const el = document.createElement('div');
  el.id = 'tabBlocked';
  el.className = 'tab-blocked';
  el.innerHTML = `
    <div class="tab-blocked-card" role="alertdialog" aria-modal="true" aria-labelledby="tabBlockedTitle" aria-describedby="tabBlockedText">
      <h3 id="tabBlockedTitle">Il tool è aperto in un'altra scheda</h3>
      <p id="tabBlockedText">Per non perdere dati questa scheda si è fermata e non salva più.<br>Usa l'altra scheda e chiudi questa, oppure ricaricala: diventerà lei quella attiva.</p>
      <div class="modal-actions"><button class="btn-primary" id="btnTabReload">Ricarica questa scheda</button></div>
    </div>`;
  document.body.appendChild(el);
  document.body.classList.add('tab-is-blocked');
  setSyncStatus(''); // "Salvato" qui non vale più
  const btn = document.getElementById('btnTabReload');
  btn.addEventListener('click', () => location.reload());
  btn.focus();
}

if (tabChannel) tabChannel.onmessage = e => onOtherTabMessage(e.data);
window.addEventListener('storage', e => { if (e.key === TAB_KEY && e.newValue) onOtherTabMessage(e.newValue); });
// Uscendo dalla pagina (o passando a un'altra app sul telefono) prova a inviare subito.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && CloudSync.session) CloudSync.flush();
});

applyTheme(db.settings);
bootApp();

/* ============================================================================
 * Login e avvio — i dati stanno sul database Supabase (cloud-sync.js), con una
 * copia nel browser per lavorare anche senza rete.
 * ==========================================================================*/

let appStarted = false;

async function bootApp() {
  if (!CloudSync.loadSession()) {
    showLoginScreen();
    return;
  }
  await startForUser();
}

function showLoginScreen(message) {
  document.body.classList.add('logged-out');
  const screen = document.getElementById('loginScreen');
  screen.hidden = false;
  document.getElementById('loginError').textContent = message || '';
  const email = document.getElementById('loginEmail');
  if (CloudSync.session && CloudSync.session.user) email.value = CloudSync.session.user.email || '';
  (email.value ? document.getElementById('loginPassword') : email).focus();
}

function hideLoginScreen() {
  document.body.classList.remove('logged-out');
  document.getElementById('loginScreen').hidden = true;
  document.getElementById('loginPassword').value = '';
}

async function loginSubmitAction(e) {
  e.preventDefault();
  const btn = document.getElementById('loginSubmit');
  const errEl = document.getElementById('loginError');
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const previousUserId = appStarted && CloudSync.session ? CloudSync.session.user.id : null;
  btn.disabled = true;
  btn.textContent = 'Accesso…';
  errEl.textContent = '';
  try {
    const user = await CloudSync.signIn(email, password);
    // Sessione scaduta mentre si lavorava: stesso utente -> si riprende da dove si era.
    if (previousUserId && previousUserId === user.id) {
      hideLoginScreen();
      CloudSync.flush();
      return;
    }
    if (previousUserId) { location.reload(); return; }
    await startForUser();
  } catch (err) {
    console.error('Login non riuscito', err);
    errEl.textContent = err.offline
      ? 'Manca la connessione a internet. Riprova tra poco.'
      : (err.status === 400 ? 'Email o password sbagliate.' : 'Login non riuscito: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entra';
  }
}

async function startForUser() {
  hideLoginScreen();
  // Le altre schede aperte con il tool si fermano (vedi blockThisTab).
  announceThisTab();
  appRoot.innerHTML = '<div class="text-dim" style="padding:60px 16px; text-align:center;">Carico i tuoi dati…</div>';
  try {
    const how = await openUserData();
    if (how === 'offline') showToast('Sei offline: lavori sulla copia di questo browser. Salvo online appena torna la rete.');
  } catch (err) {
    console.error('Caricamento dati non riuscito', err);
    if (err.status === 401) {
      showLoginScreen('Accesso scaduto: rifai il login.');
      return;
    }
    appRoot.innerHTML = '<div class="text-dim" style="padding:60px 16px; text-align:center;">Non riesco a caricare i dati (manca la rete?). Ricarica la pagina tra poco.</div>';
    return;
  }
  document.getElementById('btnAccount').title = 'Account: ' + CloudSync.session.user.email;
  if (closeGhostRecoveryEntries()) persist();
  applyTheme(db.settings);
  if (!appStarted) {
    appStarted = true;
    window.addEventListener('hashchange', renderRoute);
  }
  renderRoute();
  startCallbackNotifications();
}

/**
 * Carica i dati dell'utente che ha fatto login. Ordine:
 * 1. Se nella copia del browser ci sono modifiche non ancora inviate, le invia.
 * 2. Scarica la versione online e la usa (è la più aggiornata, anche da un altro dispositivo).
 * 3. Primo login (online non c'è niente): prende i dati che il tool aveva già in
 *    questo browser (versione senza login), ne scarica PRIMA un backup .json di
 *    sicurezza, poi li carica online.
 * Senza rete usa la copia del browser. Ritorna 'cloud' | 'first' | 'offline'.
 */
async function openUserData() {
  const user = CloudSync.session.user;
  Storage.key = STORAGE_KEY + '__' + user.id;
  CloudSync._loadSynced();
  let rawLocal = null;
  try { rawLocal = localStorage.getItem(Storage.key); } catch (e) { rawLocal = null; }
  const local = rawLocal ? Storage.load() : null;
  // CORREZIONE (18/10, bug 2): copia locale rovinata = non si manda niente online, si
  // usano i dati online. La copia rovinata resta da parte (chiave "__illeggibile").
  if (rawLocal && !local) {
    try { localStorage.setItem(Storage.key + '__illeggibile', rawLocal); } catch (e) { /* spazio pieno: pazienza */ }
  }

  // Modifiche fatte qui e non ancora inviate: partono, ma il salvataggio controlla
  // prima la versione online e, se un altro dispositivo ha salvato nel frattempo,
  // unisce invece di sovrascrivere (cloud-sync.js, _reconcile).
  if (local && CloudSync.synced && CloudSync.hasPending(local)) {
    db = local;
    dbLoaded = true;
    const ok = await CloudSync.flush();
    if (!ok) return 'offline';
  }

  let remote;
  try {
    remote = await CloudSync.pull();
  } catch (err) {
    if (err.offline && local) { db = local; dbLoaded = true; setSyncStatus('pending'); return 'offline'; }
    throw err;
  }

  if (remote) {
    db = mergeWithDefaults(remote);
    dbLoaded = true;
    Storage.save(db);
    CloudSync.markSynced(db);
    setSyncStatus('saved');
    return 'cloud';
  }

  // Primo login per questo utente.
  if (local) {
    db = local;
  } else {
    let legacy = null;
    try { legacy = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { legacy = null; }
    const hasData = legacy && ((legacy.sessions || []).length || (legacy.appointments || []).length || (legacy.pipelines || []).length);
    if (hasData) {
      await exportData(legacy, `chiamate-tracker-backup-prima-del-login-${dateInputValue(new Date())}.json`);
      db = mergeWithDefaults(legacy);
      showToast('Ho trovato i tuoi dati in questo browser: scaricato un backup di sicurezza e caricati online.');
    } else {
      db = defaultData();
    }
  }
  dbLoaded = true;
  Storage.save(db);
  CloudSync.synced = null;
  await CloudSync.flush();
  return 'first';
}

/** Chiamata da cloud-sync.js quando il login è scaduto e non si rinnova da solo. */
function onCloudSessionExpired() {
  showLoginScreen('Accesso scaduto: rifai il login. Le modifiche sono al sicuro in questo browser.');
}

function openAccountModal() {
  const email = CloudSync.session ? CloudSync.session.user.email : '';
  openModal(`
    <h3>Account</h3>
    <p>Sei entrato come <strong>${escapeHtml(email)}</strong>.</p>
    <p class="text-dim" style="font-size:0.85rem;">I dati sono salvati online e anche in questo browser.</p>
    <div class="lead-modal">${LeadCRM.accountToggleHtml()}</div>
    ${accountNotifyHtml()}
    <div class="account-tools">
      <button class="btn-ghost" id="btnAccountBuilder">🎨 Aspetto e opzioni</button>
      <button class="btn-ghost" id="btnExport" title="Scarica un backup dei tuoi dati">⬇ Esporta backup</button>
      <label class="btn-ghost" title="Ripristina un backup: sostituisce tutti i dati, anche online">
        ⬆ Importa backup
        <input type="file" id="importFile" accept="application/json" hidden>
      </label>
    </div>
    <div class="modal-actions">
      <button class="btn-ghost" data-close-modal="1">Chiudi</button>
      <button class="btn-primary" id="btnLogout">Esci</button>
    </div>
  `);
  modalRoot.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', closeModal));
  LeadCRM.wireAccountToggle();
  wireAccountNotify();
  document.getElementById('btnAccountBuilder').addEventListener('click', () => { closeModal(); location.hash = '#/impostazioni'; });
  document.getElementById('btnExport').addEventListener('click', () => exportData());
  document.getElementById('importFile').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) { closeModal(); importData(f); }
  });
  document.getElementById('btnLogout').addEventListener('click', logoutAction);
}

async function logoutAction() {
  closeModal();
  const ok = await CloudSync.flush();
  const msg = ok
    ? 'Vuoi uscire? Per rientrare servono email e password.'
    : 'Alcune modifiche non sono ancora salvate online (manca la rete). Se esci adesso restano in questo browser e partono al prossimo login. Uscire comunque?';
  showConfirm(msg, async () => {
    await CloudSync.signOut();
    location.reload();
  }, { confirmLabel: 'Esci' });
}
