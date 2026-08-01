// api/public/subscribe.js
//
// POST /api/public/subscribe
// Body: { email }
//
// No-auth, CORS-enabled endpoint the marketing site's "Notify me" box
// posts to. Writes into the same `subscribers` table the admin panel's
// Subscribers module and the video-broadcast email both read from.
// This was the missing link causing "0 subscribers sent": nothing was
// ever writing real rows into this table.

import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { applyCors } from '../_lib/cors.js';
import { methodGuard } from '../_lib/http.js';
import { isValidEmail, cleanString } from '../_lib/validate.js';
import { checkRateLimit, getClientIp } from '../_lib/rateLimiter.js';

export default async function handler(req, res) {
  const shouldContinue = applyCors(req, res);
  if (!shouldContinue) return; // preflight already handled

  if (!methodGuard(req, res, ['POST'])) return;

  const ip = getClientIp(req);
  const rl = checkRateLimit(`public-subscribe:${ip}`, 8, 10 * 60_000);
  if (!rl.allowed) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
  }

  const { email } = req.body || {};

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const cleanEmail = cleanString(email, 320).toLowerCase();

  // Upsert on email: re-subscribing an existing (possibly inactive)
  // address reactivates it instead of erroring on the unique constraint.
  const { error } = await supabaseAdmin
    .from('subscribers')
    .upsert(
      { email: cleanEmail, is_active: true, source: 'website' },
      { onConflict: 'email' }
    );

  if (error) {
    console.error('[public:subscribe]', error);
    return res.status(500).json({ error: 'Failed to subscribe. Please try again.' });
  }

  res.status(201).json({ success: true });
}
