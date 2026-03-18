"""
NEXARB Scanner v2 - CryptoBot Payment Service
https://help.crypt.bot/crypto-pay-api
Free, no verification, supports USDT/TON/BTC/ETH
"""
import httpx
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

CRYPTOBOT_API_URL = "https://pay.crypt.bot/api"
# Testnet: https://testnet-pay.crypt.bot/api


class CryptoBotClient:
    def __init__(self, token: str):
        self.token = token
        self.headers = {"Crypto-Pay-API-Token": token}

    async def get_me(self) -> dict:
        """Test API connection"""
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{CRYPTOBOT_API_URL}/getMe",
                headers=self.headers,
                timeout=10.0,
            )
            return resp.json()

    async def create_invoice(
        self,
        amount: float,
        currency: str = "USDT",
        description: str = "NEXARB VIP Subscription",
        payload: str = "",
        expires_in: int = 900,  # 15 minutes
    ) -> Optional[dict]:
        """
        Create a payment invoice.
        Returns invoice object with pay_url for user to click.
        """
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{CRYPTOBOT_API_URL}/createInvoice",
                    headers=self.headers,
                    json={
                        "currency_type": "crypto",
                        "asset": currency,
                        "amount": str(amount),
                        "description": description,
                        "payload": payload,
                        "expires_in": expires_in,
                    },
                    timeout=15.0,
                )
                data = resp.json()
                if data.get("ok"):
                    return data["result"]
                else:
                    logger.error(f"CryptoBot createInvoice error: {data}")
                    return None
        except Exception as e:
            logger.error(f"CryptoBot API error: {e}")
            return None

    async def get_invoices(
        self,
        invoice_ids: list[int] = None,
        status: str = None,
        count: int = 100,
    ) -> list[dict]:
        """Get invoice list for manual verification"""
        try:
            params = {"count": count}
            if invoice_ids:
                params["invoice_ids"] = ",".join(map(str, invoice_ids))
            if status:
                params["status"] = status

            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{CRYPTOBOT_API_URL}/getInvoices",
                    headers=self.headers,
                    params=params,
                    timeout=10.0,
                )
                data = resp.json()
                if data.get("ok"):
                    return data["result"].get("items", [])
                return []
        except Exception as e:
            logger.error(f"CryptoBot getInvoices error: {e}")
            return []

    async def check_invoice(self, invoice_id: int) -> Optional[dict]:
        """Check single invoice status"""
        invoices = await self.get_invoices(invoice_ids=[invoice_id])
        return invoices[0] if invoices else None

    def verify_webhook(self, token: str, body: str, signature: str) -> bool:
        """
        Verify CryptoBot webhook signature.
        https://help.crypt.bot/crypto-pay-api#verifying-webhook-requests
        """
        import hashlib
        import hmac

        secret = hashlib.sha256(token.encode()).digest()
        computed = hmac.new(secret, body.encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(computed, signature)


# ── Singleton ──────────────────────────────────────────────────────────────────
_cryptobot_client: CryptoBotClient | None = None


def get_cryptobot() -> CryptoBotClient:
    global _cryptobot_client
    if _cryptobot_client is None:
        from app.config import settings
        if not settings.CRYPTOBOT_TOKEN:
            raise RuntimeError("CRYPTOBOT_TOKEN not set")
        _cryptobot_client = CryptoBotClient(settings.CRYPTOBOT_TOKEN)
    return _cryptobot_client


# ── Plan helpers ──────────────────────────────────────────────────────────────

PLAN_DAYS = {
    "week": 7,
    "month": 30,
    "year": 365,
}

# Default prices (overridden by DB subscription_plans table)
DEFAULT_PRICES = {
    "week":  {"USDT": 10.0,  "TON": 60.0},
    "month": {"USDT": 30.0,  "TON": 180.0},
    "year":  {"USDT": 200.0, "TON": 1200.0},
}


async def get_plan_prices() -> dict:
    """Get current prices from Supabase subscription_plans table"""
    try:
        from app.database import get_supabase_service
        db = get_supabase_service()
        result = db.table("subscription_plans").select("*").eq("is_active", True).execute()
        prices = DEFAULT_PRICES.copy()
        for row in (result.data or []):
            plan = row["plan"]
            prices[plan] = {
                "USDT": float(row["price_usdt"]),
                "TON": float(row.get("price_ton") or DEFAULT_PRICES[plan]["TON"]),
                "days": row["duration_days"],
            }
        return prices
    except Exception as e:
        logger.error(f"get_plan_prices error: {e}")
        return DEFAULT_PRICES


def format_invoice_description(plan: str, currency: str) -> str:
    days = PLAN_DAYS.get(plan, 30)
    plan_label = {"week": "1 Week", "month": "1 Month", "year": "1 Year"}.get(plan, plan)
    return f"NEXARB Scanner VIP — {plan_label} ({days} days) [{currency}]"
