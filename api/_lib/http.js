// api/_lib/http.js
//
// Small shared helpers to keep every serverless function's boilerplate
// (method guarding, JSON body parsing, consistent error shape) identical.

export function methodGuard(req, res, allowed) {
  if (!allowed.includes(req.method)) {
    res.setHeader('Allow', allowed.join(', '));
    res.status(405).json({ error: `Method ${req.method} not allowed.` });
    return false;
  }
  return true;
}

export function sendError(res, status, message) {
  res.status(status).json({ error: message });
}

export async function withErrorHandling(res, fn) {
  try {
    await fn();
  } catch (err) {
    console.error('[api error]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
}
