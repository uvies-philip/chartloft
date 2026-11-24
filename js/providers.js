// Market data. Three adapters, none of which need an API key by default:
//   binance : crypto, direct public REST
//   yahoo   : forex, metals, indices, stocks, read through the r.jina.ai text relay
//             (Yahoo sends no CORS headers, the relay mirrors them)
//   td      : optional Twelve Data upgrade when the user supplies a free key
// Bars are normalised to { time (UTC seconds), open, high, low, close, volume }.

import { tf } from './catalog.js';
import { store } from './util.js';

const BINANCE_HOSTS = ['https://api.binance.com', 'https://data-api.binance.vision'];
const YH = 'https://query1.finance.yahoo.com';
const RELAY = (url) => `https://r.jina.ai/${url}`;
const TD_HOST = 'https://api.twelvedata.com';

const memCache = new Map();
const CACHE_TTL = 25_000;

let apiKey = store.get('chartdesk.tdkey', '') || '';
let useLive = store.get('chartdesk.uselive', false) === true;
let statusCb = () => {};
export const onStatus = (cb) => { statusCb = cb; };

export const setApiKey = (k) => {
  apiKey = String(k || '').trim();
  store.set('chartdesk.tdkey', apiKey);
  memCache.clear();
};
export const getApiKey = () => apiKey;
export const setUseLive = (v) => { useLive = !!v; store.set('chartdesk.uselive', useLive); memCache.clear(); };
export const getUseLive = () => useLive && !!apiKey;

/* ------------------------------ relay gate ------------------------------- */
// r.jina.ai tolerates roughly 20 requests a minute per IP. Space calls out and
// cool down hard after a 429 so one busy chart cannot poison the rest.
const relay = { last: 0, coolUntil: 0, minGap: 1200 };
export const relayState = () => ({ cooling: Date.now() < relay.coolUntil, coolFor: Math.max(0, relay.coolUntil - Date.now()) });

async function relayJson(target) {
  const now = Date.now();
  if (now < relay.coolUntil) {
    const err = new Error(`Data relay cooling down for ${Math.ceil((relay.coolUntil - now) / 1000)}s`);
    err.code = 'RELAY_BUSY';
    throw err;
  }
  const gap = now - relay.last;
  if (gap < relay.minGap) await new Promise((r) => setTimeout(r, relay.minGap - gap));
  relay.last = Date.now();

  const res = await fetch(RELAY(target), { cache: 'no-store' });
  if (res.status === 429) {
    relay.coolUntil = Date.now() + 45_000;
    const err = new Error('Data relay is rate limited, try again in a moment');
    err.code = 'RELAY_BUSY';
    throw err;
  }
  if (!res.ok) throw new Error(`Relay HTTP ${res.status}`);
  const text = await res.text();
  // The relay prefixes "Title: / URL Source: / Markdown Content:" before the JSON.
  const start = Math.min(...[text.indexOf('{'), text.indexOf('[')].filter((i) => i >= 0));
  if (!Number.isFinite(start)) throw new Error('Relay returned no JSON');
  const slice = text.slice(start, Math.max(text.lastIndexOf('}'), text.lastIndexOf(']')) + 1);
  try {
    return JSON.parse(slice);
  } catch {
    throw new Error('Relay returned malformed JSON');
  }
}

/* --------------------------------- binance -------------------------------- */
async function binanceFetch(path, params) {
  const qs = new URLSearchParams(params).toString();
  let lastErr;
  for (const host of BINANCE_HOSTS) {
    try {
      const res = await fetch(`${host}${path}?${qs}`, { cache: 'no-store' });
      if (res.status === 451 || res.status === 403) { lastErr = new Error(`Binance blocked (${res.status})`); continue; }
      if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
      return await res.json();
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Binance unreachable');
}

function parseKlines(rows) {
  return rows.map((r) => ({
    time: Math.floor(r[0] / 1000), open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5],
  })).filter((b) => Number.isFinite(b.close));
}

async function binanceBars(sym, interval, want = 1500) {
  const t = tf(interval);
  const out = [];
  let endTime = Date.now();
  let guard = 0;
  while (out.length < want && guard < 6) {
    guard += 1;
    const params = { symbol: sym.psym, interval: t.binance, limit: Math.min(1000, want - out.length) };
    if (out.length) params.endTime = endTime;
    const rows = await binanceFetch('/api/v3/klines', params);
    if (!Array.isArray(rows) || rows.length === 0) break;
    const chunk = parseKlines(rows);
    out.unshift(...chunk);
    endTime = rows[0][0] - 1;
    if (rows.length < 1000) break;
  }
  return dedupe(out);
}

/* ---------------------------------- yahoo --------------------------------- */
const Y_INTERVAL = {
  '1m': { i: '1m', r: '7d', agg: 1 },
  '5m': { i: '5m', r: '60d', agg: 1 },
  '15m': { i: '15m', r: '60d', agg: 1 },
  '30m': { i: '30m', r: '60d', agg: 1 },
  '1h': { i: '60m', r: '730d', agg: 1 },
  '4h': { i: '60m', r: '730d', agg: 4 },
  '1d': { i: '1d', r: '10y', agg: 1 },
  '1w': { i: '1wk', r: '10y', agg: 1 },
  '1M': { i: '1mo', r: '10y', agg: 1 },
};

async function yahooBars(sym, interval) {
  const map = Y_INTERVAL[interval] || Y_INTERVAL['15m'];
  const target = `${YH}/v8/finance/chart/${encodeURIComponent(sym.y)}?interval=${map.i}&range=${map.r}&includePrePost=false`;
  const json = await relayJson(target);
  const result = json?.chart?.result?.[0];
  if (!result) {
    const desc = json?.chart?.error?.description || 'no data';
    const err = new Error(`${sym.sym}: ${desc}`);
    err.code = 'NO_SYMBOL';
    throw err;
  }
  const ts = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  const bars = [];
  for (let i = 0; i < ts.length; i++) {
    const close = q.close?.[i];
    if (close == null) continue;
    const open = q.open?.[i] ?? close;
    const high = q.high?.[i] ?? Math.max(open, close);
    const low = q.low?.[i] ?? Math.min(open, close);
    bars.push({ time: ts[i], open: +open, high: +high, low: +low, close: +close, volume: +(q.volume?.[i] || 0) });
  }
  if (!bars.length) throw new Error(`${sym.sym}: no usable bars`);
  return map.agg > 1 ? aggregate(bars, map.agg * 3600) : bars;
}

// Combine fixed-width bars (used for 4h from 1h).
export function aggregate(bars, secs) {
  const out = [];
  let cur = null;
  for (const b of bars) {
    const bucket = Math.floor(b.time / secs) * secs;
    if (!cur || cur.time !== bucket) {
      if (cur) out.push(cur);
      cur = { time: bucket, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume || 0 };
    } else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume || 0;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/* ------------------------------ twelve data ------------------------------- */
async function tdBars(sym, interval, want = 4000) {
  if (!apiKey) {
    const err = new Error('No Twelve Data key configured');
    err.code = 'NO_KEY';
    throw err;
  }
  const url = `${TD_HOST}/time_series?symbol=${encodeURIComponent(sym.psym || sym.sym)}&interval=${tf(interval).td}` +
    `&outputsize=${Math.min(5000, want)}&apikey=${encodeURIComponent(apiKey)}&order=ASC&timezone=UTC`;
  let res;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch {
    throw new Error('Twelve Data unreachable (network or CORS blocked)');
  }
  let data;
  try { data = await res.json(); } catch { throw new Error(`Twelve Data returned non-JSON (HTTP ${res.status})`); }
  if (data && data.status === 'error') {
    const msg = data.message || 'request failed';
    const err = new Error(msg);
    err.code = /apikey|api key/i.test(msg) ? 'BAD_KEY' : 'TD_ERROR';
    throw err;
  }
  if (!data || !Array.isArray(data.values)) throw new Error('Twelve Data: empty response');
  return dedupe(data.values.map((v) => ({
    time: parseTdTime(v.datetime), open: +v.open, high: +v.high, low: +v.low, close: +v.close, volume: +v.volume || 0,
  })).filter((b) => Number.isFinite(b.time) && Number.isFinite(b.close)));
}

function parseTdTime(s) {
  const str = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return Date.parse(str + 'T00:00:00Z') / 1000;
  return Date.parse(str.replace(' ', 'T') + 'Z') / 1000;
}

function dedupe(bars) {
  const map = new Map();
  for (const b of bars) map.set(b.time, b);
  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

/* -------------------------------- public ---------------------------------- */
export function providerOf(sym) {
  if (sym.provider === 'binance') return 'binance';
  if (getUseLive() && sym.psym) return 'td';
  return 'yahoo';
}

export async function getBars(sym, interval, { force = false } = {}) {
  const prov = providerOf(sym);
  const key = `${sym.sym}|${interval}|${prov}`;
  const cached = memCache.get(key);
  const now = Date.now();
  if (!force && cached && now - cached.ts < CACHE_TTL && cached.bars.length) return cached.bars;

  statusCb({ kind: 'loading', text: `Loading ${sym.sym} ${interval}` });
  let bars;
  try {
    if (prov === 'binance') bars = await binanceBars(sym, interval);
    else if (prov === 'td') bars = await tdBars(sym, interval);
    else bars = await yahooBars(sym, interval);
  } catch (e) {
    // Twelve Data is the richer source, but the free feed is always available.
    // If the key route fails, never leave the user with an empty chart.
    if (prov === 'td') {
      statusCb({ kind: 'warn', text: 'Twelve Data failed, using free feed' });
      bars = await yahooBars(sym, interval);
    } else throw e;
  }
  if (!bars || !bars.length) throw new Error(`No data returned for ${sym.sym}`);
  memCache.set(key, { ts: now, bars });
  statusCb({ kind: 'ok', text: `${sym.sym} · ${bars.length} bars` });
  return bars;
}

// Called by the app on a timer. Returns fresh bars, or null when nothing changed.
export async function refreshTail(sym, interval, bars) {
  if (!bars || !bars.length) return null;
  const prov = providerOf(sym);
  if (prov === 'binance') {
    try {
      const rows = await binanceFetch('/api/v3/klines', { symbol: sym.psym, interval: tf(interval).binance, limit: 2 });
      const fresh = parseKlines(rows);
      if (!fresh.length) return null;
      const last = bars[bars.length - 1];
      let changed = false;
      for (const b of fresh) {
        if (b.time === last.time) {
          if (b.close !== last.close || b.high !== last.high || b.low !== last.low) {
            Object.assign(last, b);
            changed = true;
          }
        } else if (b.time > last.time) {
          bars.push(b);
          changed = true;
        }
      }
      return changed ? bars : null;
    } catch { return null; }
  }
  const cached = memCache.get(`${sym.sym}|${interval}|${prov}`);
  if (cached && Date.now() - cached.ts < 55_000) return null;
  try {
    return await getBars(sym, interval, { force: true });
  } catch { return null; }
}

// Batched quotes for the watchlist: one relay call covers every non-crypto symbol.
export async function getSparkQuotes(symbols) {
  const out = {};
  if (!symbols.length) return out;
  const ySym = symbols.map((s) => s.y).filter(Boolean);
  for (let i = 0; i < ySym.length; i += 8) {
    const chunk = ySym.slice(i, i + 8);
    const target = `${YH}/v8/finance/spark?symbols=${chunk.map(encodeURIComponent).join(',')}&range=1d&interval=15m`;
    try {
      const json = await relayJson(target);
      for (const [ticker, v] of Object.entries(json || {})) {
        const closes = (v.close || []).filter((n) => n != null);
        if (!closes.length) continue;
        const price = closes[closes.length - 1];
        // Yahoo's previousClose is stale for some indices, so measure the change
        // across the loaded window instead. It is consistent for every symbol.
        const ref = closes[0] || price;
        out[ticker] = { price, changePct: ref ? ((price - ref) / ref) * 100 : 0, spark: closes.slice(-40) };
      }
    } catch { /* one bad chunk must not kill the list */ }
  }
  return out;
}

export async function getCryptoQuotes(symbols) {
  if (!symbols.length) return {};
  const list = JSON.stringify(symbols.map((s) => s.psym));
  const rows = await binanceFetch('/api/v3/ticker/24hr', { symbols: list });
  const out = {};
  if (!Array.isArray(rows)) return out;
  for (const r of rows) {
    out[r.symbol] = {
      price: +r.lastPrice, changePct: +r.priceChangePercent,
      high: +r.highPrice, low: +r.lowPrice, volume: +r.quoteVolume,
    };
  }
  return out;
}

// Recent closes for a crypto sparkline.
export async function getSparkCloses(sym, interval = '1h', limit = 40) {
  if (sym.provider !== 'binance') return null;
  try {
    const rows = await binanceFetch('/api/v3/klines', { symbol: sym.psym, interval: tf(interval).binance, limit });
    return parseKlines(rows).map((b) => b.close);
  } catch { return null; }
}

export function clearCache() { memCache.clear(); }
