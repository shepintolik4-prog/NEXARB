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

const ADMIN_SECRET = process.env.ADMIN_SECRET || "nexarb-admin-2025";

// ── REAL PRICES (CoinGecko) ────────────────────────────────
let realPrices: Record<string, number> = {
  BTC: 83000, ETH: 2000, SOL: 130, BNB: 590, XRP: 2.3,
  DOGE: 0.175, ADA: 0.72, AVAX: 22, MATIC: 0.5, DOT: 6.5,
  TON: 4.2, TRX: 0.22, LINK: 13, UNI: 6, ARB: 0.42,
};

async function fetchRealPrices() {
  try {
    const ids = "bitcoin,ethereum,solana,binancecoin,ripple,dogecoin,cardano,avalanche-2,matic-network,polkadot,the-open-network,tron,chainlink,uniswap,arbitrum";
    const syms = ["BTC","ETH","SOL","BNB","XRP","DOGE","ADA","AVAX","MATIC","DOT","TON","TRX","LINK","UNI","ARB"];
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
    const data = await res.json();
    const map: Record<string,string> = {
      bitcoin:"BTC", ethereum:"ETH", solana:"SOL", binancecoin:"BNB", ripple:"XRP",
      dogecoin:"DOGE", cardano:"ADA", "avalanche-2":"AVAX", "matic-network":"MATIC",
      polkadot:"DOT", "the-open-network":"TON", tron:"TRX", chainlink:"LINK",
      uniswap:"UNI", arbitrum:"ARB",
    };
    Object.entries(data).forEach(([id, val]: [string, any]) => {
      if (map[id] && val?.usd) realPrices[map[id]] = val.usd;
    });
    console.log("✅ Real prices updated:", Object.keys(realPrices).length, "coins");
  } catch (e) {
    console.log("⚠️ CoinGecko unavailable, using cached prices");
  }
}

// Fetch real prices on start, then every 60s
fetchRealPrices();
setInterval(fetchRealPrices, 60000);

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: "*" } });
  const PORT = Number(process.env.PORT) || 3000;
  app.use(express.json());
  app.use(express.static(path.join(__dirname)));

  // ── DB ─────────────────────────────────────────────────────
  let db: {
    users: Record<string, any>;
    trades: any[];
    notifications: any[];
    config: Record<string, any>;
  } = {
    users: {},
    trades: [],
    notifications: [],
    config: {
      // Fees
      fee_free: 0.008,
      fee_vip: 0.003,
      exchange_fee: 0.001,
      network_fee_cross: 0.002,
      network_fee_dex: 0.003,
      slippage_dex: 0.001,
      referral_pct: 0.1,
      // Free limits
      free_signals_max: 3,        // сколько сигналов видит free-юзер
      free_trades_max: 5,         // сделок в день
      free_exchanges_max: 2,      // бирж можно подключить
      free_strategies: "cex",     // доступные стратегии
      // Trade limits
      min_trade_amount: 10,
      max_trade_amount: 100000,
      // Platform
      demo_mode: true,
      maintenance: false,
    },
  };

  // Seed demo users
  const seedUsers = () => {
    const demos = [
      { id:"demo_user", balance:3000, profit:142.5, trades:12, vip:true  },
      { id:"tg_111111", balance:1500, profit:48.2,  trades:7,  vip:false },
      { id:"tg_222222", balance:5000, profit:310.8, trades:31, vip:true  },
      { id:"tg_333333", balance:800,  profit:12.1,  trades:3,  vip:false },
      { id:"tg_444444", balance:2200, profit:95.0,  trades:18, vip:true  },
    ];
    demos.forEach((d, i) => {
      if (!db.users[d.id]) {
        db.users[d.id] = {
          ...d,
          vip_expires: d.vip ? Date.now()/1000 + 86400*30 : null,
          connected_exchanges: d.vip ? ["binance","okx","bybit"] : ["binance","okx"],
          ref_code: "REF" + d.id.slice(-4).toUpperCase(),
          blocked: false,
          created_at: Date.now()/1000 - i * 86400,
          last_seen: Date.now()/1000 - i * 1800,
          online: i < 2,
        };
      }
    });
    // Seed trades
    if (db.trades.length === 0) {
      const types = ["cex","tri","dex","cross"];
      const syms = ["BTC/USDT","ETH/USDT","SOL/USDT","BNB/USDT","XRP/USDT"];
      const userIds = ["demo_user","tg_111111","tg_222222","tg_333333","tg_444444"];
      for (let i = 0; i < 40; i++) {
        const type = types[i % 4];
        const amount = 100 + Math.random() * 900;
        const spread = 0.1 + Math.random() * 0.6;
        const pFee = amount * 0.005;
        const nFee = type==="cross" ? amount*0.002 : type==="dex" ? amount*0.003 : 0;
        db.trades.push({
          id: `seed-${i}`, userId: userIds[i % 5],
          symbol: syms[i % 5], amount, spread, type,
          buyExchange:"binance", sellExchange:"okx",
          grossProfit: amount*(spread/100),
          netProfit: amount*(spread/100) - pFee - nFee,
          fees: { platform:pFee, network:nFee, exchangeA:amount*0.001, exchangeB:amount*0.001, slippage:type==="dex"?amount*0.001:0 },
          totalFees: pFee + nFee + amount*0.002,
          status:"completed",
          created_at: Date.now()/1000 - (40-i) * 3200,
        });
      }
    }
  };
  seedUsers();

  const getUser = (userId: string) => {
    if (!db.users[userId]) {
      db.users[userId] = {
        id: userId, balance: 3000, profit: 0, trades: 0,
        vip: userId === "demo_user",
        vip_expires: userId === "demo_user" ? Date.now()/1000 + 31536000 : null,
        connected_exchanges: ["binance"],
        ref_code: "REF" + Math.random().toString(36).substring(7).toUpperCase(),
        blocked: false, created_at: Date.now()/1000,
        last_seen: Date.now()/1000, online: false,
      };
    }
    db.users[userId].last_seen = Date.now()/1000;
    return db.users[userId];
  };

  const adminAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const secret = req.headers["x-admin-secret"] || req.query.secret;
    if (secret !== ADMIN_SECRET) return res.status(403).json({ error:"Forbidden" });
    next();
  };

  // ── PUBLIC API ─────────────────────────────────────────────
  app.get("/api/health", (_req, res) => res.json({ status:"ok", timestamp:new Date().toISOString() }));

  app.get("/api/v1/account", (req, res) => {
    const user = getUser((req.query.userId as string)||"demo_user");
    if (user.blocked) return res.status(403).json({ error:"Аккаунт заблокирован" });
    user.online = true;
    // Also send free-limits from config so frontend knows
    res.json({
      ...user,
      limits: {
        signals_max: user.vip ? 999 : db.config.free_signals_max,
        trades_max: user.vip ? 999 : db.config.free_trades_max,
        exchanges_max: user.vip ? 999 : db.config.free_exchanges_max,
        strategies: user.vip ? "all" : db.config.free_strategies,
      }
    });
  });

  app.post("/api/v1/trades", (req, res) => {
    const { userId, symbol, amount, spread, buyExchange, sellExchange, type } = req.body;
    const user = getUser(userId||"demo_user");

    if (user.blocked) return res.status(403).json({ error:"Аккаунт заблокирован" });
    if (!user.vip && user.trades >= db.config.free_trades_max)
      return res.status(403).json({ error:`Лимит ${db.config.free_trades_max} сделок для Free плана. Обновитесь до VIP.` });

    const cfg = db.config;
    const feeRate      = user.vip ? cfg.fee_vip : cfg.fee_free;
    const platformFee  = amount * feeRate;
    const networkFee   = type==="cross" ? amount*cfg.network_fee_cross : type==="dex" ? amount*cfg.network_fee_dex : 0;
    const exchangeFeeA = amount * cfg.exchange_fee;
    const exchangeFeeB = amount * cfg.exchange_fee;
    const slippage     = type==="dex" ? amount*cfg.slippage_dex : 0;
    const totalFees    = platformFee + networkFee + exchangeFeeA + exchangeFeeB + slippage;
    const grossProfit  = amount * (spread/100);
    const netProfit    = grossProfit - totalFees;

    user.balance += netProfit;
    user.profit  += netProfit;
    user.trades  += 1;

    const trade = {
      id: Math.random().toString(36).substring(7),
      userId:user.id, symbol, amount, spread, type,
      buyExchange, sellExchange, grossProfit, netProfit, totalFees,
      fees: { platform:platformFee, network:networkFee, exchangeA:exchangeFeeA, exchangeB:exchangeFeeB, slippage },
      feeRates: { platform:feeRate, network:type==="cross"?cfg.network_fee_cross:type==="dex"?cfg.network_fee_dex:0, exchange:cfg.exchange_fee, slippage:type==="dex"?cfg.slippage_dex:0 },
      status:"completed", created_at:Date.now()/1000,
    };
    db.trades.push(trade);
    res.json({ ...trade, newBalance:user.balance });
  });

  app.post("/api/v1/vip/subscribe", (req, res) => {
    const { userId, plan } = req.body;
    const user = getUser(userId||"demo_user");
    user.vip = true;
    const dur: Record<string,number> = { week:604800, month:2592000, year:31536000 };
    user.vip_expires = Date.now()/1000 + (dur[plan]||dur.month);
    res.json({ ok:true, expires_at:user.vip_expires });
  });

  // ── ADMIN API ──────────────────────────────────────────────
  app.get("/api/admin/stats", adminAuth, (_req, res) => {
    const users = Object.values(db.users);
    const now = Date.now()/1000;

    const daily: Record<string,{fees:number;volume:number;trades:number}> = {};
    for (let i=13;i>=0;i--) {
      const d = new Date(Date.now()-i*86400000).toISOString().slice(0,10);
      daily[d] = {fees:0, volume:0, trades:0};
    }
    db.trades.forEach(t => {
      const d = new Date(t.created_at*1000).toISOString().slice(0,10);
      if (daily[d]) { daily[d].fees+=t.fees?.platform||0; daily[d].volume+=t.amount||0; daily[d].trades++; }
    });

    const byStrategy: Record<string,{count:number;volume:number;fees:number}> = {
      cex:{count:0,volume:0,fees:0}, tri:{count:0,volume:0,fees:0},
      dex:{count:0,volume:0,fees:0}, cross:{count:0,volume:0,fees:0},
    };
    db.trades.forEach(t => {
      if (byStrategy[t.type]) {
        byStrategy[t.type].count++;
        byStrategy[t.type].volume += t.amount||0;
        byStrategy[t.type].fees   += t.fees?.platform||0;
      }
    });

    const sigCounts: Record<string,number> = {};
    db.trades.forEach(t => { const k=`${t.type}:${t.symbol}`; sigCounts[k]=(sigCounts[k]||0)+1; });
    const topSignals = Object.entries(sigCounts).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([key,count])=>({key,count}));

    res.json({
      total_users: users.length,
      online_users: users.filter(u=>u.last_seen>now-300).length,
      vip_users: users.filter(u=>u.vip).length,
      free_users: users.filter(u=>!u.vip).length,
      blocked_users: users.filter(u=>u.blocked).length,
      total_trades: db.trades.length,
      trades_24h: db.trades.filter(t=>t.created_at>now-86400).length,
      total_volume: db.trades.reduce((a,b)=>a+(b.amount||0),0),
      volume_24h: db.trades.filter(t=>t.created_at>now-86400).reduce((a,b)=>a+(b.amount||0),0),
      platform_fees_total: db.trades.reduce((a,b)=>a+(b.fees?.platform||0),0),
      platform_fees_24h: db.trades.filter(t=>t.created_at>now-86400).reduce((a,b)=>a+(b.fees?.platform||0),0),
      daily: Object.entries(daily).map(([date,v])=>({ date, fees:+v.fees.toFixed(2), volume:+v.volume.toFixed(2), trades:v.trades })),
      by_strategy: byStrategy,
      top_users: [...users].sort((a,b)=>b.profit-a.profit).slice(0,8).map(u=>({id:u.id,profit:u.profit,trades:u.trades,vip:u.vip,balance:u.balance})),
      top_signals: topSignals,
    });
  });

  app.get("/api/admin/users", adminAuth, (req, res) => {
    const { search, page="1", limit="25" } = req.query;
    let users = Object.values(db.users);
    if (search) { const q=(search as string).toLowerCase(); users=users.filter(u=>u.id.toLowerCase().includes(q)||u.ref_code?.toLowerCase().includes(q)); }
    const total=users.length;
    const offset=(Number(page)-1)*Number(limit);
    res.json({ total, items:users.sort((a,b)=>b.created_at-a.created_at).slice(offset,offset+Number(limit)) });
  });

  app.get("/api/admin/users/:uid", adminAuth, (req, res) => {
    const user=db.users[req.params.uid];
    if (!user) return res.status(404).json({error:"Не найден"});
    res.json({ ...user, trade_history:db.trades.filter(t=>t.userId===req.params.uid) });
  });

  app.post("/api/admin/users/:uid/vip", adminAuth, (req, res) => {
    const user=getUser(req.params.uid);
    const { action, plan } = req.body;
    const dur: Record<string,number> = { week:604800, month:2592000, year:31536000, lifetime:9999999999 };
    if (action==="grant") { user.vip=true; user.vip_expires=Date.now()/1000+(dur[plan||"month"]); }
    else { user.vip=false; user.vip_expires=null; }
    res.json({ ok:true, user });
  });

  app.post("/api/admin/users/:uid/block", adminAuth, (req, res) => {
    const user=getUser(req.params.uid);
    user.blocked = req.body.action==="block";
    res.json({ ok:true, blocked:user.blocked });
  });

  app.post("/api/admin/users/:uid/balance", adminAuth, (req, res) => {
    const user=getUser(req.params.uid);
    user.balance=Number(req.body.amount);
    res.json({ ok:true, balance:user.balance });
  });

  app.post("/api/admin/users/:uid/notify", adminAuth, (req, res) => {
    const notif={ id:Math.random().toString(36).substring(7), userId:req.params.uid, message:req.body.message, created_at:Date.now()/1000 };
    db.notifications.push(notif);
    io.emit(`notify:${req.params.uid}`, notif);
    res.json({ ok:true });
  });

  app.post("/api/admin/broadcast", adminAuth, (req, res) => {
    io.emit("broadcast",{message:req.body.message, created_at:Date.now()/1000});
    res.json({ ok:true });
  });

  app.get("/api/admin/config", adminAuth, (_req, res) => res.json(db.config));
  app.post("/api/admin/config", adminAuth, (req, res) => {
    db.config={...db.config,...req.body};
    res.json({ ok:true, config:db.config });
  });

  // ── ADMIN PANEL HTML ───────────────────────────────────────
  app.get(`/admin-${ADMIN_SECRET}`, (_req, res) => {
    res.sendFile(path.resolve(__dirname, "admin.html"));
  });

  // ── SIGNAL ENGINE ──────────────────────────────────────────
  const CEX_SYMBOLS = ["BTC","ETH","SOL","BNB","XRP","DOGE","ADA","AVAX","MATIC","DOT","TON","TRX"];
  const CEX_EXCHANGES = ["binance","okx","bybit","coinbase","kraken","kucoin","gate","mexc"];
  const DEX_NETWORKS = ["ethereum","bsc","solana","arbitrum","optimism","ton","tron"];
  const DEX_PAIRS: Record<string,string[]> = {
    ethereum:["ETH/USDT","WBTC/ETH","LINK/ETH","UNI/ETH"],
    bsc:["BNB/USDT","CAKE/BNB","ETH/USDT","XRP/USDT"],
    solana:["SOL/USDT","JUP/SOL","BONK/SOL","WIF/SOL"],
    arbitrum:["ETH/USDT","ARB/ETH","GMX/ETH"],
    optimism:["ETH/USDT","OP/ETH"],
    ton:["TON/USDT","STON/TON"],
    tron:["TRX/USDT","SUN/TRX"],
  };
  const TRI_CHAINS: Record<string,string[][]> = {
    binance:[["BTC/USDT","ETH/BTC","ETH/USDT"],["BNB/USDT","ETH/BNB","ETH/USDT"],["BTC/USDT","SOL/BTC","SOL/USDT"]],
    okx:[["BTC/USDT","ETH/BTC","ETH/USDT"]],
  };
  const CROSS_ROUTES = [
    {from:"ethereum",to:"bsc",sym:"USDT",bridge:"Stargate"},
    {from:"ethereum",to:"arbitrum",sym:"ETH",bridge:"Hop"},
    {from:"bsc",to:"solana",sym:"USDT",bridge:"Wormhole"},
    {from:"ethereum",to:"ton",sym:"USDT",bridge:"TonBridge"},
    {from:"solana",to:"arbitrum",sym:"USDT",bridge:"Wormhole"},
  ];

  const cexPrices: any = {};
  const dexP: any = {};

  // Use real price as base, add small exchange spread
  function getBase(sym: string) { return realPrices[sym] ?? 1; }

  function genCex() {
    CEX_SYMBOLS.forEach(sym => {
      const base = getBase(sym);
      CEX_EXCHANGES.forEach(ex => {
        if (!cexPrices[ex]) cexPrices[ex] = {};
        // Each exchange has slight drift from real price
        const drift = (Math.random()-0.5) * base * 0.003;
        const mid = base + drift;
        cexPrices[ex][sym] = {
          exchange:ex, pair:`${sym}/USDT`,
          bid: mid * (1 - 0.0002),
          ask: mid * (1 + 0.0002),
          vol: Math.random()*1000, ts:Date.now(),
        };
      });
    });
  }

  function genDex() {
    DEX_NETWORKS.forEach(net => {
      if (!dexP[net]) dexP[net] = {};
      (DEX_PAIRS[net]||[]).forEach(pair => {
        const sym = pair.split("/")[0];
        const base = getBase(sym);
        // DEX slightly different from CEX
        dexP[net][pair] = { network:net, pair, price:base+(Math.random()-0.5)*base*0.005, ts:Date.now() };
      });
    });
  }

  function buildSignals() {
    const sigs: any[] = [];
    CEX_SYMBOLS.forEach(sym => {
      const sp = CEX_EXCHANGES.map(ex=>cexPrices[ex]?.[sym]).filter(Boolean);
      sp.forEach(p1 => sp.forEach(p2 => {
        if (p1.exchange===p2.exchange) return;
        const spread = ((p2.bid-p1.ask)/p1.ask)*100;
        if (spread > 0.06) sigs.push({
          id:`cex-${sym}-${p1.exchange}-${p2.exchange}`,
          type:"cex", sym:`${sym}/USDT`,
          bx:p1.exchange, sx:p2.exchange,
          spread:+spread.toFixed(4), net:+(spread-0.12).toFixed(4),
          buyPrice:p1.ask, sellPrice:p2.bid,
          ts:Date.now(), aiScore:Math.floor(Math.random()*30)+65, hot:spread>0.35,
        });
      }));
    });
    Object.entries(TRI_CHAINS).forEach(([ex,chains]) => chains.forEach(chain => {
      const spread = Math.random()*0.4+0.05;
      if (spread>0.1) sigs.push({
        id:`tri-${ex}-${chain[0]}-${Date.now()}`,
        type:"tri", sym:chain.join(" → "),
        bx:ex, sx:ex, spread:+spread.toFixed(4), net:+(spread-0.08).toFixed(4),
        buyPrice:0, sellPrice:0, ts:Date.now(),
        aiScore:Math.floor(Math.random()*25)+70, hot:spread>0.3, vipOnly:true,
      });
    }));
    DEX_NETWORKS.forEach(net => Object.keys(dexP[net]||{}).forEach(pair => {
      const sym=pair.split("/")[0], cP=cexPrices["binance"]?.[sym]?.ask, dP=dexP[net]?.[pair]?.price;
      if (!cP||!dP) return;
      const spread=Math.abs((dP-cP)/cP)*100;
      if (spread>0.15) sigs.push({
        id:`dex-${net}-${pair}`, type:"dex", sym:pair,
        bx:dP>cP?"binance":net, sx:dP>cP?net:"binance",
        spread:+spread.toFixed(4), net:+(spread-0.25).toFixed(4),
        buyPrice:dP>cP?cP:dP, sellPrice:dP>cP?dP:cP,
        ts:Date.now(), aiScore:Math.floor(Math.random()*25)+60, hot:spread>0.7, vipOnly:true, network:net,
      });
    }));
    CROSS_ROUTES.forEach(route => {
      const spread=Math.random()*1.5+0.3;
      if (spread>0.4) sigs.push({
        id:`cross-${route.from}-${route.to}`, type:"cross",
        sym:`${route.sym} (${route.bridge})`,
        bx:route.from, sx:route.to,
        spread:+spread.toFixed(4), net:+(spread-0.45).toFixed(4),
        buyPrice:0, sellPrice:0,
        ts:Date.now(), aiScore:Math.floor(Math.random()*20)+55, hot:spread>1.0, vipOnly:true, bridge:route.bridge,
      });
    });
    return sigs.sort((a,b)=>b.net-a.net).slice(0,25);
  }

  setInterval(()=>{
    genCex(); genDex();
    io.emit("prices", Object.values(cexPrices).flatMap((ex:any)=>Object.values(ex)));
    io.emit("signals", buildSignals());
  }, 2000);

  io.on("connection", socket => {
    console.log("Client connected:", socket.id);
    genCex(); genDex();
    socket.emit("prices", Object.values(cexPrices).flatMap((ex:any)=>Object.values(ex)));
    socket.emit("signals", buildSignals());
  });

  // ── VITE / STATIC ──────────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server:{ middlewareMode:true }, appType:"spa" });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname,"dist")));
    app.get("*", (_req,res) => res.sendFile(path.join(__dirname,"dist","index.html")));
  }

  server.listen(PORT,"0.0.0.0", () => {
    console.log(`\n✅ NEXARB сервер запущен: http://localhost:${PORT}`);
    console.log(`🔐 Админ панель: /admin-${ADMIN_SECRET}\n`);
  });
}

startServer();
