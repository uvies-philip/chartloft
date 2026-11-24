// Drawing tools drawn on a transparent canvas above the chart.
// Points are stored as { time, price } for on-chart anchors, and { future, price }
// for anchors placed in empty space to the right of the last bar.

import { uid, distToSegment, pointInRect, clamp, fmtPrice, fmtSigned, fmtPct, hexA } from './util.js';

export const TOOLS = {
  cursor: { name: 'Cursor', points: 0 },
  trendline: { name: 'Trend Line', points: 2, hint: 'Click start, click end' },
  ray: { name: 'Ray', points: 2, hint: 'Click start, click through' },
  hline: { name: 'Horizontal Line', points: 1, hint: 'Click a price' },
  hray: { name: 'Horizontal Ray', points: 1, hint: 'Click a start point' },
  vline: { name: 'Vertical Line', points: 1, hint: 'Click a time' },
  rect: { name: 'Rectangle', points: 2, hint: 'Click two corners' },
  ellipse: { name: 'Ellipse', points: 2, hint: 'Click two corners' },
  fib: { name: 'Fib Retracement', points: 2, hint: 'Click swing high and swing low' },
  arrow: { name: 'Arrow', points: 2, hint: 'Click tail, click head' },
  text: { name: 'Text', points: 1, hint: 'Click a point to label', text: true },
  brush: { name: 'Brush', points: -1, hint: 'Drag to draw' },
  measure: { name: 'Measure', points: 2, hint: 'Drag from A to B' },
};

const FIB = [
  { r: 0, c: '#787b86', strong: true },
  { r: 0.236, c: '#f7525f' },
  { r: 0.382, c: '#ff9800' },
  { r: 0.5, c: '#4caf50', strong: true },
  { r: 0.618, c: '#2196f3', strong: true },
  { r: 0.786, c: '#9c27b0' },
  { r: 1, c: '#787b86', strong: true },
  { r: 1.618, c: '#00bcd4' },
];

export class DrawingsLayer {
  constructor({ container, canvas, chart, series, getBars, getDigits, onChange, onSelect, onRequestText, onStatus }) {
    this.container = container;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.chart = chart;
    this.series = series;
    this.getBars = getBars;
    this.getDigits = getDigits || (() => 2);
    this.onChange = onChange || (() => {});
    this.onSelect = onSelect || (() => {});
    this.onRequestText = onRequestText || (async () => '');
    this.onStatus = onStatus || (() => {});

    this.tool = 'cursor';
    this.magnet = false;
    this.hidden = false;
    this.locked = false;
    this.drawings = [];
    this.selected = null;
    this.pending = null;      // shape being placed
    this.drag = null;         // { mode:'move'|'handle', shape, handle, start, orig }
    this.hover = null;
    this.style = { color: '#4c8dff', width: 2, dash: 0, fill: 0.12 };

    this._dirty = true;
    this._raf = 0;
    this._bind();
    this._loop();
  }

  /* ------------------------------ lifecycle ------------------------------ */
  _bind() {
    this._onDown = (e) => this.mousedown(e);
    this._onMove = (e) => this.mousemove(e);
    this._onUp = (e) => this.mouseup(e);
    this._onDbl = (e) => this.dblclick(e);
    this._onCtx = (e) => this.contextmenu(e);

    this.container.addEventListener('mousedown', this._onDown, true);
    window.addEventListener('mousemove', this._onMove, true);
    window.addEventListener('mouseup', this._onUp, true);
    this.container.addEventListener('dblclick', this._onDbl, true);
    this.container.addEventListener('contextmenu', this._onCtx, true);
    this.container.addEventListener('mousemove', (e) => this.hoverCheck(e), false);

    this.chart.timeScale().subscribeVisibleLogicalRangeChange(() => this.invalidate());
    this._resizeObs = new ResizeObserver(() => this.invalidate());
    this._resizeObs.observe(this.container);
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    this.container.removeEventListener('mousedown', this._onDown, true);
    window.removeEventListener('mousemove', this._onMove, true);
    window.removeEventListener('mouseup', this._onUp, true);
    this.container.removeEventListener('dblclick', this._onDbl, true);
    this.container.removeEventListener('contextmenu', this._onCtx, true);
    if (this._resizeObs) this._resizeObs.disconnect();
  }

  invalidate() { this._dirty = true; }

  _loop() {
    this._raf = requestAnimationFrame(() => {
      if (this._dirty) { this._dirty = false; this.draw(); }
      this._loop();
    });
  }

  /* ------------------------------ state API ------------------------------ */
  setTool(name) {
    this.tool = name;
    this.pending = null;
    this.container.style.cursor = name === 'cursor' ? '' : name === 'text' ? 'text' : 'crosshair';
    this.onStatus(name === 'cursor' ? '' : (TOOLS[name]?.hint || ''));
    this.invalidate();
  }

  setDrawings(list) {
    this.drawings = (list || []).map((d) => ({ ...d, id: d.id || uid() }));
    this.selected = null;
    this.invalidate();
  }

  getDrawings() { return this.drawings.map((d) => ({ ...d })); }

  setHidden(h) { this.hidden = !!h; this.invalidate(); }
  setLocked(l) { this.locked = !!l; this.selected = null; this.invalidate(); }
  setMagnet(m) { this.magnet = !!m; }

  clear() {
    this.drawings = [];
    this.selected = null;
    this.pending = null;
    this.onSelect(null);
    this.onChange();
    this.invalidate();
  }

  deleteSelected() {
    if (!this.selected || this.locked) return;
    this.drawings = this.drawings.filter((d) => d.id !== this.selected.id);
    this.selected = null;
    this.onSelect(null);
    this.onChange();
    this.invalidate();
  }

  select(id) {
    this.selected = this.drawings.find((d) => d.id === id) || null;
    this.onSelect(this.selected);
    this.invalidate();
  }

  updateSelectedStyle(patch) {
    if (!this.selected) return;
    this.selected.style = { ...this.selected.style, ...patch };
    this.onChange();
    this.invalidate();
  }

  /* --------------------------- coordinate helpers -------------------------- */
  _rect() { return this.container.getBoundingClientRect(); }

  _toPx(pt) {
    const ts = this.chart.timeScale();
    let logical;
    if (pt.future !== undefined && pt.future !== null) {
      logical = this.getBars().length - 1 + pt.future;
    } else if (pt.time !== undefined) {
      const idx = this._indexByTime().get(pt.time);
      logical = idx !== undefined ? idx : pt.logical;
    } else {
      logical = pt.logical;
    }
    if (logical === undefined || logical === null) return null;
    const x = ts.logicalToCoordinate(logical);
    const y = this.series.priceToCoordinate(pt.price);
    if (x === null || y === null) return null;
    return { x, y };
  }

  _indexByTime() {
    if (!this._idxCache || this._idxCacheLen !== this.getBars().length || this._idxCacheFirst !== (this.getBars()[0] && this.getBars()[0].time)) {
      const bars = this.getBars();
      this._idxCache = new Map(bars.map((b, i) => [b.time, i]));
      this._idxCacheLen = bars.length;
      this._idxCacheFirst = bars[0] && bars[0].time;
    }
    return this._idxCache;
  }

  _pointFromEvent(e, snapPrice = true) {
    const r = this._rect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const bars = this.getBars();
    const ts = this.chart.timeScale();
    const logicalRaw = ts.coordinateToLogical(x);
    let price = this.series.coordinateToPrice(y);
    if (price === null) price = bars.length ? bars[bars.length - 1].close : 0;

    let pt;
    const lastIdx = bars.length - 1;
    const round = logicalRaw === null ? lastIdx : Math.round(logicalRaw);
    if (round > lastIdx) {
      pt = { future: round - lastIdx, price };
    } else {
      const idx = clamp(round, 0, Math.max(0, lastIdx));
      pt = { time: bars[idx].time, price, logical: idx };
    }

    if (snapPrice && this.magnet && round >= 0 && round <= lastIdx) {
      const b = bars[round];
      const cands = [b.open, b.high, b.low, b.close];
      const yOf = (p) => this.series.priceToCoordinate(p);
      let best = price, bestD = Infinity;
      for (const c of cands) {
        const cy = yOf(c);
        if (cy === null) continue;
        const d = Math.abs(cy - y);
        if (d < bestD && d < 24) { bestD = d; best = c; }
      }
      pt.price = best;
    }
    return pt;
  }

  /* ------------------------------ hit testing ----------------------------- */
  _shapeScreen(d) {
    const pts = d.points.map((p) => this._toPx(p)).filter(Boolean);
    return { pts, complete: pts.length === d.points.length };
  }

  _hitShape(d, x, y) {
    const { pts } = this._shapeScreen(d);
    if (!pts.length) return false;
    const tol = 7;
    switch (d.type) {
      case 'hline':
        return Math.abs(y - pts[0].y) <= tol;
      case 'vline':
        return Math.abs(x - pts[0].x) <= tol;
      case 'hray':
        return Math.abs(y - pts[0].y) <= tol && x >= pts[0].x - tol;
      case 'text':
        return pointInRect(x, y, pts[0].x - 4, pts[0].y - 14, 120, 20);
      case 'rect':
      case 'ellipse': {
        if (pts.length < 2) return false;
        const [a, b] = pts;
        const nearEdge =
          Math.abs(y - a.y) <= tol || Math.abs(y - b.y) <= tol ||
          Math.abs(x - a.x) <= tol || Math.abs(x - b.x) <= tol;
        return pointInRect(x, y, a.x, a.y, b.x - a.x, b.y - a.y) && nearEdge;
      }
      case 'brush': {
        for (let i = 1; i < pts.length; i++) {
          if (distToSegment(x, y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y) <= tol) return true;
        }
        return false;
      }
      case 'fib': {
        if (pts.length < 2) return false;
        const x1 = Math.min(pts[0].x, pts[1].x), x2 = Math.max(pts[0].x, pts[1].x);
        if (x < x1 - tol || x > x2 + tol) return false;
        return FIB.some((f) => {
          const yy = pts[0].y + (pts[1].y - pts[0].y) * f.r;
          return Math.abs(y - yy) <= tol;
        });
      }
      default: {
        if (pts.length < 2) return Math.hypot(x - pts[0].x, y - pts[0].y) <= tol;
        const [a, b] = pts;
        return distToSegment(x, y, a.x, a.y, b.x, b.y) <= tol;
      }
    }
  }

  _hitHandle(d, x, y) {
    if (this.locked) return null;
    const { pts } = this._shapeScreen(d);
    for (let i = pts.length - 1; i >= 0; i--) {
      if (Math.hypot(x - pts[i].x, y - pts[i].y) <= 8) return i;
    }
    return null;
  }

  _pick(x, y) {
    for (let i = this.drawings.length - 1; i >= 0; i--) {
      const d = this.drawings[i];
      if (this._hitShape(d, x, y)) return d;
    }
    return null;
  }

  /* ------------------------------ interaction ----------------------------- */
  mousedown(e) {
    if (this.hidden || e.button !== 0) return;
    if (!this.getBars().length) return;
    const r = this._rect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (x < 0 || y < 0 || x > r.width || y > r.height) return;

    // Placing a new shape
    if (this.tool !== 'cursor' && this.tool !== 'measure') {
      e.stopPropagation(); e.preventDefault();
      this._placePoint(e);
      return;
    }
    if (this.tool === 'measure') {
      e.stopPropagation(); e.preventDefault();
      this.pending = { id: 'measure', type: 'measure', points: [this._pointFromEvent(e, false)], style: { ...this.style, color: '#2962ff' }, tmp: true };
      this.drag = { mode: 'create' };
      this.invalidate();
      return;
    }

    // Cursor mode: edit existing shapes
    if (this.locked) return;
    if (this.selected) {
      const h = this._hitHandle(this.selected, x, y);
      if (h !== null) {
        e.stopPropagation(); e.preventDefault();
        this.drag = { mode: 'handle', shape: this.selected, handle: h, start: { x, y }, orig: this.selected.points.map((p) => ({ ...p })) };
        return;
      }
    }
    const hit = this._pick(x, y);
    if (hit) {
      e.stopPropagation(); e.preventDefault();
      this.select(hit.id);
      this.drag = { mode: 'move', shape: hit, start: { x, y }, orig: hit.points.map((p) => ({ ...p })) };
      return;
    }
    if (this.selected) { this.selected = null; this.onSelect(null); this.invalidate(); }
  }

  _placePoint(e) {
    const toolDef = TOOLS[this.tool];
    const pt = this._pointFromEvent(e, true);
    if (!this.pending || this.pending.type !== this.tool) {
      this.pending = { id: uid(), type: this.tool, points: [pt], style: { ...this.style } };
    } else {
      this.pending.points.push(pt);
    }
    if (toolDef.points > 0 && this.pending.points.length >= toolDef.points) {
      this._commitPending();
    }
    this.invalidate();
  }

  async _commitPending() {
    const shape = this.pending;
    this.pending = null;
    if (!shape) return;
    if (shape.type === 'text') {
      const txt = await this.onRequestText();
      if (txt === null || txt === undefined) { this.invalidate(); return; }
      shape.text = txt;
      if (!txt.trim()) { this.invalidate(); return; }
    }
    this.drawings.push(shape);
    this.selected = shape;
    this.onSelect(shape);
    this.onChange();
    if (this.tool !== 'measure') {
      // keep the tool armed for rapid-fire drawing, TradingView style
    }
    this.invalidate();
  }

  mousemove(e) {
    if (this.pending && !this.pending.tmp) {
      const pt = this._pointFromEvent(e, true);
      if (this.pending.type === 'brush') {
        const last = this.pending.points[this.pending.points.length - 1];
        if (!last || Math.abs((last.logical ?? 0) - (pt.logical ?? 0)) > 0 || last.price !== pt.price) this.pending.points.push(pt);
      } else if (this.pending.points.length === TOOLS[this.pending.type].points) {
        this.pending.points[this.pending.points.length - 1] = pt;
      } else {
        this.pending.cursor = pt;
      }
      this.invalidate();
      return;
    }

    if (this.drag) {
      e.stopPropagation();
      const r = this._rect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (this.drag.mode === 'create') {
        const pt = this._pointFromEvent(e, false);
        this.pending.points[1] = pt;
        this.invalidate();
        return;
      }
      if (this.drag.mode === 'handle') {
        const pt = this._pointFromEvent(e, true);
        const cur = this.drag.shape.points[this.drag.handle];
        Object.assign(cur, pt);
        this.invalidate();
        return;
      }
      if (this.drag.mode === 'move') {
        const ts = this.chart.timeScale();
        const dLogical = ts.coordinateToLogical(x) - ts.coordinateToLogical(this.drag.start.x);
        const p0 = this.series.coordinateToPrice(this.drag.start.y);
        const p1 = this.series.coordinateToPrice(y);
        const dPrice = (p1 ?? 0) - (p0 ?? 0);
        const bars = this.getBars();
        const shape = this.drag.shape;
        shape.points = this.drag.orig.map((p) => {
          const q = { ...p, price: p.price + dPrice };
          const idxOf = () => {
            if (p.future !== undefined) return bars.length - 1 + p.future;
            const i = this._indexByTime().get(p.time);
            return i !== undefined ? i : p.logical;
          };
          const base = idxOf();
          if (base === undefined) return q;
          const nl = base + dLogical;
          const lastIdx = bars.length - 1;
          if (nl > lastIdx) { delete q.time; delete q.logical; q.future = Math.round(nl - lastIdx); }
          else {
            const idx = clamp(Math.round(nl), 0, Math.max(0, lastIdx));
            q.time = bars[idx].time; q.logical = idx; delete q.future;
          }
          return q;
        });
        this.invalidate();
        return;
      }
    }

    // Brush dragging straight from the tool
    if (this.tool === 'brush' && this.pending && e.buttons === 1) return;
    this.invalidate();
  }

  mouseup(e) {
    if (this.tool === 'measure' && this.pending && this.pending.type === 'measure') {
      const m = this.pending;
      this.pending = null;
      this.drag = null;
      // keep the measurement on screen for a moment
      this._measureGhost = m;
      setTimeout(() => { this._measureGhost = null; this.invalidate(); }, 2600);
      this.invalidate();
      return;
    }
    if (this.pending && this.pending.type === 'brush' && this.pending.points.length > 1) {
      this._commitPending();
      this.invalidate();
      return;
    }
    if (this.drag) {
      const moved = this.drag.mode !== 'create';
      this.drag = null;
      if (moved) this.onChange();
      this.invalidate();
    }
  }

  dblclick(e) {
    if (this.locked) return;
    const r = this._rect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const hit = this._pick(x, y);
    if (hit && hit.type === 'text') {
      e.stopPropagation(); e.preventDefault();
      this.onRequestText(hit.text).then((txt) => {
        if (txt !== null && txt !== undefined) { hit.text = txt; this.onChange(); this.invalidate(); }
      });
    }
  }

  contextmenu(e) {
    if (this.locked) return;
    const r = this._rect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const hit = this._pick(x, y);
    if (hit) {
      e.stopPropagation(); e.preventDefault();
      this.select(hit.id);
      this.onContextMenu?.(hit, e.clientX, e.clientY);
    }
  }

  hoverCheck(e) {
    if (this.tool !== 'cursor' || this.locked) return;
    const r = this._rect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (this.selected) {
      const h = this._hitHandle(this.selected, x, y);
      if (h !== null) { this.container.style.cursor = 'nwse-resize'; return; }
    }
    const hit = this._pick(x, y);
    this.container.style.cursor = hit ? 'move' : '';
  }

  /* -------------------------------- drawing ------------------------------- */
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.container.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.dpr = dpr;
    this.width = rect.width;
    this.height = rect.height;
    this.invalidate();
  }

  draw() {
    if (!this.ctx) return;
    if (!this.width || Math.abs(this.container.getBoundingClientRect().width - this.width) > 1) this.resize();
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    if (this.hidden) return;

    const all = [...this.drawings];
    if (this.pending) all.push(this.pending);
    if (this._measureGhost) all.push(this._measureGhost);

    for (const d of all) {
      const isPreview = d === this.pending || d === this._measureGhost;
      this._drawShape(ctx, d, isPreview);
      if (!isPreview && d === this.selected) this._drawSelection(ctx, d);
    }
  }

  _drawShape(ctx, d, preview) {
    const { pts, complete } = this._shapeScreen(d);
    if (!pts.length) return;
    const st = d.style || this.style;
    const trace = preview ? 0.75 : 1;
    const selected = d === this.selected;
    ctx.save();
    ctx.globalAlpha = trace;
    ctx.strokeStyle = st.color || '#4c8dff';
    ctx.fillStyle = st.color || '#4c8dff';
    ctx.lineWidth = st.width || 2;
    ctx.setLineDash(st.dash ? [st.dash, st.dash] : []);

    const pt = (i) => {
      if (i < pts.length) return pts[i];
      if (d.cursor) return this._toPx(d.cursor);
      return null;
    };
    const p0 = pt(0), p1 = pt(1);

    switch (d.type) {
      case 'trendline':
        if (p0 && p1) { line(ctx, p0, p1); arrowHandles(ctx, p0, p1, selected); }
        break;
      case 'ray':
        if (p0 && p1) {
          const far = extend(p0, p1, 10000);
          line(ctx, p0, far);
          if (selected) dots(ctx, [p0, p1]);
        }
        break;
      case 'hline':
        if (p0) {
          line(ctx, { x: 0, y: p0.y }, { x: this.width, y: p0.y });
          label(ctx, p0.y, fmtPrice(d.points[0].price, this.getDigits()), st.color, this.width);
        }
        break;
      case 'hray':
        if (p0) {
          line(ctx, p0, { x: this.width, y: p0.y });
          label(ctx, p0.y, fmtPrice(d.points[0].price, this.getDigits()), st.color, this.width);
        }
        break;
      case 'vline':
        if (p0) line(ctx, { x: p0.x, y: 0 }, { x: p0.x, y: this.height });
        break;
      case 'rect':
        if (p0 && p1) {
          ctx.globalAlpha = trace * (st.fill ?? 0.12);
          ctx.fillRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
          ctx.globalAlpha = trace;
          ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
          if (selected) dots(ctx, [p0, p1, { x: p0.x, y: p1.y }, { x: p1.x, y: p0.y }]);
        }
        break;
      case 'ellipse':
        if (p0 && p1) {
          ctx.beginPath();
          const cx = (p0.x + p1.x) / 2, cy = (p0.y + p1.y) / 2;
          const rx = Math.abs(p1.x - p0.x) / 2, ry = Math.abs(p1.y - p0.y) / 2;
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.globalAlpha = trace * (st.fill ?? 0.1);
          ctx.fill();
          ctx.globalAlpha = trace;
          ctx.stroke();
          if (selected) dots(ctx, [p0, p1]);
        }
        break;
      case 'fib':
        if (p0 && p1) this._drawFib(ctx, d, p0, p1, preview);
        break;
      case 'arrow':
        if (p0 && p1) arrow(ctx, p0, p1);
        break;
      case 'text':
        if (p0) {
          ctx.font = '600 12px Inter, system-ui, sans-serif';
          const txt = d.text || 'Text';
          const w = ctx.measureText(txt).width + 12;
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = '#1b2430';
          roundRect(ctx, p0.x - 2, p0.y - 14, w, 20, 4);
          ctx.fill();
          ctx.globalAlpha = trace;
          ctx.strokeStyle = st.color;
          ctx.stroke();
          ctx.fillStyle = '#e6edf5';
          ctx.textBaseline = 'middle';
          ctx.fillText(txt, p0.x + 4, p0.y - 3);
        }
        break;
      case 'brush':
        if (pts.length > 1) {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
        }
        break;
      case 'measure':
        if (p0 && p1) this._drawMeasure(ctx, d, p0, p1);
        break;
      default:
        if (p0 && p1) line(ctx, p0, p1);
    }
    ctx.restore();
  }

  _drawFib(ctx, d, p0, p1, preview) {
    const st = d.style || this.style;
    const x1 = Math.min(p0.x, p1.x), x2 = Math.max(p0.x, p1.x);
    const left = Math.min(x1, x2);
    for (const f of FIB) {
      const y = p0.y + (p1.y - p0.y) * f.r;
      if (y < -40 || y > this.height + 40) continue;
      ctx.save();
      ctx.strokeStyle = f.c;
      ctx.globalAlpha = preview ? 0.55 : f.strong ? 0.9 : 0.7;
      ctx.lineWidth = f.strong ? 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(Math.max(x2, left + 1), y);
      ctx.stroke();
      // shaded band
      ctx.globalAlpha = preview ? 0.04 : 0.05;
      ctx.fillStyle = f.c;
      const next = FIB[FIB.indexOf(f) + 1];
      if (next) {
        const y2 = p0.y + (p1.y - p0.y) * next.r;
        ctx.fillRect(left, Math.min(y, y2), Math.max(x2, left + 1) - left, Math.abs(y2 - y));
      }
      // label
      const price = d.points[0].price + (d.points[1].price - d.points[0].price) * f.r;
      ctx.globalAlpha = 1;
      ctx.font = '500 10px Inter, system-ui, sans-serif';
      const text = `${(f.r * 100).toFixed(1)}%  ${fmtPrice(price, this.getDigits())}`;
      const w = ctx.measureText(text).width + 8;
      ctx.fillStyle = hexA(f.c, 0.16);
      roundRect(ctx, left + 2, y - 8, w, 15, 3);
      ctx.fill();
      ctx.fillStyle = f.c;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, left + 6, y);
      ctx.restore();
    }
    if (!preview) {
      ctx.save();
      ctx.strokeStyle = hexA(st.color, 0.35);
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawMeasure(ctx, d, p0, p1) {
    const dPrice = d.points[1].price - d.points[0].price;
    const pct = d.points[0].price ? (dPrice / d.points[0].price) * 100 : 0;
    const bars = this.getBars();
    const idx = (pt) => (pt.time !== undefined ? this._indexByTime().get(pt.time) : undefined);
    let nBars = 0;
    const a = idx(d.points[0]), b = idx(d.points[1]);
    if (a !== undefined && b !== undefined) nBars = b - a;
    else if (d.points[0].future !== undefined || d.points[1].future !== undefined) {
      const fa = d.points[0].future ?? 0, fb = d.points[1].future ?? 0;
      nBars = (d.points[1].future !== undefined ? bars.length - 1 + fb : bars.length - 1) - (d.points[0].future !== undefined ? bars.length - 1 + fa : bars.length - 1);
    }
    const up = dPrice >= 0;
    const col = up ? '#26a69a' : '#ef5350';
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = col;
    ctx.fillRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p0.y);
    ctx.stroke();
    ctx.setLineDash([]);

    const lines = [
      `${fmtSigned(dPrice, this.getDigits())}  (${fmtPct(pct)})`,
      `${nBars} bars`,
    ];
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16;
    const bx = p1.x + (p1.x > p0.x ? 8 : -w - 8);
    const by = p1.y + (up ? -46 : 8);
    ctx.fillStyle = hexA(col, 0.92);
    roundRect(ctx, bx, by, w, 40, 5);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(lines[0], bx + 8, by + 13);
    ctx.font = '500 10px Inter, system-ui, sans-serif';
    ctx.fillText(lines[1], bx + 8, by + 29);
    ctx.restore();
  }

  _drawSelection(ctx, d) {
    const { pts } = this._shapeScreen(d);
    if (!pts.length) return;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = d.style?.color || '#4c8dff';
    ctx.lineWidth = 1.5;
    const handles = d.type === 'rect' || d.type === 'ellipse'
      ? [pts[0], pts[1], { x: pts[0].x, y: pts[1].y }, { x: pts[1].x, y: pts[0].y }]
      : pts;
    for (const h of handles) {
      ctx.beginPath();
      ctx.arc(h.x, h.y, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}

/* ------------------------------- primitives ------------------------------- */
function line(ctx, a, b) {
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
}
function dots(ctx, arr) {
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = ctx.strokeStyle || '#4c8dff';
  for (const p of arr) { ctx.beginPath(); ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  ctx.restore();
}
function arrowHandles() {}
function extend(a, b, len) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: a.x + (dx / d) * len, y: a.y + (dy / d) * len };
}
function arrow(ctx, a, b) {
  line(ctx, a, b);
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const size = 9;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - size * Math.cos(ang - 0.4), b.y - size * Math.sin(ang - 0.4));
  ctx.lineTo(b.x - size * Math.cos(ang + 0.4), b.y - size * Math.sin(ang + 0.4));
  ctx.closePath();
  ctx.fill();
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function label(ctx, y, text, color, width) {
  if (y < 8 || y > ctx.canvas.height) return;
  ctx.save();
  ctx.font = '500 10px Inter, system-ui, sans-serif';
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = hexA(color || '#4c8dff', 0.9);
  roundRect(ctx, width - w - 6, y - 8, w, 16, 3);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width - w - 1, y);
  ctx.restore();
}
