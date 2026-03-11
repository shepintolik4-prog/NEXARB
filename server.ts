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

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: "*" } });
  const PORT = Number(process.env.PORT) || 3000;
  app.use(express.json());

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
      fee_free: 0.008,
      fee_vip: 0.003,
      demo_mode: true,
      free_trades_max: 5,
      maintenance: false,
      min_trade_amount: 10,
      max_trade_amount: 100000,
      referral_pct: 0.1,
      network_fee_cross: 0.002,
      network_fee_dex: 0.003,
      exchange_fee: 0.001,
      slippage_dex: 0.001,
    },
  };

  // Seed some demo users for admin panel
  const seedUsers = () => {
    const names = ["tg_111", "tg_222", "tg_333", "tg_444", "tg_555"];
    names.forEach((id, i) => {
      if (!db.users[id]) {
        db.users[id] = {
          id, balance: 1000 + i * 500, profit: i * 120.5,
          trades: i * 7, vip: i % 2 === 0,
          vip_expires: i % 2 === 0 ? Date.now() / 1000 + 86400 * 30 : null,
          connected_exchanges: ["binance"], ref_code: `REF${id.toUpperCase().slice(-4)}`,
          blocked: false, created_at: Date.now() / 1000 - i * 86400,
          last_seen: Date.now() / 1000 - i * 600, online: i < 2,
        };
      }
    });
    // Seed some trades
    if (db.trades.length === 0) {
      const types = ["cex","tri","dex","cross"];
      const syms = ["BTC/USDT","ETH/USDT","SOL/USDT","BNB/USDT"];
      for (let i = 0; i < 30; i++) {
        const type = types[i % 4];
        const amount = 100 + Math.random() * 900;
        const spread = 0.1 + Math.random() * 0.5;
        const pFee = amount * 0.005;
        const nFee = type === "cross" ? amount * 0.002 : type === "dex" ? amount * 0.003 : 0;
        db.trades.push({
          id: `seed-${i}`, userId: names[i % 5],
          symbol: syms[i % 4], amount, spread, type,
          buyExchange: "binance", sellExchange: "okx",
          netProfit: amount * (spread/100) - pFee - nFee,
          fees: { platform: pFee, network: nFee, exchangeA: amount*0.001, exchangeB: amount*0.001, slippage: type==="dex"?amount*0.001:0 },
          totalFees: pFee + nFee + amount*0.002,
          status: "completed",
          created_at: Date.now() / 1000 - (30 - i) * 3600,
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
        connected_exchanges: ["binance","okx"],
        ref_code: "REF" + Math.random().toString(36).substring(7).toUpperCase(),
        blocked: false, created_at: Date.now()/1000, last_seen: Date.now()/1000, online: false,
      };
    }
    db.users[userId].last_seen = Date.now()/1000;
    return db.users[userId];
  };

  const adminAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const secret = req.headers["x-admin-secret"] || req.query.secret;
    if (secret !== ADMIN_SECRET) return res.status(403).json({ error: "Forbidden" });
    next();
  };

  // ── PUBLIC API ─────────────────────────────────────────────
  app.get("/api/health", (_req, res) => res.json({ status:"ok", timestamp:new Date().toISOString() }));

  app.get("/api/v1/account", (req, res) => {
    const user = getUser((req.query.userId as string)||"demo_user");
    if (user.blocked) return res.status(403).json({ error:"Account blocked" });
    user.online = true;
    res.json(user);
  });

  app.post("/api/v1/trades", (req, res) => {
    const { userId, symbol, amount, spread, buyExchange, sellExchange, type } = req.body;
    const user = getUser(userId||"demo_user");
    if (user.blocked) return res.status(403).json({ error:"Account blocked" });
    if (!user.vip && user.trades >= db.config.free_trades_max)
      return res.status(403).json({ error:"Free limit reached" });

    const cfg = db.config;
    const feeRate  = user.vip ? cfg.fee_vip : cfg.fee_free;
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
      userId: user.id, symbol, amount, spread, type,
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

    const daily: Record<string,{fees:number;volume:number}> = {};
    for (let i=13;i>=0;i--) {
      const d = new Date(Date.now()-i*86400000).toISOString().slice(0,10);
      daily[d] = { fees:0, volume:0 };
    }
    db.trades.forEach(t => {
      const d = new Date(t.created_at*1000).toISOString().slice(0,10);
      if (daily[d]) { daily[d].fees+=t.fees?.platform||0; daily[d].volume+=t.amount||0; }
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
      blocked_users: users.filter(u=>u.blocked).length,
      total_trades: db.trades.length,
      trades_24h: db.trades.filter(t=>t.created_at>now-86400).length,
      total_volume: db.trades.reduce((a,b)=>a+(b.amount||0),0),
      volume_24h: db.trades.filter(t=>t.created_at>now-86400).reduce((a,b)=>a+(b.amount||0),0),
      platform_fees_total: db.trades.reduce((a,b)=>a+(b.fees?.platform||0),0),
      platform_fees_24h: db.trades.filter(t=>t.created_at>now-86400).reduce((a,b)=>a+(b.fees?.platform||0),0),
      daily: Object.entries(daily).map(([date,v])=>({ date, fees:+v.fees.toFixed(2), volume:+v.volume.toFixed(2) })),
      by_strategy: byStrategy,
      top_users: users.sort((a,b)=>b.profit-a.profit).slice(0,8).map(u=>({id:u.id,profit:u.profit,trades:u.trades,vip:u.vip,balance:u.balance})),
      top_signals: topSignals,
    });
  });

  app.get("/api/admin/users", adminAuth, (req, res) => {
    const { search, page="1", limit="25" } = req.query;
    let users = Object.values(db.users);
    if (search) {
      const q=(search as string).toLowerCase();
      users=users.filter(u=>u.id.toLowerCase().includes(q)||u.ref_code.toLowerCase().includes(q));
    }
    const total=users.length;
    const offset=(Number(page)-1)*Number(limit);
    res.json({ total, items:users.sort((a,b)=>b.created_at-a.created_at).slice(offset,offset+Number(limit)) });
  });

  app.get("/api/admin/users/:uid", adminAuth, (req, res) => {
    const user=db.users[req.params.uid];
    if (!user) return res.status(404).json({error:"Not found"});
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
    io.emit("broadcast",{message:req.body.message,created_at:Date.now()/1000});
    res.json({ ok:true });
  });

  app.get("/api/admin/config", adminAuth, (_req, res) => res.json(db.config));
  app.post("/api/admin/config", adminAuth, (req, res) => {
    db.config={...db.config,...req.body};
    res.json({ ok:true, config:db.config });
  });

  // ── SIGNAL ENGINE ──────────────────────────────────────────
  const CEX_SYMBOLS=["BTC","ETH","SOL","BNB","XRP","DOGE","ADA","AVAX","MATIC","DOT","TON","TRX"];
  const CEX_EXCHANGES=["binance","okx","bybit","coinbase","kraken","kucoin","gate","mexc"];
  const DEX_NETWORKS=["ethereum","bsc","solana","arbitrum","optimism","ton","tron"];
  const DEX_PAIRS: Record<string,string[]>={
    ethereum:["ETH/USDT","WBTC/ETH","LINK/ETH","UNI/ETH"],
    bsc:["BNB/USDT","CAKE/BNB","ETH/USDT","XRP/USDT"],
    solana:["SOL/USDT","JUP/SOL","BONK/SOL","WIF/SOL"],
    arbitrum:["ETH/USDT","ARB/ETH","GMX/ETH"],
    optimism:["ETH/USDT","OP/ETH"],
    ton:["TON/USDT","STON/TON"],
    tron:["TRX/USDT","SUN/TRX"],
  };
  const TRI_CHAINS: Record<string,string[][]>={
    binance:[["BTC/USDT","ETH/BTC","ETH/USDT"],["BNB/USDT","ETH/BNB","ETH/USDT"],["BTC/USDT","SOL/BTC","SOL/USDT"]],
    okx:[["BTC/USDT","ETH/BTC","ETH/USDT"]],
  };
  const CROSS_ROUTES=[
    {from:"ethereum",to:"bsc",sym:"USDT",bridge:"Stargate"},
    {from:"ethereum",to:"arbitrum",sym:"ETH",bridge:"Hop"},
    {from:"bsc",to:"solana",sym:"USDT",bridge:"Wormhole"},
    {from:"ethereum",to:"ton",sym:"USDT",bridge:"TonBridge"},
    {from:"solana",to:"arbitrum",sym:"USDT",bridge:"Wormhole"},
  ];

  const cexPrices: any={};
  const dexP: any={};

  function getBase(s:string){const b:any={BTC:65000,ETH:3500,SOL:180,BNB:420,XRP:0.6,DOGE:0.18,ADA:0.55,AVAX:40,MATIC:0.9,DOT:8,TON:7,TRX:0.12,LINK:18,UNI:11,ARB:1.2,JUP:1.1,WIF:2.8,BONK:0.00003,OP:2.1};return b[s]??1;}

  function genCex(){CEX_SYMBOLS.forEach(sym=>CEX_EXCHANGES.forEach(ex=>{if(!cexPrices[ex])cexPrices[ex]={};const base=getBase(sym),drift=(Math.random()-.5)*base*.004,mid=base+drift;cexPrices[ex][sym]={exchange:ex,pair:`${sym}/USDT`,bid:mid-mid*.0002,ask:mid+mid*.0002,vol:Math.random()*1000,ts:Date.now()};}));}
  function genDex(){DEX_NETWORKS.forEach(net=>{if(!dexP[net])dexP[net]={};(DEX_PAIRS[net]||[]).forEach(pair=>{const sym=pair.split("/")[0],base=getBase(sym);dexP[net][pair]={network:net,pair,price:base+(Math.random()-.5)*base*.006,ts:Date.now()};});});}

  function buildSignals(){
    const sigs:any[]=[];
    CEX_SYMBOLS.forEach(sym=>{const sp=CEX_EXCHANGES.map(ex=>cexPrices[ex]?.[sym]).filter(Boolean);sp.forEach(p1=>sp.forEach(p2=>{if(p1.exchange===p2.exchange)return;const spread=((p2.bid-p1.ask)/p1.ask)*100;if(spread>.08)sigs.push({id:`cex-${sym}-${p1.exchange}-${p2.exchange}-${Date.now()}`,type:"cex",sym:`${sym}/USDT`,bx:p1.exchange,sx:p2.exchange,spread:+spread.toFixed(4),net:+(spread-.15).toFixed(4),buyPrice:p1.ask,sellPrice:p2.bid,ts:Date.now(),aiScore:Math.floor(Math.random()*30)+65,hot:spread>.4});}));});
    Object.entries(TRI_CHAINS).forEach(([ex,chains])=>chains.forEach(chain=>{const spread=Math.random()*.4+.05;if(spread>.1)sigs.push({id:`tri-${ex}-${Date.now()}-${Math.random()}`,type:"tri",sym:chain.join(" → "),bx:ex,sx:ex,spread:+spread.toFixed(4),net:+(spread-.09).toFixed(4),buyPrice:0,sellPrice:0,ts:Date.now(),aiScore:Math.floor(Math.random()*25)+70,hot:spread>.35,vipOnly:true});}));
    DEX_NETWORKS.forEach(net=>Object.keys(dexP[net]||{}).forEach(pair=>{const sym=pair.split("/")[0],cP=cexPrices["binance"]?.[sym]?.ask,dP=dexP[net]?.[pair]?.price;if(!cP||!dP)return;const spread=Math.abs((dP-cP)/cP)*100;if(spread>.2)sigs.push({id:`dex-${net}-${pair}-${Date.now()}-${Math.random()}`,type:"dex",sym:pair,bx:dP>cP?"binance":net,sx:dP>cP?net:"binance",spread:+spread.toFixed(4),net:+(spread-.3).toFixed(4),buyPrice:dP>cP?cP:dP,sellPrice:dP>cP?dP:cP,ts:Date.now(),aiScore:Math.floor(Math.random()*25)+60,hot:spread>.8,vipOnly:true,network:net});}));
    CROSS_ROUTES.forEach(route=>{const spread=Math.random()*1.5+.3;if(spread>.5)sigs.push({id:`cross-${route.from}-${route.to}-${Date.now()}-${Math.random()}`,type:"cross",sym:`${route.sym} (${route.bridge})`,bx:route.from,sx:route.to,spread:+spread.toFixed(4),net:+(spread-.5).toFixed(4),buyPrice:0,sellPrice:0,ts:Date.now(),aiScore:Math.floor(Math.random()*20)+55,hot:spread>1.2,vipOnly:true,bridge:route.bridge});});
    return sigs.sort((a,b)=>b.net-a.net).slice(0,20);
  }

  setInterval(()=>{genCex();genDex();io.emit("prices",Object.values(cexPrices).flatMap((ex:any)=>Object.values(ex)));const s=buildSignals();if(s.length)io.emit("signals",s);},2000);
  io.on("connection",socket=>{genCex();genDex();socket.emit("prices",Object.values(cexPrices).flatMap((ex:any)=>Object.values(ex)));socket.emit("signals",buildSignals());});

  // ── ADMIN SECRET URL ──────────────────────────────────────
  app.get(`/admin-${ADMIN_SECRET}`, (_req, res) => {
    res.sendFile(path.join(__dirname, "admin.html"));
  });
  // Also serve with ?secret= query (for API calls from admin panel)
  app.get('/admin', (req, res) => {
    if (req.query.secret === ADMIN_SECRET) res.sendFile(path.join(__dirname, "admin.html"));
    else res.status(403).send('Forbidden');
  });

  // ── VITE / STATIC ──────────────────────────────────────────
  if (process.env.NODE_ENV!=="production"){
    const vite=await createViteServer({server:{middlewareMode:true},appType:"spa"});
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname,"dist")));
    app.get("*",(_req,res)=>res.sendFile(path.join(__dirname,"dist","index.html")));
  }

  server.listen(PORT,"0.0.0.0",()=>console.log(`✅ Server on http://localhost:${PORT}\n🔐 Admin: /admin-${ADMIN_SECRET}`));
}

startServer();
