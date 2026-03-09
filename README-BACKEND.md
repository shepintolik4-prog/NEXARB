# NEXARB Backend — Документация

## Быстрый деплой на Railway (два сервиса)

```
Проект Railway
├── Service 1: API          python server.py        порт 8000
└── Service 2: Price Feed   python price_feed.py    порт 8001
```

### Service 1 — API сервер
1. **New Project → Deploy from GitHub repo**
2. **Settings → Start Command:** `python server.py`
3. **Variables:**
   ```
   JWT_SECRET=<secrets.token_hex(32)>
   ADMIN_TOKEN=<secrets.token_hex(16)>
   TG_BOT_TOKEN=<от @BotFather>
   DEMO_MODE=false
   ENCRYPT_KEY=<Fernet.generate_key()>
   DATABASE_URL=<PostgreSQL URL>
   PORT=8000
   ```
4. Railway выдаст домен автоматически: `https://nexarb-api-xxx.railway.app`

### Service 2 — Price Feed
1. В том же проекте: **+ New Service → GitHub Repo** (тот же репо)
2. **Settings → Start Command:** `python price_feed.py`
3. **Settings → Networking → Public Networking → Expose port:** `8001`
4. **Variables:**
   ```
   JWT_SECRET=<тот же что у Service 1>
   PORT_WS=8001
   NEXARB_INTERNAL_TOKEN=<secrets.token_hex(16)>
   SIGNAL_THRESHOLD=0.05
   ```
5. Railway выдаст WS домен: `wss://nexarb-feed-xxx.railway.app`

### Связь между сервисами

**Вариант A — Private Networking (рекомендуется, внутри одного Railway проекта):**
```
# В Variables Service 1 добавь:
PRICE_FEED_INTERNAL=nexarb-feed.railway.internal:8001
```
Клиенты всё равно подключаются через публичный WS домен.

**Вариант B — Публичный WebSocket:**
В `index.html` добавь перед wsManager:
```javascript
const PRICE_FEED_URL = 'wss://nexarb-feed-xxx.railway.app/ws/prices';
```
Или задай через Railway Variable и подставляй через build step.

### Проверка после деплоя
```bash
# API health
curl https://nexarb-api-xxx.railway.app/health

# WS (wscat или браузерная консоль)
wscat -c wss://nexarb-feed-xxx.railway.app/ws/prices
```

---

## Обзор архитектуры

```
Telegram Mini App (index.html)
         │  HTTPS (Vercel/Railway)
         ▼
  server.py :8000  ←── Admin Panel (nexarb-admin.html)
         │  SQLite / PostgreSQL (DATABASE_URL)
         ▼
  database.py / database_pg.py
         │
  price_feed.py :8001  ←── WebSocket (биржи)
         │  wss://  
  Binance / OKX / Bybit / Coinbase / Kraken
```

---

## Быстрый старт (локально)

### Требования
- Python 3.10+
- pip install websockets psycopg2-binary cryptography  *(опционально)*

### Запуск

**Окно 1 — API сервер:**
```powershell
cd C:\Users\...\NEXARB
$env:ADMIN_TOKEN="nexarb_admin_2025"
$env:JWT_SECRET="your-256-bit-hex-secret"
$env:DEMO_MODE="true"
python server.py
```

**Окно 2 — Price Feed:**
```powershell
cd C:\Users\...\NEXARB
$env:JWT_SECRET="your-256-bit-hex-secret"
python price_feed.py
```

**Окно 3 — Admin Panel:**
Открыть `nexarb-admin.html` в браузере → ввести токен `nexarb_admin_2025` → Подключить

---

## Переменные окружения

| Переменная | Обязательна в PROD | Описание |
|---|---|---|
| `JWT_SECRET` | ✅ | 256-bit hex секрет. `python3 -c "import secrets; print(secrets.token_hex(32))"` |
| `ADMIN_TOKEN` | ✅ | Токен для `/api/admin/*` панели |
| `TG_BOT_TOKEN` | ✅ | Токен бота от @BotFather. **Без него PROD не работает** |
| `DEMO_MODE` | — | `true` (дефолт) или `false` |
| `ENCRYPT_KEY` | Рекомендуется | Fernet key для шифрования API-ключей бирж. `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `DATABASE_URL` | Для PostgreSQL | `postgresql://user:pass@host:5432/db` |
| `PORT` | — | Порт сервера (дефолт 8000) |
| `PORT_WS` | — | Порт price feed (дефолт 8001) |
| `NEXARB_INTERNAL_TOKEN` | — | Токен для авторизации клиентов price feed |
| `SIGNAL_THRESHOLD` | — | Минимальный net profit % для сигналов (дефолт 0.05) |
| `CERT_FILE` / `KEY_FILE` | — | Пути к SSL сертификатам (Railway даёт HTTPS автоматически) |

---

## Деплой на Railway

### Сервис 1 — API сервер

1. Создай новый проект на [railway.app](https://railway.app)
2. Подключи GitHub репозиторий
3. В **Settings → Start Command**: `python server.py`
4. В **Variables** добавь:
   ```
   JWT_SECRET=<сгенерируй>
   ADMIN_TOKEN=<сгенерируй>
   TG_BOT_TOKEN=<токен от BotFather>
   DEMO_MODE=false
   ENCRYPT_KEY=<сгенерируй через Fernet>
   DATABASE_URL=<из Supabase или Railway PostgreSQL>
   PORT=8000
   ```
5. Railway автоматически выдаст HTTPS домен вида `nexarb-api.railway.app`

### Сервис 2 — Price Feed (отдельный сервис)

1. В том же проекте: **+ New Service → GitHub Repo** (тот же репозиторий)
2. В **Settings → Start Command**: `python price_feed.py`
3. В **Variables**:
   ```
   JWT_SECRET=<тот же что у сервиса 1>
   PORT_WS=8001
   NEXARB_INTERNAL_TOKEN=<сгенерируй>
   SIGNAL_THRESHOLD=0.05
   ```
4. В **Settings → Networking → Expose Port**: `8001`
5. Домен будет вида `nexarb-feed.railway.app`

### Обновление URL в боте

После деплоя замени в `index.html`:
```javascript
const API_BASE = 'https://nexarb-api.railway.app/api/v1';
// В wsManager:
const wsUrl = 'wss://nexarb-feed.railway.app/ws/prices';
```

### PostgreSQL на Supabase

1. Создай проект на [supabase.com](https://supabase.com) (Free tier)
2. Settings → Database → Connection String → URI
3. Добавь как `DATABASE_URL` в Railway Variables
4. `database_pg.py` подхватится автоматически

---

## API Reference

### Пользовательские эндпоинты (JWT Bearer)

| Метод | URL | Описание |
|---|---|---|
| POST | `/api/v1/auth/login` | Telegram initData → JWT |
| POST | `/api/v1/auth/logout` | Отзыв JWT |
| GET  | `/api/v1/account` | Баланс, VIP, platform config |
| POST | `/api/v1/trades` | Создать сделку |
| GET  | `/api/v1/trades` | История сделок |
| GET  | `/api/v1/trades/:id` | Статус сделки |
| GET  | `/api/v1/vip/status` | VIP статус |
| POST | `/api/v1/vip/subscribe` | Активировать VIP |
| GET  | `/api/v1/exchanges` | Подключённые биржи |
| POST | `/api/v1/exchanges/connect` | Подключить биржу |
| DELETE | `/api/v1/exchanges/:id` | Отключить биржу |
| GET  | `/api/v1/referrals` | Реферальная статистика |

### Admin эндпоинты (заголовок `X-Admin-Token`)

| Метод | URL | Описание |
|---|---|---|
| GET  | `/api/admin/stats` | Статистика платформы |
| GET  | `/api/admin/config` | Текущий конфиг |
| POST | `/api/admin/config` | Обновить конфиг / переключить DEMO/PROD |
| GET  | `/api/admin/users` | Список пользователей |
| GET  | `/api/admin/users/:id` | Детали пользователя |
| POST | `/api/admin/users/vip` | Выдать VIP |
| DELETE | `/api/admin/users/:id/vip` | Отозвать VIP |
| POST | `/api/admin/users/balance` | Установить баланс |
| DELETE | `/api/admin/users/:id` | Удалить пользователя |
| GET  | `/api/admin/trades` | Все сделки |
| POST | `/api/admin/broadcast` | Рассылка |

### WebSocket Price Feed

```
ws://localhost:8001/ws/prices
```

**Авторизация** (если задан JWT_SECRET или NEXARB_INTERNAL_TOKEN):
```json
// Клиент → сервер (первое сообщение):
{"type": "auth", "token": "<JWT или INTERNAL_TOKEN>"}

// Сервер → клиент:
{"type": "auth_ok"}
```

**Сообщения от сервера:**
```json
// Тик цены:
{"exchange": "binance", "pair": "BTC/USDT", "bid": 65000.1, "ask": 65001.5, "vol": 1234.5, "ts": 1234567890000}

// Арбитражные сигналы (только при изменении):
{"type": "signals", "data": [{"sym": "ETH", "bx": "binance", "sx": "okx", "net": 0.12, ...}]}

// Ping/pong:
{"type": "pong", "ts": 1234567890000}
```

---

## Безопасность

### Что реализовано

- **JWT HS256** с отзывом через БД (`jti` в `revoked_tokens`)
- **Rate limiting**: глобально 100 req/min/IP + per-endpoint лимиты
- **Telegram HMAC**: в PROD bypass полностью отключён
- **Шифрование API-ключей**: Fernet AES-128-CBC + HMAC (если установлен `cryptography`), fallback XOR только для dev
- **Balance protection**: проверка `amount <= balance * 0.99` перед сделкой
- **Input validation**: regex-санитизация всех входных параметров
- **CORS**: все заголовки включая `X-Admin-Token`
- **Traceback logging**: все unhandled exceptions логируются с полным stack trace

### Что нужно сделать перед PROD

- [ ] Установить `cryptography` и задать `ENCRYPT_KEY`
- [ ] Задать `TG_BOT_TOKEN` и `DEMO_MODE=false`
- [ ] Сгенерировать `JWT_SECRET` через `secrets.token_hex(32)`
- [ ] Интегрировать платёжную систему (Stripe / TON) в `_buy_vip()`
- [ ] Раскомментировать `execute_real_trade()` и установить `ccxt`
- [ ] Настроить PostgreSQL через `DATABASE_URL`

---

## Включение реальной торговли

### Шаг 1 — Зависимости
```bash
pip install ccxt cryptography
```

### Шаг 2 — Переменные окружения
```
DEMO_MODE=false
ENCRYPT_KEY=<Fernet key>
TG_BOT_TOKEN=<bot token>
```

### Шаг 3 — Раскомментировать execute_real_trade в server.py

Найди функцию `execute_real_trade` в `server.py` и раскомментируй её тело. Затем в `_submit_trade()` замени:
```python
calc = server_calc_trade(...)
```
на:
```python
api_keys = {e['exchange_id']: e for e in db.get_connected_exchanges(uid)}
real = execute_real_trade(uid, buy_exchange, sell_exchange, symbol, amount, api_keys)
calc = server_calc_trade(...)  # для расчёта комиссий
```

### ⚠️ Предупреждения о рисках

**Финансовые риски:**
- Арбитражные спреды исчезают за миллисекунды — к моменту исполнения прибыль может исчезнуть
- **Leg risk**: один ордер исполнился, второй нет → открытая позиция
- Комиссии и проскальзывание могут превысить ожидаемую прибыль
- Биржи могут заблокировать аккаунт за высокочастотную торговлю

**Юридические риски:**
- В ряде юрисдикций арбитраж может квалифицироваться как манипулирование рынком
- Убедись в легальности в твоей стране перед запуском с реальными деньгами
- Налоговые обязательства на прибыль от торговли в большинстве стран

---

## Структура файлов

```
NEXARB/
├── server.py          — API сервер v6.1
├── price_feed.py      — WebSocket price feed v1.1
├── database.py        — SQLite (локально)
├── database_pg.py     — PostgreSQL (Railway/Supabase)
├── index.html         — Telegram Mini App (бот)
├── nexarb-admin.html  — Admin панель
├── requirements.txt   — pip зависимости
├── Procfile           — Railway: web: python server.py
├── railway.json       — Railway конфиг
└── nexarb.db          — SQLite база (создаётся автоматически)
```

```
requirements.txt:
  psycopg2-binary==2.9.9
  websockets==12.0
  cryptography>=42.0.0   # опционально, для Fernet шифрования
  ccxt>=4.0.0            # опционально, для реальной торговли
```
