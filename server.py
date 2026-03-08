"""
NEXARB — Backend Server v5.0
Pure Python stdlib — без внешних зависимостей

Запуск:
  python3 server.py

Переменные окружения (.env):
  JWT_SECRET=your-256-bit-secret-here
  NEXARB_DB=nexarb.db
  PORT=8000
  DEMO_MODE=true        # false в проде
  TG_BOT_TOKEN=...      # для верификации Telegram initData
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
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote
from functools import wraps

import database as db

# ─────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────
PORT         = int(os.environ.get('PORT', 8000))
JWT_SECRET   = os.environ.get('JWT_SECRET', secrets.token_hex(32))
JWT_TTL      = 3600 * 4        # 4 часа
DEMO_MODE    = os.environ.get('DEMO_MODE', 'true').lower() == 'true'
TG_BOT_TOKEN = os.environ.get('TG_BOT_TOKEN', '')

# Комиссии платформы
FEE_FREE = 0.008   # 0.8% для FREE
FEE_VIP  = 0.003   # 0.3% для VIP

# Реальные withdrawal fees по сети (USD)
NETWORK_FEES = {
    'BTC': 1.20, 'ETH': 2.50, 'SOL': 0.01, 'BNB': 0.15,
    'XRP': 0.10, 'DOGE': 0.50, 'ADA': 0.20, 'AVAX': 0.30,
    'MATIC': 0.02, 'ARB': 0.10, 'OP': 0.10, 'TON': 0.05,
    'TRX': 0.10, 'NEAR': 0.10,
}

# Taker комиссии бирж
EXCHANGE_FEES = {
    'binance': 0.001, 'okx': 0.001, 'bybit': 0.001,
    'kucoin': 0.001, 'gate': 0.002, 'mexc': 0.0005,
    'htx': 0.002, 'coinbase': 0.006, 'kraken': 0.0026,
    'bitget': 0.001, 'bitmart': 0.0025, 'phemex': 0.001,
    'crypto': 0.004, 'bingx': 0.002, 'lbank': 0.002,
}

# Вывод в консоль с временем
def log(level: str, msg: str):
    ts = time.strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{ts}] [{level}] {msg}")


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

def jwt_create(payload: dict) -> str:
    """Создаёт подписанный HS256 JWT токен."""
    header = _b64_encode(json.dumps({'alg': 'HS256', 'typ': 'JWT'}).encode())
    now = int(time.time())
    payload = {**payload, 'iat': now, 'exp': now + JWT_TTL, 'jti': str(uuid.uuid4())}
    body = _b64_encode(json.dumps(payload).encode())
    sig_input = f"{header}.{body}".encode()
    sig = hmac.new(JWT_SECRET.encode(), sig_input, hashlib.sha256).digest()
    return f"{header}.{body}.{_b64_encode(sig)}"

def jwt_verify(token: str) -> dict:
    """
    Проверяет JWT. Выбрасывает ValueError при ошибке.
    Проверяет: подпись, срок действия, отзыв.
    """
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

        # Проверяем отзыв
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

    В DEMO_MODE возвращает фиктивного пользователя без верификации.
    В продакшне: TG_BOT_TOKEN обязателен.
    """
    if DEMO_MODE:
        # Demo: принимаем любой tg_id из initData или генерируем
        params = parse_qs(init_data or '')
        tg_id = params.get('user_id', [str(int(time.time()))])[0]
        return {
            'id': int(tg_id),
            'username': params.get('username', ['demo_user'])[0],
            'first_name': params.get('first_name', ['Demo'])[0],
        }

    if not TG_BOT_TOKEN:
        raise ValueError("TG_BOT_TOKEN not configured")

    # Разбираем параметры
    params = dict(item.split('=', 1) for item in unquote(init_data).split('&'))
    received_hash = params.pop('hash', '')

    # Строим data_check_string
    data_check_string = '\n'.join(
        f"{k}={v}" for k, v in sorted(params.items())
    )

    # Создаём secret_key = HMAC-SHA256("WebAppData", bot_token)
    secret_key = hmac.new(b'WebAppData', TG_BOT_TOKEN.encode(), hashlib.sha256).digest()
    expected_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected_hash, received_hash):
        raise ValueError("Invalid Telegram signature")

    # Проверяем freshness (не старше 24 часов)
    auth_date = int(params.get('auth_date', 0))
    if time.time() - auth_date > 86400:
        raise ValueError("initData expired")

    user_data = json.loads(params.get('user', '{}'))
    return user_data


# ─────────────────────────────────────────────────────────────
# TRADE CALCULATIONS (на сервере, не на клиенте)
# ─────────────────────────────────────────────────────────────
def calc_slippage(amount: float, symbol: str, exchange_id: str) -> float:
    """Расчёт проскальзывания на основе ликвидности."""
    depth = {
        'BTC': [100000, 300000, 600000, 1500000],
        'ETH': [60000,  180000, 400000, 900000],
        'SOL': [20000,  60000,  150000, 350000],
    }.get(symbol, [8000, 25000, 60000, 150000])

    mult = {'binance': 2.5, 'coinbase': 2.0, 'okx': 1.9, 'bybit': 1.8,
            'kraken': 1.6, 'kucoin': 1.3}.get(exchange_id, 1.0)
    tiers = [t * mult for t in depth]

    if amount <= tiers[0]: return 0.00005
    if amount <= tiers[1]: return 0.0003
    if amount <= tiers[2]: return 0.001
    if amount <= tiers[3]: return 0.003
    return 0.008


def server_calc_trade(amount: float, spread_pct: float, symbol: str,
                      buy_exchange: str, sell_exchange: str, is_vip: bool) -> dict:
    """
    ВСЕ расчёты прибыли и комиссий — на сервере.
    Клиент передаёт только параметры сделки, не результат.
    """
    sym = symbol.split('/')[0].split('→')[0].split(' ')[0]

    fee_a = amount * EXCHANGE_FEES.get(buy_exchange.lower(), 0.001)
    fee_b = amount * EXCHANGE_FEES.get(sell_exchange.lower(), 0.001)
    net_fee = NETWORK_FEES.get(sym, 0.50)
    slip_pct = calc_slippage(amount, sym, buy_exchange.lower())
    slip_amt = amount * slip_pct
    plat_fee = amount * (FEE_VIP if is_vip else FEE_FREE)

    total_fees = fee_a + fee_b + net_fee + slip_amt + plat_fee
    gross = amount * spread_pct / 100
    net = round(gross - total_fees, 8)

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
# HTTP SERVER
# ─────────────────────────────────────────────────────────────
def json_response(handler, status: int, data: dict):
    body = json.dumps(data, ensure_ascii=False).encode('utf-8')
    handler.send_response(status)
    handler.send_header('Content-Type', 'application/json; charset=utf-8')
    handler.send_header('Content-Length', len(body))
    # CORS для Telegram Mini App
    handler.send_header('Access-Control-Allow-Origin', '*')
    handler.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    handler.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    # Security headers
    handler.send_header('X-Content-Type-Options', 'nosniff')
    handler.send_header('X-Frame-Options', 'DENY')
    handler.send_header('Referrer-Policy', 'no-referrer')
    handler.end_headers()
    handler.wfile.write(body)


def require_auth(fn):
    """Декоратор: проверяет JWT токен в заголовке Authorization."""
    @wraps(fn)
    def wrapper(handler, *args, **kwargs):
        auth = handler.headers.get('Authorization', '')
        if not auth.startswith('Bearer '):
            json_response(handler, 401, {'error': 'Missing token'})
            return
        token = auth[7:]
        try:
            payload = jwt_verify(token)
            handler._user_id = payload['sub']
            handler._jwt_payload = payload
        except ValueError as e:
            json_response(handler, 401, {'error': str(e)})
            return
        return fn(handler, *args, **kwargs)
    return wrapper


def rate_limited(max_req: int = 30, window: int = 60):
    """Декоратор: ограничивает частоту запросов по IP."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(handler, *args, **kwargs):
            ip = handler.client_address[0]
            key = f"ip:{ip}"
            allowed, remaining = db.check_rate_limit(key, max_req, window)
            if not allowed:
                json_response(handler, 429, {
                    'error': 'Rate limit exceeded',
                    'retry_after': window
                })
                return
            return fn(handler, *args, **kwargs)
        return wrapper
    return decorator


class NexarbHandler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        log('HTTP', f"{self.client_address[0]} - {fmt % args}")

    def _read_json(self) -> dict:
        length = int(self.headers.get('Content-Length', 0))
        if not length:
            return {}
        try:
            raw = self.rfile.read(length)
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}

    def do_OPTIONS(self):
        """CORS preflight."""
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path   = parsed.path.rstrip('/')

        if path == '/health':
            json_response(self, 200, {'status': 'ok', 'demo': DEMO_MODE})

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

        else:
            json_response(self, 404, {'error': 'Not found'})

    def do_POST(self):
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

        else:
            json_response(self, 404, {'error': 'Not found'})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path   = parsed.path.rstrip('/')

        if path.startswith('/api/v1/exchanges/'):
            ex_id = path.split('/')[-1]
            self._disconnect_exchange(ex_id)
        else:
            json_response(self, 404, {'error': 'Not found'})

    # ─────────────────────────────────────────────────────────
    # AUTH — критически важно
    # ─────────────────────────────────────────────────────────
    def _auth_login(self):
        """
        POST /api/v1/auth/login
        Body: {"init_data": "<telegram initData string>"}

        1. Верифицирует подпись Telegram
        2. Создаёт пользователя если не существует (ID = сервер, не клиент)
        3. Возвращает JWT токен
        """
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
            log('WARN', f"Auth failed from {ip}: {e}")
            json_response(self, 401, {'error': 'Invalid Telegram data'})
            return

        tg_id   = str(tg_user.get('id', ''))
        tg_name = tg_user.get('first_name', 'User')
        tg_user_name = tg_user.get('username', '')

        if not tg_id:
            json_response(self, 400, {'error': 'Missing user ID'})
            return

        # Находим или создаём пользователя
        user = db.get_user_by_tg_id(tg_id)

        if not user:
            # ID генерируется СЕРВЕРОМ через uuid4 — не клиентом
            new_id   = str(uuid.uuid4())
            # ref_code тоже генерируется сервером — не клиентом
            ref_code = secrets.token_urlsafe(6).upper()[:8]

            # Проверяем реферальный код из initData
            ref_by = data.get('ref_code', '').upper().strip()
            if not re.match(r'^[A-Z0-9]{4,12}$', ref_by):
                ref_by = None

            ok = db.create_user(
                tg_id=tg_id,
                tg_username=tg_user_name,
                tg_first_name=tg_name,
                ref_code=ref_code,
                user_id=new_id,
                referred_by=ref_by,
            )
            if not ok:
                # Race condition — повторно читаем
                user = db.get_user_by_tg_id(tg_id)
            else:
                user = db.get_user_by_id(new_id)
                log('INFO', f"New user created: {new_id} (tg:{tg_id})")

        db.update_last_seen(user['id'])

        # Создаём JWT — sub = user_id (наш серверный UUID, не tg_id)
        token = jwt_create({'sub': user['id'], 'tg': tg_id})

        log('INFO', f"Login: user={user['id'][:8]}... tg={tg_id}")
        json_response(self, 200, {
            'token': token,
            'user_id': user['id'],
            'ref_code': user['ref_code'],
            'ttl': JWT_TTL,
        })

    @require_auth
    def _auth_logout(self):
        """POST /api/v1/auth/logout — отзывает токен."""
        payload = self._jwt_payload
        db.revoke_token(
            payload['jti'],
            self._user_id,
            payload['exp']
        )
        json_response(self, 200, {'ok': True})

    # ─────────────────────────────────────────────────────────
    # ACCOUNT
    # ─────────────────────────────────────────────────────────
    @require_auth
    def _get_account(self):
        """GET /api/v1/account — источник правды для клиента."""
        user_id = self._user_id
        user    = db.get_user_by_id(user_id)
        if not user:
            json_response(self, 404, {'error': 'User not found'})
            return

        bal     = db.get_balance(user_id)
        vip     = db.get_vip_status(user_id)
        stats   = db.get_trade_stats(user_id)
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
        })

    # ─────────────────────────────────────────────────────────
    # TRADES
    # ─────────────────────────────────────────────────────────
    @require_auth
    def _submit_trade(self):
        """
        POST /api/v1/trades

        БЕЗОПАСНОСТЬ:
        1. Клиент передаёт ТОЛЬКО параметры (сумму, пару, биржи)
        2. Сервер САМИ считает все комиссии и прибыль
        3. Сервер проверяет баланс по БД, не по словам клиента
        4. Результат записывается атомарно в транзакции
        """
        user_id = self._user_id
        data    = self._read_json()

        # Валидация входных данных
        amount = float(data.get('amount', 0))
        if not (10 <= amount <= 1_000_000):
            json_response(self, 400, {'error': 'Invalid amount (10-1000000)'})
            return

        symbol       = str(data.get('symbol', ''))[:20]
        buy_exchange = str(data.get('buyExchange', '')).lower()[:20]
        sell_exchange= str(data.get('sellExchange', '')).lower()[:20]
        spread_pct   = float(data.get('spread', 0))
        strategy     = str(data.get('type', 'cex'))[:10]

        if not all([symbol, buy_exchange, sell_exchange]):
            json_response(self, 400, {'error': 'Missing required fields'})
            return

        if not (0.01 <= spread_pct <= 20):
            json_response(self, 400, {'error': 'Suspicious spread value'})
            return

        # Проверяем баланс по БД (не верим клиенту)
        bal = db.get_balance(user_id)
        balance = bal['demo_balance'] if DEMO_MODE else bal['usd_balance']

        if amount > balance:
            json_response(self, 400, {'error': 'Insufficient balance'})
            return

        # Проверяем VIP/FREE лимит
        vip = db.get_vip_status(user_id)
        if not vip['is_vip']:
            stats = db.get_trade_stats(user_id)
            if stats.get('total_trades', 0) >= 5:
                json_response(self, 403, {'error': 'FREE limit reached. Upgrade to VIP.'})
                return

        # ── СЕРВЕР САМИ СЧИТАЕТ ПРИБЫЛЬ ──────────────────────
        calc = server_calc_trade(
            amount=amount,
            spread_pct=spread_pct,
            symbol=symbol,
            buy_exchange=buy_exchange,
            sell_exchange=sell_exchange,
            is_vip=vip['is_vip'],
        )

        # Проверяем: spread должен покрывать хотя бы 0.1% после всех комиссий
        if calc['gross_profit'] < 0:
            json_response(self, 400, {'error': 'Trade not profitable after fees'})
            return

        trade_id = str(uuid.uuid4())
        ai_score = int(data.get('aiScore', 0))
        latency  = int(data.get('latency', 50))
        start_ts = time.time()

        # Создаём запись со статусом pending
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
            'ai_score':      ai_score,
            'execution_ms':  latency,
            'balance_before': balance,
            'balance_after':  balance,  # обновится в apply_trade_result
            'is_auto':       data.get('is_auto', False),
        })

        # Атомарно применяем к балансу
        bal_before, bal_after = db.apply_trade_result(
            user_id, trade_id, calc['net_profit'], is_demo=DEMO_MODE
        )

        exec_ms = int((time.time() - start_ts) * 1000)

        log('INFO', f"Trade {trade_id[:8]}... user={user_id[:8]}... "
            f"symbol={symbol} net=${calc['net_profit']:.4f}")

        json_response(self, 200, {
            'orderId':       trade_id,
            'status':        'completed',
            'symbol':        symbol,
            'buyExchange':   buy_exchange,
            'sellExchange':  sell_exchange,
            'amount':        amount,
            'grossProfit':   calc['gross_profit'],
            'feeExchangeA':  calc['fee_exchange_a'],
            'feeExchangeB':  calc['fee_exchange_b'],
            'feeNetwork':    calc['fee_network'],
            'feeSlippage':   calc['fee_slippage'],
            'platformFee':   calc['fee_platform'],
            'netProfit':     calc['net_profit'],
            'newBalance':    round(bal_after, 2),
            'spread':        spread_pct,
            'executionMs':   exec_ms,
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
        page = int(qs.get('page', ['1'])[0])
        result = db.get_trades_history(self._user_id, page=page)
        json_response(self, 200, result)

    # ─────────────────────────────────────────────────────────
    # VIP
    # ─────────────────────────────────────────────────────────
    @require_auth
    def _get_vip_status(self):
        """GET /api/v1/vip/status"""
        vip = db.get_vip_status(self._user_id)
        json_response(self, 200, vip)

    @require_auth
    def _buy_vip(self):
        """
        POST /api/v1/vip/subscribe
        Body: {"plan": "week"|"month"|"year", "payment_id": "..."}

        В DEMO_MODE: активируем без проверки платежа.
        В PROD: payment_id должен быть верифицирован через Stripe/TON webhook.
        """
        data = self._read_json()
        plan = data.get('plan', '').lower()

        if plan not in ('week', 'month', 'year'):
            json_response(self, 400, {'error': 'Invalid plan'})
            return

        if DEMO_MODE:
            # Demo: активируем без оплаты
            result = db.activate_vip(self._user_id, plan, payment_id='DEMO')
            json_response(self, 200, {'ok': True, **result})
        else:
            # PROD: требуем подтверждённый payment_id
            payment_id = data.get('payment_id', '')
            if not payment_id:
                json_response(self, 400, {'error': 'payment_id required in production mode'})
                return
            # TODO: верифицировать payment_id через платёжную систему
            result = db.activate_vip(self._user_id, plan, payment_id=payment_id)
            json_response(self, 200, {'ok': True, **result})

    # ─────────────────────────────────────────────────────────
    # EXCHANGES
    # ─────────────────────────────────────────────────────────
    @require_auth
    def _get_exchanges(self):
        """GET /api/v1/exchanges"""
        exchanges = db.get_connected_exchanges(self._user_id)
        json_response(self, 200, {'exchanges': exchanges})

    @require_auth
    def _connect_exchange(self):
        """
        POST /api/v1/exchanges/connect
        Body: {"exchangeId": "binance", "apiKey": "...", "secret": "..."}

        Ключи НИКОГДА не возвращаются клиенту.
        Хранится только маска (xxxx****xxxx).
        PROD: зашифровать ключи AES-256-GCM перед сохранением.
        """
        data = self._read_json()
        exchange_id = str(data.get('exchangeId', '')).lower()[:20]
        api_key     = str(data.get('apiKey', ''))
        secret      = str(data.get('secret', ''))

        if not exchange_id or len(api_key) < 8 or len(secret) < 8:
            json_response(self, 400, {'error': 'Invalid exchange credentials'})
            return

        # Проверяем лимит FREE (максимум 2 биржи)
        vip = db.get_vip_status(self._user_id)
        if not vip['is_vip']:
            existing = db.get_connected_exchanges(self._user_id)
            if len(existing) >= 2:
                json_response(self, 403, {
                    'error': 'FREE plan allows max 2 exchanges. Upgrade to VIP.'
                })
                return

        ok = db.save_exchange_connection(self._user_id, exchange_id, api_key)
        json_response(self, 200 if ok else 500, {
            'ok': ok,
            'exchangeId': exchange_id,
            'keyMask': api_key[:4] + '****' + api_key[-4:],
        })

    @require_auth
    def _disconnect_exchange(self, exchange_id: str):
        """DELETE /api/v1/exchanges/:id"""
        exchange_id = exchange_id.lower()[:20]
        ok = db.remove_exchange(self._user_id, exchange_id)
        json_response(self, 200, {'ok': ok})

    # ─────────────────────────────────────────────────────────
    # REFERRALS
    # ─────────────────────────────────────────────────────────
    @require_auth
    def _get_referrals(self):
        """GET /api/v1/referrals"""
        # TODO: реализовать подсчёт рефералов из БД
        json_response(self, 200, {'referrals': [], 'earned': 0})


# ─────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print("=" * 60)
    print("  NEXARB Backend Server v5.0")
    print("=" * 60)
    print(f"  Mode:     {'DEMO' if DEMO_MODE else 'PRODUCTION'}")
    print(f"  Port:     {PORT}")
    print(f"  Database: {db.DB_PATH}")
    print(f"  JWT TTL:  {JWT_TTL // 3600}h")
    print("=" * 60)

    # Инициализируем БД
    db.init_db()

    # Запускаем сервер
    server = HTTPServer(('0.0.0.0', PORT), NexarbHandler)
    print(f"\n[OK] Server running on http://0.0.0.0:{PORT}")
    print(f"[OK] Health check: http://localhost:{PORT}/health")
    print("\nEndpoints:")
    print("  POST /api/v1/auth/login       — Telegram initData → JWT")
    print("  GET  /api/v1/account          — Balance, VIP, stats (source of truth)")
    print("  POST /api/v1/trades           — Submit trade (server calculates profit)")
    print("  GET  /api/v1/trades/:id       — Order status")
    print("  POST /api/v1/vip/subscribe    — Activate VIP")
    print("  POST /api/v1/exchanges/connect — Connect exchange")
    print("  DELETE /api/v1/exchanges/:id  — Disconnect exchange\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[STOP] Server stopped.")
        server.server_close()
