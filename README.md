# NEXARB Scanner

Production-ready Telegram Mini App for crypto arbitrage scanning — clone of arbitragescanner.io.

## Stack

| Layer     | Technology                          | Hosting      |
|-----------|-------------------------------------|--------------|
| Frontend  | React 18 + Tailwind CSS + Zustand   | Vercel (free)|
| Backend   | Python FastAPI + CCXT + APScheduler | Render (free)|
| Database  | Supabase PostgreSQL                 | Supabase (free)|
| Bot       | python-telegram-bot                 | Same backend |

## Features

- **CEX Scanner** — real-time spread detection across 17+ exchanges via CCXT (no keys required)
- **Futures Scanner** — spot vs perpetual futures spread + funding rate tracking
- **DEX Scanner** — cross-chain arbitrage via DexScreener API (Ethereum, BSC, Solana, Arbitrum, Base, etc.)
- **Alerts Engine** — background job that fires Telegram notifications when spread > threshold
- **WebSocket** — live push updates to TMA without polling
- **User API Keys** — optional per-user exchange keys for higher rate limits
- **Supabase** — persistent user settings, alerts, and scan history

## Deploy in 4 steps

### 1. Supabase — run schema
1. Create project at https://app.supabase.com
2. Go to SQL Editor → paste `supabase/schema.sql` → Run

### 2. Telegram Bot
1. Open @BotFather → `/newbot` → get token
2. Set up Mini App: `/newapp` → point to your Vercel URL

### 3. Backend on Render.com
```bash
cd backend
# Push to GitHub, connect repo in Render → New Web Service
# Set env vars in Render dashboard (see .env.example)
```
Or use Dockerfile:
```bash
docker build -t nexarb-backend .
docker run -p 8000:8000 --env-file .env nexarb-backend
```

### 4. Frontend on Vercel
```bash
cd frontend
npm install
# Set VITE_API_URL in Vercel environment variables
vercel deploy
```

## Local Development

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in values
uvicorn app.main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
npm install
cp .env.example .env   # set VITE_API_URL=http://localhost:8000
npm run dev
```

## API Endpoints

| Method | Endpoint                      | Description              |
|--------|-------------------------------|--------------------------|
| POST   | `/api/scanner/scan`           | CEX spread scan          |
| GET    | `/api/scanner/scan`           | CEX scan (query params)  |
| POST   | `/api/futures/scan`           | Spot-futures spreads     |
| GET    | `/api/futures/funding-rates`  | Current funding rates    |
| POST   | `/api/dex/scan`               | DEX cross-chain scan     |
| POST   | `/api/users/init`             | Register TMA user        |
| POST   | `/api/alerts/`                | Create alert             |
| GET    | `/api/alerts/{telegram_id}`   | List user alerts         |
| PATCH  | `/api/alerts/{alert_id}`      | Update alert             |
| DELETE | `/api/alerts/{alert_id}`      | Delete alert             |
| WS     | `/ws/{telegram_id}`           | Live spread updates      |

## Rate Limits & Free Tier Notes

- **CCXT without API keys**: ~15-20 exchanges work on public endpoints (REST)
- **DexScreener**: 300 req/min free, no auth needed
- **Jupiter**: Free, no auth needed
- **Render free tier**: Spins down after 15min inactivity → first request is slow (~30s)
- **Supabase free**: 500MB storage, 50k API calls/day

## Folder Structure

```
nexarb-scanner/
├── backend/
│   ├── app/
│   │   ├── main.py              FastAPI app + WebSocket
│   │   ├── config.py            Settings + exchange metadata
│   │   ├── database.py          Supabase helpers
│   │   ├── models.py            Pydantic schemas
│   │   ├── routers/             API route handlers
│   │   ├── services/            Scanner + alert + bot logic
│   │   └── tasks/               APScheduler background jobs
│   ├── Dockerfile
│   ├── render.yaml
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── App.jsx              Root + TMA init
│       ├── telegram.js          WebApp SDK wrapper
│       ├── api/client.js        Axios + all API calls
│       ├── store/useStore.js    Zustand global state
│       ├── hooks/               useScanner, useFutures, useWebSocket
│       └── components/          Scanner, Futures, DEX, Alerts, Settings
└── supabase/
    └── schema.sql               Full DB schema with RLS
```
