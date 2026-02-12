// ============================================================
// 滑动窗口限流器
// ============================================================

interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

export class RateLimiter {
  private windows = new Map<string, number[]>();
  private maxRequests: number;
  private windowMs: number;
  private pruneTimer: ReturnType<typeof setInterval>;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    // Auto-prune stale entries every 60s
    this.pruneTimer = setInterval(() => this.prune(), 60_000);
    if (this.pruneTimer.unref) this.pruneTimer.unref();
  }

  check(key: string): RateLimitResult {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    let timestamps = this.windows.get(key);

    if (timestamps) {
      // Remove expired timestamps
      timestamps = timestamps.filter(t => t > cutoff);
    } else {
      timestamps = [];
    }

    if (timestamps.length >= this.maxRequests) {
      const oldest = timestamps[0];
      const retryAfterMs = oldest + this.windowMs - now;
      this.windows.set(key, timestamps);
      return { allowed: false, retryAfterMs: Math.max(0, retryAfterMs) };
    }

    timestamps.push(now);
    this.windows.set(key, timestamps);
    return { allowed: true };
  }

  private prune() {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    for (const [key, timestamps] of this.windows) {
      const valid = timestamps.filter(t => t > cutoff);
      if (valid.length === 0) {
        this.windows.delete(key);
      } else {
        this.windows.set(key, valid);
      }
    }
  }
}

// Pre-configured singletons
export const betRateLimiter = new RateLimiter(3, 10_000);    // 3 requests per 10s
export const danmakuRateLimiter = new RateLimiter(1, 5_000);  // 1 request per 5s
