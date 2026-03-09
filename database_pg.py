"""
NEXARB — Database Layer v6.0 (PostgreSQL / Supabase)
Замена SQLite на PostgreSQL для боевого деплоя.

Использует только stdlib urllib + json для подключения к Supabase REST API,
ИЛИ psycopg2 если доступен (быстрее).

Env переменные (задать в Railway):
  DATABASE_URL=postgresql://user:pass@host:5432/dbname
"""

import os
import time
import json
import logging

logger = logging.getLogger('nexarb.db')

DB_URL = os.environ.get('DATABASE_URL', '')

# ─────────────────────────────────────────────────────────────
# ПОДКЛЮЧЕНИЕ
# ─────────────────────────────────────────────────────────────
try:
    import psycopg2
    import psycopg2.extras
    _USE_PSYCOPG2 = True
    logger.info("Using psycopg2 for PostgreSQL")
except ImportError:
    _USE_PSYCOPG2 = False
    logger.warning("psycopg2 not available — install it: pip install psycopg2-binary")

def get_db():
    """Возвращает соединение с PostgreSQL."""
    if not DB_URL:
        raise RuntimeError("DATABASE_URL not set!")
    if not _USE_PSYCOPG2:
        raise RuntimeError("psycopg2 not installed. Run: pip install psycopg2-binary")
    conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    return conn

def row_to_dict(row):
    if row is None:
        return None
    return dict(row)

# ─────────────────────────────────────────────────────────────
# SCHEMA
# ─────────────────────────────────────────────────────────────
SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    tg_id         TEXT UNIQUE,
    tg_username   TEXT,
    tg_first_name TEXT,
    ref_code      TEXT UNIQUE NOT NULL,
    referred_by   TEXT,
    lang          TEXT DEFAULT 'ru',
    is_banned     INTEGER DEFAULT 0,
    created_at    BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
    last_seen     BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
);

CREATE TABLE IF NOT EXISTS balances (
    user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    usd_balance   REAL NOT NULL DEFAULT 0.0,
    demo_balance  REAL NOT NULL DEFAULT 3000.0,
    updated_at    BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
);

CREATE TABLE IF NOT EXISTS vip_subscriptions (
    id            SERIAL PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan          TEXT NOT NULL,
    starts_at     BIGINT NOT NULL,
    expires_at    BIGINT NOT NULL,
    payment_id    TEXT,
    granted_by    TEXT DEFAULT 'user',
    is_active     INTEGER DEFAULT 1,
    created_at    BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
);

CREATE TABLE IF NOT EXISTS connected_exchanges (
    id            SERIAL PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exchange_id   TEXT NOT NULL,
    key_mask      TEXT NOT NULL,
    is_active     INTEGER DEFAULT 1,
    connected_at  BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
    UNIQUE(user_id, exchange_id)
);

CREATE TABLE IF NOT EXISTS trades (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id),
    symbol          TEXT NOT NULL,
    strategy_type   TEXT NOT NULL,
    buy_exchange    TEXT NOT NULL,
    sell_exchange   TEXT NOT NULL,
    amount          REAL NOT NULL,
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
    created_at      BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
);

CREATE TABLE IF NOT EXISTS referrals (
    id            SERIAL PRIMARY KEY,
    referrer_id   TEXT NOT NULL REFERENCES users(id),
    referred_id   TEXT NOT NULL REFERENCES users(id),
    earned_usd    REAL DEFAULT 0,
    created_at    BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
    UNIQUE(referred_id)
);

CREATE TABLE IF NOT EXISTS rate_limits (
    key           TEXT PRIMARY KEY,
    requests      INTEGER DEFAULT 1,
    window_start  BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
    blocked_until BIGINT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti           TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL,
    revoked_at    BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
    expires_at    BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_log (
    id         SERIAL PRIMARY KEY,
    action     TEXT NOT NULL,
    target_id  TEXT,
    details    TEXT,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
);

CREATE INDEX IF NOT EXISTS idx_trades_user   ON trades(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vip_user      ON vip_subscriptions(user_id, is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_revoked_jti   ON revoked_tokens(jti);
CREATE INDEX IF NOT EXISTS idx_users_tg      ON users(tg_id);
"""

def init_db():
    """Создаёт таблицы если не существуют."""
    try:
        conn = get_db()
        cur  = conn.cursor()
        # Выполняем каждый CREATE отдельно
        for stmt in SCHEMA.strip().split(';'):
            stmt = stmt.strip()
            if stmt:
                cur.execute(stmt)
        conn.commit()
        cur.close()
        conn.close()
        logger.info("PostgreSQL DB initialized")
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
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO users (id, tg_id, tg_username, tg_first_name, ref_code, referred_by)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (user_id, str(tg_id), tg_username, tg_first_name, ref_code, referred_by))

        cur.execute("""
            INSERT INTO balances (user_id, usd_balance, demo_balance)
            VALUES (%s, 0.0, %s)
        """, (user_id, demo_balance))

        if referred_by:
            cur.execute("SELECT id FROM users WHERE ref_code = %s", (referred_by,))
            referrer = cur.fetchone()
            if referrer:
                cur.execute("""
                    INSERT INTO referrals (referrer_id, referred_id)
                    VALUES (%s, %s) ON CONFLICT (referred_id) DO NOTHING
                """, (referrer['id'], user_id))

        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        logger.debug(f"create_user error (duplicate?): {e}")
        return False
    finally:
        conn.close()


def get_user_by_tg_id(tg_id):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE tg_id = %s AND is_banned = 0", (str(tg_id),))
        return row_to_dict(cur.fetchone())
    except Exception as e:
        logger.error(f"get_user_by_tg_id: {e}")
        return None
    finally:
        conn.close()


def get_user_by_id(user_id):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        return row_to_dict(cur.fetchone())
    except Exception as e:
        logger.error(f"get_user_by_id: {e}")
        return None
    finally:
        conn.close()


def update_last_seen(user_id):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("UPDATE users SET last_seen = %s WHERE id = %s",
                    (int(time.time()), user_id))
        conn.commit()
    except Exception as e:
        logger.error(f"update_last_seen: {e}")
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# BALANCE
# ─────────────────────────────────────────────────────────────
def get_balance(user_id):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT usd_balance, demo_balance FROM balances WHERE user_id = %s",
                    (user_id,))
        row = cur.fetchone()
        return dict(row) if row else {'usd_balance': 0.0, 'demo_balance': 3000.0}
    except Exception as e:
        logger.error(f"get_balance: {e}")
        return {'usd_balance': 0.0, 'demo_balance': 3000.0}
    finally:
        conn.close()


def reserve_balance(user_id: str, amount: float, is_demo: bool = True) -> bool:
    """
    Атомарно проверяет и вычитает amount из баланса (PostgreSQL FOR UPDATE).
    Возвращает True если резерв успешен, False если баланса недостаточно.
    """
    col  = 'demo_balance' if is_demo else 'usd_balance'
    conn = get_db()
    try:
        cur = conn.cursor()
        # FOR UPDATE блокирует строку — защита от конкурентных трейдов
        cur.execute(
            f"SELECT {col} FROM balances WHERE user_id = %s FOR UPDATE",
            (user_id,)
        )
        row = cur.fetchone()
        if not row or float(row[col]) < amount:
            conn.rollback()
            return False
        cur.execute(
            f"UPDATE balances SET {col} = {col} - %s WHERE user_id = %s",
            (amount, user_id)
        )
        conn.commit()
        return True
    except Exception as e:
        try: conn.rollback()
        except: pass
        logger.error(f"reserve_balance: {e}")
        return False
    finally:
        conn.close()


def release_balance(user_id: str, amount: float, is_demo: bool = True) -> None:
    """Откатывает резерв при ошибке трейда."""
    col  = 'demo_balance' if is_demo else 'usd_balance'
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            f"UPDATE balances SET {col} = {col} + %s WHERE user_id = %s",
            (amount, user_id)
        )
        conn.commit()
    except Exception as e:
        logger.error(f"release_balance: {e}")
    finally:
        conn.close()


def apply_trade_result(user_id, trade_id, net_profit, is_demo=True):
    conn = get_db()
    try:
        cur = conn.cursor()
        col = 'demo_balance' if is_demo else 'usd_balance'
        # Блокируем строку
        cur.execute(f"SELECT {col} FROM balances WHERE user_id = %s FOR UPDATE",
                    (user_id,))
        row = cur.fetchone()
        if not row:
            return None, None

        before = row[col]
        after  = max(0.0, round(before + net_profit, 8))

        cur.execute(
            f"UPDATE balances SET {col} = %s, updated_at = %s WHERE user_id = %s",
            (after, int(time.time()), user_id)
        )
        cur.execute("""
            UPDATE trades SET balance_before=%s, balance_after=%s, status='completed'
            WHERE id=%s
        """, (before, after, trade_id))
        conn.commit()
        return before, after
    except Exception as e:
        conn.rollback()
        logger.error(f"apply_trade_result: {e}")
        raise
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# VIP
# ─────────────────────────────────────────────────────────────
PLAN_DAYS = {'week': 7, 'month': 30, 'year': 365, 'lifetime': 36500}

def activate_vip(user_id, plan, payment_id=None):
    if plan not in PLAN_DAYS:
        raise ValueError(f"Unknown plan: {plan}")
    conn = get_db()
    try:
        now     = int(time.time())
        expires = now + PLAN_DAYS[plan] * 86400
        cur     = conn.cursor()
        cur.execute("""
            INSERT INTO vip_subscriptions
            (user_id, plan, starts_at, expires_at, payment_id, granted_by)
            VALUES (%s, %s, %s, %s, %s, 'user')
        """, (user_id, plan, now, expires, payment_id))
        conn.commit()
        return {'plan': plan, 'expires_at': expires, 'is_active': True,
                'days_left': PLAN_DAYS[plan]}
    except Exception as e:
        conn.rollback()
        logger.error(f"activate_vip: {e}")
        raise
    finally:
        conn.close()


def get_vip_status(user_id):
    conn = get_db()
    try:
        now = int(time.time())
        cur = conn.cursor()
        cur.execute("""
            SELECT plan, expires_at FROM vip_subscriptions
            WHERE user_id=%s AND is_active=1 AND expires_at>%s
            ORDER BY expires_at DESC LIMIT 1
        """, (user_id, now))
        row = cur.fetchone()
        if not row:
            return {'is_vip': False, 'plan': None, 'expires_at': None, 'days_left': 0}
        return {
            'is_vip':     True,
            'plan':       row['plan'],
            'expires_at': row['expires_at'],
            'days_left':  max(0, (row['expires_at'] - now) // 86400),
        }
    except Exception as e:
        logger.error(f"get_vip_status: {e}")
        return {'is_vip': False, 'plan': None, 'expires_at': None, 'days_left': 0}
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# TRADES
# ─────────────────────────────────────────────────────────────
def create_trade(trade_data):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO trades (
                id, user_id, symbol, strategy_type,
                buy_exchange, sell_exchange, amount,
                gross_profit, fee_exchange_a, fee_exchange_b,
                fee_network, fee_slippage, fee_platform,
                net_profit, spread_pct, ai_score, execution_ms,
                status, balance_before, balance_after, is_auto
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, (
            trade_data['id'],       trade_data['user_id'],
            trade_data['symbol'],   trade_data['strategy_type'],
            trade_data['buy_exchange'], trade_data['sell_exchange'],
            trade_data['amount'],   trade_data['gross_profit'],
            trade_data['fee_exchange_a'], trade_data['fee_exchange_b'],
            trade_data['fee_network'],    trade_data['fee_slippage'],
            trade_data['fee_platform'],   trade_data['net_profit'],
            trade_data['spread_pct'],     trade_data.get('ai_score', 0),
            trade_data.get('execution_ms', 0), 'pending',
            trade_data.get('balance_before', 0),
            trade_data.get('balance_after', 0),
            1 if trade_data.get('is_auto') else 0,
        ))
        conn.commit()
        return trade_data['id']
    except Exception as e:
        conn.rollback()
        logger.error(f"create_trade: {e}")
        raise
    finally:
        conn.close()


def get_trade(trade_id, user_id):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM trades WHERE id=%s AND user_id=%s",
                    (trade_id, user_id))
        return row_to_dict(cur.fetchone())
    except Exception as e:
        logger.error(f"get_trade: {e}")
        return None
    finally:
        conn.close()


def get_trades_history(user_id, page=1, per_page=20):
    conn = get_db()
    try:
        offset = (page - 1) * per_page
        cur = conn.cursor()
        cur.execute("""
            SELECT * FROM trades WHERE user_id=%s
            ORDER BY created_at DESC LIMIT %s OFFSET %s
        """, (user_id, per_page, offset))
        rows = [dict(r) for r in cur.fetchall()]

        cur.execute("SELECT COUNT(*) FROM trades WHERE user_id=%s", (user_id,))
        total = cur.fetchone()['count']

        return {'items': rows, 'total': total, 'page': page,
                'pages': max(1, (total + per_page - 1) // per_page)}
    except Exception as e:
        logger.error(f"get_trades_history: {e}")
        return {'items': [], 'total': 0, 'page': 1, 'pages': 1}
    finally:
        conn.close()


def get_trade_stats(user_id):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT COUNT(*) as total_trades,
                   COALESCE(SUM(net_profit), 0) as total_profit,
                   COALESCE(SUM(fee_platform), 0) as total_fees,
                   COUNT(CASE WHEN net_profit>0 THEN 1 END) as winning_trades,
                   COALESCE(MAX(net_profit), 0) as best_trade
            FROM trades WHERE user_id=%s AND status='completed'
        """, (user_id,))
        d = dict(cur.fetchone())
        d['win_rate'] = round(
            d['winning_trades'] / d['total_trades'] * 100, 1
        ) if d['total_trades'] > 0 else 0
        return d
    except Exception as e:
        logger.error(f"get_trade_stats: {e}")
        return {'total_trades': 0, 'total_profit': 0, 'total_fees': 0,
                'winning_trades': 0, 'best_trade': 0, 'win_rate': 0}
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# EXCHANGES
# ─────────────────────────────────────────────────────────────
def save_exchange_connection(user_id, exchange_id, api_key):
    mask = (api_key[:4] + '****' + api_key[-4:]) if len(api_key) >= 8 else '****'
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO connected_exchanges (user_id, exchange_id, key_mask)
            VALUES (%s, %s, %s)
            ON CONFLICT (user_id, exchange_id)
            DO UPDATE SET key_mask=%s, is_active=1,
                          connected_at=EXTRACT(EPOCH FROM NOW())
        """, (user_id, exchange_id, mask, mask))
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        logger.error(f"save_exchange_connection: {e}")
        return False
    finally:
        conn.close()


def get_connected_exchanges(user_id):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT exchange_id, key_mask, connected_at
            FROM connected_exchanges WHERE user_id=%s AND is_active=1
        """, (user_id,))
        return [dict(r) for r in cur.fetchall()]
    except Exception as e:
        logger.error(f"get_connected_exchanges: {e}")
        return []
    finally:
        conn.close()


def remove_exchange(user_id, exchange_id):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE connected_exchanges SET is_active=0
            WHERE user_id=%s AND exchange_id=%s
        """, (user_id, exchange_id))
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        logger.error(f"remove_exchange: {e}")
        return False
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# REFERRALS
# ─────────────────────────────────────────────────────────────
def get_referral_stats(user_id):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT r.referred_id, u.tg_username, u.tg_first_name,
                   r.earned_usd, r.created_at
            FROM referrals r
            JOIN users u ON u.id = r.referred_id
            WHERE r.referrer_id = %s
            ORDER BY r.created_at DESC
        """, (user_id,))
        rows = [dict(r) for r in cur.fetchall()]
        return {
            'referrals': rows,
            'count': len(rows),
            'earned': round(sum(r['earned_usd'] for r in rows), 2),
        }
    except Exception as e:
        logger.error(f"get_referral_stats: {e}")
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
        cur = conn.cursor()
        cur.execute(
            "SELECT requests, window_start, blocked_until FROM rate_limits WHERE key=%s",
            (key,)
        )
        row = cur.fetchone()

        if row:
            if row['blocked_until'] > now:
                return False, 0
            if now - row['window_start'] >= window_seconds:
                cur.execute(
                    "UPDATE rate_limits SET requests=1, window_start=%s WHERE key=%s",
                    (now, key)
                )
                conn.commit()
                return True, max_requests - 1
            if row['requests'] >= max_requests:
                block = now + window_seconds * 2
                cur.execute(
                    "UPDATE rate_limits SET blocked_until=%s WHERE key=%s",
                    (block, key)
                )
                conn.commit()
                return False, 0
            cur.execute(
                "UPDATE rate_limits SET requests=requests+1 WHERE key=%s", (key,)
            )
            conn.commit()
            return True, max_requests - row['requests'] - 1
        else:
            cur.execute(
                "INSERT INTO rate_limits (key, requests, window_start) VALUES (%s,1,%s)"
                " ON CONFLICT (key) DO UPDATE SET requests=rate_limits.requests+1",
                (key, now)
            )
            conn.commit()
            return True, max_requests - 1
    except Exception as e:
        logger.error(f"check_rate_limit: {e}")
        return True, max_requests
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# JWT REVOCATION
# ─────────────────────────────────────────────────────────────
def revoke_token(jti, user_id, expires_at):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO revoked_tokens (jti, user_id, expires_at)
            VALUES (%s, %s, %s) ON CONFLICT (jti) DO NOTHING
        """, (jti, user_id, expires_at))
        conn.commit()
    except Exception as e:
        logger.error(f"revoke_token: {e}")
    finally:
        conn.close()


def is_token_revoked(jti):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM revoked_tokens WHERE jti=%s", (jti,))
        return bool(cur.fetchone())
    except Exception as e:
        logger.error(f"is_token_revoked: {e}")
        return False
    finally:
        conn.close()


def cleanup_expired_tokens():
    conn = get_db()
    try:
        now = int(time.time())
        cur = conn.cursor()
        cur.execute("DELETE FROM revoked_tokens WHERE expires_at<%s", (now,))
        cur.execute("""
            DELETE FROM rate_limits
            WHERE window_start<%s AND blocked_until<%s
        """, (now - 3600, now))
        conn.commit()
    except Exception as e:
        logger.error(f"cleanup_expired_tokens: {e}")
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# ADMIN OPERATIONS
# ─────────────────────────────────────────────────────────────
def admin_get_platform_stats():
    conn = get_db()
    try:
        now      = int(time.time())
        day_ago  = now - 86400
        week_ago = now - 7 * 86400
        cur      = conn.cursor()
        stats    = {}

        cur.execute("SELECT COUNT(*) FROM users")
        stats['total_users'] = cur.fetchone()['count']

        cur.execute("SELECT COUNT(*) FROM users WHERE created_at>%s", (day_ago,))
        stats['new_users_24h'] = cur.fetchone()['count']

        cur.execute("SELECT COUNT(*) FROM users WHERE last_seen>%s", (day_ago,))
        stats['active_users_24h'] = cur.fetchone()['count']

        cur.execute("""
            SELECT COUNT(DISTINCT user_id) FROM vip_subscriptions
            WHERE is_active=1 AND expires_at>%s
        """, (now,))
        stats['vip_users'] = cur.fetchone()['count']

        cur.execute("""
            SELECT COUNT(*) as cnt,
                   COALESCE(SUM(amount),0) as vol,
                   COALESCE(SUM(net_profit),0) as prof,
                   COALESCE(SUM(fee_platform),0) as fees
            FROM trades
        """)
        r = cur.fetchone()
        stats.update({'total_trades': r['cnt'], 'total_volume': round(r['vol'],2),
                      'total_profit': round(r['prof'],4), 'platform_fees': round(r['fees'],4)})

        cur.execute("""
            SELECT COUNT(*) as cnt,
                   COALESCE(SUM(amount),0) as vol,
                   COALESCE(SUM(fee_platform),0) as fees
            FROM trades WHERE created_at>%s
        """, (day_ago,))
        r = cur.fetchone()
        stats.update({'trades_24h': r['cnt'], 'volume_24h': round(r['vol'],2),
                      'fees_24h': round(r['fees'],4)})

        cur.execute("""
            SELECT COUNT(*) as cnt, COALESCE(SUM(fee_platform),0) as fees
            FROM trades WHERE created_at>%s
        """, (week_ago,))
        r = cur.fetchone()
        stats.update({'trades_7d': r['cnt'], 'fees_7d': round(r['fees'],4)})

        cur.execute("""
            SELECT buy_exchange, COUNT(*) as cnt
            FROM trades GROUP BY buy_exchange ORDER BY cnt DESC LIMIT 5
        """)
        stats['top_exchanges'] = [{'exchange': r['buy_exchange'], 'trades': r['cnt']}
                                   for r in cur.fetchall()]

        cur.execute("""
            SELECT symbol, COUNT(*) as cnt,
                   COALESCE(SUM(net_profit),0) as profit
            FROM trades GROUP BY symbol ORDER BY cnt DESC LIMIT 10
        """)
        stats['top_symbols'] = [{'symbol': r['symbol'], 'trades': r['cnt'],
                                  'profit': round(r['profit'],4)}
                                  for r in cur.fetchall()]
        return stats
    except Exception as e:
        logger.error(f"admin_get_platform_stats: {e}")
        return {}
    finally:
        conn.close()


def admin_list_users(page=1, per_page=20, search='', vip_only=False):
    conn = get_db()
    try:
        now    = int(time.time())
        offset = (page - 1) * per_page
        cur    = conn.cursor()

        where  = []
        params = []

        if search:
            where.append("(u.tg_username ILIKE %s OR u.tg_first_name ILIKE %s OR u.tg_id ILIKE %s OR u.id ILIKE %s)")
            s = f"%{search}%"
            params.extend([s, s, s, s])

        if vip_only:
            where.append(f"""
                EXISTS (SELECT 1 FROM vip_subscriptions v
                        WHERE v.user_id=u.id AND v.is_active=1 AND v.expires_at>{now})
            """)

        where_sql = "WHERE " + " AND ".join(where) if where else ""

        cur.execute(f"""
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
            LEFT JOIN balances b ON b.user_id=u.id
            {where_sql}
            ORDER BY u.created_at DESC
            LIMIT %s OFFSET %s
        """, params + [per_page, offset])
        rows = [dict(r) for r in cur.fetchall()]

        cur.execute(f"SELECT COUNT(*) FROM users u {where_sql}", params)
        total = cur.fetchone()['count']

        return {'items': rows, 'total': total, 'page': page,
                'pages': max(1, (total + per_page - 1) // per_page)}
    except Exception as e:
        logger.error(f"admin_list_users: {e}")
        return {'items': [], 'total': 0, 'page': 1, 'pages': 1}
    finally:
        conn.close()


def admin_activate_vip(user_id, plan, days=None):
    actual_days = days or PLAN_DAYS.get(plan, 30)
    conn = get_db()
    try:
        now     = int(time.time())
        expires = now + actual_days * 86400
        cur     = conn.cursor()
        cur.execute("""
            INSERT INTO vip_subscriptions
            (user_id, plan, starts_at, expires_at, payment_id, granted_by)
            VALUES (%s, %s, %s, %s, 'ADMIN', 'admin')
        """, (user_id, plan, now, expires))
        cur.execute("""
            INSERT INTO admin_log (action, target_id, details)
            VALUES ('vip_grant', %s, %s)
        """, (user_id, f"plan={plan} days={actual_days}"))
        conn.commit()
        return {'plan': plan, 'expires_at': expires,
                'days_left': actual_days, 'is_active': True}
    except Exception as e:
        conn.rollback()
        logger.error(f"admin_activate_vip: {e}")
        raise
    finally:
        conn.close()


def admin_revoke_vip(user_id):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE vip_subscriptions SET is_active=0
            WHERE user_id=%s AND is_active=1
        """, (user_id,))
        cur.execute("""
            INSERT INTO admin_log (action, target_id, details)
            VALUES ('vip_revoke', %s, 'all active revoked')
        """, (user_id,))
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        logger.error(f"admin_revoke_vip: {e}")
        return False
    finally:
        conn.close()


def admin_set_balance(user_id, balance, is_demo=True):
    conn = get_db()
    try:
        col = 'demo_balance' if is_demo else 'usd_balance'
        cur = conn.cursor()
        cur.execute(
            f"UPDATE balances SET {col}=%s, updated_at=%s WHERE user_id=%s",
            (float(balance), int(time.time()), user_id)
        )
        cur.execute("""
            INSERT INTO admin_log (action, target_id, details)
            VALUES ('balance_set', %s, %s)
        """, (user_id, f"{'demo' if is_demo else 'real'}={balance}"))
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        logger.error(f"admin_set_balance: {e}")
        return False
    finally:
        conn.close()


def admin_list_trades(page=1, per_page=30, user_id=None):
    conn = get_db()
    try:
        offset = (page - 1) * per_page
        cur    = conn.cursor()
        where  = "WHERE t.user_id=%s" if user_id else ""
        params = [user_id] if user_id else []

        cur.execute(f"""
            SELECT t.*, u.tg_username, u.tg_first_name
            FROM trades t
            LEFT JOIN users u ON u.id=t.user_id
            {where}
            ORDER BY t.created_at DESC LIMIT %s OFFSET %s
        """, params + [per_page, offset])
        rows = [dict(r) for r in cur.fetchall()]

        cur.execute(f"SELECT COUNT(*) FROM trades t {where}", params)
        total = cur.fetchone()['count']

        return {'items': rows, 'total': total, 'page': page,
                'pages': max(1, (total + per_page - 1) // per_page)}
    except Exception as e:
        logger.error(f"admin_list_trades: {e}")
        return {'items': [], 'total': 0, 'page': 1, 'pages': 1}
    finally:
        conn.close()
