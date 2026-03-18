"""
NEXARB Scanner - Telegram Bot Service
Handles user registration, alert notifications, and TMA commands
"""
import asyncio
import logging
from typing import Optional
from datetime import datetime, timezone

from telegram import Bot, InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes
from telegram.constants import ParseMode
from telegram.error import TelegramError

from app.config import settings

logger = logging.getLogger(__name__)

_bot_instance: Bot | None = None
_app_instance: Application | None = None


def get_bot() -> Bot:
    """Get or create Telegram Bot instance"""
    global _bot_instance
    if _bot_instance is None:
        if not settings.TELEGRAM_BOT_TOKEN:
            raise RuntimeError("TELEGRAM_BOT_TOKEN not set")
        _bot_instance = Bot(token=settings.TELEGRAM_BOT_TOKEN)
    return _bot_instance


# ── Alert message formatters ──────────────────────────────────────────────────

def format_cex_alert(spread_data: dict, alert_config: dict) -> str:
    """Format a CEX spread alert message"""
    spread_pct = spread_data.get("spread_pct", 0)
    symbol = spread_data.get("symbol", "Unknown")
    exchange_buy = spread_data.get("exchange_buy", "").upper()
    exchange_sell = spread_data.get("exchange_sell", "").upper()
    price_buy = spread_data.get("price_buy", 0)
    price_sell = spread_data.get("price_sell", 0)
    vol = spread_data.get("min_volume_24h", 0)
    
    # Emoji based on spread size
    if spread_pct >= 5:
        emoji = "🔥🔥🔥"
    elif spread_pct >= 2:
        emoji = "🔥🔥"
    elif spread_pct >= 1:
        emoji = "🔥"
    else:
        emoji = "⚡"
    
    vol_str = f"${vol:,.0f}" if vol else "N/A"
    
    return (
        f"{emoji} <b>CEX ARBITRAGE ALERT</b>\n\n"
        f"💎 <b>{symbol}</b>\n"
        f"📈 Spread: <code>+{spread_pct:.2f}%</code>\n\n"
        f"🟢 Buy on  <b>{exchange_buy}</b>\n"
        f"   Price: <code>${price_buy:,.6f}</code>\n\n"
        f"🔴 Sell on <b>{exchange_sell}</b>\n"
        f"   Price: <code>${price_sell:,.6f}</code>\n\n"
        f"💰 Vol 24h: <code>{vol_str}</code>\n"
        f"🕐 {datetime.now(timezone.utc).strftime('%H:%M:%S UTC')}"
    )


def format_futures_alert(spread_data: dict, alert_config: dict) -> str:
    """Format a Spot-Futures spread alert message"""
    spread_pct = spread_data.get("spread_pct", 0)
    symbol = spread_data.get("symbol", "Unknown")
    exchange = spread_data.get("spot_exchange", "").upper()
    spot_price = spread_data.get("spot_price", 0)
    futures_price = spread_data.get("futures_price", 0)
    funding_rate = spread_data.get("funding_rate")
    funding_annual = spread_data.get("funding_rate_annual")
    
    direction = "📈 LONG spot / SHORT futures" if spread_pct > 0 else "📉 SHORT spot / LONG futures"
    
    funding_str = ""
    if funding_rate is not None:
        funding_str = (
            f"\n💸 Funding (8h): <code>{funding_rate:.4f}%</code>"
            f"\n📅 Annual: <code>~{funding_annual:.1f}%</code>"
        )
    
    return (
        f"⚡ <b>FUTURES ARBITRAGE ALERT</b>\n\n"
        f"💎 <b>{symbol}</b> on <b>{exchange}</b>\n"
        f"📊 Spread: <code>{spread_pct:+.2f}%</code>\n"
        f"🎯 Strategy: {direction}\n\n"
        f"💵 Spot:    <code>${spot_price:,.6f}</code>\n"
        f"📑 Futures: <code>${futures_price:,.6f}</code>"
        f"{funding_str}\n\n"
        f"🕐 {datetime.now(timezone.utc).strftime('%H:%M:%S UTC')}"
    )


def format_dex_alert(spread_data: dict, alert_config: dict) -> str:
    """Format a DEX cross-chain spread alert"""
    spread_pct = spread_data.get("spread_pct", 0)
    symbol = spread_data.get("symbol", "Unknown")
    chain_buy = spread_data.get("chain_buy", "").upper()
    chain_sell = spread_data.get("chain_sell", "").upper()
    dex_buy = spread_data.get("dex_buy", "").upper()
    dex_sell = spread_data.get("dex_sell", "").upper()
    price_buy = spread_data.get("price_buy", 0)
    price_sell = spread_data.get("price_sell", 0)
    liq_buy = spread_data.get("liquidity_buy", 0)
    liq_sell = spread_data.get("liquidity_sell", 0)
    
    liq_str = f"${min(liq_buy or 0, liq_sell or 0):,.0f}" if (liq_buy or liq_sell) else "N/A"
    
    return (
        f"🌐 <b>DEX CROSS-CHAIN ALERT</b>\n\n"
        f"💎 <b>{symbol}</b>\n"
        f"📈 Spread: <code>+{spread_pct:.2f}%</code>\n\n"
        f"🟢 Buy on  <b>{dex_buy}</b> ({chain_buy})\n"
        f"   Price: <code>${price_buy:,.6f}</code>\n\n"
        f"🔴 Sell on <b>{dex_sell}</b> ({chain_sell})\n"
        f"   Price: <code>${price_sell:,.6f}</code>\n\n"
        f"💧 Min Liquidity: <code>{liq_str}</code>\n"
        f"⚠️ Note: Account for bridge fees & slippage\n"
        f"🕐 {datetime.now(timezone.utc).strftime('%H:%M:%S UTC')}"
    )


def format_funding_alert(spread_data: dict, alert_config: dict) -> str:
    """Format a funding rate alert"""
    exchange = spread_data.get("exchange", "").upper()
    symbol = spread_data.get("symbol", "Unknown")
    funding_rate = spread_data.get("funding_rate", 0)
    funding_annual = spread_data.get("funding_rate_annual", 0)
    
    direction = "🐂 Longs paying shorts" if funding_rate > 0 else "🐻 Shorts paying longs"
    
    return (
        f"💸 <b>FUNDING RATE ALERT</b>\n\n"
        f"💎 <b>{symbol}</b> on <b>{exchange}</b>\n"
        f"📊 Rate (8h): <code>{funding_rate:+.4f}%</code>\n"
        f"📅 Annual:    <code>~{funding_annual:+.1f}%</code>\n"
        f"📌 {direction}\n\n"
        f"🕐 {datetime.now(timezone.utc).strftime('%H:%M:%S UTC')}"
    )


ALERT_FORMATTERS = {
    "cex_spread": format_cex_alert,
    "futures_spread": format_futures_alert,
    "dex_spread": format_dex_alert,
    "funding_rate": format_funding_alert,
}


# ── Send notification ─────────────────────────────────────────────────────────

async def send_alert_notification(
    telegram_id: int,
    alert_type: str,
    spread_data: dict,
    alert_config: dict,
) -> bool:
    """
    Send a formatted alert notification to a Telegram user.
    Returns True if sent successfully.
    """
    try:
        bot = get_bot()
        formatter = ALERT_FORMATTERS.get(alert_type, format_cex_alert)
        message = formatter(spread_data, alert_config)
        
        # Add Open TMA button
        keyboard = InlineKeyboardMarkup([
            [InlineKeyboardButton(
                "📊 Open NEXARB Scanner",
                url=f"https://t.me/{settings.APP_NAME.replace(' ', '_')}?startapp=alerts",
            )]
        ])
        
        await bot.send_message(
            chat_id=telegram_id,
            text=message,
            parse_mode=ParseMode.HTML,
            reply_markup=keyboard,
        )
        return True
        
    except TelegramError as e:
        logger.error(f"Telegram error sending to {telegram_id}: {e}")
        return False
    except Exception as e:
        logger.error(f"Unexpected error sending to {telegram_id}: {e}")
        return False


async def send_welcome_message(telegram_id: int, first_name: str = "Trader") -> bool:
    """Send welcome message to new user"""
    try:
        bot = get_bot()
        message = (
            f"👋 <b>Welcome to NEXARB Scanner, {first_name}!</b>\n\n"
            f"🔍 Real-time arbitrage across 17+ CEX exchanges\n"
            f"⚡ Spot-Futures spreads & Funding rates\n"
            f"🌐 Cross-chain DEX opportunities\n"
            f"🔔 Custom alerts delivered here\n\n"
            f"<i>Open the app to start scanning →</i>"
        )
        keyboard = InlineKeyboardMarkup([
            [InlineKeyboardButton("🚀 Open Scanner", url=f"https://nexarb-scanner.vercel.app")]
        ])
        
        await bot.send_message(
            chat_id=telegram_id,
            text=message,
            parse_mode=ParseMode.HTML,
            reply_markup=keyboard,
        )
        return True
    except TelegramError as e:
        logger.error(f"Welcome message error for {telegram_id}: {e}")
        return False


# ── Bot Commands (for /start etc) ────────────────────────────────────────────

async def handle_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /start command"""
    user = update.effective_user
    if not user:
        return
    
    # Register user in DB
    from app.database import upsert_user
    await upsert_user(
        telegram_id=user.id,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
    )
    
    await send_welcome_message(user.id, user.first_name or "Trader")


async def handle_status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /status command - show scanner status"""
    from app.services.cache import cex_cache, dex_cache, futures_cache
    
    cex_stats = cex_cache.stats()
    dex_stats = dex_cache.stats()
    fut_stats = futures_cache.stats()
    
    message = (
        f"📊 <b>NEXARB Scanner Status</b>\n\n"
        f"🔵 CEX Cache: {cex_stats['entries']} entries, {cex_stats['hit_rate_pct']}% hit rate\n"
        f"🟣 DEX Cache: {dex_stats['entries']} entries, {dex_stats['hit_rate_pct']}% hit rate\n"
        f"🟡 Futures Cache: {fut_stats['entries']} entries, {fut_stats['hit_rate_pct']}% hit rate\n\n"
        f"✅ Bot is running"
    )
    
    await update.message.reply_text(message, parse_mode=ParseMode.HTML)


def create_bot_application() -> Application:
    """Create and configure the bot application"""
    global _app_instance
    if _app_instance is not None:
        return _app_instance
    
    if not settings.TELEGRAM_BOT_TOKEN:
        logger.warning("TELEGRAM_BOT_TOKEN not set - bot disabled")
        return None
    
    app = Application.builder().token(settings.TELEGRAM_BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", handle_start))
    app.add_handler(CommandHandler("status", handle_status))
    
    _app_instance = app
    return app
