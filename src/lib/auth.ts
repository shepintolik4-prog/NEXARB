import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export interface AuthRequest extends Request {
  user?: { uid: string; tgId?: number };
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

// ── Telegram initData verification ────────────────────────────
function verifyTelegramInitData(initData: string): { uid: string; tgId: number } | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

    // Build the check string
    params.delete('hash');
    const keys = Array.from(params.keys()).sort();
    const checkString = keys.map(k => `${k}=${params.get(k)}`).join('\n');

    // HMAC-SHA256 with secret key = HMAC-SHA256("WebAppData", bot_token)
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const computedHash = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');

    if (computedHash !== hash) return null;

    // Check auth_date not too old (24h)
    const authDate = parseInt(params.get('auth_date') || '0', 10);
    if (Date.now() / 1000 - authDate > 86400) return null;

    const userStr = params.get('user');
    if (!userStr) return null;
    const tgUser = JSON.parse(userStr);

    return { uid: `tg_${tgUser.id}`, tgId: tgUser.id };
  } catch {
    return null;
  }
}

// ── Dev token bypass ───────────────────────────────────────────
function verifyDevToken(token: string): { uid: string; tgId: number } | null {
  // Only in non-production: allow "dev-token-{userId}"
  if (process.env.NODE_ENV === 'production') return null;
  const match = token.match(/^dev-token-(\d+)$/);
  if (!match) return null;
  const tgId = parseInt(match[1], 10);
  return { uid: `tg_${tgId}`, tgId };
}

// ── Main authenticate middleware ───────────────────────────────
export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.slice(7);

  // Try dev token first (non-production only)
  const devUser = verifyDevToken(token);
  if (devUser) {
    req.user = devUser;
    return next();
  }

  // Try Telegram initData verification
  if (BOT_TOKEN) {
    const tgUser = verifyTelegramInitData(token);
    if (tgUser) {
      req.user = tgUser;
      return next();
    }
  } else if (process.env.NODE_ENV !== 'production') {
    // No bot token in dev — accept any non-empty token, extract uid from it
    // This handles the case where initData is passed but we can't verify it locally
    try {
      const params = new URLSearchParams(token);
      const userStr = params.get('user');
      if (userStr) {
        const tgUser = JSON.parse(userStr);
        req.user = { uid: `tg_${tgUser.id}`, tgId: tgUser.id };
        return next();
      }
    } catch { /* fall through */ }
    // Last resort in dev: use token as uid directly
    req.user = { uid: token.slice(0, 32) };
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized: Invalid token' });
};

// ── Admin authorization ────────────────────────────────────────
export const authorizeAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  const adminSecret = req.headers['x-admin-secret'];
  const querySecret = (req.query as any).secret;

  if (
    (adminSecret && ADMIN_SECRET && adminSecret === ADMIN_SECRET) ||
    (querySecret && ADMIN_SECRET && querySecret === ADMIN_SECRET)
  ) {
    return next();
  }

  return res.status(403).json({ error: 'Forbidden: Admin access required' });
};
