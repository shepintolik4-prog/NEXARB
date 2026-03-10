export interface User {
  id: string;
  tgId: string;
  tgUsername?: string;
  tgFirstName?: string;
  refCode: string;
  referredBy?: string;
  lang: string;
  isBanned: boolean;
  createdAt: number;
  lastSeen: number;
  balance: {
    usd: number;
    demo: number;
  };
  vip: {
    isVip: boolean;
    plan?: 'week' | 'month' | 'year' | 'lifetime';
    expiresAt?: number;
  };
}

export interface Trade {
  id: string;
  userId: string;
  symbol: string;
  strategyType: string;
  buyExchange: string;
  sellExchange: string;
  amount: number;
  grossProfit: number;
  netProfit: number;
  fees: {
    exchangeA: number;
    exchangeB: number;
    network: number;
    slippage: number;
    platform: number;
  };
  spreadPct: number;
  aiScore: number;
  executionMs: number;
  status: 'completed' | 'pending' | 'failed';
  balanceBefore: number;
  balanceAfter: number;
  isAuto: boolean;
  createdAt: number;
}

export interface Signal {
  id: string;
  type: 'cex' | 'dex' | 'tri' | 'fund';
  sym: string;
  bx: string;
  sx: string;
  spread: number;
  net: number;
  buyPrice: number;
  sellPrice: number;
  ts: number;
  aiScore: number;
  hot?: boolean;
  vip?: boolean;
}

export interface ExchangeConnection {
  exchangeId: string;
  apiKey: string; // Encrypted
  secret: string; // Encrypted
  keyMask: string;
  isActive: boolean;
  connectedAt: number;
}
