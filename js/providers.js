// Market data layer.
//  - Binance public REST: crypto, no API key, CORS enabled.
//  - Twelve Data REST: forex / metals / indices / stocks, free key required.
// Bars are normalised to { time (UTC seconds), open, high, low, close, volume }.

import { tf } from './catalog.js';
import { store } from './util.js';

const BINANCE_HOSTS = ['https://api.binance.com', 'https://data-api.binance.vision'];
const TD_HOST = 'https://api.twelvedata.com';

const memCache = new Map(); // key -> { ts, bars }
const CACHE_TTL = 20_000;

let apiKey = store.get('chartdesk.tdkey', '') || '';
let statusCb = () => {};
export const onStatus = (cb) => { statusCb = cb; };
export const setApiKey = (k) => {
  apiKey = String(k || '').trim();
  store.set('chartdesk.tdkey', apiKey);
  memCache.clear();
  tdLog.length = 0;
};
export const getApiKey = () => apiKey;

// ---------- Twelve Data credit governor (free plan: 8 req/min, 800/day) ----------
const tdLog = []; // request timestamps (ms)
const TD_WINDOW = 61_000;
const TD_MAX_PER_WINDOW = 8;
let tdDayKey = new Date().toISOString().slice(0, 10);
let tdDayCount = store.get('chartdesk.tdday', { day: '', n: 0 });

async function tdWaitTurn() {
  const now = Date.now();
  while (tdLog.length && now - tdLog[0] > TD_WINDOW) tdLog.shift();
  if (tdLog.length >= TD_MAX_PER_WINDOW) {
    const wait = TD_WINDOW - (now - tdLog[0]) + 250;
    statusCb({ kind: 'busy', text: `Rate limit: waiting ${Math.ceil(wait / 1000)}s for Twelve Data` });
    await new Promise((r) => setTimeout(r, wait));
    return tdWaitTurn();
  }
  tdLog.push(Date.now());
}

function tdBumpDay() {
  const day = new Date().toISOString().slice(0, 10);
  if (tdDayCount.day !== day) tdDayCount = { day, n: 0 };
  tdDayCount.n += 1;
  store.set('chartdesk.tdday', tdDayCount);
}

export function tdUsage() {
  const day = new Date().toISOString().slice(0, 10);
  const n = tdDayCount.day === day ? tdDayCount.n : 0;
  return { used: n, cap: 800, perMin: TD_MAX_PER_WINDOW };
}

// ---------- Binance ----------
async function binanceFetch(path, params) {
  const qs = new URLSearchParams(params).toString();
  let lastErr;
  for (const host of BINANCE_HOSTS) {
    try {
      const res = await fetch(`${host}${path}?${qs}`, { cache: 'no-store' });
      if (res.status === 451 || res.status === 403) { lastErr = new Error(`Binance blocked (${res.status})`); continue; }
      if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Binance unreachable');
}

function parseKlines(rows) {
  return rows.map((r) => ({
    time: Math.floor(r[0] / 1000),
    open: +r[1],
    high: +r[2],
    low: +r[3],
    close: +r[4],
    volume: +r[5],
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

// ---------- Twelve Data ----------
async function tdBars(sym, interval, want = 4000) {
  if (!apiKey) {
    const err = new Error('No Twelve Data key configured');
    err.code = 'NO_KEY';
    throw err;
  }
  await tdWaitTurn();
  const t = tf(interval);
  const url = `${TD_HOST}/time_series?symbol=${encodeURIComponent(sym.psym)}&interval=${t.td}` +
    `&outputsize=${Math.min(5000, want)}&apikey=${encodeURIComponent(apiKey)}&order=ASC&timezone=UTC`;
  let res;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch (e) {
    throw new Error('Twelve Data unreachable (network or CORS blocked)');
  }
  tdBumpDay();
  let data;
  try { data = await res.json(); } catch { throw new Error(`Twelve Data returned non-JSON (HTTP ${res.status})`); }
  if (data && data.status === 'error') {
    const msg = data.message || 'request failed';
    const err = new Error(msg);
    err.code = data.code === 429 ? 'RATE' : /apikey|api key/i.test(msg) ? 'BAD_KEY' : 'TD_ERROR';
    throw err;
  }
  if (!data || !Array.isArray(data.values)) throw new Error('Twelve Data: empty response');
  const bars = data.values.map((v) => {
    const time = parseTdTime(v.datetime);
    return { time, open: +v.open, high: +v.high, low: +v.low, close: +v.close, volume: +v.volume || 0 };
  }).filter((b) => Number.isFinite(b.time) && Number.isFinite(b.close));
  return dedupe(bars);
}

function parseTdTime(s) {
  // "2026-11-24 09:30:00" or "2026-11-24" (both UTC because timezone=UTC)
  const str = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return Date.parse(str + 'T00:00:00Z') / 1000;
  return Date.parse(str.replace(' ', 'T') + 'Z') / 1000;
}

function dedupe(bars) {
  const map = new Map();
  for (const b of bars) map.set(b.time, b);
  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

// ---------- public API ----------
export async function getBars(sym, interval, { force = false, want } = {}) {
  const key = `${sym.sym}|${interval}|${sym.provider}`;
  const cached = memCache.get(key);
  const now = Date.now();
  if (!force && cached && now - cached.ts < CACHE_TTL && cached.bars.length) return cached.bars;

  statusCb({ kind: 'loading', text: `Loading ${sym.sym} ${interval}` });
  let bars;
  if (sym.provider === 'binance') {
    bars = await binanceBars(sym, interval, want || 1500);
  } else {
    bars = await tdBars(sym, interval, want || 4000);
  }
  if (!bars.length) throw new Error(`No data returned for ${sym.sym}`);
  memCache.set(key, { ts: now, bars });
  statusCb({ kind: 'ok', text: `${sym.sym} · ${bars.length} bars` });
  return bars;
}

// Cheap "latest bar" refresh: only Binance supports this without spending credits.
export async function refreshTail(sym, interval, bars) {
  if (!bars || !bars.length) return null;
  if (sym.provider === 'binance') {
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
  }
  // Twelve Data: a refresh costs a credit, so only do it when the cache is stale.
  const cached = memCache.get(`${sym.sym}|${interval}|${sym.provider}`);
  if (cached && Date.now() - cached.ts < 55_000) return null;
  const fresh = await getBars(sym, interval, { force: true });
  return fresh;
}

// Batched quotes for the watchlist. Crypto only: 1 HTTP call, no key, no credits.
export async function getCryptoQuotes(symbols) {
  if (!symbols.length) return {};
  const list = JSON.stringify(symbols.map((s) => s.psym));
  const rows = await binanceFetch('/api/v3/ticker/24hr', { symbols: list });
  const out = {};
  if (!Array.isArray(rows)) return out;
  for (const r of rows) {
    out[r.symbol] = {
      price: +r.lastPrice,
      changePct: +r.priceChangePercent,
      high: +r.highPrice,
      low: +r.lowPrice,
      volume: +r.quoteVolume,
    };
  }
  return out;
}

export function clearCache() { memCache.clear(); }
