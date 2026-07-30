// api/logout.js
//
// POST /api/logout
// Invalidates the current session's refresh token server-side.

import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { methodGuard } from './_lib/http.js';
import { requireAuth } from './_lib/auth.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, ['POST'])) return;

  const auth = await requireAuth(req, res);
  if (!auth) return;

  // Revoke the session server-side (scope: 'global' revokes all sessions
  // for this user's current refresh token family).
  await supabaseAdmin.auth.admin.signOut(auth.token, 'local').catch(() => {
    // Non-fatal — the client will drop its local token regardless.
  });

  res.status(200).json({ success: true });
}
