// ChartDesk application shell: state, data flow, panels, modals, shortcuts.

import { $, $$, el, uid, clamp, fmtPrice, fmtCompact, fmtPct, store, debounce, downloadCanvas, fmtClock, fmtDate, hexA, timeAgo } from './util.js';
import { TIMEFRAMES, SYMBOLS, findSymbol, searchSymbols, CLASS_LABEL, tf, tvId } from './catalog.js';
import { INDICATOR_DEFS, INDICATOR_MAP, defaultParams, OSC_COLORS, OVERLAY_COLORS } from './indicators.js';
import { getBars, refreshTail, getCryptoQuotes, getSparkQuotes, getSparkCloses, streamTrades, tvQuotes, onStatus, setApiKey, getApiKey, setUseLive, getUseLive } from './providers.js';
import { ChartView } from './chartview.js';
import { DrawingsLayer, TOOLS } from './drawings.js';
import { icon } from './icons.js';
import { symbolLogo, sparkline } from './logos.js';
import { toast, openModal, closeTop, hasModal, openMenu, closeMenu, promptText, confirmDialog, iconify, field, numberInput, switchEl } from './ui.js';

/* ================================ constants =============================== */
const K = {
  state: 'chartdesk.state.v1',
  wl: 'chartdesk.watchlist.v1',
  dw: 'chartdesk.drawings.v1',
  al: 'chartdesk.alerts.v1',
  lay: 'chartdesk.layouts.v1',
};
const DEFAULT_WL = ['EURUSD', 'GBPUSD', 'XAUUSD', 'USDJPY', 'NAS100', 'BTCUSDT', 'ETHUSDT', 'AAPL'];
const DRAW_COLORS = ['#4c8dff', '#f5a623', '#26a69a', '#ef5350', '#e040fb', '#ffca28', '#29b6f6', '#b0bec5'];

/* ================================== state ================================= */
const saved = store.get(K.state, {});
const state = {
  symbol: 'BTCUSDT',
  interval: '15m',
  chartType: 'candles',
  theme: saved.theme || 'dark',
  log: false,
  pct: false,
  vol: true,
  indicators: Array.isArray(saved.indicators) ? saved.indicators : [
    { uid: uid(), id: 'ema', params: { length: 21 }, visible: true, color: '#f5a623' },
    { uid: uid(), id: 'ema', params: { length: 50 }, visible: true, color: '#4c8dff' },
    { uid: uid(), id: 'rsi', params: { length: 14 }, visible: true, color: '#e040fb', pane: 1 },
  ],
  compare: [],
  bars: [],
  digits: 2,
  replay: { active: false, playing: false, speed: 700, timer: 0 },
};
let watchlist = store.get(K.wl, DEFAULT_WL.slice());
let alerts = store.get(K.al, []);
const lastKnown = new Map();
const lastChange = new Map();
const sparks = new Map(); // sym -> array of closes
const quotes = {}; // psym -> { price, changePct }
const tvPrices = new Map(); // sym -> { price, changePct, changeAbs, mode }
let lastDataAt = 0;
let lastTickAt = 0;
let liveStop = null;
let lastLegendAt = 0;
let lastDetailsAt = 0;
let flashTimer = 0;
let lastAlertAt = 0;

/* ================================ instances =============================== */
let chartView = null;
let drawLayer = null;
let loadToken = 0;
let hoveringBar = null;

/* ================================ bootstrap =============================== */
function boot() {
  document.documentElement.dataset.theme = state.theme;
  iconify(document);

  const prevSym = store.get(K.state, {}) || {};
  const params = new URLSearchParams(location.search);
  const urlSym = params.get('symbol');
  const urlTf = params.get('interval');
  let startSym = prevSym.symbol && findSymbol(prevSym.symbol) ? prevSym.symbol : 'BTCUSDT';
  if (urlSym && findSymbol(urlSym)) startSym = findSymbol(urlSym).sym;
  let startTf = prevSym.interval && TIMEFRAMES.some((t) => t.id === prevSym.interval) ? prevSym.interval : '15m';
  if (urlTf && TIMEFRAMES.some((t) => t.id === urlTf)) startTf = urlTf;
  state.interval = startTf;
  if (prevSym.chartType) state.chartType = prevSym.chartType;

  buildTfBar();
  buildRail();
  buildTabs();
  bindTopbar();
  bindSidebar();
  bindKeys();

  chartView = new ChartView({
    container: $('#chart'),
    theme: state.theme,
    chartType: state.chartType,
    onCrosshair: ({ bar }) => {
      hoveringBar = bar;
      renderLegend(bar);
    },
    onLegend: () => {
      const now = Date.now();
      if (now - lastLegendAt < 120) return;
      lastLegendAt = now;
      renderLegend(hoveringBar);
    },
  });

  drawLayer = new DrawingsLayer({
    container: $('#chartShell'),
    canvas: $('#drawOverlay'),
    chart: chartView.chart,
    series: chartView.series,
    getBars: () => chartView._visibleBars(),
    getDigits: () => state.digits,
    onChange: debounce(() => saveDrawings(), 350),
    onSelect: () => { renderObjects(); renderLegend(hoveringBar); },
    onRequestText: async (existing) => promptText({ title: 'Text note', label: 'Label', value: existing || '', placeholder: 'Breakout retest', confirmText: 'Place' }),
    onStatus: () => {},
  });
  drawLayer.resize();
  drawLayer.onContextMenu = drawingMenu;

  chartView.setIndicators(state.indicators);
  chartView.setVolumeVisible(state.vol);
  chartView.setScale({ log: state.log, pct: state.pct });
  syncScaleChips();

  onStatus((s) => {
    const dot = $('#connDot');
    if (s.kind === 'loading') dot.className = 'dot busy';
    else if (s.kind === 'busy') dot.className = 'dot busy';
    else dot.className = 'dot';
    $('#statusText').textContent = s.text;
    updateCredits();
  });

  selectSymbol(startSym, startTf);
  refreshWatchlist();
  renderAlerts();
  renderObjects();
  startClock();
  startPolling();
  window.addEventListener('resize', () => { chartView.resize(); drawLayer.resize(); });
}

/* ================================= chrome ================================= */
function buildTfBar() {
  const host = $('#tfGroup');
  host.innerHTML = '';
  for (const t of TIMEFRAMES) {
    const b = el('button', { class: `tf-btn ${t.id === state.interval ? 'active' : ''}`, text: t.label, title: t.id });
    b.dataset.tf = t.id;
    b.addEventListener('click', () => setInterval_(t.id));
    host.append(b);
  }
}

function setInterval_(id) {
  if (state.interval === id) return;
  state.interval = id;
  $$('.tf-btn').forEach((b) => b.classList.toggle('active', b.dataset.tf === id));
  selectSymbol(state.symbol, id);
}

const RAIL_ITEMS = [
  { tool: 'cursor', ico: 'cursor', tip: 'Cursor' },
  { sep: 1 },
  { tool: 'trendline', ico: 'trendline', tip: 'Trend line' },
  { tool: 'ray', ico: 'ray', tip: 'Ray' },
  { tool: 'hline', ico: 'hline', tip: 'Horizontal line' },
  { tool: 'hray', ico: 'hray', tip: 'Horizontal ray' },
  { tool: 'vline', ico: 'vline', tip: 'Vertical line' },
  { sep: 1 },
  { tool: 'rect', ico: 'rect', tip: 'Rectangle' },
  { tool: 'ellipse', ico: 'ellipse', tip: 'Ellipse' },
  { tool: 'fib', ico: 'fib', tip: 'Fib retracement' },
  { tool: 'arrow', ico: 'arrow', tip: 'Arrow' },
  { tool: 'text', ico: 'text', tip: 'Text' },
  { tool: 'brush', ico: 'brush', tip: 'Brush' },
  { sep: 1 },
  { tool: 'measure', ico: 'measure', tip: 'Measure' },
  { sep: 1 },
  { act: 'magnet', ico: 'magnet', tip: 'Magnet (snap to OHLC)' },
  { act: 'lock', ico: 'lock', tip: 'Lock drawings' },
  { act: 'hide', ico: 'eye', tip: 'Hide drawings' },
  { act: 'undo', ico: 'undo', tip: 'Delete selected' },
  { act: 'clear', ico: 'trash', tip: 'Remove all drawings', danger: true },
];

function buildRail() {
  const rail = $('#rail');
  rail.innerHTML = '';
  for (const item of RAIL_ITEMS) {
    if (item.sep) { rail.append(el('div', { class: 'rail-sep' })); continue; }
    const b = el('button', { class: `rail-btn ${item.danger ? 'danger' : ''}`, 'data-tip': item.tip });
    b.innerHTML = icon(item.ico, 17);
    if (item.tool) {
      b.dataset.tool = item.tool;
      if (item.tool === 'cursor') b.classList.add('active');
      b.addEventListener('click', () => setTool(item.tool));
    } else {
      b.addEventListener('click', () => railAction(item.act, b));
    }
    rail.append(b);
  }
}

function setTool(tool) {
  drawLayer.setTool(tool);
  $$('.rail-btn[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
}

function railAction(act, btn) {
  if (act === 'magnet') {
    drawLayer.setMagnet(!drawLayer.magnet);
    btn.classList.toggle('on', drawLayer.magnet);
    toast(drawLayer.magnet ? 'Magnet on: points snap to candle OHLC' : 'Magnet off', '', 1800);
  }
  if (act === 'lock') {
    drawLayer.setLocked(!drawLayer.locked);
    btn.classList.toggle('on', drawLayer.locked);
    toast(drawLayer.locked ? 'Drawings locked' : 'Drawings unlocked', '', 1600);
  }
  if (act === 'hide') {
    drawLayer.setHidden(!drawLayer.hidden);
    btn.classList.toggle('on', drawLayer.hidden);
    btn.innerHTML = icon(drawLayer.hidden ? 'eyeoff' : 'eye', 17);
    toast(drawLayer.hidden ? 'Drawings hidden' : 'Drawings visible', '', 1600);
  }
  if (act === 'undo') drawLayer.deleteSelected();
  if (act === 'clear') {
    if (!drawLayer.drawings.length) return toast('Nothing to remove', '', 1600);
    confirmDialog({ title: 'Remove all objects?', message: `This deletes ${drawLayer.drawings.length} drawing(s) on ${state.symbol}. It cannot be undone.`, confirmText: 'Remove all', danger: true })
      .then((ok) => { if (ok) { drawLayer.clear(); renderObjects(); } });
  }
}

function buildTabs() {
  $$('.sp-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.sp-tab').forEach((t) => t.classList.toggle('active', t === tab));
      $$('.sp-pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === tab.dataset.tab));
    });
  });
}

function bindTopbar() {
  $('#symbolBtn').addEventListener('click', openSymbolSearch);
  $('#symAvatar');
  $$('.tb-btn[data-act]').forEach((b) => {
    b.addEventListener('click', () => topAction(b.dataset.act, b));
  });
  $$('.tool-chip').forEach((b) => {
    b.addEventListener('click', () => {
      const act = b.dataset.act;
      if (act === 'log') { state.log = !state.log; setChartScale(); b.classList.toggle('on', state.log); }
      if (act === 'pct') { state.pct = !state.pct; setChartScale(); b.classList.toggle('on', state.pct); }
      if (act === 'autoscale') { chartView.chart.priceScale('right', 0).applyOptions({ autoScale: true }); toast('Price scale set to auto', '', 1500); }
      if (act === 'vol') { state.vol = !state.vol; chartView.setVolumeVisible(state.vol); b.classList.toggle('on', state.vol); persist(); }
      if (act === 'reset') { chartView.chart.timeScale().fitContent(); }
    });
  });
  $$('#replayBar [data-rp]').forEach((b) => b.addEventListener('click', () => replayAction(b.dataset.rp)));
  $('#rpSpeed').addEventListener('change', (e) => {
    state.replay.speed = +e.target.value;
    if (state.replay.playing) { stopReplayTimer(); startReplayTimer(); }
  });
}

function setChartScale() {
  chartView.setScale({ log: state.log, pct: state.pct });
  syncScaleChips();
  persist();
}

function syncScaleChips() {
  const on = { log: state.log, pct: state.pct, vol: state.vol && chartView?._hasVol !== false };
  $$('.tool-chip').forEach((b) => {
    const a = b.dataset.act;
    if (a in on) b.classList.toggle('on', !!on[a]);
  });
}

function topAction(act, btn) {
  if (act === 'search') return openSymbolSearch();
  if (act === 'charttype') return chartTypeMenu(btn);
  if (act === 'indicators') return openIndicatorPicker();
  if (act === 'compare') return openCompare();
  if (act === 'alert') return openAlertCreate();
  if (act === 'replay') return openReplaySetup();
  if (act === 'screenshot') return takeScreenshot();
  if (act === 'layouts') return layoutsMenu(btn);
  if (act === 'theme') return toggleTheme(btn);
  if (act === 'settings') return openSettings();
  if (act === 'panel') return $('#sidepanel').classList.toggle('open');
}

function toggleTheme(btn) {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = state.theme;
  chartView.setTheme(state.theme);
  if (btn) btn.innerHTML = icon(state.theme === 'dark' ? 'moon' : 'sun', 18);
  persist();
}

function chartTypeMenu(anchor) {
  const types = [
    { id: 'candles', icon: 'candle', text: 'Candles' },
    { id: 'ha', icon: 'ha', text: 'Heikin Ashi' },
    { id: 'bar', icon: 'bar', text: 'Bars' },
    { id: 'line', icon: 'line', text: 'Line' },
    { id: 'area', icon: 'area', text: 'Area' },
  ];
  openMenu(anchor, types.map((t) => ({
    icon: t.icon, text: t.text, active: state.chartType === t.id,
    onClick: () => {
      state.chartType = t.id;
      chartView.setChartType(t.id);
      drawLayer.series = chartView.series;
      persist();
      renderLegend();
    },
  })), { alignRight: true });
}

/* ================================== data ================================== */
async function selectSymbol(symStr, interval) {
  const sym = findSymbol(symStr) || findSymbol('BTCUSDT');
  state.symbol = sym.sym;
  state.interval = interval || state.interval;
  const token = ++loadToken;

  $('#symName').textContent = sym.sym;
  $('#symDesc').textContent = sym.name;
  $('#symAvatar').innerHTML = symbolLogo(sym.sym, sym.cls, 28);
  $('#lgLogo').innerHTML = symbolLogo(sym.sym, sym.cls, 20);
  $('#lgSymbol').textContent = sym.sym;
  $('#lgExch').textContent = sym.exch;
  $('#lgTf').textContent = state.interval;
  updateActiveWatchlist();

  if (state.replay.active) exitReplay();
  stopLiveFeed();
  setLoading(true, `Loading ${sym.sym} · ${state.interval}`);
  hideState();

  try {
    const [bars, tv] = await Promise.all([
      getBars(sym, state.interval),
      tvQuotes([sym]).catch(() => ({})),
    ]);
    if (token !== loadToken) return;
    applyBars(alignToTv(bars, sym, tv[tvId(sym)]), sym);
    persist();
  } catch (e) {
    if (token !== loadToken) return;
    handleLoadError(e, sym);
  } finally {
    if (token === loadToken) setLoading(false);
  }
}

// History and the live quote come from different vendors. Shift the series onto
// the current quote so the last candle, the label and TradingView all agree.
function alignToTv(bars, sym, q) {
  if (!q || !Number.isFinite(q.price) || !bars || !bars.length) return bars;
  tvPrices.set(sym.sym, q);
  if (Number.isFinite(q.changePct)) lastChange.set(sym.sym, q.changePct);
  const off = q.price - bars[bars.length - 1].close;
  if (!Number.isFinite(off) || Math.abs(off / q.price) > 0.03) return bars;
  if (Math.abs(off) < 1e-10) return bars;
  return bars.map((b) => ({
    ...b,
    open: b.open + off, high: b.high + off, low: b.low + off, close: b.close + off,
  }));
}

function applyBars(bars, sym) {
  state.bars = bars;
  state.digits = sym.digits;
  const last = bars[bars.length - 1];
  lastKnown.set(sym.sym, last.close);
  const cutoff = Math.floor(last.time / 86400) * 86400;
  const ref = bars.find((b) => b.time >= cutoff) || bars[0];
  const tvq = tvPrices.get(sym.sym);
  if (tvq && Number.isFinite(tvq.changePct)) {
    lastChange.set(sym.sym, tvq.changePct);
  } else if (ref && ref.close) {
    lastChange.set(sym.sym, ((last.close - ref.close) / ref.close) * 100);
  }
  lastDataAt = Date.now();
  sparks.set(sym.sym, bars.slice(-40).map((b) => b.close));
  hoveringBar = null;
  chartView.setData(bars, { digits: sym.digits, interval: state.interval, symbol: sym.sym });
  syncScaleChips();
  drawLayer.series = chartView.series;
  drawLayer.resize();
  drawLayer.setDrawings(drawingsFor(sym.sym));
  renderLegend();
  renderObjects();
  renderDetails();
  updateActiveWatchlist();
  renderWatchlist();
  updateCredits();
  startLiveFeed(sym);
}

/* ------------------------------- live feed -------------------------------- */
function stopLiveFeed() {
  if (liveStop) { try { liveStop(); } catch {} liveStop = null; }
  livePill(false);
}

function startLiveFeed(sym) {
  stopLiveFeed();
  lastTickAt = Date.now();
  if (!sym || sym.provider !== 'binance') return;
  liveStop = streamTrades(sym, ({ price }) => {
    if (state.replay.active || !state.bars.length) return;
    const b = state.bars[state.bars.length - 1];
    if (!b || !Number.isFinite(price)) return;
    lastTickAt = Date.now();
    const prev = b.close;
    if (price === prev) return;
    if (!chartView.patchLastBar(price)) return;
    lastKnown.set(sym.sym, price);
    lastDataAt = Date.now();
    if (quotes[sym.psym]) quotes[sym.psym].price = price;
    flashPrice(price, price > prev);
    updateWatchPrice(sym.sym, price);
    if (Date.now() - lastAlertAt > 1000) { lastAlertAt = Date.now(); checkAlerts(); }
  }, (st) => livePill(st === 'live'));
}

function livePill(on) {
  const node = $('#livePill');
  if (node) node.hidden = !on;
}

function flashPrice(price, up) {
  const node = $('#lgLast');
  if (!node) return;
  node.textContent = fmtPrice(price, state.digits);
  node.classList.remove('up', 'down');
  void node.offsetWidth;
  node.classList.add(up ? 'up' : 'down');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => node.classList.remove('up', 'down'), 420);
}

function updateWatchPrice(symStr, price) {
  const node = document.querySelector(`.wl-row[data-sym="${symStr}"] .wl-price`);
  if (!node) return;
  const digits = (findSymbol(symStr) || { digits: 2 }).digits;
  node.textContent = fmtPrice(price, digits);
}

function handleLoadError(e, sym) {
  console.warn('load failed', e);
  const code = e.code || '';
  // Never leave the previous instrument's candles under a new symbol's name.
  state.bars = [];
  try { chartView.clearData(); } catch {}
  $('#lgOhlc').innerHTML = '';
  $('#lgInd').innerHTML = '';
  if (code === 'RELAY_BUSY') {
    showState({
      title: 'Feed is busy',
      body: 'The free relay that carries Yahoo data is rate limiting this IP. It clears by itself within a minute. Crypto pairs load straight from Binance and are never affected.',
      actions: [
        { text: 'Try again', primary: true, onClick: () => selectSymbol(state.symbol, state.interval) },
        { text: 'Open Bitcoin', onClick: () => selectSymbol('BTCUSDT', state.interval) },
      ],
    });
    return;
  }
  if (code === 'NO_SYMBOL') {
    showState({
      title: `${sym.sym} is not in the free feed`,
      body: `Yahoo has no series for ${sym.y || sym.sym}. Try the ticker exactly as the exchange writes it, for example EURUSD or AAPL, or pick a symbol from the search list.`,
      actions: [{ text: 'Search symbols', primary: true, onClick: openSymbolSearch }],
    });
    return;
  }
  showState({
    title: 'Could not load this market',
    body: e.message || 'Unknown error.',
    actions: [
      { text: 'Retry', primary: true, onClick: () => selectSymbol(state.symbol, state.interval) },
      { text: 'Search symbols', onClick: openSymbolSearch },
    ],
  });
  toast(e.message || 'Load failed', 'error', 5000);
}

function showState({ title, body, actions = [] }) {
  const card = $('#stateCard');
  card.innerHTML = '';
  card.append(el('h3', { text: title }));
  card.append(el('p', { text: body }));
  const row = el('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' } });
  for (const a of actions) {
    const b = el('button', { class: `btn ${a.primary ? 'primary' : 'ghost'}`, text: a.text });
    b.addEventListener('click', a.onClick);
    row.append(b);
  }
  card.append(row);
  $('#chartState').hidden = false;
}
function hideState() { $('#chartState').hidden = true; }

function setLoading(on, text) {
  $('#loading').hidden = !on;
  if (text) $('#loadingText').textContent = text;
}

/* --------------------------------- polling -------------------------------- */
function startPolling() {
  // 5s: quote for the symbol on screen only, which keeps the request count low
  // while the price still matches TradingView second by second.
  setInterval(async () => {
    if (document.hidden || state.replay.active || !state.bars.length) return;
    const sym = findSymbol(state.symbol);
    if (!sym) return;
    const q = await tvQuotes([sym], { maxAge: 3000 });
    const hit = q[tvId(sym)];
    if (hit) {
      tvPrices.set(sym.sym, hit);
      lastKnown.set(sym.sym, hit.price);
      if (Number.isFinite(hit.changePct)) lastChange.set(sym.sym, hit.changePct);
      if (sym.psym) quotes[sym.psym] = { price: hit.price, changePct: hit.changePct };
      lastDataAt = Date.now();
      if (sym.provider !== 'binance') {
        const prev = state.bars[state.bars.length - 1].close;
        if (chartView.patchLastBar(hit.price)) {
          flashPrice(hit.price, hit.price >= prev);
          updateWatchPrice(sym.sym, hit.price);
        }
      }
    }
    if (sym.provider === 'binance' && Date.now() - lastTickAt > 45_000) {
      // The trade socket died or is blocked: fall back to REST so the chart still moves.
      try {
        const fresh = await refreshTail(sym, state.interval, state.bars);
        if (fresh) {
          chartView.updateLastBar(state.bars);
          lastTickAt = Date.now();
          lastDataAt = Date.now();
          if (!hoveringBar) renderLegend();
        }
      } catch { /* transient */ }
    }
    checkAlerts();
  }, 3_000);

  // 30s: every watchlist row plus its sparkline.
  setInterval(async () => {
    if (document.hidden) return;
    await refreshPrices();
    refreshSparks();
    checkAlerts();
  }, 30_000);

  // 90s: true OHLC re-sync for the active non-crypto chart, view preserved.
  setInterval(async () => {
    if (document.hidden || !state.bars.length || state.replay.active) return;
    const sym = findSymbol(state.symbol);
    if (!sym || sym.provider === 'binance') return;
    try {
      const fresh = await getBars(sym, state.interval, { force: true });
      if (fresh) {
        state.bars = alignToTv(fresh, sym, tvPrices.get(sym.sym));
        chartView.refreshData(state.bars);
      }
    } catch { /* keep the patched bars */ }
  }, 90_000);
}

async function refreshPrices() {
  const syms = watchlist.map(findSymbol).filter(Boolean);
  if (!syms.length) return;
  try {
    const q = await tvQuotes(syms);
    for (const s of syms) {
      const hit = q[tvId(s)];
      if (!hit) continue;
      tvPrices.set(s.sym, hit);
      lastKnown.set(s.sym, hit.price);
      if (Number.isFinite(hit.changePct)) lastChange.set(s.sym, hit.changePct);
      if (s.psym) quotes[s.psym] = { price: hit.price, changePct: hit.changePct };
    }
  } catch { /* fall through to the direct feeds */ }

  // Crypto fallback straight from Binance when TradingView did not answer.
  const missing = syms.filter((s) => s.provider === 'binance' && !tvPrices.has(s.sym));
  if (missing.length) {
    try {
      const cq = await getCryptoQuotes(missing);
      for (const [k, v] of Object.entries(cq)) {
        const s = missing.find((x) => x.psym === k);
        if (s) { lastKnown.set(s.sym, v.price); quotes[k] = v; }
      }
    } catch { /* ignore */ }
  }
  renderWatchlist();
  updateCredits();
}

async function refreshSparks() {
  const rest = watchlist.map(findSymbol).filter((s) => s && s.provider !== 'binance');
  if (!rest.length) return;
  try {
    const q = await getSparkQuotes(rest);
    for (const s of rest) {
      const hit = q[s.y];
      if (hit && hit.spark && hit.spark.length > 2) sparks.set(s.sym, hit.spark);
      // Delayed instruments fall back to the session change from the spark series.
      const tv = tvPrices.get(s.sym);
      if (hit && Number.isFinite(hit.changePct) && !tv) {
        lastChange.set(s.sym, hit.changePct);
      }
    }
    renderWatchlist();
  } catch { /* sparklines are cosmetic */ }
}

async function refreshWatchlist() {
  await refreshPrices();
  refreshSparks();
}

/* ================================= legend ================================= */
function renderLegend(barOverride) {
  if (!chartView) return;
  const d = chartView.legendData();
  const sym = findSymbol(state.symbol) || {};
  const bar = barOverride || d.bar;
  const prev = d.prev;
  const digits = state.digits;

  $('#lgSymbol').textContent = state.symbol;
  $('#lgExch').textContent = sym.exch || '';
  $('#lgTf').textContent = state.interval + (state.chartType === 'ha' ? ' · HA' : '');

  if (!bar) { $('#lgOhlc').innerHTML = ''; return; }
  // On the live bar show the daily change, like TradingView does. When the user
  // hovers an older candle show that candle against the one before it.
  const isLast = !barOverride && state.bars.length > 0 && bar.time === state.bars[state.bars.length - 1].time;
  const dailyPct = lastChange.get(state.symbol);
  let chg;
  let pct;
  if (isLast && Number.isFinite(dailyPct)) {
    pct = dailyPct;
    chg = bar.close - bar.close / (1 + pct / 100);
  } else {
    chg = prev ? bar.close - prev.close : d.change;
    pct = prev && prev.close ? (chg / prev.close) * 100 : d.changePct;
  }
  const cls = chg >= 0 ? 'up' : 'down';
  const parts = [
    ['O', bar.open], ['H', bar.high], ['L', bar.low], ['C', bar.close],
  ].map(([k, v]) => `<span>${k} <b>${fmtPrice(v, digits)}</b></span>`).join('');
  const change = `<span class="${cls}"><b>${chg >= 0 ? '+' : ''}${fmtPrice(chg, digits)} (${fmtPct(pct)})</b></span>`;
  const vol = bar.volume ? `<span>Vol <b>${fmtCompact(bar.volume)}</b></span>` : '';
  $('#lgOhlc').innerHTML = parts + change + vol;
  const lastNode = $('#lgLast');
  if (lastNode) lastNode.textContent = fmtPrice(bar.close, digits);

  // indicator values
  const rows = [];
  for (const inst of d.indicators) {
    const params = Object.values(inst.params || {}).filter((v) => v !== undefined && v !== null).join(' ');
    const vals = inst.values.map((v) => `<span class="v">${fmtPrice(v.value, Math.min(state.digits + 2, 4))}</span>`).join(' ');
    const color = inst.values[0].color || '#4c8dff';
    rows.push(`<div class="lg-ind-row"><span class="lg-dot" style="background:${color}"></span><span>${inst.name}${params ? ' ' + params : ''}</span>${vals}</div>`);
  }
  for (const c of state.compare) {
    const b = c.bars && c.bars.length ? c.bars[c.bars.length - 1].close : null;
    const base = c.bars && c.bars.length ? c.bars[0].close : null;
    if (b && base) {
      const p = ((b - base) / base) * 100;
      rows.push(`<div class="lg-ind-row"><span class="lg-dot" style="background:${c.color}"></span><span>${c.symbol}</span><span class="v">${fmtPct(p)}</span></div>`);
    }
  }
  if (d.replay) {
    rows.push(`<div class="lg-ind-row"><span class="lg-dot" style="background:var(--warn)"></span><span style="color:var(--warn)">REPLAY</span><span class="v">${d.replay.index + 1} / ${d.replay.total}</span></div>`);
  }
  $('#lgInd').innerHTML = rows.join('');
  const now = Date.now();
  if (now - lastDetailsAt > 2000) { lastDetailsAt = now; renderDetails(); }
}

/* ================================ watchlist =============================== */
function renderWatchlist() {
  const host = $('#wlList');
  if (!host) return;
  host.innerHTML = '';
  if (!watchlist.length) {
    host.append(el('div', { class: 'ob-empty', text: 'Your watchlist is empty. Add a symbol with the box above.' }));
    return;
  }
  for (const symStr of watchlist) {
    const sym = findSymbol(symStr);
    if (!sym) continue;
    const q = sym.provider === 'binance' ? quotes[sym.psym] : null;
    const price = q ? q.price : lastKnown.get(sym.sym);
    const chg = q ? q.changePct : (lastChange.has(sym.sym) ? lastChange.get(sym.sym) : null);
    const row = el('div', { class: `wl-row ${state.symbol === sym.sym ? 'active' : ''}` });
    row.dataset.sym = sym.sym;
    row.append(el('span', { class: 'wl-logo', html: symbolLogo(sym.sym, sym.cls, 24) }));
    row.append(el('div', { class: 'wl-id' },
      el('span', { class: 'wl-sym', text: sym.sym }),
      el('span', { class: 'wl-name', text: sym.name }),
    ));
    row.append(el('span', { class: 'wl-price', text: price ? fmtPrice(price, sym.digits) : '--' }));
    const chgNode = el('span', {
      class: `wl-chg ${chg === null ? 'flat' : chg >= 0 ? 'up' : 'down'}`,
      text: chg === null ? '--' : fmtPct(chg),
    });
    row.append(chgNode);
    const del = el('button', { class: 'wl-del', title: 'Remove from watchlist' });
    del.innerHTML = icon('x', 12);
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      watchlist = watchlist.filter((s) => s !== sym.sym);
      store.set(K.wl, watchlist);
      renderWatchlist();
    });
    row.append(del);
    row.addEventListener('click', () => selectSymbol(sym.sym, state.interval));
    host.append(row);
  }
  const note = $('#wlNote');
  if (note) note.textContent = 'Live quotes come from TradingView. Crypto is also streamed from Binance. Candle history is free data, no account, no key.';
}

function updateActiveWatchlist() {
  $$('.wl-row').forEach((r) => r.classList.toggle('active', r.dataset.sym === state.symbol));
}

function bindSidebar() {
  $('#wlAdd').addEventListener('click', () => {
    const v = $('#wlSearch').value.trim();
    if (!v) return openSymbolSearch();
    const sym = findSymbol(v);
    if (!sym) return toast('Symbol not recognised', 'error');
    if (!watchlist.includes(sym.sym)) { watchlist.push(sym.sym); store.set(K.wl, watchlist); }
    $('#wlSearch').value = '';
    renderWatchlist();
    selectSymbol(sym.sym, state.interval);
  });
  $('#wlSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#wlAdd').click(); });
  $('#wlRefresh').addEventListener('click', () => { refreshWatchlist(); toast('Quotes refreshed', '', 1400); });
  $('#alertNew').addEventListener('click', openAlertCreate);
  $('#obClear').addEventListener('click', () => railAction('clear'));
  $('#obHide').addEventListener('click', () => railAction('hide', $('#obHide')));
  $('#obLock').addEventListener('click', () => railAction('lock', $('#obLock')));
  $('#obDelete').addEventListener('click', () => { drawLayer.deleteSelected(); renderObjects(); });
  $('#styleWidth').addEventListener('input', (e) => {
    if (drawLayer.selected) { drawLayer.updateSelectedStyle({ width: +e.target.value }); renderObjects(); }
  });
}

/* ================================= objects ================================ */
function renderObjects() {
  if (!drawLayer) return;
  const host = $('#obList');
  const list = drawLayer.drawings;
  $('#obCount').textContent = `${list.length} object${list.length === 1 ? '' : 's'}`;
  host.innerHTML = '';
  if (!list.length) {
    host.append(el('div', { class: 'ob-empty', html: 'No drawings yet.<br>Pick a tool on the left rail.' }));
  } else {
    for (const d of list) {
      const row = el('div', { class: `ob-item ${drawLayer.selected === d ? 'active' : ''}` });
      row.append(el('span', { class: 'swatch', style: { background: d.style?.color || '#4c8dff' } }));
      row.append(el('span', { class: 'nm', text: TOOLS[d.type]?.name || d.type }));
      row.append(el('span', { class: 'dim small', text: d.text ? d.text.slice(0, 14) : '' }));
      row.addEventListener('click', () => { drawLayer.select(d.id); renderObjects(); });
      host.append(row);
    }
  }
  const sel = drawLayer.selected;
  const styleBox = $('#obStyle');
  styleBox.hidden = !sel;
  if (sel) {
    const cols = $('#styleColors');
    cols.innerHTML = '';
    for (const c of DRAW_COLORS) {
      const dot = el('button', {
        class: `color-dot ${(sel.style?.color || '#4c8dff') === c ? 'active' : ''}`,
        style: { background: c }, title: c,
      });
      dot.addEventListener('click', () => { drawLayer.updateSelectedStyle({ color: c }); renderObjects(); });
      cols.append(dot);
    }
    $('#styleWidth').value = sel.style?.width || 2;
  }
  document.querySelectorAll('.ob-item').forEach((n) => {
    n.addEventListener('dblclick', () => { drawLayer.setTool('cursor'); });
  });
}

function drawingMenu(drawing, x, y) {
  openMenu({ x, y }, [
    { text: 'Duplicate', icon: 'layers', onClick: () => {
      const copy = { ...JSON.parse(JSON.stringify(drawing)), id: uid() };
      drawLayer.drawings.push(copy);
      drawLayer.select(copy.id);
      saveDrawings(); renderObjects(); drawLayer.invalidate();
    } },
    { text: 'Bring to front', icon: 'layers', onClick: () => {
      drawLayer.drawings = drawLayer.drawings.filter((d) => d.id !== drawing.id).concat([drawing]);
      saveDrawings(); renderObjects(); drawLayer.invalidate();
    } },
    { sep: true },
    { text: 'Delete', icon: 'trash', danger: true, onClick: () => { drawLayer.deleteSelected(); renderObjects(); } },
  ]);
}

/* --------------------------- drawings persistence -------------------------- */
function drawingsFor(sym) {
  const all = store.get(K.dw, {});
  return all[sym] || [];
}
function saveDrawings() {
  const all = store.get(K.dw, {});
  const list = drawLayer.getDrawings();
  if (list.length) all[state.symbol] = list;
  else delete all[state.symbol];
  store.set(K.dw, all);
  renderObjects();
}

/* ================================= details ================================ */
function renderDetails() {
  if (!chartView || !state.bars.length) return;
  const host = $('#spDetails');
  const sym = findSymbol(state.symbol) || {};
  const bars = state.bars;
  const last = bars[bars.length - 1];
  const dayAgo = bars.filter((b) => b.time > last.time - 86400);
  const hi = dayAgo.length ? Math.max(...dayAgo.map((b) => b.high)) : last.high;
  const lo = dayAgo.length ? Math.min(...dayAgo.map((b) => b.low)) : last.low;
  const first = bars[0];
  const rangePct = first ? ((last.close - first.close) / first.close) * 100 : 0;
  const rows = [
    ['Symbol', sym.sym],
    ['Class', CLASS_LABEL[sym.cls] || sym.cls],
    ['Exchange', sym.exch],
    ['Timeframe', state.interval],
    ['Bars loaded', String(bars.length)],
    ['Last price', fmtPrice(last.close, state.digits)],
    ['24h high', fmtPrice(hi, state.digits)],
    ['24h low', fmtPrice(lo, state.digits)],
    ['Range shown', fmtPct(rangePct)],
    ['Data feed', sym.provider === 'binance' ? 'Binance, live' : getUseLive() ? 'Twelve Data' : 'Yahoo, free feed'],
    ...(sym.note ? [['Contract', sym.note]] : []),
  ];
  const spark = sparks.get(sym.sym);
  const chgSign = (lastChange.get(sym.sym) || 0) >= 0;
  host.innerHTML =
    `<div class="det-head">
       <span class="det-logo">${symbolLogo(sym.sym, sym.cls, 34)}</span>
       <div class="det-id"><b>${sym.sym}</b><span>${sym.name}</span></div>
     </div>` +
    (spark && spark.length > 3 ? `<div class="det-spark">${sparkline(spark, { width: 280, height: 48, color: chgSign ? '#2ee6a8' : '#ff5f7a' })}</div>` : '') +
    `<div class="det-title">Instrument</div>` +
    rows.map(([k, v]) => `<div class="det-row"><span>${k}</span><span>${v}</span></div>`).join('') +
    `<div class="det-title" style="margin-top:14px">Shortcuts</div>` +
    `<div class="det-row"><span>Search</span><span>Ctrl K</span></div>` +
    `<div class="det-row"><span>Indicators</span><span>Ctrl I</span></div>` +
    `<div class="det-row"><span>Theme</span><span>Ctrl J</span></div>` +
    `<div class="det-row"><span>Delete object</span><span>Del</span></div>`;
}

/* ================================== alerts ================================ */
function alertPriceFor(symStr) {
  if (symStr === state.symbol && state.bars.length) return state.bars[state.bars.length - 1].close;
  const sym = findSymbol(symStr);
  if (!sym) return null;
  const q = sym.provider === 'binance' ? quotes[sym.psym] : null;
  if (q) return q.price;
  return lastKnown.get(sym.sym) ?? null;
}

function checkAlerts() {
  let changed = false;
  for (const a of alerts) {
    if (a.triggeredAt) continue;
    const price = alertPriceFor(a.sym);
    if (price === null) continue;
    const hit = a.cond === 'above' ? price >= a.price : price <= a.price;
    if (hit) {
      a.triggeredAt = Date.now();
      a.triggeredPrice = price;
      changed = true;
      const msg = `${a.sym} ${a.cond} ${fmtPrice(a.price, (findSymbol(a.sym) || { digits: 2 }).digits)} (now ${fmtPrice(price, (findSymbol(a.sym) || { digits: 2 }).digits)})`;
      toast(msg, 'warn', 9000, 'Alert:');
      notify(msg);
    }
  }
  if (changed) { store.set(K.al, alerts); renderAlerts(); }
}

function notify(text) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    try { new Notification('ChartDesk alert', { body: text }); } catch {}
  }
}

function renderAlerts() {
  const host = $('#alList');
  if (!host) return;
  host.innerHTML = '';
  if (!alerts.length) {
    host.append(el('div', { class: 'ob-empty', html: 'No alerts yet.<br>They fire while this tab is open.' }));
    return;
  }
  for (const a of alerts.slice().reverse()) {
    const row = el('div', { class: `al-item ${a.triggeredAt ? 'triggered' : ''}` });
    const digits = (findSymbol(a.sym) || { digits: 2 }).digits;
    row.append(el('div', { class: 'al-main' },
      el('span', { class: 'al-desc', text: `${a.sym} ${a.cond === 'above' ? 'crosses above' : 'crosses below'} ${fmtPrice(a.price, digits)}` }),
      el('span', { class: 'al-meta', text: a.triggeredAt ? `Triggered ${timeAgo(a.triggeredAt)} at ${fmtPrice(a.triggeredPrice, digits)}` : `Set ${timeAgo(a.createdAt)}${a.note ? ' · ' + a.note : ''}` }),
    ));
    const del = el('button', { class: 'al-del', title: 'Delete alert' });
    del.innerHTML = icon('x', 12);
    del.addEventListener('click', () => {
      alerts = alerts.filter((x) => x.id !== a.id);
      store.set(K.al, alerts);
      renderAlerts();
    });
    row.append(del);
    host.append(row);
  }
}

function openAlertCreate() {
  const price = alertPriceFor(state.symbol) ?? 0;
  const condSel = el('select', { class: 'select' },
    el('option', { value: 'above', text: 'Crosses above' }),
    el('option', { value: 'below', text: 'Crosses below' }),
  );
  const priceInput = el('input', { class: 'input', type: 'number', value: price, step: 'any' });
  const noteInput = el('input', { class: 'input', placeholder: 'Optional note' });
  const body = el('div', {},
    field('Condition', condSel),
    field('Price', priceInput, `Current ${state.symbol} price is ${fmtPrice(price, state.digits)}`),
    field('Note', noteInput),
    el('div', { class: 'hint', text: 'Alerts are evaluated in this browser every few seconds. Allow notifications to get desktop pop-ups.' }),
  );
  const ok = el('button', { class: 'btn primary', text: 'Create alert' });
  const cancel = el('button', { class: 'btn ghost', text: 'Cancel' });
  const m = openModal({ title: `Alert on ${state.symbol}`, body, footer: [cancel, ok] });
  cancel.addEventListener('click', () => m.close());
  ok.addEventListener('click', () => {
    const p = parseFloat(priceInput.value);
    if (!Number.isFinite(p)) return toast('Enter a valid price', 'error');
    alerts.push({ id: uid(), sym: state.symbol, cond: condSel.value, price: p, note: noteInput.value.trim(), createdAt: Date.now() });
    store.set(K.al, alerts);
    renderAlerts();
    m.close();
    toast(`Alert set: ${state.symbol} ${condSel.value} ${fmtPrice(p, state.digits)}`, 'ok');
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    if (document.querySelector('.sp-tab[data-tab="alerts"]')) {
      document.querySelector('.sp-tab[data-tab="alerts"]').click();
    }
  });
}

/* =============================== symbol search ============================= */
function openSymbolSearch() {
  const input = el('input', { class: 'sym-search-input', placeholder: 'Search symbol, exchange or paste EUR/USD…', spellcheck: 'false' });
  const results = el('div', { class: 'sym-results' });
  const head = el('div', { class: 'modal-head' }, el('h2', { text: 'Symbol search' }), el('span', { class: 'sub', text: 'Ctrl K' }),
    el('button', { class: 'modal-x' }, ));
  head.querySelector('.modal-x').innerHTML = icon('x', 16);
  const modal = el('div', { class: 'modal wide' }, head, input, results);
  const backdrop = el('div', { class: 'modal-backdrop' }, modal);
  document.getElementById('modalRoot').append(backdrop);
  $('#modalRoot');
  const close = () => backdrop.remove();
  head.querySelector('.modal-x').addEventListener('click', close);
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });

  let sel = 0;
  let items = [];

  const render = () => {
    const q = input.value;
    items = searchSymbols(q, 40);
    results.innerHTML = '';
    if (!items.length) { results.append(el('div', { class: 'sym-empty', text: 'No match. Try EUR/USD or BTCUSDT.' })); return; }
    let cls = null;
    items.forEach((s, i) => {
      if (s.cls !== cls) {
        cls = s.cls;
        results.append(el('div', { class: 'sym-group', text: CLASS_LABEL[cls] || cls }));
      }
      const row = el('div', { class: `sym-item ${i === sel ? 'sel' : ''}` });
      row.append(el('div', { class: 'av', html: symbolLogo(s.sym, s.cls, 30) }));
      row.append(el('div', { class: 'meta' },
        el('span', { class: 'nm', text: s.sym }),
        el('span', { class: 'desc', text: s.name + (s.custom ? ' · added on the fly' : '') }),
      ));
      row.append(el('span', { class: 'exch', text: s.exch }));
      row.addEventListener('click', () => pick(s));
      row.addEventListener('mousemove', () => { sel = i; });
      results.append(row);
    });
  };

  const pick = (s) => {
    close();
    selectSymbol(s.sym, state.interval);
    if (!watchlist.includes(s.sym) && watchlist.length < 40) { /* keep list clean */ }
  };

  input.addEventListener('input', () => { sel = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return close();
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = clamp(sel + 1, 0, items.length - 1); render(); scrollSel(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); sel = clamp(sel - 1, 0, items.length - 1); render(); scrollSel(); }
    if (e.key === 'Enter') { if (items[sel]) pick(items[sel]); }
  });
  const scrollSel = () => {
    const node = results.querySelectorAll('.sym-item')[sel];
    if (node) node.scrollIntoView({ block: 'nearest' });
  };
  render();
  setTimeout(() => input.focus(), 40);
}

function baseAsset(sym) {
  if (sym.includes('/')) return sym.split('/')[0];
  const m = sym.match(/^([A-Z]{3})(USD|JPY|EUR|GBP|CHF|CAD|AUD|NZD|MXN|ZAR)$/);
  if (m) return m[1];
  const c = sym.match(/^(BTC|ETH|SOL|BNB|XRP|ADA|DOGE|AVAX|LINK|LTC|DOT|TRX|SUI|TON|NEAR|APT)/);
  if (c && /USDT$/.test(sym)) return c[1];
  return sym.slice(0, 3);
}

/* ============================= indicator picker =========================== */
function openIndicatorPicker() {
  const input = el('input', { class: 'input', placeholder: 'Search indicators…' });
  const grid = el('div', { class: 'ind-grid' });
  const activeHost = el('div', { class: 'ind-active' });

  const renderActive = () => {
    activeHost.innerHTML = '';
    if (!state.indicators.length) { activeHost.append(el('div', { class: 'hint', text: 'No indicators on the chart.' })); return; }
    for (const inst of state.indicators) {
      const def = INDICATOR_MAP[inst.id];
      const row = el('div', { class: 'ind-row' });
      row.append(el('span', { class: 'sw', style: { background: inst.color } }));
      row.append(el('span', { class: 'nm', text: def?.name || inst.id }));
      row.append(el('span', { class: 'p', text: Object.entries(inst.params || {}).map(([k, v]) => `${k}:${v}`).join(' ') }));
      const eye = el('button', { class: 'mini-btn', title: 'Show / hide' });
      eye.innerHTML = icon(inst.visible === false ? 'eyeoff' : 'eye', 14);
      eye.addEventListener('click', () => {
        inst.visible = inst.visible === false;
        chartView.setIndicators(state.indicators);
        renderActive(); persist(); renderLegend();
      });
      const gear = el('button', { class: 'mini-btn', title: 'Settings' });
      gear.innerHTML = icon('gear', 14);
      gear.addEventListener('click', () => openIndicatorParams(inst, () => { renderActive(); renderLegend(); }));
      const del = el('button', { class: 'mini-btn danger', title: 'Remove' });
      del.innerHTML = icon('x', 14);
      del.addEventListener('click', () => {
        state.indicators = state.indicators.filter((i) => i.uid !== inst.uid);
        chartView.setIndicators(state.indicators);
        renderActive(); persist(); renderLegend();
      });
      row.append(eye, gear, del);
      activeHost.append(row);
    }
  };

  const add = (def) => {
    const overlay = def.cat === 'overlay';
    const sameCat = state.indicators.filter((i) => INDICATOR_MAP[i.id]?.cat === def.cat).length;
    const palette = overlay ? OVERLAY_COLORS : OSC_COLORS;
    const inst = {
      uid: uid(), id: def.id, params: defaultParams(def), visible: true,
      color: palette[sameCat % palette.length],
    };
    state.indicators.push(inst);
    chartView.setIndicators(state.indicators);
    renderActive(); persist(); renderLegend();
    toast(`${def.name} added`, 'ok', 1600);
  };

  const renderGrid = () => {
    const q = input.value.trim().toLowerCase();
    grid.innerHTML = '';
    const groups = [
      ['Overlays', INDICATOR_DEFS.filter((d) => d.cat === 'overlay')],
      ['Oscillators & volume', INDICATOR_DEFS.filter((d) => d.cat === 'pane')],
    ];
    for (const [label, defs] of groups) {
      const hits = defs.filter((d) => !q || d.name.toLowerCase().includes(q) || d.full.toLowerCase().includes(q) || d.id.includes(q));
      if (!hits.length) continue;
      grid.append(el('div', { class: 'ind-cat', text: label }));
      for (const d of hits) {
        const item = el('div', { class: 'ind-item' });
        item.append(el('span', { class: 'ab', text: d.name.split(' ')[0].slice(0, 5).toUpperCase() }));
        item.append(el('span', { class: 'nm', text: d.full }));
        item.addEventListener('click', () => add(d));
        grid.append(item);
      }
    }
    if (!grid.children.length) grid.append(el('div', { class: 'hint', text: 'Nothing matches that search.' }));
  };

  const body = el('div', {},
    el('div', { class: 'field' }, input),
    el('div', { class: 'det-title', text: 'On this chart' }),
    activeHost,
    el('div', { class: 'det-title', style: { marginTop: '16px' }, text: 'Add indicator' }),
    grid,
  );
  const done = el('button', { class: 'btn primary', text: 'Done' });
  const m = openModal({ title: 'Indicators', sub: 'Ctrl I', body, footer: [done], className: 'wide' });
  done.addEventListener('click', () => m.close());
  input.addEventListener('input', renderGrid);
  renderActive();
  renderGrid();
}

function openIndicatorParams(inst, onChange) {
  const def = INDICATOR_MAP[inst.id];
  if (!def) return;
  const inputs = {};
  const body = el('div', {});
  for (const p of def.params || []) {
    const inp = numberInput(inst.params[p.k], { min: p.min, max: p.max, step: p.step });
    inputs[p.k] = inp;
    body.append(field(p.label, inp));
  }
  if (!def.params?.length) body.append(el('div', { class: 'hint', text: 'This indicator has no parameters.' }));
  const colors = el('div', { class: 'style-colors' });
  for (const c of DRAW_COLORS) {
    const dot = el('button', { class: 'color-dot', style: { background: c }, title: c });
    if (inst.color === c) dot.classList.add('active');
    dot.addEventListener('click', () => {
      inst.color = c;
      colors.querySelectorAll('.color-dot').forEach((d) => d.classList.remove('active'));
      dot.classList.add('active');
    });
    colors.append(dot);
  }
  body.append(field('Colour', colors));
  const apply = el('button', { class: 'btn primary', text: 'Apply' });
  const cancel = el('button', { class: 'btn ghost', text: 'Close' });
  const m = openModal({ title: `${def.name} settings`, body, footer: [cancel, apply], className: 'narrow' });
  cancel.addEventListener('click', () => m.close());
  apply.addEventListener('click', () => {
    for (const [k, inp] of Object.entries(inputs)) {
      const v = parseFloat(inp.value);
      if (Number.isFinite(v)) inst.params[k] = v;
    }
    chartView.setIndicators(state.indicators);
    persist();
    onChange?.();
    m.close();
  });
}

/* ================================= compare ================================ */
function openCompare() {
  const listHost = el('div', { class: 'ind-active' });
  const q = el('input', { class: 'input', placeholder: 'Add a symbol to compare…' });
  const resHost = el('div', { class: 'ind-grid', style: { marginTop: '8px' } });

  const renderList = () => {
    listHost.innerHTML = '';
    if (!state.compare.length) { listHost.append(el('div', { class: 'hint', text: 'No comparisons yet. Add one below.' })); return; }
    for (const c of state.compare) {
      const row = el('div', { class: 'ind-row' });
      row.append(el('span', { class: 'sw', style: { background: c.color } }));
      row.append(el('span', { class: 'nm', text: c.symbol }));
      const del = el('button', { class: 'mini-btn danger' });
      del.innerHTML = icon('x', 14);
      del.addEventListener('click', () => {
        state.compare = state.compare.filter((x) => x.symbol !== c.symbol);
        chartView.setCompare(state.compare);
        renderList(); renderLegend();
      });
      row.append(del);
      listHost.append(row);
    }
  };

  const add = async (sym) => {
    if (state.compare.some((c) => c.symbol === sym.sym)) return;
    if (!state.compare.length && state.compare.length >= 3) return toast('Three comparisons is plenty', 'warn');
    const color = ['#ff9800', '#e040fb', '#29b6f6'][state.compare.length % 3];
    toast(`Loading ${sym.sym}…`, '', 1400);
    try {
      const bars = await getBars(sym, state.interval);
      state.compare.push({ symbol: sym.sym, color, bars });
      chartView.setCompare(state.compare);
      renderList(); renderLegend();
    } catch (e) {
      toast(e.code === 'NO_KEY' ? 'That symbol needs a Twelve Data key' : e.message, 'error', 4200);
    }
  };

  const renderRes = () => {
    const items = searchSymbols(q.value, 8);
    resHost.innerHTML = '';
    for (const s of items) {
      const item = el('div', { class: 'ind-item' });
      item.append(el('span', { class: 'ab', text: s.sym.slice(0, 6) }));
      item.append(el('span', { class: 'nm', text: s.name }));
      item.addEventListener('click', () => add(s));
      resHost.append(item);
    }
  };

  const body = el('div', {},
    el('div', { class: 'det-title', text: 'Comparing against' }), listHost,
    el('div', { class: 'field', style: { marginTop: '14px' } }, q), resHost,
    el('div', { class: 'hint', style: { marginTop: '10px' }, text: 'Comparisons are plotted as percentage change from the first loaded bar, on their own scale.' }),
  );
  const done = el('button', { class: 'btn primary', text: 'Done' });
  const m = openModal({ title: 'Compare', body, footer: [done] });
  done.addEventListener('click', () => m.close());
  q.addEventListener('input', renderRes);
  renderList(); renderRes();
}

/* ================================== replay ================================ */
function openReplaySetup() {
  if (!state.bars.length) return;
  const bars = state.bars;
  const slider = el('input', { type: 'range', min: 30, max: bars.length - 2, value: Math.max(30, Math.floor(bars.length * 0.6)), style: { width: '100%', accentColor: 'var(--accent)' } });
  const label = el('div', { class: 'mono small dim', text: '' });
  const upd = () => {
    const i = +slider.value;
    label.textContent = `${fmtDate(bars[i].time, tf(state.interval).secs < 86400)} · bar ${i + 1} of ${bars.length}`;
  };
  slider.addEventListener('input', upd); upd();
  const body = el('div', {},
    el('div', { class: 'hint', style: { marginBottom: '10px' }, text: 'Pick a starting point. The chart hides everything after it, then replays one bar at a time.' }),
    slider, label,
  );
  const start = el('button', { class: 'btn primary', text: 'Start replay' });
  const cancel = el('button', { class: 'btn ghost', text: 'Cancel' });
  const m = openModal({ title: 'Bar replay', body, footer: [cancel, start], className: 'narrow' });
  cancel.addEventListener('click', () => m.close());
  start.addEventListener('click', () => { m.close(); beginReplay(+slider.value); });
}

function beginReplay(index) {
  state.replay.active = true;
  state.replay.playing = false;
  chartView.startReplay(index);
  $('#replayBar').hidden = false;
  $('#chartToolbar').style.display = 'none';
  drawLayer.setDrawings(drawingsFor(state.symbol));
  updateReplayUI();
  renderLegend();
}

function updateReplayUI() {
  if (!chartView.replay.active) return;
  const i = chartView.replay.index;
  const total = state.bars.length;
  $('#rpFill').style.width = `${(i / (total - 1)) * 100}%`;
  $('#rpLabel').textContent = `${fmtDate(state.bars[i].time, tf(state.interval).secs < 86400)}`;
  const playBtn = $('#replayBar [data-rp="play"]');
  playBtn.innerHTML = icon(state.replay.playing ? 'pause' : 'play', 16);
}

function replayAction(act) {
  if (act === 'exit') return exitReplay();
  if (act === 'back') { chartView.stepReplay(-1); updateReplayUI(); renderLegend(); }
  if (act === 'fwd') { if (!chartView.stepReplay(1)) stopReplayTimer(); updateReplayUI(); renderLegend(); }
  if (act === 'play') {
    state.replay.playing = !state.replay.playing;
    if (state.replay.playing) startReplayTimer(); else stopReplayTimer();
    updateReplayUI();
  }
}

function startReplayTimer() {
  stopReplayTimer();
  state.replay.timer = setInterval(() => {
    if (!chartView.stepReplay(1)) { state.replay.playing = false; stopReplayTimer(); updateReplayUI(); toast('End of data', '', 1600); return; }
    updateReplayUI();
    renderLegend();
  }, state.replay.speed);
}
function stopReplayTimer() { clearInterval(state.replay.timer); state.replay.timer = 0; }

function exitReplay() {
  stopReplayTimer();
  state.replay.playing = false;
  state.replay.active = false;
  chartView.exitReplay();
  $('#replayBar').hidden = true;
  $('#chartToolbar').style.display = '';
  drawLayer.setDrawings(drawingsFor(state.symbol));
  renderLegend();
}

/* ================================ layouts ================================= */
function layoutsMenu(anchor) {
  const layouts = store.get(K.lay, {});
  const name = `${state.symbol} · ${state.interval}`;
  const items = [
    { label: 'Saved layouts' },
    ...Object.keys(layouts).map((k) => ({
      text: k, icon: 'layout',
      onClick: () => { applyLayout(layouts[k]); toast(`Loaded "${k}"`, 'ok'); },
    })),
    ...(Object.keys(layouts).length ? [] : [{ text: 'No saved layouts yet', onClick: () => {} }]),
    { sep: true },
    {
      text: 'Save current layout…', icon: 'save',
      onClick: async () => {
        const n = await promptText({ title: 'Save layout', label: 'Name', value: name, confirmText: 'Save' });
        if (!n) return;
        const all = store.get(K.lay, {});
        all[n] = snapshot();
        store.set(K.lay, all);
        toast(`Layout "${n}" saved`, 'ok');
      },
    },
    {
      text: 'Reset to default', icon: 'refresh', danger: true,
      onClick: async () => {
        if (await confirmDialog({ title: 'Reset the workspace?', message: 'Indicators, drawings and settings return to defaults. Saved layouts stay.', confirmText: 'Reset', danger: true })) {
          store.del(K.state); store.del(K.dw);
          location.reload();
        }
      },
    },
  ];
  openMenu(anchor, items, { alignRight: true });
}

function snapshot() {
  return {
    symbol: state.symbol, interval: state.interval, chartType: state.chartType,
    indicators: state.indicators, theme: state.theme, vol: state.vol,
    log: state.log, pct: state.pct,
    drawings: drawLayer ? drawLayer.getDrawings() : [],
  };
}

function applyLayout(l) {
  if (!l) return;
  state.chartType = l.chartType || 'candles';
  state.indicators = (l.indicators || []).map((i) => ({ ...i, uid: i.uid || uid() }));
  state.vol = l.vol !== false;
  state.log = !!l.log; state.pct = !!l.pct;
  if (l.theme && l.theme !== state.theme) { state.theme = l.theme; document.documentElement.dataset.theme = l.theme; }
  chartView.chartType = state.chartType;
  chartView.setTheme(state.theme);
  chartView.setChartType(state.chartType);
  chartView.setIndicators(state.indicators);
  chartView.setVolumeVisible(state.vol);
  chartView.setScale({ log: state.log, pct: state.pct });
  // merge drawings for this symbol
  if (l.drawings && l.drawings.length) {
    const all = store.get(K.dw, {});
    all[l.symbol || state.symbol] = l.drawings;
    store.set(K.dw, all);
  }
  selectSymbol(l.symbol || state.symbol, l.interval || state.interval);
  $$('.tf-btn').forEach((b) => b.classList.toggle('active', b.dataset.tf === (l.interval || state.interval)));
  persist();
}

/* ================================ settings ================================ */
function openSettings() {
  const keyInput = el('input', { class: 'input', type: 'password', placeholder: 'Paste your Twelve Data API key', value: getApiKey() });
  keyInput.autocomplete = 'off';
  const themeSel = el('select', { class: 'select' },
    el('option', { value: 'dark', text: 'Dark (default)' }),
    el('option', { value: 'light', text: 'Light' }),
  );
  themeSel.value = state.theme;
  const volSwitch = switchEl(state.vol);
  const liveSwitch = switchEl(getUseLive());

  const body = el('div', {},
    el('div', { class: 'det-title', text: 'Market data' }),
    el('div', { class: 'hint', style: { marginBottom: '12px' } },
      'Crypto streams live from Binance. Every other price is quoted straight from TradingView (forex, gold as spot XAU/USD, indices and stocks), so the numbers match the TradingView app. Candle history comes from free feeds. Neither path needs an account or a key.'),
    el('div', { class: 'row', style: { alignItems: 'center', marginBottom: '10px' } },
      el('label', { text: 'Use Twelve Data for live forex data', style: { fontSize: '12px', color: 'var(--text-2)' } }), liveSwitch),
    field('Optional Twelve Data key', keyInput, 'Only needed if you switch the option above on. Free tier: 800 requests a day. Stored in this browser only.'),
    el('div', { class: 'det-title', text: 'Appearance' }),
    field('Theme', themeSel),
    (() => {
      const row = el('div', { class: 'row', style: { alignItems: 'center', marginBottom: '14px' } },
        el('label', { text: 'Volume overlay', style: { fontSize: '12px', color: 'var(--text-dim)' } }), volSwitch);
      return row;
    })(),
    el('div', { class: 'det-title', text: 'Data & privacy' }),
    el('div', { class: 'hint', text: 'Everything runs in your browser. Charts, drawings, alerts and layouts live in localStorage on this device. There is no server, no account and no tracking.' }),
    el('div', { class: 'row', style: { marginTop: '14px' } },
      (() => { const b = el('button', { class: 'btn ghost', text: 'Clear cached data' }); b.addEventListener('click', () => { localStorage.removeItem('chartdesk.tdday'); toast('Cache cleared', 'ok'); }); return b; })(),
      (() => { const b = el('button', { class: 'btn ghost', text: 'Export drawings' }); b.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(store.get(K.dw, {}), null, 2)], { type: 'application/json' });
        const a = el('a', { href: URL.createObjectURL(blob), download: 'chartdesk-drawings.json' });
        document.body.append(a); a.click(); a.remove();
      }); return b; })(),
    ),
  );
  const save = el('button', { class: 'btn primary', text: 'Save' });
  const cancel = el('button', { class: 'btn ghost', text: 'Cancel' });
  const m = openModal({ title: 'Settings', body, footer: [cancel, save] });
  cancel.addEventListener('click', () => m.close());
  save.addEventListener('click', () => {
    const k = keyInput.value.trim();
    const live = liveSwitch.isOn();
    const changed = k !== getApiKey() || live !== getUseLive();
    setApiKey(k);
    setUseLive(live);
    state.vol = volSwitch.isOn();
    chartView.setVolumeVisible(state.vol);
    if (themeSel.value !== state.theme) {
      state.theme = themeSel.value;
      document.documentElement.dataset.theme = state.theme;
      chartView.setTheme(state.theme);
    }
    persist();
    m.close();
    toast(live && k ? 'Live feed enabled through Twelve Data.' : 'Settings saved. Free feed in use.', 'ok');
    if (changed) selectSymbol(state.symbol, state.interval);
  });
}

/* ================================ screenshot ============================== */
function takeScreenshot() {
  try {
    const shot = chartView.screenshot();
    const out = document.createElement('canvas');
    out.width = shot.width; out.height = shot.height;
    const ctx = out.getContext('2d');
    ctx.drawImage(shot, 0, 0);
    const overlay = $('#drawOverlay');
    if (overlay && overlay.width) ctx.drawImage(overlay, 0, 0, shot.width, shot.height);
    // watermark
    ctx.save();
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(160,180,205,0.55)';
    ctx.textAlign = 'right';
    ctx.fillText(`ChartDesk · ${state.symbol} · ${state.interval}`, out.width - 14, out.height - 12);
    ctx.restore();
    downloadCanvas(`chartdesk-${state.symbol}-${state.interval}.png`, out);
    toast('Screenshot saved', 'ok', 2000);
  } catch (e) {
    toast('Screenshot failed: ' + e.message, 'error');
  }
}

/* ================================ shortcuts =============================== */
function bindKeys() {
  window.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if (e.key === 'Escape') {
      if (closeMenu()) return;
      if (hasModal()) { closeTop(); return; }
      if (drawLayer.tool !== 'cursor') { setTool('cursor'); return; }
      if (drawLayer.selected) { drawLayer.selected = null; drawLayer.invalidate(); renderObjects(); }
      return;
    }
    if (typing) return;
    const meta = e.ctrlKey || e.metaKey;
    if (meta && e.key.toLowerCase() === 'k') { e.preventDefault(); return openSymbolSearch(); }
    if (meta && e.key.toLowerCase() === 'i') { e.preventDefault(); return openIndicatorPicker(); }
    if (meta && e.key.toLowerCase() === 'j') { e.preventDefault(); return toggleTheme($('[data-act="theme"]')); }
    if (meta && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); return takeScreenshot(); }
    if (e.altKey && e.key.toLowerCase() === 'a') { e.preventDefault(); return openAlertCreate(); }
    if (e.key === 'Delete' || e.key === 'Backspace') { if (drawLayer.selected) { drawLayer.deleteSelected(); renderObjects(); } return; }
    if (e.key === '?' || (e.shiftKey && e.key === '/')) return showShortcuts();
    if (/^[1-9]$/.test(e.key)) {
      const t = TIMEFRAMES[+e.key - 1];
      if (t) setInterval_(t.id);
    }
  });
}

function showShortcuts() {
  const rows = [
    ['Ctrl K', 'Symbol search'], ['Ctrl I', 'Indicators'], ['Ctrl J', 'Toggle theme'],
    ['Ctrl Shift S', 'Screenshot'], ['Alt A', 'Create alert'], ['Del', 'Delete selected object'],
    ['Esc', 'Cancel tool / close'], ['1 – 9', 'Switch timeframe'], ['Drag rail', 'Pan chart'], ['Wheel', 'Zoom'],
  ];
  const body = el('div', {});
  for (const [k, v] of rows) {
    body.append(el('div', { class: 'det-row' }, el('span', { text: v }), el('span', { class: 'mono', text: k })));
  }
  const m = openModal({ title: 'Keyboard shortcuts', body, className: 'narrow' });
  const done = el('button', { class: 'btn primary', text: 'Got it' });
  m.el.querySelector('.modal-body').append(done);
  done.style.marginTop = '14px';
  done.style.width = '100%';
  done.addEventListener('click', () => m.close());
}

/* ================================== misc ================================== */
function persist() {
  store.set(K.state, {
    symbol: state.symbol, interval: state.interval, chartType: state.chartType,
    indicators: state.indicators, theme: state.theme, vol: state.vol,
    log: state.log, pct: state.pct,
  });
  try {
    const u = new URL(location.href);
    u.searchParams.set('symbol', state.symbol);
    u.searchParams.set('interval', state.interval);
    history.replaceState(null, '', u);
  } catch { /* file:// or blocked history */ }
}

function updateCredits() {
  const node = $('#creditInfo');
  if (!node) return;
  const sym = findSymbol(state.symbol) || {};
  const prov = sym.provider === 'binance' ? 'Binance' : 'TradingView';
  const age = lastDataAt ? timeAgo(lastDataAt) : 'loading';
  node.textContent = `${prov} · ${age}`;
  const foot = $('#spFootText');
  if (foot) foot.textContent = sym.provider === 'binance' ? 'Live crypto · no key' : 'TradingView quotes · no key';
}

function startClock() {
  const tick = () => {
    const d = new Date();
    const c = $('#clock');
    if (c) c.textContent = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' UTC' + (d.getTimezoneOffset() <= 0 ? '+' : '-') + Math.abs(d.getTimezoneOffset() / 60);
  };
  tick();
  setInterval(tick, 1000);
}

/* ================================== errors ================================= */
function logError(msg) {
  const log = document.getElementById('errlog');
  if (log) log.textContent = (log.textContent ? log.textContent + ' | ' : '') + msg;
  toast(msg, 'error', 7000, 'Script error:');
}
window.addEventListener('error', (e) => logError(`${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  logError(String((r && (r.message || r)) || 'Unhandled promise rejection'));
});

/* ================================== start ================================= */
document.addEventListener('DOMContentLoaded', () => {
  boot();
  // expose a tiny console API for power users
  window.ChartDesk = {
    state,
    chartView: () => chartView,
    drawLayer: () => drawLayer,
    selectSymbol,
    setTool,
    actions: {
      indicators: openIndicatorPicker,
      search: openSymbolSearch,
      settings: openSettings,
      alert: openAlertCreate,
      compare: openCompare,
      replay: openReplaySetup,
      shortcuts: showShortcuts,
      screenshot: takeScreenshot,
    },
    addIndicator: (id, params = {}) => {
      const def = INDICATOR_MAP[id];
      if (!def) return null;
      state.indicators.push({ uid: uid(), id, params: { ...defaultParams(def), ...params }, visible: true, color: OSC_COLORS[0] });
      chartView.setIndicators(state.indicators);
      persist();
      return state.indicators[state.indicators.length - 1];
    },
  };

  if (new URLSearchParams(location.search).has('selftest')) {
    const waitForBars = (n = 0) => {
      if (state.bars.length || n > 120) {
        import('../dev/selftest.js').then((m) => m.run(window.ChartDesk)).catch((e) => logError('selftest: ' + e.message));
      } else setTimeout(() => waitForBars(n + 1), 100);
    };
    waitForBars();
  }
});
