// api/public/subscribe.js
//
// POST /api/public/subscribe   Body: { email, name? }
//
// Public, unauthenticated endpoint backing the "Notify me" / newsletter
// form on tmtofficial.in. Rate-limited per IP to blunt abuse.

import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { methodGuard } from '../_lib/http.js';
import { applyCors } from '../_lib/cors.js';
import { checkRateLimit, getClientIp } from '../_lib/rateLimiter.js';
import { isValidEmail, isNonEmptyString, cleanString } from '../_lib/validate.js';

export default async function handler(req, res) {
  if (!applyCors(req, res)) return;
  if (!methodGuard(req, res, ['POST'])) return;

  const ip = getClientIp(req);
  const rl = checkRateLimit(`subscribe:${ip}`, 5, 60_000);
  if (!rl.allowed) {
    return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
  }

  const { email, name } = req.body || {};

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  const cleanEmail = cleanString(email, 320).toLowerCase();
  const cleanName = isNonEmptyString(name, 200) ? cleanString(name, 200) : null;

  // Upsert so re-subscribing (or subscribing again after unsubscribing)
  // just reactivates the existing row instead of erroring on the unique
  // email constraint.
  const { error } = await supabaseAdmin
    .from('subscribers')
    .upsert(
      { email: cleanEmail, name: cleanName, is_active: true, source: 'website' },
      { onConflict: 'email' }
    );

  if (error) {
    console.error('[public/subscribe]', error);
    return res.status(500).json({ error: 'Failed to subscribe. Please try again.' });
  }

  res.status(200).json({ success: true });
}
