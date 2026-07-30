// api/login.js
//
// POST /api/login
// Body: { email, password }
// Authenticates against Supabase Auth, checks the admin allowlist, and
// returns the session (access_token / refresh_token) for the frontend to
// store and attach as a Bearer token on subsequent /api requests.

import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { methodGuard } from './_lib/http.js';
import { isValidEmail, isNonEmptyString } from './_lib/validate.js';
import { checkRateLimit, getClientIp } from './_lib/rateLimiter.js';

function getAllowedEmails() {
  return (process.env.ADMIN_ALLOWED_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export default async function handler(req, res) {
  if (!methodGuard(req, res, ['POST'])) return;

  const ip = getClientIp(req);
  const rl = checkRateLimit(`login:${ip}`, 8, 60_000);
  if (!rl.allowed) {
    res.status(429).json({ error: 'Too many login attempts. Please try again shortly.' });
    return;
  }

  const { email, password } = req.body || {};

  if (!isValidEmail(email) || !isNonEmptyString(password, 200)) {
    res.status(400).json({ error: 'A valid email and password are required.' });
    return;
  }

  const allowed = getAllowedEmails();
  if (allowed.length > 0 && !allowed.includes(email.toLowerCase())) {
    // Do not reveal whether the account exists — generic message.
    res.status(403).json({ error: 'This account is not authorized to access the admin panel.' });
    return;
  }

  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });

  if (error || !data?.session) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  res.status(200).json({
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
    },
    user: {
      id: data.user.id,
      email: data.user.email,
    },
  });
}
