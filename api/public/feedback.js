// api/public/feedback.js
//
// POST /api/public/feedback
// Body: { name, email, message }
//
// No-auth, CORS-enabled endpoint the marketing site's contact form
// posts to. Writes into the same `feedback` table the admin panel's
// Feedback module (with its reply feature) already reads.

import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { applyCors } from '../_lib/cors.js';
import { methodGuard } from '../_lib/http.js';
import { isNonEmptyString, isValidEmail, cleanString } from '../_lib/validate.js';
import { checkRateLimit, getClientIp } from '../_lib/rateLimiter.js';

export default async function handler(req, res) {
  const shouldContinue = applyCors(req, res);
  if (!shouldContinue) return; // preflight already handled

  if (!methodGuard(req, res, ['POST'])) return;

  const ip = getClientIp(req);
  const rl = checkRateLimit(`public-feedback:${ip}`, 5, 10 * 60_000);
  if (!rl.allowed) {
    return res.status(429).json({ error: 'Too many messages sent. Please try again later.' });
  }

  const { name, email, message } = req.body || {};

  if (!isNonEmptyString(name, 150)) {
    return res.status(400).json({ error: 'Please enter your name.' });
  }
  if (email && !isValidEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (!isNonEmptyString(message, 4000)) {
    return res.status(400).json({ error: 'Please enter a message.' });
  }

  const { error } = await supabaseAdmin.from('feedback').insert({
    name: cleanString(name, 150),
    email: email ? cleanString(email, 320) : null,
    message: cleanString(message, 4000),
    is_read: false,
  });

  if (error) {
    console.error('[public:feedback]', error);
    return res.status(500).json({ error: 'Failed to send your message. Please try again.' });
  }

  res.status(201).json({ success: true });
}
