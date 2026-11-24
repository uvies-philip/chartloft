// Chart engine: wraps TradingView Lightweight Charts 5.x, manages series, panes,
// indicators, compare overlays and bar replay.

import { INDICATOR_MAP, defaultParams, OSC_COLORS, OVERLAY_COLORS } from './indicators.js';
import { tf } from './catalog.js';
import { uid, clamp } from './util.js';

const LWC = () => window.LightweightCharts;

export const THEMES = {
  dark: {
    bg: '#0b1017', panel: '#0b1017', text: '#9fb0c6', muted: '#6c7d92',
    grid: 'rgba(148,163,184,0.055)', border: 'rgba(148,163,184,0.13)', accent: '#5b8cff',
    up: '#2ee6a8', down: '#ff5f7a', crosshair: 'rgba(159,176,198,0.34)',
    volUp: 'rgba(46,230,168,0.28)', volDown: 'rgba(255,95,122,0.28)',
  },
  light: {
    bg: '#ffffff', panel: '#ffffff', text: '#43536a', muted: '#71829a',
    grid: 'rgba(15,30,50,0.055)', border: 'rgba(15,30,50,0.10)', accent: '#3b6fe8',
    up: '#059f7a', down: '#e0384f', crosshair: 'rgba(60,80,110,0.40)',
    volUp: 'rgba(5,159,122,0.26)', volDown: 'rgba(224,56,79,0.26)',
  },
};

export class ChartView {
  constructor({ container, theme = 'dark', chartType = 'candles', onCrosshair, onLegend }) {
    this.container = container;
    this.themeName = theme;
    this.theme = THEMES[theme];
    this.onCrosshair = onCrosshair || (() => {});
    this.onLegend = onLegend || (() => {});

    const L = LWC();
    this.chart = L.createChart(container, this._options());
    this.chart.timeScale().applyOptions({ rightOffset: 6, barSpacing: 8 });

    this.indicators = [];
    this.compare = [];
    this.bars = [];
    this.meta = { digits: 2, symbol: '', interval: '15m' };
    this.chartType = chartType;
    this.showVolume = true;
    this.replay = { active: false, index: 0 };
    this._volSeries = null;
    this._priceSeries = null;

    this.chart.subscribeCrosshairMove((param) => this._crosshair(param));
    new ResizeObserver(() => this.resize()).observe(container);
    this._buildPriceSeries();
    this._buildVolume();
  }

  _options() {
    const t = this.theme;
    const L = LWC();
    return {
      layout: {
        background: { type: 'solid', color: t.bg },
        textColor: t.text,
        fontFamily: 'Inter, -apple-system, Segoe UI, sans-serif',
        fontSize: 11,
        attributionLogo: false,
        panes: { separatorColor: t.border, separatorHoverColor: 'rgba(76,141,255,0.2)', enableResize: true },
      },
      grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
      crosshair: {
        mode: L.CrosshairMode.Normal,
        vertLine: { color: t.crosshair, width: 1, style: L.LineStyle.LargeDashed, labelBackgroundColor: '#2b3648' },
        horzLine: { color: t.crosshair, width: 1, style: L.LineStyle.LargeDashed, labelBackgroundColor: '#2b3648' },
      },
      rightPriceScale: {
        borderColor: t.border,
        scaleMargins: { top: 0.07, bottom: 0.22 },
        minimumWidth: 66,
      },
      timeScale: {
        borderColor: t.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 8,
        minBarSpacing: 0.6,
      },
      localization: { locale: 'en-GB' },
      autoSize: false,
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    };
  }

  /* ------------------------------- price series ------------------------------ */
  _priceOpts() {
    const t = this.theme;
    const d = this.meta.digits;
    return {
      upColor: t.up, downColor: t.down,
      borderUpColor: t.up, borderDownColor: t.down,
      wickUpColor: t.up, wickDownColor: t.down,
      priceFormat: { type: 'price', precision: d, minMove: 1 / Math.pow(10, d) },
      priceLineVisible: false,
      lastValueVisible: true,
    };
  }

  _buildPriceSeries() {
    const L = LWC();
    if (this._priceSeries) { this.chart.removeSeries(this._priceSeries); this._priceSeries = null; }
    const type = this.chartType;
    let def;
    if (type === 'bar') def = L.BarSeries;
    else if (type === 'line') def = L.LineSeries;
    else if (type === 'area') def = L.AreaSeries;
    else def = L.CandlestickSeries;

    const base = this._priceOpts();
    if (type === 'line') {
      this._priceSeries = this.chart.addSeries(def, {
        color: this.theme.accent, lineWidth: 2, priceFormat: base.priceFormat,
        priceLineVisible: false, lastValueVisible: true,
        crosshairMarkerVisible: true, crosshairMarkerRadius: 3,
      }, 0);
    } else if (type === 'area') {
      this._priceSeries = this.chart.addSeries(def, {
        lineColor: this.theme.accent, topColor: 'rgba(76,141,255,0.35)', bottomColor: 'rgba(76,141,255,0.02)',
        lineWidth: 2, priceFormat: base.priceFormat, priceLineVisible: false, lastValueVisible: true,
      }, 0);
    } else {
      this._priceSeries = this.chart.addSeries(def, base, 0);
    }
    this.series = this._priceSeries;
  }

  setChartType(type) {
    if (this.chartType === type) return;
    this.chartType = type;
    this._buildPriceSeries();
    this._applyData();
    this._buildIndicators();
  }

  _buildVolume() {
    const L = LWC();
    if (this._volSeries) { this.chart.removeSeries(this._volSeries); this._volSeries = null; }
    this._volSeries = this.chart.addSeries(L.HistogramSeries, {
      priceScaleId: 'vol',
      priceFormat: { type: 'volume' },
      priceLineVisible: false,
      lastValueVisible: false,
      visible: this.showVolume,
    }, 0);
    this.chart.priceScale('vol', 0).applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
  }

  setVolumeVisible(v) {
    this.showVolume = !!v;
    if (this._volSeries) this._volSeries.applyOptions({ visible: !!v && this._hasVol !== false });
  }

  /* --------------------------------- data ---------------------------------- */
  setData(bars, meta) {
    this.meta = { ...this.meta, ...meta };
    this.bars = bars;
    this.replay.active = false;
    if (this._priceSeries) {
      this._priceSeries.applyOptions({
        priceFormat: { type: 'price', precision: this.meta.digits, minMove: 1 / Math.pow(10, this.meta.digits) },
      });
    }
    this._applyData();
    this._buildIndicators();
    this.chart.timeScale().applyOptions({ timeVisible: tf(this.meta.interval).secs < 86400 });
    this.resetView();
    this.onLegend();
  }

  // TradingView-like default view: the most recent ~180 bars rather than the whole history.
  resetView() {
    const bars = this._visibleBars();
    if (!bars.length) return;
    // Aim for the 8px per bar TradingView uses, adapted to the panel width,
    // otherwise the candles collapse into thin sticks on wide screens.
    const w = (this.container && this.container.clientWidth) || 900;
    const target = clamp(Math.round(w / 8), 60, 260);
    const n = Math.min(bars.length - 1, target);
    try {
      this.chart.timeScale().setVisibleLogicalRange({ from: bars.length - n, to: bars.length + 2 });
    } catch { this.chart.timeScale().fitContent(); }
  }

  _visibleBars() {
    if (!this.replay.active) return this.bars;
    return this.bars.slice(0, clamp(this.replay.index + 1, 1, this.bars.length));
  }

  _applyData() {
    const bars = this._visibleBars();
    if (!bars.length) return;
    // The free FX feed returns single-price bars for quiet buckets, roughly nine
    // percent of a 5m series. They draw as bare 1px sticks, so rebuild each one
    // from the previous close and give it the smallest visible range.
    const minMove = 1 / Math.pow(10, this.meta.digits || 2);
    for (let i = 1; i < bars.length; i++) {
      const b = bars[i];
      if (b.high !== b.low) continue;
      const pc = bars[i - 1].close;
      b.open = pc;
      b.high = Math.max(pc, b.close);
      b.low = Math.min(pc, b.close);
      if (b.high === b.low) { b.high = b.close + minMove; b.low = b.close - minMove; }
    }
    const t = this.theme;
    let data;
    if (this.chartType === 'line' || this.chartType === 'area') {
      data = bars.map((b) => ({ time: b.time, value: b.close }));
    } else if (this.chartType === 'ha') {
      data = heikinAshi(bars).map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }));
    } else {
      data = bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }));
    }
    this._priceSeries.setData(data);
    const hasVol = bars.some((b) => (b.volume || 0) > 0);
    this._hasVol = hasVol;
    // Reserve the lower band for volume only when the instrument actually has any.
    try {
      this.chart.priceScale('right', 0).applyOptions({
        scaleMargins: { top: 0.06, bottom: hasVol && this.showVolume ? 0.20 : 0.06 },
      });
    } catch {}
    if (this._volSeries) {
      this._volSeries.applyOptions({ visible: this.showVolume && hasVol });
      this._volSeries.setData(bars.map((b) => ({
        time: b.time, value: b.volume || 0,
        color: b.close >= b.open ? t.volUp : t.volDown,
      })));
    }
  }

  clearData() {
    this.bars = [];
    try { this._priceSeries.setData([]); } catch {}
    if (this._volSeries) { try { this._volSeries.setData([]); } catch {} }
    for (const inst of this.indicators) {
      for (const s of inst._series || []) { try { s.setData([]); } catch {} }
      inst._lastValues = [];
    }
    this.onLegend();
  }

  // Start the next candle locally. Free history feeds only add a bar when they
  // get round to it, which is what made the last candle stretch instead of a new
  // one opening on the bucket boundary.
  appendBar(bar) {
    if (!bar || !this.bars.length) return false;
    const last = this.bars[this.bars.length - 1];
    if (bar.time <= last.time) return false;
    this.bars.push(bar);
    try {
      if (this.chartType === 'ha') this._applyData();
      else if (this.chartType === 'line' || this.chartType === 'area') this._priceSeries.update({ time: bar.time, value: bar.close });
      else this._priceSeries.update(bar);
    } catch { /* the next full refresh will correct it */ }
    if (this._volSeries && this._hasVol) {
      try {
        this._volSeries.update({ time: bar.time, value: bar.volume || 0, color: bar.close >= bar.open ? this.theme.volUp : this.theme.volDown });
      } catch { /* ignore */ }
    }
    this._buildIndicators();
    this.onLegend();
    return true;
  }

  // Patch the forming bar from a single price tick. Keeps the view, the drawings
  // and the panes untouched, which is what makes it feel live.
  patchLastBar(price) {
    if (!Number.isFinite(price)) return false;
    const bars = this._visibleBars();
    const i = bars.length - 1;
    const b = bars[i];
    if (!b) return false;
    // A bar that arrives with high === low is a single print from the feed and
    // renders as a bare stick. Rebuild its body from the previous close.
    const flat = b.high === b.low;
    if (!flat && b.close === price) return false;
    if (flat && bars[i - 1]) {
      b.open = bars[i - 1].close;
      b.high = Math.max(b.open, price);
      b.low = Math.min(b.open, price);
    } else {
      b.high = Math.max(b.high, price);
      b.low = Math.min(b.low, price);
    }
    b.close = price;
    if (this.chartType === 'line' || this.chartType === 'area') {
      this._priceSeries.update({ time: b.time, value: price });
    } else if (this.chartType === 'ha') {
      this._applyData();
    } else {
      this._priceSeries.update({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close });
    }
    if (this._volSeries && this._hasVol) {
      this._volSeries.update({ time: b.time, value: b.volume || 0, color: b.close >= b.open ? this.theme.volUp : this.theme.volDown });
    }
    this.onLegend();
    return true;
  }

  // Replace the dataset after a periodic re-sync without snapping the viewport back.
  refreshData(bars) {
    const grew = !this.bars.length || bars.length !== this.bars.length || bars[bars.length - 1].time !== this.bars[this.bars.length - 1].time;
    this.bars = bars;
    this._applyData();
    if (grew) this._buildIndicators();
    this.onLegend();
  }

  updateLastBar(bars) {
    this.bars = bars;
    if (this.replay.active) return;
    const b = bars[bars.length - 1];
    if (!b) return;
    const t = this.theme;
    if (this.chartType === 'line' || this.chartType === 'area') {
      this._priceSeries.update({ time: b.time, value: b.close });
    } else if (this.chartType === 'ha') {
      const ha = heikinAshi(bars.slice(-200));
      const last = ha[ha.length - 1];
      this._priceSeries.update({ time: last.time, open: last.open, high: last.high, low: last.low, close: last.close });
    } else {
      this._priceSeries.update({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close });
    }
    if (this._volSeries) {
      this._volSeries.update({ time: b.time, value: b.volume || 0, color: b.close >= b.open ? t.volUp : t.volDown });
    }
    if (this._visibleBars().length !== this._indLen) this._buildIndicators();
    this.onLegend();
  }

  /* ------------------------------- indicators ------------------------------- */
  setIndicators(list) {
    this.indicators = list;
    this._buildIndicators();
  }

  _buildIndicators() {
    const L = LWC();
    // drop old series
    for (const inst of this.indicators) {
      for (const s of inst._series || []) { try { this.chart.removeSeries(s); } catch {} }
      inst._series = [];
    }
    // remove extra panes (keep pane 0)
    const panes = this.chart.panes();
    for (let i = panes.length - 1; i >= 1; i--) {
      try { this.chart.removePane(i); } catch {}
    }

    const oscs = this.indicators.filter((i) => i.visible !== false && INDICATOR_MAP[i.id]?.cat === 'pane');
    let paneIndex = 1;
    const paneOf = new Map();
    for (const inst of oscs) {
      while (this.chart.panes().length <= paneIndex) this.chart.addPane();
      paneOf.set(inst.uid, paneIndex);
      paneIndex += 1;
    }

    for (const inst of this.indicators) {
      const def = INDICATOR_MAP[inst.id];
      if (!def) continue;
      inst._series = [];
      if (inst.visible === false) continue;
      let result;
      try { result = def.calc(this._visibleBars(), inst.params, { secs: tf(this.meta.interval).secs, digits: this.meta.digits }); }
      catch (e) { console.warn('indicator failed', inst.id, e); continue; }
      if (!result || !result.plots) continue;
      const pane = def.cat === 'pane' ? (paneOf.get(inst.uid) ?? 1) : 0;
      inst._lastValues = [];
      result.plots.forEach((plot, idx) => {
        const opts = {
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          color: plot.color === null ? inst.color : (plot.color || inst.color),
          lineWidth: plot.width || 1,
          lineStyle: plot.dashed ? L.LineStyle.Dashed : L.LineStyle.Solid,
          title: '',
        };
        let series;
        if (plot.kind === 'hist') {
          series = this.chart.addSeries(L.HistogramSeries, {
            priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
            color: inst.color, priceFormat: { type: 'price', precision: this.meta.digits, minMove: 1 / Math.pow(10, this.meta.digits) },
          }, pane);
        } else if (plot.kind === 'area') {
          series = this.chart.addSeries(L.AreaSeries, {
            ...opts, topColor: 'rgba(76,141,255,0.25)', bottomColor: 'rgba(76,141,255,0.01)',
          }, pane);
        } else {
          series = this.chart.addSeries(L.LineSeries, opts, pane);
        }
        try { series.setData(plot.data); } catch (e) { console.warn('setData failed', inst.id, idx, e); }
        if (plot.points && series.applyOptions) {
          try { series.applyOptions({ pointMarkersVisible: true, pointMarkersRadius: 1.5 }); } catch { /* older build */ }
        }
        inst._series.push(series);
        const last = plot.data.length ? plot.data[plot.data.length - 1] : null;
        if (last && last.value !== undefined) {
          inst._lastValues.push({ title: plot.title || def.name, value: last.value, color: plot.color === null ? inst.color : (plot.color || inst.color) });
        }
      });
    }
    // Stretch factors must be set after the panes hold their series, otherwise the
    // chart re-balances and the price pane ends up too small.
    const totalPanes = this.chart.panes().length;
    if (totalPanes > 1) {
      this.chart.panes()[0].setStretchFactor(4);
      for (let i = 1; i < totalPanes; i++) this.chart.panes()[i].setStretchFactor(1);
    }
    this._indLen = this._visibleBars().length;
    this.onLegend();
  }

  _computeInstance(inst, rebuild = true) {
    if (rebuild) this._buildIndicators();
  }

  toggleIndicator(uidStr, visible) {
    const inst = this.indicators.find((i) => i.uid === uidStr);
    if (!inst) return;
    inst.visible = visible;
    this._buildIndicators();
  }

  /* --------------------------------- compare -------------------------------- */
  setCompare(list) {
    const L = LWC();
    for (const c of this.compare) { try { this.chart.removeSeries(c._series); } catch {} }
    this.compare = list.map((c) => ({ ...c }));
    const bars = this._visibleBars();
    if (!bars.length) return;
    for (const c of this.compare) {
      if (!c.bars || !c.bars.length) continue;
      const base = c.bars[0].close;
      const series = this.chart.addSeries(L.LineSeries, {
        color: c.color || '#ff9800',
        lineWidth: 2,
        priceScaleId: 'cmp',
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        priceFormat: { type: 'custom', formatter: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` },
      }, 0);
      series.setData(c.bars.map((b) => ({ time: b.time, value: ((b.close - base) / base) * 100 })));
      c._series = series;
    }
    try {
      this.chart.priceScale('cmp', 0).applyOptions({ scaleMargins: { top: 0.12, bottom: 0.28 }, visible: false });
    } catch {}
    this.onLegend();
  }

  /* ---------------------------------- replay --------------------------------- */
  startReplay(index) {
    this.replay.active = true;
    this.replay.index = clamp(index, 10, this.bars.length - 1);
    this._applyData();
    this._buildIndicators();
    const from = Math.max(0, this.replay.index - 90);
    this.chart.timeScale().setVisibleLogicalRange({ from, to: this.replay.index + 12 });
    this.onLegend();
  }

  stepReplay(delta = 1) {
    if (!this.replay.active) return false;
    const next = this.replay.index + delta;
    if (next >= this.bars.length) return false;
    this.replay.index = Math.max(5, next);
    this._applyData();
    this._buildIndicators();
    const range = this.chart.timeScale().getVisibleLogicalRange();
    if (range && this.replay.index > range.to - 3) {
      this.chart.timeScale().setVisibleLogicalRange({ from: range.from, to: range.to + delta });
    }
    this.onLegend();
    return true;
  }

  exitReplay() {
    this.replay.active = false;
    this._applyData();
    this._buildIndicators();
    this.resetView();
    this.onLegend();
  }

  /* ---------------------------------- misc ---------------------------------- */
  setScale({ log, pct }) {
    if (log !== undefined) this.chart.priceScale('right', 0).applyOptions({ mode: log ? 1 : 0 });
    if (pct !== undefined) {
      this._priceSeries.applyOptions({
        priceFormat: pct
          ? { type: 'custom', formatter: (v) => `${v.toFixed(2)}%` }
          : { type: 'price', precision: this.meta.digits, minMove: 1 / Math.pow(10, this.meta.digits) },
      });
    }
  }

  setTheme(name) {
    this.themeName = name;
    this.theme = THEMES[name];
    const L = LWC();
    this.chart.applyOptions(this._options());
    this._priceSeries.applyOptions({ upColor: this.theme.up, downColor: this.theme.down, borderUpColor: this.theme.up, borderDownColor: this.theme.down, wickUpColor: this.theme.up, wickDownColor: this.theme.down });
    if (this.chartType === 'line') this._priceSeries.applyOptions({ color: this.theme.accent });
    this._applyData();
    this._buildIndicators();
  }

  _crosshair(param) {
    const bars = this._visibleBars();
    let bar = null;
    if (param.time) {
      const hit = param.seriesData && param.seriesData.get(this._priceSeries);
      bar = bars.find((b) => b.time === param.time) || null;
      if (bar && hit && hit.close !== undefined && this.chartType !== 'candles' && this.chartType !== 'ha' && this.chartType !== 'bar') {
        bar = { ...bar, close: hit.close };
      }
    }
    this.onCrosshair({ bar, point: param.point, time: param.time });
  }

  legendData() {
    const bars = this._visibleBars();
    const b = bars[bars.length - 1];
    const prev = bars[bars.length - 2];
    const chg = b && prev ? b.close - prev.close : 0;
    const pct = b && prev && prev.close ? (chg / prev.close) * 100 : 0;
    return {
      bar: b, prev, change: chg, changePct: pct,
      bars,
      indicators: this.indicators.filter((i) => i.visible !== false && i._lastValues).map((i) => ({
        name: INDICATOR_MAP[i.id]?.name || i.id,
        params: i.params,
        values: i._lastValues,
      })),
      replay: this.replay.active ? { index: this.replay.index, total: this.bars.length } : null,
    };
  }

  screenshot() {
    return this.chart.takeScreenshot(true, false);
  }

  resize() {
    const r = this.container.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    this.chart.resize(r.width, r.height);
  }

  destroy() { try { this.chart.remove(); } catch {} }
}

/* ------------------------------ heikin ashi ------------------------------- */
export function heikinAshi(bars) {
  const out = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const close = (b.open + b.high + b.low + b.close) / 4;
    const open = i === 0 ? (b.open + b.close) / 2 : (out[i - 1].open + out[i - 1].close) / 2;
    const high = Math.max(b.high, open, close);
    const low = Math.min(b.low, open, close);
    out.push({ time: b.time, open, high, low, close });
  }
  return out;
}
