"""
NEXARB — Backend Server v6.0
Pure Python stdlib — без внешних зависимостей

Запуск:
  python3 server.py

Переменные окружения (.env):
  JWT_SECRET=your-256-bit-hex-secret         (обязательно в PROD)
  NEXARB_DB=nexarb.db
  PORT=8000
  DEMO_MODE=true                              # false в проде
  TG_BOT_TOKEN=...                            # для верификации Telegram initData
  ADMIN_TOKEN=your-strong-admin-secret        # токен для /api/admin/*
  CERT_FILE=/path/to/cert.pem                 # опционально, для HTTPS
  KEY_FILE=/path/to/key.pem                   # опционально, для HTTPS

HTTPS (опционально):
  Если заданы CERT_FILE и KEY_FILE — сервер запускается на HTTPS.
  Получить бесплатный сертификат: certbot certonly --standalone -d yourdomain.com
  Или самоподписанный для тестов:
    openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes

БЕЗОПАСНОСТЬ:
  - Все балансы и профиты считаются ТОЛЬКО на сервере
  - Клиент передаёт только параметры сделки, не результат
  - JWT HS256 с отзывом через БД
  - Rate limiting по IP на все эндпоинты
  - ADMIN_TOKEN отделён от пользовательских токенов
  - DEMO_MODE не отключает rate limiting и валидацию
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
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote
from functools import wraps

import database as db

# ─────────────────────────────────────────────────────────────
# LOGGING
# ─────────────────────────────────────────────────────────────
def setup_logging():
    logger = logging.getLogger('nexarb')
    logger.setLevel(logging.DEBUG)
    fmt = logging.Formatter(
        '[%(asctime)s] [%(levelname)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    # Консоль
    ch = logging.StreamHandler()
    ch.setFormatter(fmt)
    logger.addHandler(ch)
    # Файл с ротацией (10 МБ × 5 файлов)
    try:
        fh = logging.handlers.RotatingFileHandler(
            'nexarb.log', maxBytes=10*1024*1024, backupCount=5, encoding='utf-8'
        )
        fh.setFormatter(fmt)
        logger.addHandler(fh)
    except OSError:
        pass  # нет прав на запись — только консоль
    return logger

logger = setup_logging()


# ─────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────
PORT         = int(os.environ.get('PORT', 8000))
JWT_SECRET   = os.environ.get('JWT_SECRET', '')
JWT_TTL      = 3600 * 4        # 4 часа

DEMO_MODE    = os.environ.get('DEMO_MODE', 'true').lower() == 'true'
TG_BOT_TOKEN = os.environ.get('TG_BOT_TOKEN', '')

# ADMIN_TOKEN — единственный способ получить доступ к /api/admin/*
# В PROD: генерировать через: python3 -c "import secrets; print(secrets.token_hex(32))"
ADMIN_TOKEN  = os.environ.get('ADMIN_TOKEN', '')

CERT_FILE    = os.environ.get('CERT_FILE', '')
KEY_FILE     = os.environ.get('KEY_FILE', '')

# Если JWT_SECRET не задан — генерируем случайный (НЕ ПРИГОДЕН для прода)
if not JWT_SECRET:
    JWT_SECRET = secrets.token_hex(32)
    if not DEMO_MODE:
        logger.warning("JWT_SECRET not set! Using random key — tokens won't survive restart!")
    else:
        logger.info("DEMO_MODE: using random JWT_SECRET")

if not ADMIN_TOKEN:
    ADMIN_TOKEN = secrets.token_hex(16)
    logger.warning(f"ADMIN_TOKEN not set! Using random: {ADMIN_TOKEN}")
    logger.warning("Set ADMIN_TOKEN env var for stable admin access!")

# Комиссии платформы (можно менять через admin API)
# Хранятся в памяти; при рестарте сбрасываются на дефолты
# TODO: вынести в таблицу settings в БД для персистентности
_PLATFORM_CONFIG = {
    'fee_free':        0.008,    # 0.8% для FREE пользователей
    'fee_vip':         0.003,    # 0.3% для VIP пользователей
    'free_trades_max': 5,        # макс сделок в день для FREE
    'free_exchanges_max': 2,     # макс подключённых бирж для FREE
    'demo_start_balance': 3000.0,  # стартовый демо-баланс
    'min_trade':       10.0,     # минимальная сумма сделки USD
    'max_trade':       1_000_000.0,  # максимальная сумма сделки USD
    'spread_min':      0.01,     # минимально допустимый спред %
    'spread_max':      20.0,     # максимально допустимый спред %
}

# Реальные withdrawal fees по сети (USD)
# TODO: получать через публичный API биржи (urllib.request):
#   import urllib.request, json
#   url = 'https://api.binance.com/sapi/v1/capital/config/getall'
#   # Требует API key; публичного эндпоинта нет — парсить из docs
NETWORK_FEES = {
    'BTC': 1.50, 'ETH': 2.50, 'SOL': 0.01, 'BNB': 0.15,
    'XRP': 0.08, 'DOGE': 0.50, 'ADA': 0.20, 'AVAX': 0.30,
    'MATIC': 0.02, 'ARB': 0.10, 'OP': 0.10, 'TON': 0.05,
    'TRX': 0.10, 'NEAR': 0.10, 'PEPE': 2.50, 'SHIB': 2.50,
    'BONK': 0.01, 'WIF': 0.01, 'INJ': 0.05, 'SEI': 0.02,
}

# Taker комиссии бирж (источник: официальные страницы, 2025)
# TODO: обновлять через API биржи:
#   Binance: GET https://api.binance.com/api/v3/account (требует HMAC auth)
EXCHANGE_FEES = {
    'binance': 0.001, 'okx': 0.001,    'bybit': 0.001,
    'kucoin':  0.001, 'gate': 0.002,   'mexc': 0.0005,
    'htx':     0.002, 'coinbase': 0.006, 'kraken': 0.0026,
    'bitget':  0.001, 'bitmart': 0.0025, 'phemex': 0.001,
    'crypto':  0.004, 'bingx': 0.002,  'lbank': 0.002,
}


# ─────────────────────────────────────────────────────────────
# JWT — РУЧНАЯ РЕАЛИЗАЦИЯ (без PyJWT)
# ─────────────────────────────────────────────────────────────
def _b64_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

def _b64_decode(s: str) -> bytes:
    padding = 4 - len(s) % 4
    if padding != 4:
        s += '=' * padding
    return base64.urlsafe_b64decode(s)

def jwt_create(payload: dict, ttl: int = None) -> str:
    """Создаёт подписанный HS256 JWT токен."""
    header = _b64_encode(json.dumps({'alg': 'HS256', 'typ': 'JWT'}).encode())
    now = int(time.time())
    payload = {
        **payload,
        'iat': now,
        'exp': now + (ttl or JWT_TTL),
        'jti': str(uuid.uuid4()),
    }
    body = _b64_encode(json.dumps(payload).encode())
    sig_input = f"{header}.{body}".encode()
    sig = hmac.new(JWT_SECRET.encode(), sig_input, hashlib.sha256).digest()
    return f"{header}.{body}.{_b64_encode(sig)}"

def jwt_verify(token: str) -> dict:
    """Проверяет JWT. Выбрасывает ValueError при ошибке."""
    try:
        parts = token.split('.')
        if len(parts) != 3:
            raise ValueError("Invalid token format")

        header_b64, body_b64, sig_b64 = parts
        sig_input = f"{header_b64}.{body_b64}".encode()
        expected_sig = hmac.new(JWT_SECRET.encode(), sig_input, hashlib.sha256).digest()
        actual_sig = _b64_decode(sig_b64)

        # Constant-time comparison (защита от timing attack)
        if not hmac.compare_digest(expected_sig, actual_sig):
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
# TELEGRAM MINI APP AUTH
# ─────────────────────────────────────────────────────────────
def verify_telegram_init_data(init_data: str) -> dict:
    """
    Верифицирует initData от Telegram Mini App.
    Документация: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
    """
    if DEMO_MODE:
        params = parse_qs(init_data or '')
        tg_id = params.get('user_id', [str(int(time.time()) % 1000000)])[0]
        return {
            'id': int(tg_id),
            'username': params.get('username', ['demo_user'])[0],
            'first_name': params.get('first_name', ['Demo'])[0],
        }

    if not TG_BOT_TOKEN:
        raise ValueError("TG_BOT_TOKEN not configured for production mode")

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

    auth_date = int(params.get('auth_date', 0))
    if time.time() - auth_date > 86400:
        raise ValueError("initData expired (> 24h)")

    user_str = params.get('user', '{}')
    try:
        user_data = json.loads(unquote(user_str))
    except json.JSONDecodeError:
        raise ValueError("Invalid user data in initData")

    return user_data


# ─────────────────────────────────────────────────────────────
# TRADE CALCULATIONS (на сервере, не на клиенте)
# ─────────────────────────────────────────────────────────────
def calc_slippage(amount: float, symbol: str, exchange_id: str) -> float:
    """Модель проскальзывания: размер ордера vs глубина стакана."""
    depth = {
        'BTC': [500_000, 1_200_000, 3_000_000, 8_000_000],
        'ETH': [250_000, 600_000,   1_500_000, 4_000_000],
        'SOL': [80_000,  200_000,   500_000,   1_200_000],
        'BNB': [120_000, 300_000,   700_000,   2_000_000],
        'XRP': [60_000,  150_000,   400_000,   1_000_000],
    }.get(symbol, [15_000, 40_000, 100_000, 250_000])

    liq = {
        'binance': 2.5, 'coinbase': 2.0, 'okx': 1.9, 'bybit': 1.8,
        'kraken': 1.6, 'kucoin': 1.3, 'gate': 1.1, 'htx': 1.1,
    }.get(exchange_id, 1.0)

    d1, d2, d5, d10 = [t * liq for t in depth]

    if amount <= d1:   return amount / (d1 * 2) * 0.01
    if amount <= d2:   return 0.005 + (amount - d1) / (d2 - d1) * 0.015
    if amount <= d5:   return 0.020 + (amount - d2) / (d5 - d2) * 0.030
    if amount <= d10:  return 0.050 + (amount - d5) / (d10 - d5) * 0.050
    return min(0.15, 0.100 + (amount - d10) / d10 * 0.100)


def server_calc_trade(amount: float, spread_pct: float, symbol: str,
                      buy_exchange: str, sell_exchange: str, is_vip: bool) -> dict:
    """
    ВСЕ расчёты прибыли и комиссий — на сервере.
    Клиент передаёт только параметры, не результат.
    """
    sym = symbol.split('/')[0].split('→')[0].split(' ')[0].upper()

    fee_a    = amount * EXCHANGE_FEES.get(buy_exchange.lower(), 0.001)
    fee_b    = amount * EXCHANGE_FEES.get(sell_exchange.lower(), 0.001)
    net_fee  = NETWORK_FEES.get(sym, 0.50)
    slip_pct = calc_slippage(amount, sym, buy_exchange.lower())
    slip_amt = amount * slip_pct
    plat_fee = amount * (_PLATFORM_CONFIG['fee_vip'] if is_vip else _PLATFORM_CONFIG['fee_free'])

    total_fees = fee_a + fee_b + net_fee + slip_amt + plat_fee
    gross = amount * spread_pct / 100
    net   = round(gross - total_fees, 8)

    return {
        'gross_profit':   round(gross, 8),
        'fee_exchange_a': round(fee_a, 8),
        'fee_exchange_b': round(fee_b, 8),
        'fee_network':    round(net_fee, 8),
        'fee_slippage':   round(slip_amt, 8),
        'fee_platform':   round(plat_fee, 8),
        'total_fees':     round(total_fees, 8),
        'net_profit':     net,
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
        handler.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        handler.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        handler.send_header('X-Content-Type-Options', 'nosniff')
        handler.send_header('X-Frame-Options', 'DENY')
        handler.send_header('Referrer-Policy', 'no-referrer')
        handler.end_headers()
        handler.wfile.write(body)
    except Exception as e:
        logger.error(f"json_response error: {e}")


def require_auth(fn):
    """Проверяет JWT Bearer токен. Не применяется к admin-роутам."""
    @wraps(fn)
    def wrapper(handler, *args, **kwargs):
        auth = handler.headers.get('Authorization', '')
        if not auth.startswith('Bearer '):
            json_response(handler, 401, {'error': 'Missing token'})
            return
        token = auth[7:]
        try:
            payload = jwt_verify(token)
            # Отклоняем admin-токены на пользовательских эндпоинтах
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
    """Проверяет ADMIN_TOKEN из заголовка X-Admin-Token или Authorization."""
    @wraps(fn)
    def wrapper(handler, *args, **kwargs):
        # Поддерживаем оба способа передачи
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
    """Ограничивает частоту запросов по IP."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(handler, *args, **kwargs):
            ip = handler.client_address[0]
            key = f"ip:{ip}"
            allowed, remaining = db.check_rate_limit(key, max_req, window)
            if not allowed:
                logger.warning(f"Rate limit exceeded: {ip}")
                json_response(handler, 429, {
                    'error': 'Rate limit exceeded',
                    'retry_after': window,
                })
                return
            return fn(handler, *args, **kwargs)
        return wrapper
    return decorator


# ─────────────────────────────────────────────────────────────
# MAIN HANDLER
# ─────────────────────────────────────────────────────────────
class NexarbHandler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        # Перенаправляем в наш logger вместо stderr
        logger.debug(f"{self.client_address[0]} - {fmt % args}")

    def _read_json(self) -> dict:
        try:
            length = int(self.headers.get('Content-Length', 0))
            if not length:
                return {}
            raw = self.rfile.read(min(length, 1_048_576))  # max 1 MB
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

    # ── Глобальный rate limit на все запросы ──────────────────
    def _global_rate_check(self) -> bool:
        ip = self.client_address[0]
        allowed, _ = db.check_rate_limit(f"global:{ip}", max_requests=200, window_seconds=60)
        if not allowed:
            logger.warning(f"Global rate limit: {ip}")
            json_response(self, 429, {'error': 'Too many requests', 'retry_after': 60})
        return allowed

    def do_HEAD(self):
        # UptimeRobot и другие мониторы используют HEAD запросы
        # Отвечаем 200 OK без тела — сервер жив
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        if not self._global_rate_check():
            return
        try:
            self._route_get()
        except Exception as e:
            logger.error(f"GET {self.path} error: {e}", exc_info=True)
            json_response(self, 500, {'error': 'Internal server error'})

    def do_POST(self):
        if not self._global_rate_check():
            return
        try:
            self._route_post()
        except Exception as e:
            logger.error(f"POST {self.path} error: {e}", exc_info=True)
            json_response(self, 500, {'error': 'Internal server error'})

    def do_PUT(self):
        if not self._global_rate_check():
            return
        try:
            self._route_put()
        except Exception as e:
            logger.error(f"PUT {self.path} error: {e}", exc_info=True)
            json_response(self, 500, {'error': 'Internal server error'})

    def do_DELETE(self):
        if not self._global_rate_check():
            return
        try:
            self._route_delete()
        except Exception as e:
            logger.error(f"DELETE {self.path} error: {e}", exc_info=True)
            json_response(self, 500, {'error': 'Internal server error'})

    def _route_get(self):
        parsed = urlparse(self.path)
        path   = parsed.path.rstrip('/')

        if path == '/health':
            json_response(self, 200, {
                'status': 'ok',
                'demo': DEMO_MODE,
                'version': '6.0',
                'ts': int(time.time()),
            })

        elif path == '/api/v1/account':
            self._get_account()

        elif path.startswith('/api/v1/trades'):
            parts = path.split('/')
            if len(parts) == 5 and parts[4]:
                self._get_trade_status(parts[4])
            else:
                self._get_trades()

        elif path == '/api/v1/vip/status':
            self._get_vip_status()

        elif path == '/api/v1/exchanges':
            self._get_exchanges()

        elif path == '/api/v1/referrals':
            self._get_referrals()

        # ── ADMIN ROUTES ──────────────────────────────────────
        elif path == '/api/admin/stats':
            self._admin_get_stats()

        elif path == '/api/admin/config':
            self._admin_get_config()

        elif path == '/api/admin/users':
            self._admin_list_users()

        elif path.startswith('/api/admin/users/'):
            uid = path.split('/')[-1]
            self._admin_get_user(uid)

        elif path == '/api/admin/trades':
            self._admin_list_trades()

        else:
            json_response(self, 404, {'error': 'Not found'})

    def _route_post(self):
        parsed = urlparse(self.path)
        path   = parsed.path.rstrip('/')

        if path == '/api/v1/auth/login':
            self._auth_login()
        elif path == '/api/v1/auth/logout':
            self._auth_logout()
        elif path == '/api/v1/trades':
            self._submit_trade()
        elif path == '/api/v1/vip/subscribe':
            self._buy_vip()
        elif path == '/api/v1/exchanges/connect':
            self._connect_exchange()

        # ── ADMIN ROUTES ──────────────────────────────────────
        elif path == '/api/admin/users/vip':
            self._admin_set_vip()

        elif path == '/api/admin/users/balance':
            self._admin_set_balance()

        elif path == '/api/admin/config':
            self._admin_update_config()

        elif path == '/api/admin/broadcast':
            self._admin_broadcast()

        else:
            json_response(self, 404, {'error': 'Not found'})

    def _route_put(self):
        parsed = urlparse(self.path)
        path   = parsed.path.rstrip('/')

        if path == '/api/admin/config':
            self._admin_update_config()
        else:
            json_response(self, 404, {'error': 'Not found'})

    def _route_delete(self):
        parsed = urlparse(self.path)
        path   = parsed.path.rstrip('/')

        if path.startswith('/api/v1/exchanges/'):
            ex_id = path.split('/')[-1]
            self._disconnect_exchange(ex_id)

        elif path.startswith('/api/admin/users/') and path.endswith('/vip'):
            uid = path.split('/')[-2]
            self._admin_revoke_vip(uid)

        else:
            json_response(self, 404, {'error': 'Not found'})


    # ─────────────────────────────────────────────────────────
    # AUTH
    # ─────────────────────────────────────────────────────────
    @rate_limited(max_req=10, window=60)
    def _auth_login(self):
        """POST /api/v1/auth/login — Telegram initData → JWT"""
        ip = self.client_address[0]
        allowed, _ = db.check_rate_limit(f"login:{ip}", max_requests=10, window_seconds=60)
        if not allowed:
            json_response(self, 429, {'error': 'Too many login attempts'})
            return

        data = self._read_json()
        init_data = data.get('init_data', '')

        try:
            tg_user = verify_telegram_init_data(init_data)
        except ValueError as e:
            logger.warning(f"Auth failed from {ip}: {e}")
            json_response(self, 401, {'error': 'Invalid Telegram data'})
            return

        tg_id        = str(tg_user.get('id', ''))
        tg_name      = tg_user.get('first_name', 'User')
        tg_username  = tg_user.get('username', '')

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
                tg_id=tg_id,
                tg_username=tg_username,
                tg_first_name=tg_name,
                ref_code=ref_code,
                user_id=new_id,
                referred_by=ref_by,
                demo_balance=_PLATFORM_CONFIG['demo_start_balance'],
            )
            if not ok:
                user = db.get_user_by_tg_id(tg_id)
            else:
                user = db.get_user_by_id(new_id)
                logger.info(f"New user: {new_id[:8]}... tg:{tg_id}")

        if not user:
            json_response(self, 500, {'error': 'User creation failed'})
            return

        db.update_last_seen(user['id'])
        token = jwt_create({'sub': user['id'], 'tg': tg_id, 'role': 'user'})

        logger.info(f"Login: user={user['id'][:8]}... tg={tg_id}")
        json_response(self, 200, {
            'token':   token,
            'user_id': user['id'],
            'ref_code': user['ref_code'],
            'ttl':     JWT_TTL,
        })

    @require_auth
    def _auth_logout(self):
        """POST /api/v1/auth/logout"""
        payload = self._jwt_payload
        db.revoke_token(payload['jti'], self._user_id, payload['exp'])
        logger.info(f"Logout: user={self._user_id[:8]}...")
        json_response(self, 200, {'ok': True})


    # ─────────────────────────────────────────────────────────
    # ACCOUNT
    # ─────────────────────────────────────────────────────────
    @require_auth
    def _get_account(self):
        """GET /api/v1/account"""
        user_id = self._user_id
        user = db.get_user_by_id(user_id)
        if not user:
            json_response(self, 404, {'error': 'User not found'})
            return

        bal       = db.get_balance(user_id)
        vip       = db.get_vip_status(user_id)
        stats     = db.get_trade_stats(user_id)
        exchanges = db.get_connected_exchanges(user_id)

        balance = bal['demo_balance'] if DEMO_MODE else bal['usd_balance']

        json_response(self, 200, {
            'user_id':   user_id,
            'balance':   round(balance, 2),
            'profit':    round(stats.get('total_profit', 0), 4),
            'trades':    stats.get('total_trades', 0),
            'win_rate':  stats.get('win_rate', 0),
            'vip':       vip['is_vip'],
            'vip_plan':  vip.get('plan'),
            'vip_expires': vip.get('expires_at'),
            'vip_days_left': vip.get('days_left', 0),
            'connected_exchanges': [e['exchange_id'] for e in exchanges],
            'ref_code':  user['ref_code'],
            'lang':      user['lang'],
            'demo_mode': DEMO_MODE,
            # Настройки платформы для клиента
            'platform': {
                'fee_free':        _PLATFORM_CONFIG['fee_free'],
                'fee_vip':         _PLATFORM_CONFIG['fee_vip'],
                'free_trades_max': _PLATFORM_CONFIG['free_trades_max'],
                'min_trade':       _PLATFORM_CONFIG['min_trade'],
                'max_trade':       _PLATFORM_CONFIG['max_trade'],
            },
        })


    # ─────────────────────────────────────────────────────────
    # TRADES
    # ─────────────────────────────────────────────────────────
    @require_auth
    @rate_limited(max_req=30, window=60)
    def _submit_trade(self):
        """POST /api/v1/trades"""
        user_id = self._user_id
        data    = self._read_json()

        amount = float(data.get('amount', 0))
        mn = _PLATFORM_CONFIG['min_trade']
        mx = _PLATFORM_CONFIG['max_trade']
        if not (mn <= amount <= mx):
            json_response(self, 400, {'error': f'Invalid amount ({mn}-{mx})'})
            return

        symbol        = str(data.get('symbol', ''))[:20]
        buy_exchange  = str(data.get('buyExchange', '')).lower()[:20]
        sell_exchange = str(data.get('sellExchange', '')).lower()[:20]
        spread_pct    = float(data.get('spread', 0))
        strategy      = str(data.get('type', 'cex'))[:10]

        if not all([symbol, buy_exchange, sell_exchange]):
            json_response(self, 400, {'error': 'Missing required fields'})
            return

        sp_min = _PLATFORM_CONFIG['spread_min']
        sp_max = _PLATFORM_CONFIG['spread_max']
        if not (sp_min <= spread_pct <= sp_max):
            json_response(self, 400, {'error': f'Suspicious spread ({sp_min}-{sp_max}%)'})
            return

        bal = db.get_balance(user_id)
        balance = bal['demo_balance'] if DEMO_MODE else bal['usd_balance']
        if amount > balance:
            json_response(self, 400, {'error': 'Insufficient balance'})
            return

        vip = db.get_vip_status(user_id)
        if not vip['is_vip']:
            stats = db.get_trade_stats(user_id)
            if stats.get('total_trades', 0) >= _PLATFORM_CONFIG['free_trades_max']:
                json_response(self, 403, {'error': 'FREE plan limit. Upgrade to VIP.'})
                return

        calc = server_calc_trade(
            amount=amount,
            spread_pct=spread_pct,
            symbol=symbol,
            buy_exchange=buy_exchange,
            sell_exchange=sell_exchange,
            is_vip=vip['is_vip'],
        )

        trade_id = str(uuid.uuid4())
        start_ts = time.time()

        db.create_trade({
            'id':            trade_id,
            'user_id':       user_id,
            'symbol':        symbol,
            'strategy_type': strategy,
            'buy_exchange':  buy_exchange,
            'sell_exchange': sell_exchange,
            'amount':        amount,
            'gross_profit':  calc['gross_profit'],
            'fee_exchange_a': calc['fee_exchange_a'],
            'fee_exchange_b': calc['fee_exchange_b'],
            'fee_network':   calc['fee_network'],
            'fee_slippage':  calc['fee_slippage'],
            'fee_platform':  calc['fee_platform'],
            'net_profit':    calc['net_profit'],
            'spread_pct':    spread_pct,
            'ai_score':      int(data.get('aiScore', 0)),
            'execution_ms':  int(data.get('latency', 50)),
            'balance_before': balance,
            'balance_after':  balance,
            'is_auto':       data.get('is_auto', False),
        })

        bal_before, bal_after = db.apply_trade_result(
            user_id, trade_id, calc['net_profit'], is_demo=DEMO_MODE
        )

        exec_ms = int((time.time() - start_ts) * 1000)
        logger.info(
            f"Trade {trade_id[:8]}... user={user_id[:8]}... "
            f"sym={symbol} net=${calc['net_profit']:.4f}"
        )

        json_response(self, 200, {
            'orderId':      trade_id,
            'status':       'completed',
            'symbol':       symbol,
            'buyExchange':  buy_exchange,
            'sellExchange': sell_exchange,
            'amount':       amount,
            'grossProfit':  calc['gross_profit'],
            'feeExchangeA': calc['fee_exchange_a'],
            'feeExchangeB': calc['fee_exchange_b'],
            'feeNetwork':   calc['fee_network'],
            'feeSlippage':  calc['fee_slippage'],
            'platformFee':  calc['fee_platform'],
            'netProfit':    calc['net_profit'],
            'newBalance':   round(bal_after, 2),
            'spread':       spread_pct,
            'executionMs':  exec_ms,
        })

    @require_auth
    def _get_trade_status(self, trade_id: str):
        """GET /api/v1/trades/:id"""
        if not re.match(r'^[0-9a-f-]{36}$', trade_id):
            json_response(self, 400, {'error': 'Invalid trade ID'})
            return
        trade = db.get_trade(trade_id, self._user_id)
        if not trade:
            json_response(self, 404, {'error': 'Trade not found'})
            return
        json_response(self, 200, {
            'orderId':    trade['id'],
            'status':     trade['status'],
            'netProfit':  trade['net_profit'],
            'platformFee': trade['fee_platform'],
            'newBalance': trade['balance_after'],
            'executionMs': trade['execution_ms'],
        })

    @require_auth
    def _get_trades(self):
        """GET /api/v1/trades?page=1"""
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        page = max(1, int(qs.get('page', ['1'])[0]))
        result = db.get_trades_history(self._user_id, page=page)
        json_response(self, 200, result)


    # ─────────────────────────────────────────────────────────
    # VIP
    # ─────────────────────────────────────────────────────────
    @require_auth
    def _get_vip_status(self):
        vip = db.get_vip_status(self._user_id)
        json_response(self, 200, vip)

    @require_auth
    def _buy_vip(self):
        """POST /api/v1/vip/subscribe"""
        data = self._read_json()
        plan = data.get('plan', '').lower()
        if plan not in ('week', 'month', 'year'):
            json_response(self, 400, {'error': 'Invalid plan (week/month/year)'})
            return

        if DEMO_MODE:
            result = db.activate_vip(self._user_id, plan, payment_id='DEMO')
            logger.info(f"VIP activated (demo): user={self._user_id[:8]}... plan={plan}")
            json_response(self, 200, {'ok': True, **result})
        else:
            payment_id = data.get('payment_id', '').strip()
            if not payment_id:
                json_response(self, 400, {'error': 'payment_id required in production'})
                return
            # TODO: верифицировать payment_id через Stripe/TON webhook
            # before activating. Example:
            #   stripe.PaymentIntent.retrieve(payment_id).status == 'succeeded'
            result = db.activate_vip(self._user_id, plan, payment_id=payment_id)
            logger.info(f"VIP activated: user={self._user_id[:8]}... plan={plan} pay={payment_id[:8]}")
            json_response(self, 200, {'ok': True, **result})


    # ─────────────────────────────────────────────────────────
    # EXCHANGES
    # ─────────────────────────────────────────────────────────
    @require_auth
    def _get_exchanges(self):
        exchanges = db.get_connected_exchanges(self._user_id)
        json_response(self, 200, {'exchanges': exchanges})

    @require_auth
    def _connect_exchange(self):
        """POST /api/v1/exchanges/connect"""
        data        = self._read_json()
        exchange_id = str(data.get('exchangeId', '')).lower()[:20]
        api_key     = str(data.get('apiKey', ''))
        secret      = str(data.get('secret', ''))

        if not exchange_id or len(api_key) < 8 or len(secret) < 8:
            json_response(self, 400, {'error': 'Invalid exchange credentials'})
            return

        vip = db.get_vip_status(self._user_id)
        if not vip['is_vip']:
            existing = db.get_connected_exchanges(self._user_id)
            mx = _PLATFORM_CONFIG['free_exchanges_max']
            if len(existing) >= mx:
                json_response(self, 403, {
                    'error': f'FREE plan: max {mx} exchanges. Upgrade to VIP.'
                })
                return

        # SECURITY NOTE: api_key хранится только маска.
        # В PROD: зашифровать AES-256-GCM ключём из env:
        #   from cryptography.fernet import Fernet  # pip install cryptography
        #   f = Fernet(os.environ['ENCRYPT_KEY'])
        #   encrypted = f.encrypt(api_key.encode())
        # Без cryptography — простой XOR с ключом (НЕ для продакшна):
        #   key_bytes = ADMIN_TOKEN.encode()[:len(api_key)]
        #   xored = bytes(a ^ b for a, b in zip(api_key.encode(), key_bytes * 100))
        ok = db.save_exchange_connection(self._user_id, exchange_id, api_key)
        json_response(self, 200 if ok else 500, {
            'ok': ok,
            'exchangeId': exchange_id,
            'keyMask': api_key[:4] + '****' + api_key[-4:],
        })

    @require_auth
    def _disconnect_exchange(self, exchange_id: str):
        ok = db.remove_exchange(self._user_id, exchange_id.lower()[:20])
        json_response(self, 200, {'ok': ok})

    @require_auth
    def _get_referrals(self):
        stats = db.get_referral_stats(self._user_id)
        json_response(self, 200, stats)


    # ═════════════════════════════════════════════════════════
    #  ADMIN API  (/api/admin/*)
    #  Все методы защищены require_admin — проверяет ADMIN_TOKEN
    # ═════════════════════════════════════════════════════════

    @require_admin
    def _admin_get_stats(self):
        """GET /api/admin/stats — общая статистика платформы"""
        stats = db.admin_get_platform_stats()
        json_response(self, 200, {
            **stats,
            'config': _PLATFORM_CONFIG,
            'demo_mode': DEMO_MODE,
        })

    @require_admin
    def _admin_get_config(self):
        """GET /api/admin/config — текущие настройки платформы"""
        json_response(self, 200, {
            'config':       _PLATFORM_CONFIG,
            'network_fees': NETWORK_FEES,
            'exchange_fees': EXCHANGE_FEES,
            'demo_mode':    DEMO_MODE,
        })

    @require_admin
    def _admin_update_config(self):
        """
        POST /api/admin/config — обновить настройки платформы.
        Изменения живут в памяти до рестарта.
        TODO: персистировать в таблице settings в БД.

        Body: {
            "fee_free": 0.008,
            "fee_vip": 0.003,
            "free_trades_max": 5,
            "free_exchanges_max": 2,
            "min_trade": 10,
            "max_trade": 1000000,
            "spread_min": 0.01,
            "spread_max": 20,
            "demo_start_balance": 3000,
            "network_fees": { "BTC": 1.50, ... },
            "exchange_fees": { "binance": 0.001, ... }
        }
        """
        data = self._read_json()
        changed = {}

        # Числовые поля конфига
        numeric_fields = [
            'fee_free', 'fee_vip', 'free_trades_max', 'free_exchanges_max',
            'min_trade', 'max_trade', 'spread_min', 'spread_max', 'demo_start_balance',
        ]
        for field in numeric_fields:
            if field in data:
                val = float(data[field])
                if val < 0:
                    json_response(self, 400, {'error': f'{field} must be >= 0'})
                    return
                old = _PLATFORM_CONFIG.get(field)
                _PLATFORM_CONFIG[field] = val
                changed[field] = {'old': old, 'new': val}

        # Обновление network fees
        if 'network_fees' in data and isinstance(data['network_fees'], dict):
            for coin, fee in data['network_fees'].items():
                coin = coin.upper()[:10]
                val  = float(fee)
                old  = NETWORK_FEES.get(coin)
                NETWORK_FEES[coin] = val
                changed[f'network_{coin}'] = {'old': old, 'new': val}

        # Обновление exchange fees
        if 'exchange_fees' in data and isinstance(data['exchange_fees'], dict):
            for ex, fee in data['exchange_fees'].items():
                ex  = ex.lower()[:20]
                val = float(fee)
                old = EXCHANGE_FEES.get(ex)
                EXCHANGE_FEES[ex] = val
                changed[f'exfee_{ex}'] = {'old': old, 'new': val}

        logger.info(f"Admin config updated: {list(changed.keys())}")
        json_response(self, 200, {'ok': True, 'changed': changed, 'config': _PLATFORM_CONFIG})

    @require_admin
    def _admin_list_users(self):
        """GET /api/admin/users?page=1&search=&vip="""
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        page   = max(1, int(qs.get('page',   ['1'])[0]))
        search = qs.get('search', [''])[0]
        vip_only = qs.get('vip', [''])[0].lower() == 'true'
        users = db.admin_list_users(page=page, search=search, vip_only=vip_only)
        json_response(self, 200, users)

    @require_admin
    def _admin_get_user(self, user_id: str):
        """GET /api/admin/users/:id"""
        # Поддерживаем поиск по tg_id или user_id
        user = db.get_user_by_id(user_id)
        if not user:
            user = db.get_user_by_tg_id(user_id)
        if not user:
            json_response(self, 404, {'error': 'User not found'})
            return

        uid  = user['id']
        bal  = db.get_balance(uid)
        vip  = db.get_vip_status(uid)
        stat = db.get_trade_stats(uid)
        exch = db.get_connected_exchanges(uid)

        json_response(self, 200, {
            'user':       dict(user),
            'balance':    bal,
            'vip':        vip,
            'stats':      stat,
            'exchanges':  exch,
        })

    @require_admin
    def _admin_set_vip(self):
        """
        POST /api/admin/users/vip
        Body: { "user_id": "...", "plan": "month", "days": 30 }
        Ручная выдача VIP без оплаты.
        """
        data    = self._read_json()
        user_id = str(data.get('user_id', ''))
        plan    = str(data.get('plan', 'month')).lower()
        days    = int(data.get('days', 30))

        if not user_id:
            json_response(self, 400, {'error': 'user_id required'})
            return

        # Ищем пользователя (по UUID или tg_id)
        user = db.get_user_by_id(user_id)
        if not user:
            user = db.get_user_by_tg_id(user_id)
        if not user:
            json_response(self, 404, {'error': 'User not found'})
            return

        if plan not in ('week', 'month', 'year', 'lifetime'):
            plan = 'month'

        result = db.admin_activate_vip(user['id'], plan, days=days)
        logger.info(f"Admin VIP set: user={user['id'][:8]}... plan={plan} days={days}")
        json_response(self, 200, {'ok': True, 'user_id': user['id'], **result})

    @require_admin
    def _admin_revoke_vip(self, user_id: str):
        """DELETE /api/admin/users/:id/vip"""
        user = db.get_user_by_id(user_id)
        if not user:
            user = db.get_user_by_tg_id(user_id)
        if not user:
            json_response(self, 404, {'error': 'User not found'})
            return
        ok = db.admin_revoke_vip(user['id'])
        logger.info(f"Admin VIP revoked: user={user['id'][:8]}...")
        json_response(self, 200, {'ok': ok})

    @require_admin
    def _admin_set_balance(self):
        """
        POST /api/admin/users/balance
        Body: { "user_id": "...", "balance": 5000, "demo": true }
        """
        data    = self._read_json()
        user_id = str(data.get('user_id', ''))
        balance = float(data.get('balance', 0))
        is_demo = bool(data.get('demo', True))

        if not user_id or balance < 0:
            json_response(self, 400, {'error': 'Invalid user_id or balance'})
            return

        user = db.get_user_by_id(user_id)
        if not user:
            user = db.get_user_by_tg_id(user_id)
        if not user:
            json_response(self, 404, {'error': 'User not found'})
            return

        ok = db.admin_set_balance(user['id'], balance, is_demo=is_demo)
        logger.info(
            f"Admin balance set: user={user['id'][:8]}... "
            f"{'demo' if is_demo else 'real'}=${balance}"
        )
        json_response(self, 200, {'ok': ok, 'user_id': user['id'], 'balance': balance})

    @require_admin
    def _admin_list_trades(self):
        """GET /api/admin/trades?page=1&user_id="""
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        page    = max(1, int(qs.get('page', ['1'])[0]))
        uid     = qs.get('user_id', [''])[0]
        result  = db.admin_list_trades(page=page, user_id=uid or None)
        json_response(self, 200, result)

    @require_admin
    def _admin_broadcast(self):
        """
        POST /api/admin/broadcast
        Body: { "message": "...", "type": "info|warn|alert" }
        TODO: реализовать через Telegram Bot API sendMessage
        """
        data = self._read_json()
        msg  = str(data.get('message', ''))[:500]
        typ  = data.get('type', 'info')
        if not msg:
            json_response(self, 400, {'error': 'message required'})
            return
        # TODO: рассылка через TG Bot API:
        #   users = db.admin_list_all_tg_ids()
        #   for tg_id in users:
        #       urllib.request.urlopen(
        #           f"https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage",
        #           data=json.dumps({"chat_id": tg_id, "text": msg}).encode()
        #       )
        logger.info(f"Admin broadcast [{typ}]: {msg[:80]}...")
        json_response(self, 200, {'ok': True, 'queued': 0, 'message': msg})


# ─────────────────────────────────────────────────────────────
# HTTPS / SSL
# ─────────────────────────────────────────────────────────────
def make_ssl_context() -> ssl.SSLContext | None:
    """
    Создаёт SSL-контекст если заданы CERT_FILE и KEY_FILE.
    Возвращает None если HTTPS не настроен.
    """
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
    print("  NEXARB Backend Server v6.0")
    print("=" * 60)
    print(f"  Mode:      {'⚠️  DEMO' if DEMO_MODE else '🔒 PRODUCTION'}")
    print(f"  Port:      {PORT}")
    print(f"  Database:  {db.DB_PATH}")
    print(f"  JWT TTL:   {JWT_TTL // 3600}h")
    print(f"  HTTPS:     {'YES (' + CERT_FILE + ')' if CERT_FILE else 'NO (HTTP only)'}")
    print(f"  Admin:     /api/admin/* (X-Admin-Token)")
    print("=" * 60)

    if DEMO_MODE:
        print("\n  ⚠️  DEMO MODE: Telegram auth bypassed, real payments disabled")

    try:
        db.init_db()
    except Exception as e:
        logger.critical(f"DB init failed: {e}")
        raise SystemExit(1)

    server = HTTPServer(('0.0.0.0', PORT), NexarbHandler)

    ssl_ctx = make_ssl_context()
    if ssl_ctx:
        server.socket = ssl_ctx.wrap_socket(server.socket, server_side=True)
        proto = 'HTTPS'
    else:
        proto = 'HTTP'

    logger.info(f"Server running on {proto}://0.0.0.0:{PORT}")
    print(f"\n[OK] {proto}://0.0.0.0:{PORT}")
    print("\nUser endpoints:")
    print("  POST /api/v1/auth/login       — Telegram initData → JWT")
    print("  GET  /api/v1/account          — Balance, VIP, stats")
    print("  POST /api/v1/trades           — Submit trade")
    print("  POST /api/v1/vip/subscribe    — Activate VIP")
    print("\nAdmin endpoints (X-Admin-Token header):")
    print("  GET  /api/admin/stats         — Platform stats")
    print("  GET  /api/admin/config        — Current config")
    print("  POST /api/admin/config        — Update fees/limits")
    print("  GET  /api/admin/users         — List users")
    print("  GET  /api/admin/users/:id     — User details")
    print("  POST /api/admin/users/vip     — Grant VIP manually")
    print("  DELETE /api/admin/users/:id/vip — Revoke VIP")
    print("  POST /api/admin/users/balance — Set balance")
    print("  GET  /api/admin/trades        — All trades")
    print("  POST /api/admin/broadcast     — Send message\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[STOP] Server stopped.")
        server.server_close()
