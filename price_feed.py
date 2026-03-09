"""
NEXARB — Real Price Feed v1.1
Подключается к публичным WebSocket бирж (без API ключей).
Раздаёт цены и арбитражные сигналы клиентам через /ws/prices.

Запуск:
  python price_feed.py          (порт 8001)
  PORT_WS=8001 JWT_SECRET=... python price_feed.py

Railway деплой (второй сервис):
  Start Command: python price_feed.py
  Port: 8001 (задать PORT_WS=8001 в переменных сервиса)
  Опционально: NEXARB_INTERNAL_TOKEN для проверки клиентов

Зависимости:
  pip install websockets

⚠️  РИСКИ:
  Реальные цены ≠ гарантия прибыли.
  Арбитраж исчезает за миллисекунды.
  Комиссии и проскальзывание съедают спред.
  Используй на свой риск.
"""

import asyncio
import json
import logging
import os
import time
import hmac
import hashlib
import signal
from collections import defaultdict

# ─────────────────────────────────────────────────────────────
# LOGGING
# ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(levelname)s] %(name)s: %(message)s',
    datefmt='%H:%M:%S',
)
logger = logging.getLogger('nexarb.feed')

# ─────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────
PORT_WS    = int(os.environ.get('PORT_WS', 8001))
JWT_SECRET = os.environ.get('JWT_SECRET', '')

# Опциональный внутренний токен для проверки клиентов (не JWT).
# Клиент передаёт его в первом сообщении: {"type": "auth", "token": "..."}
# Если не задан — принимаем всех клиентов (подходит для Railway internal network).
INTERNAL_TOKEN = os.environ.get('NEXARB_INTERNAL_TOKEN', '')

# Минимальный net profit % для включения сигнала в broadcast
SIGNAL_THRESHOLD = float(os.environ.get('SIGNAL_THRESHOLD', '0.05'))

SYMBOLS = [
    'BTC', 'ETH', 'SOL', 'BNB', 'XRP',
    'DOGE', 'ADA', 'AVAX', 'MATIC', 'DOT',
    'LINK', 'UNI', 'ATOM', 'LTC', 'BCH',
    'TON', 'TRX', 'NEAR', 'ARB', 'OP',
    'PEPE', 'WIF', 'BONK', 'SHIB', 'INJ',
]

# ─────────────────────────────────────────────────────────────
# GLOBAL STATE
# ─────────────────────────────────────────────────────────────
prices: dict  = defaultdict(dict)   # prices[exchange][symbol] = tick
clients: set  = set()               # авторизованные WS-клиенты
_shutdown: bool = False             # флаг graceful shutdown

# Кеш последних сигналов: не рассылаем если нет изменений
_last_signals_hash: str = ''


def _jwt_verify_simple(token: str) -> bool:
    """
    Упрощённая проверка JWT: только подпись и expiry.
    Не обращается к БД — price_feed не имеет доступа к БД сервера.
    """
    if not JWT_SECRET:
        return True  # если JWT_SECRET не задан — принимаем всех
    try:
        import base64
        parts = token.split('.')
        if len(parts) != 3:
            return False
        header_b64, body_b64, sig_b64 = parts
        expected = hmac.new(
            JWT_SECRET.encode(),
            f"{header_b64}.{body_b64}".encode(),
            hashlib.sha256
        ).digest()
        padding = 4 - len(sig_b64) % 4
        if padding != 4:
            sig_b64 += '=' * padding
        actual = base64.urlsafe_b64decode(sig_b64)
        if not hmac.compare_digest(expected, actual):
            return False
        import json as _json
        payload_raw = sig_b64  # будем декодить body_b64
        padding = 4 - len(body_b64) % 4
        if padding != 4:
            body_b64 += '=' * padding
        payload = _json.loads(base64.urlsafe_b64decode(body_b64))
        return payload.get('exp', 0) > time.time()
    except Exception:
        return False


def store_price(exchange: str, symbol: str, bid: float, ask: float, vol: float = 0):
    """Сохраняет цену и немедленно рассылает тик всем клиентам."""
    global prices
    if bid <= 0 or ask <= 0 or ask < bid:
        return
    symbol = symbol.upper().replace('USDT', '').replace('USD', '').replace('-', '')
    tick = {
        'exchange': exchange,
        'pair':     f'{symbol}/USDT',
        'bid':      round(bid, 8),
        'ask':      round(ask, 8),
        'vol':      round(vol, 2),
        'ts':       int(time.time() * 1000),
    }
    prices[exchange][symbol] = tick

    loop = asyncio.get_event_loop()
    if not loop.is_closed():
        loop.call_soon_threadsafe(
            lambda: asyncio.ensure_future(broadcast_tick(tick))
        )


async def broadcast_tick(tick: dict):
    """Рассылает одиночный тик всем подключённым клиентам."""
    global clients
    if not clients:
        return
    msg  = json.dumps(tick)
    dead = set()
    for ws in clients.copy():
        try:
            await ws.send(msg)
        except Exception:
            dead.add(ws)
    clients -= dead


# ─────────────────────────────────────────────────────────────
# TAKER FEES (актуальные данные бирж, 2025)
# ─────────────────────────────────────────────────────────────
TAKER_FEES = {
    'binance':  0.001,
    'okx':      0.001,
    'bybit':    0.001,
    'coinbase': 0.006,
    'kraken':   0.0026,
}


def find_arbitrage() -> list:
    """
    Ищет реальные арбитражные возможности между биржами.
    Возвращает только сигналы с net profit > SIGNAL_THRESHOLD.
    """
    global prices
    signals = []
    exchanges = list(prices.keys())
    now_ms = time.time() * 1000

    for sym in SYMBOLS:
        for i, ex_a in enumerate(exchanges):
            for ex_b in exchanges[i+1:]:
                pa = prices[ex_a].get(sym)
                pb = prices[ex_b].get(sym)
                if not pa or not pb:
                    continue
                # Данные не старше 10 секунд
                if now_ms - pa['ts'] > 10_000 or now_ms - pb['ts'] > 10_000:
                    continue

                fee_a = TAKER_FEES.get(ex_a, 0.001)
                fee_b = TAKER_FEES.get(ex_b, 0.001)

                for buy_ex, sell_ex, buy_p, sell_p in [
                    (ex_a, ex_b, pa['ask'], pb['bid']),
                    (ex_b, ex_a, pb['ask'], pa['bid']),
                ]:
                    if buy_p <= 0 or sell_p <= 0:
                        continue
                    spread = (sell_p - buy_p) / buy_p * 100
                    net    = spread - (fee_a + fee_b) * 100

                    if net > SIGNAL_THRESHOLD:
                        signals.append({
                            'type':      'cex',
                            'sym':       sym,
                            'bx':        buy_ex,
                            'sx':        sell_ex,
                            'spread':    round(spread, 4),
                            'net':       round(net, 4),
                            'buyPrice':  round(buy_p, 8),
                            'sellPrice': round(sell_p, 8),
                            'ts':        int(now_ms),
                            'aiScore':   min(99, int(net * 20 + 60)),
                        })

    signals.sort(key=lambda x: x['net'], reverse=True)
    return signals[:20]


# ─────────────────────────────────────────────────────────────
# EXCHANGE CONNECTORS
# ─────────────────────────────────────────────────────────────
try:
    import websockets
    HAS_WEBSOCKETS = True
except ImportError:
    HAS_WEBSOCKETS = False
    logger.error("websockets not installed! Run: pip install websockets")


async def connect_binance():
    """
    Binance публичный WebSocket — не требует API ключей.
    Docs: https://binance-docs.github.io/apidocs/spot/en/#individual-symbol-book-ticker-streams
    """
    if not HAS_WEBSOCKETS:
        return
    streams = '/'.join(f"{s.lower()}usdt@bookTicker" for s in SYMBOLS)
    url = f"wss://stream.binance.com:9443/stream?streams={streams}"

    while not _shutdown:
        try:
            logger.info("Binance: connecting...")
            async with websockets.connect(url, ping_interval=20) as ws:
                logger.info("✅ Binance: connected")
                async for raw in ws:
                    if _shutdown:
                        break
                    try:
                        d = json.loads(raw).get('data', {})
                        sym = d.get('s', '').replace('USDT', '')
                        if sym in SYMBOLS:
                            store_price('binance', sym,
                                        float(d.get('b', 0)), float(d.get('a', 0)),
                                        float(d.get('B', 0)))
                    except Exception:
                        pass
        except Exception as e:
            if not _shutdown:
                logger.warning(f"Binance disconnected: {e} — reconnecting in 5s")
                await asyncio.sleep(5)


async def connect_okx():
    """OKX публичный WebSocket. Docs: https://www.okx.com/docs-v5/en/#websocket-api"""
    if not HAS_WEBSOCKETS:
        return
    url  = "wss://ws.okx.com:8443/ws/v5/public"
    args = [{"channel": "tickers", "instId": f"{s}-USDT"} for s in SYMBOLS]

    while not _shutdown:
        try:
            logger.info("OKX: connecting...")
            async with websockets.connect(url, ping_interval=20) as ws:
                logger.info("✅ OKX: connected")
                await ws.send(json.dumps({"op": "subscribe", "args": args}))
                async for raw in ws:
                    if _shutdown:
                        break
                    try:
                        data = json.loads(raw)
                        if data.get('event') == 'subscribe':
                            continue
                        for item in data.get('data', []):
                            inst = item.get('instId', '').replace('-USDT', '')
                            if inst in SYMBOLS:
                                store_price('okx', inst,
                                            float(item.get('bidPx', 0) or 0),
                                            float(item.get('askPx', 0) or 0),
                                            float(item.get('vol24h', 0) or 0))
                    except Exception:
                        pass
        except Exception as e:
            if not _shutdown:
                logger.warning(f"OKX disconnected: {e} — reconnecting in 5s")
                await asyncio.sleep(5)


async def connect_bybit():
    """Bybit публичный WebSocket. Docs: https://bybit-exchange.github.io/docs/v5/websocket"""
    if not HAS_WEBSOCKETS:
        return
    url = "wss://stream.bybit.com/v5/public/spot"

    while not _shutdown:
        try:
            logger.info("Bybit: connecting...")
            async with websockets.connect(url, ping_interval=20) as ws:
                logger.info("✅ Bybit: connected")
                for i in range(0, len(SYMBOLS), 10):
                    args = [f"tickers.{s}USDT" for s in SYMBOLS[i:i+10]]
                    await ws.send(json.dumps({"op": "subscribe", "args": args}))
                async for raw in ws:
                    if _shutdown:
                        break
                    try:
                        data = json.loads(raw)
                        if data.get('op') == 'pong':
                            continue
                        d = data.get('data', {})
                        sym = d.get('symbol', '').replace('USDT', '')
                        if sym in SYMBOLS:
                            store_price('bybit', sym,
                                        float(d.get('bid1Price', 0) or 0),
                                        float(d.get('ask1Price', 0) or 0),
                                        float(d.get('volume24h', 0) or 0))
                    except Exception:
                        pass
        except Exception as e:
            if not _shutdown:
                logger.warning(f"Bybit disconnected: {e} — reconnecting in 5s")
                await asyncio.sleep(5)


async def connect_coinbase():
    """Coinbase Advanced Trade WebSocket. Docs: https://docs.cdp.coinbase.com/advanced-trade/docs/ws-channels"""
    if not HAS_WEBSOCKETS:
        return
    url = "wss://advanced-trade-ws.coinbase.com"
    cb_symbols = [f"{s}-USD" for s in SYMBOLS if s not in ('BNB', 'TON', 'WIF', 'BONK')]

    while not _shutdown:
        try:
            logger.info("Coinbase: connecting...")
            async with websockets.connect(url, ping_interval=20) as ws:
                logger.info("✅ Coinbase: connected")
                await ws.send(json.dumps({
                    "type": "subscribe",
                    "product_ids": cb_symbols[:20],
                    "channel": "ticker",
                }))
                async for raw in ws:
                    if _shutdown:
                        break
                    try:
                        data = json.loads(raw)
                        for event in data.get('events', []):
                            for ticker in event.get('tickers', []):
                                sym   = ticker.get('product_id', '').replace('-USD', '')
                                price = float(ticker.get('price', 0) or 0)
                                if sym in SYMBOLS and price > 0:
                                    spread = price * 0.001
                                    store_price('coinbase', sym,
                                                price - spread/2, price + spread/2,
                                                float(ticker.get('volume_24_h', 0) or 0))
                    except Exception:
                        pass
        except Exception as e:
            if not _shutdown:
                logger.warning(f"Coinbase disconnected: {e} — reconnecting in 5s")
                await asyncio.sleep(5)


async def connect_kraken():
    """Kraken публичный WebSocket v2. Docs: https://docs.kraken.com/websockets-v2/#ticker"""
    if not HAS_WEBSOCKETS:
        return
    url = "wss://ws.kraken.com/v2"
    kr_symbols = [f"{s}/USDT" for s in SYMBOLS
                  if s not in ('BNB', 'TON', 'BONK', 'WIF', 'PEPE')]

    while not _shutdown:
        try:
            logger.info("Kraken: connecting...")
            async with websockets.connect(url, ping_interval=20) as ws:
                logger.info("✅ Kraken: connected")
                await ws.send(json.dumps({
                    "method": "subscribe",
                    "params": {"channel": "ticker", "symbol": kr_symbols[:15]}
                }))
                async for raw in ws:
                    if _shutdown:
                        break
                    try:
                        data = json.loads(raw)
                        if data.get('channel') in ('heartbeat', 'status'):
                            continue
                        if data.get('channel') == 'ticker':
                            for item in data.get('data', []):
                                sym = item.get('symbol', '').split('/')[0]
                                if sym in SYMBOLS:
                                    store_price('kraken', sym,
                                                float(item.get('bid', 0) or 0),
                                                float(item.get('ask', 0) or 0),
                                                float(item.get('volume', 0) or 0))
                    except Exception:
                        pass
        except Exception as e:
            if not _shutdown:
                logger.warning(f"Kraken disconnected: {e} — reconnecting in 5s")
                await asyncio.sleep(5)


# ─────────────────────────────────────────────────────────────
# CLIENT HANDLER
# ─────────────────────────────────────────────────────────────
async def client_handler(websocket, path=""):
    """
    Обрабатывает подключение клиента (браузер бота).

    Протокол авторизации:
      1. Клиент подключается к ws://host:8001/ws/prices
      2. Клиент отправляет: {"type": "auth", "token": "<JWT или INTERNAL_TOKEN>"}
      3. Сервер отвечает: {"type": "auth_ok"} или {"type": "auth_fail"}
      4. После авторизации клиент получает snapshot + тики + сигналы

    Если JWT_SECRET и INTERNAL_TOKEN не заданы — авторизация пропускается.
    """
    global clients
    ip = websocket.remote_address[0] if websocket.remote_address else '?'
    authorized = not JWT_SECRET and not INTERNAL_TOKEN  # если нет секретов — открытый доступ

    logger.info(f"Client connected: {ip} (auth_required={not authorized})")

    # Фаза авторизации — ждём {"type": "auth", "token": "..."}
    if not authorized:
        try:
            raw = await asyncio.wait_for(websocket.recv(), timeout=10.0)
            msg = json.loads(raw)
            if msg.get('type') == 'auth':
                token = msg.get('token', '')
                # Принимаем либо JWT, либо INTERNAL_TOKEN
                if (INTERNAL_TOKEN and hmac.compare_digest(token, INTERNAL_TOKEN)) \
                        or (JWT_SECRET and _jwt_verify_simple(token)):
                    authorized = True
                    await websocket.send(json.dumps({'type': 'auth_ok'}))
                    logger.info(f"Client authorized: {ip}")
                else:
                    await websocket.send(json.dumps({'type': 'auth_fail', 'error': 'Invalid token'}))
                    logger.warning(f"Client auth failed: {ip}")
                    return
            else:
                await websocket.send(json.dumps({'type': 'auth_fail', 'error': 'Send auth first'}))
                return
        except asyncio.TimeoutError:
            logger.warning(f"Client auth timeout: {ip}")
            await websocket.send(json.dumps({'type': 'auth_fail', 'error': 'Auth timeout'}))
            return
        except Exception as e:
            logger.warning(f"Client auth error {ip}: {e}")
            return

    clients.add(websocket)

    # Snapshot текущих цен
    snapshot = [tick for ex_data in prices.values() for tick in ex_data.values()]
    if snapshot:
        try:
            await websocket.send(json.dumps(snapshot))
        except Exception:
            pass

    # Слушаем клиента (ping/pong + любые команды)
    try:
        async for raw in websocket:
            try:
                msg = json.loads(raw)
                if msg.get('type') == 'ping':
                    await websocket.send(json.dumps({'type': 'pong', 'ts': int(time.time() * 1000)}))
            except Exception:
                pass
    except Exception:
        pass
    finally:
        clients.discard(websocket)
        logger.info(f"Client disconnected: {ip}")


# ─────────────────────────────────────────────────────────────
# SMART SIGNALS BROADCASTER
# Рассылает сигналы только когда они изменились (не каждые 2 сек вхолостую)
# ─────────────────────────────────────────────────────────────
async def signals_broadcaster():
    """
    Рассылает арбитражные сигналы только когда:
    1. Есть клиенты подключённые
    2. Есть сигналы с net profit > SIGNAL_THRESHOLD (фильтр в find_arbitrage + явная проверка)
    3. Набор сигналов изменился с последней рассылки (хеш)
    """
    global clients, _last_signals_hash

    while not _shutdown:
        await asyncio.sleep(2)

        if not clients:
            continue

        try:
            sigs = find_arbitrage()
            if not sigs:
                continue

            # Явная проверка порога — на случай если find_arbitrage вернул что-то лишнее
            sigs = [s for s in sigs if s.get('net', 0) > SIGNAL_THRESHOLD]
            if not sigs:
                continue

            # Хешируем сигналы чтобы не рассылать одно и то же
            sig_hash = hashlib.md5(
                json.dumps([s['sym'] + s['bx'] + s['sx'] + str(s['net'])
                            for s in sigs]).encode()
            ).hexdigest()

            if sig_hash == _last_signals_hash:
                continue  # нет изменений — не рассылаем

            _last_signals_hash = sig_hash
            msg  = json.dumps({'type': 'signals', 'data': sigs})
            dead = set()
            for ws in clients.copy():
                try:
                    await ws.send(msg)
                except Exception:
                    dead.add(ws)
            clients -= dead

            if dead:
                logger.info(f"Removed {len(dead)} dead clients")

        except Exception as e:
            logger.error(f"signals_broadcaster error: {e}")


async def stats_logger():
    """Каждые 30 секунд логирует статистику."""
    global prices, clients
    while not _shutdown:
        await asyncio.sleep(30)
        total = sum(len(v) for v in prices.values())
        sigs  = find_arbitrage()
        logger.info(
            f"Prices: {total} ticks | {len(prices)} exchanges | "
            f"Clients: {len(clients)} | Signals: {len(sigs)}"
        )
        for ex in ['binance', 'okx', 'bybit']:
            btc = prices.get(ex, {}).get('BTC')
            if btc:
                logger.info(f"  BTC/{ex}: {btc['bid']:.2f}/{btc['ask']:.2f}")


# ─────────────────────────────────────────────────────────────
# GRACEFUL SHUTDOWN
# ─────────────────────────────────────────────────────────────
async def shutdown_handler(ws_server):
    """Graceful shutdown: закрывает все соединения и останавливает сервер."""
    global _shutdown, clients
    _shutdown = True
    logger.info("Shutting down price feed...")

    # Уведомляем клиентов
    if clients:
        msg = json.dumps({'type': 'server_shutdown', 'message': 'Server restarting'})
        for ws in clients.copy():
            try:
                await ws.send(msg)
                await ws.close()
            except Exception:
                pass
        clients.clear()

    ws_server.close()
    await ws_server.wait_closed()
    logger.info("Price feed stopped.")


# ─────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────
async def main():
    if not HAS_WEBSOCKETS:
        logger.critical("Install websockets: pip install websockets")
        return

    auth_mode = "JWT" if JWT_SECRET else ("INTERNAL_TOKEN" if INTERNAL_TOKEN else "OPEN (no auth)")
    logger.info("=" * 50)
    logger.info("  NEXARB Price Feed v1.1")
    logger.info(f"  WS:         ws://0.0.0.0:{PORT_WS}/ws/prices")
    logger.info(f"  Symbols:    {len(SYMBOLS)}")
    logger.info(f"  Threshold:  >{SIGNAL_THRESHOLD}% net profit")
    logger.info(f"  Auth:       {auth_mode}")
    logger.info(f"  Exchanges:  Binance, OKX, Bybit, Coinbase, Kraken")
    logger.info("=" * 50)

    ws_server = await websockets.serve(client_handler, '0.0.0.0', PORT_WS)

    # Graceful shutdown по SIGTERM/SIGINT
    loop = asyncio.get_event_loop()

    def handle_signal():
        loop.create_task(shutdown_handler(ws_server))

    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, handle_signal)
        except NotImplementedError:
            pass  # Windows не поддерживает add_signal_handler

    await asyncio.gather(
        connect_binance(),
        connect_okx(),
        connect_bybit(),
        connect_coinbase(),
        connect_kraken(),
        signals_broadcaster(),
        stats_logger(),
    )


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Price feed stopped by KeyboardInterrupt.")
