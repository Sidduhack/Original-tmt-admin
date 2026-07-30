// api/verify-session.js
//
// GET /api/verify-session
// Called by every protected admin page on load to confirm the stored
// token is still valid before rendering. Returns the user on success.

import { methodGuard } from './_lib/http.js';
import { requireAuth } from './_lib/auth.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, ['GET'])) return;

  const auth = await requireAuth(req, res);
  if (!auth) return;

  res.status(200).json({
    valid: true,
    user: { id: auth.user.id, email: auth.user.email },
  });
}
