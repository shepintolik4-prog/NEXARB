"""
NEXARB — Backend Server v6.1
Pure Python stdlib — без внешних зависимостей кроме опциональных psycopg2/cryptography

Запуск:
  python3 server.py

Переменные окружения:
  JWT_SECRET=your-256-bit-hex-secret         (ОБЯЗАТЕЛЬНО в PROD)
  NEXARB_DB=nexarb.db
  PORT=8000
  DEMO_MODE=true                              # false в проде
  TG_BOT_TOKEN=...                            # ОБЯЗАТЕЛЬНО в PROD
  ADMIN_TOKEN=your-strong-admin-secret
  CERT_FILE=/path/to/cert.pem
  KEY_FILE=/path/to/key.pem
  ENCRYPT_KEY=...                             # Fernet key для шифрования API-ключей бирж
                                              # python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

РЕАЛЬНАЯ ТОРГОВЛЯ:
  1. pip install ccxt cryptography
  2. DEMO_MODE=false
  3. Установить ENCRYPT_KEY, TG_BOT_TOKEN, JWT_SECRET
  4. Раскомментировать execute_real_trade (см. ниже)
  ⚠️  РИСКИ: спреды исчезают за миллисекунды, комиссии/проскальзывание
              могут превысить прибыль. Юридические риски зависят от юрисдикции.

HTTPS:
  Railway автоматически даёт HTTPS — доп. сертификаты не нужны.
  Для самостоятельного деплоя: certbot certonly --standalone -d yourdomain.com
"""

import json
import hmac
import hashlib
import base64
import secrets
import time
import uuid
import re
import os
import ssl
import logging
import logging.handlers
import traceback
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote
from functools import wraps

import os as _os
if _os.environ.get("DATABASE_URL"):
    import database_pg as db
else:
    import database as db

# ─────────────────────────────────────────────────────────────
# LOGGING
# ─────────────────────────────────────────────────────────────
def setup_logging():
    logger = logging.getLogger('nexarb')
    logger.setLevel(logging.DEBUG)
    fmt = logging.Formatter('[%(asctime)s] [%(levelname)s] %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
    ch = logging.StreamHandler()
    ch.setFormatter(fmt)
    logger.addHandler(ch)
    try:
        fh = logging.handlers.RotatingFileHandler(
            'nexarb.log', maxBytes=10*1024*1024, backupCount=5, encoding='utf-8'
        )
        fh.setFormatter(fmt)
        logger.addHandler(fh)
    except OSError:
        pass
    return logger

logger = setup_logging()


# ─────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────
PORT         = int(os.environ.get('PORT', 8000))
JWT_SECRET   = os.environ.get('JWT_SECRET', '')
JWT_TTL      = 3600 * 4
DEMO_MODE    = os.environ.get('DEMO_MODE', 'true').lower() == 'true'
TG_BOT_TOKEN = os.environ.get('TG_BOT_TOKEN', '')
ADMIN_TOKEN  = os.environ.get('ADMIN_TOKEN', '')
CERT_FILE    = os.environ.get('CERT_FILE', '')
KEY_FILE     = os.environ.get('KEY_FILE', '')
ENCRYPT_KEY  = os.environ.get('ENCRYPT_KEY', '').encode()

if not JWT_SECRET:
    JWT_SECRET = secrets.token_hex(32)
    if not DEMO_MODE:
        logger.warning("JWT_SECRET not set! Using random — tokens won't survive restart!")
    else:
        logger.info("DEMO_MODE: using random JWT_SECRET")

if not ADMIN_TOKEN:
    ADMIN_TOKEN = secrets.token_hex(16)
    logger.warning(f"ADMIN_TOKEN not set! Using random: {ADMIN_TOKEN}")

if not DEMO_MODE and not TG_BOT_TOKEN:
    logger.critical("PRODUCTION requires TG_BOT_TOKEN! Set env var or use DEMO_MODE=true")


# ─────────────────────────────────────────────────────────────
# API KEY ENCRYPTION
# Fernet (AES-128-CBC + HMAC) если установлен cryptography,
# иначе XOR с JWT_SECRET (только для dev/DEMO).
# ─────────────────────────────────────────────────────────────
try:
    from cryptography.fernet import Fernet as _Fernet
    _fernet = _Fernet(ENCRYPT_KEY) if ENCRYPT_KEY else None
    HAS_FERNET = bool(_fernet)
except ImportError:
    _fernet = None
    HAS_FERNET = False

if not HAS_FERNET:
    if not DEMO_MODE:
        logger.warning(
            "PROD without Fernet: pip install cryptography && set ENCRYPT_KEY. "
            "API keys stored as XOR — insecure!"
        )
    else:
        logger.info("cryptography not installed — using XOR for API keys (dev only)")


def encrypt_api_key(key: str) -> str:
    """Шифрует API-ключ. Возвращает base64-строку."""
    if not key:
        return ''
    if _fernet:
        return _fernet.encrypt(key.encode()).decode()
    kb = JWT_SECRET.encode()
    xored = bytes(a ^ kb[i % len(kb)] for i, a in enumerate(key.encode()))
    return 'xor:' + base64.b64encode(xored).decode()


def decrypt_api_key(enc: str) -> str:
    """Дешифрует API-ключ."""
    if not enc:
        return ''
    try:
        if _fernet and not enc.startswith('xor:'):
            return _fernet.decrypt(enc.encode()).decode()
        raw = base64.b64decode(enc.replace('xor:', ''))
        kb = JWT_SECRET.encode()
        return bytes(a ^ kb[i % len(kb)] for i, a in enumerate(raw)).decode()
    except Exception as e:
        logger.error(f"decrypt_api_key failed: {e}")
        return ''


# ─────────────────────────────────────────────────────────────
# PLATFORM CONFIG
# ─────────────────────────────────────────────────────────────
_PLATFORM_CONFIG = {
    'fee_free':           0.008,
    'fee_vip':            0.003,
    'free_trades_max':    5,
    'free_exchanges_max': 2,
    'free_signals_count': 3,
    'demo_start_balance': 3000.0,
    'min_trade':          10.0,
    'max_trade':          1_000_000.0,
    'spread_min':         0.01,
    'spread_max':         20.0,
}
# TODO: загружать из таблицы settings при старте (персистентность):
#   for row in db.get_settings(): _PLATFORM_CONFIG[row['key']] = row['value']

NETWORK_FEES = {
    'BTC': 1.50, 'ETH': 2.50, 'SOL': 0.01, 'BNB': 0.15,
    'XRP': 0.08, 'DOGE': 0.50, 'ADA': 0.20, 'AVAX': 0.30,
    'MATIC': 0.02, 'ARB': 0.10, 'OP': 0.10, 'TON': 0.05,
    'TRX': 0.10, 'NEAR': 0.10, 'PEPE': 2.50, 'SHIB': 2.50,
    'BONK': 0.01, 'WIF': 0.01, 'INJ': 0.05, 'SEI': 0.02,
}

EXCHANGE_FEES = {
    'binance': 0.001, 'okx': 0.001,    'bybit': 0.001,
    'kucoin':  0.001, 'gate': 0.002,   'mexc': 0.0005,
    'htx':     0.002, 'coinbase': 0.006, 'kraken': 0.0026,
    'bitget':  0.001, 'bitmart': 0.0025, 'phemex': 0.001,
    'crypto':  0.004, 'bingx': 0.002,  'lbank': 0.002,
}


# ─────────────────────────────────────────────────────────────
# JWT
# ─────────────────────────────────────────────────────────────
def _b64_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

def _b64_decode(s: str) -> bytes:
    s += '=' * (4 - len(s) % 4) if len(s) % 4 else ''
    return base64.urlsafe_b64decode(s)

def jwt_create(payload: dict, ttl: int = None) -> str:
    header = _b64_encode(json.dumps({'alg': 'HS256', 'typ': 'JWT'}).encode())
    now = int(time.time())
    payload = {**payload, 'iat': now, 'exp': now + (ttl or JWT_TTL), 'jti': str(uuid.uuid4())}
    body = _b64_encode(json.dumps(payload).encode())
    sig = hmac.new(JWT_SECRET.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest()
    return f"{header}.{body}.{_b64_encode(sig)}"

def jwt_verify(token: str) -> dict:
    try:
        parts = token.split('.')
        if len(parts) != 3:
            raise ValueError("Invalid token format")
        header_b64, body_b64, sig_b64 = parts
        expected = hmac.new(JWT_SECRET.encode(), f"{header_b64}.{body_b64}".encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _b64_decode(sig_b64)):
            raise ValueError("Invalid signature")
        payload = json.loads(_b64_decode(body_b64))
        if payload.get('exp', 0) < time.time():
            raise ValueError("Token expired")
        jti = payload.get('jti', '')
        if jti and db.is_token_revoked(jti):
            raise ValueError("Token revoked")
        return payload
    except (ValueError, KeyError, json.JSONDecodeError) as e:
        raise ValueError(str(e))


# ─────────────────────────────────────────────────────────────
# TELEGRAM AUTH
# ─────────────────────────────────────────────────────────────
def verify_telegram_init_data(init_data: str) -> dict:
    """
    DEMO_MODE=true : bypass с детерминированным tg_id (стабильный пользователь).
    DEMO_MODE=false: строгая проверка HMAC. Bypass ПОЛНОСТЬЮ отключён.
    """
    if DEMO_MODE:
        logger.warning("DEMO auth bypass — не использовать в production!")
        params = parse_qs(init_data or '')
        tg_id = params.get('user_id', [None])[0]
        if not tg_id:
            # Детерминированный ID из хеша → один и тот же пользователь при каждом входе
            tg_id = str(abs(hash(init_data or 'demo_session_key')) % 9_000_000 + 1_000_000)
        return {
            'id': int(tg_id),
            'username': params.get('username', ['demo_user'])[0],
            'first_name': params.get('first_name', ['Demo'])[0],
        }

    # PRODUCTION — строгая проверка, bypass невозможен
    if not TG_BOT_TOKEN:
        raise ValueError("TG_BOT_TOKEN not configured")
    if not init_data:
        raise ValueError("Empty initData")

    params = {}
    for item in unquote(init_data).split('&'):
        if '=' in item:
            k, v = item.split('=', 1)
            params[k] = v

    received_hash = params.pop('hash', '')
    if not received_hash:
        raise ValueError("Missing hash in initData")

    data_check_string = '\n'.join(f"{k}={v}" for k, v in sorted(params.items()))
    secret_key = hmac.new(b'WebAppData', TG_BOT_TOKEN.encode(), hashlib.sha256).digest()
    expected_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected_hash, received_hash):
        raise ValueError("Invalid Telegram signature")

    if time.time() - int(params.get('auth_date', 0)) > 86400:
        raise ValueError("initData expired (> 24h)")

    try:
        return json.loads(unquote(params.get('user', '{}')))
    except json.JSONDecodeError:
        raise ValueError("Invalid user data in initData")


# ─────────────────────────────────────────────────────────────
# REAL TRADE EXECUTION (ccxt)
# Если ccxt не установлен — fallback на симуляцию с предупреждением.
# ─────────────────────────────────────────────────────────────
try:
    import ccxt as _ccxt
    HAS_CCXT = True
except ImportError:
    _ccxt    = None
    HAS_CCXT = False
    logger.info("ccxt not installed — real trading disabled. pip install ccxt to enable.")


def execute_real_trade(buy_ex: str, sell_ex: str, symbol: str,
                       amount: float, api_keys: dict) -> dict:
    """
    Размещает реальные market-ордера через ccxt (Binance spot как эталон).
    ⚠️  РИСКИ:
      - Leg risk: buy исполнился, sell — нет → открытая позиция.
      - Slippage и комиссии могут сделать сделку убыточной.
      - Проверяй баланс ДО вызова (см. _submit_trade).

    Возвращает dict с результатами или бросает ValueError/ccxt.BaseError.
    """
    if not HAS_CCXT:
        raise RuntimeError("ccxt not installed. Run: pip install ccxt")

    def _exchange(ex_id: str) -> '_ccxt.Exchange':
        keys = api_keys.get(ex_id, {})
        key_enc    = keys.get('key_enc', '') or keys.get('api_key', '')
        secret_enc = keys.get('secret_enc', '') or keys.get('api_secret', '')
        api_key    = decrypt_api_key(key_enc)
        api_secret = decrypt_api_key(secret_enc)
        if not api_key or not api_secret:
            raise ValueError(f"No API keys for {ex_id}")
        cls = getattr(_ccxt, ex_id, None)
        if cls is None:
            raise ValueError(f"Exchange '{ex_id}' not supported by ccxt")
        return cls({
            'apiKey': api_key,
            'secret': api_secret,
            'enableRateLimit': True,
            'options': {'defaultType': 'spot'},
        })

    pair = f"{symbol}/USDT"
    buy_exchange  = _exchange(buy_ex)
    sell_exchange = _exchange(sell_ex)

    # Проверяем баланс на бирже покупки (атомарно через биржевой API)
    try:
        bal_on_exchange = buy_exchange.fetch_balance()['USDT']['free']
    except Exception as e:
        raise ValueError(f"Cannot fetch balance on {buy_ex}: {e}")

    if bal_on_exchange < amount * 1.01:  # +1% на комиссии
        raise ValueError(
            f"Insufficient balance on {buy_ex}: "
            f"available={bal_on_exchange:.2f} needed={amount * 1.01:.2f}"
        )

    # Получаем текущую цену для расчёта qty
    try:
        ticker   = buy_exchange.fetch_ticker(pair)
        ask      = float(ticker['ask'])
        if ask <= 0:
            raise ValueError("Invalid ask price")
        qty      = amount / ask
    except Exception as e:
        raise ValueError(f"Cannot fetch ticker {pair} on {buy_ex}: {e}")

    # Leg 1: покупаем на buy_exchange
    buy_order = None
    try:
        buy_order = buy_exchange.create_market_buy_order(pair, qty)
        logger.info(
            f"Real trade buy: {buy_ex} {pair} qty={qty:.6f} "
            f"order_id={buy_order['id']} filled={buy_order.get('filled', 0):.6f}"
        )
    except _ccxt.BaseError as e:
        raise ValueError(f"Buy order failed on {buy_ex}: {e}")

    filled_qty = float(buy_order.get('filled') or qty)

    # Leg 2: продаём на sell_exchange
    sell_order = None
    try:
        sell_order = sell_exchange.create_market_sell_order(pair, filled_qty)
        logger.info(
            f"Real trade sell: {sell_ex} {pair} qty={filled_qty:.6f} "
            f"order_id={sell_order['id']}"
        )
    except _ccxt.BaseError as e:
        # ⚠️  Leg risk: buy исполнен, sell — нет. Нужен ручной разбор.
        logger.critical(
            f"LEG RISK! Buy OK on {buy_ex}, sell FAILED on {sell_ex}: {e}. "
            f"buy_order_id={buy_order['id']} qty={filled_qty:.6f} sym={pair}"
        )
        raise ValueError(f"Sell order failed on {sell_ex} (LEG RISK): {e}")

    buy_price  = float(buy_order.get('average')  or buy_order.get('price')  or ask)
    sell_price = float(sell_order.get('average') or sell_order.get('price') or 0)
    gross      = (sell_price - buy_price) * filled_qty

    return {
        'buy_order_id':  buy_order['id'],
        'sell_order_id': sell_order['id'],
        'buy_price':     round(buy_price,  8),
        'sell_price':    round(sell_price, 8),
        'filled_qty':    round(filled_qty, 8),
        'gross_profit':  round(gross, 6),
    }


# ─────────────────────────────────────────────────────────────
# TRADE CALCULATIONS (симуляция — только DEMO_MODE)
# ─────────────────────────────────────────────────────────────
def calc_slippage(amount: float, symbol: str, exchange_id: str) -> float:
    depth = {
        'BTC': [500_000, 1_200_000, 3_000_000, 8_000_000],
        'ETH': [250_000, 600_000,   1_500_000, 4_000_000],
        'SOL': [80_000,  200_000,   500_000,   1_200_000],
        'BNB': [120_000, 300_000,   700_000,   2_000_000],
        'XRP': [60_000,  150_000,   400_000,   1_000_000],
    }.get(symbol, [15_000, 40_000, 100_000, 250_000])

    liq = {'binance': 2.5, 'coinbase': 2.0, 'okx': 1.9, 'bybit': 1.8,
           'kraken': 1.6, 'kucoin': 1.3, 'gate': 1.1, 'htx': 1.1}.get(exchange_id, 1.0)
    d1, d2, d5, d10 = [t * liq for t in depth]

    if amount <= d1:   return amount / (d1 * 2) * 0.01
    if amount <= d2:   return 0.005 + (amount - d1) / (d2 - d1) * 0.015
    if amount <= d5:   return 0.020 + (amount - d2) / (d5 - d2) * 0.030
    if amount <= d10:  return 0.050 + (amount - d5) / (d10 - d5) * 0.050
    return min(0.15, 0.100 + (amount - d10) / d10 * 0.100)


def server_calc_trade(amount, spread_pct, symbol, buy_exchange, sell_exchange, is_vip) -> dict:
    """Расчёт прибыли и комиссий на сервере. DEMO только."""
    gross = amount * spread_pct / 100
    fee_a = EXCHANGE_FEES.get(buy_exchange,  0.001) * amount
    fee_b = EXCHANGE_FEES.get(sell_exchange, 0.001) * amount
    fee_n = NETWORK_FEES.get(symbol.upper(), 1.00)
    fee_s = calc_slippage(amount, symbol.upper(), buy_exchange) / 100 * amount
    fee_p = amount * (_PLATFORM_CONFIG['fee_vip'] if is_vip else _PLATFORM_CONFIG['fee_free'])
    net   = gross - fee_a - fee_b - fee_n - fee_s - fee_p
    return {
        'gross_profit':   round(gross, 6),
        'fee_exchange_a': round(fee_a, 6),
        'fee_exchange_b': round(fee_b, 6),
        'fee_network':    round(fee_n, 6),
        'fee_slippage':   round(fee_s, 6),
        'fee_platform':   round(fee_p, 6),
        'net_profit':     round(net, 6),
    }


# ─────────────────────────────────────────────────────────────
# HTTP HELPERS
# ─────────────────────────────────────────────────────────────
def json_response(handler, status: int, data: dict):
    try:
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        handler.send_response(status)
        handler.send_header('Content-Type', 'application/json; charset=utf-8')
        handler.send_header('Content-Length', len(body))
        handler.send_header('Access-Control-Allow-Origin', '*')
        handler.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token')
        handler.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        handler.send_header('X-Content-Type-Options', 'nosniff')
        handler.send_header('X-Frame-Options', 'DENY')
        handler.send_header('Referrer-Policy', 'no-referrer')
        handler.end_headers()
        handler.wfile.write(body)
    except Exception as e:
        logger.error(f"json_response write error: {e}")


# ─────────────────────────────────────────────────────────────
# DECORATORS
# ─────────────────────────────────────────────────────────────
def require_auth(fn):
    @wraps(fn)
    def wrapper(handler, *args, **kwargs):
        auth = handler.headers.get('Authorization', '')
        if not auth.startswith('Bearer '):
            json_response(handler, 401, {'error': 'Missing token'})
            return
        try:
            payload = jwt_verify(auth[7:])
            if payload.get('role') == 'admin':
                json_response(handler, 403, {'error': 'Admin token not allowed here'})
                return
            handler._user_id = payload['sub']
            handler._jwt_payload = payload
        except ValueError as e:
            json_response(handler, 401, {'error': str(e)})
            return
        return fn(handler, *args, **kwargs)
    return wrapper


def require_admin(fn):
    @wraps(fn)
    def wrapper(handler, *args, **kwargs):
        token = handler.headers.get('X-Admin-Token', '')
        if not token:
            auth = handler.headers.get('Authorization', '')
            if auth.startswith('Bearer '):
                token = auth[7:]
        if not token or not hmac.compare_digest(token, ADMIN_TOKEN):
            logger.warning(f"Admin auth failed from {handler.client_address[0]}")
            json_response(handler, 403, {'error': 'Invalid admin token'})
            return
        return fn(handler, *args, **kwargs)
    return wrapper


def rate_limited(max_req: int = 60, window: int = 60):
    def decorator(fn):
        @wraps(fn)
        def wrapper(handler, *args, **kwargs):
            ip  = handler.client_address[0]
            key = f"rl:{fn.__name__}:{ip}"
            allowed, _ = db.check_rate_limit(key, max_req, window)
            if not allowed:
                logger.warning(f"Rate limit [{fn.__name__}]: {ip}")
                json_response(handler, 429, {'error': 'Rate limit exceeded', 'retry_after': window})
                return
            return fn(handler, *args, **kwargs)
        return wrapper
    return decorator


# ─────────────────────────────────────────────────────────────
# MAIN HANDLER
# ─────────────────────────────────────────────────────────────
class NexarbHandler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        logger.debug(f"{self.client_address[0]} - {fmt % args}")

    def _read_json(self) -> dict:
        try:
            length = int(self.headers.get('Content-Length', 0))
            if not length:
                return {}
            raw = self.rfile.read(min(length, 1_048_576))
            return json.loads(raw)
        except (json.JSONDecodeError, ValueError) as e:
            logger.warning(f"JSON parse error: {e}")
            return {}

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.end_headers()

    def _global_rate_check(self) -> bool:
        """Глобальный лимит: 100 req/min по IP на все эндпоинты."""
        ip = self.client_address[0]
        allowed, _ = db.check_rate_limit(f"global:{ip}", max_requests=100, window_seconds=60)
        if not allowed:
            logger.warning(f"Global rate limit: {ip}")
            json_response(self, 429, {'error': 'Too many requests', 'retry_after': 60})
        return allowed

    def do_GET(self):
        if not self._global_rate_check(): return
        try:
            self._route_get()
        except Exception as e:
            logger.error(f"GET {self.path}: {e}\n{traceback.format_exc()}")
            json_response(self, 500, {'error': 'Internal server error'})

    def do_POST(self):
        if not self._global_rate_check(): return
        try:
            self._route_post()
        except Exception as e:
            logger.error(f"POST {self.path}: {e}\n{traceback.format_exc()}")
            json_response(self, 500, {'error': 'Internal server error'})

    def do_PUT(self):
        if not self._global_rate_check(): return
        try:
            self._route_put()
        except Exception as e:
            logger.error(f"PUT {self.path}: {e}\n{traceback.format_exc()}")
            json_response(self, 500, {'error': 'Internal server error'})

    def do_DELETE(self):
        if not self._global_rate_check(): return
        try:
            self._route_delete()
        except Exception as e:
            logger.error(f"DELETE {self.path}: {e}\n{traceback.format_exc()}")
            json_response(self, 500, {'error': 'Internal server error'})

    def _route_get(self):
        path = urlparse(self.path).path.rstrip('/')

        if path == '/health':
            json_response(self, 200, {'status': 'ok', 'demo': DEMO_MODE, 'version': '6.1', 'ts': int(time.time())})
        elif path == '/api/v1/account':           self._get_account()
        elif path.startswith('/api/v1/trades'):
            parts = path.split('/')
            if len(parts) == 5 and parts[4]:     self._get_trade_status(parts[4])
            else:                                 self._get_trades()
        elif path == '/api/v1/vip/status':        self._get_vip_status()
        elif path == '/api/v1/exchanges':         self._get_exchanges()
        elif path == '/api/v1/referrals':         self._get_referrals()
        elif path == '/api/admin/stats':          self._admin_get_stats()
        elif path == '/api/admin/config':         self._admin_get_config()
        elif path == '/api/admin/users':          self._admin_list_users()
        elif path.startswith('/api/admin/users/'): self._admin_get_user(path.split('/')[-1])
        elif path == '/api/admin/trades':         self._admin_list_trades()
        else:                                     json_response(self, 404, {'error': 'Not found'})

    def _route_post(self):
        path = urlparse(self.path).path.rstrip('/')

        if   path == '/api/v1/auth/login':        self._auth_login()
        elif path == '/api/v1/auth/logout':       self._auth_logout()
        elif path == '/api/v1/trades':            self._submit_trade()
        elif path == '/api/v1/vip/subscribe':     self._buy_vip()
        elif path == '/api/v1/exchanges/connect': self._connect_exchange()
        elif path == '/api/admin/users/vip':      self._admin_set_vip()
        elif path == '/api/admin/users/balance':  self._admin_set_balance()
        elif path == '/api/admin/config':         self._admin_update_config()
        elif path == '/api/admin/broadcast':      self._admin_broadcast()
        else:                                     json_response(self, 404, {'error': 'Not found'})

    def _route_put(self):
        path = urlparse(self.path).path.rstrip('/')
        if path == '/api/admin/config':           self._admin_update_config()
        else:                                     json_response(self, 404, {'error': 'Not found'})

    def _route_delete(self):
        path = urlparse(self.path).path.rstrip('/')

        if path.startswith('/api/v1/exchanges/'):
            self._disconnect_exchange(path.split('/')[-1])
        elif re.match(r'^/api/admin/users/[^/]+/vip$', path):
            self._admin_revoke_vip(path.split('/')[-2])
        elif re.match(r'^/api/admin/users/[^/]+$', path):
            self._delete_admin_user(path.split('/')[-1])
        else:
            json_response(self, 404, {'error': 'Not found'})


    # ─────────────────────────────────────────────────────────
    # AUTH
    # ─────────────────────────────────────────────────────────
    @rate_limited(max_req=10, window=60)
    def _auth_login(self):
        """POST /api/v1/auth/login — Telegram initData → JWT"""
        ip   = self.client_address[0]
        data = self._read_json()

        try:
            tg_user = verify_telegram_init_data(data.get('init_data', ''))
        except ValueError as e:
            logger.warning(f"Auth failed from {ip}: {e}")
            json_response(self, 401, {'error': 'Invalid Telegram data'})
            return

        tg_id       = str(tg_user.get('id', ''))
        tg_name     = tg_user.get('first_name', 'User')
        tg_username = tg_user.get('username', '')

        if not tg_id:
            json_response(self, 400, {'error': 'Missing user ID'})
            return

        user = db.get_user_by_tg_id(tg_id)
        if not user:
            new_id   = str(uuid.uuid4())
            ref_code = secrets.token_urlsafe(6).upper()[:8]
            ref_by   = data.get('ref_code', '').upper().strip()
            if not re.match(r'^[A-Z0-9]{4,12}$', ref_by):
                ref_by = None
            ok = db.create_user(
                tg_id=tg_id, tg_username=tg_username, tg_first_name=tg_name,
                ref_code=ref_code, user_id=new_id, referred_by=ref_by,
                demo_balance=_PLATFORM_CONFIG['demo_start_balance'],
            )
            user = db.get_user_by_id(new_id) if ok else db.get_user_by_tg_id(tg_id)

        if not user:
            json_response(self, 500, {'error': 'User creation failed'})
            return

        token = jwt_create({'sub': user['id'], 'tg': tg_id})
        logger.info(f"Login: tg={tg_id} user={user['id'][:8]} ip={ip}")
        json_response(self, 200, {'token': token, 'user_id': user['id'], 'ttl': JWT_TTL})

    @require_auth
    def _auth_logout(self):
        jti = self._jwt_payload.get('jti', '')
        exp = self._jwt_payload.get('exp', 0)
        if jti:
            db.revoke_token(jti, exp)
        json_response(self, 200, {'ok': True})


    # ─────────────────────────────────────────────────────────
    # ACCOUNT
    # ─────────────────────────────────────────────────────────
    @require_auth
    @rate_limited(max_req=60, window=60)
    def _get_account(self):
        uid      = self._user_id
        user     = db.get_user_by_id(uid)
        if not user:
            json_response(self, 404, {'error': 'User not found'}); return

        bal      = db.get_balance(uid)
        vip      = db.get_vip_status(uid)
        stats    = db.get_trade_stats(uid)
        exchanges= db.get_connected_exchanges(uid)
        balance  = bal['demo_balance'] if DEMO_MODE else bal['usd_balance']

        json_response(self, 200, {
            'user_id':     uid,
            'balance':     round(balance, 2),
            'profit':      round(stats.get('total_profit', 0), 4),
            'trades':      stats.get('total_trades', 0),
            'win_rate':    stats.get('win_rate', 0),
            'vip':         vip['is_vip'],
            'vip_plan':    vip.get('plan'),
            'vip_expires': vip.get('expires_at'),
            'vip_days_left': vip.get('days_left', 0),
            'connected_exchanges': [e['exchange_id'] for e in exchanges],
            'ref_code':    user['ref_code'],
            'lang':        user['lang'],
            'demo_mode':   DEMO_MODE,
            'platform': {
                'fee_free':           _PLATFORM_CONFIG['fee_free'],
                'fee_vip':            _PLATFORM_CONFIG['fee_vip'],
                'free_trades_max':    _PLATFORM_CONFIG['free_trades_max'],
                'free_signals_count': _PLATFORM_CONFIG['free_signals_count'],
                'min_trade':          _PLATFORM_CONFIG['min_trade'],
                'max_trade':          _PLATFORM_CONFIG['max_trade'],
            },
        })


    # ─────────────────────────────────────────────────────────
    # TRADES
    # ─────────────────────────────────────────────────────────
    @require_auth
    @rate_limited(max_req=30, window=60)
    def _submit_trade(self):
        """POST /api/v1/trades"""
        uid  = self._user_id
        data = self._read_json()

        amount        = float(data.get('amount', 0))
        spread_pct    = float(data.get('spread', 0))
        symbol        = re.sub(r'[^A-Z0-9]', '', str(data.get('symbol', '')).upper())[:10]
        buy_exchange  = re.sub(r'[^a-z0-9]', '', str(data.get('buyExchange', '')).lower())[:20]
        sell_exchange = re.sub(r'[^a-z0-9]', '', str(data.get('sellExchange', '')).lower())[:20]
        strategy      = re.sub(r'[^a-z_]',   '', str(data.get('strategy', 'cex')).lower())[:20]

        mn, mx = _PLATFORM_CONFIG['min_trade'], _PLATFORM_CONFIG['max_trade']
        if not (mn <= amount <= mx):
            json_response(self, 400, {'error': f'Invalid amount ({mn}–{mx})'}); return

        sp_min, sp_max = _PLATFORM_CONFIG['spread_min'], _PLATFORM_CONFIG['spread_max']
        if not (sp_min <= spread_pct <= sp_max):
            json_response(self, 400, {'error': f'Suspicious spread ({sp_min}–{sp_max}%)'}); return

        # FIX 5: атомарная проверка баланса — читаем и резервируем в одной транзакции.
        # db.reserve_balance возвращает (balance, ok): если ok=False — конкурентный трейд
        # уже занял средства между нашей проверкой и записью.
        bal = db.get_balance(uid)
        balance = bal['demo_balance'] if DEMO_MODE else bal['usd_balance']
        if amount > balance * 0.99:  # 1% safety margin
            json_response(self, 400, {'error': 'Insufficient balance'}); return

        # Пытаемся атомарно зарезервировать (UPDATE + проверка в одном запросе)
        reserved = db.reserve_balance(uid, amount, is_demo=DEMO_MODE)
        if not reserved:
            json_response(self, 400, {'error': 'Insufficient balance (concurrent check)'}); return

        vip = db.get_vip_status(uid)
        if not vip['is_vip']:
            stats = db.get_trade_stats(uid)
            if stats.get('total_trades', 0) >= _PLATFORM_CONFIG['free_trades_max']:
                db.release_balance(uid, amount, is_demo=DEMO_MODE)  # откат резерва
                json_response(self, 403, {'error': 'FREE plan limit. Upgrade to VIP.'}); return

        # FIX 2: выбор движка — реальный (ccxt) или симуляция
        real_result = None
        if not DEMO_MODE and HAS_CCXT:
            try:
                exchanges_data = {e['exchange_id']: e
                                  for e in db.get_connected_exchanges(uid)}
                real_result = execute_real_trade(
                    buy_ex=buy_exchange, sell_ex=sell_exchange,
                    symbol=symbol, amount=amount,
                    api_keys=exchanges_data,
                )
                # Используем реальный gross_profit для расчёта чистой прибыли
                spread_pct = real_result['gross_profit'] / amount * 100
                logger.info(
                    f"Real trade OK: user={uid[:8]} {symbol} "
                    f"buy={buy_exchange} sell={sell_exchange} "
                    f"gross=${real_result['gross_profit']:.4f}"
                )
            except Exception as e:
                logger.error(f"Real trade FAILED: user={uid[:8]} {symbol}: {e}\n{traceback.format_exc()}")
                db.release_balance(uid, amount, is_demo=DEMO_MODE)  # откат резерва
                json_response(self, 502, {'error': f'Exchange error: {e}'}); return
        elif not DEMO_MODE and not HAS_CCXT:
            logger.warning(
                f"PROD trade: ccxt not installed — simulating. "
                f"user={uid[:8]} sym={symbol}. Run: pip install ccxt"
            )

        calc = server_calc_trade(amount, spread_pct, symbol, buy_exchange, sell_exchange, vip['is_vip'])

        trade_id = str(uuid.uuid4())
        start_ts = time.time()

        try:
            db.create_trade({
                'id': trade_id, 'user_id': uid, 'symbol': symbol,
                'strategy_type': strategy, 'buy_exchange': buy_exchange,
                'sell_exchange': sell_exchange, 'amount': amount,
                'gross_profit': calc['gross_profit'],
                'fee_exchange_a': calc['fee_exchange_a'], 'fee_exchange_b': calc['fee_exchange_b'],
                'fee_network': calc['fee_network'],       'fee_slippage':   calc['fee_slippage'],
                'fee_platform': calc['fee_platform'],     'net_profit':     calc['net_profit'],
                'spread_pct': spread_pct, 'ai_score': int(data.get('aiScore', 0)),
                'execution_ms': int(data.get('latency', 50)),
                'balance_before': balance, 'balance_after': balance,
                'is_auto': data.get('is_auto', False),
            })
            bal_before, bal_after = db.apply_trade_result(uid, trade_id, calc['net_profit'], is_demo=DEMO_MODE)
        except Exception as e:
            logger.error(f"Trade DB error: {e}\n{traceback.format_exc()}")
            db.release_balance(uid, amount, is_demo=DEMO_MODE)  # откат резерва
            json_response(self, 500, {'error': 'Trade execution failed'}); return

        exec_ms = int((time.time() - start_ts) * 1000)
        logger.info(f"Trade {trade_id[:8]} user={uid[:8]} sym={symbol} net=${calc['net_profit']:.4f}")

        json_response(self, 200, {
            'orderId': trade_id, 'status': 'completed',
            'symbol': symbol, 'buyExchange': buy_exchange, 'sellExchange': sell_exchange,
            'amount': amount, 'grossProfit': calc['gross_profit'],
            'feeExchangeA': calc['fee_exchange_a'], 'feeExchangeB': calc['fee_exchange_b'],
            'feeNetwork': calc['fee_network'],       'feeSlippage':  calc['fee_slippage'],
            'platformFee': calc['fee_platform'],     'netProfit':    calc['net_profit'],
            'newBalance': round(bal_after, 2), 'spread': spread_pct, 'executionMs': exec_ms,
        })

    @require_auth
    def _get_trade_status(self, trade_id: str):
        if not re.match(r'^[0-9a-f-]{36}$', trade_id):
            json_response(self, 400, {'error': 'Invalid trade ID'}); return
        trade = db.get_trade(trade_id, self._user_id)
        if not trade:
            json_response(self, 404, {'error': 'Trade not found'}); return
        json_response(self, 200, {
            'orderId': trade['id'], 'status': trade['status'],
            'netProfit': trade['net_profit'], 'platformFee': trade['fee_platform'],
            'newBalance': trade['balance_after'], 'executionMs': trade['execution_ms'],
        })

    @require_auth
    def _get_trades(self):
        qs   = parse_qs(urlparse(self.path).query)
        page = max(1, int(qs.get('page', ['1'])[0]))
        json_response(self, 200, db.get_trades_history(self._user_id, page=page))


    # ─────────────────────────────────────────────────────────
    # VIP
    # ─────────────────────────────────────────────────────────
    @require_auth
    def _get_vip_status(self):
        json_response(self, 200, db.get_vip_status(self._user_id))

    @require_auth
    def _buy_vip(self):
        """POST /api/v1/vip/subscribe"""
        data = self._read_json()
        plan = data.get('plan', '').lower()
        if plan not in ('week', 'month', 'year'):
            json_response(self, 400, {'error': 'Invalid plan (week/month/year)'}); return

        if DEMO_MODE:
            result = db.activate_vip(self._user_id, plan, payment_id='DEMO')
            json_response(self, 200, {'ok': True, **result})
        else:
            # PRODUCTION — требуем payment_id
            # TODO: верифицировать через Stripe/TON перед активацией:
            #   Stripe:    stripe.PaymentIntent.retrieve(payment_id).status == 'succeeded'
            #   TON:       GET https://toncenter.com/api/v2/getTransactions
            payment_id = data.get('payment_id', '').strip()
            if not payment_id:
                json_response(self, 400, {'error': 'payment_id required in production'}); return
            result = db.activate_vip(self._user_id, plan, payment_id=payment_id)
            json_response(self, 200, {'ok': True, **result})


    # ─────────────────────────────────────────────────────────
    # EXCHANGES
    # ─────────────────────────────────────────────────────────
    @require_auth
    def _get_exchanges(self):
        json_response(self, 200, {'exchanges': db.get_connected_exchanges(self._user_id)})

    @require_auth
    def _connect_exchange(self):
        """POST /api/v1/exchanges/connect — шифрует ключи перед сохранением"""
        data        = self._read_json()
        exchange_id = str(data.get('exchangeId', '')).lower()[:20]
        api_key     = str(data.get('apiKey', ''))
        secret      = str(data.get('secret', ''))

        if not exchange_id or len(api_key) < 8 or len(secret) < 8:
            json_response(self, 400, {'error': 'Invalid exchange credentials'}); return

        vip = db.get_vip_status(self._user_id)
        if not vip['is_vip']:
            existing = db.get_connected_exchanges(self._user_id)
            mx = _PLATFORM_CONFIG['free_exchanges_max']
            if len(existing) >= mx:
                json_response(self, 403, {'error': f'FREE plan: max {mx} exchanges. Upgrade to VIP.'}); return

        # Шифруем API-ключи перед записью в БД
        key_enc    = encrypt_api_key(api_key)
        secret_enc = encrypt_api_key(secret)

        ok = db.save_exchange_connection(
            self._user_id, exchange_id, api_key,
            key_enc=key_enc, secret_enc=secret_enc
        )
        json_response(self, 200 if ok else 500, {
            'ok': ok, 'exchangeId': exchange_id,
            'keyMask': api_key[:4] + '****' + api_key[-4:],
            'encrypted': HAS_FERNET,
        })

    @require_auth
    def _disconnect_exchange(self, exchange_id: str):
        ok = db.remove_exchange(self._user_id, exchange_id.lower()[:20])
        json_response(self, 200, {'ok': ok})

    @require_auth
    def _get_referrals(self):
        json_response(self, 200, db.get_referral_stats(self._user_id))


    # ═════════════════════════════════════════════════════════
    #  ADMIN API (/api/admin/*)
    # ═════════════════════════════════════════════════════════

    @require_admin
    def _admin_get_stats(self):
        stats = db.admin_get_platform_stats()
        json_response(self, 200, {**stats, 'config': _PLATFORM_CONFIG, 'demo_mode': DEMO_MODE})

    @require_admin
    def _admin_get_config(self):
        json_response(self, 200, {
            'config': _PLATFORM_CONFIG, 'network_fees': NETWORK_FEES,
            'exchange_fees': EXCHANGE_FEES, 'demo_mode': DEMO_MODE,
            'encryption': 'fernet' if HAS_FERNET else 'xor-fallback',
        })

    @require_admin
    def _admin_update_config(self):
        """POST/PUT /api/admin/config"""
        data = self._read_json()
        changed = {}
        global DEMO_MODE

        if 'demo_mode' in data:
            DEMO_MODE = bool(data['demo_mode'])
            changed['demo_mode'] = DEMO_MODE
            logger.info(f"DEMO_MODE switched to: {DEMO_MODE}")

        numeric_fields = [
            'fee_free', 'fee_vip', 'free_trades_max', 'free_exchanges_max',
            'free_signals_count', 'min_trade', 'max_trade',
            'spread_min', 'spread_max', 'demo_start_balance',
        ]
        for field in numeric_fields:
            if field in data:
                try:
                    val = float(data[field])
                    if val < 0:
                        json_response(self, 400, {'error': f'{field} must be >= 0'}); return
                    old = _PLATFORM_CONFIG.get(field)
                    _PLATFORM_CONFIG[field] = val
                    changed[field] = {'old': old, 'new': val}
                except (TypeError, ValueError) as e:
                    logger.warning(f"Config {field} invalid: {e}")

        if 'network_fees' in data and isinstance(data['network_fees'], dict):
            for coin, fee in data['network_fees'].items():
                try:
                    coin = coin.upper()[:10]; val = float(fee)
                    old = NETWORK_FEES.get(coin); NETWORK_FEES[coin] = val
                    changed[f'network_{coin}'] = {'old': old, 'new': val}
                except (TypeError, ValueError): pass

        if 'exchange_fees' in data and isinstance(data['exchange_fees'], dict):
            for ex, fee in data['exchange_fees'].items():
                try:
                    ex = ex.lower()[:20]; val = float(fee)
                    old = EXCHANGE_FEES.get(ex); EXCHANGE_FEES[ex] = val
                    changed[f'exfee_{ex}'] = {'old': old, 'new': val}
                except (TypeError, ValueError): pass

        logger.info(f"Admin config updated: {list(changed.keys())}")
        json_response(self, 200, {'ok': True, 'changed': changed, 'config': _PLATFORM_CONFIG})

    @require_admin
    def _admin_list_users(self):
        qs       = parse_qs(urlparse(self.path).query)
        page     = max(1, int(qs.get('page',   ['1'])[0]))
        search   = qs.get('search', [''])[0]
        vip_only = qs.get('vip', [''])[0].lower() == 'true'
        json_response(self, 200, db.admin_list_users(page=page, search=search, vip_only=vip_only))

    @require_admin
    def _admin_get_user(self, user_id: str):
        user = db.get_user_by_id(user_id) or db.get_user_by_tg_id(user_id)
        if not user:
            json_response(self, 404, {'error': 'User not found'}); return
        uid = user['id']
        json_response(self, 200, {
            'user': dict(user), 'balance': db.get_balance(uid),
            'vip': db.get_vip_status(uid), 'stats': db.get_trade_stats(uid),
            'exchanges': db.get_connected_exchanges(uid),
        })

    @require_admin
    def _delete_admin_user(self, user_id: str):
        """DELETE /api/admin/users/:id — каскадное удаление"""
        try:
            user = db.get_user_by_id(user_id) or db.get_user_by_tg_id(user_id)
            if not user:
                json_response(self, 404, {'error': 'User not found'}); return

            import sqlite3 as _sq
            db_path = getattr(db, 'DB_PATH', 'nexarb.db')
            c   = _sq.connect(db_path)
            cur = c.cursor()
            uid = user['id']

            for tbl in ['trades', 'balances', 'vip_subscriptions',
                        'connected_exchanges', 'referrals', 'revoked_tokens']:
                try:
                    cur.execute(f"DELETE FROM {tbl} WHERE user_id=?", (uid,))
                except Exception as te:
                    logger.warning(f"Delete {tbl}: {te}")

            cur.execute("DELETE FROM users WHERE id=?", (uid,))
            c.commit()
            c.close()
            logger.info(f"Admin deleted user {uid[:8]} (@{dict(user).get('tg_username', '?')})")
            json_response(self, 200, {'ok': True, 'deleted': uid})
        except Exception as e:
            logger.error(f"_delete_admin_user {user_id}: {e}\n{traceback.format_exc()}")
            json_response(self, 500, {'error': str(e)})

    @require_admin
    def _admin_set_vip(self):
        data    = self._read_json()
        user_id = str(data.get('user_id', ''))
        plan    = str(data.get('plan', 'month')).lower()
        days    = int(data.get('days', 30))
        if not user_id:
            json_response(self, 400, {'error': 'user_id required'}); return
        user = db.get_user_by_id(user_id) or db.get_user_by_tg_id(user_id)
        if not user:
            json_response(self, 404, {'error': 'User not found'}); return
        if plan not in ('week', 'month', 'year', 'lifetime'):
            plan = 'month'
        result = db.admin_activate_vip(user['id'], plan, days=days)
        logger.info(f"Admin VIP set: user={user['id'][:8]} plan={plan} days={days}")
        json_response(self, 200, {'ok': True, 'user_id': user['id'], **result})

    @require_admin
    def _admin_revoke_vip(self, user_id: str):
        user = db.get_user_by_id(user_id) or db.get_user_by_tg_id(user_id)
        if not user:
            json_response(self, 404, {'error': 'User not found'}); return
        ok = db.admin_revoke_vip(user['id'])
        logger.info(f"Admin VIP revoked: user={user['id'][:8]}")
        json_response(self, 200, {'ok': ok})

    @require_admin
    def _admin_set_balance(self):
        data    = self._read_json()
        user_id = str(data.get('user_id', ''))
        balance = float(data.get('balance', 0))
        is_demo = bool(data.get('demo', True))

        # В PROD запрещаем прямое изменение реального баланса
        if not DEMO_MODE and not is_demo:
            logger.warning(f"Admin tried direct real balance set in PROD: user={user_id}")
            json_response(self, 403, {
                'error': 'Cannot set real balance directly in production. Use payment system.'
            }); return

        if not user_id or balance < 0:
            json_response(self, 400, {'error': 'Invalid user_id or balance'}); return

        user = db.get_user_by_id(user_id) or db.get_user_by_tg_id(user_id)
        if not user:
            json_response(self, 404, {'error': 'User not found'}); return

        ok = db.admin_set_balance(user['id'], balance, is_demo=is_demo)
        logger.info(f"Admin balance: user={user['id'][:8]} {'demo' if is_demo else 'real'}=${balance}")
        json_response(self, 200, {'ok': ok, 'user_id': user['id'], 'balance': balance})

    @require_admin
    def _admin_list_trades(self):
        qs   = parse_qs(urlparse(self.path).query)
        page = max(1, int(qs.get('page', ['1'])[0]))
        uid  = qs.get('user_id', [''])[0]
        json_response(self, 200, db.admin_list_trades(page=page, user_id=uid or None))

    @require_admin
    def _admin_broadcast(self):
        """
        POST /api/admin/broadcast
        TODO: рассылка через Telegram Bot API:
          for tg_id in db.admin_list_all_tg_ids():
              urllib.request.urlopen(
                  f"https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage",
                  data=json.dumps({"chat_id": tg_id, "text": msg}).encode()
              )
        """
        data = self._read_json()
        msg  = str(data.get('message', ''))[:500]
        typ  = data.get('type', 'info')
        if not msg:
            json_response(self, 400, {'error': 'message required'}); return
        logger.info(f"Admin broadcast [{typ}]: {msg[:80]}")
        json_response(self, 200, {'ok': True, 'queued': 0, 'message': msg})


# ─────────────────────────────────────────────────────────────
# HTTPS / SSL
# ─────────────────────────────────────────────────────────────
def make_ssl_context():
    if not CERT_FILE or not KEY_FILE:
        return None
    if not os.path.exists(CERT_FILE) or not os.path.exists(KEY_FILE):
        logger.error(f"SSL files not found: {CERT_FILE}, {KEY_FILE}")
        return None
    try:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.minimum_version = ssl.TLSVersion.TLSv1_2
        ctx.load_cert_chain(CERT_FILE, KEY_FILE)
        return ctx
    except ssl.SSLError as e:
        logger.error(f"SSL context error: {e}")
        return None


# ─────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print("=" * 60)
    print("  NEXARB Backend Server v6.1")
    print("=" * 60)
    print(f"  Mode:       {'⚠️  DEMO' if DEMO_MODE else '🔒 PRODUCTION'}")
    print(f"  Port:       {PORT}")
    print(f"  JWT TTL:    {JWT_TTL // 3600}h")
    print(f"  HTTPS:      {'YES (' + CERT_FILE + ')' if CERT_FILE else 'NO (use Railway HTTPS proxy)'}")
    print(f"  Encryption: {'✅ Fernet AES-128' if HAS_FERNET else '⚠️  XOR fallback (dev only)'}")
    print(f"  Rate limit: 100 req/min global per IP")
    print("=" * 60)

    if DEMO_MODE:
        print("\n  ⚠️  DEMO MODE: Telegram auth bypassed, payments skipped")
    if not HAS_FERNET and not DEMO_MODE:
        print("\n  ⚠️  PROD without Fernet: pip install cryptography && set ENCRYPT_KEY")

    try:
        db.init_db()
        logger.info("DB initialized")
    except Exception as e:
        logger.critical(f"DB init failed: {e}\n{traceback.format_exc()}")
        raise SystemExit(1)

    server  = HTTPServer(('0.0.0.0', PORT), NexarbHandler)
    ssl_ctx = make_ssl_context()
    if ssl_ctx:
        server.socket = ssl_ctx.wrap_socket(server.socket, server_side=True)
        proto = 'HTTPS'
    else:
        proto = 'HTTP'

    logger.info(f"Server running on {proto}://0.0.0.0:{PORT}")
    print(f"\n[OK] {proto}://0.0.0.0:{PORT}")
    print("  POST /api/v1/auth/login         — Telegram → JWT")
    print("  GET  /api/v1/account            — Balance, VIP, platform config")
    print("  POST /api/v1/trades             — Submit trade")
    print("  POST /api/v1/vip/subscribe      — Activate VIP")
    print("  GET  /api/admin/stats           — Platform stats (X-Admin-Token)")
    print("  POST /api/admin/config          — Update config")
    print("  DELETE /api/admin/users/:id     — Delete user\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[STOP] Server stopped.")
        server.server_close()
