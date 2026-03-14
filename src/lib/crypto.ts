import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

// Auto-generate a stable fallback key from machine-specific data if env var is missing.
// In production, always set ENCRYPTION_KEY to a 32+ char secret for consistent decryption.
function resolveKey(): string {
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey && envKey.length >= 32) return envKey;

  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '⚠️  ENCRYPTION_KEY not set or too short. ' +
      'Set a 32+ character ENCRYPTION_KEY env var in Render dashboard for persistent API key storage.'
    );
  }

  // Derive a consistent-ish key from available env data
  const seed = process.env.RENDER_SERVICE_ID ||
               process.env.RENDER_GIT_REPO_SLUG ||
               process.env.npm_package_name ||
               'nexarb-default-fallback-key-2025';
  return seed.padEnd(32, '0').slice(0, 64);
}

const RAW_KEY = resolveKey();
const key = crypto.scryptSync(RAW_KEY, 'nexarb-secure-salt-2026', 32);

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

export function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) throw new Error('Invalid ciphertext format');
  const [ivHex, tagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
