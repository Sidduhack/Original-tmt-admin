// api/public/feedback.js
//
// POST /api/public/feedback   Body: { name, email?, message }
//
// Public, unauthenticated endpoint backing the contact form on
// tmtofficial.in. Submissions show up in the admin panel's Feedback tab.
// Rate-limited per IP to blunt spam.

import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { methodGuard } from '../_lib/http.js';
import { applyCors } from '../_lib/cors.js';
import { checkRateLimit, getClientIp } from '../_lib/rateLimiter.js';
import { isNonEmptyString, isValidEmail, cleanString } from '../_lib/validate.js';

export default async function handler(req, res) {
  if (!applyCors(req, res)) return;
  if (!methodGuard(req, res, ['POST'])) return;

  const ip = getClientIp(req);
  const rl = checkRateLimit(`feedback:${ip}`, 5, 60_000);
  if (!rl.allowed) {
    return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
  }

  const { name, email, message } = req.body || {};

  if (!isNonEmptyString(name, 200)) {
    return res.status(400).json({ error: 'Name is required.' });
  }
  if (!isNonEmptyString(message, 5000)) {
    return res.status(400).json({ error: 'Message is required.' });
  }
  if (email && !isValidEmail(email)) {
    return res.status(400).json({ error: 'Email address is invalid.' });
  }

  const { error } = await supabaseAdmin.from('feedback').insert({
    name: cleanString(name, 200),
    email: email ? cleanString(email, 320).toLowerCase() : null,
    message: cleanString(message, 5000),
  });

  if (error) {
    console.error('[public/feedback]', error);
    return res.status(500).json({ error: 'Failed to send message. Please try again.' });
  }

  res.status(200).json({ success: true });
}
