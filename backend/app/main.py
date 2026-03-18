"""
NEXARB Scanner - FastAPI Main Application
Entry point: CORS, WebSocket, routers, lifespan events
"""
import asyncio
import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import scanner, futures, dex, alerts, users, payments, subscriptions, trading, referrals
from app.tasks.scheduler import create_scheduler
from app.services.cex_scanner import close_all_exchanges

# Настройка логирования
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        self.active: dict[str, WebSocket] = {}

    async def connect(self, telegram_id: str, ws: WebSocket):
        await ws.accept()
        self.active[telegram_id] = ws
        logger.info(f"WS connected: {telegram_id} (total: {len(self.active)})")

    def disconnect(self, telegram_id: str):
        self.active.pop(telegram_id, None)

    async def send(self, telegram_id: str, data: dict):
        ws = self.active.get(telegram_id)
        if ws:
            try:
                await ws.send_text(json.dumps(data, default=str))
            except Exception:
                self.disconnect(telegram_id)

    async def broadcast(self, data: dict):
        dead = []
        for tid, ws in self.active.items():
            try:
                await ws.send_text(json.dumps(data, default=str))
            except Exception:
                dead.append(tid)
        for tid in dead:
            self.disconnect(tid)

    @property
    def count(self):
        return len(self.active)

ws_manager = ConnectionManager()

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("NEXARB Scanner starting up...")
    # Инициализация планировщика задач
    scheduler = create_scheduler()
    scheduler.start()
    # Запуск фонового вещания через WebSocket
    broadcast_task = asyncio.create_task(_ws_broadcast_loop())
    
    yield
    
    logger.info("NEXARB Scanner shutting down...")
    broadcast_task.cancel()
    scheduler.shutdown(wait=False)
    await close_all_exchanges()

async def _ws_broadcast_loop():
    """Фоновая задача для рассылки обновлений всем подключенным клиентам"""
    from app.services.cex_scanner import run_cex_scan
    while True:
        try:
            await asyncio.sleep(15) # Интервал обновления
            if ws_manager.count == 0:
                continue
                
            results, exchanges, _ = await run_cex_scan(
                min_spread_pct=settings.MIN_SPREAD_PCT,
                min_volume_24h=settings.MIN_VOLUME_24H,
                limit=30,
            )
            if results:
                await ws_manager.broadcast({
                    "type": "spread_update",
                    "data": [r.model_dump() for r in results[:30]],
                    "scanned_exchanges": exchanges,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"WS broadcast error: {e}")

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Real-time crypto arbitrage scanner",
    lifespan=lifespan,
)

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключение роутеров
app.include_router(scanner.router, prefix="/api/scanner", tags=["Scanner"])
app.include_router(futures.router, prefix="/api/futures", tags=["Futures"])
app.include_router(dex.router, prefix="/api/dex", tags=["DEX"])
app.include_router(alerts.router, prefix="/api/alerts", tags=["Alerts"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(payments.router, prefix="/api/payments", tags=["Payments"])
app.include_router(subscriptions.router, prefix="/api/subscriptions", tags=["Subscriptions"])
app.include_router(trading.router, prefix="/api/trading", tags=["Trading"])
app.include_router(referrals.router, prefix="/api/referrals", tags=["Referrals"])

@app.get("/")
async def root():
    return {
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "ws_connections": ws_manager.count,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/api/stats")
async def stats():
    from app.services.cache import cex_cache, dex_cache, futures_cache, ticker_cache
    return {
        "ws_connections": ws_manager.count,
        "cache": {
            "cex": cex_cache.stats(),
            "dex": dex_cache.stats(),
            "futures": futures_cache.stats(),
            "ticker": ticker_cache.stats(),
        },
    }

@app.websocket("/ws/{telegram_id}")
async def websocket_endpoint(websocket: WebSocket, telegram_id: str):
    await ws_manager.connect(telegram_id, websocket)
    await ws_manager.send(telegram_id, {
        "type": "connected",
        "message": "Connected to NEXARB live feed",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await ws_manager.send(telegram_id, {
                        "type": "pong",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
                elif msg.get("type") == "subscribe_scan":
                    from app.services.cex_scanner import run_cex_scan
                    results, exchanges, _ = await run_cex_scan(
                        min_spread_pct=msg.get("min_spread", settings.MIN_SPREAD_PCT),
                        limit=30,
                    )
                    await ws_manager.send(telegram_id, {
                        "type": "spread_update",
                        "data": [r.model_dump() for r in results],
                        "scanned_exchanges": exchanges,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        ws_manager.disconnect(telegram_id)
    except Exception as e:
        logger.error(f"WS error for {telegram_id}: {e}")
        ws_manager.disconnect(telegram_id)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)
