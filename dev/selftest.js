// Automated smoke test. Open index.html?selftest=1 to run it; results land in #errlog.
// Not loaded in normal use.

export async function run(api) {
  const out = [];
  const log = (k, v) => out.push(`${k}=${v}`);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const shell = document.getElementById('chartShell');
  const rect = () => shell.getBoundingClientRect();

  const mouse = (type, x, y) => {
    const r = rect();
    const ev = new MouseEvent(type, { clientX: r.left + x, clientY: r.top + y, bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1 });
    (type === 'mousedown' ? shell : window).dispatchEvent(ev);
  };

  try {
    // ---------- indicators ----------
    const { INDICATOR_DEFS } = await import('../js/indicators.js');
    const fails = [];
    let added = 0;
    for (const d of INDICATOR_DEFS) {
      try { api.addIndicator(d.id); added += 1; } catch (e) { fails.push(`${d.id}:${e.message}`); }
    }
    await wait(80);
    log('indicators', `${added}/${INDICATOR_DEFS.length}`);
    log('indicator_failures', fails.join(' ; ') || 'none');
    log('panes', api.chartView().chart.panes().length);

    api.state.indicators.length = 0;
    api.chartView().setIndicators([]);
    await wait(60);
    log('panes_after_clear', api.chartView().chart.panes().length);

    // ---------- drawing tools ----------
    const dl = api.drawLayer();
    api.setTool('trendline');
    mouse('mousedown', 300, 120);
    mouse('mousemove', 420, 200);
    mouse('mousedown', 420, 200);
    await wait(40);
    log('trendline_placed', dl.drawings.length);
    log('trendline_selected', !!dl.selected);

    api.setTool('fib');
    mouse('mousedown', 500, 140);
    mouse('mousedown', 640, 260);
    await wait(30);
    log('fib_placed', dl.drawings.length);

    api.setTool('hline');
    mouse('mousedown', 700, 300);
    await wait(30);
    log('hline_placed', dl.drawings.length);

    api.setTool('cursor');
    dl.select(dl.drawings[0].id);
    dl.deleteSelected();
    await wait(20);
    log('after_delete', dl.drawings.length);
    dl.clear();
    log('after_clear', dl.drawings.length);

    // ---------- replay ----------
    const cv = api.chartView();
    const total = api.state.bars.length;
    cv.startReplay(Math.floor(total * 0.7));
    const before = cv.replay.index;
    cv.stepReplay(5);
    log('replay_step', `${before}->${cv.replay.index}`);
    log('replay_visible_bars', cv._visibleBars().length);
    cv.exitReplay();
    log('replay_exited', cv.replay.active === false);

    // ---------- chart types ----------
    for (const t of ['ha', 'bar', 'line', 'area', 'candles']) {
      cv.setChartType(t);
    }
    log('chart_type_cycle', 'ok');

    // ---------- modals ----------
    const modalCount = () => document.querySelectorAll('.modal').length;
    const closeModal = () => {
      const x = document.querySelector('.modal .modal-x');
      if (x) x.click();
    };
    const results = [];
    for (const [name, fn] of [
      ['indicators', api.actions.indicators],
      ['search', api.actions.search],
      ['settings', api.actions.settings],
      ['alert', api.actions.alert],
      ['compare', api.actions.compare],
      ['replay', api.actions.replay],
      ['shortcuts', api.actions.shortcuts],
    ]) {
      try {
        fn();
        await wait(60);
        results.push(`${name}:${modalCount()}`);
        closeModal();
        await wait(40);
      } catch (e) { results.push(`${name}:ERR ${e.message}`); }
    }
    log('modals', results.join(','));

    // ---------- alerts ----------
    api.state.bars.length && api.actions.alert();
    await wait(60);
    const priceInput = document.querySelectorAll('.modal .input')[0];
    const createBtn = Array.from(document.querySelectorAll('.modal .btn.primary')).pop();
    if (priceInput && createBtn) {
      priceInput.value = '1';
      createBtn.click();
      await wait(80);
    }
    log('alert_rows', document.querySelectorAll('.al-item').length);

    // ---------- theme ----------
    document.querySelector('[data-act="theme"]').click();
    log('theme_light', document.documentElement.dataset.theme);
    document.querySelector('[data-act="theme"]').click();
    log('theme_dark', document.documentElement.dataset.theme);

    // ---------- screenshot ----------
    const shot = cv.screenshot();
    log('screenshot', `${shot.width}x${shot.height}`);

    // ---------- watchlist ----------
    log('watchlist_rows', document.querySelectorAll('.wl-row').length);

    // ---------- reload with indicator set ----------
    log('legend_rows', document.querySelectorAll('.lg-ind-row').length);
  } catch (e) {
    log('FATAL', `${e.message} @ ${(e.stack || '').split('\n')[1] || ''}`);
  }

  const log2 = document.getElementById('errlog');
  log2.hidden = false;
  log2.dataset.selftest = out.join(' | ');
  log2.textContent = 'SELFTEST ' + out.join(' | ');
  document.title = 'SELFTEST DONE';
}
