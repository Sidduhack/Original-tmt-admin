// api/public/[action].js
//
// Vercel's bracket syntax makes this ONE function handle THREE routes:
//   GET  /api/public/videos      -> action === 'videos'
//   POST /api/public/feedback    -> action === 'feedback'
//   POST /api/public/subscribe   -> action === 'subscribe'
//
// This replaces the earlier api/public/videos.js, api/public/feedback.js,
// and api/public/subscribe.js (delete those 3 files) — merged purely to
// save serverless-function slots on the Hobby plan. The public site's
// existing fetch calls to these exact URLs do not need to change at all.

import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { applyCors } from '../_lib/cors.js';
import { methodGuard } from '../_lib/http.js';
import { isNonEmptyString, isValidEmail, cleanString } from '../_lib/validate.js';
import { checkRateLimit, getClientIp } from '../_lib/rateLimiter.js';

export default async function handler(req, res) {
  const shouldContinue = applyCors(req, res);
  if (!shouldContinue) return; // preflight already handled

  const { action } = req.query;

  if (action === 'videos') return handleVideos(req, res);
  if (action === 'feedback') return handleFeedback(req, res);
  if (action === 'subscribe') return handleSubscribe(req, res);

  return res.status(404).json({ error: 'Unknown public endpoint.' });
}

// ---------------------------------------------------------------------
// GET /api/public/videos?limit=24
// ---------------------------------------------------------------------
async function handleVideos(req, res) {
  if (!methodGuard(req, res, ['GET'])) return;

  let limit = parseInt(req.query.limit, 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 24;
  limit = Math.min(limit, 50);

  const { data, error } = await supabaseAdmin
    .from('videos')
    .select('id, title, description, youtube_url, thumbnail_url, is_featured, published_at')
    .eq('published', true)
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[public:videos]', error);
    return res.status(500).json({ error: 'Failed to load videos.' });
  }

  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.status(200).json({ videos: data });
}

// ---------------------------------------------------------------------
// POST /api/public/feedback   Body: { name, email, message }
// ---------------------------------------------------------------------
async function handleFeedback(req, res) {
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

// ---------------------------------------------------------------------
// POST /api/public/subscribe   Body: { email }
// ---------------------------------------------------------------------
async function handleSubscribe(req, res) {
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

