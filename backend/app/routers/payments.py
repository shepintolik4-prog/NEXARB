"""
NEXARB Scanner v2 - Payments Router
CryptoBot invoice creation, status check, webhook handler
"""
import json
import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Request, Header
from pydantic import BaseModel
from typing import Optional

from app.services.cryptobot import get_cryptobot, get_plan_prices, format_invoice_description, PLAN_DAYS
from app.services.subscription import activate_vip
from app.services.telegram_bot import send_alert_notification
from app.database import get_supabase_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/payments", tags=["Payments"])


class CreateInvoiceRequest(BaseModel):
    telegram_id: int
    plan: str           # week | month | year
    currency: str = "USDT"
    referred_by: Optional[int] = None


class CheckPaymentRequest(BaseModel):
    telegram_id: int
    invoice_id: int


@router.get("/plans")
async def get_plans():
    """Get current subscription plan prices"""
    prices = await get_plan_prices()
    return {
        "plans": [
            {
                "id": "week",
                "label": "1 Week",
                "days": 7,
                "price_usdt": prices["week"]["USDT"] if isinstance(prices["week"], dict) else prices["week"],
                "description": "Perfect for testing",
                "features": ["All exchanges", "All tokens", "Futures + DEX", "Unlimited alerts", "Realtime data"],
            },
            {
                "id": "month",
                "label": "1 Month",
                "days": 30,
                "price_usdt": prices["month"]["USDT"] if isinstance(prices["month"], dict) else prices["month"],
                "description": "Most popular",
                "popular": True,
                "features": ["Everything in Week", "Semi-auto trading", "Priority support"],
            },
            {
                "id": "year",
                "label": "1 Year",
                "days": 365,
                "price_usdt": prices["year"]["USDT"] if isinstance(prices["year"], dict) else prices["year"],
                "description": "Best value — save 44%",
                "features": ["Everything in Month", "Early access to new features"],
            },
        ]
    }


@router.post("/create-invoice")
async def create_invoice(req: CreateInvoiceRequest):
    """Create CryptoBot payment invoice"""
    if req.plan not in ("week", "month", "year"):
        raise HTTPException(status_code=400, detail="Invalid plan")

    prices = await get_plan_prices()
    plan_data = prices.get(req.plan, {})
    amount = plan_data.get(req.currency, plan_data) if isinstance(plan_data, dict) else plan_data

    if not amount:
        raise HTTPException(status_code=400, detail=f"Currency {req.currency} not supported for this plan")

    db = get_supabase_service()

    # Create payment record
    payment_record = db.table("payments").insert({
        "telegram_id": req.telegram_id,
        "plan": req.plan,
        "amount": float(amount),
        "currency": req.currency,
        "status": "pending",
        "referred_by": req.referred_by,
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat(),
    }).execute()

    payment_id = payment_record.data[0]["id"] if payment_record.data else None

    # Create CryptoBot invoice
    try:
        bot = get_cryptobot()
        invoice = await bot.create_invoice(
            amount=float(amount),
            currency=req.currency,
            description=format_invoice_description(req.plan, req.currency),
            payload=json.dumps({
                "telegram_id": req.telegram_id,
                "plan": req.plan,
                "payment_id": payment_id,
                "referred_by": req.referred_by,
            }),
            expires_in=900,
        )

        if not invoice:
            raise HTTPException(status_code=500, detail="Failed to create invoice")

        # Update payment with invoice ID
        if payment_id:
            db.table("payments").update({
                "invoice_id": invoice["invoice_id"],
                "invoice_hash": invoice.get("hash"),
            }).eq("id", payment_id).execute()

        return {
            "success": True,
            "invoice_id": invoice["invoice_id"],
            "pay_url": invoice["pay_url"],
            "bot_invoice_url": invoice.get("bot_invoice_url"),
            "amount": float(amount),
            "currency": req.currency,
            "plan": req.plan,
            "expires_at": invoice.get("expiration_date"),
        }

    except RuntimeError as e:
        # CryptoBot not configured
        raise HTTPException(status_code=503, detail=f"Payment service unavailable: {e}")


@router.post("/check")
async def check_payment(req: CheckPaymentRequest):
    """Manually check payment status (polling fallback)"""
    db = get_supabase_service()

    # Check our DB first
    payment = db.table("payments").select("*").eq(
        "invoice_id", req.invoice_id
    ).eq("telegram_id", req.telegram_id).execute()

    if not payment.data:
        raise HTTPException(status_code=404, detail="Payment not found")

    record = payment.data[0]

    # Already paid
    if record["status"] == "paid":
        return {"status": "paid", "plan": record["plan"]}

    # Check with CryptoBot
    try:
        bot = get_cryptobot()
        invoice = await bot.check_invoice(req.invoice_id)

        if invoice and invoice.get("status") == "paid":
            await _process_successful_payment(record, invoice)
            return {"status": "paid", "plan": record["plan"]}

        return {"status": record["status"], "plan": record["plan"]}

    except Exception as e:
        logger.error(f"check_payment error: {e}")
        return {"status": record["status"]}


@router.post("/webhook")
async def cryptobot_webhook(request: Request, crypto_pay_api_signature: str = Header(None)):
    """
    CryptoBot webhook endpoint.
    Configure in @CryptoBot → My Apps → your app → Webhooks
    URL: https://nexarb-scanner-api.onrender.com/api/payments/webhook
    """
    body = await request.body()
    body_str = body.decode()

    # Verify signature
    try:
        from app.config import settings
        bot = get_cryptobot()
        if crypto_pay_api_signature and not bot.verify_webhook(
            settings.CRYPTOBOT_TOKEN, body_str, crypto_pay_api_signature
        ):
            logger.warning("Invalid CryptoBot webhook signature")
            raise HTTPException(status_code=401, detail="Invalid signature")
    except RuntimeError:
        pass  # CryptoBot not configured, skip signature check

    try:
        data = json.loads(body_str)
        update_type = data.get("update_type")

        if update_type == "invoice_paid":
            invoice = data.get("payload", {})
            await _handle_paid_invoice(invoice)

        return {"ok": True}

    except Exception as e:
        logger.error(f"Webhook processing error: {e}")
        return {"ok": True}  # Always return 200 to CryptoBot


async def _handle_paid_invoice(invoice: dict):
    """Process a paid invoice from webhook"""
    invoice_id = invoice.get("invoice_id")
    payload_str = invoice.get("payload", "{}")

    try:
        payload = json.loads(payload_str)
    except Exception:
        payload = {}

    telegram_id = payload.get("telegram_id")
    plan = payload.get("plan")
    payment_id = payload.get("payment_id")
    referred_by = payload.get("referred_by")

    if not telegram_id or not plan:
        logger.error(f"Invalid webhook payload: {payload}")
        return

    db = get_supabase_service()

    # Find payment record
    payment_query = db.table("payments").select("*").eq("invoice_id", invoice_id).execute()
    if not payment_query.data:
        logger.error(f"Payment not found for invoice {invoice_id}")
        return

    record = payment_query.data[0]

    # Already processed
    if record["status"] == "paid":
        return

    await _process_successful_payment(record, invoice)


async def _process_successful_payment(record: dict, invoice: dict):
    """Activate VIP after confirmed payment"""
    telegram_id = record["telegram_id"]
    plan = record["plan"]
    payment_db_id = record["id"]
    referred_by = record.get("referred_by")

    db = get_supabase_service()

    # Mark payment as paid
    db.table("payments").update({
        "status": "paid",
        "paid_at": datetime.now(timezone.utc).isoformat(),
        "invoice_id": invoice.get("invoice_id"),
    }).eq("id", payment_db_id).execute()

    # Activate VIP
    new_expiry = await activate_vip(telegram_id, plan, payment_db_id)

    # Handle referral rewards
    if referred_by:
        await _award_referral_points(referred_by, telegram_id, plan)

    # Send Telegram notification
    try:
        from app.services.telegram_bot import get_bot
        from telegram.constants import ParseMode
        bot = get_bot()
        plan_label = {"week": "1 Week", "month": "1 Month", "year": "1 Year"}.get(plan, plan)
        expiry_str = new_expiry.strftime("%d.%m.%Y") if new_expiry else "N/A"

        await bot.send_message(
            chat_id=telegram_id,
            text=(
                f"✅ <b>VIP Activated!</b>\n\n"
                f"Plan: <b>{plan_label}</b>\n"
                f"Expires: <code>{expiry_str}</code>\n\n"
                f"🚀 You now have access to all features:\n"
                f"• All exchanges & tokens\n"
                f"• Futures + DEX scanner\n"
                f"• Unlimited alerts\n"
                f"• Realtime data\n"
                f"• Semi-auto trading"
            ),
            parse_mode=ParseMode.HTML,
        )
    except Exception as e:
        logger.error(f"Failed to send VIP notification: {e}")

    logger.info(f"VIP activated for {telegram_id}: plan={plan}, expires={new_expiry}")


async def _award_referral_points(referrer_id: int, referred_id: int, plan: str):
    """Award points to referrer when their referral buys VIP"""
    # Points per plan
    points_per_plan = {
        "week": 200,     # 2 days VIP
        "month": 600,    # 6 days VIP
        "year": 3000,    # 30 days VIP
    }
    points = points_per_plan.get(plan, 200)

    db = get_supabase_service()

    # Add points
    db.rpc("add_referral_points", {
        "p_telegram_id": referrer_id,
        "p_points": points,
    }).execute()

    # Mark referral as converted
    db.table("referrals").update({
        "converted": True,
        "converted_at": datetime.now(timezone.utc).isoformat(),
        "points_earned": points,
    }).eq("referred_id", referred_id).execute()

    # Notify referrer
    try:
        from app.services.telegram_bot import get_bot
        from telegram.constants import ParseMode
        bot = get_bot()
        await bot.send_message(
            chat_id=referrer_id,
            text=(
                f"🎉 <b>Referral Bonus!</b>\n\n"
                f"Your referral just subscribed to VIP!\n"
                f"You earned <b>+{points} points</b>\n"
                f"= <b>+{points // 100} days VIP</b>\n\n"
                f"Check your points balance in Settings."
            ),
            parse_mode=ParseMode.HTML,
        )
    except Exception as e:
        logger.error(f"Failed to send referral notification: {e}")
