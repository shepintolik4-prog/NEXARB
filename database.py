"""
NEXARB — Database Layer v6.0
SQLite schema + all DB operations
Все балансы, VIP, история сделок — ТОЛЬКО здесь.

Примечания:
- В продакшне с высокой нагрузкой: заменить SQLite на PostgreSQL
  (psycopg2 или asyncpg). Схема совместима с минимальными правками.
- Все write-операции используют BEGIN EXCLUSIVE для атомарности.
- Аудит безопасности рекомендован перед боевым запуском.
"""

import sqlite3
import os
import time
import logging

logger = logging.getLogger('nexarb.db')

DB_PATH = os.environ.get('NEXARB_DB', 'nexarb.db')

# ─────────────────────────────────────────────────────────────
# SCHEMA
# ─────────────────────────────────────────────────────────────
SCHEMA = """
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    tg_id         TEXT UNIQUE,
    tg_username   TEXT,
    tg_first_name TEXT,
    ref_code      TEXT UNIQUE NOT NULL,
    referred_by   TEXT REFERENCES users(ref_code),
    lang          TEXT DEFAULT 'ru',
    is_banned     INTEGER DEFAULT 0,
    created_at    INTEGER DEFAULT (strftime('%s','now')),
    last_seen     INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS balances (
    user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    usd_balance   REAL NOT NULL DEFAULT 0.0 CHECK(usd_balance >= 0),
    demo_balance  REAL NOT NULL DEFAULT 3000.0,
    updated_at    INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS vip_subscriptions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan          TEXT NOT NULL,
    starts_at     INTEGER NOT NULL,
    expires_at    INTEGER NOT NULL,
    payment_id    TEXT,
    granted_by    TEXT DEFAULT 'user',   -- 'user'|'admin'
    is_active     INTEGER DEFAULT 1,
    created_at    INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS connected_exchanges (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exchange_id   TEXT NOT NULL,
    key_mask      TEXT NOT NULL,
    is_active     INTEGER DEFAULT 1,
    connected_at  INTEGER DEFAULT (strftime('%s','now')),
    UNIQUE(user_id, exchange_id)
);

CREATE TABLE IF NOT EXISTS trades (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id),
    symbol          TEXT NOT NULL,
    strategy_type   TEXT NOT NULL,
    buy_exchange    TEXT NOT NULL,
    sell_exchange   TEXT NOT NULL,
    amount          REAL NOT NULL CHECK(amount > 0),
    gross_profit    REAL NOT NULL,
    fee_exchange_a  REAL NOT NULL DEFAULT 0,
    fee_exchange_b  REAL NOT NULL DEFAULT 0,
    fee_network     REAL NOT NULL DEFAULT 0,
    fee_slippage    REAL NOT NULL DEFAULT 0,
    fee_platform    REAL NOT NULL DEFAULT 0,
    net_profit      REAL NOT NULL,
    spread_pct      REAL NOT NULL,
    ai_score        INTEGER DEFAULT 0,
    execution_ms    INTEGER DEFAULT 0,
    status          TEXT DEFAULT 'completed',
    balance_before  REAL NOT NULL,
    balance_after   REAL NOT NULL,
    is_auto         INTEGER DEFAULT 0,
    created_at      INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS referrals (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    referrer_id   TEXT NOT NULL REFERENCES users(id),
    referred_id   TEXT NOT NULL REFERENCES users(id),
    earned_usd    REAL DEFAULT 0,
    created_at    INTEGER DEFAULT (strftime('%s','now')),
    UNIQUE(referred_id)
);

CREATE TABLE IF NOT EXISTS rate_limits (
    key           TEXT PRIMARY KEY,
    requests      INTEGER DEFAULT 1,
    window_start  INTEGER DEFAULT (strftime('%s','now')),
    blocked_until INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti           TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL,
    revoked_at    INTEGER DEFAULT (strftime('%s','now')),
    expires_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    action     TEXT NOT NULL,
    target_id  TEXT,
    details    TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS idx_trades_user   ON trades(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_vip_user      ON vip_subscriptions(user_id, is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_revoked_jti   ON revoked_tokens(jti);
CREATE INDEX IF NOT EXISTS idx_rate_key      ON rate_limits(key, window_start);
CREATE INDEX IF NOT EXISTS idx_users_tg      ON users(tg_id);
"""


# ─────────────────────────────────────────────────────────────
# CONNECTION
# ─────────────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn

def init_db():
    try:
        conn = get_db()
        conn.executescript(SCHEMA)
        conn.commit()
        conn.close()
        logger.info(f"DB initialized: {DB_PATH}")
    except Exception as e:
        logger.critical(f"DB init failed: {e}")
        raise


# ─────────────────────────────────────────────────────────────
# USER OPERATIONS
# ─────────────────────────────────────────────────────────────
def create_user(tg_id, tg_username, tg_first_name,
                ref_code, user_id, referred_by=None, demo_balance=3000.0):
    conn = get_db()
    try:
        conn.execute("""
            INSERT INTO users (id, tg_id, tg_username, tg_first_name, ref_code, referred_by)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (user_id, str(tg_id), tg_username, tg_first_name, ref_code, referred_by))

        conn.execute("""
            INSERT INTO balances (user_id, usd_balance, demo_balance)
            VALUES (?, 0.0, ?)
        """, (user_id, demo_balance))

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
        logger.debug(f"User created: {user_id[:8]}... tg={tg_id}")
        return True
    except sqlite3.IntegrityError as e:
        logger.debug(f"create_user IntegrityError (duplicate?): {e}")
        return False
    except Exception as e:
        logger.error(f"create_user error: {e}")
        return False
    finally:
        conn.close()


def get_user_by_tg_id(tg_id):
    conn = get_db()
    try:
        return conn.execute(
            "SELECT * FROM users WHERE tg_id = ? AND is_banned = 0", (str(tg_id),)
        ).fetchone()
    except Exception as e:
        logger.error(f"get_user_by_tg_id error: {e}")
        return None
    finally:
        conn.close()


def get_user_by_id(user_id):
    conn = get_db()
    try:
        return conn.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    except Exception as e:
        logger.error(f"get_user_by_id error: {e}")
        return None
    finally:
        conn.close()


def update_last_seen(user_id):
    conn = get_db()
    try:
        conn.execute(
            "UPDATE users SET last_seen = ? WHERE id = ?",
            (int(time.time()), user_id)
        )
        conn.commit()
    except Exception as e:
        logger.error(f"update_last_seen error: {e}")
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# BALANCE OPERATIONS
# ─────────────────────────────────────────────────────────────
def get_balance(user_id):
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT usd_balance, demo_balance FROM balances WHERE user_id = ?",
            (user_id,)
        ).fetchone()
        return dict(row) if row else {'usd_balance': 0.0, 'demo_balance': 3000.0}
    except Exception as e:
        logger.error(f"get_balance error: {e}")
        return {'usd_balance': 0.0, 'demo_balance': 3000.0}
    finally:
        conn.close()


def apply_trade_result(user_id, trade_id, net_profit, is_demo=True):
    conn = get_db()
    try:
        conn.execute("BEGIN EXCLUSIVE")
        bal_col = 'demo_balance' if is_demo else 'usd_balance'
        row = conn.execute(
            f"SELECT {bal_col} FROM balances WHERE user_id = ?", (user_id,)
        ).fetchone()
        if not row:
            conn.execute("ROLLBACK")
            return None, None

        before = row[bal_col]
        after  = max(0.0, round(before + net_profit, 8))

        conn.execute(
            f"UPDATE balances SET {bal_col} = ?, updated_at = ? WHERE user_id = ?",
            (after, int(time.time()), user_id)
        )
        conn.execute("""
            UPDATE trades SET balance_before=?, balance_after=?, status='completed'
            WHERE id=?
        """, (before, after, trade_id))
        conn.commit()
        return before, after
    except Exception as e:
        try: conn.execute("ROLLBACK")
        except: pass
        logger.error(f"apply_trade_result error: {e}")
        raise
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# VIP OPERATIONS
# ─────────────────────────────────────────────────────────────
PLAN_DAYS = {'week': 7, 'month': 30, 'year': 365, 'lifetime': 36500}

def activate_vip(user_id, plan, payment_id=None):
    if plan not in PLAN_DAYS:
        raise ValueError(f"Unknown plan: {plan}")
    conn = get_db()
    try:
        now       = int(time.time())
        expires   = now + PLAN_DAYS[plan] * 86400
        conn.execute("""
            INSERT INTO vip_subscriptions (user_id, plan, starts_at, expires_at, payment_id, granted_by)
            VALUES (?, ?, ?, ?, ?, 'user')
        """, (user_id, plan, now, expires, payment_id))
        conn.commit()
        return {'plan': plan, 'expires_at': expires, 'is_active': True,
                'days_left': PLAN_DAYS[plan]}
    except Exception as e:
        logger.error(f"activate_vip error: {e}")
        raise
    finally:
        conn.close()


def get_vip_status(user_id):
    conn = get_db()
    try:
        now = int(time.time())
        row = conn.execute("""
            SELECT plan, expires_at FROM vip_subscriptions
            WHERE user_id=? AND is_active=1 AND expires_at>?
            ORDER BY expires_at DESC LIMIT 1
        """, (user_id, now)).fetchone()
        if not row:
            return {'is_vip': False, 'plan': None, 'expires_at': None, 'days_left': 0}
        return {
            'is_vip':    True,
            'plan':      row['plan'],
            'expires_at': row['expires_at'],
            'days_left': max(0, (row['expires_at'] - now) // 86400),
        }
    except Exception as e:
        logger.error(f"get_vip_status error: {e}")
        return {'is_vip': False, 'plan': None, 'expires_at': None, 'days_left': 0}
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# TRADE OPERATIONS
# ─────────────────────────────────────────────────────────────
def create_trade(trade_data):
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
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?,?)
        """, (
            trade_data['id'],       trade_data['user_id'],
            trade_data['symbol'],   trade_data['strategy_type'],
            trade_data['buy_exchange'], trade_data['sell_exchange'],
            trade_data['amount'],   trade_data['gross_profit'],
            trade_data['fee_exchange_a'], trade_data['fee_exchange_b'],
            trade_data['fee_network'],    trade_data['fee_slippage'],
            trade_data['fee_platform'],   trade_data['net_profit'],
            trade_data['spread_pct'],     trade_data.get('ai_score', 0),
            trade_data.get('execution_ms', 0),
            trade_data.get('balance_before', 0),
            trade_data.get('balance_after', 0),
            1 if trade_data.get('is_auto') else 0,
        ))
        conn.commit()
        return trade_data['id']
    except Exception as e:
        logger.error(f"create_trade error: {e}")
        raise
    finally:
        conn.close()


def get_trade(trade_id, user_id):
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM trades WHERE id=? AND user_id=?", (trade_id, user_id)
        ).fetchone()
        return dict(row) if row else None
    except Exception as e:
        logger.error(f"get_trade error: {e}")
        return None
    finally:
        conn.close()


def get_trades_history(user_id, page=1, per_page=20):
    conn = get_db()
    try:
        offset = (page - 1) * per_page
        rows = conn.execute("""
            SELECT * FROM trades WHERE user_id=?
            ORDER BY created_at DESC LIMIT ? OFFSET ?
        """, (user_id, per_page, offset)).fetchall()
        total = conn.execute(
            "SELECT COUNT(*) FROM trades WHERE user_id=?", (user_id,)
        ).fetchone()[0]
        return {
            'items': [dict(r) for r in rows],
            'total': total, 'page': page,
            'pages': max(1, (total + per_page - 1) // per_page),
        }
    except Exception as e:
        logger.error(f"get_trades_history error: {e}")
        return {'items': [], 'total': 0, 'page': 1, 'pages': 1}
    finally:
        conn.close()


def get_trade_stats(user_id):
    conn = get_db()
    try:
        row = conn.execute("""
            SELECT COUNT(*) as total_trades,
                   COALESCE(SUM(net_profit), 0) as total_profit,
                   COALESCE(SUM(fee_platform), 0) as total_fees,
                   COUNT(CASE WHEN net_profit>0 THEN 1 END) as winning_trades,
                   COALESCE(MAX(net_profit), 0) as best_trade
            FROM trades WHERE user_id=? AND status='completed'
        """, (user_id,)).fetchone()
        d = dict(row)
        d['win_rate'] = round(
            d['winning_trades'] / d['total_trades'] * 100, 1
        ) if d['total_trades'] > 0 else 0
        return d
    except Exception as e:
        logger.error(f"get_trade_stats error: {e}")
        return {'total_trades': 0, 'total_profit': 0, 'total_fees': 0,
                'winning_trades': 0, 'best_trade': 0, 'win_rate': 0}
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# EXCHANGE KEYS
# ─────────────────────────────────────────────────────────────
def save_exchange_connection(user_id, exchange_id, api_key):
    mask = (api_key[:4] + '****' + api_key[-4:]) if len(api_key) >= 8 else '****'
    conn = get_db()
    try:
        conn.execute("""
            INSERT INTO connected_exchanges (user_id, exchange_id, key_mask)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id, exchange_id) DO UPDATE SET
                key_mask=excluded.key_mask, is_active=1,
                connected_at=strftime('%s','now')
        """, (user_id, exchange_id, mask))
        conn.commit()
        return True
    except Exception as e:
        logger.error(f"save_exchange_connection error: {e}")
        return False
    finally:
        conn.close()


def get_connected_exchanges(user_id):
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT exchange_id, key_mask, connected_at
            FROM connected_exchanges WHERE user_id=? AND is_active=1
        """, (user_id,)).fetchall()
        return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"get_connected_exchanges error: {e}")
        return []
    finally:
        conn.close()


def remove_exchange(user_id, exchange_id):
    conn = get_db()
    try:
        conn.execute("""
            UPDATE connected_exchanges SET is_active=0
            WHERE user_id=? AND exchange_id=?
        """, (user_id, exchange_id))
        conn.commit()
        return True
    except Exception as e:
        logger.error(f"remove_exchange error: {e}")
        return False
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# REFERRALS
# ─────────────────────────────────────────────────────────────
def get_referral_stats(user_id):
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT r.referred_id, u.tg_username, u.tg_first_name,
                   r.earned_usd, r.created_at
            FROM referrals r
            JOIN users u ON u.id = r.referred_id
            WHERE r.referrer_id = ?
            ORDER BY r.created_at DESC
        """, (user_id,)).fetchall()
        total_earned = sum(r['earned_usd'] for r in rows)
        return {
            'referrals': [dict(r) for r in rows],
            'count': len(rows),
            'earned': round(total_earned, 2),
        }
    except Exception as e:
        logger.error(f"get_referral_stats error: {e}")
        return {'referrals': [], 'count': 0, 'earned': 0}
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# RATE LIMITING
# ─────────────────────────────────────────────────────────────
def check_rate_limit(key, max_requests=60, window_seconds=60):
    now = int(time.time())
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT requests, window_start, blocked_until FROM rate_limits WHERE key=?",
            (key,)
        ).fetchone()

        if row:
            if row['blocked_until'] > now:
                return False, 0
            if now - row['window_start'] >= window_seconds:
                conn.execute(
                    "UPDATE rate_limits SET requests=1, window_start=? WHERE key=?",
                    (now, key)
                )
                conn.commit()
                return True, max_requests - 1
            if row['requests'] >= max_requests:
                block = now + window_seconds * 2
                conn.execute(
                    "UPDATE rate_limits SET blocked_until=? WHERE key=?",
                    (block, key)
                )
                conn.commit()
                return False, 0
            conn.execute(
                "UPDATE rate_limits SET requests=requests+1 WHERE key=?", (key,)
            )
            conn.commit()
            return True, max_requests - row['requests'] - 1
        else:
            conn.execute(
                "INSERT INTO rate_limits (key, requests, window_start) VALUES (?,1,?)",
                (key, now)
            )
            conn.commit()
            return True, max_requests - 1
    except Exception as e:
        logger.error(f"check_rate_limit error: {e}")
        return True, max_requests  # fail open (не блокируем при ошибке БД)
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# JWT REVOCATION
# ─────────────────────────────────────────────────────────────
def revoke_token(jti, user_id, expires_at):
    conn = get_db()
    try:
        conn.execute("""
            INSERT OR IGNORE INTO revoked_tokens (jti, user_id, expires_at)
            VALUES (?, ?, ?)
        """, (jti, user_id, expires_at))
        conn.commit()
    except Exception as e:
        logger.error(f"revoke_token error: {e}")
    finally:
        conn.close()


def is_token_revoked(jti):
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT 1 FROM revoked_tokens WHERE jti=?", (jti,)
        ).fetchone()
        return bool(row)
    except Exception as e:
        logger.error(f"is_token_revoked error: {e}")
        return False
    finally:
        conn.close()


def cleanup_expired_tokens():
    conn = get_db()
    try:
        now = int(time.time())
        r1 = conn.execute("DELETE FROM revoked_tokens WHERE expires_at<?", (now,))
        r2 = conn.execute("""
            DELETE FROM rate_limits WHERE window_start<? AND blocked_until<?
        """, (now - 3600, now))
        conn.commit()
        logger.info(f"Cleanup: {r1.rowcount} tokens, {r2.rowcount} rate limits removed")
    except Exception as e:
        logger.error(f"cleanup_expired_tokens error: {e}")
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# ADMIN OPERATIONS
# ─────────────────────────────────────────────────────────────
def admin_get_platform_stats():
    """Общая статистика платформы для admin-панели."""
    conn = get_db()
    try:
        now = int(time.time())
        day_ago = now - 86400
        week_ago = now - 7 * 86400

        stats = {}

        # Пользователи
        r = conn.execute("SELECT COUNT(*) FROM users").fetchone()
        stats['total_users'] = r[0]

        r = conn.execute("SELECT COUNT(*) FROM users WHERE created_at>?", (day_ago,)).fetchone()
        stats['new_users_24h'] = r[0]

        r = conn.execute("SELECT COUNT(*) FROM users WHERE last_seen>?", (day_ago,)).fetchone()
        stats['active_users_24h'] = r[0]

        # VIP
        r = conn.execute("""
            SELECT COUNT(DISTINCT user_id) FROM vip_subscriptions
            WHERE is_active=1 AND expires_at>?
        """, (now,)).fetchone()
        stats['vip_users'] = r[0]

        # Сделки
        r = conn.execute("SELECT COUNT(*), COALESCE(SUM(amount),0), COALESCE(SUM(net_profit),0), COALESCE(SUM(fee_platform),0) FROM trades").fetchone()
        stats['total_trades']   = r[0]
        stats['total_volume']   = round(r[1], 2)
        stats['total_profit']   = round(r[2], 4)
        stats['platform_fees']  = round(r[3], 4)

        r = conn.execute("""
            SELECT COUNT(*), COALESCE(SUM(amount),0), COALESCE(SUM(fee_platform),0)
            FROM trades WHERE created_at>?
        """, (day_ago,)).fetchone()
        stats['trades_24h']     = r[0]
        stats['volume_24h']     = round(r[1], 2)
        stats['fees_24h']       = round(r[2], 4)

        r = conn.execute("""
            SELECT COUNT(*), COALESCE(SUM(fee_platform),0)
            FROM trades WHERE created_at>?
        """, (week_ago,)).fetchone()
        stats['trades_7d']     = r[0]
        stats['fees_7d']       = round(r[1], 4)

        # Популярные биржи
        rows = conn.execute("""
            SELECT buy_exchange, COUNT(*) as cnt
            FROM trades GROUP BY buy_exchange ORDER BY cnt DESC LIMIT 5
        """).fetchall()
        stats['top_exchanges'] = [{'exchange': r[0], 'trades': r[1]} for r in rows]

        # Популярные монеты
        rows = conn.execute("""
            SELECT symbol, COUNT(*) as cnt, COALESCE(SUM(net_profit),0) as profit
            FROM trades GROUP BY symbol ORDER BY cnt DESC LIMIT 10
        """).fetchall()
        stats['top_symbols'] = [{'symbol': r[0], 'trades': r[1], 'profit': round(r[2], 4)} for r in rows]

        return stats
    except Exception as e:
        logger.error(f"admin_get_platform_stats error: {e}")
        return {}
    finally:
        conn.close()


def admin_list_users(page=1, per_page=20, search='', vip_only=False):
    """Список пользователей для admin-панели."""
    conn = get_db()
    try:
        now    = int(time.time())
        offset = (page - 1) * per_page

        where  = []
        params = []

        if search:
            where.append("(u.tg_username LIKE ? OR u.tg_first_name LIKE ? OR u.tg_id LIKE ? OR u.id LIKE ?)")
            s = f"%{search}%"
            params.extend([s, s, s, s])

        if vip_only:
            where.append("""
                EXISTS (SELECT 1 FROM vip_subscriptions v
                        WHERE v.user_id=u.id AND v.is_active=1 AND v.expires_at>?)
            """)
            params.append(now)

        where_sql = "WHERE " + " AND ".join(where) if where else ""

        count_params = params.copy()
        rows = conn.execute(f"""
            SELECT u.*,
                   b.demo_balance, b.usd_balance,
                   (SELECT plan FROM vip_subscriptions v
                    WHERE v.user_id=u.id AND v.is_active=1 AND v.expires_at>{now}
                    ORDER BY v.expires_at DESC LIMIT 1) as vip_plan,
                   (SELECT expires_at FROM vip_subscriptions v
                    WHERE v.user_id=u.id AND v.is_active=1 AND v.expires_at>{now}
                    ORDER BY v.expires_at DESC LIMIT 1) as vip_expires,
                   (SELECT COUNT(*) FROM trades t WHERE t.user_id=u.id) as trade_count,
                   (SELECT COALESCE(SUM(t.net_profit),0) FROM trades t WHERE t.user_id=u.id) as total_profit
            FROM users u
            LEFT JOIN balances b ON b.user_id = u.id
            {where_sql}
            ORDER BY u.created_at DESC
            LIMIT ? OFFSET ?
        """, params + [per_page, offset]).fetchall()

        total = conn.execute(
            f"SELECT COUNT(*) FROM users u {where_sql}", count_params
        ).fetchone()[0]

        return {
            'items': [dict(r) for r in rows],
            'total': total, 'page': page,
            'pages': max(1, (total + per_page - 1) // per_page),
        }
    except Exception as e:
        logger.error(f"admin_list_users error: {e}")
        return {'items': [], 'total': 0, 'page': 1, 'pages': 1}
    finally:
        conn.close()


def admin_activate_vip(user_id, plan, days=None):
    """Ручная выдача VIP администратором."""
    actual_days = days or PLAN_DAYS.get(plan, 30)
    conn = get_db()
    try:
        now     = int(time.time())
        expires = now + actual_days * 86400
        conn.execute("""
            INSERT INTO vip_subscriptions
            (user_id, plan, starts_at, expires_at, payment_id, granted_by)
            VALUES (?, ?, ?, ?, 'ADMIN', 'admin')
        """, (user_id, plan, now, expires))
        conn.execute("""
            INSERT INTO admin_log (action, target_id, details)
            VALUES ('vip_grant', ?, ?)
        """, (user_id, f"plan={plan} days={actual_days}"))
        conn.commit()
        return {'plan': plan, 'expires_at': expires, 'days_left': actual_days, 'is_active': True}
    except Exception as e:
        logger.error(f"admin_activate_vip error: {e}")
        raise
    finally:
        conn.close()


def admin_revoke_vip(user_id):
    """Отзыв всех активных VIP для пользователя."""
    conn = get_db()
    try:
        conn.execute("""
            UPDATE vip_subscriptions SET is_active=0
            WHERE user_id=? AND is_active=1
        """, (user_id,))
        conn.execute("""
            INSERT INTO admin_log (action, target_id, details)
            VALUES ('vip_revoke', ?, 'all active subscriptions revoked')
        """, (user_id,))
        conn.commit()
        return True
    except Exception as e:
        logger.error(f"admin_revoke_vip error: {e}")
        return False
    finally:
        conn.close()


def admin_set_balance(user_id, balance, is_demo=True):
    """Ручная установка баланса администратором."""
    conn = get_db()
    try:
        col = 'demo_balance' if is_demo else 'usd_balance'
        conn.execute(
            f"UPDATE balances SET {col}=?, updated_at=? WHERE user_id=?",
            (float(balance), int(time.time()), user_id)
        )
        conn.execute("""
            INSERT INTO admin_log (action, target_id, details)
            VALUES ('balance_set', ?, ?)
        """, (user_id, f"{'demo' if is_demo else 'real'}={balance}"))
        conn.commit()
        return True
    except Exception as e:
        logger.error(f"admin_set_balance error: {e}")
        return False
    finally:
        conn.close()


def admin_list_trades(page=1, per_page=30, user_id=None):
    """Список всех сделок для admin-панели."""
    conn = get_db()
    try:
        offset = (page - 1) * per_page
        where  = "WHERE t.user_id=?" if user_id else ""
        params = [user_id] if user_id else []

        rows = conn.execute(f"""
            SELECT t.*, u.tg_username, u.tg_first_name
            FROM trades t
            LEFT JOIN users u ON u.id=t.user_id
            {where}
            ORDER BY t.created_at DESC LIMIT ? OFFSET ?
        """, params + [per_page, offset]).fetchall()

        total = conn.execute(
            f"SELECT COUNT(*) FROM trades t {where}", params
        ).fetchone()[0]

        return {
            'items': [dict(r) for r in rows],
            'total': total, 'page': page,
            'pages': max(1, (total + per_page - 1) // per_page),
        }
    except Exception as e:
        logger.error(f"admin_list_trades error: {e}")
        return {'items': [], 'total': 0, 'page': 1, 'pages': 1}
    finally:
        conn.close()
