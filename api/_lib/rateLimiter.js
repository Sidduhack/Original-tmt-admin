// api/_lib/rateLimiter.js
//
// Minimal in-memory token-bucket rate limiter, keyed by IP + route.
// This is "rate limiting ready": it works out of the box on a single
// serverless instance, and warm instances will share the map for a
// short window, which is enough to blunt brute-force login attempts and
// email-blast abuse. For multi-region/high-traffic production use,
// swap the Map below for an Upstash Redis-backed store — the
// `checkRateLimit()` function signature would not need to change.

const buckets = new Map();

/**
 * @param {string} key       Unique key, e.g. `login:${ip}`
 * @param {number} limit     Max requests allowed in the window
 * @param {number} windowMs  Window size in milliseconds
 * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number }}
 */
export function checkRateLimit(key, limit = 5, windowMs = 60_000) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, retryAfterMs: 0 };
}

export function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}
