// Indicator engine. Every definition exposes:
//   { id, name, full, cat: 'overlay'|'pane', params: [...], calc(bars, params, ctx) -> { plots: [...] } }
// plot = { kind:'line'|'hist'|'area', data:[{time, value}] , color?, width?, title?, dashed?, base? }
// plot.color === null means "use the instance colour chosen by the chart".

/* ------------------------------ math helpers ------------------------------ */
const nan = (n) => new Array(n).fill(null);

function sma(vals, len) {
  const out = nan(vals.length);
  let sum = 0;
  for (let i = 0; i < vals.length; i++) {
    sum += vals[i];
    if (i >= len) sum -= vals[i - len];
    if (i >= len - 1) out[i] = sum / len;
  }
  return out;
}

function ema(vals, len) {
  const out = nan(vals.length);
  const k = 2 / (len + 1);
  let prev = null;
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (v == null || !Number.isFinite(v)) continue;
    if (prev === null) {
      if (i >= len - 1) {
        let s = 0;
        for (let j = i - len + 1; j <= i; j++) s += vals[j];
        prev = s / len;
        out[i] = prev;
      }
    } else {
      prev = v * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

function rma(vals, len) {
  const out = nan(vals.length);
  let prev = null;
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (v == null || !Number.isFinite(v)) continue;
    if (prev === null) {
      if (i >= len - 1) {
        let s = 0, c = 0;
        for (let j = i - len + 1; j <= i; j++) { if (Number.isFinite(vals[j])) { s += vals[j]; c++; } }
        prev = c ? s / c : null;
        out[i] = prev;
      }
    } else {
      prev = (prev * (len - 1) + v) / len;
      out[i] = prev;
    }
  }
  return out;
}

function wma(vals, len) {
  const out = nan(vals.length);
  const denom = (len * (len + 1)) / 2;
  for (let i = len - 1; i < vals.length; i++) {
    let s = 0, ok = true;
    for (let j = 0; j < len; j++) {
      const v = vals[i - j];
      if (v == null || !Number.isFinite(v)) { ok = false; break; }
      s += v * (len - j);
    }
    if (ok) out[i] = s / denom;
  }
  return out;
}

function hma(vals, len) {
  const half = Math.round(len / 2);
  const root = Math.round(Math.sqrt(len));
  const w1 = wma(vals, half), w2 = wma(vals, len);
  const raw = vals.map((_, i) => (w1[i] == null || w2[i] == null ? null : 2 * w1[i] - w2[i]));
  return wma(raw, root);
}

function stdev(vals, len) {
  const out = nan(vals.length);
  for (let i = len - 1; i < vals.length; i++) {
    let s = 0, c = 0;
    for (let j = i - len + 1; j <= i; j++) { if (Number.isFinite(vals[j])) { s += vals[j]; c++; } }
    if (c < 2) continue;
    const m = s / c;
    let sq = 0;
    for (let j = i - len + 1; j <= i; j++) { if (Number.isFinite(vals[j])) sq += (vals[j] - m) ** 2; }
    out[i] = Math.sqrt(sq / c);
  }
  return out;
}

function highest(vals, len) {
  const out = nan(vals.length);
  for (let i = len - 1; i < vals.length; i++) {
    let m = -Infinity;
    for (let j = i - len + 1; j <= i; j++) if (vals[j] > m) m = vals[j];
    out[i] = m;
  }
  return out;
}

function lowest(vals, len) {
  const out = nan(vals.length);
  for (let i = len - 1; i < vals.length; i++) {
    let m = Infinity;
    for (let j = i - len + 1; j <= i; j++) if (vals[j] < m) m = vals[j];
    out[i] = m;
  }
  return out;
}

function trueRange(bars) {
  return bars.map((b, i) => {
    if (i === 0) return b.high - b.low;
    const pc = bars[i - 1].close;
    return Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
  });
}

function atr(bars, len) { return rma(trueRange(bars), len); }

/* ------------------------------ plot builders ----------------------------- */
function line(bars, vals) {
  const out = [];
  for (let i = 0; i < bars.length; i++) {
    const v = vals[i];
    if (v == null || !Number.isFinite(v)) continue;
    out.push({ time: bars[i].time, value: v });
  }
  return out;
}

function hist(bars, vals, colors, base) {
  const out = [];
  for (let i = 0; i < bars.length; i++) {
    const v = vals[i];
    if (v == null || !Number.isFinite(v)) continue;
    const item = { time: bars[i].time, value: v };
    if (base !== undefined) item.base = base;
    if (colors) item.color = colors(v, i);
    out.push(item);
  }
  return out;
}

const UP = '#26a69a', DOWN = '#ef5350';
const cUp = 'rgba(38,166,154,0.75)', cDown = 'rgba(239,83,80,0.75)';

/* ------------------------------ definitions ------------------------------- */
export const INDICATOR_DEFS = [
  /* ---------------- overlays ---------------- */
  {
    id: 'sma', name: 'SMA', full: 'Simple Moving Average', cat: 'overlay',
    params: [{ k: 'length', label: 'Length', def: 20, min: 1, max: 1000 }],
    calc(bars, p) {
      const v = sma(bars.map((b) => b.close), p.length);
      return { plots: [{ kind: 'line', data: line(bars, v), width: 2, title: `SMA ${p.length}` }] };
    },
  },
  {
    id: 'ema', name: 'EMA', full: 'Exponential Moving Average', cat: 'overlay',
    params: [{ k: 'length', label: 'Length', def: 20, min: 1, max: 1000 }],
    calc(bars, p) {
      const v = ema(bars.map((b) => b.close), p.length);
      return { plots: [{ kind: 'line', data: line(bars, v), width: 2, title: `EMA ${p.length}` }] };
    },
  },
  {
    id: 'wma', name: 'WMA', full: 'Weighted Moving Average', cat: 'overlay',
    params: [{ k: 'length', label: 'Length', def: 20, min: 1, max: 1000 }],
    calc(bars, p) {
      const v = wma(bars.map((b) => b.close), p.length);
      return { plots: [{ kind: 'line', data: line(bars, v), width: 2, title: `WMA ${p.length}` }] };
    },
  },
  {
    id: 'hma', name: 'HMA', full: 'Hull Moving Average', cat: 'overlay',
    params: [{ k: 'length', label: 'Length', def: 21, min: 2, max: 1000 }],
    calc(bars, p) {
      const v = hma(bars.map((b) => b.close), p.length);
      return { plots: [{ kind: 'line', data: line(bars, v), width: 2, title: `HMA ${p.length}` }] };
    },
  },
  {
    id: 'vwap', name: 'VWAP', full: 'Volume Weighted Average Price (session)', cat: 'overlay',
    params: [{ k: 'length', label: 'Anchor (bars, 0 = session)', def: 0, min: 0, max: 5000 }],
    calc(bars, p) {
      const out = nan(bars.length);
      let cumPV = 0, cumV = 0, curDay = -1;
      for (let i = 0; i < bars.length; i++) {
        const b = bars[i];
        const day = Math.floor(b.time / 86400);
        if (p.length > 0) {
          // rolling anchored window
          let pv = 0, vv = 0;
          for (let j = Math.max(0, i - p.length + 1); j <= i; j++) {
            const tp = (bars[j].high + bars[j].low + bars[j].close) / 3;
            const vol = bars[j].volume || 0;
            pv += tp * vol; vv += vol;
          }
          out[i] = vv ? pv / vv : null;
          continue;
        }
        if (day !== curDay) { curDay = day; cumPV = 0; cumV = 0; }
        const tp = (b.high + b.low + b.close) / 3;
        const vol = b.volume || 0;
        cumPV += tp * vol; cumV += vol;
        out[i] = cumV ? cumPV / cumV : tp;
      }
      return { plots: [{ kind: 'line', data: line(bars, out), width: 2, color: '#7e57c2', title: 'VWAP' }] };
    },
  },
  {
    id: 'bb', name: 'Bollinger Bands', full: 'Bollinger Bands', cat: 'overlay',
    params: [
      { k: 'length', label: 'Length', def: 20, min: 2, max: 500 },
      { k: 'mult', label: 'StdDev', def: 2, min: 0.1, max: 10, step: 0.1 },
    ],
    calc(bars, p) {
      const closes = bars.map((b) => b.close);
      const basis = sma(closes, p.length);
      const sd = stdev(closes, p.length);
      const upper = basis.map((b, i) => (b == null || sd[i] == null ? null : b + p.mult * sd[i]));
      const lower = basis.map((b, i) => (b == null || sd[i] == null ? null : b - p.mult * sd[i]));
      const t = `BB ${p.length} ${p.mult}`;
      return {
        plots: [
          { kind: 'line', data: line(bars, upper), width: 1, color: '#4c8dff', title: t },
          { kind: 'line', data: line(bars, lower), width: 1, color: '#4c8dff', title: t },
          { kind: 'line', data: line(bars, basis), width: 1, dashed: true, color: null, title: t },
        ],
      };
    },
  },
  {
    id: 'keltner', name: 'Keltner Channels', full: 'Keltner Channels', cat: 'overlay',
    params: [
      { k: 'length', label: 'Length', def: 20, min: 2, max: 500 },
      { k: 'mult', label: 'ATR mult', def: 2, min: 0.1, max: 10, step: 0.1 },
    ],
    calc(bars, p) {
      const basis = ema(bars.map((b) => b.close), p.length);
      const a = atr(bars, p.length);
      const upper = basis.map((b, i) => (b == null || a[i] == null ? null : b + p.mult * a[i]));
      const lower = basis.map((b, i) => (b == null || a[i] == null ? null : b - p.mult * a[i]));
      const t = `KC ${p.length} ${p.mult}`;
      return {
        plots: [
          { kind: 'line', data: line(bars, upper), width: 1, color: '#5c6bc0', title: t },
          { kind: 'line', data: line(bars, lower), width: 1, color: '#5c6bc0', title: t },
          { kind: 'line', data: line(bars, basis), width: 1, dashed: true, color: null, title: t },
        ],
      };
    },
  },
  {
    id: 'donchian', name: 'Donchian Channels', full: 'Donchian Channels', cat: 'overlay',
    params: [{ k: 'length', label: 'Length', def: 20, min: 2, max: 1000 }],
    calc(bars, p) {
      const hi = highest(bars.map((b) => b.high), p.length);
      const lo = lowest(bars.map((b) => b.low), p.length);
      const mid = hi.map((h, i) => (h == null || lo[i] == null ? null : (h + lo[i]) / 2));
      const t = `DC ${p.length}`;
      return {
        plots: [
          { kind: 'line', data: line(bars, hi), width: 1, color: '#26a69a', title: t },
          { kind: 'line', data: line(bars, lo), width: 1, color: '#ef5350', title: t },
          { kind: 'line', data: line(bars, mid), width: 1, dashed: true, color: null, title: t },
        ],
      };
    },
  },
  {
    id: 'supertrend', name: 'Supertrend', full: 'Supertrend', cat: 'overlay',
    params: [
      { k: 'atrLen', label: 'ATR length', def: 10, min: 1, max: 200 },
      { k: 'mult', label: 'Multiplier', def: 3, min: 0.1, max: 20, step: 0.1 },
    ],
    calc(bars) {
      const p = arguments[1];
      const a = atr(bars, p.atrLen);
      const up = [], dn = [], trendUp = [];
      let finalUp = null, finalDn = null, dir = 1;
      const mid = bars.map((b) => (b.high + b.low) / 2);
      for (let i = 0; i < bars.length; i++) {
        if (a[i] == null) { up.push(null); dn.push(null); trendUp.push(null); continue; }
        const band = p.mult * a[i];
        let basicUp = mid[i] - band;
        let basicDn = mid[i] + band;
        if (finalUp == null) { finalUp = basicUp; finalDn = basicDn; }
        finalUp = bars[i - 1] && bars[i - 1].close > finalUp ? Math.max(basicUp, finalUp) : basicUp;
        finalDn = bars[i - 1] && bars[i - 1].close < finalDn ? Math.min(basicDn, finalDn) : basicDn;
        if (bars[i].close > finalDn) dir = 1;
        else if (bars[i].close < finalUp) dir = -1;
        up.push(finalUp); dn.push(finalDn); trendUp.push(dir === 1);
      }
      const upLine = up.map((v, i) => (v == null || !trendUp[i] ? null : v));
      const dnLine = dn.map((v, i) => (v == null || trendUp[i] ? null : v));
      return {
        plots: [
          { kind: 'line', data: line(bars, upLine), width: 2, color: UP, title: `Supertrend ${p.mult}` },
          { kind: 'line', data: line(bars, dnLine), width: 2, color: DOWN, title: `Supertrend ${p.mult}` },
        ],
      };
    },
  },
  {
    id: 'psar', name: 'Parabolic SAR', full: 'Parabolic Stop and Reverse', cat: 'overlay',
    params: [
      { k: 'step', label: 'Step', def: 0.02, min: 0.001, max: 1, step: 0.001 },
      { k: 'max', label: 'Max', def: 0.2, min: 0.01, max: 2, step: 0.01 },
    ],
    calc(bars, p) {
      const n = bars.length;
      const out = nan(n);
      if (n < 3) return { plots: [{ kind: 'line', data: [], width: 1, color: '#f5a623' }] };
      let up = bars[1].close >= bars[0].close;
      let ep = up ? bars[1].high : bars[1].low;
      let sar = up ? bars[0].low : bars[0].high;
      let af = p.step;
      for (let i = 2; i < n; i++) {
        sar = sar + af * (ep - sar);
        if (up) {
          if (bars[i].low < sar) { up = false; sar = ep; ep = bars[i].low; af = p.step; }
          else if (bars[i].high > ep) { ep = bars[i].high; af = Math.min(p.max, af + p.step); }
        } else {
          if (bars[i].high > sar) { up = true; sar = ep; ep = bars[i].high; af = p.step; }
          else if (bars[i].low < ep) { ep = bars[i].low; af = Math.min(p.max, af + p.step); }
        }
        out[i] = sar;
      }
      return { plots: [{ kind: 'line', data: line(bars, out), width: 1, color: '#f5a623', title: 'PSAR', points: true }] };
    },
  },
  {
    id: 'ichimoku', name: 'Ichimoku Cloud', full: 'Ichimoku Kinko Hyo', cat: 'overlay',
    params: [
      { k: 'tenkan', label: 'Tenkan', def: 9, min: 1, max: 500 },
      { k: 'kijun', label: 'Kijun', def: 26, min: 1, max: 500 },
      { k: 'senkou', label: 'Senkou B', def: 52, min: 1, max: 500 },
    ],
    calc(bars, p, ctx) {
      const mid = (len) => {
        const hi = highest(bars.map((b) => b.high), len);
        const lo = lowest(bars.map((b) => b.low), len);
        return hi.map((h, i) => (h == null || lo[i] == null ? null : (h + lo[i]) / 2));
      };
      const tenkan = mid(p.tenkan), kijun = mid(p.kijun), senkouB = mid(p.senkou);
      const senkouA = tenkan.map((t, i) => (t == null || kijun[i] == null ? null : (t + kijun[i]) / 2));
      const shift = p.kijun;
      const secs = (ctx && ctx.secs) || 3600;
      const shifted = (vals) => {
        const out = [];
        for (let i = 0; i < vals.length; i++) {
          if (vals[i] == null) continue;
          const target = i + shift;
          const time = target < bars.length ? bars[target].time : bars[bars.length - 1].time + (target - bars.length + 1) * secs;
          out.push({ time, value: vals[i] });
        }
        return out;
      };
      return {
        plots: [
          { kind: 'line', data: line(bars, tenkan), width: 1, color: '#26a69a', title: `Tenkan ${p.tenkan}` },
          { kind: 'line', data: line(bars, kijun), width: 1, color: '#ef5350', title: `Kijun ${p.kijun}` },
          { kind: 'line', data: shifted(senkouA), width: 1, color: '#8d6e63', title: 'Senkou A' },
          { kind: 'line', data: shifted(senkouB), width: 1, color: '#42a5f5', title: 'Senkou B' },
        ],
      };
    },
  },
  {
    id: 'envelope', name: 'Envelope', full: 'Moving Average Envelope', cat: 'overlay',
    params: [
      { k: 'length', label: 'Length', def: 20, min: 1, max: 500 },
      { k: 'pct', label: 'Percent', def: 1, min: 0.01, max: 50, step: 0.01 },
    ],
    calc(bars, p) {
      const base = sma(bars.map((b) => b.close), p.length);
      const k = p.pct / 100;
      const upper = base.map((v) => (v == null ? null : v * (1 + k)));
      const lower = base.map((v) => (v == null ? null : v * (1 - k)));
      const t = `ENV ${p.length} ${p.pct}%`;
      return {
        plots: [
          { kind: 'line', data: line(bars, upper), width: 1, color: '#78909c', title: t },
          { kind: 'line', data: line(bars, lower), width: 1, color: '#78909c', title: t },
          { kind: 'line', data: line(bars, base), width: 1, dashed: true, color: null, title: t },
        ],
      };
    },
  },
  {
    id: 'pivots', name: 'Pivot Points', full: 'Classic Pivot Points (daily)', cat: 'overlay',
    params: [{ k: 'type', label: 'Show', def: 1, min: 1, max: 1 }],
    calc(bars) {
      const days = new Map();
      for (const b of bars) {
        const d = Math.floor(b.time / 86400);
        if (!days.has(d)) days.set(d, { high: -Infinity, low: Infinity, close: b.close });
        const cur = days.get(d);
        cur.high = Math.max(cur.high, b.high);
        cur.low = Math.min(cur.low, b.low);
        cur.close = b.close;
      }
      const keys = Array.from(days.keys()).sort((a, b) => a - b);
      const P = [], R1 = [], S1 = [];
      for (let i = 0; i < bars.length; i++) {
        const d = Math.floor(bars[i].time / 86400);
        const idx = keys.indexOf(d);
        if (idx <= 0) { P.push(null); R1.push(null); S1.push(null); continue; }
        const prev = days.get(keys[idx - 1]);
        const pv = (prev.high + prev.low + prev.close) / 3;
        P.push(pv);
        R1.push(2 * pv - prev.low);
        S1.push(2 * pv - prev.high);
      }
      return {
        plots: [
          { kind: 'line', data: line(bars, P), width: 1, color: '#b0bec5', title: 'P' },
          { kind: 'line', data: line(bars, R1), width: 1, color: '#ef5350', title: 'R1' },
          { kind: 'line', data: line(bars, S1), width: 1, color: '#26a69a', title: 'S1' },
        ],
      };
    },
  },

  /* ---------------- oscillators ---------------- */
  {
    id: 'rsi', name: 'RSI', full: 'Relative Strength Index', cat: 'pane',
    params: [{ k: 'length', label: 'Length', def: 14, min: 2, max: 500 }],
    calc(bars, p) {
      const ch = bars.map((b, i) => (i === 0 ? null : b.close - bars[i - 1].close));
      const gain = ch.map((c) => (c == null ? null : Math.max(0, c)));
      const loss = ch.map((c) => (c == null ? null : Math.max(0, -c)));
      const ag = rma(gain, p.length), al = rma(loss, p.length);
      const out = ag.map((g, i) => {
        if (g == null || al[i] == null) return null;
        if (al[i] === 0) return 100;
        const rs = g / al[i];
        return 100 - 100 / (1 + rs);
      });
      const lvl = (v) => bars.map((b) => ({ time: b.time, value: v }));
      return {
        plots: [
          { kind: 'line', data: line(bars, out), width: 2, title: `RSI ${p.length}` },
          { kind: 'line', data: lvl(70), width: 1, color: 'rgba(239,83,80,0.45)', dashed: true, title: '' },
          { kind: 'line', data: lvl(30), width: 1, color: 'rgba(38,166,154,0.45)', dashed: true, title: '' },
        ],
        scale: { min: 0, max: 100 },
      };
    },
  },
  {
    id: 'macd', name: 'MACD', full: 'Moving Average Convergence Divergence', cat: 'pane',
    params: [
      { k: 'fast', label: 'Fast', def: 12, min: 1, max: 200 },
      { k: 'slow', label: 'Slow', def: 26, min: 1, max: 400 },
      { k: 'signal', label: 'Signal', def: 9, min: 1, max: 100 },
    ],
    calc(bars, p) {
      const closes = bars.map((b) => b.close);
      const f = ema(closes, p.fast), s = ema(closes, p.slow);
      const macd = f.map((v, i) => (v == null || s[i] == null ? null : v - s[i]));
      const clean = macd.map((v) => (v == null ? 0 : v));
      const sig = ema(clean, p.signal).map((v, i) => (macd[i] == null ? null : v));
      const h = macd.map((v, i) => (v == null || sig[i] == null ? null : v - sig[i]));
      return {
        plots: [
          { kind: 'hist', data: hist(bars, h, (v) => (v >= 0 ? cUp : cDown)), title: '' },
          { kind: 'line', data: line(bars, macd), width: 2, color: '#4c8dff', title: `MACD ${p.fast} ${p.slow}` },
          { kind: 'line', data: line(bars, sig), width: 2, color: '#ff9800', title: `Signal ${p.signal}` },
        ],
      };
    },
  },
  {
    id: 'stoch', name: 'Stochastic', full: 'Stochastic Oscillator', cat: 'pane',
    params: [
      { k: 'k', label: '%K length', def: 14, min: 1, max: 200 },
      { k: 'smooth', label: '%K smoothing', def: 3, min: 1, max: 50 },
      { k: 'd', label: '%D length', def: 3, min: 1, max: 50 },
    ],
    calc(bars, p) {
      const hi = highest(bars.map((b) => b.high), p.k);
      const lo = lowest(bars.map((b) => b.low), p.k);
      const raw = bars.map((b, i) => {
        if (hi[i] == null || lo[i] == null) return null;
        const rng = hi[i] - lo[i];
        return rng === 0 ? 50 : ((b.close - lo[i]) / rng) * 100;
      });
      const k = sma(raw.map((v) => (v == null ? 0 : v)), p.smooth).map((v, i) => (raw[i] == null ? null : v));
      const d = sma(k.map((v) => (v == null ? 0 : v)), p.d).map((v, i) => (k[i] == null ? null : v));
      const lvl = (v) => bars.map((b) => ({ time: b.time, value: v }));
      return {
        plots: [
          { kind: 'line', data: line(bars, k), width: 1.5, color: '#4c8dff', title: '%K' },
          { kind: 'line', data: line(bars, d), width: 1.5, color: '#ff9800', title: '%D' },
          { kind: 'line', data: lvl(80), width: 1, color: 'rgba(239,83,80,0.4)', dashed: true },
          { kind: 'line', data: lvl(20), width: 1, color: 'rgba(38,166,154,0.4)', dashed: true },
        ],
        scale: { min: 0, max: 100 },
      };
    },
  },
  {
    id: 'stochrsi', name: 'Stoch RSI', full: 'Stochastic RSI', cat: 'pane',
    params: [
      { k: 'length', label: 'RSI length', def: 14, min: 2, max: 200 },
      { k: 'stoch', label: 'Stoch length', def: 14, min: 1, max: 200 },
      { k: 'k', label: '%K', def: 3, min: 1, max: 20 },
      { k: 'd', label: '%D', def: 3, min: 1, max: 20 },
    ],
    calc(bars, p) {
      const rsiDef = INDICATOR_DEFS.find((d) => d.id === 'rsi');
      const r = rsiDef.calc(bars, { length: p.length }).plots[0].data;
      const map = new Map(r.map((pt) => [pt.time, pt.value]));
      const rs = bars.map((b) => (map.has(b.time) ? map.get(b.time) : null));
      const hi = highest(rs.map((v) => (v == null ? -Infinity : v)), p.stoch);
      const lo = lowest(rs.map((v) => (v == null ? Infinity : v)), p.stoch);
      const raw = rs.map((v, i) => {
        if (v == null || hi[i] == null || lo[i] == null || !Number.isFinite(hi[i]) || !Number.isFinite(lo[i])) return null;
        const rng = hi[i] - lo[i];
        return rng === 0 ? 50 : ((v - lo[i]) / rng) * 100;
      });
      const k = sma(raw.map((v) => (v == null ? 0 : v)), p.k).map((v, i) => (raw[i] == null ? null : v));
      const d = sma(k.map((v) => (v == null ? 0 : v)), p.d).map((v, i) => (k[i] == null ? null : v));
      const lvl = (v) => bars.map((b) => ({ time: b.time, value: v }));
      return {
        plots: [
          { kind: 'line', data: line(bars, k), width: 1.5, color: '#4c8dff', title: '%K' },
          { kind: 'line', data: line(bars, d), width: 1.5, color: '#ff9800', title: '%D' },
          { kind: 'line', data: lvl(80), width: 1, color: 'rgba(239,83,80,0.4)', dashed: true },
          { kind: 'line', data: lvl(20), width: 1, color: 'rgba(38,166,154,0.4)', dashed: true },
        ],
        scale: { min: 0, max: 100 },
      };
    },
  },
  {
    id: 'atr', name: 'ATR', full: 'Average True Range', cat: 'pane',
    params: [{ k: 'length', label: 'Length', def: 14, min: 1, max: 500 }],
    calc(bars, p) {
      const v = atr(bars, p.length);
      return { plots: [{ kind: 'line', data: line(bars, v), width: 1.5, title: `ATR ${p.length}` }] };
    },
  },
  {
    id: 'adx', name: 'ADX / DMI', full: 'Average Directional Index', cat: 'pane',
    params: [{ k: 'length', label: 'Length', def: 14, min: 2, max: 200 }],
    calc(bars, p) {
      const n = bars.length;
      const plusDM = nan(n), minusDM = nan(n);
      for (let i = 1; i < n; i++) {
        const upMove = bars[i].high - bars[i - 1].high;
        const downMove = bars[i - 1].low - bars[i].low;
        plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
        minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
      }
      const tr = rma(trueRange(bars), p.length);
      const pdi = rma(plusDM, p.length).map((v, i) => (v == null || !tr[i] ? null : (100 * v) / tr[i]));
      const mdi = rma(minusDM, p.length).map((v, i) => (v == null || !tr[i] ? null : (100 * v) / tr[i]));
      const dx = pdi.map((v, i) => {
        if (v == null || mdi[i] == null || v + mdi[i] === 0) return null;
        return (100 * Math.abs(v - mdi[i])) / (v + mdi[i]);
      });
      const adx = rma(dx.map((v) => (v == null ? 0 : v)), p.length).map((v, i) => (dx[i] == null ? null : v));
      return {
        plots: [
          { kind: 'line', data: line(bars, adx), width: 2, color: '#e0e0e0', title: 'ADX' },
          { kind: 'line', data: line(bars, pdi), width: 1.2, color: '#26a69a', title: '+DI' },
          { kind: 'line', data: line(bars, mdi), width: 1.2, color: '#ef5350', title: '-DI' },
        ],
      };
    },
  },
  {
    id: 'cci', name: 'CCI', full: 'Commodity Channel Index', cat: 'pane',
    params: [{ k: 'length', label: 'Length', def: 20, min: 1, max: 500 }],
    calc(bars, p) {
      const tp = bars.map((b) => (b.high + b.low + b.close) / 3);
      const ma = sma(tp, p.length);
      const md = nan(bars.length);
      for (let i = p.length - 1; i < bars.length; i++) {
        let s = 0;
        for (let j = i - p.length + 1; j <= i; j++) s += Math.abs(tp[j] - ma[i]);
        md[i] = s / p.length;
      }
      const out = tp.map((v, i) => (ma[i] == null || !md[i] ? null : (v - ma[i]) / (0.015 * md[i])));
      const lvl = (v) => bars.map((b) => ({ time: b.time, value: v }));
      return {
        plots: [
          { kind: 'line', data: line(bars, out), width: 1.5, title: `CCI ${p.length}` },
          { kind: 'line', data: lvl(100), width: 1, color: 'rgba(239,83,80,0.35)', dashed: true },
          { kind: 'line', data: lvl(-100), width: 1, color: 'rgba(38,166,154,0.35)', dashed: true },
          { kind: 'line', data: lvl(0), width: 1, color: 'rgba(255,255,255,0.12)' },
        ],
      };
    },
  },
  {
    id: 'willr', name: 'Williams %R', full: 'Williams Percent Range', cat: 'pane',
    params: [{ k: 'length', label: 'Length', def: 14, min: 1, max: 500 }],
    calc(bars, p) {
      const hi = highest(bars.map((b) => b.high), p.length);
      const lo = lowest(bars.map((b) => b.low), p.length);
      const out = bars.map((b, i) => {
        if (hi[i] == null || lo[i] == null) return null;
        const rng = hi[i] - lo[i];
        return rng === 0 ? -50 : ((hi[i] - b.close) / rng) * -100;
      });
      const lvl = (v) => bars.map((b) => ({ time: b.time, value: v }));
      return {
        plots: [
          { kind: 'line', data: line(bars, out), width: 1.5, title: `%R ${p.length}` },
          { kind: 'line', data: lvl(-20), width: 1, color: 'rgba(239,83,80,0.35)', dashed: true },
          { kind: 'line', data: lvl(-80), width: 1, color: 'rgba(38,166,154,0.35)', dashed: true },
        ],
        scale: { min: -100, max: 0 },
      };
    },
  },
  {
    id: 'momentum', name: 'Momentum', full: 'Momentum', cat: 'pane',
    params: [{ k: 'length', label: 'Length', def: 10, min: 1, max: 500 }],
    calc(bars, p) {
      const out = bars.map((b, i) => (i < p.length ? null : b.close - bars[i - p.length].close));
      return { plots: [{ kind: 'line', data: line(bars, out), width: 1.5, title: `MOM ${p.length}` }] };
    },
  },
  {
    id: 'roc', name: 'ROC', full: 'Rate of Change', cat: 'pane',
    params: [{ k: 'length', label: 'Length', def: 9, min: 1, max: 500 }],
    calc(bars, p) {
      const out = bars.map((b, i) => {
        if (i < p.length) return null;
        const prev = bars[i - p.length].close;
        return prev ? ((b.close - prev) / prev) * 100 : null;
      });
      return { plots: [{ kind: 'line', data: line(bars, out), width: 1.5, title: `ROC ${p.length}` }] };
    },
  },
  {
    id: 'obv', name: 'OBV', full: 'On Balance Volume', cat: 'pane',
    params: [],
    calc(bars) {
      let acc = 0;
      const out = bars.map((b, i) => {
        if (i === 0) { acc = b.volume || 0; return acc; }
        const prev = bars[i - 1].close;
        const v = b.volume || 0;
        if (b.close > prev) acc += v;
        else if (b.close < prev) acc -= v;
        return acc;
      });
      return { plots: [{ kind: 'line', data: line(bars, out), width: 1.5, color: '#42a5f5', title: 'OBV' }] };
    },
  },
  {
    id: 'mfi', name: 'MFI', full: 'Money Flow Index', cat: 'pane',
    params: [{ k: 'length', label: 'Length', def: 14, min: 2, max: 200 }],
    calc(bars, p) {
      const tp = bars.map((b) => (b.high + b.low + b.close) / 3);
      const pos = nan(bars.length), neg = nan(bars.length);
      for (let i = 1; i < bars.length; i++) {
        const flow = tp[i] * (bars[i].volume || 0);
        if (tp[i] > tp[i - 1]) pos[i] = flow;
        else if (tp[i] < tp[i - 1]) neg[i] = flow;
      }
      const ps = nan(bars.length), ns = nan(bars.length);
      for (let i = p.length; i < bars.length; i++) {
        let a = 0, b2 = 0;
        for (let j = i - p.length + 1; j <= i; j++) { a += pos[j] || 0; b2 += neg[j] || 0; }
        ps[i] = a; ns[i] = b2;
      }
      const out = ps.map((v, i) => {
        if (v == null) return null;
        if (!ns[i]) return 100;
        return 100 - 100 / (1 + v / ns[i]);
      });
      const lvl = (v) => bars.map((b) => ({ time: b.time, value: v }));
      return {
        plots: [
          { kind: 'line', data: line(bars, out), width: 1.5, title: `MFI ${p.length}` },
          { kind: 'line', data: lvl(80), width: 1, color: 'rgba(239,83,80,0.35)', dashed: true },
          { kind: 'line', data: lvl(20), width: 1, color: 'rgba(38,166,154,0.35)', dashed: true },
        ],
        scale: { min: 0, max: 100 },
      };
    },
  },
  {
    id: 'cmf', name: 'CMF', full: 'Chaikin Money Flow', cat: 'pane',
    params: [{ k: 'length', label: 'Length', def: 20, min: 1, max: 500 }],
    calc(bars, p) {
      const mfv = bars.map((b) => {
        const rng = b.high - b.low;
        if (!rng) return 0;
        return (((b.close - b.low) - (b.high - b.close)) / rng) * (b.volume || 0);
      });
      const vol = bars.map((b) => b.volume || 0);
      const ms = nan(bars.length), vs = nan(bars.length);
      for (let i = p.length - 1; i < bars.length; i++) {
        let a = 0, v = 0;
        for (let j = i - p.length + 1; j <= i; j++) { a += mfv[j]; v += vol[j]; }
        ms[i] = a; vs[i] = v;
      }
      const out = ms.map((v, i) => (v == null || !vs[i] ? null : v / vs[i]));
      return { plots: [{ kind: 'line', data: line(bars, out), width: 1.5, title: `CMF ${p.length}` }] };
    },
  },
  {
    id: 'ao', name: 'Awesome Osc', full: 'Awesome Oscillator', cat: 'pane',
    params: [
      { k: 'fast', label: 'Fast', def: 5, min: 1, max: 100 },
      { k: 'slow', label: 'Slow', def: 34, min: 2, max: 400 },
    ],
    calc(bars, p) {
      const mid = bars.map((b) => (b.high + b.low) / 2);
      const f = sma(mid, p.fast), s = sma(mid, p.slow);
      const out = f.map((v, i) => (v == null || s[i] == null ? null : v - s[i]));
      return {
        plots: [{ kind: 'hist', data: hist(bars, out, (v) => (v >= 0 ? cUp : cDown), 0), title: `AO ${p.fast} ${p.slow}` }],
      };
    },
  },
  {
    id: 'vol', name: 'Volume', full: 'Volume', cat: 'pane',
    params: [{ k: 'maLength', label: 'MA length', def: 20, min: 0, max: 500 }],
    calc(bars, p) {
      const cols = (v, i) => (bars[i].close >= bars[i].open ? cUp : cDown);
      const vols = bars.map((b) => b.volume || 0);
      const plots = [{ kind: 'hist', data: hist(bars, vols, cols), title: 'Vol' }];
      if (p.maLength > 0) {
        plots.push({ kind: 'line', data: line(bars, sma(vols, p.maLength)), width: 1.2, color: '#ffb74d', title: `MA ${p.maLength}` });
      }
      return { plots };
    },
  },
];

export const INDICATOR_MAP = Object.fromEntries(INDICATOR_DEFS.map((d) => [d.id, d]));

export function defaultParams(def) {
  const out = {};
  for (const p of def.params || []) out[p.k] = p.def;
  return out;
}

export const OSC_COLORS = ['#4c8dff', '#ff9800', '#26a69a', '#e040fb', '#ffca28', '#29b6f6', '#ef5350', '#9ccc65', '#ab47bc', '#ff7043'];
export const OVERLAY_COLORS = ['#f5a623', '#4c8dff', '#e040fb', '#26a69a', '#ffca28', '#ef5350', '#29b6f6', '#9ccc65'];
