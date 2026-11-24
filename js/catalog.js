// Instrument and interval registry.

export const TIMEFRAMES = [
  { id: '1m', label: '1m', binance: '1m', td: '1min', secs: 60, group: 'min' },
  { id: '5m', label: '5m', binance: '5m', td: '5min', secs: 300, group: 'min' },
  { id: '15m', label: '15m', binance: '15m', td: '15min', secs: 900, group: 'min' },
  { id: '30m', label: '30m', binance: '30m', td: '30min', secs: 1800, group: 'min' },
  { id: '1h', label: '1H', binance: '1h', td: '1h', secs: 3600, group: 'hour' },
  { id: '4h', label: '4H', binance: '4h', td: '4h', secs: 14400, group: 'hour' },
  { id: '1d', label: '1D', binance: '1d', td: '1day', secs: 86400, group: 'day' },
  { id: '1w', label: '1W', binance: '1w', td: '1week', secs: 604800, group: 'day' },
  { id: '1M', label: '1M', binance: '1M', td: '1month', secs: 2592000, group: 'month' },
];

export const tf = (id) => TIMEFRAMES.find((t) => t.id === id) || TIMEFRAMES[2];

// provider: 'binance' (no key needed) | 'td' (Twelve Data free key)
export const SYMBOLS = [
  // ---- crypto, Binance public data ----
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
  { sym: 'TRXUSDT', name: 'TRON / TetherUS', cls: 'crypto', provider: 'binance', psym: 'TRXUSDT', digits: 5, exch: 'BINANCE' },
  { sym: 'SUIUSDT', name: 'Sui / TetherUS', cls: 'crypto', provider: 'binance', psym: 'SUIUSDT', digits: 4, exch: 'BINANCE' },
  { sym: 'TONUSDT', name: 'Toncoin / TetherUS', cls: 'crypto', provider: 'binance', psym: 'TONUSDT', digits: 4, exch: 'BINANCE' },
  { sym: 'NEARUSDT', name: 'NEAR / TetherUS', cls: 'crypto', provider: 'binance', psym: 'NEARUSDT', digits: 3, exch: 'BINANCE' },
  { sym: 'APTUSDT', name: 'Aptos / TetherUS', cls: 'crypto', provider: 'binance', psym: 'APTUSDT', digits: 3, exch: 'BINANCE' },

  // ---- forex majors / crosses ----
  { sym: 'EURUSD', name: 'Euro / US Dollar', cls: 'forex', provider: 'td', psym: 'EUR/USD', digits: 5, exch: 'FX' },
  { sym: 'GBPUSD', name: 'British Pound / US Dollar', cls: 'forex', provider: 'td', psym: 'GBP/USD', digits: 5, exch: 'FX' },
  { sym: 'USDJPY', name: 'US Dollar / Japanese Yen', cls: 'forex', provider: 'td', psym: 'USD/JPY', digits: 3, exch: 'FX' },
  { sym: 'AUDUSD', name: 'Australian Dollar / US Dollar', cls: 'forex', provider: 'td', psym: 'AUD/USD', digits: 5, exch: 'FX' },
  { sym: 'USDCAD', name: 'US Dollar / Canadian Dollar', cls: 'forex', provider: 'td', psym: 'USD/CAD', digits: 5, exch: 'FX' },
  { sym: 'USDCHF', name: 'US Dollar / Swiss Franc', cls: 'forex', provider: 'td', psym: 'USD/CHF', digits: 5, exch: 'FX' },
  { sym: 'NZDUSD', name: 'New Zealand Dollar / US Dollar', cls: 'forex', provider: 'td', psym: 'NZD/USD', digits: 5, exch: 'FX' },
  { sym: 'EURJPY', name: 'Euro / Japanese Yen', cls: 'forex', provider: 'td', psym: 'EUR/JPY', digits: 3, exch: 'FX' },
  { sym: 'GBPJPY', name: 'British Pound / Japanese Yen', cls: 'forex', provider: 'td', psym: 'GBP/JPY', digits: 3, exch: 'FX' },
  { sym: 'EURGBP', name: 'Euro / British Pound', cls: 'forex', provider: 'td', psym: 'EUR/GBP', digits: 5, exch: 'FX' },
  { sym: 'AUDJPY', name: 'Australian Dollar / Japanese Yen', cls: 'forex', provider: 'td', psym: 'AUD/JPY', digits: 3, exch: 'FX' },
  { sym: 'EURAUD', name: 'Euro / Australian Dollar', cls: 'forex', provider: 'td', psym: 'EUR/AUD', digits: 5, exch: 'FX' },
  { sym: 'GBPCHF', name: 'British Pound / Swiss Franc', cls: 'forex', provider: 'td', psym: 'GBP/CHF', digits: 5, exch: 'FX' },
  { sym: 'USDMXN', name: 'US Dollar / Mexican Peso', cls: 'forex', provider: 'td', psym: 'USD/MXN', digits: 4, exch: 'FX' },
  { sym: 'USDZAR', name: 'US Dollar / South African Rand', cls: 'forex', provider: 'td', psym: 'USD/ZAR', digits: 4, exch: 'FX' },

  // ---- metals ----
  { sym: 'XAUUSD', name: 'Gold Spot / US Dollar', cls: 'metal', provider: 'td', psym: 'XAU/USD', digits: 2, exch: 'FX' },
  { sym: 'XAGUSD', name: 'Silver Spot / US Dollar', cls: 'metal', provider: 'td', psym: 'XAG/USD', digits: 3, exch: 'FX' },

  // ---- indices ----
  { sym: 'US30', name: 'Dow Jones Industrial Average', cls: 'index', provider: 'td', psym: 'DJI', digits: 1, exch: 'DJ' },
  { sym: 'NAS100', name: 'Nasdaq 100', cls: 'index', provider: 'td', psym: 'NDX', digits: 1, exch: 'NASDAQ' },
  { sym: 'SPX500', name: 'S&P 500', cls: 'index', provider: 'td', psym: 'SPX', digits: 1, exch: 'SP' },
  { sym: 'GER40', name: 'DAX 40', cls: 'index', provider: 'td', psym: 'DAX', digits: 1, exch: 'XETRA' },
  { sym: 'UK100', name: 'FTSE 100', cls: 'index', provider: 'td', psym: 'FTSE', digits: 1, exch: 'LSE' },
  { sym: 'JP225', name: 'Nikkei 225', cls: 'index', provider: 'td', psym: 'N225', digits: 1, exch: 'TSE' },

  // ---- equities ----
  { sym: 'AAPL', name: 'Apple Inc', cls: 'stock', provider: 'td', psym: 'AAPL', digits: 2, exch: 'NASDAQ' },
  { sym: 'TSLA', name: 'Tesla Inc', cls: 'stock', provider: 'td', psym: 'TSLA', digits: 2, exch: 'NASDAQ' },
  { sym: 'NVDA', name: 'NVIDIA Corp', cls: 'stock', provider: 'td', psym: 'NVDA', digits: 2, exch: 'NASDAQ' },
  { sym: 'MSFT', name: 'Microsoft Corp', cls: 'stock', provider: 'td', psym: 'MSFT', digits: 2, exch: 'NASDAQ' },
  { sym: 'AMZN', name: 'Amazon.com Inc', cls: 'stock', provider: 'td', psym: 'AMZN', digits: 2, exch: 'NASDAQ' },
  { sym: 'META', name: 'Meta Platforms Inc', cls: 'stock', provider: 'td', psym: 'META', digits: 2, exch: 'NASDAQ' },
  { sym: 'GOOGL', name: 'Alphabet Inc Class A', cls: 'stock', provider: 'td', psym: 'GOOGL', digits: 2, exch: 'NASDAQ' },
];

export function findSymbol(sym) {
  if (!sym) return null;
  const s = String(sym).toUpperCase().replace(/[^A-Z0-9/]/g, '');
  const hit = SYMBOLS.find((x) => x.sym === s);
  if (hit) return hit;
  // Allow ad-hoc instruments typed by hand: EUR/USD, EURUSD, BTCUSDT, AAPL
  if (s.includes('/')) {
    const [a, b] = s.split('/');
    if (a && b) {
      const digits = /JPY/.test(b) ? 3 : 5;
      return { sym: `${a}${b}`, name: `${a} / ${b}`, cls: 'forex', provider: 'td', psym: `${a}/${b}`, digits, exch: 'FX', custom: true };
    }
  }
  const m = s.match(/^([A-Z]{3})([A-Z]{3})$/);
  if (m) {
    const digits = m[2] === 'JPY' ? 3 : 5;
    return { sym: s, name: `${m[1]} / ${m[2]}`, cls: 'forex', provider: 'td', psym: `${m[1]}/${m[2]}`, digits, exch: 'FX', custom: true };
  }
  // Ticker-style symbol, routed to Twelve Data
  return { sym: s, name: s, cls: 'stock', provider: 'td', psym: s, digits: 2, exch: '?', custom: true };
}

export function searchSymbols(q, limit = 12) {
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
