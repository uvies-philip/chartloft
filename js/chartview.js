// Chart engine: wraps TradingView Lightweight Charts 5.x, manages series, panes,
// indicators, compare overlays and bar replay.

import { INDICATOR_MAP, defaultParams, OSC_COLORS, OVERLAY_COLORS } from './indicators.js';
import { tf } from './catalog.js';
import { uid, clamp } from './util.js';

const LWC = () => window.LightweightCharts;

export const THEMES = {
  dark: {
    bg: '#0a0e13', panel: '#0f141b', text: '#c9d4e2', muted: '#7a8798',
    grid: 'rgba(255,255,255,0.045)', border: '#1d2733', accent: '#4c8dff',
    up: '#26a69a', down: '#ef5350', crosshair: 'rgba(180,200,225,0.45)',
    volUp: 'rgba(38,166,154,0.42)', volDown: 'rgba(239,83,80,0.42)',
  },
  light: {
    bg: '#ffffff', panel: '#f7f9fc', text: '#121a24', muted: '#6b7785',
    grid: 'rgba(0,0,0,0.055)', border: '#e2e8f0', accent: '#2962ff',
    up: '#089981', down: '#f23645', crosshair: 'rgba(60,80,110,0.45)',
    volUp: 'rgba(8,153,129,0.35)', volDown: 'rgba(242,54,69,0.35)',
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
    const per = { '1m': 240, '5m': 220, '15m': 190, '30m': 180, '1h': 180, '4h': 150, '1d': 200, '1w': 160, '1M': 130 };
    const n = Math.min(bars.length - 1, per[this.meta.interval] || 180);
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
    // stretch factors: keep price pane dominant
    const totalPanes = this.chart.panes().length;
    if (totalPanes > 1) {
      const oscCount = totalPanes - 1;
      this.chart.panes()[0].setStretchFactor(3);
      for (let i = 1; i < totalPanes; i++) this.chart.panes()[i].setStretchFactor(1);
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
