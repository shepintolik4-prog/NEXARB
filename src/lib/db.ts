import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(process.cwd(), 'nexarb.db');
const db = new Database(dbPath);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    tg_id TEXT,
    tg_username TEXT,
    tg_first_name TEXT,
    tg_last_name TEXT,
    tg_photo_url TEXT,
    balance REAL DEFAULT 0,
    demo_balance REAL DEFAULT 10000,
    profit REAL DEFAULT 0,
    demo_profit REAL DEFAULT 0,
    trades INTEGER DEFAULT 0,
    demo_trades INTEGER DEFAULT 0,
    vip INTEGER DEFAULT 0,
    vip_expires INTEGER,
    ref_code TEXT UNIQUE,
    referred_by TEXT,
    ref_earned REAL DEFAULT 0,
    blocked INTEGER DEFAULT 0,
    trade_mode TEXT DEFAULT 'demo',
    auto_trading INTEGER DEFAULT 0,
    auto_amount REAL DEFAULT 100,
    auto_min_spread REAL DEFAULT 0.2,
    auto_risk TEXT DEFAULT 'medium',
    filter_prefs TEXT,
    api_keys TEXT,
    created_at INTEGER,
    last_seen INTEGER
  );

  CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    userId TEXT,
    symbol TEXT,
    amount REAL,
    spread REAL,
    type TEXT,
    mode TEXT,
    buyExchange TEXT,
    sellExchange TEXT,
    gross REAL,
    net REAL,
    totalFees REAL,
    fees TEXT,
    feeRates TEXT,
    status TEXT,
    created_at INTEGER,
    FOREIGN KEY(userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    userId TEXT,
    message TEXT,
    created_at INTEGER,
    read INTEGER DEFAULT 0,
    FOREIGN KEY(userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

export default db;
