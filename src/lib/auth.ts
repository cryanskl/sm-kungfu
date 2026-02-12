import { createHmac, randomBytes } from 'crypto';

const SECRET = process.env.COOKIE_SECRET || process.env.SECONDME_CLIENT_SECRET || 'wulin-hackathon-2026';

// ============================================================
// Cookie 签名（HMAC-SHA256）
// 格式：value.signature
// ============================================================

export function signCookie(value: string): string {
  const sig = createHmac('sha256', SECRET).update(value).digest('hex').slice(0, 16);
  return `${value}.${sig}`;
}

export function verifyCookie(signed: string | undefined): string | null {
  if (!signed) return null;
  const lastDot = signed.lastIndexOf('.');
  if (lastDot === -1) return null;
  const value = signed.slice(0, lastDot);
  const sig = signed.slice(lastDot + 1);
  const expected = createHmac('sha256', SECRET).update(value).digest('hex').slice(0, 16);
  if (sig !== expected) return null;
  return value;
}

// ============================================================
// OAuth State（防 CSRF）
// ============================================================

export function generateOAuthState(): string {
  return randomBytes(16).toString('hex');
}

// ============================================================
// 从请求中安全提取 heroId（验签 + 归属校验）
// ============================================================

export function getHeroIdFromCookies(cookies: { get: (name: string) => { value: string } | undefined }): {
  userId: string | null;
  heroId: string | null;
} {
  const userId = verifyCookie(cookies.get('wulin_user_id')?.value);
  const heroId = verifyCookie(cookies.get('wulin_hero_id')?.value);
  return { userId, heroId };
}
