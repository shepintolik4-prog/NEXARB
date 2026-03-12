import express from "express";
import { createServer as createViteServer } from "vite";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import fs from "fs";
import ccxt from "ccxt";
import CryptoJS from "crypto-js";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ADMIN_SECRET = process.env.ADMIN_SECRET || "nexarb-admin-2025";
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "default-key-for-dev-only-change-in-prod";
const DB_PATH = path.join(__dirname, "nexarb_db.json");

function encrypt(text: string): string {
  return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
}

function decrypt(ciphertext: string): string {
  const bytes = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

function loadDB() {
  try { if (fs.existsSync(DB_PATH)) return JSON.parse(fs.readFileSync(DB_PATH,"utf-8")); }
  catch(e) { console.log("DB load error"); }
  return { users:{}, trades:[], notifications:[], config:{} };
}
function saveDB(db: any) {
  try { fs.writeFileSync(DB_PATH, JSON.stringify(db,null,2)); } catch(e) {}
}

let db: any = loadDB();
setInterval(() => saveDB(db), 10000);

const DEFAULT_CONFIG = {
  fee_free:0.008, fee_vip:0.003, exchange_fee:0.001,
  network_fee_cross:0.002, network_fee_dex:0.003, slippage_dex:0.001, referral_pct:0.1,
  free_signals_max:3, free_trades_max:5, free_exchanges_max:2, free_strategies:"cex",
  min_trade_amount:10, max_trade_amount:1000000,
  demo_mode:true, maintenance:false, demo_start_balance:10000, real_start_balance:0,
};
db.config = { ...DEFAULT_CONFIG, ...db.config };

let realPrices: Record<string,number> = {
  BTC:83000,ETH:2000,SOL:130,BNB:590,XRP:2.3,ADA:0.72,AVAX:22,DOT:6.5,
  NEAR:4.1,ATOM:8.2,ALGO:0.18,FTM:0.52,ONE:0.018,HBAR:0.088,ICP:12,
  EGLD:38,FLOW:0.72,TON:4.2,TRX:0.22,LTC:92,BCH:430,ETC:26,XLM:0.11,VET:0.035,
  MATIC:0.5,ARB:0.42,OP:2.1,IMX:1.4,STRK:0.55,ZK:0.18,
  UNI:6.0,LINK:13,AAVE:185,MKR:1650,CRV:0.58,COMP:55,SNX:1.8,SUSHI:0.85,
  BAL:2.9,DYDX:0.9,GMX:23,CAKE:1.9,JUP:1.1,ORCA:3.5,RAY:1.8,
  DOGE:0.175,SHIB:0.0000145,PEPE:0.0000095,WIF:2.8,BONK:0.00003,FLOKI:0.00012,
  FIL:4.5,GRT:0.12,INJ:22,TIA:6.8,SEI:0.38,SUI:1.6,APT:7.2,STX:1.8,
  RNDR:5.4,FET:1.2,AGIX:0.42,TAO:380,
};

const GCK_MAP: Record<string,string> = {
  BTC:"bitcoin",ETH:"ethereum",SOL:"solana",BNB:"binancecoin",XRP:"ripple",
  ADA:"cardano",AVAX:"avalanche-2",DOT:"polkadot",NEAR:"near",ATOM:"cosmos",
  ALGO:"algorand",FTM:"fantom",ONE:"harmony",HBAR:"hedera-hashgraph",ICP:"internet-computer",
  TON:"the-open-network",TRX:"tron",LTC:"litecoin",BCH:"bitcoin-cash",ETC:"ethereum-classic",
  XLM:"stellar",VET:"vechain",MATIC:"matic-network",ARB:"arbitrum",OP:"optimism",
  UNI:"uniswap",LINK:"chainlink",AAVE:"aave",MKR:"maker",CRV:"curve-dao-token",
  DOGE:"dogecoin",SHIB:"shiba-inu",PEPE:"pepe",WIF:"dogwifcoin",BONK:"bonk",
  FIL:"filecoin",GRT:"the-graph",INJ:"injective-protocol",TIA:"celestia",
  SEI:"sei-network",SUI:"sui",APT:"aptos",RNDR:"render-token",FET:"fetch-ai",
  AGIX:"singularitynet",TAO:"bittensor",
};

async function fetchPrices() {
  try {
    const ids = Object.values(GCK_MAP).join(",");
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
    if (!r.ok) throw new Error(""+r.status);
    const d: any = await r.json();
    let n=0;
    Object.entries(GCK_MAP).forEach(([sym,id]) => { if(d[id]?.usd){realPrices[sym]=d[id].usd;n++;} });
    console.log(`✅ Prices: ${n} tokens updated`);
  } catch(e) { console.log("⚠️ CoinGecko unavailable"); }
}
fetchPrices();
setInterval(fetchPrices, 60000);

const ALL_EXCHANGES = [
  {id:"binance",name:"Binance",tier:1,logo:"🟡",fee:0.001,type:"cex"},
  {id:"okx",name:"OKX",tier:1,logo:"⚫",fee:0.001,type:"cex"},
  {id:"bybit",name:"Bybit",tier:1,logo:"🟠",fee:0.001,type:"cex"},
  {id:"coinbase",name:"Coinbase",tier:1,logo:"🔵",fee:0.006,type:"cex"},
  {id:"kraken",name:"Kraken",tier:1,logo:"🟣",fee:0.002,type:"cex"},
  {id:"kucoin",name:"KuCoin",tier:2,logo:"🟢",fee:0.001,type:"cex"},
  {id:"gate",name:"Gate.io",tier:2,logo:"🔴",fee:0.002,type:"cex"},
  {id:"mexc",name:"MEXC",tier:2,logo:"🟤",fee:0.0002,type:"cex"},
  {id:"htx",name:"HTX",tier:2,logo:"🔷",fee:0.002,type:"cex"},
  {id:"bitget",name:"Bitget",tier:2,logo:"🔹",fee:0.001,type:"cex"},
  {id:"bingx",name:"BingX",tier:2,logo:"🔸",fee:0.001,type:"cex"},
  {id:"bitmart",name:"BitMart",tier:2,logo:"⬛",fee:0.0025,type:"cex"},
  {id:"xt",name:"XT.com",tier:2,logo:"🔲",fee:0.002,type:"cex"},
  {id:"lbank",name:"LBank",tier:2,logo:"🟩",fee:0.001,type:"cex"},
  {id:"whitebit",name:"WhiteBIT",tier:3,logo:"⬜",fee:0.001,type:"cex"},
  {id:"phemex",name:"Phemex",tier:3,logo:"🟥",fee:0.001,type:"cex"},
  {id:"bitmex",name:"BitMEX",tier:3,logo:"🔴",fee:0.001,type:"cex"},
  {id:"digifinex",name:"DigiFinex",tier:3,logo:"🟦",fee:0.002,type:"cex"},
  {id:"probit",name:"ProBit",tier:3,logo:"🟪",fee:0.002,type:"cex"},
  {id:"latoken",name:"LATOKEN",tier:3,logo:"🔵",fee:0.001,type:"cex"},
  {id:"coinsbit",name:"Coinsbit",tier:3,logo:"⚪",fee:0.002,type:"cex"},
  {id:"p2pb2b",name:"P2PB2B",tier:3,logo:"🔸",fee:0.002,type:"cex"},
  {id:"uniswap",name:"Uniswap V3",tier:1,logo:"🦄",fee:0.003,type:"dex",network:"ethereum"},
  {id:"curve",name:"Curve",tier:1,logo:"🔵",fee:0.001,type:"dex",network:"ethereum"},
  {id:"balancer",name:"Balancer",tier:2,logo:"⚫",fee:0.002,type:"dex",network:"ethereum"},
  {id:"pancake",name:"PancakeSwap",tier:1,logo:"🥞",fee:0.0025,type:"dex",network:"bsc"},
  {id:"biswap",name:"Biswap",tier:2,logo:"🔷",fee:0.001,type:"dex",network:"bsc"},
  {id:"jupiter",name:"Jupiter",tier:1,logo:"♃",fee:0.002,type:"dex",network:"solana"},
  {id:"raydium",name:"Raydium",tier:1,logo:"⚡",fee:0.0025,type:"dex",network:"solana"},
  {id:"orca",name:"Orca",tier:2,logo:"🐋",fee:0.003,type:"dex",network:"solana"},
  {id:"camelot",name:"Camelot",tier:2,logo:"⚔",fee:0.003,type:"dex",network:"arbitrum"},
  {id:"gmxdex",name:"GMX",tier:1,logo:"🔵",fee:0.001,type:"dex",network:"arbitrum"},
  {id:"velodrome",name:"Velodrome",tier:2,logo:"🔴",fee:0.002,type:"dex",network:"optimism"},
  {id:"dedust",name:"DeDust",tier:2,logo:"💎",fee:0.003,type:"dex",network:"ton"},
  {id:"stonfi",name:"STON.fi",tier:2,logo:"🪨",fee:0.003,type:"dex",network:"ton"},
  {id:"sunswap",name:"SunSwap",tier:2,logo:"☀",fee:0.003,type:"dex",network:"tron"},
  {id:"traderjoe",name:"Trader Joe",tier:2,logo:"☕",fee:0.003,type:"dex",network:"avalanche"},
  {id:"quickswap",name:"QuickSwap",tier:2,logo:"⚡",fee:0.003,type:"dex",network:"polygon"},
];

const ALL_NETWORKS = [
  {id:"ethereum",name:"Ethereum",symbol:"ETH",icon:"Ξ",color:"#627EEA",avg_fee_usd:2.5,tps:15,tvl:"$45B"},
  {id:"bsc",name:"BSC",symbol:"BNB",icon:"◈",color:"#F0B90B",avg_fee_usd:0.1,tps:100,tvl:"$8B"},
  {id:"solana",name:"Solana",symbol:"SOL",icon:"◎",color:"#9945FF",avg_fee_usd:0.001,tps:65000,tvl:"$6B"},
  {id:"polygon",name:"Polygon",symbol:"MATIC",icon:"⬡",color:"#8247E5",avg_fee_usd:0.01,tps:7000,tvl:"$1.2B"},
  {id:"arbitrum",name:"Arbitrum",symbol:"ARB",icon:"◆",color:"#2D9CDB",avg_fee_usd:0.05,tps:40000,tvl:"$3B"},
  {id:"optimism",name:"Optimism",symbol:"OP",icon:"🔴",color:"#FF0420",avg_fee_usd:0.03,tps:2000,tvl:"$1.2B"},
  {id:"avalanche",name:"Avalanche",symbol:"AVAX",icon:"▲",color:"#E84142",avg_fee_usd:0.08,tps:4500,tvl:"$2B"},
  {id:"ton",name:"TON",symbol:"TON",icon:"💎",color:"#0088CC",avg_fee_usd:0.01,tps:100000,tvl:"$800M"},
  {id:"tron",name:"TRON",symbol:"TRX",icon:"T",color:"#EF0027",avg_fee_usd:0.001,tps:2000,tvl:"$9B"},
  {id:"near",name:"NEAR",symbol:"NEAR",icon:"N",color:"#00C1DE",avg_fee_usd:0.001,tps:100000,tvl:"$400M"},
  {id:"cosmos",name:"Cosmos",symbol:"ATOM",icon:"⚛",color:"#2E3148",avg_fee_usd:0.01,tps:10000,tvl:"$1B"},
  {id:"fantom",name:"Fantom",symbol:"FTM",icon:"👻",color:"#1969FF",avg_fee_usd:0.001,tps:10000,tvl:"$300M"},
  {id:"base",name:"Base",symbol:"ETH",icon:"B",color:"#0052FF",avg_fee_usd:0.02,tps:2000,tvl:"$2B"},
  {id:"zksync",name:"zkSync Era",symbol:"ZK",icon:"Z",color:"#8C8DFC",avg_fee_usd:0.02,tps:100,tvl:"$400M"},
];

const DEX_PAIRS_BY_NET: Record<string,string[]> = {
  ethereum:["ETH/USDT","WBTC/ETH","LINK/ETH","UNI/ETH","AAVE/ETH","CRV/ETH","SNX/ETH","MKR/ETH"],
  bsc:["BNB/USDT","CAKE/BNB","ETH/USDT","XRP/USDT","ADA/USDT","SOL/USDT","DOT/USDT"],
  solana:["SOL/USDT","JUP/SOL","RAY/SOL","ORCA/SOL","BONK/SOL","WIF/SOL"],
  polygon:["MATIC/USDT","ETH/USDT","LINK/MATIC","UNI/MATIC","AAVE/MATIC"],
  arbitrum:["ETH/USDT","ARB/ETH","GMX/ETH","LINK/ETH"],
  optimism:["ETH/USDT","OP/ETH","SNX/ETH"],
  avalanche:["AVAX/USDT","ETH/USDT"],
  ton:["TON/USDT","STON/TON"],
  tron:["TRX/USDT","SUN/TRX","JST/TRX"],
  near:["NEAR/USDT"],
  base:["ETH/USDT"],
};

const CROSS_ROUTES = [
  {from:"ethereum",to:"bsc",sym:"USDT",bridge:"Stargate",time:"~2min"},
  {from:"ethereum",to:"arbitrum",sym:"ETH",bridge:"Hop",time:"~1min"},
  {from:"ethereum",to:"polygon",sym:"USDC",bridge:"Polygon Bridge",time:"~7min"},
  {from:"bsc",to:"solana",sym:"USDT",bridge:"Wormhole",time:"~3min"},
  {from:"ethereum",to:"ton",sym:"USDT",bridge:"TonBridge",time:"~5min"},
  {from:"ethereum",to:"tron",sym:"USDT",bridge:"MultiChain",time:"~4min"},
  {from:"solana",to:"arbitrum",sym:"USDC",bridge:"Wormhole",time:"~3min"},
  {from:"ethereum",to:"optimism",sym:"ETH",bridge:"Across",time:"~1min"},
  {from:"ethereum",to:"avalanche",sym:"USDC",bridge:"Stargate",time:"~2min"},
  {from:"polygon",to:"arbitrum",sym:"USDC",bridge:"Hop",time:"~2min"},
  {from:"ethereum",to:"base",sym:"ETH",bridge:"Base Bridge",time:"~1min"},
  {from:"arbitrum",to:"optimism",sym:"ETH",bridge:"Across",time:"~1min"},
];

const TRI_CHAINS: Record<string,string[][]> = {
  binance:[["BTC/USDT","ETH/BTC","ETH/USDT"],["BNB/USDT","ETH/BNB","ETH/USDT"],["BTC/USDT","SOL/BTC","SOL/USDT"],["BTC/USDT","XRP/BTC","XRP/USDT"],["ETH/USDT","LINK/ETH","LINK/USDT"],["BTC/USDT","ADA/BTC","ADA/USDT"]],
  okx:[["BTC/USDT","ETH/BTC","ETH/USDT"],["BTC/USDT","SOL/BTC","SOL/USDT"],["ETH/USDT","BNB/ETH","BNB/USDT"]],
  bybit:[["BTC/USDT","ETH/BTC","ETH/USDT"],["BTC/USDT","SOL/BTC","SOL/USDT"]],
  kucoin:[["BTC/USDT","ETH/BTC","ETH/USDT"]],
};

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server,{cors:{origin:"*"}});
  const PORT = Number(process.env.PORT)||3000;
  app.use(express.json());

  const defaultFilterPrefs = () => ({
    strategies:["cex","tri","dex","cross"],
    networks:ALL_NETWORKS.map(n=>n.id),
    exchanges:ALL_EXCHANGES.filter(e=>e.type==="cex").slice(0,8).map(e=>e.id),
    min_spread:0, min_ai_score:0, tokens:[],
  });

  const getUser = (userId: string, tgData?: any) => {
    if (!db.users[userId]) {
      db.users[userId] = {
        id:userId, tg_id:tgData?.id, tg_username:tgData?.username||"",
        tg_first_name:tgData?.first_name||"User", tg_last_name:tgData?.last_name||"",
        tg_photo_url:tgData?.photo_url||"",
        balance:0, demo_balance:db.config.demo_start_balance||10000,
        profit:0, demo_profit:0, trades:0, demo_trades:0,
        vip:userId==="demo_user",
        vip_expires:userId==="demo_user"?Date.now()/1000+31536000:null,
        connected_exchanges:["binance"], api_keys:[],
        ref_code:"REF"+Math.random().toString(36).substring(2,7).toUpperCase(),
        referred_users:[], ref_earned:0, blocked:false,
        trade_mode:"demo", auto_trading:false, auto_amount:100,
        auto_min_spread:0.2, auto_risk:"medium",
        filter_prefs:defaultFilterPrefs(),
        created_at:Date.now()/1000, last_seen:Date.now()/1000, online:false,
      };
    } else if (tgData) {
      Object.assign(db.users[userId],{
        tg_id:tgData.id,
        tg_username:tgData.username||db.users[userId].tg_username,
        tg_first_name:tgData.first_name||db.users[userId].tg_first_name,
        tg_last_name:tgData.last_name||db.users[userId].tg_last_name,
        ...(tgData.photo_url?{tg_photo_url:tgData.photo_url}:{}),
      });
    }
    if (!db.users[userId].filter_prefs) db.users[userId].filter_prefs = defaultFilterPrefs();
    db.users[userId].last_seen = Date.now()/1000;
    db.users[userId].online = true;
    return db.users[userId];
  };

  const mkLimits = (u: any) => ({
    signals_max: u.vip?9999:db.config.free_signals_max,
    trades_max:  u.vip?9999:db.config.free_trades_max,
    exchanges_max:u.vip?9999:db.config.free_exchanges_max,
    strategies:  u.vip?"all":db.config.free_strategies,
  });

  const adminAuth = (req: any, res: any, next: any) => {
    if ((req.headers["x-admin-secret"]||req.query.secret) !== ADMIN_SECRET) return res.status(403).json({error:"Forbidden"});
    next();
  };

  app.get("/api/health",(_req,res)=>res.json({status:"ok",tokens:Object.keys(realPrices).length,exchanges:ALL_EXCHANGES.length,networks:ALL_NETWORKS.length}));
  app.get("/api/v1/exchanges",(_req,res)=>res.json(ALL_EXCHANGES));
  app.get("/api/v1/networks",(_req,res)=>res.json(ALL_NETWORKS));
  app.get("/api/v1/prices",(_req,res)=>res.json(realPrices));
  app.get("/api/v1/tokens",(_req,res)=>res.json(Object.keys(realPrices)));

  app.post("/api/v1/auth",(req,res)=>{
    const tg = req.body.user||req.body.tg_data?.user;
    const userId = tg?.id?`tg_${tg.id}`:"demo_user";
    const u = getUser(userId,tg);
    saveDB(db);
    res.json({...u,limits:mkLimits(u)});
  });

  app.get("/api/v1/account",(req,res)=>{
    const u = getUser((req.query.userId as string)||"demo_user");
    if(u.blocked) return res.status(403).json({error:"Заблокирован"});
    res.json({...u,limits:mkLimits(u)});
  });

  app.patch("/api/v1/account",(req,res)=>{
    const u = getUser(req.body.userId||"demo_user");
    const f=["trade_mode","filter_prefs","auto_trading","auto_amount","auto_min_spread","auto_risk"];
    f.forEach(k=>{if(req.body[k]!==undefined){
      if(k==="filter_prefs") u.filter_prefs={...u.filter_prefs,...req.body[k]};
      else (u as any)[k]=req.body[k];
    }});
    saveDB(db); res.json({ok:true});
  });

  app.post("/api/v1/trades",(req,res)=>{
    const {userId,symbol,amount,spread,buyExchange,sellExchange,type,mode}=req.body;
    const u=getUser(userId||"demo_user");
    if(u.blocked) return res.status(403).json({error:"Заблокирован"});
    const tMode=mode||u.trade_mode||"demo";
    const bal=tMode==="real"?u.balance:u.demo_balance;
    if(!u.vip&&u.trades>=db.config.free_trades_max) return res.status(403).json({error:`Лимит ${db.config.free_trades_max} сделок`});
    if(amount>bal) return res.status(400).json({error:"Недостаточно средств"});
    const cfg=db.config;
    const feeRate=u.vip?cfg.fee_vip:cfg.fee_free;
    const nFee=type==="cross"?amount*cfg.network_fee_cross:type==="dex"?amount*cfg.network_fee_dex:0;
    const exA=amount*cfg.exchange_fee,exB=amount*cfg.exchange_fee;
    const slip=type==="dex"?amount*cfg.slippage_dex:0;
    const platFee=amount*feeRate;
    const totalFees=platFee+nFee+exA+exB+slip;
    const gross=amount*(spread/100),net=gross-totalFees;
    if(tMode==="real"){
      // Real trade execution logic placeholder
      const keys = u.api_keys?.find((k:any)=>k.exchange === buyExchange);
      if (keys) {
        try {
          const realKey = decrypt(keys.key);
          const realSecret = decrypt(keys.secret);
          console.log(`[REAL TRADE] Executed on ${buyExchange} for ${symbol} (Simulated CCXT call)`);
        } catch (e) {
          console.error("Real trade decryption failed", e);
        }
      }
      u.balance+=net;u.profit+=net;u.trades++;
    }
    else{u.demo_balance+=net;u.demo_profit+=net;u.demo_trades++;}
    const t={id:Math.random().toString(36).substring(2,10),userId:u.id,symbol,amount,spread,type,mode:tMode,buyExchange,sellExchange,gross,net,totalFees,fees:{platform:platFee,network:nFee,exchangeA:exA,exchangeB:exB,slippage:slip},feeRates:{platform:feeRate},status:"completed",created_at:Date.now()/1000};
    db.trades.push(t);
    saveDB(db);
    res.json({...t,newBalance:tMode==="real"?u.balance:u.demo_balance});
  });

  app.post("/api/v1/vip/initiate",(req,res)=>{
    const {plan="month", method="stars"}=req.body;
    const prices: any={
      week:{stars:150,ton:"0.25",usd:9},
      month:{stars:450,ton:"0.80",usd:29},
      year:{stars:1999,ton:"3.50",usd:149},
    };
    const p=prices[plan]||prices.month;
    const invoiceId=`inv_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    res.json({ok:true,invoiceId,plan,method,prices:p,
      stars_link:`tg://invoice?...`,
      ton_address:"UQBvI0aFLnw2QbZgjMPCLRdtRHxhUyinQudg19Xoc3GGzHRR",
      ton_memo:invoiceId,
    });
  });

  app.post("/api/v1/vip/confirm",(req,res)=>{
    const {userId,invoiceId,plan="month",method}=req.body;
    if(!userId||!invoiceId) return res.status(400).json({error:"Missing params"});
    const u=getUser(userId);
    u.vip=true;
    const dur: any={week:604800,month:2592000,year:31536000};
    u.vip_expires=Date.now()/1000+(dur[plan]||dur.month);
    u.vip_payment={method,plan,invoiceId,ts:Date.now()/1000};
    saveDB(db);
    res.json({ok:true,expires_at:u.vip_expires,vip:true});
  });

  app.post("/api/v1/exchange/connect",(req,res)=>{
    const {userId,exchange,apiKey,apiSecret}=req.body;
    if(!userId||!exchange||!apiKey||!apiSecret) return res.status(400).json({error:"Missing fields"});
    const u=getUser(userId);
    if(!u.vip) return res.status(403).json({error:"VIP required"});
    if(!u.api_keys) u.api_keys=[];
    if(!u.connected_exchanges) u.connected_exchanges=[];
    u.api_keys=u.api_keys.filter((k:any)=>k.exchange!==exchange);
    u.api_keys.push({
      exchange,
      key: encrypt(apiKey),
      secret: encrypt(apiSecret),
      active: true,
      ts: Date.now()/1000
    });
    if(!u.connected_exchanges.includes(exchange)) u.connected_exchanges.push(exchange);
    saveDB(db);
    res.json({ok:true,connected:u.connected_exchanges});
  });

  app.delete("/api/v1/exchange/connect",(req,res)=>{
    const {userId,exchange}=req.body;
    if(!userId||!exchange) return res.status(400).json({error:"Missing fields"});
    const u=getUser(userId);
    if(!u.api_keys) u.api_keys=[];
    u.api_keys=u.api_keys.filter((k:any)=>k.exchange!==exchange);
    u.connected_exchanges=(u.connected_exchanges||[]).filter((e:string)=>e!==exchange);
    saveDB(db);
    res.json({ok:true,connected:u.connected_exchanges});
  });

  app.get("/api/admin/stats",adminAuth,(_req,res)=>{
    const users=Object.values(db.users) as any[];
    const now=Date.now()/1000;
    const daily: any={};
    for(let i=13;i>=0;i--){const d=new Date(Date.now()-i*86400000).toISOString().slice(0,10);daily[d]={fees:0,volume:0,trades:0};}
    db.trades.forEach((t:any)=>{const d=new Date(t.created_at*1000).toISOString().slice(0,10);if(daily[d]){daily[d].fees+=t.fees?.platform||0;daily[d].volume+=t.amount||0;daily[d].trades++;}});
    const bs: any={cex:{c:0,v:0,f:0},tri:{c:0,v:0,f:0},dex:{c:0,v:0,f:0},cross:{c:0,v:0,f:0}};
    db.trades.forEach((t:any)=>{if(bs[t.type]){bs[t.type].c++;bs[t.type].v+=t.amount||0;bs[t.type].f+=t.fees?.platform||0;}});
    const sc: any={};
    db.trades.forEach((t:any)=>{const k=`${t.type}:${t.symbol}`;sc[k]=(sc[k]||0)+1;});
    res.json({
      total_users:users.length,online_users:users.filter((u:any)=>u.last_seen>now-300).length,
      vip_users:users.filter((u:any)=>u.vip).length,free_users:users.filter((u:any)=>!u.vip).length,
      blocked_users:users.filter((u:any)=>u.blocked).length,
      total_trades:db.trades.length,trades_24h:db.trades.filter((t:any)=>t.created_at>now-86400).length,
      total_volume:db.trades.reduce((a:number,b:any)=>a+(b.amount||0),0),
      volume_24h:db.trades.filter((t:any)=>t.created_at>now-86400).reduce((a:number,b:any)=>a+(b.amount||0),0),
      platform_fees_total:db.trades.reduce((a:number,b:any)=>a+(b.fees?.platform||0),0),
      platform_fees_24h:db.trades.filter((t:any)=>t.created_at>now-86400).reduce((a:number,b:any)=>a+(b.fees?.platform||0),0),
      daily:Object.entries(daily).map(([date,v]:any)=>({date,fees:+v.fees.toFixed(2),volume:+v.volume.toFixed(2),trades:v.trades})),
      by_strategy:bs,
      top_users:[...users].sort((a:any,b:any)=>b.profit-a.profit).slice(0,10).map((u:any)=>({id:u.id,username:u.tg_username,profit:u.profit,trades:u.trades,vip:u.vip,balance:u.balance})),
      top_signals:Object.entries(sc).sort((a:any,b:any)=>b[1]-a[1]).slice(0,8).map(([key,count])=>({key,count})),
    });
  });

  app.get("/api/admin/users",adminAuth,(req,res)=>{
    const {search,page="1",limit="25"}=req.query as any;
    let users=Object.values(db.users) as any[];
    if(search){const q=search.toLowerCase();users=users.filter((u:any)=>u.id.toLowerCase().includes(q)||u.tg_username?.toLowerCase().includes(q)||u.ref_code?.toLowerCase().includes(q));}
    const total=users.length;
    const offset=(Number(page)-1)*Number(limit);
    res.json({total,items:users.sort((a:any,b:any)=>b.created_at-a.created_at).slice(offset,offset+Number(limit))});
  });

  app.post("/api/admin/users/:uid/notify",adminAuth,(req,res)=>{
    const n={id:Math.random().toString(36).substring(2,9),userId:req.params.uid,message:req.body.message,created_at:Date.now()/1000};
    db.notifications.push(n);
    io.emit(`notify:${req.params.uid}`,n);
    saveDB(db);res.json({ok:true});
  });

  app.get("/api/admin/config",adminAuth,(_req,res)=>res.json(db.config));
  app.post("/api/admin/config",adminAuth,(req,res)=>{
    db.config={...db.config,...req.body};saveDB(db);res.json({ok:true,config:db.config});
  });

  app.get(`/admin-${ADMIN_SECRET}`,(_req,res)=>res.sendFile(path.resolve(__dirname,"src","admin.html")));

  // Real-time CCXT Scanner
  const CEX_IDS = ["binance", "okx", "bybit", "kraken", "gateio"];
  const exchanges = CEX_IDS.map(id => new (ccxt as any)[id]({ enableRateLimit: true }));
  const cexPrices: any={};

  async function scanRealMarkets() {
    const syms = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "ADA/USDT", "AVAX/USDT", "DOT/USDT"];
    const sigs: any[] = [];

    for (const sym of syms) {
      const prices: any[] = [];
      await Promise.all(exchanges.map(async (ex) => {
        try {
          const ticker = await ex.fetchTicker(sym);
          prices.push({ exchange: ex.id, bid: ticker.bid, ask: ticker.ask, price: ticker.last, ts: Date.now() });
          if(!cexPrices[ex.id]) cexPrices[ex.id] = {};
          cexPrices[ex.id][sym.split('/')[0]] = { exchange: ex.id, pair: sym, bid: ticker.bid, ask: ticker.ask, price: ticker.last, ts: Date.now() };
        } catch (e) {}
      }));

      for (const p1 of prices) {
        for (const p2 of prices) {
          if (p1.exchange === p2.exchange) continue;
          const spread = ((p2.bid - p1.ask) / p1.ask) * 100;
          if (spread > 0.05) {
            sigs.push({
              id: `cex-${sym}-${p1.exchange}-${p2.exchange}-${Date.now()}`,
              type: "cex", sym, bx: p1.exchange, sx: p2.exchange,
              spread: +spread.toFixed(4), net: +(spread - 0.12).toFixed(4),
              buyPrice: +p1.ask.toFixed(6), sellPrice: +p2.bid.toFixed(6),
              aiScore: Math.floor(Math.random() * 30) + 65, hot: spread > 0.3, ts: Date.now()
            });
          }
        }
      }
    }

    // Add some simulated TRI/DEX/CROSS for variety (as in user's original)
    Object.entries(TRI_CHAINS).forEach(([ex,chains])=>chains.forEach(chain=>{
      const spread=Math.random()*.45+.05;
      if(spread>.1)sigs.push({id:`tri-${ex}-${chain[0]}-${Date.now()}`,type:"tri",sym:chain.join("→"),bx:ex,sx:ex,spread:+spread.toFixed(4),net:+(spread-.08).toFixed(4),buyPrice:0,sellPrice:0,aiScore:Math.floor(Math.random()*25)+70,hot:spread>.3,vipOnly:true,ts:Date.now()});
    }));

    return sigs.sort((a,b)=>b.net-a.net).slice(0,50);
  }

  setInterval(async () => {
    const sigs = await scanRealMarkets();
    io.emit("signals", sigs);
    io.emit("prices", Object.values(cexPrices).flatMap((ex:any)=>Object.values(ex)));
  }, 5000);

  io.on("connection",socket=>{
    socket.emit("meta",{exchanges:ALL_EXCHANGES,networks:ALL_NETWORKS,tokenCount:Object.keys(realPrices).length});
  });

  if(process.env.NODE_ENV!=="production"){
    const vite=await createViteServer({server:{middlewareMode:true},appType:"spa"});
    app.use(vite.middlewares);
  }else{
    app.use(express.static(path.join(__dirname,"dist")));
    app.get("*",(_req,res)=>res.sendFile(path.join(__dirname,"dist","index.html")));
  }

  server.listen(PORT,"0.0.0.0",()=>{
    console.log(`✅ NEXARB :${PORT} | Admin: /admin-${ADMIN_SECRET} | DB: ${DB_PATH}`);
  });
}

startServer();
