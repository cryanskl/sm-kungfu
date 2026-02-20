import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';

function getSecret(): string {
  if (!process.env.COOKIE_SECRET && process.env.SECONDME_CLIENT_SECRET) {
    console.warn('[Auth] ⚠ COOKIE_SECRET not set, falling back to SECONDME_CLIENT_SECRET — set a dedicated secret in production');
  }
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

// ============================================================
// 用户会话鉴权：要求已登录（有合法 heroId cookie）
// ============================================================

export async function requireSession(): Promise<NextResponse | null> {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const { heroId } = getHeroIdFromCookies(cookieStore);
  if (!heroId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

// ============================================================
// Engine 端点鉴权：校验 X-Engine-Secret header
// 防止外部直接调用 engine API 操控游戏流程
// ============================================================

function getEngineSecret(): string {
  // ENGINE_SECRET 是专用的引擎鉴权密钥，可公开（NEXT_PUBLIC_）暴露给前端游戏驱动器。
  // 绝不回退到 COOKIE_SECRET 或 SECONDME_CLIENT_SECRET —— 那些是敏感密钥，
  // 如果作为 engine secret 使用会被 NEXT_PUBLIC_ 前缀暴露给浏览器。
  return process.env.ENGINE_SECRET
    || process.env.NEXT_PUBLIC_ENGINE_SECRET
    || '';
}

export function requireEngineSecret(request: { headers: { get: (name: string) => string | null } }): NextResponse | null {
  const secret = getEngineSecret();
  if (!secret) {
    console.warn('[Auth] ⚠ No ENGINE_SECRET configured, engine endpoints are unprotected');
    return null; // 没配置 secret 时不阻塞（向后兼容）
  }
  const provided = request.headers.get('x-engine-secret');
  if (provided !== secret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}
