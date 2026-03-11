import express from "express";
import { createServer as createViteServer } from "vite";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: "*" } });

  const PORT = Number(process.env.PORT) || 3000;
  app.use(express.json());

  // ── DATABASE MOCK ──────────────────────────────────────────
  let db = {
    users: {} as any,
    trades: [] as any[],
    config: {
      fee_free: 0.008,
      fee_vip: 0.003,
      demo_mode: true,
      free_trades_max: 5,
    },
  };

  const getUser = (userId: string) => {
    if (!db.users[userId]) {
      db.users[userId] = {
        id: userId,
        balance: 3000,
        profit: 0,
        trades: 0,
        vip: userId === "demo_user",
        vip_expires: userId === "demo_user" ? Date.now() / 1000 + 31536000 : null,
        connected_exchanges: ["binance", "okx"],
        ref_code: "REF" + Math.random().toString(36).substring(7).toUpperCase(),
      };
    }
    return db.users[userId];
  };

  // ── API ROUTES ─────────────────────────────────────────────
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString(), demo: db.config.demo_mode });
  });

  app.get("/api/v1/account", (req, res) => {
    const userId = (req.query.userId as string) || "demo_user";
    res.json(getUser(userId));
  });

  app.post("/api/v1/trades", (req, res) => {
    const { userId, symbol, amount, spread, buyExchange, sellExchange, type } = req.body;
    const user = getUser(userId || "demo_user");

    if (!user.vip && user.trades >= db.config.free_trades_max) {
      return res.status(403).json({ error: "Free limit reached" });
    }

    const feeRate = user.vip ? db.config.fee_vip : db.config.fee_free;
    const platformFee = amount * feeRate;
    const netProfit = amount * (spread / 100) - platformFee;

    user.balance += netProfit;
    user.profit += netProfit;
    user.trades += 1;

    const trade = {
      id: Math.random().toString(36).substring(7),
      userId: user.id,
      symbol, amount, netProfit, platformFee, spread,
      buyExchange, sellExchange, type,
      status: "completed",
      created_at: Date.now() / 1000,
    };

    db.trades.push(trade);
    res.json({ ...trade, newBalance: user.balance });
  });

  app.post("/api/v1/vip/subscribe", (req, res) => {
    const { userId, plan } = req.body;
    const user = getUser(userId || "demo_user");
    user.vip = true;
    user.vip_expires = Date.now() + (plan === "year" ? 31536000000 : plan === "month" ? 2592000000 : 604800000);
    res.json({ ok: true, expires_at: user.vip_expires / 1000 });
  });

  app.get("/api/admin/stats", (req, res) => {
    res.json({
      total_users: Object.keys(db.users).length,
      total_trades: db.trades.length,
      total_volume: db.trades.reduce((a, b) => a + b.amount, 0),
      platform_fees: db.trades.reduce((a, b) => a + b.platformFee, 0),
      vip_users: Object.values(db.users).filter((u: any) => u.vip).length,
      trades_24h: db.trades.filter((t) => t.created_at > Date.now() / 1000 - 86400).length,
      top_symbols: [],
      top_exchanges: [],
    });
  });

  app.post("/api/admin/config", (req, res) => {
    db.config = { ...db.config, ...req.body };
    res.json({ ok: true });
  });

  // ── PRICE FEED ─────────────────────────────────────────────
  const CEX_SYMBOLS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "MATIC", "DOT", "TON", "TRX"];
  const CEX_EXCHANGES = ["binance", "okx", "bybit", "coinbase", "kraken", "kucoin", "gate", "mexc"];

  const DEX_NETWORKS = ["ethereum", "bsc", "solana", "arbitrum", "optimism", "ton", "tron"];
  const DEX_PAIRS: Record<string, string[]> = {
    ethereum: ["ETH/USDT", "WBTC/ETH", "LINK/ETH", "UNI/ETH", "AAVE/ETH"],
    bsc:      ["BNB/USDT", "CAKE/BNB", "ETH/USDT", "XRP/USDT", "DOGE/USDT"],
    solana:   ["SOL/USDT", "JUP/SOL", "BONK/SOL", "WIF/SOL", "JTO/SOL"],
    arbitrum: ["ETH/USDT", "ARB/ETH", "GMX/ETH", "LINK/USDT"],
    optimism: ["ETH/USDT", "OP/ETH", "VELO/ETH"],
    ton:      ["TON/USDT", "STON/TON"],
    tron:     ["TRX/USDT", "SUN/TRX", "JST/TRX"],
  };

  const TRI_CHAINS: Record<string, string[][]> = {
    binance: [
      ["BTC/USDT", "ETH/BTC", "ETH/USDT"],
      ["BNB/USDT", "ETH/BNB", "ETH/USDT"],
      ["BTC/USDT", "SOL/BTC", "SOL/USDT"],
      ["BNB/USDT", "SOL/BNB", "SOL/USDT"],
      ["BTC/USDT", "XRP/BTC", "XRP/USDT"],
    ],
    okx: [
      ["BTC/USDT", "ETH/BTC", "ETH/USDT"],
      ["BTC/USDT", "SOL/BTC", "SOL/USDT"],
    ],
  };

  const CROSS_ROUTES = [
    { from: "ethereum", to: "bsc",      sym: "USDT", bridge: "Stargate" },
    { from: "ethereum", to: "arbitrum", sym: "ETH",  bridge: "Hop" },
    { from: "bsc",      to: "solana",   sym: "USDT", bridge: "Wormhole" },
    { from: "ethereum", to: "ton",      sym: "USDT", bridge: "TonBridge" },
    { from: "ethereum", to: "tron",     sym: "USDT", bridge: "MultiChain" },
    { from: "solana",   to: "arbitrum", sym: "USDT", bridge: "Wormhole" },
    { from: "bsc",      to: "tron",     sym: "USDT", bridge: "AnySwap" },
    { from: "optimism", to: "arbitrum", sym: "ETH",  bridge: "Across" },
  ];

  const prices: any = {};
  const dexPrices: any = {};

  function getBase(sym: string): number {
    const bases: Record<string, number> = {
      BTC: 65000, ETH: 3500, SOL: 180, BNB: 420, XRP: 0.6,
      DOGE: 0.18, ADA: 0.55, AVAX: 40, MATIC: 0.9, DOT: 8,
      TON: 7, TRX: 0.12, LINK: 18, UNI: 11, ARB: 1.2,
      JUP: 1.1, WIF: 2.8, BONK: 0.00003, JTO: 3.5, OP: 2.1,
    };
    return bases[sym] ?? 1;
  }

  function generateCexPrices() {
    CEX_SYMBOLS.forEach((sym) => {
      CEX_EXCHANGES.forEach((ex) => {
        if (!prices[ex]) prices[ex] = {};
        const base = getBase(sym);
        const drift = (Math.random() - 0.5) * base * 0.004;
        const mid = base + drift;
        prices[ex][sym] = {
          exchange: ex,
          pair: `${sym}/USDT`,
          bid: mid - mid * 0.0002,
          ask: mid + mid * 0.0002,
          vol: Math.random() * 1000,
          ts: Date.now(),
        };
      });
    });
  }

  function generateDexPrices() {
    DEX_NETWORKS.forEach((net) => {
      if (!dexPrices[net]) dexPrices[net] = {};
      (DEX_PAIRS[net] || []).forEach((pair) => {
        const sym = pair.split("/")[0];
        const base = getBase(sym);
        const drift = (Math.random() - 0.5) * base * 0.006; // DEX has more slippage
        dexPrices[net][pair] = {
          network: net,
          pair,
          price: base + drift,
          liquidity: Math.random() * 5000000,
          ts: Date.now(),
        };
      });
    });
  }

  function buildSignals(): any[] {
    const signals: any[] = [];

    // ── CEX signals ─────────────────────────────
    CEX_SYMBOLS.forEach((sym) => {
      const symPrices = CEX_EXCHANGES.map((ex) => prices[ex]?.[sym]).filter(Boolean);
      if (symPrices.length < 2) return;
      symPrices.forEach((p1) => {
        symPrices.forEach((p2) => {
          if (p1.exchange === p2.exchange) return;
          const spread = ((p2.bid - p1.ask) / p1.ask) * 100;
          if (spread > 0.08) {
            signals.push({
              id: `cex-${sym}-${p1.exchange}-${p2.exchange}-${Date.now()}`,
              type: "cex",
              sym: `${sym}/USDT`,
              bx: p1.exchange, sx: p2.exchange,
              spread: parseFloat(spread.toFixed(4)),
              net: parseFloat((spread - 0.15).toFixed(4)),
              buyPrice: p1.ask, sellPrice: p2.bid,
              ts: Date.now(),
              aiScore: Math.floor(Math.random() * 30) + 65,
              hot: spread > 0.4,
            });
          }
        });
      });
    });

    // ── Triangular signals ───────────────────────
    Object.entries(TRI_CHAINS).forEach(([exchange, chains]) => {
      chains.forEach((chain) => {
        const spread = Math.random() * 0.4 + 0.05;
        if (spread > 0.1) {
          const sym = chain[0].split("/")[0];
          signals.push({
            id: `tri-${exchange}-${sym}-${Date.now()}-${Math.random()}`,
            type: "tri",
            sym: chain.join(" → "),
            bx: exchange, sx: exchange,
            spread: parseFloat(spread.toFixed(4)),
            net: parseFloat((spread - 0.09).toFixed(4)),
            buyPrice: 0, sellPrice: 0,
            ts: Date.now(),
            aiScore: Math.floor(Math.random() * 25) + 70,
            hot: spread > 0.35,
            vipOnly: true,
          });
        }
      });
    });

    // ── DEX signals ──────────────────────────────
    DEX_NETWORKS.forEach((net) => {
      const netPairs = Object.keys(dexPrices[net] || {});
      netPairs.forEach((pair) => {
        // Compare price with CEX equivalent
        const sym = pair.split("/")[0];
        const cexPrice = prices["binance"]?.[sym]?.ask;
        const dexPrice = dexPrices[net]?.[pair]?.price;
        if (!cexPrice || !dexPrice) return;
        const spread = Math.abs((dexPrice - cexPrice) / cexPrice) * 100;
        if (spread > 0.2) {
          const buyCex = dexPrice > cexPrice;
          signals.push({
            id: `dex-${net}-${pair}-${Date.now()}-${Math.random()}`,
            type: "dex",
            sym: pair,
            bx: buyCex ? "binance" : net,
            sx: buyCex ? net : "binance",
            spread: parseFloat(spread.toFixed(4)),
            net: parseFloat((spread - 0.3).toFixed(4)),
            buyPrice: buyCex ? cexPrice : dexPrice,
            sellPrice: buyCex ? dexPrice : cexPrice,
            ts: Date.now(),
            aiScore: Math.floor(Math.random() * 25) + 60,
            hot: spread > 0.8,
            vipOnly: true,
            network: net,
          });
        }
      });
    });

    // ── Cross-chain signals ──────────────────────
    CROSS_ROUTES.forEach((route) => {
      const spread = Math.random() * 1.5 + 0.3;
      if (spread > 0.5) {
        signals.push({
          id: `cross-${route.from}-${route.to}-${Date.now()}-${Math.random()}`,
          type: "cross",
          sym: `${route.sym} (${route.bridge})`,
          bx: route.from, sx: route.to,
          spread: parseFloat(spread.toFixed(4)),
          net: parseFloat((spread - 0.5).toFixed(4)),
          buyPrice: 0, sellPrice: 0,
          ts: Date.now(),
          aiScore: Math.floor(Math.random() * 20) + 55,
          hot: spread > 1.2,
          vipOnly: true,
          bridge: route.bridge,
        });
      }
    });

    return signals
      .sort((a, b) => b.net - a.net)
      .slice(0, 20);
  }

  // ── EMIT LOOP ──────────────────────────────────────────────
  setInterval(() => {
    generateCexPrices();
    generateDexPrices();

    const allCexPrices = Object.values(prices).flatMap((ex: any) => Object.values(ex));
    io.emit("prices", allCexPrices);

    const signals = buildSignals();
    if (signals.length > 0) io.emit("signals", signals);
  }, 2000);

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    generateCexPrices();
    generateDexPrices();
    const allCexPrices = Object.values(prices).flatMap((ex: any) => Object.values(ex));
    socket.emit("prices", allCexPrices);
    const signals = buildSignals();
    socket.emit("signals", signals);
  });

  // ── STATIC / VITE ──────────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
