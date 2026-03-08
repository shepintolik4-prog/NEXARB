# NEXARB Backend — Быстрый запуск

## Файлы
- `database.py` — SQLite схема и все DB операции
- `server.py`   — HTTP API сервер (чистый Python, без зависимостей)
- `nexarb-crypto-bot.html` — Frontend (подключается к этому серверу)

## Запуск

```bash
# 1. Установить переменные
export JWT_SECRET="замените-на-256-битный-секрет-$(openssl rand -hex 32)"
export DEMO_MODE=true          # false для прода
export PORT=8000
export TG_BOT_TOKEN="ваш_токен"  # из @BotFather

# 2. Запустить сервер
python3 server.py
```

## API Endpoints

| Метод | Путь | Описание |
|-------|------|----------|
| POST | /api/v1/auth/login | Telegram initData → JWT токен |
| GET | /api/v1/account | **Источник правды**: баланс, VIP, статистика |
| POST | /api/v1/trades | Сделка (сервер считает прибыль, не клиент) |
| GET | /api/v1/trades/:id | Статус ордера |
| POST | /api/v1/vip/subscribe | Активация VIP (через сервер) |
| POST | /api/v1/exchanges/connect | Подключить биржу (ключи → сервер) |
| DELETE | /api/v1/exchanges/:id | Отключить биржу |

## Что исправлено по каждому пункту

### 1. Баланс в руках пользователя — ЗАКРЫТО ✅
- `localStorage` теперь хранит ТОЛЬКО: lang, plan, autoSettings
- Баланс существует только в `balances` таблице SQLite
- Клиент получает баланс через `GET /api/v1/account`
- `S.balance = X` на клиенте не имеет эффекта — следующий запрос к серверу перезапишет

### 2. Логика сделок на клиенте — ЗАКРЫТО ✅
- `execTrade()` отправляет только параметры (symbol, amount, exchanges)
- Сервер (`server_calc_trade()`) сам считает: exchange fees, network fees, slippage, platform fee, net profit
- Клиент не может передать "прибыль" — её нет в payload
- Результат записывается в `trades` таблицу атомарной транзакцией

### 3. Генерация ID на клиенте — ЗАКРЫТО ✅
- `genUserId()` удалена из production-кода (оставлена как stub с предупреждением)
- При `POST /api/v1/auth/login` сервер генерирует `uuid.uuid4()` и ref_code через `secrets.token_urlsafe()`
- Реферальный код проверяется regex `^[A-Z0-9]{4,12}$` перед применением
- Rate limiting на login: 10 попыток / 60 сек с IP

## БД Схема (SQLite)

```
users            — пользователи (id = server UUID)
balances         — балансы (изменяет только сервер)
vip_subscriptions — VIP подписки
connected_exchanges — подключённые биржи (ключи в маске)
trades           — история сделок (только server writes)
referrals        — реферальная система
rate_limits      — защита от brute force
revoked_tokens   — отозванные JWT
```
