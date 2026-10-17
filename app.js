
// I dati veri arrivano dopo il login (openUserData, in fondo al file).
let db = defaultData();
let uiState = {
  pipelineFilter: 'all',
  sessioniPipelineFilter: 'all',
  crmSetterFilter: 'aperti',   // 'aperti' | 'all' | 'no_show' — tabella Appuntamenti Setter
  crmSetterSearch: '',         // testo ricerca per nome/telefono — tabella Appuntamenti Setter
  crmVenditoreFilter: 'all',   // 'all' | 'trattativa' | 'no_show' | 'perso' — tabella Appuntamenti Venditore
  crmVenditoreSearch: '',      // testo ricerca per nome/telefono — tabella Appuntamenti Venditore
  calMonthOffset: 0,           // scostamento in mesi dal mese corrente, per la navigazione del calendario
  editingGoal: null,           // { role, timeframe, step } quando un target obiettivo è in modifica inline
  goalsTimeframe: 'month',     // timeframe attivo (day|week|month) per le card Obiettivi (stile Hero + Sparkline)
  goalsPeriodMode: 'current',  // 'current' (giorno/settimana/mese corrente) | 'best' (il migliore di sempre per commissioni) per le card Obiettivi
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
 * Builder / Tema — preset, colori custom, radius, font, glow, saturazione/contrasto
 * ==========================================================================*/

/**
 * Preset colore del builder 🎨. "Carta" è il predefinito (scelto dall'utente perché è
 * quello che gli stanca meno gli occhi); per lo stesso motivo quasi tutti i temi NON
 * hanno sfondo bianco puro: solo due chiari "freddi", gli altri caldi/tenui o scuri.
 * radiusStyle/glowLevel facoltativi: se presenti vengono applicati insieme ai colori.
 */
const THEME_PRESETS = {
  'carta': {
    label: 'Carta',
    radiusStyle: 'round', glowLevel: 'none',
    colors: { bg: '#f3efe7', bgElev: '#fbf9f4', accent: '#2346a0', text: '#22211e', setterColor: '#2346a0', venditoreColor: '#1985ab', success: '#1f6b2e', danger: '#b3261e' }
  },
  'sabbia': {
    label: 'Sabbia',
    radiusStyle: 'round', glowLevel: 'none',
    colors: { bg: '#ebe5d8', bgElev: '#f4efe4', accent: '#8a4b16', text: '#2a241c', setterColor: '#8a4b16', venditoreColor: '#2d6a8a', success: '#3d6b22', danger: '#a8321f' }
  },
  'salvia': {
    label: 'Salvia',
    radiusStyle: 'round', glowLevel: 'none',
    colors: { bg: '#e4e9e2', bgElev: '#eef2ec', accent: '#2f6b4f', text: '#1c2620', setterColor: '#2f6b4f', venditoreColor: '#3a5f8f', success: '#2f6b4f', danger: '#a8321f' }
  },
  'nebbia': {
    label: 'Nebbia',
    radiusStyle: 'round', glowLevel: 'none',
    colors: { bg: '#e6e9ef', bgElev: '#f0f2f6', accent: '#3b4fa0', text: '#1c2130', setterColor: '#3b4fa0', venditoreColor: '#a0583b', success: '#2f7a4f', danger: '#b3261e' }
  },
  'notte-morbida': {
    label: 'Notte Morbida',
    radiusStyle: 'round', glowLevel: 'none',
    colors: { bg: '#1b1c20', bgElev: '#24262b', accent: '#f2b66d', text: '#eceae4', setterColor: '#f2b66d', venditoreColor: '#8ec5ff', success: '#8fd19e', danger: '#ff7a6b' }
  },
  'ardesia': {
    label: 'Ardesia',
    radiusStyle: 'round', glowLevel: 'none',
    colors: { bg: '#1a1f27', bgElev: '#232a35', accent: '#8ab4f8', text: '#e6eaf0', setterColor: '#8ab4f8', venditoreColor: '#f2b66d', success: '#8fd19e', danger: '#ff7a6b' }
  },
  'bosco': {
    label: 'Bosco',
    radiusStyle: 'round', glowLevel: 'none',
    colors: { bg: '#18201b', bgElev: '#212b24', accent: '#9ed69a', text: '#e5ece5', setterColor: '#9ed69a', venditoreColor: '#e8c07a', success: '#9ed69a', danger: '#ff8a7a' }
  },
  'prugna': {
    label: 'Prugna',
    radiusStyle: 'round', glowLevel: 'none',
    colors: { bg: '#1f1a22', bgElev: '#2a232e', accent: '#d7a6e8', text: '#eee8f0', setterColor: '#d7a6e8', venditoreColor: '#8ec5ff', success: '#9ed69a', danger: '#ff8a7a' }
  },
  'oceano': {
    label: 'Oceano',
    radiusStyle: 'round', glowLevel: 'none',
    colors: { bg: '#12202a', bgElev: '#1a2b37', accent: '#6fd3c9', text: '#e3eef2', setterColor: '#6fd3c9', venditoreColor: '#f2b66d', success: '#8fd19e', danger: '#ff8a7a' }
  },
  'graphite-lime': {
    label: 'Graphite Lime',
    colors: { bg: '#17181a', bgElev: '#1e2022', accent: '#c6ff3d', text: '#f5f6f2', setterColor: '#c6ff3d', venditoreColor: '#7fd9ff', success: '#c6ff3d', danger: '#ff5c5c' }
  },
  'slate-amber': {
    label: 'Slate Amber',
    colors: { bg: '#12141a', bgElev: '#1a1d24', accent: '#f5a524', text: '#f2f3f6', setterColor: '#f5a524', venditoreColor: '#7fd9ff', success: '#4ade80', danger: '#ff5c5c' }
  },
  'navy-gold': {
    label: 'Navy Gold',
    colors: { bg: '#0b1220', bgElev: '#131c30', accent: '#d4a94a', text: '#f2f4f8', setterColor: '#d4a94a', venditoreColor: '#7fd9ff', success: '#4ade80', danger: '#ff5c5c' }
  },
  // I due chiari "freddi": niente più card in bianco puro (#fff), troppo abbagliante.
  'paper-emerald': {
    label: 'Paper Emerald',
    colors: { bg: '#eef0ec', bgElev: '#f8f9f6', accent: '#0f7a5c', text: '#111813', setterColor: '#0f7a5c', venditoreColor: '#1985ab', success: '#0f7a5c', danger: '#c23b3b' }
  },
  'cobalt-light': {
    label: 'Cobalt Light',
    colors: { bg: '#eceff6', bgElev: '#f7f8fc', accent: '#3355ff', text: '#0e1220', setterColor: '#3355ff', venditoreColor: '#0f7a5c', success: '#0f7a5c', danger: '#c23b3b' }
  }
};

/* Angoli, font e glow del builder vecchio: tolti col restyling (17/10). Il font è Inter
 * per tutti (style.css, --font-sans). */

/** Schiarisce/scurisce un colore hex di una percentuale (positiva = verso il bianco). Usata per derivare --bg-elev2/--border/--accent-hover dai colori custom. */
function shadeHex(hex, pct) {
  const c = hex.replace('#', '');
  const num = parseInt(c.length === 3 ? c.split('').map(x => x + x).join('') : c, 16);
  let r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff;
  const mix = (ch) => Math.max(0, Math.min(255, Math.round(ch + (pct >= 0 ? (255 - ch) : ch) * pct)));
  r = mix(r); g = mix(g); b = mix(b);
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

/** Mescola due colori hex: t=0 -> a, t=1 -> b. */
function mixHex(a, b, t) {
  const p = (h) => { const c = h.replace('#', ''); const n = parseInt(c.length === 3 ? c.split('').map(x => x + x).join('') : c, 16); return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]; };
  const x = p(a), y = p(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

function hexToRgba(hex, alpha) {
  const c = hex.replace('#', '');
  const num = parseInt(c.length === 3 ? c.split('').map(x => x + x).join('') : c, 16);
  const r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* Variabili che la versione prima del restyling scriveva direttamente sulla pagina
 * (style="--bg:..."): se restano, vincono sui token di style.css. Le togliamo. */
const OLD_INLINE_THEME_VARS = ['--bg', '--bg-elev', '--bg-elev2', '--border', '--accent', '--accent-hover', '--accent-dim',
  '--text', '--text-dim', '--warning', '--on-accent', '--setter-color', '--venditore-color', '--success', '--danger',
  '--tag-x2-bg', '--tag-x2-text', '--tag-conv-bg', '--tag-conv-text', '--accent-filter'];

/** Chiaro o scuro, dalla scelta salvata in 🎨 (sfondo scuro = tema scuro). */
function themeModeFromSettings(settings) {
  const bg = (settings.colors || {}).bg;
  return bg && /^#[0-9a-fA-F]{3,6}$/.test(bg) && isDarkColor(bg) ? 'dark' : 'light';
}

/**
 * Applica data.settings al DOM. Restyling 17/10 (step 1): i colori vengono SOLO dai
 * token di style.css (guida colori). Qui si sceglie solo chiaro/scuro (data-theme),
 * la grandezza del testo e le classi degli effetti (Grind, Boss Mode).
 * I vecchi preset, angoli, font e glow del builder non cambiano più l'aspetto:
 * il builder nuovo (accento a rampa) arriva allo step 16.
 */
function applyTheme(settings) {
  if (!settings) return;
  const root = document.documentElement;
  OLD_INLINE_THEME_VARS.forEach(v => root.style.removeProperty(v));
  root.removeAttribute('data-skin');
  root.removeAttribute('data-tone');
  // Grandezza del testo (🎨 semplice, 16/10): "Grande" ingrandisce tutto il tool.
  root.style.fontSize = settings.textSize === 'large' ? '121%' : '';
  // Niente più classi di angoli/font/glow del builder vecchio.
  const body = document.body;
  body.className = body.className.replace(/\b(radius|font|glow)-\S+/g, '').replace(/\s+/g, ' ').trim();
  root.setAttribute('data-theme', themeModeFromSettings(settings));

  // Tema auto giorno/notte (toggle 6): 7-19 chiaro, resto scuro — sovrascrive la preferenza di sistema.
  if (settings.toggles && settings.toggles.autoTheme) {
    const h = new Date().getHours();
    root.setAttribute('data-theme', (h >= 7 && h < 19) ? 'light' : 'dark');
  }

  // Modalità Grind (toggle 1): confronta chiusure mese corrente coi due target mensili "chiusi".
  document.body.classList.remove('grind-under', 'grind-over');
  if (settings.toggles && settings.toggles.grindMode) {
    const ranges = currentPeriodRanges();
    const setterVals = computeFunnelValues(db, 'setter', ranges.month);
    const targetSetter = (db.goals.setter.month.chiusi || 0);
    const under = targetSetter > 0 && setterVals.chiusi < targetSetter;
    document.body.classList.add(under ? 'grind-under' : 'grind-over');
  }

  // Boss Mode (toggle 13): ultimi 3 giorni del mese E sotto obiettivo mensile "chiusi" (setter).
  document.body.classList.remove('boss-mode');
  if (settings.toggles && settings.toggles.bossMode) {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeft = lastDay - now.getDate();
    const ranges = currentPeriodRanges();
    const setterVals = computeFunnelValues(db, 'setter', ranges.month);
    const targetSetter = (db.goals.setter.month.chiusi || 0);
    if (daysLeft <= 3 && targetSetter > 0 && setterVals.chiusi < targetSetter) {
      document.body.classList.add('boss-mode');
    }
  }
}

function isDarkColor(hex) {
  const c = hex.replace('#', '');
  const num = parseInt(c.length === 3 ? c.split('').map(x => x + x).join('') : c, 16);
  const r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff;
  return (0.299 * r + 0.587 * g + 0.114 * b) < 128;
}

/* ---------- Suoni (Web Audio API, niente file esterni) ---------- */

let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    _audioCtx = new Ctx();
  }
  return _audioCtx;
}

/** Due note rapide in sequenza — usata sia dal beep "chiusura" (toggle 3) che dal "level up" (toggle 14), con frequenze diverse. */
function playChime(freq1, freq2) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    [{ f: freq1, t: now }, { f: freq2, t: now + 0.11 }].forEach(({ f, t }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.12);
    });
  } catch (e) { console.error('Audio non disponibile', e); }
}

function playCloseSound() { playChime(660, 880); }
function playLevelUpSound() { playChime(523, 1046); }

/* ---------- Confetti (toggle 5) ---------- */

function fireConfetti() {
  const colors = [getCssVar('--accent'), getCssVar('--setter-color'), getCssVar('--venditore-color'), getCssVar('--success')];
  for (let i = 0; i < 26; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    const left = Math.random() * 100;
    const dur = 1.4 + Math.random() * 1.2;
    const delay = Math.random() * 0.3;
    piece.style.left = left + 'vw';
    piece.style.background = colors[i % colors.length];
    piece.style.animationDuration = dur + 's';
    piece.style.animationDelay = delay + 's';
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), (dur + delay) * 1000 + 100);
  }
}

function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#c6ff3d';
}

/* ---------- Ticker commissioni live (toggle 12) ---------- */

function showCommissionTicker(amount) {
  if (!db.settings.toggles.liveTicker) return;
  const anchor = document.querySelector('.kpi-card.accented[data-ticker-anchor]');
  if (!anchor) return;
  let ticker = anchor.querySelector('.commission-ticker');
  if (!ticker) {
    ticker = document.createElement('div');
    ticker.className = 'commission-ticker';
    anchor.appendChild(ticker);
  }
  ticker.textContent = `+€${round2(amount)}`;
  ticker.classList.remove('show');
  void ticker.offsetWidth;
  ticker.classList.add('show');
}

/* ---------- Numeri animati: countUp (toggle 2) e slot-machine (toggle 16) ----------
 * Se entrambi i toggle sono attivi, la priorità va allo slot-machine (più vistoso e
 * pensato apposta per "quando un KPI cambia") mentre countUp resta l'animazione di
 * default per il primo render. Scelta documentata anche nel brief del builder. */
function animateKpiValues(root) {
  if (!db.settings.toggles) return;
  const useSlot = db.settings.toggles.slotMachineNumbers;
  const useCount = db.settings.toggles.animatedNumbers;
  if (!useSlot && !useCount) return;
  root.querySelectorAll('[data-kpi-num]').forEach(el => {
    const target = parseFloat(el.dataset.kpiNum);
    if (isNaN(target)) return;
    if (useSlot) {
      el.classList.remove('slot-anim');
      void el.offsetWidth;
      el.classList.add('slot-anim');
      el.textContent = el.dataset.kpiDisplay || String(target);
    } else if (useCount) {
      const isMoney = el.dataset.kpiMoney === '1';
      const suffix = el.dataset.kpiSuffix || '';
      const duration = 600;
      const start = performance.now();
      function step(now) {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        const val = target * eased;
        el.textContent = (isMoney ? '€' : '') + (Number.isInteger(target) ? Math.round(val) : round1(val)) + suffix;
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = el.dataset.kpiDisplay || String(target);
      }
      requestAnimationFrame(step);
    }
  });
}

/* ---------- Milestone pulse (toggle 11): applica una classe quando una barra supera 50%/75% ---------- */
function applyMilestonePulses(root) {
  if (!db.settings.toggles || !db.settings.toggles.midMilestone) return;
  root.querySelectorAll('[data-goal-pct]').forEach(bar => {
    const p = parseFloat(bar.dataset.goalPct);
    if (p >= 50) {
      bar.classList.remove('milestone-pulse');
      void bar.offsetWidth;
      bar.classList.add('milestone-pulse');
    }
  });
}

/* ---------- Cash Day badge (toggle 15) ---------- */
function isCashDay(dayTotal) {
  if (!db.settings.toggles.cashDayBadge) return false;
  const threshold = db.settings.cashDayThreshold || 0;
  return threshold > 0 && dayTotal >= threshold;
}

/* ---------- Router ---------- */

/* ---------- Route (restyling 17/10, step 2) ----------
 * Barra laterale: Dashboard / Setting / Venditore. Dentro Setting e Venditore la scelta
 * si fa con le tab centrate in alto (barra della pagina):
 *   Setting   = Appuntamenti · Sessioni · Stats
 *   Venditore = Lead · Statistiche
 * Route piatte con trattino. Le vecchie restano valide e vengono girate:
 *   #/oggi -> #/dashboard, #/venditore-appuntamenti -> #/venditore-lead.
 * La pagina Oggi (lead.js renderOggi) non si apre più (il suo contenuto andrà nelle
 * Task della Dashboard, step 5). La tabella Appuntamenti Venditore resta raggiungibile
 * SOLO da un link nella pagina Lead (#/venditore-tabella), finché la scheda lead non fa
 * tutto quello che si fa lì (nuovo appuntamento, rate, registrazioni): step 15. */
const SETTING_SUBROUTES = { appuntamenti: 'setting-appuntamenti', sessioni: 'sessioni', statistiche: 'setting-statistiche' };
const VENDITORE_SUBROUTES = { lead: 'venditore-lead', statistiche: 'venditore-statistiche' };
const VENDITORE_TABLE_ROUTE = 'venditore-tabella';
const ROUTE_REDIRECTS = { oggi: 'dashboard', 'venditore-appuntamenti': 'venditore-lead' };
const SETTING_TAB_LABELS = { appuntamenti: 'Appuntamenti', sessioni: 'Sessioni', statistiche: 'Stats' };
const VENDITORE_TAB_LABELS = { lead: 'Lead', statistiche: 'Statistiche' };

function isSettingRouteName(route) {
  return route === 'setting' || Object.values(SETTING_SUBROUTES).includes(route);
}
function isVenditoreRouteName(route) {
  return route === 'venditore' || route === 'lead' || route === VENDITORE_TABLE_ROUTE || Object.values(VENDITORE_SUBROUTES).includes(route);
}

function renderRoute() {
  // Indicatore fisso "sessione in corso" + etichetta del tasto "+ Nuova sessione" — vanno
  // aggiornati PRIMA di qualunque return anticipato qui sotto, perché dipendono solo dallo
  // stato (db.activeSession/uiState.sessionMinimized) e non dalla route effettivamente resa.
  renderActiveSessionIndicator();
  updateNuovaSessioneButtonLabel();
  renderConfirmAlertBanner();
  closeMobileSidebar();

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
  else if (route === VENDITORE_TABLE_ROUTE) renderVenditoreAppuntamenti();
  else if (section === 'venditore') renderVenditorePage();
  else if (route === 'impostazioni') renderBuilderPage();
  else renderDashboard();
}

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

/** Il tasto "+ Nuova sessione" in topbar non va mai cliccato per AVVIARE una seconda
 * sessione sopra quella già in corso (sovrascriverebbe db.activeSession perdendo i dati
 * della prima) — mentre una sessione è attiva, diventa invece un modo rapido per
 * rientrarci (utile soprattutto quando è minimizzata, come scorciatoia in più oltre
 * all'indicatore lampeggiante). Il topbar è markup statico fuori da #app, quindi questa
 * etichetta va aggiornata esplicitamente ad ogni renderRoute(), non si rigenera da sola. */
function updateNuovaSessioneButtonLabel() {
  const btn = document.getElementById('btnNuovaSessione');
  if (!btn) return;
  btn.textContent = db.activeSession ? '↩ Torna alla sessione' : '+ Nuova sessione';
}

/* Sotto-tab dentro le pagine: dal restyling (step 2) le tab stanno nella barra in alto
 * (renderPageBar). Queste due funzioni restano perché le pagine le chiamano ancora:
 * non disegnano più niente. */
function renderSubTabsBar() { return ''; }
function wireSubTabsBar() { /* le tab in alto sono collegate una volta sola in initSidebar */ }

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
  else LeadCRM.renderLeadList(renderVenditoreTableLink());
}

/** Link alla tabella Appuntamenti Venditore (fuori dal menu dal restyling). Serve finché
 * la scheda lead non ha "+ Appuntamento", rate e registrazioni (step 15). */
function renderVenditoreTableLink() {
  return `<div class="stats-page-link"><a class="btn-ghost" href="#/${VENDITORE_TABLE_ROUTE}" title="Nuovo appuntamento, stato trattativa, rate e registrazioni">📋 Tabella appuntamenti</a></div>`;
}

/* ============================================================================
 * Pagine statistiche (restyling 17/10, step 2). Erano state tolte il 16/10 (i tassi
 * stavano sotto le card Obiettivi della Dashboard); tornano come tab "Stats" in
 * Setting e "Statistiche" in Venditore, con la barra del periodo unica.
 * Stesse funzioni di calcolo di sempre: computeSetterStats / computeVenditoreStats
 * (utils.js) e LeadCRM.newStatsValues. Niente "Esiti nel periodo" (Simone, 16/10).
 * ==========================================================================*/

function statsPeriodNote() {
  return `<p class="text-dim stats-note">${getPeriod().tf === 'all' ? 'Tutto lo storico registrato.' : 'Periodo: ' + periodLabelText() + '.'}</p>`;
}

function renderSettingStatistiche() {
  const range = getPeriodRangeOrNull();
  const st = computeSetterStats(db, range);
  const comm = computeFunnelValues(db, 'setter', range || getPeriodRange());
  appRoot.innerHTML = `
    ${renderPeriodBar({ after: statsPeriodNote() })}
    <section class="kpi-grid">
      <div class="kpi-card"><div class="kpi-value">${st.fissati}</div><div class="kpi-label">Appuntamenti fissati</div></div>
      <div class="kpi-card"><div class="kpi-value">${st.presentati}</div><div class="kpi-label">Presentati</div></div>
      <div class="kpi-card"><div class="kpi-value">${st.showUpRate}%</div><div class="kpi-label">Show rate · ${st.presentatiSvolti} su ${st.svolti} svolti</div></div>
      <div class="kpi-card"><div class="kpi-value">${st.closingRate}%</div><div class="kpi-label">Closing · chiusi su presentati</div></div>
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
  `;
  wirePeriodBar(renderSettingStatistiche);
}

function renderVenditoreStatistiche() {
  const range = getPeriodRangeOrNull();
  const st = computeVenditoreStats(db, range);
  appRoot.innerHTML = `
    ${renderPeriodBar({ after: statsPeriodNote() })}
    <section class="kpi-grid">
      <div class="kpi-card"><div class="kpi-value">${st.assegnati}</div><div class="kpi-label">Assegnati</div></div>
      <div class="kpi-card"><div class="kpi-value">${st.presentati}</div><div class="kpi-label">Presentati</div></div>
      <div class="kpi-card"><div class="kpi-value">${st.chiusi}</div><div class="kpi-label">Chiusi</div></div>
      <div class="kpi-card"><div class="kpi-value">€${round2(st.commissioniTot)}</div><div class="kpi-label">Commissioni</div></div>
    </section>
    <section class="card">
      <h3>Tassi</h3>
      <div class="rates-row">
        ${rateCell(st.showRate + '%', 'Show rate', `${st.presentati} presentati su ${st.showRateBase}`)}
        ${rateCell(st.conversionRate + '%', 'Closing', 'chiusi su presentati in target')}
        ${rateCell('€' + round2(st.scontrinoMedio), 'Scontrino medio', `${st.chiusi} chiusi`)}
        ${rateCell('€' + round2(st.totalVenduto), 'Totale venduto', 'appuntamenti chiusi')}
      </div>
    </section>
    ${LeadCRM.renderNewStatsSection(range)}
  `;
  wirePeriodBar(renderVenditoreStatistiche);
}

/* ---------- Dashboard ---------- */

/**
 * Dashboard — SOLO: Obiettivi Setter, Obiettivi Venditore, Andamento generale (KPI
 * commissioni + grafici a linea Commissioni/Totale Venduto), calendario Commissioni in
 * fondo. La vecchia sezione "Attività di chiamata" (chiamate/lead/esiti/pipeline/
 * produttività) è stata spostata in Setting > Sessioni su richiesta esplicita
 * dell'utente — vedi renderCallActivitySection.
 */
function renderDashboard() {
  const topSectionsHtml = renderDashboardTopSections();
  const commissioniCalHtml = renderCommissioniCalendarSection();

  appRoot.innerHTML = `
    ${topSectionsHtml}
    ${commissioniCalHtml}
  `;

  wireDashboardTopSectionEvents();
  wireCommissioniCalendarSection();
  animateKpiValues(appRoot);
  applyMilestonePulses(appRoot);
}

/**
 * Costruisce il markup delle nuove sezioni in cima alla dashboard:
 * countdown/frase motivazionale, funnel Setter, funnel Venditore, KPI commissioni.
 * La logica di eventi (wiring) è in wireDashboardTopSectionEvents().
 */
function renderDashboardTopSections() {
  const periodBarHtml = renderDashboardPeriodBar();
  const eyebrowsHtml = renderEyebrows();
  const bestCaptionHtml = renderBestPeriodCaption();
  const setterFunnel = renderFunnelSection('setter', 'Obiettivi Setter', FUNNEL_STEPS_SETTER);
  const venditoreFunnel = renderFunnelSection('venditore', 'Obiettivi Venditore', FUNNEL_STEPS_VENDITORE);
  const commKpi = renderCommissionKpiSection();

  return `
    ${periodBarHtml}
    ${eyebrowsHtml}
    ${bestCaptionHtml}
    <section class="card goals-section">
      <h2><span class="role-dot setter"></span>Obiettivi Setter${renderMonthPace('setter')}</h2>
      ${setterFunnel}
      ${renderSetterRatesRow()}
    </section>
    ${LeadCRM.isOn() ? `<section class="card goals-section">
      <h2><span class="role-dot venditore"></span>Obiettivi Venditore${renderMonthPace('venditore')}</h2>
      ${venditoreFunnel}
      ${renderVenditoreRatesRow()}
    </section>` : ''}
    ${commKpi}
  `;
}

/* Lettera D (Simone, 16/10): le tab Statistiche di Setting e Venditore sono sparite.
 * I numeri che c'erano solo lì (tassi, media fissati, numeri dei lead) stanno
 * in una riga sotto ogni card Obiettivi e seguono il periodo scelto in cima. */
function dashboardStatsRange() {
  // "Tutto" (range null) non esiste in dashboard: si usa sempre il periodo della dashboard.
  return getDashboardRange();
}

function rateCell(value, label, sub) {
  return `<div class="rate-cell"><div class="rate-val">${value}</div><div class="rate-lab">${escapeHtml(label)}</div>${sub ? `<div class="rate-sub">${sub}</div>` : ''}</div>`;
}

function renderSetterRatesRow() {
  const st = computeSetterStats(db, dashboardStatsRange());
  return `<div class="rates-row">
    ${rateCell(st.showUpRate + '%', 'Show rate', `${st.presentatiSvolti} presentati su ${st.svolti} svolti`)}
    ${rateCell(st.closingRate + '%', 'Closing', 'chiusi su presentati')}
    ${rateCell(String(st.mediaFissatiGiorno).replace('.', ','), 'Fissati al giorno', 'giorni lun-ven')}
    ${rateCell(st.svolti, 'Già svolti', 'presentati, no show e annullati')}
  </div>`;
}

function renderVenditoreRatesRow() {
  const range = dashboardStatsRange();
  const st = computeVenditoreStats(db, range);
  const ls = LeadCRM.newStatsValues(range);
  return `<div class="rates-row">
    ${rateCell(st.showRate + '%', 'Show rate', `${st.presentati} presentati su ${st.showRateBase}`)}
    ${rateCell(st.conversionRate + '%', 'Closing', 'chiusi su presentati in target')}
    ${rateCell('€' + round2(st.scontrinoMedio), 'Scontrino medio', `${st.chiusi} chiusi`)}
    ${rateCell(ls.show2 + '%', 'Show rate 2° app.', `${ls.p2} presentati · ${ls.n2} no show`)}
    ${rateCell(ls.pctFu + '%', 'Chiuse in follow-up', `${ls.cFu} su ${ls.clienti} clienti`)}
    ${rateCell(`${ls.inT} · <span class="late-tag">${ls.rit}</span>`, 'Follow-up', 'in tempo · in ritardo')}
  </div>`;
}

/** Pace del mese (richiesto 2026-10-08): a che cifra di commissioni chiudi il mese se
 * tieni il ritmo attuale. Sempre sul mese corrente, a prescindere dal tab scelto. */
function renderMonthPace(role) {
  const p = computeMonthPace(db, role);
  return `<span class="month-pace" title="Commissioni del mese finora divise per i giorni lavorativi passati, moltiplicate per quelli del mese">
    <span class="month-pace-label">Pace mese</span>
    <span class="month-pace-num">€${p.pace}</span>
    <span class="month-pace-sub">finora €${p.soFar} · giorno ${p.elapsed} di ${p.total} (lun-ven)</span>
  </span>`;
}

function renderEyebrows() {
  const t = db.settings.toggles || {};
  const parts = [];
  if (t.monthCountdown) {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeft = lastDay - now.getDate();
    parts.push(`<div class="eyebrow">⏳ ${daysLeft} ${daysLeft === 1 ? 'giorno' : 'giorni'} al termine del mese</div>`);
  }
  if (t.dailyQuote) {
    const quotes = motivationalQuotes();
    const idx = dayOfYear(new Date()) % quotes.length;
    parts.push(`<div class="eyebrow">"${escapeHtml(quotes[idx])}"</div>`);
  }
  if (t.dailyStreak) {
    const streak = computeStreak();
    parts.push(`<div class="eyebrow streak-eyebrow">🔥 ${streak} ${streak === 1 ? 'giorno' : 'giorni'} di fila</div>`);
  }
  if (!parts.length) return '';
  return `<section class="card" style="display:flex; flex-direction:column; gap:6px;">${parts.join('')}</section>`;
}

function trendItem(label, t) {
  const arrow = t.dir === 'up' ? '▲' : (t.dir === 'down' ? '▼' : '—');
  const cls = t.dir === 'up' ? 'trend-up' : (t.dir === 'down' ? 'trend-down' : 'trend-flat');
  return `
    <div class="trend-item">
      <div class="trend-label">${label}</div>
      <div class="trend-value ${cls}">${arrow} ${t.diff}%</div>
    </div>`;
}

/* ============================================================================
 * Obiettivi (goals) — funnel Setter (6 tappe) e Venditore (3 tappe)
 * ==========================================================================*/

const FUNNEL_STEPS_SETTER = [
  { key: 'appuntamentiFissati', label: 'Appuntamenti Fissati', money: false },
  { key: 'presentati', label: 'Presentati', money: false },
  { key: 'chiusi', label: 'Chiusi', money: false },
  { key: 'commissioniShowUp', label: 'Commissioni Show Up', money: true },
  { key: 'commissioniChiusure', label: 'Commissioni Chiusure', money: true },
  { key: 'commissioniTot', label: 'Commissioni Tot.', money: true }
];

// Per il venditore, "appuntamentiFissati" è in realtà "Appuntamenti Assegnati": conteggio
// AUTOMATICO delle righe CRM create con ruolo Venditore nel periodo selezionato (stesso
// meccanismo con cui il Setter conta "Appuntamenti Fissati" — vedi computeFunnelValues).
// CORREZIONE (segnalata dall'utente): prima era un campo inserito a mano, ma il numero
// giusto è quello che risulta da "quando selezioni il ruolo venditore" nel CRM, non un
// valore digitato separatamente — vedi isAutoAssignedField in renderFunnelHero.
const FUNNEL_STEPS_VENDITORE = [
  { key: 'appuntamentiFissati', label: 'Appuntamenti Assegnati', money: false, isAutoAssignedField: true },
  { key: 'presentati', label: 'Presentati', money: false },
  { key: 'chiusi', label: 'Chiusi', money: false },
  // 4a tappa richiesta esplicitamente dall'utente: il totale VENDUTO (non le commissioni)
  // sugli appuntamenti Venditore chiusi nel periodo — vedi "fatturato" in computeFunnelValues.
  { key: 'fatturato', label: 'Fatturato', money: true },
  // 5a tappa: commissioni Venditore = 10% dell'incassato (cash collected + rate pagate), vedi computeFunnelValues.
  { key: 'commissioniVendita', label: 'Commissioni', money: true }
];

const TIMEFRAME_KEYS = ['day', 'week', 'month'];
const BEST_PERIOD_LABELS = { day: 'Miglior giorno', week: 'Migliore settimana', month: 'Miglior mese' };

/* ---------- Periodo unico della dashboard (Simone, 2026-10-15) ----------
 * Una sola barra in cima (Oggi / Ieri / 7 giorni / 30 giorni / 90 giorni / Mese corrente /
 * Mese scorso / Personalizzato + "🏆 Migliore di sempre") che vale per TUTTA la dashboard:
 * Obiettivi Setter, Obiettivi Venditore e Andamento generale. Regole decise da Simone:
 * - Oggi / Ieri -> obiettivo del giorno; 7 giorni -> della settimana; 30 giorni / Mese
 *   corrente / Mese scorso -> del mese; 90 giorni / Personalizzato -> numeri senza barra
 *   obiettivo.
 * - "Migliore di sempre": il giorno/settimana/mese con più commissioni (scelta Giorno /
 *   Settimana / Mese visibile solo in quella modalità), usato da tutta la dashboard.
 * - Pace mese e calendario commissioni restano sul mese, come prima.
 */
const DASH_GOAL_TF = { oggi: 'day', ieri: 'day', '7g': 'week', '30g': 'month', mese_corrente: 'month', mese_scorso: 'month' };

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
function getDashboardGoalTf() {
  if (uiState.goalsPeriodMode === 'best') return uiState.goalsTimeframe;
  return DASH_GOAL_TF[getPeriod().tf] || null;
}

function renderFunnelSection(role, title, steps) {
  return renderFunnelCard(role, getDashboardGoalTf(), steps, getDashboardRange());
}

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

function renderFunnelCard(role, timeframe, steps, range) {
  const values = computeFunnelValues(db, role, range);
  // timeframe null (90 giorni / Personalizzato): numeri senza obiettivo.
  const goalSet = timeframe ? db.goals[role][timeframe] : null;
  const heroStep = steps[0];
  const miniSteps = steps.slice(1);
  const heroHtml = renderFunnelHero(role, timeframe, heroStep, values, goalSet, range);
  const miniHtml = miniSteps.map(step => renderFunnelMini(role, timeframe, step, values, goalSet, range)).join('');
  const rowClass = miniSteps.length <= 2 ? 'v3' : (miniSteps.length === 3 ? 'v4' : (miniSteps.length === 4 ? 'v5' : ''));
  return `
    <div class="card funnel-card ${role}">
      <div class="hero-row ${rowClass}">
        ${heroHtml}
        ${miniHtml}
      </div>
    </div>`;
}

/** Prima tappa del funnel, resa in grande ("hero") — sempre la tappa "di ingresso"
 * (Appuntamenti Fissati per il setter, Appuntamenti Assegnati — manuale — per il venditore). */
function renderFunnelHero(role, timeframe, step, values, goalSet, range) {
  const current = values[step.key] || 0;
  const isMoney = step.money;
  const fmtVal = (n) => isMoney ? `€${round2(n)}` : String(n);

  if (step.isAutoAssignedField) {
    // Conteggio automatico dal CRM (righe con ruolo Venditore nel periodo) — non più un
    // campo manuale: "current" arriva già da computeFunnelValues come le altre tappe.
    const assigned = current;
    // Bug 7 (Simone, 16/10): qui c'era "presentati su assegnati" (45%) mentre le Statistiche
    // davano lo show rate (53%). Ora è lo stesso show rate ovunque (computeVenditoreStats).
    const presentedPct = computeVenditoreStats(db, range).showRate;
    const closedPct = assigned > 0 ? pct(values.chiusi, assigned) : 0;
    return `
      <div class="hero-main ${role}">
        <div class="hero-label">${escapeHtml(step.label)}</div>
        <div class="hero-num" data-kpi-num="${assigned}" data-kpi-money="0" data-kpi-display="${assigned}">${assigned}</div>
        <div class="hero-of">${presentedPct}% show rate · ${closedPct}% chiusi su assegnati</div>
      </div>`;
  }

  if (!goalSet) {
    return `
      <div class="hero-main ${role}">
        <div class="hero-label">${escapeHtml(step.label)}</div>
        <div class="hero-num" data-kpi-num="${current}" data-kpi-money="${isMoney ? '1' : '0'}" data-kpi-display="${fmtVal(current)}">${fmtVal(current)}</div>
        <div class="hero-of">nessun obiettivo per questo periodo</div>
      </div>`;
  }

  const target = goalSet[step.key] || 0;
  const progressPct = target > 0 ? Math.min(100, pct(current, target)) : 0;
  const complete = target > 0 && current >= target;
  const editing = uiState.editingGoal && uiState.editingGoal.role === role && uiState.editingGoal.timeframe === timeframe && uiState.editingGoal.step === step.key;

  const editRow = editing
    ? `<input type="number" min="0" class="funnel-target-input" id="goalEditInput" value="${target}">`
    : `<span class="hero-of">obiettivo ${fmtVal(target)}${target > 0 ? (complete ? ' — superato' : '') : ''}</span><button class="funnel-target-edit" data-edit-goal="1" data-role="${role}" data-tf="${timeframe}" data-step="${step.key}" title="Modifica obiettivo">✎</button>`;

  return `
    <div class="hero-main ${role}">
      <div class="hero-label">${escapeHtml(step.label)}</div>
      <div class="hero-num" data-kpi-num="${current}" data-kpi-money="${isMoney ? '1' : '0'}" data-kpi-display="${fmtVal(current)}">${fmtVal(current)}</div>
      <div class="hero-edit-row">${editRow}</div>
      ${renderPaceBar(current, target, timeframe, isMoney, 'hero-bar')}
    </div>`;
}

/**
 * Design "Ritmo" (scelto da Simone il 2026-10-08): ogni obiettivo ha una barra con una
 * tacca che segna dove dovresti essere ADESSO nel periodo, e sotto se sei in linea o
 * quanto sei indietro.
 * Quota di periodo trascorsa: Giorno = ore lavorative 9-19; Settimana e Mese = giorni
 * lavorativi lun-ven passati (oggi incluso). Un periodo già finito (es. "Migliore di
 * sempre") vale 1.
 */
function goalElapsedFraction(timeframe) {
  const range = getDashboardRange();
  const now = new Date();
  if (now > range.end) return 1;
  if (now < range.start) return 0;
  if (timeframe === 'day') {
    const h = now.getHours() + now.getMinutes() / 60;
    return Math.max(0, Math.min(1, (h - 9) / 10));
  }
  const total = countWeekdays(range.start, range.end);
  return total > 0 ? Math.min(1, countWeekdays(range.start, now) / total) : 1;
}

function renderPaceBar(current, target, timeframe, isMoney, extraCls) {
  const fmt = (n) => isMoney ? `€${Math.round(n)}` : String(n);
  if (!(target > 0)) {
    return `<div class="pace-wrap ${extraCls}"><div class="goal-bar-track"><div class="goal-bar-fill" style="width:0%"></div></div></div>
      <div class="pace-status dim">Imposta un obiettivo</div>`;
  }
  const frac = goalElapsedFraction(timeframe);
  const progressPct = Math.min(100, pct(current, target));
  const expected = target * frac;
  let cls, msg;
  if (current >= target) { cls = 'ok'; msg = 'Obiettivo raggiunto'; }
  else if (current >= expected) { cls = 'ok'; msg = 'In linea col ritmo'; }
  else {
    const gap = isMoney ? Math.round(expected - current) : Math.ceil(expected - current - 1e-9);
    cls = 'late'; msg = `Indietro di ${fmt(gap)}`;
  }
  return `<div class="pace-wrap ${extraCls}" data-goal-pct="${progressPct}">
      <div class="goal-bar-track"><div class="goal-bar-fill pace-${cls}" style="width:${progressPct}%"></div></div>
      ${frac > 0 && frac < 1 ? `<div class="pace-mark" style="left:${Math.round(frac * 100)}%" title="Dove dovresti essere adesso"></div>` : ''}
    </div>
    <div class="pace-status ${cls}">${msg}</div>`;
}

/** Tappe successive del funnel, rese come tile compatte con barra "Ritmo" (vedi renderPaceBar). */
function renderFunnelMini(role, timeframe, step, values, goalSet, range) {
  const current = values[step.key] || 0;
  const isMoney = step.money;
  const fmtVal = (n) => isMoney ? `€${round2(n)}` : String(n);
  if (!goalSet) {
    return `
    <div class="mini ${role}">
      <div class="mini-label">${escapeHtml(step.label)}</div>
      <div class="mini-num" data-kpi-num="${current}" data-kpi-money="${isMoney ? '1' : '0'}" data-kpi-display="${fmtVal(current)}">${fmtVal(current)}</div>
    </div>`;
  }
  const target = goalSet[step.key] || 0;
  const progressPct = target > 0 ? Math.min(100, pct(current, target)) : 0;
  const complete = target > 0 && current >= target;
  const editing = uiState.editingGoal && uiState.editingGoal.role === role && uiState.editingGoal.timeframe === timeframe && uiState.editingGoal.step === step.key;

  const targetHtml = editing
    ? `<input type="number" min="0" class="funnel-target-input" id="goalEditInput" value="${target}">`
    : `<span>${fmtVal(target)}</span><button class="funnel-target-edit" data-edit-goal="1" data-role="${role}" data-tf="${timeframe}" data-step="${step.key}" title="Modifica obiettivo">✎</button>`;

  return `
    <div class="mini ${role}">
      <div class="mini-label">${escapeHtml(step.label)}</div>
      <div class="mini-num" data-kpi-num="${current}" data-kpi-money="${isMoney ? '1' : '0'}" data-kpi-display="${fmtVal(current)}">${fmtVal(current)}</div>
      <div class="mini-target">/ ${targetHtml}</div>
      ${renderPaceBar(current, target, timeframe, isMoney, '')}
    </div>`;
}

function wireDashboardTopSectionEvents() {
  appRoot.querySelectorAll('[data-goals-tf]').forEach(btn => {
    btn.addEventListener('click', () => {
      uiState.goalsTimeframe = btn.dataset.goalsTf;
      renderDashboard();
    });
  });
  appRoot.querySelectorAll('[data-goals-period-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      uiState.goalsPeriodMode = 'best';
      renderDashboard();
    });
  });
  appRoot.querySelectorAll('[data-edit-goal]').forEach(btn => {
    btn.addEventListener('click', () => {
      uiState.editingGoal = { role: btn.dataset.role, timeframe: btn.dataset.tf, step: btn.dataset.step };
      renderDashboard();
      const input = document.getElementById('goalEditInput');
      if (input) { input.focus(); input.select(); }
    });
  });
  const goalInput = document.getElementById('goalEditInput');
  if (goalInput) {
    const commit = () => {
      const g = uiState.editingGoal;
      if (!g) return;
      const val = Math.max(0, parseFloat(goalInput.value) || 0);
      db.goals[g.role][g.timeframe][g.step] = val;
      uiState.editingGoal = null;
      persist();
      renderDashboard();
    };
    goalInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') { uiState.editingGoal = null; renderDashboard(); }
    });
    goalInput.addEventListener('blur', commit);
  }

  wirePeriodBar(renderDashboard, () => { uiState.goalsPeriodMode = 'current'; });
  appRoot.querySelectorAll('[data-andamento-comm-role]').forEach(btn => {
    btn.addEventListener('click', () => {
      uiState.andamentoCommRole = btn.dataset.andamentoCommRole;
      renderDashboard();
    });
  });

  wireLineCharts(appRoot);
}

/* ============================================================================
 * Andamento generale (dashboard) — KPI commissioni timeframe-aware + due grafici a
 * linea (Commissioni, Totale Venduto). Prima era fissa sul mese corrente; su richiesta
 * esplicita dell'utente ora ha gli stessi timeframe delle sessioni (incluso un periodo
 * personalizzato), e il grafico Commissioni ha in più un filtro Tutti/Setter/Venditore
 * per vedere come sono cresciute le due parti separatamente nel tempo.
 * ==========================================================================*/

function renderCommissionKpiSection() {
  const tf = getPeriod().tf;
  const range = getDashboardRange();
  const summary = computeCommissionSummary(db, range);
  const pace = db.settings.toggles.closingPace ? renderClosingPaceNote() : '';
  const personalBest = db.settings.toggles.personalBest ? renderPersonalBestBadge() : '';

  const commRole = uiState.andamentoCommRole || 'all';
  const commSeries = buildAndamentoSeries(range, tf, 'commissioni', commRole);
  const venditoSeries = buildAndamentoSeries(range, tf, 'venduto', 'all');

  const commChart = renderLineChart(commSeries.values, commSeries.labels, { color: commRole === 'setter' ? 'var(--setter-color)' : (commRole === 'venditore' ? 'var(--venditore-color)' : 'var(--accent)'), money: true });
  const vendutoChart = renderLineChart(venditoSeries.values, venditoSeries.labels, { color: 'var(--accent)', money: true });

  return `
    <div class="section-separator"><span class="eyebrow">Andamento generale</span></div>

    <section class="kpi-grid">
      <div class="card kpi-card accented" data-ticker-anchor="1">
        <div class="kpi-value" data-kpi-num="${summary.total}" data-kpi-money="1" data-kpi-display="€${summary.total}">€${summary.total}</div>
        <div class="kpi-label">Commissioni Tot.</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-value" data-kpi-num="${summary.setting}" data-kpi-money="1" data-kpi-display="€${summary.setting}">€${summary.setting}</div>
        <div class="kpi-label">Da Setting (chiusure)</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-value" data-kpi-num="${summary.vendita}" data-kpi-money="1" data-kpi-display="€${summary.vendita}">€${summary.vendita}</div>
        <div class="kpi-label">Da Vendita</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-value" data-kpi-num="${summary.showup}" data-kpi-money="1" data-kpi-display="€${summary.showup}">€${summary.showup}</div>
        <div class="kpi-label">Show Up (setter)</div>
      </div>
    </section>
    ${pace}${personalBest}

    <section class="two-col">
      <div class="card chart-card">
        <div class="chart-card-header">
          <h3>Commissioni nel tempo</h3>
          <div class="chip-select-row" style="gap:4px;">
            <button class="chip-select ${commRole === 'all' ? 'active' : ''}" data-andamento-comm-role="all">Tutti</button>
            <button class="chip-select ${commRole === 'setter' ? 'active' : ''}" data-andamento-comm-role="setter">Setter</button>
            <button class="chip-select ${commRole === 'venditore' ? 'active' : ''}" data-andamento-comm-role="venditore">Venditore</button>
          </div>
        </div>
        ${commChart}
      </div>
      <div class="card chart-card">
        <h3>Totale Venduto nel tempo</h3>
        ${vendutoChart}
      </div>
    </section>
  `;
}

/**
 * Serie storica per i grafici a linea "Andamento generale" — divide il range scelto in
 * bucket temporali (stesso principio di computeFunnelSparkline, ma con più punti quando il
 * range è ampio, per dare un vero andamento "a linea che sale" invece di pochi punti) e
 * somma commissioni o totale venduto in ciascun bucket.
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
 * Grafico a linea SVG minimale (nessuna libreria esterna): stroke colorato + area
 * riempita con gradiente leggero sotto la linea. Oltre alla linea colorata, il grafico
 * ha (su richiesta esplicita dell'utente):
 * - un asse Y a sinistra con valori in euro puliti (0/500/1.000/...), "come un normale
 *   grafico", invece di lasciare i valori solo nel footer;
 * - un cursore (crosshair) che segue il mouse/tocco e si aggancia al punto più vicino,
 *   con una mini-card che mostra il giorno/microperiodo e la commissione/importo esatti
 *   di quel punto — vedi wireLineCharts per l'interazione.
 * Il rendering usa un viewBox con lo STESSO rapporto d'aspetto del box CSS (via
 * aspect-ratio), quindi niente preserveAspectRatio="none": cerchi e testo non si
 * deformano più con la larghezza del contenitore.
 * opts.color accetta qualunque valore CSS valido (anche var(--...) del tema attivo).
 */
let lineChartIdCounter = 0;
let lineChartRegistry = {};
function renderLineChart(series, labels, opts) {
  opts = opts || {};
  const color = opts.color || 'var(--accent)';
  const money = !!opts.money;
  const w = 640, h = 220, padX = 10, padY = 14, axisW = 64;
  const plotX0 = axisW, plotW = w - axisW - padX;
  const gradId = 'lcGrad' + (lineChartIdCounter++);
  const chartId = 'lc' + lineChartIdCounter;

  if (!series.length || series.every(v => v === 0)) {
    return `<div class="chart-empty text-dim">Nessun dato nel periodo selezionato.</div>`;
  }

  const ticks = niceTicks(Math.max(...series), 4);
  const domainMax = ticks[ticks.length - 1] || 1;
  const n = series.length;
  const xStep = n > 1 ? plotW / (n - 1) : 0;
  const yFor = (v) => padY + (1 - v / domainMax) * (h - padY * 2);
  const points = series.map((v, i) => [plotX0 + xStep * i, yFor(v)]);

  const linePath = points.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const areaPath = linePath + ` L${points[n - 1][0].toFixed(1)},${(h - padY).toFixed(1)} L${points[0][0].toFixed(1)},${(h - padY).toFixed(1)} Z`;

  const lastVal = series[series.length - 1];
  const firstVal = series[0];
  const fmtVal = (v) => money ? `€${round2(v)}` : String(v);

  const gridlinesHtml = ticks.map(t => {
    const y = yFor(t).toFixed(1);
    return `<line class="line-chart-grid" x1="${plotX0}" y1="${y}" x2="${(w - padX).toFixed(1)}" y2="${y}"/>`;
  }).join('');
  const axisLabelsHtml = ticks.map(t => {
    const topPct = ((yFor(t) / h) * 100).toFixed(2);
    return `<div class="line-chart-yaxis-tick" style="top:${topPct}%;">${fmtVal(t)}</div>`;
  }).join('');

  lineChartRegistry[chartId] = { points, values: series, labels: labels || [], color, money, w, h, padY };

  return `
    <div class="line-chart-wrap" data-chart-id="${chartId}">
      <div class="line-chart-body">
        <div class="line-chart-yaxis" style="width:${axisW}px;">${axisLabelsHtml}</div>
        <div class="line-chart-plot-wrap" style="aspect-ratio:${(w - axisW)} / ${h};">
          <svg class="line-chart-svg" viewBox="${plotX0} 0 ${w - plotX0} ${h}" preserveAspectRatio="none">
            <defs>
              <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="${color}" stop-opacity="0.35"/>
                <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
              </linearGradient>
            </defs>
            ${gridlinesHtml}
            <path d="${areaPath}" fill="url(#${gradId})" stroke="none"/>
            <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
            ${points.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.4" fill="${color}"/>`).join('')}
            <line class="line-chart-crosshair" x1="0" y1="${padY}" x2="0" y2="${h - padY}" hidden/>
            <circle class="line-chart-hoverdot" cx="0" cy="0" r="4.5" fill="${color}" hidden/>
            <rect class="line-chart-hit" x="${plotX0}" y="0" width="${w - plotX0}" height="${h}" fill="transparent"/>
          </svg>
          <div class="line-chart-tooltip" hidden>
            <div class="line-chart-tooltip-value"></div>
            <div class="line-chart-tooltip-label"></div>
          </div>
        </div>
      </div>
      <div class="line-chart-footer">
        <span class="text-dim">Inizio: ${fmtVal(firstVal)}</span>
        <span class="line-chart-last" style="color:${color};">Ultimo: ${fmtVal(lastVal)}</span>
      </div>
    </div>`;
}

/**
 * Wiring del cursore/tooltip per ogni grafico a linea renderizzato in root (chiamare
 * dopo aver inserito l'HTML nel DOM). Legge i dati dal registry popolato da
 * renderLineChart (punti in coordinate SVG, valori e etichette periodo) invece di
 * ricalcolarli o di serializzarli nell'HTML, più semplice ed evita problemi di escaping.
 */
function wireLineCharts(root) {
  (root || appRoot).querySelectorAll('[data-chart-id]').forEach(wrap => {
    const chart = lineChartRegistry[wrap.dataset.chartId];
    if (!chart) return;
    const svg = wrap.querySelector('.line-chart-svg');
    const hit = wrap.querySelector('.line-chart-hit');
    const crosshair = wrap.querySelector('.line-chart-crosshair');
    const hoverDot = wrap.querySelector('.line-chart-hoverdot');
    const tooltip = wrap.querySelector('.line-chart-tooltip');
    const tooltipValue = tooltip ? tooltip.querySelector('.line-chart-tooltip-value') : null;
    const tooltipLabel = tooltip ? tooltip.querySelector('.line-chart-tooltip-label') : null;
    if (!svg || !hit || !crosshair || !hoverDot || !tooltip) return;

    const fmtVal = (v) => chart.money ? `€${round2(v)}` : String(v);

    function showAt(index) {
      const p = chart.points[index];
      if (!p) return;
      crosshair.setAttribute('x1', p[0]); crosshair.setAttribute('x2', p[0]);
      crosshair.removeAttribute('hidden');
      hoverDot.setAttribute('cx', p[0]); hoverDot.setAttribute('cy', p[1]);
      hoverDot.removeAttribute('hidden');

      if (tooltipValue) tooltipValue.textContent = fmtVal(chart.values[index]);
      if (tooltipLabel) tooltipLabel.textContent = chart.labels[index] || '';
      const leftPct = (p[0] / chart.w) * 100;
      const topPct = (p[1] / chart.h) * 100;
      tooltip.style.top = topPct + '%';
      if (leftPct < 20) { tooltip.style.left = leftPct + '%'; tooltip.style.transform = 'translate(0, -100%)'; }
      else if (leftPct > 80) { tooltip.style.left = leftPct + '%'; tooltip.style.transform = 'translate(-100%, -100%)'; }
      else { tooltip.style.left = leftPct + '%'; tooltip.style.transform = 'translate(-50%, -100%)'; }
      tooltip.hidden = false;
    }

    function hide() {
      crosshair.setAttribute('hidden', '');
      hoverDot.setAttribute('hidden', '');
      tooltip.hidden = true;
    }

    function handleMove(clientX) {
      const rect = svg.getBoundingClientRect();
      if (!rect.width) return;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const viewBoxParts = svg.getAttribute('viewBox').split(' ').map(Number);
      const xUser = viewBoxParts[0] + ratio * viewBoxParts[2];
      let nearest = 0, best = Infinity;
      chart.points.forEach((p, i) => { const d = Math.abs(p[0] - xUser); if (d < best) { best = d; nearest = i; } });
      showAt(nearest);
    }

    hit.addEventListener('pointermove', (e) => handleMove(e.clientX));
    hit.addEventListener('pointerdown', (e) => handleMove(e.clientX));
    hit.addEventListener('pointerleave', hide);
    hit.addEventListener('mouseleave', hide);
  });
}

/* ---------- Ritmo di chiusura (toggle 9) ---------- */
function renderClosingPaceNote() {
  const now = new Date();
  const monthRange = currentPeriodRanges().month;
  const daysSoFar = now.getDate();
  const closedSoFar = db.appointments.filter(a => a.closed && inRange(a.scheduledAt, monthRange)).length;
  const avgPerDay = daysSoFar > 0 ? closedSoFar / daysSoFar : 0;
  const targetClosures = (db.goals.setter.month.chiusi || 0) + (db.goals.venditore.month.chiusi || 0);

  if (targetClosures <= 0) return '';
  if (closedSoFar >= targetClosures) return `<p class="pace-note pace-ok">Ritmo di chiusura: obiettivo mensile già raggiunto (${closedSoFar}/${targetClosures}).</p>`;
  if (avgPerDay <= 0) return `<p class="pace-note pace-bad">Ritmo di chiusura: ancora nessuna chiusura questo mese, ritmo insufficiente per raggiungere ${targetClosures}.</p>`;

  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = lastDay - daysSoFar;
  const remaining = targetClosures - closedSoFar;
  const neededPerDay = daysLeft > 0 ? remaining / daysLeft : Infinity;

  if (neededPerDay > avgPerDay) {
    const deficit = round1(neededPerDay - avgPerDay);
    return `<p class="pace-note pace-bad">Ritmo insufficiente: mancano circa ${deficit} chiusure/giorno in più rispetto al ritmo attuale (${round1(avgPerDay)}/giorno) per raggiungere l'obiettivo entro fine mese.</p>`;
  }
  const daysToTarget = Math.ceil(remaining / avgPerDay);
  const eta = new Date(now); eta.setDate(eta.getDate() + daysToTarget);
  return `<p class="pace-note pace-ok">Al ritmo attuale (${round1(avgPerDay)} chiusure/giorno), raggiungerai l'obiettivo mensile entro il ${fmtDate(eta)}.</p>`;
}

/* ---------- Personal best (toggle 10) ---------- */
function renderPersonalBestBadge() {
  const now = new Date();
  const thisWeekRange = { start: startOfWeek(now), end: endOfWeek(now) };
  const thisWeekEvents = commissionEventsInRange(db, thisWeekRange);
  const thisWeekTotal = sumEvents(thisWeekEvents);
  const thisWeekClosures = db.appointments.filter(a => a.closed && inRange(a.scheduledAt, thisWeekRange)).length;

  // Confronta con tutte le settimane passate presenti nei dati (appuntamenti + eventi).
  const allDates = db.appointments.map(a => new Date(a.scheduledAt)).filter(d => !isNaN(d));
  if (!allDates.length) return '';
  let bestPastTotal = 0, bestPastClosures = 0;
  const seenWeeks = new Set();
  allDates.forEach(d => {
    const s = startOfWeek(d);
    const key = s.toISOString();
    if (seenWeeks.has(key)) return;
    seenWeeks.add(key);
    if (s.getTime() === startOfWeek(now).getTime()) return; // esclude la settimana corrente
    const wRange = { start: s, end: endOfWeek(d) };
    const wTotal = sumEvents(commissionEventsInRange(db, wRange));
    const wClosures = db.appointments.filter(a => a.closed && inRange(a.scheduledAt, wRange)).length;
    if (wTotal > bestPastTotal) bestPastTotal = wTotal;
    if (wClosures > bestPastClosures) bestPastClosures = wClosures;
  });

  if (thisWeekTotal > bestPastTotal || thisWeekClosures > bestPastClosures) {
    return `<div class="personalbest-badge">🏆 Nuovo record della settimana (${thisWeekClosures} chiusure, €${round2(thisWeekTotal)})</div>`;
  }
  return '';
}

/* ---------- Streak giornaliero (toggle 4) ---------- */
function computeStreak() {
  const daysWithAppt = new Set(db.appointments.filter(a => !a.rescheduledFromId).map(a => dateInputValue(a.createdAt)));
  let streak = 0;
  let cursor = new Date();
  while (daysWithAppt.has(dateInputValue(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
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
  let rows = db.appointments.filter(a => a.role === 'setter');
  if (filter === 'no_show') rows = rows.filter(a => a.presentedStatus === 'no_show');
  rows = [...rows].sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));
  const filterLabel = filter === 'no_show' ? 'Setter — solo No Show' : 'Setter';

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

// Report per il direttore commerciale — sezione Venditore, rispetta l'eventuale filtro
// (Tutti/Trattativa/No Show/Perso) attivo sulla tabella, come il report Setter.
async function generateVenditoreAppointmentsReport() {
  const filter = uiState.crmVenditoreFilter || 'all';
  let rows = db.appointments.filter(a => a.role === 'venditore');
  if (filter !== 'all') rows = rows.filter(a => a.dealStage === filter);
  rows = [...rows].sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));
  const filterLabels = { all: 'Venditore', trattativa: 'Venditore — solo Trattativa', no_show: 'Venditore — solo No Show', perso: 'Venditore — solo Perso' };
  const filterLabel = filterLabels[filter] || 'Venditore';

  const text = buildVenditoreAppointmentsReportText(rows, filterLabel);
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

  const rows = sessions.length ? sessions.map(s => {
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
  }).join('') : '<p class="text-dim">Nessuna sessione registrata ancora. Inizia la prima!</p>';

  const activityHtml = renderCallActivitySection();

  appRoot.innerHTML = `
    ${renderSubTabsBar('setting', 'sessioni')}
    ${activityHtml}
    <div class="section-separator"><span class="eyebrow">Elenco sessioni${filterId !== 'all' ? ' · ' + escapeHtml((db.pipelines.find(p => p.id === filterId) || {}).name || '') : ''}</span></div>
    <section class="session-list">${rows}</section>
    ${remaining > 0 ? `<div class="show-more-wrap"><button class="btn-ghost" id="btnMoreSessions">Mostra altre ${Math.min(20, remaining)} (ne restano ${remaining})</button></div>` : ''}
  `;

  wireSubTabsBar('setting');
  wireCallActivitySection();
  const moreBtn = document.getElementById('btnMoreSessions');
  if (moreBtn) moreBtn.addEventListener('click', () => { uiState.sessioniShown = shown + 20; renderSessioniList(); });
  appRoot.querySelectorAll('.session-card').forEach(card => {
    card.addEventListener('click', () => { location.hash = '#/sessioni/' + card.dataset.sid; });
  });
  animateKpiValues(appRoot);
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
      <td>${p.responseRate}%</td>
      <td>${p.conversionRate}%</td>
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
      <div class="card kpi-card"><div class="kpi-value">${stats.responseRate}%</div><div class="kpi-label">Tasso di risposta</div></div>
      <div class="card kpi-card"><div class="kpi-value">${stats.conversionRate}%</div><div class="kpi-label">Tasso di conversione</div></div>
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
  if (existingActive) return;
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
    if (l.sourceAppointmentId === apt.id && l.status === 'active') l.status = 'removed';
  });
}

/** Voci del round da mostrare qui. I no show Venditore con un lead aperto NON ci sono:
 * stanno in Oggi come prossima azione del lead (Simone, 16/10: "un posto solo"). Restano
 * attive nei dati, così "Fatto" in Oggi le aggiorna (LeadCRM.handlesRecovery). */
function visibleRecoveryEntries() {
  return (db.recoveryRound || []).filter(l => l.status === 'active' && !LeadCRM.handlesRecovery(l));
}

/** Vedi commento algoritmo sopra la sezione. */
function pickNextRecoveryLead() {
  const active = visibleRecoveryEntries();
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
  const waiting = visibleRecoveryEntries().length;
  return `
    <section class="card recov-entry-card">
      <div class="recov-entry-info">
        <h3>🔁 Round Recupero Appuntamenti</h3>
        <p class="text-dim" style="font-size:0.84rem;">Richiama i lead che hanno fatto no-show o hanno annullato, un lead a caso alla volta, finché tutti non sono stati sentiti almeno una volta.${LeadCRM.isOn() ? ' I no show del Venditore li trovi in Oggi, come prossima azione del lead.' : ''}</p>
      </div>
      <div class="recov-entry-action">
        <div class="recov-entry-count">${waiting}</div>
        <div class="recov-entry-count-label">da richiamare</div>
        <button class="btn-primary" id="btnStartRecoveryRound">${waiting ? 'Inizia round' : 'Apri round'}</button>
      </div>
    </section>`;
}

function wireRecoveryRoundEntryCard() {
  const btn = document.getElementById('btnStartRecoveryRound');
  if (!btn) return;
  btn.addEventListener('click', () => {
    db.recoveryRoundActive = true;
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
    ? visibleRecoveryEntries().find(l => l.id === db.recoveryRoundCurrentLeadId)
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
          <div class="session-pipeline-name">🔁 Round Recupero Appuntamenti</div>
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
  const roleLabel = (lead.sourceReason === 'annullato' ? 'Annullato' : 'No Show') + (lead.sourceRole === 'venditore' ? ' da Venditore' : ' da Setting');

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
        <div class="session-pipeline-name">🔁 Round Recupero Appuntamenti</div>
        <div></div>
      </div>

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
  `;

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
  db.recoveryRoundActive = false;
  db.recoveryRoundCurrentLeadId = null;
  persist();
  document.body.classList.remove('in-session');
  location.hash = '#/sessioni';
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
  if (db.activeSession) {
    db.activeSession.calls.push(callRecord);
    return;
  }
  const todayKey = dateInputValue(new Date());
  let autoSession = db.sessions.find(s => s.pipelineId === RECOVERY_AUTO_PIPELINE_ID && dateInputValue(s.startedAt) === todayKey);
  if (!autoSession) {
    db.sessionCounter += 1;
    autoSession = {
      id: uid('sess'),
      number: db.sessionCounter,
      pipelineId: RECOVERY_AUTO_PIPELINE_ID,
      pipelineName: RECOVERY_AUTO_PIPELINE_NAME,
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
 * Applica un esito al lead corrente e passa al prossimo (pickNextRecoveryLead sceglie
 * di nuovo alla prossima renderRecoveryRoundScreen, azzerando recoveryRoundCurrentLeadId).
 * - non_risposto / non_interessato / da_richiamare: sono vere chiamate effettuate ->
 *   incrementano callCount e aggiornano lastInteractionAt (usato per la rotazione).
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
  if (outcome === 'non_risposto' || outcome === 'non_interessato' || outcome === 'da_richiamare') {
    logRecoveryCall(lead, outcome);
    lead.callCount = (lead.callCount || 0) + 1;
    lead.lastInteractionAt = now;
  } else if (outcome === 'posticipato') {
    lead.lastInteractionAt = now;
  } else if (outcome === 'rimosso') {
    lead.status = 'removed';
    lead.lastInteractionAt = now;
  }
  db.recoveryRoundCurrentLeadId = null;
  persist();
  renderRecoveryRoundScreen();
}

/**
 * "Appuntamento fissato" dal round: stessa dinamica di creazione già usata altrove
 * (nome/telefono/data-ora), ma qui in un modal perché lo schermo del round non ha una
 * tabella. L'appuntamento nasce SEMPRE in Setting (role:'setter'), anche se il no-show
 * originale veniva da Venditore — richiesto esplicitamente dall'utente — con l'etichetta
 * "Recuperato" (vedi recoveredFromNoShow/recoveredFromRole e renderApptRow).
 * Il lead viene marcato 'resolved' (esce dal pool attivo del round).
 */
function openRecoveryAppointmentModal(leadId) {
  const lead = (db.recoveryRound || []).find(l => l.id === leadId);
  if (!lead) return;
  const srcApt = db.appointments.find(a => a.id === lead.sourceAppointmentId);
  const prefillName = (srcApt && srcApt.clientName) || lead.clientName || '';
  const prefillPhone = (srcApt && srcApt.phone) || lead.phone || '';
  const nowLocal = localDateTimeValue(new Date());

  openModal(`
    <h3>Appuntamento fissato — recupero appuntamento</h3>
    <p class="text-dim" style="font-size:0.85rem;">Va sempre in Setting, con l'etichetta "Recuperato".</p>
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

    const apt = newAppointment('setter');
    apt.clientName = name;
    apt.phone = phone || null;
    apt.scheduledAt = when;
    apt.recoveredFromNoShow = true;
    apt.recoveredFromRole = lead.sourceRole;
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
  if (db.activeSession) {
    db.activeSession.calls.push(callRecord);
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
        <button class="btn-primary" id="btnStartConfirmRoundStandalone">${waiting ? 'Inizia round' : 'Apri round'}</button>
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

      <div class="card recov-hero">
        <div class="recov-hero-name">${escapeHtml(apt.clientName || '(senza nome)')}</div>
        <div class="recov-hero-phone-row">
          <span class="confirm-hero-phone">${apt.phone ? escapeHtml(apt.phone) : 'Nessun numero salvato'}</span>
          ${apt.phone ? `<button class="crm-copy-phone-btn" id="btnCopyConfirmPhone" title="Copia numero">⧉</button>` : ''}
        </div>
        <div class="confirm-hero-when">${fmtRelativeDayTime(apt.scheduledAt)}</div>
      </div>

      ${retryBannerHtml}

      <div class="outcome-grid">
        <button class="outcome-btn" data-confirm-outcome="confermato">Confermato 24h</button>
        <button class="outcome-btn" data-confirm-outcome="spostato">Appuntamento spostato<span class="outcome-btn-sub">cambia data/ora</span></button>
        <button class="outcome-btn outcome-btn-danger" data-confirm-outcome="annullato">Annullato</button>
        <button class="outcome-btn" data-confirm-outcome="non_risposto">Non risposto<span class="outcome-btn-sub">doppio squillo</span></button>
      </div>
    </div>
  `;

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
        showConfirm(`Annullare l'appuntamento di "${escapeHtml(apt.clientName || '(senza nome)')}"?`, () => {
          applyConfirmOutcome(apt.id, 'annullato');
        }, { confirmLabel: 'Annulla appuntamento' });
        return;
      }
      applyConfirmOutcome(apt.id, outcome);
    });
  });
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
    db.confirmRoundCurrentApptId = null;
    persist();
    showToast('Appuntamento confermato.');
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
 * fuori da #app, subito sotto il topbar, così è visibile su qualunque schermata (tranne
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
    // Sotto la barra della pagina (restyling, step 2: la topbar non c'è più).
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
 * outbound qui sopra. Non condivide dati con esse: solo la stessa app/topbar.
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
 * Scelti dall'utente con schema colori esplicito. "chiusiSet" marca gli stati che
 * contano come chiusura ai fini di commissioni/funnel "Chiusi" (Contratto Firmato e
 * Chiuso — entrambi implicano soldi incassati/da incassare); "presentedSet" marca gli
 * stati che implicano che il lead si sia presentato (tutti tranne No Show, che per
 * definizione è l'assenza del lead — vedi computeFunnelValues per come viene usato).
 */
const DEAL_STAGES = [
  { key: 'no_show',           label: 'No Show',           color: 'mustard',  isClosed: false, isPresented: false },
  // Annullato: né presentato né no-show — fuori da show rate e closing rate (come Spostato).
  { key: 'annullato',         label: 'Annullato',         color: 'slate',    isClosed: false, isPresented: false },
  { key: 'trattativa',        label: 'Trattativa',        color: 'sky',      isClosed: false, isPresented: true },
  { key: 'contratto_firmato', label: 'Contratto Firmato', color: 'mint',     isClosed: true,  isPresented: true },
  { key: 'chiuso',            label: 'Chiuso',            color: 'forest',   isClosed: true,  isPresented: true },
  { key: 'perso',             label: 'Perso',             color: 'crimson',  isClosed: false, isPresented: true },
  // "Non in target": il lead si è presentato (conta come show) ma non era in target —
  // escluso dal closing/conversion rate (vedi utils.js computeVenditoreStats).
  { key: 'non_in_target',     label: 'Non in target',     color: 'brown',    isClosed: false, isPresented: true, excludeFromClosing: true },
  // "Spostato": l'appuntamento non si è svolto in questa data ma è stato riprogrammato —
  // né presentato né no-show. Selezionarlo apre openRescheduleModal (nuova data).
  { key: 'spostato',          label: 'Spostato',          color: 'violet',   isClosed: false, isPresented: false }
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
 * le funzioni sottostanti (renderApptRow/wireAppuntamentiEvents/addBlankAppointmentRow)
 * mostrano/creano sempre e solo righe role:'setter'. La versione Venditore è un sistema
 * di rendering separato (vedi renderVenditoreAppuntamenti più sotto) con un layout e un
 * modello di stato (dealStage) diversi.
 */
function renderAppuntamenti() {
  uiState.settingTab = 'appuntamenti';
  // Lettera F (Simone, 16/10): si apre su "Prossimi e da esitare" (prima 51 righe tutte
  // aperte). Chiuso / Cash / Totale stanno dietro il tasto € di ogni riga.
  const filter = uiState.crmSetterFilter || 'aperti'; // 'aperti' | 'all' | 'no_show'
  const search = uiState.crmSetterSearch || '';
  const allSetter = db.appointments.filter(a => a.role === 'setter');
  let rows = allSetter;
  if (filter === 'aperti') rows = rows.filter(isSetterApptOpen);
  if (filter === 'no_show') rows = rows.filter(a => a.presentedStatus === 'no_show');
  if (search.trim()) rows = allSetter.filter(a => matchesApptSearch(a, search)); // la ricerca guarda sempre tutti
  rows = filter === 'aperti' && !search.trim()
    ? [...rows].sort((a, b) => {
        const da = isSetterApptToEsitare(a), dbb = isSetterApptToEsitare(b);
        if (da !== dbb) return da ? 1 : -1; // prima i prossimi, poi quelli da esitare
        return da ? new Date(b.scheduledAt) - new Date(a.scheduledAt) : new Date(a.scheduledAt) - new Date(b.scheduledAt);
      })
    : [...rows].sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));

  const rowsHtml = rows.length ? rows.map(renderApptRow).join('') : '';
  const noResults = search.trim() && !rows.length;

  // "Round launcher" — i due round a schermo intero (No Show / Conferme), spostati qui
  // in cima su richiesta esplicita dell'utente perché più visibili: riga 1 No Show,
  // riga 2 Conferme (vedi renderRecoveryRoundEntryCard/renderConfirmRoundEntryCard).
  const roundLaunchersHtml = `
    <div class="round-launchers">
      ${renderRecoveryRoundEntryCard()}
      ${renderConfirmRoundEntryCard()}
    </div>`;

  appRoot.innerHTML = `
    ${renderSubTabsBar('setting', 'appuntamenti')}
    ${roundLaunchersHtml}
    <section class="card crm-toolbar">
      <div class="crm-filters">
        <button class="pill ${filter === 'aperti' ? 'active' : ''}" data-crm-setter-filter="aperti">Prossimi e da esitare (${allSetter.filter(isSetterApptOpen).length})</button>
        <button class="pill ${filter === 'all' ? 'active' : ''}" data-crm-setter-filter="all">Tutti (${allSetter.length})</button>
        <button class="pill ${filter === 'no_show' ? 'active' : ''}" data-crm-setter-filter="no_show">No Show</button>
      </div>
      <div class="crm-search-wrap">
        <input type="search" class="crm-search-input" id="crmSetterSearchInput" placeholder="Cerca per nome o telefono..." value="${escapeHtml(search)}">
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn-ghost" id="btnApptCalendar">📅 Calendario</button>
        <button class="btn-ghost" id="btnApptReport">Report</button>
        <button class="btn-ghost" id="btnOpenCallbacks">📞 Da richiamare${(db.callbacks || []).filter(c => c.status === 'pending').length ? ` (${(db.callbacks || []).filter(c => c.status === 'pending').length})` : ''}</button>
        <button class="btn-primary" id="btnNewAppt">+ Nuovo Appuntamento</button>
      </div>
    </section>
    <section class="card crm-table-wrap">
      ${rows.length ? `
      <table class="crm-table">
        <thead>
          <tr>
            <th>Nome / Telefono</th><th>Data/Ora</th><th>Presentato</th><th>Soldi</th><th></th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>` : `<p class="text-dim">${noResults ? 'Nessun appuntamento trovato per questa ricerca.' : (filter === 'aperti' && allSetter.length ? 'Nessun appuntamento in arrivo o da esitare. Gli altri sono in "Tutti".' : 'Nessun appuntamento ancora. Crea il primo con "+ Nuovo Appuntamento".')}</p>`}
    </section>
  `;

  wireAppuntamentiEvents();
}

/** Appuntamento Setter passato e ancora senza esito vero ("No" o "Confermato 24h"). */
function isSetterApptToEsitare(a) {
  return !!a.scheduledAt && new Date(a.scheduledAt) <= new Date() && (a.presentedStatus === 'no' || a.presentedStatus === 'confirmed24h' || !a.presentedStatus);
}
/** "Prossimi e da esitare": in arrivo (non spostati/annullati) oppure passati senza esito. */
function isSetterApptOpen(a) {
  if (isSetterApptToEsitare(a)) return true;
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

/**
 * Riga della tabella Appuntamenti Setter — tutti i campi sono editabili INLINE,
 * direttamente nella riga (niente modal "Nuovo Appuntamento": vedi
 * wireAppuntamentiEvents, che crea la riga vuota e la aggiunge subito a
 * db.appointments). Presentato/Chiuso sono chip cliccabili, Nome/Telefono/Data-ora sono
 * input nativi con autosave su change/blur, coerente con Cash Collected già esistente.
 *
 * "No Show" aggiunto come quarta opzione di Presentato (oltre No/Confermato24h/Presentato)
 * su richiesta esplicita dell'utente, per poter filtrare i lead da richiamare per il
 * recupero — vedi il filtro "Solo No Show" in renderAppuntamenti.
 */
function renderApptRow(a) {
  // Esito Setter come menu a tendina colorato, stesso stile dello "Stato trattativa"
  // del Venditore (richiesto dall'utente al posto della fila di bottoni).
  const presentedOptions = Object.entries(SETTER_PRESENTED_LABEL).map(([key, label]) =>
    `<option value="${key}" ${a.presentedStatus === key ? 'selected' : ''}>${escapeHtml(label)}</option>`
  ).join('');
  const presentedChips = `
      <select class="deal-stage-select setter-status-select" data-pstatus="${a.presentedStatus || 'no'}" data-set-presented-sel="${a.id}">
        ${presentedOptions}
      </select>`;

  const closedChips = `
      <div class="crm-chip-group">
        <button class="crm-chip ${!a.closed ? 'active' : ''}" data-set-closed="${a.id}" data-val="0">No</button>
        <button class="crm-chip ${a.closed ? 'active' : ''}" data-set-closed="${a.id}" data-val="1">Sì</button>
      </div>`;

  const totalSold = apptTotalSold(a);
  const linkNote = a.linkedAppointmentId ? `<div class="crm-link-note">collegato</div>` : '';
  const recoveredBadge = a.recoveredFromNoShow
    ? `<span class="badge recov-badge" title="Nato dal Round Recupero Appuntamenti (appuntamento originale da ${a.recoveredFromRole === 'venditore' ? 'Venditore' : 'Setting'})">↻ Recuperato</span>`
    : '';

  const moneyOpen = !!(uiState.setterMoneyOpen && uiState.setterMoneyOpen[a.id]);
  const hasMoney = a.closed || (a.cashCollected || 0) > 0 || totalSold > 0;
  const toEsitare = isSetterApptToEsitare(a);

  return `
    <tr data-appt-row="${a.id}" class="${a.presentedStatus === 'spostato' ? 'appt-row-moved' : ''} ${moneyOpen ? 'money-open' : ''}">
      <td>
        <input type="text" class="crm-inline-input crm-name-input" data-name-input="${a.id}" value="${escapeHtml(a.clientName || '')}" placeholder="Nome e cognome">
        <input type="text" class="crm-inline-input crm-phone-input" data-phone-input="${a.id}" value="${escapeHtml(a.phone || '')}" placeholder="Telefono (facoltativo)">
        ${recoveredBadge}
        ${rescheduleBadgesHtml(a)}
        ${linkNote}
      </td>
      <td class="crm-cell-center"><input type="datetime-local" class="crm-inline-input crm-datetime-input" data-scheduled-input="${a.id}" value="${(a.scheduledAt || '').slice(0, 16)}">${toEsitare ? '<div class="to-esitare-tag">da esitare</div>' : ''}</td>
      <td>${presentedChips}</td>
      <td class="crm-cell-center"><button class="money-btn ${hasMoney ? 'has-money' : ''} ${moneyOpen ? 'open' : ''}" data-toggle-money="${a.id}" title="Chiuso, cash collected e totale venduto" aria-expanded="${moneyOpen}">€${hasMoney ? ` ${round2(totalSold)}` : ''}</button></td>
      <td class="crm-row-actions"><button class="crm-row-del" data-del-appt="${a.id}" title="Elimina">×</button></td>
    </tr>
    ${moneyOpen ? `<tr class="money-row" data-money-row="${a.id}">
      <td colspan="5">
        <div class="money-panel">
          <label class="money-field"><span>Chiuso</span>${closedChips}</label>
          <label class="money-field"><span>Cash collected</span><input type="number" min="0" step="1" class="assigned-edit-input" data-cash-input="${a.id}" value="${a.cashCollected || 0}" style="width:110px;"></label>
          <label class="money-field"><span>Totale venduto</span><button class="crm-amount-link" data-open-installments="${a.id}">€${round2(totalSold)}</button></label>
        </div>
      </td>
    </tr>` : ''}`;
}

function wireAppuntamentiEvents() {
  wireSubTabsBar('setting');
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
  document.getElementById('btnNewAppt').addEventListener('click', () => {
    addBlankAppointmentRow('setter');
  });
  document.getElementById('btnOpenCallbacks').addEventListener('click', openCallbacksListModal);
  document.getElementById('btnApptReport').addEventListener('click', generateAppointmentsReport);
  document.getElementById('btnApptCalendar').addEventListener('click', () => openAppointmentsCalendarModal('setter'));
  wireRecoveryRoundEntryCard();
  wireConfirmRoundEntryCard();

  appRoot.querySelectorAll('[data-name-input]').forEach(input => {
    input.addEventListener('change', () => {
      const apt = db.appointments.find(x => x.id === input.dataset.nameInput);
      if (!apt) return;
      apt.clientName = input.value;
      persist();
    });
  });

  appRoot.querySelectorAll('[data-phone-input]').forEach(input => {
    input.addEventListener('change', () => {
      const apt = db.appointments.find(x => x.id === input.dataset.phoneInput);
      if (!apt) return;
      apt.phone = input.value || null;
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
      setAppointmentClosed(apt, btn.dataset.val === '1');
      renderAppuntamenti();
    });
  });

  appRoot.querySelectorAll('[data-cash-input]').forEach(input => {
    input.addEventListener('change', () => {
      const apt = db.appointments.find(x => x.id === input.dataset.cashInput);
      if (!apt) return;
      // L'acconto (cash collected) è ora la rata sintetica "_deposit" (vedi
      // getEffectiveInstallments) — il suo id evento è apt.id + '_deposit'.
      const prevCommission = apt.closed ? commissionEventsForAppointment(apt).filter(e => e.id === apt.id + '_deposit').reduce((s, e) => s + e.amount, 0) : 0;
      apt.cashCollected = Math.max(0, parseFloat(input.value) || 0);
      persist();
      if (apt.closed && db.settings.toggles.liveTicker) {
        const newCommission = commissionEventsForAppointment(apt).filter(e => e.id === apt.id + '_deposit').reduce((s, e) => s + e.amount, 0);
        if (newCommission > prevCommission) showCommissionTicker(newCommission - prevCommission);
      }
      renderAppuntamenti();
    });
  });

  appRoot.querySelectorAll('[data-open-installments]').forEach(btn => {
    btn.addEventListener('click', () => openInstallmentsModal(btn.dataset.openInstallments));
  });

  appRoot.querySelectorAll('[data-del-appt]').forEach(btn => {
    btn.addEventListener('click', () => {
      const apt = db.appointments.find(x => x.id === btn.dataset.delAppt);
      if (!apt) return;
      showConfirm(`Eliminare l'appuntamento di "${apt.clientName || '(senza nome)'}"?`, () => {
        unlinkRescheduleOnDelete(apt);
        db.appointments = db.appointments.filter(x => x.id !== apt.id);
        persist();
        renderAppuntamenti();
      }, { confirmLabel: 'Elimina' });
    });
  });
}

/**
 * "+ Nuovo Appuntamento": niente modal — crea subito una riga vuota (ruolo = quello del
 * filtro attivo, o Setter se il filtro è "Tutti"; data/ora = adesso) e la mette in cima
 * alla tabella, editabile inline esattamente come le righe esistenti (stesso pattern di
 * autosave su ogni campo). L'utente compila Nome/Ruolo/Data direttamente nella riga; il
 * focus va subito sul campo Nome.
 */
function addBlankAppointmentRow(role) {
  const apt = newAppointment(role || 'setter');
  db.appointments.unshift(apt);
  persist();
  if (role === 'venditore') renderVenditoreAppuntamenti(); else renderAppuntamenti();
  const nameInput = appRoot.querySelector(`[data-name-input="${apt.id}"]`);
  if (nameInput) nameInput.focus();
}

/**
 * Marca closed=true/false su un appuntamento, gestendo closedAt (vedi commento in
 * newAppointment) e i feedback opzionali del builder: suono di chiusura, confetti se
 * una barra obiettivo tocca 100% dopo l'aggiornamento, suono "level up" allo stesso
 * trigger del 100% (stessa logica descritta nel brief per il toggle 14).
 */
function setAppointmentClosed(apt, value) {
  const wasComplete = anyGoalComplete();
  apt.closed = value;
  if (value && !apt.closedAt) apt.closedAt = new Date().toISOString();
  if (!value) apt.closedAt = null;
  persist();

  if (value && db.settings.toggles.closeSound) playCloseSound();

  const nowComplete = anyGoalComplete();
  if (value && !wasComplete && nowComplete) {
    if (db.settings.toggles.confetti) fireConfetti();
    if (db.settings.toggles.levelUpSound) playLevelUpSound();
  }
}

/** true se almeno un obiettivo "chiusi" (mese, per uno qualsiasi dei due ruoli) è al 100% o oltre. */
function anyGoalComplete() {
  const ranges = currentPeriodRanges();
  const setterVals = computeFunnelValues(db, 'setter', ranges.month);
  const venditoreVals = computeFunnelValues(db, 'venditore', ranges.month);
  const targetSetter = db.goals.setter.month.chiusi || 0;
  const targetVenditore = db.goals.venditore.month.chiusi || 0;
  return (targetSetter > 0 && setterVals.chiusi >= targetSetter) || (targetVenditore > 0 && venditoreVals.chiusi >= targetVenditore);
}

/* ============================================================================
 * Appuntamenti — VENDITORE (split Setter/Venditore). Layout e modello di stato
 * completamente separati dalla tabella Setter qui sopra: qui il "Presentato"/"Chiuso"
 * booleani sono sostituiti da un unico stato trattativa a scelta singola (dealStage —
 * vedi DEAL_STAGES), e al posto di Accordi/Touchpoint ci sono Note (cronologia) e Data
 * Prossimo Follow-up.
 * ==========================================================================*/

function applyDealStage(apt, stageKey) {
  const wasComplete = anyGoalComplete();
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

  if (apt.closed && db.settings.toggles.closeSound) playCloseSound();
  const nowComplete = anyGoalComplete();
  if (apt.closed && !wasComplete && nowComplete) {
    if (db.settings.toggles.confetti) fireConfetti();
    if (db.settings.toggles.levelUpSound) playLevelUpSound();
  }
}

function renderVenditoreAppuntamenti() {
  uiState.venditoreTab = 'lead'; // la tabella sta sotto la tab Lead (restyling, step 2)
  if (LeadCRM.ensureLeads()) persist(); // ogni appuntamento Venditore ha il suo lead (lead.js)
  const filter = uiState.crmVenditoreFilter || 'all'; // 'all' | 'trattativa' | 'no_show' | 'perso'
  const search = uiState.crmVenditoreSearch || '';
  let rows = db.appointments.filter(a => a.role === 'venditore');
  if (filter !== 'all') rows = rows.filter(a => a.dealStage === filter);
  if (search.trim()) rows = rows.filter(a => matchesApptSearch(a, search));
  rows = [...rows].sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));

  const rowsHtml = rows.length ? rows.map(renderVenditoreApptRow).join('') : '';
  const noResults = search.trim() && !rows.length;

  appRoot.innerHTML = `
    <a class="back-link" href="#/venditore-lead">← Lead</a>
    <section class="card crm-toolbar">
      <div class="crm-filters">
        <button class="pill ${filter === 'all' ? 'active' : ''}" data-crm-vnd-filter="all">Tutti</button>
        <button class="pill ${filter === 'trattativa' ? 'active' : ''}" data-crm-vnd-filter="trattativa">Trattativa</button>
        <button class="pill ${filter === 'no_show' ? 'active' : ''}" data-crm-vnd-filter="no_show">No Show</button>
        <button class="pill ${filter === 'perso' ? 'active' : ''}" data-crm-vnd-filter="perso">Perso</button>
        <button class="pill ${filter === 'spostato' ? 'active' : ''}" data-crm-vnd-filter="spostato">Spostati</button>
      </div>
      <div class="crm-search-wrap">
        <input type="search" class="crm-search-input" id="crmVenditoreSearchInput" placeholder="Cerca per nome o telefono..." value="${escapeHtml(search)}">
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn-ghost" id="btnApptCalendarVnd">📅 Calendario</button>
        <button class="btn-ghost" id="btnApptReportVnd">Report</button>
        <button class="btn-ghost" id="btnCallRecordings">🎙️ Registrazioni (${(db.callRecordings || []).length})</button>
        <button class="btn-primary" id="btnNewApptVnd">+ Nuovo Appuntamento</button>
      </div>
    </section>
    <div class="two-col">
      <section class="card crm-table-wrap" style="grid-column: 1 / -1;">
        ${rows.length ? `
        <table class="crm-table">
          <thead>
            <tr>
              <th>Nome / Telefono</th><th>Data/Ora</th><th>Stato trattativa</th>
              <th>Cash Collected</th><th>Totale Venduto</th><th></th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>` : `<p class="text-dim">${noResults ? 'Nessun appuntamento trovato per questa ricerca.' : 'Nessun appuntamento ancora. Crea il primo con "+ Nuovo Appuntamento".'}</p>`}
      </section>
    </div>
  `;

  wireVenditoreAppuntamentiEvents();
}

function renderVenditoreApptRow(a) {
  const stageOptionsHtml = DEAL_STAGES.map(s =>
    `<option value="${s.key}" ${a.dealStage === s.key ? 'selected' : ''}>${escapeHtml(s.label)}</option>`
  ).join('');
  const currentStage = a.dealStage || '';

  const totalSold = apptTotalSold(a);

  return `
    <tr data-appt-row="${a.id}" class="${a.dealStage === 'spostato' ? 'appt-row-moved' : ''}">
      <td>
        <input type="text" class="crm-inline-input crm-name-input" data-name-input="${a.id}" value="${escapeHtml(a.clientName || '')}" placeholder="Nome e cognome">
        <div class="crm-phone-row">
          <input type="text" class="crm-inline-input crm-phone-input" data-phone-input="${a.id}" value="${escapeHtml(a.phone || '')}" placeholder="Telefono (facoltativo)">
          <button class="crm-copy-phone-btn" data-copy-phone="${a.id}" title="Copia numero">⧉</button>
        </div>
        ${rescheduleBadgesHtml(a)}
        ${LeadCRM.apptRowExtraHtml(a)}
      </td>
      <td class="crm-cell-center"><input type="datetime-local" class="crm-inline-input crm-datetime-input" data-scheduled-input="${a.id}" value="${(a.scheduledAt || '').slice(0, 16)}"></td>
      <td class="crm-cell-center">
        <select class="deal-stage-select" data-stage="${currentStage}" data-set-stage="${a.id}">
          <option value="" ${!currentStage ? 'selected' : ''}>— Da impostare —</option>
          ${stageOptionsHtml}
        </select>
      </td>
      <td><input type="number" min="0" step="1" class="assigned-edit-input" data-cash-input="${a.id}" value="${a.cashCollected || 0}" style="width:90px;"></td>
      <td class="crm-cell-center"><button class="crm-amount-link" data-open-installments="${a.id}">€${round2(totalSold)}</button></td>
      <td class="crm-row-actions"><button class="crm-row-del" data-del-appt-vnd="${a.id}" title="Elimina">×</button></td>
    </tr>`;
}

function wireVenditoreAppuntamentiEvents() {
  wireSubTabsBar('venditore');
  appRoot.querySelectorAll('[data-crm-vnd-filter]').forEach(btn => {
    btn.addEventListener('click', () => { uiState.crmVenditoreFilter = btn.dataset.crmVndFilter; renderVenditoreAppuntamenti(); });
  });
  wireCrmSearchInput('crmVenditoreSearchInput', 'crmVenditoreSearch', renderVenditoreAppuntamenti);
  document.getElementById('btnNewApptVnd').addEventListener('click', () => addBlankAppointmentRow('venditore'));
  document.getElementById('btnApptReportVnd').addEventListener('click', generateVenditoreAppointmentsReport);
  document.getElementById('btnApptCalendarVnd').addEventListener('click', () => openAppointmentsCalendarModal('venditore'));

  appRoot.querySelectorAll('[data-name-input]').forEach(input => {
    input.addEventListener('change', () => {
      const apt = db.appointments.find(x => x.id === input.dataset.nameInput);
      if (!apt) return;
      apt.clientName = input.value;
      persist();
      LeadCRM.onApptNameChanged(apt); // il lead segue il nome (lead.js)
      renderVenditoreAppuntamenti();
    });
  });

  appRoot.querySelectorAll('[data-phone-input]').forEach(input => {
    input.addEventListener('change', () => {
      const apt = db.appointments.find(x => x.id === input.dataset.phoneInput);
      if (!apt) return;
      apt.phone = input.value || null;
      persist();
    });
  });

  appRoot.querySelectorAll('[data-copy-phone]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const apt = db.appointments.find(x => x.id === btn.dataset.copyPhone);
      if (!apt || !apt.phone) { showToast('Nessun numero da copiare.', true); return; }
      const ok = await copyToClipboard(apt.phone);
      showToast(ok ? 'Numero copiato.' : 'Seleziona e copia manualmente.', !ok);
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
      renderVenditoreAppuntamenti();
    });
  });

  // Scheda lead e "Com'è finita?" sotto il nome (lead.js).
  LeadCRM.wireRowButtons(appRoot);

  appRoot.querySelectorAll('[data-set-stage]').forEach(sel => {
    sel.addEventListener('change', () => {
      const apt = db.appointments.find(x => x.id === sel.dataset.setStage);
      if (!apt) return;
      // "Spostato": stessa logica del Setter — prima la nuova data, poi lo stato.
      if (sel.value === 'spostato') {
        if (apt.dealStage === 'spostato') return;
        openRescheduleModal(apt.id, renderVenditoreAppuntamenti);
        renderVenditoreAppuntamenti(); // rimette la tendina allo stato attuale finché non si salva
        return;
      }
      applyDealStage(apt, sel.value || null);
      LeadCRM.onDealStageChanged(apt); // il lead segue (chiuso -> Cliente, ...)
      renderVenditoreAppuntamenti();
    });
  });

  appRoot.querySelectorAll('[data-cash-input]').forEach(input => {
    input.addEventListener('change', () => {
      const apt = db.appointments.find(x => x.id === input.dataset.cashInput);
      if (!apt) return;
      const prevCommission = apt.closed ? commissionEventsForAppointment(apt).filter(e => e.id === apt.id + '_deposit').reduce((s, e) => s + e.amount, 0) : 0;
      apt.cashCollected = Math.max(0, parseFloat(input.value) || 0);
      persist();
      if (apt.closed && db.settings.toggles.liveTicker) {
        const newCommission = commissionEventsForAppointment(apt).filter(e => e.id === apt.id + '_deposit').reduce((s, e) => s + e.amount, 0);
        if (newCommission > prevCommission) showCommissionTicker(newCommission - prevCommission);
      }
      renderVenditoreAppuntamenti();
    });
  });

  appRoot.querySelectorAll('[data-open-installments]').forEach(btn => {
    btn.addEventListener('click', () => openInstallmentsModal(btn.dataset.openInstallments, 'venditore'));
  });

  appRoot.querySelectorAll('[data-del-appt-vnd]').forEach(btn => {
    btn.addEventListener('click', () => {
      const apt = db.appointments.find(x => x.id === btn.dataset.delApptVnd);
      if (!apt) return;
      showConfirm(`Eliminare l'appuntamento di "${apt.clientName || '(senza nome)'}"?`, () => {
        unlinkRescheduleOnDelete(apt);
        deactivateRecoveryEntryForAppointment(apt);
        db.appointments = db.appointments.filter(x => x.id !== apt.id);
        LeadCRM.onApptDeleted(apt); // lead rimasto senza appuntamenti: sparisce anche lui
        persist();
        renderVenditoreAppuntamenti();
      }, { confirmLabel: 'Elimina' });
    });
  });

  document.getElementById('btnCallRecordings').addEventListener('click', openCallRecordingsModal);
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
  const returnToRoleScreen = () => { if (role === 'venditore') renderVenditoreAppuntamenti(); else renderAppuntamenti(); };
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
      <input type="date" data-inst-field="paidDate" value="${inst.paidDate ? dateInputValue(inst.paidDate) : ''}" ${inst.paid ? '' : 'disabled'}>
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
        const prevCommission = inst.paid ? commissionEventsForAppointment(apt).find(e => e.id === apt.id + '_' + inst.id) : null;
        const prevAmount = prevCommission ? prevCommission.amount : 0;

        if (field === 'label') inst.label = fieldEl.value;
        else if (field === 'amount') inst.amount = Math.max(0, parseFloat(fieldEl.value) || 0);
        else if (field === 'dueDate') inst.dueDate = fieldEl.value;
        else if (field === 'paid') {
          inst.paid = fieldEl.checked;
          if (inst.paid && !inst.paidDate) inst.paidDate = dateInputValue(new Date());
        } else if (field === 'paidDate') inst.paidDate = fieldEl.value;

        persist();

        if (inst.paid && db.settings.toggles.liveTicker) {
          const newCommission = commissionEventsForAppointment(apt).find(e => e.id === apt.id + '_' + inst.id);
          const newAmount = newCommission ? newCommission.amount : 0;
          if (newAmount > prevAmount) showCommissionTicker(newAmount - prevAmount);
        }

        renderInstallmentsModal(apt);
      });
    });
  });
}

/* Statistiche Setter e Venditore: tolte il 16/10 (lettera D, Simone). I loro numeri sono in
 * Dashboard sotto le card Obiettivi (renderSetterRatesRow, renderVenditoreRatesRow). */

/* ============================================================================
 * Commissioni — calendario mensile
 * ==========================================================================*/

/**
 * Calendario Commissioni — SPOSTATO in fondo alla Dashboard su richiesta esplicita
 * dell'utente (prima era una pagina a sé, route 'commissioni'). Stessa identica logica
 * di prima (riepilogo mese + griglia calendario), solo restituita come HTML da inserire
 * in coda a renderDashboard invece di occupare da sola tutto appRoot.
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

  const dowLabels = ['LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB', 'DOM'];
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
    if (hasEvents) classes.push('has-events');
    if (key === todayKey) classes.push('today');
    if (isCashDay(dayTotal)) classes.push('cash-day');
    cells += `
      <div class="${classes.join(' ')}" ${hasEvents ? `data-cal-day="${key}"` : ''}>
        <div class="cal-daynum">${day}</div>
        ${hasEvents ? `<div class="cal-day-total">€${round2(dayTotal)}</div><div class="cal-day-detail">${escapeHtml(detail)}</div>` : ''}
      </div>`;
  }

  return `
    <div class="section-separator"><span class="eyebrow">Calendario Commissioni</span></div>
    <!-- Riepilogo commissioni del mese tolto (Simone, 16/10, lettera C): ripeteva i numeri
         di "Andamento generale". Il pace totale del mese è tolto per lo stesso motivo:
         restano le due pace accanto ai titoli degli Obiettivi. -->
    <section class="card">
      <div class="cal-nav">
        <button id="calPrev">← Mese prec.</button>
        <div class="cal-month-label">${viewDate.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</div>
        <button id="calNext">Mese succ. →</button>
      </div>
      <div class="cal-grid">
        ${dowLabels.map(d => `<div class="cal-dow">${d}</div>`).join('')}
        ${cells}
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

/* ============================================================================
 * Calendario Appuntamenti (Setter e Venditore) — modal con vista mensile, aperta dal
 * bottone "📅 Calendario" nelle rispettive schermate Appuntamenti. Ogni giorno mostra gli
 * appuntamenti con quella scheduledAt come mini-pillole colorate: per il Setter in base a
 * presentedStatus (stessa idea del semaforo No/Confermato24h/Presentato/No Show già usato
 * nei chip della tabella), per il Venditore riusando esattamente i colori DEAL_STAGES già
 * definiti per il menu a tendina "stato trattativa" (var CSS --stage-*), così il colore è
 * coerente in tutto il tool invece di inventarne uno nuovo solo per il calendario.
 */
const SETTER_PRESENTED_COLOR_CLASS = {
  no: 'cal-appt-neutral',
  confirmed24h: 'cal-appt-confirmed',
  presented: 'cal-appt-presented',
  no_show: 'cal-appt-noshow',
  annullato: 'cal-appt-annullato',
  spostato: 'cal-appt-spostato'
};
const SETTER_PRESENTED_LABEL = { no: 'No', confirmed24h: 'Confermato24h', presented: 'Presentato', no_show: 'No Show', annullato: 'Annullato', spostato: 'Spostato' };

let calModalRole = 'setter';
let calModalMonthOffset = 0;

function openAppointmentsCalendarModal(role) {
  calModalRole = role;
  calModalMonthOffset = 0;
  openModal(renderAppointmentsCalendarModalBody());
  wireAppointmentsCalendarModal();
}

function renderAppointmentsCalendarModalBody() {
  const now = new Date();
  const viewDate = new Date(now.getFullYear(), now.getMonth() + calModalMonthOffset, 1);
  const monthRange = { start: startOfMonth(viewDate), end: endOfMonth(viewDate) };

  const rows = db.appointments.filter(a => a.role === calModalRole && a.scheduledAt && inRange(a.scheduledAt, monthRange));
  const byDay = {};
  rows.forEach(a => {
    const key = dateInputValue(a.scheduledAt);
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(a);
  });

  const firstOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = endOfMonth(viewDate).getDate();
  const todayKey = dateInputValue(now);
  const dowLabels = ['LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB', 'DOM'];

  let cells = '';
  for (let i = 0; i < firstWeekday; i++) cells += `<div class="cal-cell empty"></div>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const cellDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    const key = dateInputValue(cellDate);
    const dayAppts = byDay[key] || [];
    const classes = ['cal-cell'];
    if (dayAppts.length) classes.push('has-events');
    if (key === todayKey) classes.push('today');

    const pillsHtml = dayAppts.slice(0, 4).map(a => {
      if (calModalRole === 'venditore') {
        const stage = a.dealStage || '';
        const label = stage && dealStageDef(stage) ? dealStageDef(stage).label : '—';
        return `<div class="cal-appt-pill deal-stage-select" data-stage="${stage}" title="${escapeHtml(a.clientName || '')}">${escapeHtml(a.clientName || '(senza nome)')}</div>`;
      }
      const cls = SETTER_PRESENTED_COLOR_CLASS[a.presentedStatus] || 'cal-appt-neutral';
      return `<div class="cal-appt-pill ${cls}" title="${escapeHtml(a.clientName || '')}">${escapeHtml(a.clientName || '(senza nome)')}</div>`;
    }).join('');
    const moreHtml = dayAppts.length > 4 ? `<div class="cal-appt-more">+${dayAppts.length - 4}</div>` : '';

    cells += `
      <div class="${classes.join(' ')}">
        <div class="cal-daynum">${day}</div>
        <div class="cal-appt-pills">${pillsHtml}${moreHtml}</div>
      </div>`;
  }

  const legendHtml = calModalRole === 'venditore'
    ? DEAL_STAGES.map(s => `<span class="cal-legend-item deal-stage-select" data-stage="${s.key}">${escapeHtml(s.label)}</span>`).join('')
    : Object.entries(SETTER_PRESENTED_LABEL).map(([key, label]) => `<span class="cal-legend-item ${SETTER_PRESENTED_COLOR_CLASS[key]}">${escapeHtml(label)}</span>`).join('');

  return `
    <h3>Calendario Appuntamenti — ${calModalRole === 'venditore' ? 'Venditore' : 'Setter'}</h3>
    <div class="cal-nav">
      <button id="calModalPrev">← Mese prec.</button>
      <div class="cal-month-label">${viewDate.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</div>
      <button id="calModalNext">Mese succ. →</button>
    </div>
    <div class="cal-grid">
      ${dowLabels.map(d => `<div class="cal-dow">${d}</div>`).join('')}
      ${cells}
    </div>
    <div class="cal-legend">${legendHtml}</div>
    <div class="modal-actions">
      <button class="btn-primary" data-close-modal="1">Chiudi</button>
    </div>
  `;
}

function wireAppointmentsCalendarModal() {
  document.getElementById('calModalPrev').addEventListener('click', () => {
    calModalMonthOffset -= 1;
    modalRoot.querySelector('.modal-box').innerHTML = renderAppointmentsCalendarModalBody();
    wireAppointmentsCalendarModal();
  });
  document.getElementById('calModalNext').addEventListener('click', () => {
    calModalMonthOffset += 1;
    modalRoot.querySelector('.modal-box').innerHTML = renderAppointmentsCalendarModalBody();
    wireAppointmentsCalendarModal();
  });
  modalRoot.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', closeModal));
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

  // Lead "Da richiamare" ancora in attesa (status 'pending'), in ordine di data/ora:
  // - TUTTI quelli in scadenza entro oggi, compresi gli arretrati dei giorni prima mai
  //   richiamati, da qualunque sessione (Simone, 2026-10-08: devono restare sempre visibili);
  // - più quelli creati in QUESTA sessione, anche se programmati per un giorno futuro.
  const endToday = endOfDay(new Date());
  const sessionCallbacks = (db.callbacks || [])
    .filter(c => c.status === 'pending' && (c.sourceSessionId === s.id || new Date(c.scheduledAt) <= endToday))
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
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
      </div>
    </div>
  `;

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
      <div class="session-callback-item-when ${new Date(cb.scheduledAt) < startOfDay(new Date()) ? 'overdue' : ''}">${new Date(cb.scheduledAt) < startOfDay(new Date()) ? 'Arretrato · ' : ''}${fmtDateTime(cb.scheduledAt)}</div>
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
    currentLeadGroupId: s.currentLeadGroupId
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

  // La chiamata è già registrata a prescindere da quel che succede dopo (persist() qui sotto):
  // i popup "Appuntamento Fissato"/"Da richiamare" (se scattano) sono un'aggiunta al CRM/ai
  // richiami, non devono mai poter bloccare o alterare il conteggio normale della sessione.
  persist();
  renderSessioneAttiva();

  if (outcome.label === APPOINTMENT_SET_OUTCOME_LABEL) {
    uiState.pendingApptCallId = callRecord.id;
    openAppointmentSetModal();
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
 * Popup aperto SOLO quando l'esito cliccato in sessione è esattamente "Appuntamento
 * Fissato" (vedi APPOINTMENT_SET_OUTCOME_LABEL). Chiede solo nome e data/ora
 * dell'appuntamento appena fissato ("da lì poi compilo il resto" — l'utente completa
 * gli altri campi dopo, nella schermata Appuntamenti). Alla conferma crea una riga
 * db.appointments identica in tutto e per tutto a quella creata da "+ Nuovo
 * Appuntamento" (vedi addBlankAppointmentRow/newAppointment), con role:'setter' fisso
 * (il flusso da sessione è sempre lato Setter) e i campi forniti già impostati.
 */
function openAppointmentSetModal() {
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
    // Sessione in cui è stato fissato: serve alla lista sotto gli esiti (vedi renderSessionApptList).
    apt.sourceSessionId = db.activeSession ? db.activeSession.id : null;
    apt.sourceCallId = uiState.pendingApptCallId || null;
    uiState.pendingApptCallId = null;
    db.appointments.unshift(apt);
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
  persist();
  renderSessioneAttiva();
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
    s.endedAt = new Date().toISOString();
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
 * - l'elenco completo in Setting > Appuntamenti (vedi openCallbacksListModal), accessibile
 *   in qualunque momento, anche a sessione chiusa o giorni dopo.
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
  if (db.activeSession) {
    db.activeSession.calls.push(callRecord);
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
  `;

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
    openAppointmentSetModal();
  }
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
    <label class="field">Nome lead<input type="text" id="cbName" placeholder="Nome e cognome" autofocus></label>
    <label class="field">Telefono (facoltativo)<input type="text" id="cbPhone" placeholder="Numero di telefono"></label>
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
    if (isReschedule) {
      db.callbackCallActiveId = null;
      persist();
      renderRoute();
    }
  });

  document.getElementById('cbConfirmBtn').addEventListener('click', () => {
    const when = document.getElementById('cbWhen').value;
    if (!when) { showToast('Scegli quando richiamarlo.', true); return; }

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
        notes: noteText ? [{ id: uid('nota'), text: noteText, createdAt: new Date().toISOString() }] : []
      });
      persist();
      closeModal();
      showToast('Richiamo programmato.');
    }

    if (typeof opts.afterSave === 'function') opts.afterSave();
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

/** Elenco completo (modale) di tutti i lead "Da richiamare" ancora in attesa, da qualunque
 * sessione/giorno provengano — bottone "Da richiamare" in Setting > Appuntamenti. */
function openCallbacksListModal() {
  const pending = [...(db.callbacks || [])]
    .filter(c => c.status === 'pending')
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  const now = new Date();

  const rowsHtml = pending.length ? pending.map(cb => {
    const overdue = new Date(cb.scheduledAt) < now;
    return `
      <div class="callback-row">
        <div class="callback-row-main">
          <div class="callback-row-name">${escapeHtml(cb.leadName || '(senza nome)')}${callbackNotesButton(cb)}<button class="callback-edit-btn" data-edit-callback="${cb.id}" title="Modifica dati del lead">✎</button><button class="callback-edit-btn" data-delete-callback="${cb.id}" title="Togli dai da richiamare">🗑</button></div>
          <div class="callback-row-sub">${cb.phone ? escapeHtml(cb.phone) + ' · ' : ''}${escapeHtml(cb.sourcePipelineName || '')}</div>
        </div>
        <div class="callback-row-when ${overdue ? 'overdue' : ''}">${fmtDateTime(cb.scheduledAt)}</div>
        <button class="btn-primary" data-call-callback="${cb.id}">Chiama</button>
      </div>`;
  }).join('') : '<p class="text-dim">Nessun lead da richiamare al momento.</p>';

  openModal(`
    <h3>Da richiamare</h3>
    <div class="callbacks-list">${rowsHtml}</div>
    <div class="modal-actions">
      <button class="btn-ghost" data-close-modal="1">Chiudi</button>
    </div>
  `);
  modalRoot.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', closeModal));
  modalRoot.querySelectorAll('[data-edit-callback]').forEach(btn => {
    btn.addEventListener('click', () => openEditCallbackModal(btn.dataset.editCallback, openCallbacksListModal));
  });
  wireCallbackNotesButtons(modalRoot, openCallbacksListModal);
  modalRoot.querySelectorAll('[data-delete-callback]').forEach(btn => {
    btn.addEventListener('click', () => removeCallback(btn.dataset.deleteCallback, () => { openCallbacksListModal(); if (location.hash.indexOf('setting') !== -1) renderRoute(); }));
  });
  modalRoot.querySelectorAll('[data-call-callback]').forEach(btn => {
    btn.addEventListener('click', () => {
      closeModal();
      startCallbackCall(btn.dataset.callCallback);
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

/**
 * Tasto "↶ Annulla ultimo esito" in sessione (richiesta di Hamza, 2026-10-12): cancella
 * l'ultima chiamata segnata con i bottoni degli esiti e rimette il giro com'era prima
 * (lead in corso, richiamo immediato, tentativi). Se quell'esito aveva creato un "Da
 * richiamare" o un appuntamento, li toglie insieme. Si può premere più volte di fila.
 * Non vale per le chiamate del Round Conferme o dei richiami (non hanno undoState).
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
  const msg = `Annullare l'ultimo esito "${call.outcomeLabel}"?` + (extra.length ? ` Verrà tolto anche ${extra.join(' e ')}.` : '');
  showConfirm(msg, () => {
    s.calls.pop();
    s.retryCallsPending = call.undoState.retryCallsPending;
    s.callAttemptsOnLead = call.undoState.callAttemptsOnLead;
    s.currentLeadGroupId = call.undoState.currentLeadGroupId;
    if (linkedCbs.length) db.callbacks = db.callbacks.filter(c => c.sourceCallId !== call.id);
    if (linkedApts.length) db.appointments = db.appointments.filter(a => a.sourceCallId !== call.id);
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

function openModal(html) {
  modalRoot.innerHTML = `<div class="modal-overlay" id="modalOverlay"><div class="modal-box">${html}</div></div>`;
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') closeModal();
  });
}

function closeModal() { modalRoot.innerHTML = ''; }

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
    currentLeadGroupId: null // id del lead attualmente in corso (vedi logCallAction/computeStats)
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
 * Builder (Impostazioni) — pagina piena, raggiungibile dal pulsante 🎨 in topbar.
 * Scelta di design: pagina piena invece di modal, perché il builder ha molte
 * sezioni (preset, 8 color picker, radius, font, 2 slider, glow, 16 toggle) e
 * un modal sarebbe scomodo da scorrere.
 * ==========================================================================*/

/* 🎨 semplice (Simone, 16/10, lettera I): chiaro/scuro, un colore, grandezza del testo,
 * 4 effetti. Il resto sta in "Personalizza a mano", chiuso. */
const SIMPLE_ACCENTS = [['#d7a6e8', 'Lilla'], ['#4d7cf0', 'Blu'], ['#2fa36b', 'Verde'], ['#e08a2c', 'Arancio'], ['#e0605a', 'Rosso'], ['#1fa3b5', 'Azzurro']];
const SIMPLE_TOGGLES = ['animatedNumbers', 'monthCountdown', 'dailyStreak', 'closingPace'];
const SIMPLE_BASE = {
  dark: { bg: '#1f1a22', bgElev: '#2a232e', text: '#eee8f0', venditoreColor: '#8ec5ff', success: '#9ed69a', danger: '#ff8a7a' },
  light: { bg: '#f3efe7', bgElev: '#fbf9f4', text: '#22211e', venditoreColor: '#1985ab', success: '#1f6b2e', danger: '#b3261e' }
};
function applySimpleLook(mode, accent) {
  const s = db.settings;
  s.colors = Object.assign({}, s.colors, SIMPLE_BASE[mode], { accent, setterColor: accent });
  s.preset = 'custom';
  s.simpleMode = mode;
  persist();
  applyTheme(s);
  renderBuilderPage();
}

const TOGGLE_DEFS = [
  { key: 'grindMode', title: 'Modalità Grind', desc: 'Sotto obiettivo mese = accenti rossi, sopra = lime/verde.' },
  { key: 'animatedNumbers', title: 'Numeri che contano', desc: 'Count-up animato sui KPI ad ogni render.' },
  { key: 'closeSound', title: 'Suono conferma chiusura', desc: 'Beep sintetizzato quando marchi un appuntamento come chiuso.' },
  { key: 'dailyStreak', title: 'Streak giornaliero', desc: 'Mostra i giorni consecutivi con almeno un appuntamento fissato.' },
  { key: 'confetti', title: 'Confetti', desc: 'Coriandoli animati quando una barra obiettivo tocca il 100%.' },
  { key: 'autoTheme', title: 'Tema auto giorno/notte', desc: 'Chiaro 7-19, scuro il resto del giorno (sovrascrive il tema di sistema).' },
  { key: 'monthCountdown', title: 'Countdown fine mese', desc: 'Giorni rimanenti nel mese corrente, in cima alla dashboard.' },
  { key: 'dailyQuote', title: 'Frase motivazionale', desc: 'Una frase al giorno, stabile per tutto il giorno.' },
  { key: 'closingPace', title: 'Ritmo di chiusura', desc: 'Proietta quando raggiungerai il target mensile di chiusure.' },
  { key: 'personalBest', title: 'Personal best', desc: 'Badge se la settimana corrente batte lo storico.' },
  { key: 'midMilestone', title: 'Milestone a metà', desc: 'Pulse quando una barra supera il 50%/75%.' },
  { key: 'liveTicker', title: 'Ticker commissioni live', desc: '"+€X" che appare e sfuma vicino al KPI commissioni.' },
  { key: 'bossMode', title: 'Boss Mode', desc: 'Ultimi 3 giorni del mese, sotto obiettivo: bordi pulsanti sugli elementi principali.' },
  { key: 'levelUpSound', title: 'Suono level up', desc: 'Come il beep di chiusura, tono diverso, stesso trigger del 100% obiettivo.' },
  { key: 'cashDayBadge', title: 'Cash Day badge', desc: 'Evidenzia nel calendario i giorni sopra una soglia €.', hasThreshold: true },
  { key: 'slotMachineNumbers', title: 'Font slot machine', desc: 'Animazione verticale sui KPI invece del count-up (ha priorità se entrambi attivi).' }
];

function renderBuilderPage() {
  const s = db.settings;

  const dark = isDarkColor(s.colors.bg || '#000000');
  const simpleTogglesHtml = SIMPLE_TOGGLES.map(k => {
    const t = TOGGLE_DEFS.find(x => x.key === k);
    return `
    <div class="toggle-row">
      <div class="toggle-row-text">
        <div class="toggle-row-title">${t.title}</div>
        <div class="toggle-row-desc">${t.desc}</div>
      </div>
      <div class="toggle-row-extra">
        <label class="switch">
          <input type="checkbox" data-toggle="${t.key}" ${s.toggles[t.key] ? 'checked' : ''}>
          <span class="switch-track"></span>
        </label>
      </div>
    </div>`;
  }).join('');

  appRoot.innerHTML = `
    <div class="page-header"><h2>🎨 Aspetto</h2></div>

    <section class="card builder-section">
      <h3>1 · Chiaro o scuro?</h3>
      <div class="chip-select-row">
        <button class="chip-select big ${!dark ? 'active' : ''}" data-simple-mode="light">☀️ Chiaro</button>
        <button class="chip-select big ${dark ? 'active' : ''}" data-simple-mode="dark">🌙 Scuro</button>
      </div>
    </section>

    <section class="card builder-section">
      <h3>2 · Grandezza del testo</h3>
      <div class="chip-select-row">
        <button class="chip-select big ${s.textSize !== 'large' ? 'active' : ''}" data-text-size="normal">Normale</button>
        <button class="chip-select big ${s.textSize === 'large' ? 'active' : ''}" data-text-size="large">Grande</button>
      </div>
    </section>

    <section class="card builder-section">
      <h3>Effetti</h3>
      <div class="toggle-list">${simpleTogglesHtml}</div>
    </section>

  `;

  wireBuilderEvents();
}

function wireBuilderEvents() {
  appRoot.querySelectorAll('[data-simple-mode]').forEach(btn => btn.addEventListener('click', () => {
    applySimpleLook(btn.dataset.simpleMode, db.settings.colors.accent || SIMPLE_ACCENTS[0][0]);
  }));
  appRoot.querySelectorAll('[data-simple-accent]').forEach(btn => btn.addEventListener('click', () => {
    applySimpleLook(isDarkColor(db.settings.colors.bg || '#000000') ? 'dark' : 'light', btn.dataset.simpleAccent);
  }));
  appRoot.querySelectorAll('[data-text-size]').forEach(btn => btn.addEventListener('click', () => {
    db.settings.textSize = btn.dataset.textSize;
    persist();
    applyTheme(db.settings);
    renderBuilderPage();
  }));
  const manual = appRoot.querySelector('.builder-manual');
  if (manual) manual.addEventListener('toggle', () => { uiState.builderManualOpen = manual.open; });

  appRoot.querySelectorAll('[data-preset]').forEach(el => {
    el.addEventListener('click', () => {
      const preset = THEME_PRESETS[el.dataset.preset];
      if (!preset) return;
      db.settings.preset = el.dataset.preset;
      db.settings.colors = Object.assign({}, preset.colors);
      if (preset.radiusStyle) db.settings.radiusStyle = preset.radiusStyle;
      if (preset.glowLevel) db.settings.glowLevel = preset.glowLevel;
      persist();
      applyTheme(db.settings);
      renderBuilderPage();
    });
  });

  const colorFieldDefs = ['bg', 'bgElev', 'accent', 'text', 'setterColor', 'venditoreColor', 'success', 'danger'];
  colorFieldDefs.forEach(key => {
    const colorInput = document.getElementById('color_' + key);
    const textInput = document.getElementById('colortext_' + key);
    if (!colorInput || !textInput) return; // sezione tolta col restyling (torna allo step 16)
    const commit = (val) => {
      if (!/^#[0-9a-fA-F]{6}$/.test(val)) return;
      db.settings.colors[key] = val;
      db.settings.preset = 'custom';
      persist();
      applyTheme(db.settings);
    };
    colorInput.addEventListener('input', () => { textInput.value = colorInput.value; commit(colorInput.value); });
    textInput.addEventListener('change', () => { commit(textInput.value); colorInput.value = textInput.value; });
  });

  appRoot.querySelectorAll('[data-radius]').forEach(btn => {
    btn.addEventListener('click', () => {
      db.settings.radiusStyle = btn.dataset.radius;
      persist();
      applyTheme(db.settings);
      renderBuilderPage();
    });
  });
  appRoot.querySelectorAll('[data-font]').forEach(btn => {
    btn.addEventListener('click', () => {
      db.settings.fontStyle = btn.dataset.font;
      persist();
      applyTheme(db.settings);
      renderBuilderPage();
    });
  });
  appRoot.querySelectorAll('[data-glow]').forEach(btn => {
    btn.addEventListener('click', () => {
      db.settings.glowLevel = btn.dataset.glow;
      persist();
      applyTheme(db.settings);
      renderBuilderPage();
    });
  });

  const sliderSat = document.getElementById('sliderSaturation');
  if (sliderSat) sliderSat.addEventListener('input', (e) => {
    db.settings.accentSaturation = parseInt(e.target.value, 10);
    persist();
    applyTheme(db.settings);
  });
  const sliderCon = document.getElementById('sliderContrast');
  if (sliderCon) sliderCon.addEventListener('input', (e) => {
    db.settings.cardContrast = parseInt(e.target.value, 10);
    persist();
    applyTheme(db.settings);
  });

  const cashThreshold = document.getElementById('cashDayThreshold');
  if (cashThreshold) {
    cashThreshold.addEventListener('change', () => {
      db.settings.cashDayThreshold = Math.max(0, parseFloat(cashThreshold.value) || 0);
      persist();
    });
  }

  appRoot.querySelectorAll('[data-toggle]').forEach(input => {
    input.addEventListener('change', () => {
      db.settings.toggles[input.dataset.toggle] = input.checked;
      persist();
      applyTheme(db.settings);
    });
  });

  const btnReset = document.getElementById('btnResetBuilder');
  if (btnReset) btnReset.addEventListener('click', () => {
    showConfirm('Ripristinare aspetto e opzioni ai valori di default (Graphite Lime)?', () => {
      db.settings = defaultSettings();
      persist();
      applyTheme(db.settings);
      renderBuilderPage();
      showToast('Impostazioni ripristinate.');
    }, { confirmLabel: 'Ripristina' });
  });
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

document.getElementById('loginForm').addEventListener('submit', loginSubmitAction);

// CORREZIONE (17/10): finché i dati dell'utente non sono caricati, "db" è vuoto.
// Se in quel momento partiva un salvataggio (scheda in background, rete che torna),
// il tool mandava online i dati vuoti e cancellava tutto. Ora non salva niente
// finché openUserData non ha messo in "db" i dati veri.
let dbLoaded = false;
CloudSync.getData = () => dbLoaded ? db : null;
CloudSync.onStatus = setSyncStatus;
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
  applyTheme(db.settings);
  if (!appStarted) {
    appStarted = true;
    window.addEventListener('hashchange', renderRoute);
  }
  renderRoute();
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
  const local = localStorage.getItem(Storage.key) ? Storage.load() : null;

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
