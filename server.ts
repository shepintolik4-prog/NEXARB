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

  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
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
