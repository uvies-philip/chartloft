// Instrument marks: currency flags for FX pairs, coin tiles for crypto,
// metal, index and stock badges. Pure SVG strings, no image requests.

let uidSeq = 0;
const nid = (p) => `${p}${++uidSeq}`;

/* ------------------------------- flag art -------------------------------- */
// 24x24 art, clipped to a circle by the caller.
const FLAGS = {
  USD: `
    <rect width="24" height="24" fill="#f4f6f9"/>
    <g fill="#d8323c"><rect y="3.5" width="24" height="2.6"/><rect y="9" width="24" height="2.6"/><rect y="14.5" width="24" height="2.6"/><rect y="20" width="24" height="2.6"/></g>
    <rect width="11" height="10.6" fill="#1f3f8f"/>
    <g fill="#fff"><circle cx="2.6" cy="2.6" r="0.9"/><circle cx="6" cy="2.6" r="0.9"/><circle cx="9.2" cy="2.6" r="0.9"/><circle cx="4.3" cy="5.4" r="0.9"/><circle cx="7.6" cy="5.4" r="0.9"/><circle cx="2.6" cy="8.2" r="0.9"/><circle cx="6" cy="8.2" r="0.9"/><circle cx="9.2" cy="8.2" r="0.9"/></g>`,
  EUR: `
    <rect width="24" height="24" fill="#123a9e"/>
    <g fill="#f7d64a">${Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      return `<circle cx="${(12 + Math.cos(a) * 6.4).toFixed(2)}" cy="${(12 + Math.sin(a) * 6.4).toFixed(2)}" r="1.1"/>`;
    }).join('')}</g>`,
  GBP: `
    <rect width="24" height="24" fill="#0b2f6b"/>
    <path d="M0 0 24 24M24 0 0 24" stroke="#fff" stroke-width="4.6"/>
    <path d="M0 0 24 24M24 0 0 24" stroke="#cf2438" stroke-width="2"/>
    <path d="M12 0v24M0 12h24" stroke="#fff" stroke-width="7"/>
    <path d="M12 0v24M0 12h24" stroke="#cf2438" stroke-width="4"/>`,
  JPY: `
    <rect width="24" height="24" fill="#f7f8fa"/>
    <circle cx="12" cy="12" r="6.4" fill="#d8323c"/>`,
  AUD: `
    <rect width="24" height="24" fill="#10357c"/>
    <path d="M0 0h11v9H0z" fill="#0b2a63"/>
    <path d="M0 0 11 9M11 0 0 9" stroke="#fff" stroke-width="1.8"/>
    <path d="M5.5 0v9M0 4.5h11" stroke="#fff" stroke-width="2.6"/>
    <path d="M5.5 0v9M0 4.5h11" stroke="#cf2438" stroke-width="1.4"/>
    <g fill="#fff"><circle cx="17.5" cy="6" r="1.2"/><circle cx="20" cy="11.5" r="1.2"/><circle cx="15.5" cy="14" r="1.2"/><circle cx="18.5" cy="18.5" r="1.5"/></g>`,
  CAD: `
    <rect width="24" height="24" fill="#fff"/>
    <rect width="6" height="24" fill="#d8323c"/>
    <rect x="18" width="6" height="24" fill="#d8323c"/>
    <path d="M12 5l1.6 3.4 2.9-1-1 3.2 2.4 1.3-2.6 1.9.5 2.6-3.1-1.3-.7 3.4-.7-3.4L8.2 16l.5-2.6L6.1 11.5l2.4-1.3-1-3.2 2.9 1z" fill="#d8323c"/>`,
  CHF: `
    <rect width="24" height="24" fill="#d8323c"/>
    <path d="M10 5h4v5h5v4h-5v5h-4v-5H5v-4h5z" fill="#fff"/>`,
  NZD: `
    <rect width="24" height="24" fill="#0d2f6b"/>
    <path d="M0 0h10v8H0z" fill="#0a2358"/>
    <path d="M0 0 10 8M10 0 0 8" stroke="#fff" stroke-width="1.6"/>
    <path d="M5 0v8M0 4h10" stroke="#fff" stroke-width="2.4"/>
    <path d="M5 0v8M0 4h10" stroke="#cf2438" stroke-width="1.2"/>
    <g fill="#d8323c" stroke="#fff" stroke-width="0.5"><circle cx="17" cy="7" r="1.4"/><circle cx="20" cy="12" r="1.4"/><circle cx="15" cy="13" r="1.4"/><circle cx="18" cy="18" r="1.7"/></g>`,
  MXN: `
    <rect width="8" height="24" fill="#0a6847"/>
    <rect x="8" width="8" height="24" fill="#f7f8fa"/>
    <rect x="16" width="8" height="24" fill="#cf2438"/>
    <circle cx="12" cy="12" r="2.4" fill="#8a6d3b" opacity="0.85"/>`,
  ZAR: `
    <rect width="24" height="24" fill="#f7f8fa"/>
    <rect y="3" width="24" height="4" fill="#cf2438"/>
    <rect y="17" width="24" height="4" fill="#10357c"/>
    <path d="M0 0l10 12L0 24z" fill="#0a6847"/>
    <path d="M0 0l8 12L0 24" stroke="#f7d64a" stroke-width="2" fill="none"/>`,
};

export const FX_PAIRS = {
  EURUSD: ['EUR', 'USD'], GBPUSD: ['GBP', 'USD'], USDJPY: ['USD', 'JPY'],
  AUDUSD: ['AUD', 'USD'], USDCAD: ['USD', 'CAD'], USDCHF: ['USD', 'CHF'],
  NZDUSD: ['NZD', 'USD'], EURJPY: ['EUR', 'JPY'], GBPJPY: ['GBP', 'JPY'],
  EURGBP: ['EUR', 'GBP'], AUDJPY: ['AUD', 'JPY'], EURAUD: ['EUR', 'AUD'],
  GBPCHF: ['GBP', 'CHF'], USDMXN: ['USD', 'MXN'], USDZAR: ['USD', 'ZAR'],
};

const COINS = {
  BTC: { c: '#f7931a', g: '₿', bg: 'linear-gradient' },
  ETH: { c: '#8b9dff', g: 'Ξ' },
  SOL: { c: '#14f195', g: '◎' },
  BNB: { c: '#f3ba2f', g: 'B' },
  XRP: { c: '#9aa7b8', g: 'X' },
  ADA: { c: '#4c8dff', g: 'A' },
  DOGE: { c: '#c9a227', g: 'Ð' },
  AVAX: { c: '#e84142', g: 'A' },
  LINK: { c: '#5b8cff', g: 'L' },
  LTC: { c: '#9bb8e0', g: 'Ł' },
  DOT: { c: '#e6007a', g: 'D' },
  TRX: { c: '#ff4a4a', g: 'T' },
  SUI: { c: '#4da2ff', g: 'S' },
  TON: { c: '#0ea5e9', g: 'T' },
  NEAR: { c: '#00d68f', g: 'N' },
  APT: { c: '#8b8f98', g: 'A' },
};

const STOCK_COLORS = {
  AAPL: '#a3aab6', TSLA: '#e82127', NVDA: '#76b900', MSFT: '#2f9ce0',
  AMZN: '#ff9900', META: '#1877f2', GOOGL: '#4285f4',
};

const INDEX_COLORS = { US30: '#7aa9ff', NAS100: '#8b5cf6', SPX500: '#2ee6a8', GER40: '#f5a623', UK100: '#ff7ab6', JP225: '#ff6b6b' };

/* ------------------------------ public API ------------------------------- */
export function symbolLogo(sym, cls, size = 22) {
  const s = String(sym || '').toUpperCase();
  if (cls === 'crypto') return coinTile(s, size);
  if (cls === 'forex' || FX_PAIRS[s]) return pairFlags(s, size);
  if (cls === 'metal') return metalTile(s, size);
  if (cls === 'index') return indexTile(s, size);
  if (cls === 'stock') return stockTile(s, size);
  return letterTile(s.slice(0, 2), '#5b8cff', size);
}

function wrap(size, inner, extra = '') {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" class="sym-logo" aria-hidden="true" ${extra}>${inner}</svg>`;
}

function pairFlags(sym, size) {
  const pair = FX_PAIRS[sym] || [sym.slice(0, 3), sym.slice(3, 6)];
  const [base, quote] = pair;
  const cid1 = nid('fq');
  const cid2 = nid('fb');
  const flag = (code, cx, cy, r, cid) => {
    const art = FLAGS[code];
    if (!art) {
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#1b2534"/>
        <text x="${cx}" y="${cy + 2.4}" text-anchor="middle" font-size="7" font-family="Inter,sans-serif" font-weight="700" fill="#93a4ba">${code.slice(0, 2)}</text>`;
    }
    return `<clipPath id="${cid}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
      <g clip-path="url(#${cid})"><g transform="translate(${cx - r},${cy - r}) scale(${(r * 2) / 24})">${art}</g></g>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(8,12,18,0.85)" stroke-width="1.1"/>`;
  };
  return wrap(size, `
    ${flag(quote, 14.6, 14.8, 7.4, cid1)}
    ${flag(base, 9.4, 9.4, 7.8, cid2)}`);
}

function coinTile(sym, size) {
  const base = sym.replace(/USDT?$/, '');
  const coin = COINS[base] || { c: '#5b8cff', g: base.slice(0, 1) };
  const id = nid('cg');
  return wrap(size, `
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${coin.c}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="${coin.c}" stop-opacity="0.07"/>
    </linearGradient></defs>
    <rect width="24" height="24" rx="7" fill="url(#${id})" stroke="${coin.c}" stroke-opacity="0.42"/>
    <text x="12" y="16.4" text-anchor="middle" font-size="13" font-family="Inter,system-ui,sans-serif" font-weight="700" fill="${coin.c}">${coin.g}</text>`);
}

function metalTile(sym, size) {
  const isGold = sym.includes('XAU');
  const c1 = isGold ? '#f7d774' : '#dfe6ef';
  const c2 = isGold ? '#c9a227' : '#98a6b8';
  const label = isGold ? 'Au' : 'Ag';
  const id = nid('mg');
  return wrap(size, `
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
    <circle cx="12" cy="12" r="11" fill="url(#${id})"/>
    <text x="12" y="15.6" text-anchor="middle" font-size="9.5" font-family="Inter,sans-serif" font-weight="700" fill="#2b2410">${label}</text>`);
}

function indexTile(sym, size) {
  const c = INDEX_COLORS[sym] || '#7aa9ff';
  return wrap(size, `
    <rect width="24" height="24" rx="7" fill="${c}" fill-opacity="0.13" stroke="${c}" stroke-opacity="0.36"/>
    <g stroke="${c}" stroke-width="1.9" stroke-linecap="round">
      <path d="M6.5 16.5v-4M11.2 16.5v-7M15.9 16.5v-9.2M19.4 16.5v-5"/>
    </g>`);
}

function stockTile(sym, size) {
  const c = STOCK_COLORS[sym] || '#8b9bb4';
  return letterTile(sym.slice(0, 1), c, size);
}

function letterTile(letters, color, size) {
  return wrap(size, `
    <rect width="24" height="24" rx="7" fill="${color}" fill-opacity="0.14" stroke="${color}" stroke-opacity="0.34"/>
    <text x="12" y="16.2" text-anchor="middle" font-size="11" font-family="Inter,sans-serif" font-weight="700" fill="${color}">${letters}</text>`);
}

/* --------------------------- tiny sparkline ----------------------------- */
export function sparkline(values, { width = 54, height = 20, color = '#2ee6a8' } = {}) {
  if (!values || values.length < 2) return '';
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`);
  const id = nid('sg');
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" class="spark" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity="0.30"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <polygon points="0,${height} ${pts.join(' ')} ${width},${height}" fill="url(#${id})"/>
    <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}
