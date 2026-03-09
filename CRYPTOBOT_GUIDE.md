# Инструкция: Подключение @CryptoBot к NEXARB

## Что такое @CryptoBot
@CryptoBot — официальный платёжный сервис Telegram от команды TON. Позволяет принимать крипто-платежи прямо в боте. Не требует KYC для приёма платежей, работает через API.

---

## ШАГ 1 — Создать приложение в @CryptoBot

1. Открой Telegram, найди бота **@CryptoBot**
2. Напиши `/start`
3. Нажми **"Pay & Transfer"** → **"Crypto Pay"**
4. Нажми **"Create App"**
5. Введи название приложения: `NEXARB`
6. Введи URL твоего бота на Vercel: `https://nexarb-xxxx.vercel.app`
7. Получишь **API Token** вида: `12345:AABBCCDDEE...`
   → **Сохрани его, он нужен в server.py**

---

## ШАГ 2 — Какие валюты подключить

### Рекомендуемые валюты для NEXARB VIP-подписки:

| Валюта | Код | Причина |
|--------|-----|---------|
| **Toncoin** | `TON` | Нативная валюта Telegram, самые низкие комиссии (< $0.01), мгновенно |
| **USDT (TON)** | `USDT` | Стейблкоин, удобен для фиксированных цен |
| **Bitcoin** | `BTC` | Максимальное доверие пользователей |
| **Ethereum** | `ETH` | Широкая аудитория |
| **USDC** | `USDC` | Второй стейблкоин как альтернатива |

### ⭐ Минимальный набор (для старта):
- **TON** — основная валюта (дёшево и быстро)
- **USDT** — для пользователей которые хотят платить стейблкоином

---

## ШАГ 3 — Настроить цены VIP-планов

Открой `server.py`, найди функцию `_buy_vip()` (~строка 870):

```python
VIP_PRICES = {
    # Цены в USDT (CryptoBot сам конвертирует в TON/BTC/ETH по курсу)
    'week':     {'usdt': 9.99,  'ton': None},   # None = авто-конвертация
    'month':    {'usdt': 29.99, 'ton': None},
    'year':     {'usdt': 199.99,'ton': None},
    'lifetime': {'usdt': 499.99,'ton': None},
}
```

---

## ШАГ 4 — Установить библиотеку и добавить переменные

```bash
pip install aiocryptopay
```

Добавь в Railway Variables (или локально в PowerShell):
```
CRYPTOPAY_TOKEN=12345:AABBCCDDEE...
CRYPTOPAY_NETWORK=mainnet   # или testnet для тестов
```

---

## ШАГ 5 — Код для server.py

Найди в `server.py` функцию `_buy_vip()`. Замени блок с `# TODO: Stripe / TON Payments`:

```python
# ─── В начало server.py после импортов ───────────────────────
try:
    from aiocryptopay import AioCryptoPay, Networks
    CRYPTOPAY_TOKEN   = os.environ.get('CRYPTOPAY_TOKEN', '')
    CRYPTOPAY_NETWORK = Networks.MAIN_NET if os.environ.get('CRYPTOPAY_NETWORK','mainnet') == 'mainnet' else Networks.TEST_NET
    HAS_CRYPTOPAY = bool(CRYPTOPAY_TOKEN)
    if HAS_CRYPTOPAY:
        crypto = AioCryptoPay(token=CRYPTOPAY_TOKEN, network=CRYPTOPAY_NETWORK)
        logger.info("CryptoBot payments: ENABLED")
    else:
        crypto = None
        logger.info("CryptoBot payments: DISABLED (no CRYPTOPAY_TOKEN)")
except ImportError:
    crypto = None
    HAS_CRYPTOPAY = False
    logger.warning("aiocryptopay not installed. Run: pip install aiocryptopay")

# ─── Таблица цен VIP-планов ───────────────────────────────────
VIP_PRICES_USDT = {
    'week':     9.99,
    'month':    29.99,
    'year':     199.99,
    'lifetime': 499.99,
}
```

Затем замени функцию `_buy_vip()`:

```python
def _buy_vip(self):
    """POST /api/v1/vip/subscribe — создаёт invoice через CryptoBot"""
    uid  = self._user_id
    data = self._read_json()
    plan = re.sub(r'[^a-z]', '', str(data.get('plan', 'month')).lower())

    if plan not in VIP_PRICES_USDT:
        json_response(self, 400, {'error': 'Invalid plan'}); return

    price_usdt = VIP_PRICES_USDT[plan]
    currency   = data.get('currency', 'USDT').upper()  # TON, USDT, BTC, ETH

    # Допустимые валюты
    ALLOWED_CURRENCIES = {'TON', 'USDT', 'BTC', 'ETH', 'USDC'}
    if currency not in ALLOWED_CURRENCIES:
        json_response(self, 400, {'error': f'Currency must be one of: {", ".join(ALLOWED_CURRENCIES)}'}); return

    if not HAS_CRYPTOPAY:
        # Fallback: сообщаем что платежи не настроены
        json_response(self, 503, {
            'error': 'Payment system not configured',
            'hint':  'Set CRYPTOPAY_TOKEN environment variable'
        }); return

    import asyncio

    async def _create_invoice():
        invoice = await crypto.create_invoice(
            asset=currency,
            amount=price_usdt,           # CryptoBot принимает amount в выбранной валюте
            description=f'NEXARB VIP — {plan} plan',
            payload=f'{uid}:{plan}',     # вернётся в webhook для верификации
            expires_in=3600,             # счёт действует 1 час
        )
        return invoice

    try:
        # Запускаем async в sync контексте
        loop = asyncio.new_event_loop()
        invoice = loop.run_until_complete(_create_invoice())
        loop.close()

        json_response(self, 200, {
            'invoice_id':  invoice.invoice_id,
            'pay_url':     invoice.pay_url,       # ← эту ссылку открываем пользователю
            'amount':      float(invoice.amount),
            'currency':    invoice.asset,
            'plan':        plan,
            'expires_at':  invoice.expiration_date.isoformat() if invoice.expiration_date else None,
            'status':      'pending',
        })
    except Exception as e:
        logger.error(f"CryptoBot invoice error: {e}\n{traceback.format_exc()}")
        json_response(self, 502, {'error': f'Payment provider error: {e}'})
```

---

## ШАГ 6 — Webhook для подтверждения оплаты

Добавь новый маршрут в `_route_post()`:

```python
elif path == '/api/v1/vip/payment_webhook':  self._cryptopay_webhook()
```

И саму функцию:

```python
def _cryptopay_webhook(self):
    """
    POST /api/v1/vip/payment_webhook
    CryptoBot шлёт сюда уведомление когда invoice оплачен.
    Верифицируем подпись → активируем VIP.
    """
    import hmac, hashlib

    # Верификация подписи CryptoBot
    body_raw  = self.rfile.read(int(self.headers.get('Content-Length', 0)))
    signature = self.headers.get('crypto-pay-api-signature', '')
    secret    = hashlib.sha256(CRYPTOPAY_TOKEN.encode()).digest()
    expected  = hmac.new(secret, body_raw, hashlib.sha256).hexdigest()

    if not hmac.compare_digest(signature, expected):
        logger.warning("CryptoBot webhook: invalid signature")
        json_response(self, 401, {'error': 'Invalid signature'}); return

    try:
        event = json.loads(body_raw)
    except Exception:
        json_response(self, 400, {'error': 'Invalid JSON'}); return

    # Обрабатываем только событие invoice_paid
    if event.get('update_type') != 'invoice_paid':
        json_response(self, 200, {'ok': True}); return

    invoice = event.get('payload', {})
    payload = invoice.get('payload', '')   # uid:plan

    try:
        uid, plan = payload.split(':', 1)
    except ValueError:
        logger.error(f"CryptoBot webhook: bad payload '{payload}'")
        json_response(self, 400, {'error': 'Bad payload'}); return

    plan_days = {'week': 7, 'month': 30, 'year': 365, 'lifetime': 36500}.get(plan)
    if not plan_days:
        json_response(self, 400, {'error': 'Unknown plan'}); return

    payment_id = invoice.get('invoice_id', '')
    db.activate_vip(uid, plan, payment_id=str(payment_id))

    logger.info(
        f"VIP activated via CryptoBot: user={uid[:8]} plan={plan} "
        f"invoice={payment_id} amount={invoice.get('amount')} {invoice.get('asset')}"
    )
    json_response(self, 200, {'ok': True})
```

---

## ШАГ 7 — Зарегистрировать Webhook URL в CryptoBot

Открой Telegram → @CryptoBot → Crypto Pay → твоё приложение NEXARB → **Webhooks**

Укажи URL:
```
https://nexarb-api-xxx.railway.app/api/v1/vip/payment_webhook
```

> ⚠️ Webhook работает только с HTTPS. Локально используй ngrok:
> ```bash
> ngrok http 8000
> # Скопируй https://xxxx.ngrok.io/api/v1/vip/payment_webhook
> ```

---

## ШАГ 8 — Тестирование (Testnet)

1. В Railway Variables поставь: `CRYPTOPAY_NETWORK=testnet`
2. В @CryptoBot переключись в Testnet: `/testnet`
3. Получи тестовые монеты: `/getcoinsbottest`
4. Создай тестовый invoice через приложение → оплати → проверь VIP в БД

Для переключения обратно в mainnet:
```
CRYPTOPAY_NETWORK=mainnet
```

---

## ШАГ 9 — Frontend: кнопка оплаты

В `index.html` найди функцию `buyVip()` и добавь открытие invoice:

```javascript
async function buyVip(plan) {
  const currency = 'TON'; // или дать пользователю выбор
  try {
    const resp = await API.post('/vip/subscribe', { plan, currency });
    if (resp.pay_url) {
      // Открываем платёжную страницу CryptoBot внутри Telegram
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.openTelegramLink(resp.pay_url);
      } else {
        window.open(resp.pay_url, '_blank');
      }
      // Показываем сообщение пользователю
      toastMsg(`Счёт на $${VIP_PRICES[plan]} открыт. После оплаты VIP активируется автоматически.`, 'ok');
    }
  } catch (e) {
    toastMsg('Ошибка создания счёта: ' + e.message, 'err');
  }
}
```

---

## Итоговый чеклист

- [ ] Создал приложение в @CryptoBot → получил API Token
- [ ] Добавил `CRYPTOPAY_TOKEN` в Railway Variables
- [ ] Установил `pip install aiocryptopay`
- [ ] Добавил код `_create_invoice()` в `_buy_vip()`
- [ ] Добавил webhook handler `_cryptopay_webhook()`
- [ ] Добавил маршрут `/api/v1/vip/payment_webhook` в router
- [ ] Зарегистрировал Webhook URL в @CryptoBot
- [ ] Протестировал на testnet
- [ ] Переключил на mainnet

---

## Поддерживаемые валюты CryptoBot (полный список)

```
TON   — Toncoin           ⭐ Рекомендую (нативный, дёшево)
USDT  — Tether USD        ⭐ Рекомендую (стейблкоин)
BTC   — Bitcoin
ETH   — Ethereum
USDC  — USD Coin
LTC   — Litecoin
BNB   — BNB
TRX   — TRON
DOGS  — DOGS (мем-коин TON)
NOT   — Notcoin
```

**Для NEXARB оптимально: TON + USDT** — это покрывает 90% пользователей Telegram.
