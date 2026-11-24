# ChartDesk

A free charting workstation that runs entirely in your browser. Candles, indicators, drawing tools, bar replay and alerts for crypto, forex, metals, indices and US stocks. No account, no subscription, no server.

**Live app:** https://uvies-philip.github.io/chartdesk/

![ChartDesk](docs/screenshot.png)

## What it does

**Charts**
- Candlesticks, Heikin Ashi, bars, line and area
- Nine timeframes from 1 minute to 1 month
- Logarithmic and percent price scales, auto scale, volume overlay
- Crosshair OHLC readout, live last price, drag to pan, wheel to zoom

**27 indicators**, all computed in the browser
- Overlays: SMA, EMA, WMA, HMA, VWAP (session or rolling), Bollinger Bands, Keltner Channels, Donchian Channels, Supertrend, Parabolic SAR, Ichimoku Cloud, Envelope, classic Pivot Points
- Panes: Volume, RSI, MACD, Stochastic, Stoch RSI, ATR, ADX/DMI, CCI, Williams %R, Momentum, ROC, OBV, MFI, Chaikin Money Flow, Awesome Oscillator
- Every indicator has editable parameters and colour, and can be hidden without deleting it

**Drawing tools**
- Trend line, ray, horizontal line, horizontal ray, vertical line
- Rectangle, ellipse, arrow, text notes, freehand brush
- Fibonacci retracement with price labels and shaded bands
- Measure tool: shows price delta, percent and bar count
- Magnet snapping to candle open, high, low, close
- Select, move, resize, restyle, duplicate, lock, hide, delete, per symbol persistence

**Workflow**
- Bar replay with step, play and speed control
- Price alerts with desktop notifications while the tab is open
- Symbol comparison on a percentage scale
- Watchlist with live crypto quotes
- Named layouts saved locally
- Screenshot export including your drawings
- Command palette style symbol search (Ctrl K)
- Dark and light themes

## Data sources

No API key. No account. Nothing to sign up for.

| Market | Quotes and last price | Candle history |
| --- | --- | --- |
| Crypto | TradingView `BINANCE:*`, plus a Binance trade websocket for tick by tick updates | Binance public REST |
| Forex | TradingView `FX_IDC:*` (interbank composite, streaming) | Yahoo Finance via the `r.jina.ai` relay |
| Gold and silver | TradingView `OANDA:XAUUSD` and `OANDA:XAGUSD`, i.e. real spot | COMEX front month via the relay, shifted onto spot |
| Indices | TradingView `NASDAQ:NDX`, `DJ:DJI`, `SP:SPX`, `XETR:DAX`, `FTSE:UKX`, `TSE:NI225` | Yahoo via the relay |
| US stocks | TradingView `NASDAQ:*` | Yahoo via the relay |

The point of the split: `scanner.tradingview.com` is a public endpoint with an
open CORS policy, so the browser can read the exact quote TradingView shows in
its own app. That is what the price label, the watchlist and the daily change
come from. It costs nothing and needs no key.

Candle history is heavier, so it comes from free feeds. Two of those feeds lag
Yahoo's intraday data by 1 to 15 minutes, and the COMEX gold contract trades at
a small premium to spot. Both are corrected at load: the series is shifted onto
the live TradingView quote so the last candle and the price agree with what you
see on TradingView. History can therefore differ from spot by a few dollars on
gold at the far left of the chart, while the live edge is exact.

Two consequences, stated plainly:

- The relay allows roughly 20 requests a minute per IP. The app spaces its calls
  out, caches every series and cools down for 45 seconds on a 429. Only the
  symbol on screen is polled every 5 seconds; the watchlist refreshes every 30.
- Candle history is delayed. Do not use it for execution timing, in either app.

If you want lower latency history on FX you can add a free Twelve Data key in
Settings. It is optional, and the app falls back to the free feeds if that route
fails.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Ctrl K` | Symbol search |
| `Ctrl I` | Indicator picker |
| `Ctrl J` | Toggle theme |
| `Ctrl Shift S` | Screenshot |
| `Alt A` | Create alert |
| `1` to `9` | Switch timeframe |
| `Del` | Delete the selected drawing |
| `Esc` | Cancel tool or close dialog |

## Run it locally

No build step, no dependencies to install.

```bash
git clone https://github.com/uvies-philip/chartdesk.git
cd chartdesk
python -m http.server 8123
# open http://127.0.0.1:8123
```

ES modules need a real HTTP server, so opening `index.html` from the file system will not work.

## Deploy your own copy

The app is static, so any static host works. For GitHub Pages:

```bash
gh repo create chartdesk --public --source=. --push
gh api -X POST repos/:owner/chartdesk/pages -f source[branch]=main -f source[path]=/
```

## How it is built

```
index.html          shell and layout
css/app.css         theme system (CSS variables) and components
js/app.js           state, data flow, panels, modals, shortcuts
js/chartview.js     chart engine wrapper, panes, indicators, replay
js/indicators.js    indicator maths, pure functions over bar arrays
js/drawings.js      canvas drawing layer, hit testing, persistence
js/providers.js     data adapters (Binance, Yahoo via relay, optional Twelve Data)
js/logos.js         currency flags, coin tiles, metal and index marks, sparklines
js/ui.js            toasts, modals, menus
vendor/             TradingView Lightweight Charts 5.3.0 (Apache 2.0)
dev/selftest.js     smoke test, loaded only with ?selftest=1
```

State lives in localStorage under `chartdesk.*`. There is no backend, so clearing site data removes your layouts and drawings.

Charts are rendered by [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts), the open source library TradingView publishes under Apache 2.0. ChartDesk adds the indicator engine, drawing layer, panels, replay and data adapters on top.

## Honest limits

- This is not TradingView. There is no social feed, no broker integration, no server side alerts, no second based intervals and no tick data.
- Forex, metals and index history is delayed and rate limited by the free relay. Crypto is live.
- Indicators are computed client side from OHLCV bars. They match the standard formulas, but they can differ slightly from another platform's output if that platform smooths or seeds differently.
- Alerts only fire while the tab is open. Install the page as an app and keep it open if you rely on them.
- Gold and silver are COMEX futures proxies, not spot, so they sit a few dollars away from a broker's XAUUSD quote.
- The relay is a third party. If it changes its terms the free feed breaks, which is why the Twelve Data switch exists as a fallback.

## Licence

MIT for ChartDesk. Lightweight Charts is Apache 2.0, copyright TradingView, Inc. See `LICENSE`.
