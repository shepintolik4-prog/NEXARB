"""
NEXARB — Database Layer
SQLite schema + all DB operations
Все балансы, VIP, история сделок — ТОЛЬКО здесь
"""

import sqlite3
import os
import time

DB_PATH = os.environ.get('NEXARB_DB', 'nexarb.db')

# ─────────────────────────────────────────────────────────────
# SCHEMA
# ─────────────────────────────────────────────────────────────
SCHEMA = """
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ── USERS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,          -- UUID v4, назначается сервером
    tg_id         TEXT UNIQUE,               -- Telegram user_id (строка)
    tg_username   TEXT,
    tg_first_name TEXT,
    ref_code      TEXT UNIQUE NOT NULL,      -- реферальный код (8 символов, генерируется сервером)
    referred_by   TEXT REFERENCES users(ref_code),
    lang          TEXT DEFAULT 'ru',
    created_at    INTEGER DEFAULT (strftime('%s','now')),
    last_seen     INTEGER DEFAULT (strftime('%s','now'))
);

-- ── BALANCES (единственный источник правды) ──────────────────
-- Баланс НИКОГДА не передаётся от клиента
-- Только сервер изменяет эту таблицу
CREATE TABLE IF NOT EXISTS balances (
    user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    usd_balance   REAL NOT NULL DEFAULT 0.0 CHECK(usd_balance >= 0),
    demo_balance  REAL NOT NULL DEFAULT 3000.0,  -- для демо-режима
    updated_at    INTEGER DEFAULT (strftime('%s','now'))
);

-- ── VIP SUBSCRIPTIONS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vip_subscriptions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan          TEXT NOT NULL CHECK(plan IN ('week','month','year')),
    starts_at     INTEGER NOT NULL,
    expires_at    INTEGER NOT NULL,
    payment_id    TEXT,                      -- ID платежа от платёжной системы
    is_active     INTEGER DEFAULT 1,
    created_at    INTEGER DEFAULT (strftime('%s','now'))
);

-- ── CONNECTED EXCHANGES ──────────────────────────────────────
-- API ключи НЕ ХРАНЯТСЯ в БД в открытом виде
-- В реальной системе: шифровать AES-256-GCM перед записью
-- Здесь: храним только факт подключения и маску ключа
CREATE TABLE IF NOT EXISTS connected_exchanges (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exchange_id   TEXT NOT NULL,
    key_mask      TEXT NOT NULL,             -- первые 4 + последние 4 символа ключа
    -- api_key_enc: bytes  -- PROD: зашифрованный ключ (AES-GCM)
    -- api_secret_enc: bytes
    is_active     INTEGER DEFAULT 1,
    connected_at  INTEGER DEFAULT (strftime('%s','now')),
    UNIQUE(user_id, exchange_id)
);

-- ── TRADES (история — только от сервера) ─────────────────────
-- Клиент НЕ может создать запись здесь напрямую
-- Все расчёты прибыли — на сервере
CREATE TABLE IF NOT EXISTS trades (
    id              TEXT PRIMARY KEY,        -- UUID v4
    user_id         TEXT NOT NULL REFERENCES users(id),
    symbol          TEXT NOT NULL,
    strategy_type   TEXT NOT NULL,           -- cex/tri/fund/dex/stat/cross/vol/spread
    buy_exchange    TEXT NOT NULL,
    sell_exchange   TEXT NOT NULL,
    amount          REAL NOT NULL CHECK(amount > 0),
    gross_profit    REAL NOT NULL,
    fee_exchange_a  REAL NOT NULL DEFAULT 0,
    fee_exchange_b  REAL NOT NULL DEFAULT 0,
    fee_network     REAL NOT NULL DEFAULT 0,
    fee_slippage    REAL NOT NULL DEFAULT 0,
    fee_platform    REAL NOT NULL DEFAULT 0,
    net_profit      REAL NOT NULL,           -- РАССЧИТЫВАЕТСЯ СЕРВЕРОМ
    spread_pct      REAL NOT NULL,
    ai_score        INTEGER DEFAULT 0,
    execution_ms    INTEGER DEFAULT 0,
    status          TEXT DEFAULT 'completed' CHECK(status IN ('pending','executing','completed','failed','cancelled')),
    balance_before  REAL NOT NULL,           -- snapshot баланса ДО сделки
    balance_after   REAL NOT NULL,           -- snapshot баланса ПОСЛЕ сделки
    is_auto         INTEGER DEFAULT 0,
    created_at      INTEGER DEFAULT (strftime('%s','now'))
);

-- ── REFERRALS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referrals (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    referrer_id   TEXT NOT NULL REFERENCES users(id),
    referred_id   TEXT NOT NULL REFERENCES users(id),
    earned_usd    REAL DEFAULT 0,
    created_at    INTEGER DEFAULT (strftime('%s','now')),
    UNIQUE(referred_id)
);

-- ── RATE LIMITING ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limits (
    key           TEXT PRIMARY KEY,          -- 'ip:xxx.xxx.xxx.xxx' или 'user:uuid'
    requests      INTEGER DEFAULT 1,
    window_start  INTEGER DEFAULT (strftime('%s','now')),
    blocked_until INTEGER DEFAULT 0
);

-- ── JWT REVOCATION LIST ──────────────────────────────────────
-- Для выхода / смены пароля / подозрительной активности
CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti           TEXT PRIMARY KEY,          -- JWT ID
    user_id       TEXT NOT NULL,
    revoked_at    INTEGER DEFAULT (strftime('%s','now')),
    expires_at    INTEGER NOT NULL
);

-- ── INDEXES ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_trades_user    ON trades(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_status  ON trades(status);
CREATE INDEX IF NOT EXISTS idx_vip_user       ON vip_subscriptions(user_id, is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_revoked_jti    ON revoked_tokens(jti);
CREATE INDEX IF NOT EXISTS idx_rate_key       ON rate_limits(key, window_start);
"""


# ─────────────────────────────────────────────────────────────
# CONNECTION
# ─────────────────────────────────────────────────────────────
def get_db():
    """Возвращает подключение к БД с row_factory для удобного доступа."""
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    """Создаёт схему БД при первом запуске."""
    conn = get_db()
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()
    print(f"[DB] Initialized: {DB_PATH}")


# ─────────────────────────────────────────────────────────────
# USER OPERATIONS
# ─────────────────────────────────────────────────────────────
def create_user(tg_id: str, tg_username: str, tg_first_name: str,
                ref_code: str, user_id: str, referred_by: str = None):
    """
    Создаёт нового пользователя.
    user_id и ref_code генерируются СЕРВЕРОМ, не клиентом.
    """
    conn = get_db()
    try:
        conn.execute("""
            INSERT INTO users (id, tg_id, tg_username, tg_first_name, ref_code, referred_by)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (user_id, str(tg_id), tg_username, tg_first_name, ref_code, referred_by))

        # Создаём запись баланса (начальный баланс 0, demo_balance 3000)
        conn.execute("""
            INSERT INTO balances (user_id, usd_balance, demo_balance)
            VALUES (?, 0.0, 3000.0)
        """, (user_id,))

        # Реферальная запись
        if referred_by:
            referrer = conn.execute(
                "SELECT id FROM users WHERE ref_code = ?", (referred_by,)
            ).fetchone()
            if referrer:
                conn.execute("""
                    INSERT OR IGNORE INTO referrals (referrer_id, referred_id)
                    VALUES (?, ?)
                """, (referrer['id'], user_id))

        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()


def get_user_by_tg_id(tg_id: str):
    conn = get_db()
    try:
        return conn.execute(
            "SELECT * FROM users WHERE tg_id = ?", (str(tg_id),)
        ).fetchone()
    finally:
        conn.close()


def get_user_by_id(user_id: str):
    conn = get_db()
    try:
        return conn.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    finally:
        conn.close()


def update_last_seen(user_id: str):
    conn = get_db()
    try:
        conn.execute(
            "UPDATE users SET last_seen = ? WHERE id = ?",
            (int(time.time()), user_id)
        )
        conn.commit()
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# BALANCE OPERATIONS (ТОЛЬКО сервер меняет баланс)
# ─────────────────────────────────────────────────────────────
def get_balance(user_id: str) -> dict:
    """
    Возвращает баланс пользователя.
    Клиент может ТОЛЬКО читать, никогда не записывать.
    """
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT usd_balance, demo_balance FROM balances WHERE user_id = ?",
            (user_id,)
        ).fetchone()
        if not row:
            return {'usd_balance': 0.0, 'demo_balance': 3000.0}
        return {'usd_balance': row['usd_balance'], 'demo_balance': row['demo_balance']}
    finally:
        conn.close()


def apply_trade_result(user_id: str, trade_id: str, net_profit: float,
                       is_demo: bool = True) -> tuple:
    """
    Атомарно применяет результат сделки к балансу.
    Использует транзакцию — либо всё, либо ничего.
    Возвращает (balance_before, balance_after).
    """
    conn = get_db()
    try:
        # BEGIN EXCLUSIVE блокирует строку на время транзакции
        conn.execute("BEGIN EXCLUSIVE")

        bal_col = 'demo_balance' if is_demo else 'usd_balance'
        row = conn.execute(
            f"SELECT {bal_col} FROM balances WHERE user_id = ?", (user_id,)
        ).fetchone()

        if not row:
            conn.execute("ROLLBACK")
            return None, None

        balance_before = row[bal_col]
        balance_after = round(balance_before + net_profit, 8)

        # Не допускаем отрицательного баланса
        if balance_after < 0:
            balance_after = 0.0

        conn.execute(
            f"UPDATE balances SET {bal_col} = ?, updated_at = ? WHERE user_id = ?",
            (balance_after, int(time.time()), user_id)
        )

        # Обновляем запись сделки с итоговыми балансами
        conn.execute("""
            UPDATE trades
            SET balance_before = ?, balance_after = ?, status = 'completed'
            WHERE id = ?
        """, (balance_before, balance_after, trade_id))

        conn.commit()
        return balance_before, balance_after

    except Exception as e:
        conn.execute("ROLLBACK")
        raise e
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# VIP OPERATIONS
# ─────────────────────────────────────────────────────────────
PLAN_DAYS = {'week': 7, 'month': 30, 'year': 365}
PLAN_PRICES = {'week': 9.0, 'month': 29.0, 'year': 149.0}

def activate_vip(user_id: str, plan: str, payment_id: str = None) -> dict:
    """
    Активирует VIP ТОЛЬКО после подтверждения платежа.
    В реальной системе payment_id должен быть верифицирован
    через Stripe/TON webhook ДО вызова этой функции.
    """
    if plan not in PLAN_DAYS:
        raise ValueError(f"Unknown plan: {plan}")

    conn = get_db()
    try:
        now = int(time.time())
        days = PLAN_DAYS[plan]
        expires_at = now + days * 86400

        conn.execute("""
            INSERT INTO vip_subscriptions (user_id, plan, starts_at, expires_at, payment_id)
            VALUES (?, ?, ?, ?, ?)
        """, (user_id, plan, now, expires_at, payment_id))
        conn.commit()

        return {'plan': plan, 'expires_at': expires_at, 'is_active': True}
    finally:
        conn.close()


def get_vip_status(user_id: str) -> dict:
    conn = get_db()
    try:
        now = int(time.time())
        row = conn.execute("""
            SELECT plan, expires_at
            FROM vip_subscriptions
            WHERE user_id = ? AND is_active = 1 AND expires_at > ?
            ORDER BY expires_at DESC LIMIT 1
        """, (user_id, now)).fetchone()

        if not row:
            return {'is_vip': False, 'plan': None, 'expires_at': None}

        return {
            'is_vip': True,
            'plan': row['plan'],
            'expires_at': row['expires_at'],
            'days_left': max(0, (row['expires_at'] - now) // 86400),
        }
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# TRADE OPERATIONS
# ─────────────────────────────────────────────────────────────
def create_trade(trade_data: dict) -> str:
    """Создаёт запись сделки со статусом 'pending'."""
    conn = get_db()
    try:
        conn.execute("""
            INSERT INTO trades (
                id, user_id, symbol, strategy_type,
                buy_exchange, sell_exchange, amount,
                gross_profit, fee_exchange_a, fee_exchange_b,
                fee_network, fee_slippage, fee_platform,
                net_profit, spread_pct, ai_score, execution_ms,
                status, balance_before, balance_after, is_auto
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            trade_data['id'], trade_data['user_id'], trade_data['symbol'],
            trade_data['strategy_type'], trade_data['buy_exchange'],
            trade_data['sell_exchange'], trade_data['amount'],
            trade_data['gross_profit'], trade_data['fee_exchange_a'],
            trade_data['fee_exchange_b'], trade_data['fee_network'],
            trade_data['fee_slippage'], trade_data['fee_platform'],
            trade_data['net_profit'], trade_data['spread_pct'],
            trade_data.get('ai_score', 0), trade_data.get('execution_ms', 0),
            'pending',
            trade_data.get('balance_before', 0),
            trade_data.get('balance_after', 0),
            1 if trade_data.get('is_auto') else 0
        ))
        conn.commit()
        return trade_data['id']
    finally:
        conn.close()


def get_trade(trade_id: str, user_id: str) -> dict:
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM trades WHERE id = ? AND user_id = ?",
            (trade_id, user_id)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_trades_history(user_id: str, page: int = 1, per_page: int = 20) -> dict:
    conn = get_db()
    try:
        offset = (page - 1) * per_page
        rows = conn.execute("""
            SELECT * FROM trades
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        """, (user_id, per_page, offset)).fetchall()

        total = conn.execute(
            "SELECT COUNT(*) FROM trades WHERE user_id = ?", (user_id,)
        ).fetchone()[0]

        return {
            'items': [dict(r) for r in rows],
            'total': total,
            'page': page,
            'pages': (total + per_page - 1) // per_page,
        }
    finally:
        conn.close()


def get_trade_stats(user_id: str) -> dict:
    conn = get_db()
    try:
        row = conn.execute("""
            SELECT
                COUNT(*) as total_trades,
                COALESCE(SUM(net_profit), 0) as total_profit,
                COALESCE(SUM(fee_platform), 0) as total_fees,
                COUNT(CASE WHEN net_profit > 0 THEN 1 END) as winning_trades,
                COALESCE(MAX(net_profit), 0) as best_trade
            FROM trades
            WHERE user_id = ? AND status = 'completed'
        """, (user_id,)).fetchone()
        d = dict(row)
        d['win_rate'] = round(d['winning_trades'] / d['total_trades'] * 100, 1) if d['total_trades'] > 0 else 0
        return d
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# EXCHANGE KEYS
# ─────────────────────────────────────────────────────────────
def save_exchange_connection(user_id: str, exchange_id: str, api_key: str) -> bool:
    """
    Сохраняет факт подключения биржи.
    api_key хранится ТОЛЬКО маска (первые 4 + последние 4 символа).
    В продакшне: зашифровать весь ключ через AES-256-GCM перед сохранением.
    """
    mask = api_key[:4] + '****' + api_key[-4:] if len(api_key) >= 8 else '****'
    conn = get_db()
    try:
        conn.execute("""
            INSERT INTO connected_exchanges (user_id, exchange_id, key_mask)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id, exchange_id) DO UPDATE SET
                key_mask = excluded.key_mask,
                is_active = 1,
                connected_at = strftime('%s','now')
        """, (user_id, exchange_id, mask))
        conn.commit()
        return True
    finally:
        conn.close()


def get_connected_exchanges(user_id: str) -> list:
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT exchange_id, key_mask, connected_at
            FROM connected_exchanges
            WHERE user_id = ? AND is_active = 1
        """, (user_id,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def remove_exchange(user_id: str, exchange_id: str) -> bool:
    conn = get_db()
    try:
        conn.execute("""
            UPDATE connected_exchanges SET is_active = 0
            WHERE user_id = ? AND exchange_id = ?
        """, (user_id, exchange_id))
        conn.commit()
        return True
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# RATE LIMITING
# ─────────────────────────────────────────────────────────────
def check_rate_limit(key: str, max_requests: int = 60,
                     window_seconds: int = 60) -> tuple:
    """
    Возвращает (allowed: bool, remaining: int).
    key = 'ip:1.2.3.4' или 'user:uuid'
    """
    now = int(time.time())
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT requests, window_start, blocked_until FROM rate_limits WHERE key = ?",
            (key,)
        ).fetchone()

        if row:
            # Проверяем блокировку
            if row['blocked_until'] > now:
                return False, 0

            # Новое окно
            if now - row['window_start'] >= window_seconds:
                conn.execute("""
                    UPDATE rate_limits SET requests = 1, window_start = ?
                    WHERE key = ?
                """, (now, key))
                conn.commit()
                return True, max_requests - 1

            # Превышение
            if row['requests'] >= max_requests:
                block_until = now + window_seconds * 2
                conn.execute("""
                    UPDATE rate_limits SET blocked_until = ? WHERE key = ?
                """, (block_until, key))
                conn.commit()
                return False, 0

            # Инкремент
            conn.execute("""
                UPDATE rate_limits SET requests = requests + 1 WHERE key = ?
            """, (key,))
            conn.commit()
            return True, max_requests - row['requests'] - 1
        else:
            conn.execute("""
                INSERT INTO rate_limits (key, requests, window_start)
                VALUES (?, 1, ?)
            """, (key, now))
            conn.commit()
            return True, max_requests - 1
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# JWT REVOCATION
# ─────────────────────────────────────────────────────────────
def revoke_token(jti: str, user_id: str, expires_at: int):
    conn = get_db()
    try:
        conn.execute("""
            INSERT OR IGNORE INTO revoked_tokens (jti, user_id, expires_at)
            VALUES (?, ?, ?)
        """, (jti, user_id, expires_at))
        conn.commit()
    finally:
        conn.close()


def is_token_revoked(jti: str) -> bool:
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT 1 FROM revoked_tokens WHERE jti = ?", (jti,)
        ).fetchone()
        return bool(row)
    finally:
        conn.close()


def cleanup_expired_tokens():
    """Очистка устаревших записей (запускать по cron)."""
    conn = get_db()
    try:
        now = int(time.time())
        conn.execute("DELETE FROM revoked_tokens WHERE expires_at < ?", (now,))
        conn.execute("""
            DELETE FROM rate_limits
            WHERE window_start < ? AND blocked_until < ?
        """, (now - 3600, now))
        conn.commit()
    finally:
        conn.close()
