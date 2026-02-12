import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

function getSecret(): string {
  const secret = process.env.COOKIE_SECRET || process.env.SECONDME_CLIENT_SECRET;
  if (!secret) {
    throw new Error('[Auth] COOKIE_SECRET 或 SECONDME_CLIENT_SECRET 必须设置，拒绝使用硬编码秘钥');
  }
  return secret;
}

// ============================================================
// Cookie 签名（HMAC-SHA256）
// 格式：value.signature
// ============================================================

export function signCookie(value: string): string {
  const sig = createHmac('sha256', getSecret()).update(value).digest('hex');
  return `${value}.${sig}`;
}

export function verifyCookie(signed: string | undefined): string | null {
  if (!signed) return null;
  const lastDot = signed.lastIndexOf('.');
  if (lastDot === -1) return null;
  const value = signed.slice(0, lastDot);
  const sig = signed.slice(lastDot + 1);
  const expected = createHmac('sha256', getSecret()).update(value).digest('hex');
  // 长度不一致时 timingSafeEqual 会抛异常，先做长度检查
  if (sig.length !== expected.length) return null;
  const sigBuf = Buffer.from(sig, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;
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
