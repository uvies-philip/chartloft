// Instrument registry and timeframe table.
// provider 'binance' = live public REST, 'yahoo' = free feed through the relay.

export const TIMEFRAMES = [
  { id: '1m', label: '1m', binance: '1m', td: '1min', secs: 60 },
  { id: '5m', label: '5m', binance: '5m', td: '5min', secs: 300 },
  { id: '15m', label: '15m', binance: '15m', td: '15min', secs: 900 },
  { id: '30m', label: '30m', binance: '30m', td: '30min', secs: 1800 },
  { id: '1h', label: '1H', binance: '1h', td: '1h', secs: 3600 },
  { id: '4h', label: '4H', binance: '4h', td: '4h', secs: 14400 },
  { id: '1d', label: '1D', binance: '1d', td: '1day', secs: 86400 },
  { id: '1w', label: '1W', binance: '1w', td: '1week', secs: 604800 },
  { id: '1M', label: '1M', binance: '1M', td: '1month', secs: 2592000 },
];

export const tf = (id) => TIMEFRAMES.find((t) => t.id === id) || TIMEFRAMES[2];

// y = Yahoo Finance ticker used by the free feed.
export const SYMBOLS = [
  // ---------------- crypto, live from Binance ----------------
  { sym: 'BTCUSDT', name: 'Bitcoin / TetherUS', cls: 'crypto', provider: 'binance', psym: 'BTCUSDT', digits: 2, exch: 'BINANCE' },
  { sym: 'ETHUSDT', name: 'Ethereum / TetherUS', cls: 'crypto', provider: 'binance', psym: 'ETHUSDT', digits: 2, exch: 'BINANCE' },
  { sym: 'SOLUSDT', name: 'Solana / TetherUS', cls: 'crypto', provider: 'binance', psym: 'SOLUSDT', digits: 3, exch: 'BINANCE' },
  { sym: 'BNBUSDT', name: 'BNB / TetherUS', cls: 'crypto', provider: 'binance', psym: 'BNBUSDT', digits: 2, exch: 'BINANCE' },
  { sym: 'XRPUSDT', name: 'XRP / TetherUS', cls: 'crypto', provider: 'binance', psym: 'XRPUSDT', digits: 4, exch: 'BINANCE' },
  { sym: 'ADAUSDT', name: 'Cardano / TetherUS', cls: 'crypto', provider: 'binance', psym: 'ADAUSDT', digits: 4, exch: 'BINANCE' },
  { sym: 'DOGEUSDT', name: 'Dogecoin / TetherUS', cls: 'crypto', provider: 'binance', psym: 'DOGEUSDT', digits: 5, exch: 'BINANCE' },
  { sym: 'AVAXUSDT', name: 'Avalanche / TetherUS', cls: 'crypto', provider: 'binance', psym: 'AVAXUSDT', digits: 3, exch: 'BINANCE' },
  { sym: 'LINKUSDT', name: 'Chainlink / TetherUS', cls: 'crypto', provider: 'binance', psym: 'LINKUSDT', digits: 3, exch: 'BINANCE' },
  { sym: 'LTCUSDT', name: 'Litecoin / TetherUS', cls: 'crypto', provider: 'binance', psym: 'LTCUSDT', digits: 2, exch: 'BINANCE' },
  { sym: 'DOTUSDT', name: 'Polkadot / TetherUS', cls: 'crypto', provider: 'binance', psym: 'DOTUSDT', digits: 3, exch: 'BINANCE' },
  { sym: 'SUIUSDT', name: 'Sui / TetherUS', cls: 'crypto', provider: 'binance', psym: 'SUIUSDT', digits: 4, exch: 'BINANCE' },

  // ---------------- forex ----------------
  { sym: 'EURUSD', name: 'Euro / US Dollar', cls: 'forex', provider: 'yahoo', y: 'EURUSD=X', td: 'EUR/USD', digits: 5, exch: 'FX' },
  { sym: 'GBPUSD', name: 'British Pound / US Dollar', cls: 'forex', provider: 'yahoo', y: 'GBPUSD=X', td: 'GBP/USD', digits: 5, exch: 'FX' },
  { sym: 'USDJPY', name: 'US Dollar / Japanese Yen', cls: 'forex', provider: 'yahoo', y: 'USDJPY=X', td: 'USD/JPY', digits: 3, exch: 'FX' },
  { sym: 'AUDUSD', name: 'Australian Dollar / US Dollar', cls: 'forex', provider: 'yahoo', y: 'AUDUSD=X', td: 'AUD/USD', digits: 5, exch: 'FX' },
  { sym: 'USDCAD', name: 'US Dollar / Canadian Dollar', cls: 'forex', provider: 'yahoo', y: 'USDCAD=X', td: 'USD/CAD', digits: 5, exch: 'FX' },
  { sym: 'USDCHF', name: 'US Dollar / Swiss Franc', cls: 'forex', provider: 'yahoo', y: 'USDCHF=X', td: 'USD/CHF', digits: 5, exch: 'FX' },
  { sym: 'NZDUSD', name: 'New Zealand Dollar / US Dollar', cls: 'forex', provider: 'yahoo', y: 'NZDUSD=X', td: 'NZD/USD', digits: 5, exch: 'FX' },
  { sym: 'EURJPY', name: 'Euro / Japanese Yen', cls: 'forex', provider: 'yahoo', y: 'EURJPY=X', td: 'EUR/JPY', digits: 3, exch: 'FX' },
  { sym: 'GBPJPY', name: 'British Pound / Japanese Yen', cls: 'forex', provider: 'yahoo', y: 'GBPJPY=X', td: 'GBP/JPY', digits: 3, exch: 'FX' },
  { sym: 'EURGBP', name: 'Euro / British Pound', cls: 'forex', provider: 'yahoo', y: 'EURGBP=X', td: 'EUR/GBP', digits: 5, exch: 'FX' },
  { sym: 'AUDJPY', name: 'Australian Dollar / Japanese Yen', cls: 'forex', provider: 'yahoo', y: 'AUDJPY=X', td: 'AUD/JPY', digits: 3, exch: 'FX' },
  { sym: 'EURAUD', name: 'Euro / Australian Dollar', cls: 'forex', provider: 'yahoo', y: 'EURAUD=X', td: 'EUR/AUD', digits: 5, exch: 'FX' },
  { sym: 'GBPCHF', name: 'British Pound / Swiss Franc', cls: 'forex', provider: 'yahoo', y: 'GBPCHF=X', td: 'GBP/CHF', digits: 5, exch: 'FX' },
  { sym: 'USDMXN', name: 'US Dollar / Mexican Peso', cls: 'forex', provider: 'yahoo', y: 'USDMXN=X', td: 'USD/MXN', digits: 4, exch: 'FX' },
  { sym: 'USDZAR', name: 'US Dollar / South African Rand', cls: 'forex', provider: 'yahoo', y: 'USDZAR=X', td: 'USD/ZAR', digits: 4, exch: 'FX' },
  { sym: 'USDNGN', name: 'US Dollar / Nigerian Naira', cls: 'forex', provider: 'yahoo', y: 'USDNGN=X', td: 'USD/NGN', digits: 2, exch: 'FX' },

  // ---------------- metals ----------------
  // Quotes come from TradingView (OANDA spot). History is the COMEX front month
  // shifted onto the spot price so the series and the live quote agree.
  { sym: 'XAUUSD', name: 'Gold / US Dollar', cls: 'metal', provider: 'yahoo', y: 'GC=F', td: 'XAU/USD', digits: 2, exch: 'OANDA', tv: 'OANDA:XAUUSD', note: 'Spot XAU/USD, spot aligned' },
  { sym: 'XAGUSD', name: 'Silver / US Dollar', cls: 'metal', provider: 'yahoo', y: 'SI=F', td: 'XAG/USD', digits: 3, exch: 'OANDA', tv: 'OANDA:XAGUSD', note: 'Spot XAG/USD, spot aligned' },

  // ---------------- indices ----------------
  { sym: 'US30', name: 'Dow Jones 30', cls: 'index', provider: 'yahoo', y: '^DJI', td: 'DJI', digits: 1, exch: 'DJ', tv: 'DJ:DJI' },
  { sym: 'NAS100', name: 'Nasdaq 100', cls: 'index', provider: 'yahoo', y: '^NDX', td: 'NDX', digits: 1, exch: 'NASDAQ', tv: 'NASDAQ:NDX' },
  { sym: 'SPX500', name: 'S&P 500', cls: 'index', provider: 'yahoo', y: '^GSPC', td: 'SPX', digits: 1, exch: 'SP', tv: 'SP:SPX' },
  { sym: 'GER40', name: 'DAX 40', cls: 'index', provider: 'yahoo', y: '^GDAXI', td: 'DAX', digits: 1, exch: 'XETRA', tv: 'XETR:DAX' },
  { sym: 'UK100', name: 'FTSE 100', cls: 'index', provider: 'yahoo', y: '^FTSE', td: 'FTSE', digits: 1, exch: 'LSE', tv: 'FTSE:UKX' },
  { sym: 'JP225', name: 'Nikkei 225', cls: 'index', provider: 'yahoo', y: '^N225', td: 'N225', digits: 1, exch: 'TSE', tv: 'TSE:NI225' },

  // ---------------- equities ----------------
  { sym: 'AAPL', name: 'Apple Inc', cls: 'stock', provider: 'yahoo', y: 'AAPL', td: 'AAPL', digits: 2, exch: 'NASDAQ' },
  { sym: 'TSLA', name: 'Tesla Inc', cls: 'stock', provider: 'yahoo', y: 'TSLA', td: 'TSLA', digits: 2, exch: 'NASDAQ' },
  { sym: 'NVDA', name: 'NVIDIA Corp', cls: 'stock', provider: 'yahoo', y: 'NVDA', td: 'NVDA', digits: 2, exch: 'NASDAQ' },
  { sym: 'MSFT', name: 'Microsoft Corp', cls: 'stock', provider: 'yahoo', y: 'MSFT', td: 'MSFT', digits: 2, exch: 'NASDAQ' },
  { sym: 'AMZN', name: 'Amazon.com Inc', cls: 'stock', provider: 'yahoo', y: 'AMZN', td: 'AMZN', digits: 2, exch: 'NASDAQ' },
  { sym: 'META', name: 'Meta Platforms Inc', cls: 'stock', provider: 'yahoo', y: 'META', td: 'META', digits: 2, exch: 'NASDAQ' },
  { sym: 'GOOGL', name: 'Alphabet Inc Class A', cls: 'stock', provider: 'yahoo', y: 'GOOGL', td: 'GOOGL', digits: 2, exch: 'NASDAQ' },
];

// TradingView identifiers used for the live quote. History still comes from
// Yahoo or Binance, so the two are aligned on load.
const TV_INDEX = { US30: 'DJ:DJI', NAS100: 'NASDAQ:NDX', SPX500: 'SP:SPX', GER40: 'XETR:DAX', UK100: 'FTSE:UKX', JP225: 'TSE:NI225' };

export function tvId(s) {
  if (!s) return null;
  if (s.tv) return s.tv;
  if (s.provider === 'binance') return `BINANCE:${s.psym || s.sym}`;
  if (s.cls === 'forex') return `FX_IDC:${s.sym}`;
  if (s.cls === 'metal') return `OANDA:${s.sym}`;
  if (s.cls === 'index') return TV_INDEX[s.sym] || null;
  if (s.cls === 'stock') return `${s.exch && s.exch !== '?' ? s.exch : 'NASDAQ'}:${s.sym}`;
  return null;
}

export function findSymbol(sym) {
  if (!sym) return null;
  const s = String(sym).toUpperCase().replace(/[^A-Z0-9/.]/g, '');
  const hit = SYMBOLS.find((x) => x.sym === s);
  if (hit) return hit;

  // Any other currency pair resolves through Yahoo, no key required.
  if (s.includes('/')) {
    const [a, b] = s.split('/');
    if (a && b) {
      return {
        sym: `${a}${b}`, name: `${a} / ${b}`, cls: 'forex', provider: 'yahoo',
        y: `${a}${b}=X`, td: `${a}/${b}`, digits: /JPY/.test(b) ? 3 : 5, exch: 'FX', custom: true,
      };
    }
  }
  const m = s.match(/^([A-Z]{3})([A-Z]{3})$/);
  if (m) {
    return {
      sym: s, name: `${m[1]} / ${m[2]}`, cls: 'forex', provider: 'yahoo',
      y: `${m[1]}${m[2]}=X`, td: `${m[1]}/${m[2]}`, digits: m[2] === 'JPY' ? 3 : 5, exch: 'FX', custom: true,
    };
  }
  return { sym: s, name: s, cls: 'stock', provider: 'yahoo', y: s, td: s, digits: 2, exch: '?', custom: true };
}

export function searchSymbols(q, limit = 14) {
  const query = q.trim().toUpperCase();
  if (!query) return SYMBOLS.slice(0, limit);
  const scored = [];
  for (const s of SYMBOLS) {
    const hay = `${s.sym} ${s.name} ${s.exch} ${s.cls}`.toUpperCase();
    let score = 0;
    if (s.sym === query) score = 100;
    else if (s.sym.startsWith(query)) score = 80;
    else if (s.sym.includes(query)) score = 60;
    else if (hay.includes(query)) score = 40;
    if (score) scored.push({ s, score });
  }
  scored.sort((a, b) => b.score - a.score || a.s.sym.localeCompare(b.s.sym));
  const out = scored.slice(0, limit).map((x) => x.s);
  if (out.length === 0 && query.length >= 3) {
    const custom = findSymbol(query);
    if (custom) out.push(custom);
  }
  return out;
}

export const CLASS_LABEL = {
  crypto: 'Crypto',
  forex: 'Forex',
  metal: 'Metals',
  index: 'Indices',
  stock: 'Stocks',
};
