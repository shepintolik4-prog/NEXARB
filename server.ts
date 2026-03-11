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
  const io = new Server(server, {
    cors: {
      origin: "*",
    },
  });

  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // --- DATABASE MOCK (In production use SQLite or MongoDB) ---
  let db = {
    users: {} as any,
    trades: [] as any[],
    config: {
      fee_free: 0.008,
      fee_vip: 0.003,
      demo_mode: true,
      free_trades_max: 5
    }
  };

  // Helper to get or create user
  const getUser = (userId: string) => {
    if (!db.users[userId]) {
      db.users[userId] = {
        id: userId,
        balance: 3000,
        profit: 0,
        trades: 0,
        vip: userId === "demo_user", // Demo user is VIP by default
        vip_expires: userId === "demo_user" ? Date.now() / 1000 + 31536000 : null,
        connected_exchanges: ['binance', 'okx'],
        ref_code: 'REF' + Math.random().toString(36).substring(7).toUpperCase()
      };
    }
    return db.users[userId];
  };

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString(), demo: db.config.demo_mode });
  });

  // Account Info
  app.get("/api/v1/account", (req, res) => {
    const userId = req.query.userId as string || "demo_user";
    res.json(getUser(userId));
  });

  // Submit Trade
  app.post("/api/v1/trades", (req, res) => {
    const { userId, symbol, amount, spread, buyExchange, sellExchange, type } = req.body;
    const user = getUser(userId || "demo_user");

    if (!user.vip && user.trades >= db.config.free_trades_max) {
      return res.status(403).json({ error: "Free limit reached" });
    }

    const feeRate = user.vip ? db.config.fee_vip : db.config.fee_free;
    const platformFee = amount * feeRate;
    const netProfit = (amount * (spread / 100)) - platformFee;

    user.balance += netProfit;
    user.profit += netProfit;
    user.trades += 1;

    const trade = {
      id: Math.random().toString(36).substring(7),
      userId: user.id,
      symbol,
      amount,
      netProfit,
      platformFee,
      spread,
      buyExchange,
      sellExchange,
      type,
      status: 'completed',
      created_at: Date.now() / 1000
    };

    db.trades.push(trade);
    res.json({ ...trade, newBalance: user.balance });
  });

  // VIP Subscription
  app.post("/api/v1/vip/subscribe", (req, res) => {
    const { userId, plan } = req.body;
    const user = getUser(userId || "demo_user");
    user.vip = true;
    user.vip_expires = Date.now() + (plan === 'year' ? 31536000000 : 2592000000);
    res.json({ ok: true, expires_at: user.vip_expires / 1000 });
  });

  // Admin Stats
  app.get("/api/admin/stats", (req, res) => {
    const totalUsers = Object.keys(db.users).length;
    const totalTrades = db.trades.length;
    const totalVolume = db.trades.reduce((a, b) => a + b.amount, 0);
    const platformFees = db.trades.reduce((a, b) => a + b.platformFee, 0);

    res.json({
      total_users: totalUsers,
      total_trades: totalTrades,
      total_volume: totalVolume,
      platform_fees: platformFees,
      vip_users: Object.values(db.users).filter((u: any) => u.vip).length,
      trades_24h: db.trades.filter(t => t.created_at > (Date.now()/1000 - 86400)).length,
      top_symbols: [],
      top_exchanges: []
    });
  });

  // Admin Config
  app.post("/api/admin/config", (req, res) => {
    db.config = { ...db.config, ...req.body };
    res.json({ ok: true });
  });

  // Mock Price Feed Logic (In real app, this would connect to exchanges)
  const SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'MATIC', 'DOT'];
  const EXCHANGES = ['binance', 'okx', 'bybit', 'coinbase', 'kraken'];
  
  const prices: any = {};

  function generateMockPrices() {
    SYMBOLS.forEach(sym => {
      EXCHANGES.forEach(ex => {
        if (!prices[ex]) prices[ex] = {};
        const basePrice = sym === 'BTC' ? 65000 : sym === 'ETH' ? 3500 : 100;
        const randomChange = (Math.random() - 0.5) * 2;
        const price = basePrice + randomChange;
        prices[ex][sym] = {
          exchange: ex,
          pair: `${sym}/USDT`,
          bid: price - 0.05,
          ask: price + 0.05,
          vol: Math.random() * 1000,
          ts: Date.now()
        };
      });
    });
  }

  setInterval(() => {
    generateMockPrices();
    const allPrices = Object.values(prices).flatMap((ex: any) => Object.values(ex));
    io.emit("prices", allPrices);

    // Simple Arbitrage Finder
    const signals: any[] = [];
    SYMBOLS.forEach(sym => {
      const symPrices = EXCHANGES.map(ex => prices[ex]?.[sym]).filter(Boolean);
      if (symPrices.length < 2) return;

      symPrices.forEach(p1 => {
        symPrices.forEach(p2 => {
          if (p1.exchange === p2.exchange) return;
          const spread = (p2.bid - p1.ask) / p1.ask * 100;
          if (spread > 0.1) {
            signals.push({
              id: `${sym}-${p1.exchange}-${p2.exchange}-${Date.now()}`,
              type: 'cex',
              sym: `${sym}/USDT`,
              bx: p1.exchange,
              sx: p2.exchange,
              spread: parseFloat(spread.toFixed(4)),
              net: parseFloat((spread - 0.2).toFixed(4)), // 0.2% fees
              buyPrice: p1.ask,
              sellPrice: p2.bid,
              ts: Date.now(),
              aiScore: Math.floor(Math.random() * 40) + 60,
              hot: spread > 0.5
            });
          }
        });
      });
    });
    
    if (signals.length > 0) {
      io.emit("signals", signals.sort((a, b) => b.net - a.net).slice(0, 10));
    }
  }, 2000);

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    const allPrices = Object.values(prices).flatMap((ex: any) => Object.values(ex));
    socket.emit("prices", allPrices);
  });

  // Vite middleware for development
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
