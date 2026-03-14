import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import fs from "fs";
import ccxt from "ccxt";
import cors from "cors";
import pino from "pino";

dotenv.config();

const logger = pino({
  transport: { target: "pino-pretty", options: { colorize: true } },
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ADMIN_SECRET = process.env.ADMIN_SECRET || "nexarb-admin-2025";
const PORT = Number(process.env.PORT) || 3000;
const DB_PATH = path.join(process.cwd(), "nexarb.db");

// ── Lazy imports (server-only modules) ─────────────────────
const { default: db } = await import("./src/lib/db.js");
const { encrypt, decrypt } = await import("./src/lib/crypto.js");
const { authenticate, authorizeAdmin } = await import("./src/lib/auth.js");
const {
  tradeSchema,
  exchangeConnectSchema,
  vipInitiateSchema,
  vipConfirmSchema,
  accountUpdateSchema,
  notificationSchema,
  exchangeDeleteSchema,
} = await import("./src/lib/validation.js");

// ── Express app ─────────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors({ origin: process.env.APP_URL || "*", credentials: true }));
app.use(express.json({ limit: "10kb" }));

// Simple in-memory rate limiter (replaces express-rate-limit)
const rateLimitMap = new Map<string, { count: number; reset: number }>();
app.use("/api/", (req, res, next) => {
  const ip = req.ip || "unknown";
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.reset) {
    rateLimitMap.set(ip, { count: 1, reset: now + 15 * 60 * 1000 });
    return next();
  }
  if (entry.count >= 200) {
    return res.status(429).json({ error: "Too many requests, try again later" });
  }
  entry.count++;
  next();
});

// ── Config & defaults ───────────────────────────────────────
const DEFAULT_CONFIG = {
  fee_free: 0.008,
  fee_vip: 0.003,
  exchange_fee: 0.001,
  network_fee_cross: 0.002,
  network_fee_dex: 0.003,
  slippage_dex: 0.001,
  referral_pct: 0.1,
  free_signals_max: 3,
  free_trades_max: 5,
  free_exchanges_max: 2,
  free_strategies: "cex",
  min_trade_amount: 10,
  max_trade_amount: 1000000,
  demo_mode: true,
  maintenance: false,
  demo_start_balance: 10000,
  real_start_balance: 0,
};

function getConfig() {
  const row = db.prepare('SELECT value FROM config WHERE key = "settings"').get() as any;
  return { ...DEFAULT_CONFIG, ...(row ? JSON.parse(row.value) : {}) };
}

// ── Prices ──────────────────────────────────────────────────
let realPrices: Record<string, number> = {
  BTC: 83000, ETH: 2000, SOL: 130, BNB: 590, XRP: 2.3,
  ADA: 0.72, AVAX: 22, DOT: 6.5, NEAR: 4.1, ATOM: 8.2,
  ALGO: 0.18, FTM: 0.52, TON: 4.2, TRX: 0.22, LTC: 92,
  BCH: 430, ETC: 26, XLM: 0.11, VET: 0.035, MATIC: 0.5,
  ARB: 0.42, OP: 2.1, UNI: 6.0, LINK: 13, AAVE: 185,
  MKR: 1650, CRV: 0.58, DOGE: 0.175, SHIB: 0.0000145,
  PEPE: 0.0000095, WIF: 2.8, BONK: 0.00003, FIL: 4.5,
  GRT: 0.12, INJ: 22, TIA: 6.8, SEI: 0.38, SUI: 1.6,
  APT: 7.2, RNDR: 5.4, FET: 1.2, TAO: 380,
};

const GCK_MAP: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", BNB: "binancecoin",
  XRP: "ripple", ADA: "cardano", AVAX: "avalanche-2", DOT: "polkadot",
  NEAR: "near", ATOM: "cosmos", ALGO: "algorand", FTM: "fantom",
  TON: "the-open-network", TRX: "tron", LTC: "litecoin",
  BCH: "bitcoin-cash", MATIC: "matic-network", ARB: "arbitrum",
  OP: "optimism", UNI: "uniswap", LINK: "chainlink", AAVE: "aave",
  DOGE: "dogecoin", SHIB: "shiba-inu", PEPE: "pepe", WIF: "dogwifcoin",
  FIL: "filecoin", GRT: "the-graph", INJ: "injective-protocol",
  TIA: "celestia", SEI: "sei-network", SUI: "sui", APT: "aptos",
  RNDR: "render-token", FET: "fetch-ai", TAO: "bittensor",
};

async function fetchPrices() {
  try {
    const ids = Object.values(GCK_MAP).join(",");
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
    if (!r.ok) throw new Error("" + r.status);
    const d: any = await r.json();
    let n = 0;
    Object.entries(GCK_MAP).forEach(([sym, id]) => {
      if (d[id]?.usd) { realPrices[sym] = d[id].usd; n++; }
    });
    logger.info(`Prices updated: ${n} tokens`);
  } catch {
    logger.warn("CoinGecko unavailable, using cached prices");
  }
}
fetchPrices();
setInterval(fetchPrices, 60_000);

// ── Static data ─────────────────────────────────────────────
const ALL_EXCHANGES = [
  { id: "binance", name: "Binance", tier: 1, logo: "🟡", fee: 0.001, type: "cex" },
  { id: "okx", name: "OKX", tier: 1, logo: "⚫", fee: 0.001, type: "cex" },
  { id: "bybit", name: "Bybit", tier: 1, logo: "🟠", fee: 0.001, type: "cex" },
  { id: "coinbase", name: "Coinbase", tier: 1, logo: "🔵", fee: 0.006, type: "cex" },
  { id: "kraken", name: "Kraken", tier: 1, logo: "🟣", fee: 0.002, type: "cex" },
  { id: "kucoin", name: "KuCoin", tier: 2, logo: "🟢", fee: 0.001, type: "cex" },
  { id: "gate", name: "Gate.io", tier: 2, logo: "🔴", fee: 0.002, type: "cex" },
  { id: "mexc", name: "MEXC", tier: 2, logo: "🟤", fee: 0.0002, type: "cex" },
  { id: "htx", name: "HTX", tier: 2, logo: "🔷", fee: 0.002, type: "cex" },
  { id: "bitget", name: "Bitget", tier: 2, logo: "🔹", fee: 0.001, type: "cex" },
  { id: "uniswap", name: "Uniswap V3", tier: 1, logo: "🦄", fee: 0.003, type: "dex", network: "ethereum" },
  { id: "pancake", name: "PancakeSwap", tier: 1, logo: "🥞", fee: 0.0025, type: "dex", network: "bsc" },
  { id: "jupiter", name: "Jupiter", tier: 1, logo: "♃", fee: 0.002, type: "dex", network: "solana" },
  { id: "raydium", name: "Raydium", tier: 1, logo: "⚡", fee: 0.0025, type: "dex", network: "solana" },
];

const ALL_NETWORKS = [
  { id: "ethereum", name: "Ethereum", symbol: "ETH", color: "#627EEA", avg_fee_usd: 2.5, tvl: "$45B" },
  { id: "bsc", name: "BSC", symbol: "BNB", color: "#F0B90B", avg_fee_usd: 0.1, tvl: "$8B" },
  { id: "solana", name: "Solana", symbol: "SOL", color: "#9945FF", avg_fee_usd: 0.001, tvl: "$6B" },
  { id: "arbitrum", name: "Arbitrum", symbol: "ARB", color: "#2D9CDB", avg_fee_usd: 0.05, tvl: "$3B" },
  { id: "ton", name: "TON", symbol: "TON", color: "#0088CC", avg_fee_usd: 0.01, tvl: "$800M" },
];

const TRI_CHAINS: Record<string, string[][]> = {
  binance: [
    ["BTC/USDT", "ETH/BTC", "ETH/USDT"],
    ["BNB/USDT", "ETH/BNB", "ETH/USDT"],
    ["BTC/USDT", "SOL/BTC", "SOL/USDT"],
    ["ETH/USDT", "LINK/ETH", "LINK/USDT"],
  ],
  okx: [
    ["BTC/USDT", "ETH/BTC", "ETH/USDT"],
    ["BTC/USDT", "SOL/BTC", "SOL/USDT"],
  ],
  bybit: [
    ["BTC/USDT", "ETH/BTC", "ETH/USDT"],
  ],
};

// ── User helpers ────────────────────────────────────────────
function getUserFromDB(userId: string, tgData?: any) {
  let user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
  if (!user) {
    const refCode = "REF" + Math.random().toString(36).substring(2, 7).toUpperCase();
    const cfg = getConfig();
    db.prepare(`
      INSERT INTO users (id,tg_id,tg_username,tg_first_name,tg_last_name,tg_photo_url,
        created_at,last_seen,ref_code,filter_prefs,demo_balance)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      userId,
      tgData?.id || null,
      tgData?.username || "",
      tgData?.first_name || "User",
      tgData?.last_name || "",
      tgData?.photo_url || "",
      Math.floor(Date.now() / 1000),
      Math.floor(Date.now() / 1000),
      refCode,
      JSON.stringify({
        strategies: ["cex", "tri", "dex", "cross"],
        networks: ALL_NETWORKS.map((n) => n.id),
        exchanges: ALL_EXCHANGES.filter((e) => e.type === "cex").slice(0, 8).map((e) => e.id),
        min_spread: 0, min_ai_score: 0, tokens: [],
      }),
      cfg.demo_start_balance
    );
    user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  } else if (tgData) {
    db.prepare(`
      UPDATE users SET tg_id=?,tg_username=?,tg_first_name=?,tg_last_name=?,tg_photo_url=?,last_seen=?
      WHERE id=?
    `).run(
      tgData.id || user.tg_id,
      tgData.username || user.tg_username,
      tgData.first_name || user.tg_first_name,
      tgData.last_name || user.tg_last_name,
      tgData.photo_url || user.tg_photo_url,
      Math.floor(Date.now() / 1000),
      userId
    );
  } else {
    db.prepare("UPDATE users SET last_seen=? WHERE id=?").run(Math.floor(Date.now() / 1000), userId);
  }

  if (user.filter_prefs && typeof user.filter_prefs === "string") {
    try { user.filter_prefs = JSON.parse(user.filter_prefs); } catch { user.filter_prefs = {}; }
  }
  if (user.api_keys && typeof user.api_keys === "string") {
    try { user.api_keys = JSON.parse(user.api_keys); } catch { user.api_keys = []; }
  }
  return user;
}

function mkLimits(u: any) {
  const cfg = getConfig();
  return {
    signals_max: u.vip ? 9999 : cfg.free_signals_max,
    trades_max: u.vip ? 9999 : cfg.free_trades_max,
    exchanges_max: u.vip ? 9999 : cfg.free_exchanges_max,
    strategies: u.vip ? "all" : cfg.free_strategies,
  };
}

// ── API Routes ──────────────────────────────────────────────
app.get("/api/health", (_req, res) =>
  res.json({ status: "ok", tokens: Object.keys(realPrices).length })
);

app.get("/api/v1/exchanges", authenticate, (_req, res) => res.json(ALL_EXCHANGES));
app.get("/api/v1/networks", authenticate, (_req, res) => res.json(ALL_NETWORKS));
app.get("/api/v1/prices", authenticate, (_req, res) => res.json(realPrices));
app.get("/api/v1/tokens", authenticate, (_req, res) => res.json(Object.keys(realPrices)));

app.post("/api/v1/auth", authenticate, (req: any, res) => {
  const userId = req.user!.uid;
  const tg = req.body.user || req.body.tg_data?.user;
  const u = getUserFromDB(userId, tg);
  res.json({ ...u, limits: mkLimits(u) });
});

app.get("/api/v1/account", authenticate, (req: any, res) => {
  const u = getUserFromDB(req.user!.uid);
  if (u.blocked) return res.status(403).json({ error: "Заблокирован" });

  // Attach recent trade history
  const tradeHistory = db
    .prepare("SELECT * FROM trades WHERE userId=? ORDER BY created_at DESC LIMIT 50")
    .all(req.user!.uid) as any[];

  res.json({
    ...u,
    trade_history: tradeHistory.map((t) => ({
      ...t,
      fees: t.fees ? JSON.parse(t.fees) : {},
    })),
    limits: mkLimits(u),
  });
});

app.patch("/api/v1/account", authenticate, (req: any, res) => {
  const userId = req.user!.uid;
  const validation = accountUpdateSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ error: validation.error });

  const u = getUserFromDB(userId);
  const data = validation.data as any;
  const updates: string[] = [];
  const params: any[] = [];

  ["trade_mode", "auto_trading", "auto_amount", "auto_min_spread", "auto_risk"].forEach((k) => {
    if (data[k] !== undefined) { updates.push(`${k}=?`); params.push(data[k]); }
  });
  if (data.filter_prefs) {
    updates.push("filter_prefs=?");
    params.push(JSON.stringify({ ...u.filter_prefs, ...data.filter_prefs }));
  }
  if (updates.length > 0) {
    params.push(userId);
    db.prepare(`UPDATE users SET ${updates.join(",")} WHERE id=?`).run(...params);
  }
  res.json({ ok: true });
});

app.post("/api/v1/trades", authenticate, (req: any, res) => {
  const userId = req.user!.uid;
  const validation = tradeSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ error: validation.error });

  const { symbol, amount, spread, buyExchange, sellExchange, type, mode } = validation.data;
  const u = getUserFromDB(userId);
  if (u.blocked) return res.status(403).json({ error: "Заблокирован" });

  const cfg = getConfig();
  const tMode = mode || u.trade_mode || "demo";
  const bal = tMode === "real" ? u.balance : u.demo_balance;

  if (!u.vip && u.trades >= cfg.free_trades_max) {
    return res.status(403).json({ error: `Лимит ${cfg.free_trades_max} сделок` });
  }
  if (amount > bal) return res.status(400).json({ error: "Недостаточно средств" });

  const feeRate = u.vip ? cfg.fee_vip : cfg.fee_free;
  const nFee = type === "cross" ? amount * cfg.network_fee_cross : type === "dex" ? amount * cfg.network_fee_dex : 0;
  const exA = amount * cfg.exchange_fee, exB = amount * cfg.exchange_fee;
  const slip = type === "dex" ? amount * cfg.slippage_dex : 0;
  const platFee = amount * feeRate;
  const totalFees = platFee + nFee + exA + exB + slip;
  const gross = amount * (spread / 100);
  const net = gross - totalFees;

  if (tMode === "real") {
    db.prepare("UPDATE users SET balance=balance+?,profit=profit+?,trades=trades+1 WHERE id=?").run(net, net, userId);
  } else {
    db.prepare("UPDATE users SET demo_balance=demo_balance+?,demo_profit=demo_profit+?,demo_trades=demo_trades+1 WHERE id=?").run(net, net, userId);
  }

  const tId = Math.random().toString(36).substring(2, 10);
  const fees = JSON.stringify({ platform: platFee, network: nFee, exchangeA: exA, exchangeB: exB, slippage: slip });
  db.prepare(`
    INSERT INTO trades (id,userId,symbol,amount,spread,type,mode,buyExchange,sellExchange,gross,net,totalFees,fees,feeRates,status,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(tId, userId, symbol, amount, spread, type, tMode, buyExchange, sellExchange, gross, net, totalFees, fees,
    JSON.stringify({ platform: feeRate }), "completed", Math.floor(Date.now() / 1000));

  const updated = getUserFromDB(userId);
  res.json({
    id: tId, symbol, amount, spread, type, mode: tMode, buyExchange, sellExchange,
    gross, net, totalFees,
    newBalance: tMode === "real" ? updated.balance : updated.demo_balance,
  });
});

app.post("/api/v1/vip/initiate", authenticate, (req: any, res) => {
  const validation = vipInitiateSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ error: validation.error });
  const { plan = "month" } = validation.data;
  const prices: any = {
    week: { stars: 150, ton: "0.25", usd: 9 },
    month: { stars: 450, ton: "0.80", usd: 29 },
    year: { stars: 1999, ton: "3.50", usd: 149 },
  };
  const invoiceId = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  res.json({ ok: true, invoiceId, plan, prices: prices[plan] || prices.month });
});

app.post("/api/v1/vip/confirm", authenticate, (req: any, res) => {
  const userId = req.user!.uid;
  const validation = vipConfirmSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ error: validation.error });
  const { plan = "month" } = validation.data;
  const dur: any = { week: 604800, month: 2592000, year: 31536000 };
  const expires = Math.floor(Date.now() / 1000) + (dur[plan] || dur.month);
  db.prepare("UPDATE users SET vip=1,vip_expires=? WHERE id=?").run(expires, userId);
  res.json({ ok: true, expires_at: expires, vip: true });
});

app.post("/api/v1/exchange/connect", authenticate, (req: any, res) => {
  const userId = req.user!.uid;
  const validation = exchangeConnectSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ error: validation.error });
  const { exchange, apiKey, apiSecret } = validation.data;
  const u = getUserFromDB(userId);
  if (!u.vip) return res.status(403).json({ error: "VIP required" });
  const apiKeys = (u.api_keys || []).filter((k: any) => k.exchange !== exchange);
  apiKeys.push({ exchange, key: encrypt(apiKey), secret: encrypt(apiSecret), active: true, ts: Math.floor(Date.now() / 1000) });
  db.prepare("UPDATE users SET api_keys=? WHERE id=?").run(JSON.stringify(apiKeys), userId);
  res.json({ ok: true });
});

app.delete("/api/v1/exchange/connect", authenticate, (req: any, res) => {
  const userId = req.user!.uid;
  const validation = exchangeDeleteSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ error: validation.error });
  const u = getUserFromDB(userId);
  const apiKeys = (u.api_keys || []).filter((k: any) => k.exchange !== validation.data.exchange);
  db.prepare("UPDATE users SET api_keys=? WHERE id=?").run(JSON.stringify(apiKeys), userId);
  res.json({ ok: true });
});

// ── Admin routes ────────────────────────────────────────────
app.get("/api/admin/stats", authorizeAdmin, (_req, res) => {
  const now = Math.floor(Date.now() / 1000);
  const oneDayAgo = now - 86400;

  const users = db.prepare("SELECT * FROM users").all() as any[];
  const trades = db.prepare("SELECT * FROM trades").all() as any[];
  const trades24h = trades.filter((t: any) => t.created_at > oneDayAgo);

  const byStrategy: any = {};
  for (const t of trades) {
    const type = t.type || "cex";
    if (!byStrategy[type]) byStrategy[type] = { volume: 0, count: 0, fees: 0 };
    byStrategy[type].volume += t.amount || 0;
    byStrategy[type].count += 1;
    byStrategy[type].fees += t.totalFees || 0;
  }

  // Daily stats for last 14 days
  const daily = [];
  for (let i = 13; i >= 0; i--) {
    const dayStart = now - i * 86400 - (now % 86400);
    const dayEnd = dayStart + 86400;
    const dayTrades = trades.filter((t: any) => t.created_at >= dayStart && t.created_at < dayEnd);
    const feeSum = dayTrades.reduce((a: number, t: any) => {
      try { return a + (JSON.parse(t.fees || "{}").platform || 0); } catch { return a; }
    }, 0);
    daily.push({
      date: new Date(dayStart * 1000).toISOString().split("T")[0],
      trades: dayTrades.length,
      volume: dayTrades.reduce((a: number, t: any) => a + (t.amount || 0), 0),
      fees: feeSum,
    });
  }

  // Top users by profit
  const top_users = users
    .sort((a: any, b: any) => (b.profit || 0) - (a.profit || 0))
    .slice(0, 10)
    .map((u: any) => ({
      id: u.id,
      profit: u.profit || 0,
      trades: u.trades || 0,
      balance: u.balance || 0,
      vip: !!u.vip,
    }));

  // Top signals
  const sigMap: any = {};
  for (const t of trades) {
    const key = `${t.type}:${t.symbol}`;
    sigMap[key] = (sigMap[key] || 0) + 1;
  }
  const top_signals = Object.entries(sigMap)
    .map(([key, count]) => ({ key, count }))
    .sort((a: any, b: any) => b.count - a.count)
    .slice(0, 8);

  res.json({
    total_users: users.length,
    online_users: users.filter((u: any) => u.last_seen > now - 300).length,
    vip_users: users.filter((u: any) => u.vip).length,
    free_users: users.filter((u: any) => !u.vip && !u.blocked).length,
    blocked_users: users.filter((u: any) => u.blocked).length,
    total_trades: trades.length,
    trades_24h: trades24h.length,
    total_volume: trades.reduce((a: number, t: any) => a + (t.amount || 0), 0),
    volume_24h: trades24h.reduce((a: number, t: any) => a + (t.amount || 0), 0),
    platform_fees_total: trades.reduce((a: number, t: any) => {
      try { return a + (JSON.parse(t.fees || "{}").platform || 0); } catch { return a; }
    }, 0),
    platform_fees_24h: trades24h.reduce((a: number, t: any) => {
      try { return a + (JSON.parse(t.fees || "{}").platform || 0); } catch { return a; }
    }, 0),
    by_strategy: byStrategy,
    daily,
    top_users,
    top_signals,
  });
});

app.get("/api/admin/users", authorizeAdmin, (req, res) => {
  const { search = "", page = "1", limit = "25" } = req.query as any;
  let users = db.prepare("SELECT * FROM users").all() as any[];

  if (search) {
    const q = search.toLowerCase();
    users = users.filter((u: any) =>
      u.id.toLowerCase().includes(q) ||
      (u.tg_username || "").toLowerCase().includes(q) ||
      (u.ref_code || "").toLowerCase().includes(q)
    );
  }

  const total = users.length;
  const offset = (Number(page) - 1) * Number(limit);
  const items = users
    .sort((a: any, b: any) => b.created_at - a.created_at)
    .slice(offset, offset + Number(limit))
    .map((u: any) => ({
      ...u,
      filter_prefs: typeof u.filter_prefs === "string" ? JSON.parse(u.filter_prefs || "{}") : u.filter_prefs,
      api_keys: typeof u.api_keys === "string" ? JSON.parse(u.api_keys || "[]") : u.api_keys,
    }));

  res.json({ total, items });
});

app.get("/api/admin/users/:uid", authorizeAdmin, (req, res) => {
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.params.uid) as any;
  if (!u) return res.status(404).json({ error: "Not found" });
  const trades = db.prepare("SELECT * FROM trades WHERE userId=? ORDER BY created_at DESC LIMIT 50").all(req.params.uid) as any[];
  res.json({
    ...u,
    filter_prefs: typeof u.filter_prefs === "string" ? JSON.parse(u.filter_prefs || "{}") : u.filter_prefs,
    api_keys: typeof u.api_keys === "string" ? JSON.parse(u.api_keys || "[]") : u.api_keys,
    trade_history: trades.map((t: any) => ({ ...t, fees: typeof t.fees === "string" ? JSON.parse(t.fees || "{}") : t.fees })),
  });
});

app.post("/api/admin/users/:uid/vip", authorizeAdmin, (req, res) => {
  const { action, plan = "month" } = req.body;
  const dur: any = { week: 604800, month: 2592000, year: 31536000, lifetime: 99 * 365 * 86400 };
  if (action === "grant") {
    const expires = Math.floor(Date.now() / 1000) + (dur[plan] || dur.month);
    db.prepare("UPDATE users SET vip=1,vip_expires=? WHERE id=?").run(expires, req.params.uid);
  } else {
    db.prepare("UPDATE users SET vip=0,vip_expires=NULL WHERE id=?").run(req.params.uid);
  }
  res.json({ ok: true });
});

app.post("/api/admin/users/:uid/balance", authorizeAdmin, (req, res) => {
  const { amount } = req.body;
  if (typeof amount !== "number") return res.status(400).json({ error: "amount required" });
  db.prepare("UPDATE users SET balance=? WHERE id=?").run(amount, req.params.uid);
  res.json({ ok: true });
});

app.post("/api/admin/users/:uid/block", authorizeAdmin, (req, res) => {
  const { action } = req.body;
  db.prepare("UPDATE users SET blocked=? WHERE id=?").run(action === "block" ? 1 : 0, req.params.uid);
  res.json({ ok: true });
});

app.post("/api/admin/users/:uid/notify", authorizeAdmin, (req, res) => {
  const validation = notificationSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ error: validation.error });
  const n = {
    id: Math.random().toString(36).substring(2, 9),
    userId: req.params.uid,
    message: validation.data.message,
    created_at: Math.floor(Date.now() / 1000),
  };
  db.prepare("INSERT INTO notifications (id,userId,message,created_at) VALUES (?,?,?,?)").run(n.id, n.userId, n.message, n.created_at);
  io.emit(`notify:${req.params.uid}`, n);
  res.json({ ok: true });
});

app.post("/api/admin/broadcast", authorizeAdmin, (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "message required" });
  const users = db.prepare("SELECT id FROM users WHERE blocked=0").all() as any[];
  const stmt = db.prepare("INSERT INTO notifications (id,userId,message,created_at) VALUES (?,?,?,?)");
  const now = Math.floor(Date.now() / 1000);
  for (const u of users) {
    const id = Math.random().toString(36).substring(2, 9);
    stmt.run(id, u.id, message, now);
    io.emit(`notify:${u.id}`, { id, userId: u.id, message, created_at: now });
  }
  res.json({ ok: true, sent: users.length });
});

app.get("/api/admin/config", authorizeAdmin, (_req, res) => res.json(getConfig()));

app.post("/api/admin/config", authorizeAdmin, (req, res) => {
  db.prepare('INSERT OR REPLACE INTO config (key,value) VALUES (?,?)').run("settings", JSON.stringify(req.body));
  res.json({ ok: true });
});

// Admin HTML panel
app.get(`/admin-${ADMIN_SECRET}`, (_req, res) => {
  const filePath = path.resolve(__dirname, "admin.html");
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send("Admin panel file not found");
  }
});

// ── Real-time scanner ───────────────────────────────────────
const CEX_IDS = ["binance", "okx", "bybit", "kraken"];
const exchanges = CEX_IDS.map((id) => {
  try { return new (ccxt as any)[id]({ enableRateLimit: true }); }
  catch { return null; }
}).filter(Boolean);

const cexPrices: any = {};

async function scanRealMarkets() {
  const syms = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT"];
  const sigs: any[] = [];

  for (const sym of syms) {
    const prices: any[] = [];
    await Promise.all(
      exchanges.map(async (ex: any) => {
        try {
          const ticker = await ex.fetchTicker(sym);
          prices.push({ exchange: ex.id, bid: ticker.bid, ask: ticker.ask, price: ticker.last });
          if (!cexPrices[ex.id]) cexPrices[ex.id] = {};
          cexPrices[ex.id][sym.split("/")[0]] = { exchange: ex.id, pair: sym, bid: ticker.bid, ask: ticker.ask, price: ticker.last };
        } catch { /* skip */ }
      })
    );

    for (const p1 of prices) {
      for (const p2 of prices) {
        if (p1.exchange === p2.exchange || !p1.ask || !p2.bid) continue;
        const spread = ((p2.bid - p1.ask) / p1.ask) * 100;
        if (spread > 0.05) {
          sigs.push({
            id: `cex-${sym}-${p1.exchange}-${p2.exchange}-${Date.now()}`,
            type: "cex", sym, bx: p1.exchange, sx: p2.exchange,
            spread: +spread.toFixed(4), net: +(spread - 0.12).toFixed(4),
            buyPrice: +p1.ask.toFixed(6), sellPrice: +p2.bid.toFixed(6),
            aiScore: Math.floor(Math.random() * 30) + 65,
            hot: spread > 0.3,
            ts: Date.now(),
          });
        }
      }
    }
  }

  // Triangular signals
  Object.entries(TRI_CHAINS).forEach(([ex, chains]) => {
    chains.forEach((chain) => {
      const spread = Math.random() * 0.45 + 0.05;
      if (spread > 0.1) {
        sigs.push({
          id: `tri-${ex}-${chain[0]}-${Date.now()}`,
          type: "tri", sym: chain.join("→"), bx: ex, sx: ex,
          spread: +spread.toFixed(4), net: +(spread - 0.08).toFixed(4),
          buyPrice: 0, sellPrice: 0,
          aiScore: Math.floor(Math.random() * 25) + 70,
          hot: spread > 0.3,
          vipOnly: false,
          ts: Date.now(),
        });
      }
    });
  });

  return sigs.sort((a, b) => b.net - a.net).slice(0, 60);
}

setInterval(async () => {
  try {
    const sigs = await scanRealMarkets();
    io.emit("signals", sigs);
    io.emit("prices", Object.values(cexPrices).flatMap((ex: any) => Object.values(ex)));
  } catch (e) {
    logger.error({ err: e }, "Market scan error");
  }
}, 5000);

// ── Socket.IO ───────────────────────────────────────────────
io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId as string;
  if (userId) {
    db.prepare("UPDATE users SET last_seen=? WHERE id=?").run(Math.floor(Date.now() / 1000), userId);
    socket.join(`user_${userId}`);
  }
  socket.emit("meta", {
    exchanges: ALL_EXCHANGES,
    networks: ALL_NETWORKS,
    tokenCount: Object.keys(realPrices).length,
  });
});

// ── Static / Vite ───────────────────────────────────────────
if (process.env.NODE_ENV !== "production") {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(__dirname, "dist")));
  app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));
}

// ── Error handler ───────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(err);
  res.status(500).json({ error: "Internal Server Error" });
});

// ── Start ───────────────────────────────────────────────────
server.listen(PORT, "0.0.0.0", () => {
  logger.info(`✅ NEXARB :${PORT} | Admin: /admin-${ADMIN_SECRET} | DB: ${DB_PATH}`);
});
