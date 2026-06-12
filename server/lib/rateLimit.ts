type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: true } | { ok: false; retryAfterMs: number } {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now >= entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (entry.count >= limit) {
    return { ok: false, retryAfterMs: Math.max(0, entry.resetAt - now) };
  }
  entry.count += 1;
  return { ok: true };
}

export function rateLimitMiddleware(
  keyPrefix: string,
  getUserId: (req: unknown) => string | null,
  limit: number,
  windowMs: number
) {
  return (req: unknown, res: { status: (code: number) => { json: (body: unknown) => unknown } }) => {
    const userId = getUserId(req);
    if (!userId) return true;
    const result = checkRateLimit(`${keyPrefix}:${userId}`, limit, windowMs);
    if (result.ok) return true;
    res.status(429).json({
      error: "rate_limited",
      message: "Too many requests. Try again in a moment.",
      retryAfterMs: "retryAfterMs" in result ? result.retryAfterMs : 0,
    });
    return false;
  };
}
