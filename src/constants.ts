export const EXCHANGES = [
  { id: 'binance', name: 'Binance', logo: 'B', color: '#F3BA2F', maker: '0.1%', taker: '0.1%', pairs: 1500, vol: '$12.5B' },
  { id: 'okx', name: 'OKX', logo: 'O', color: '#000000', maker: '0.08%', taker: '0.1%', pairs: 800, vol: '$4.2B' },
  { id: 'bybit', name: 'Bybit', logo: 'B', color: '#FFB11A', maker: '0.1%', taker: '0.1%', pairs: 600, vol: '$3.8B' },
  { id: 'coinbase', name: 'Coinbase', logo: 'C', color: '#0052FF', maker: '0.4%', taker: '0.6%', pairs: 400, vol: '$2.1B' },
  { id: 'kraken', name: 'Kraken', logo: 'K', color: '#5741D9', maker: '0.16%', taker: '0.26%', pairs: 300, vol: '$1.5B' },
];

export const STRATEGIES = [
  { id: 'cex', label: 'CEX Arbitrage', icon: '⚡', color: '#00cfff', description: 'Inter-exchange arbitrage between centralized exchanges.' },
  { id: 'dex', label: 'DEX Arbitrage', icon: '🦄', color: '#ff007a', description: 'Arbitrage between decentralized exchanges like Uniswap and PancakeSwap.' },
  { id: 'tri', label: 'Triangular', icon: '△', color: '#a855f7', description: 'Three-way arbitrage within a single exchange.' },
  { id: 'fund', label: 'Funding Rate', icon: '💰', color: '#10b981', description: 'Delta-neutral strategy capturing funding rate differences.' },
];

export const NETWORK_FEES: Record<string, number> = {
  'BTC': 1.50, 'ETH': 2.50, 'SOL': 0.01, 'BNB': 0.15,
  'XRP': 0.08, 'DOGE': 0.50, 'ADA': 0.20, 'AVAX': 0.30,
  'MATIC': 0.02, 'ARB': 0.10, 'OP': 0.10, 'TON': 0.05,
  'TRX': 0.10, 'NEAR': 0.10, 'PEPE': 2.50, 'SHIB': 2.50,
  'BONK': 0.01, 'WIF': 0.01, 'INJ': 0.05, 'SEI': 0.02,
};
