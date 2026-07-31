// api/_lib/cors.js
//
// CORS handling for the *public* endpoints only (api/public/*.js).
// The admin-only endpoints (api/*.js) are called exclusively from the
// admin panel itself (same origin in production), so they don't need this.
//
// Allowed origins are restricted to the real website domains — this is
// what stops some other site from hammering your subscribe/feedback
// endpoints from a browser using stolen-looking requests. It does not
// stop server-to-server abuse, which is why these routes are also
// rate-limited (see rateLimiter.js).

const ALLOWED_ORIGINS = [
  'https://www.tmtofficial.in',
  'https://tmtofficial.in',
  // Uncomment while developing the frontend locally:
  // 'http://localhost:3000',
  // 'http://127.0.0.1:5500',
];

/**
 * Applies CORS headers and handles the OPTIONS preflight request.
 * Returns true if the caller should continue handling the request,
 * false if this function already fully responded (preflight) and the
 * handler should return immediately.
 */
export function applyCors(req, res) {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return false;
  }

  return true;
}
