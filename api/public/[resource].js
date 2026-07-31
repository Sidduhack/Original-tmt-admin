// api/public/[resource].js
//
// Dynamic route — this ONE file serves:
//   GET  /api/public/videos?limit=&featured=
//   GET  /api/public/downloads?category=
//   POST /api/public/subscribe   Body: { email, name? }
//   POST /api/public/feedback    Body: { name, email?, message }
//
// It used to be 4 separate files (videos.js, downloads.js, subscribe.js,
// feedback.js), each its own Serverless Function. They're merged into
// this single dynamic-route file to stay under Vercel Hobby's 12-function
// cap, without changing any of the URLs the frontend already calls.

import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { methodGuard } from '../_lib/http.js';
import { applyCors } from '../_lib/cors.js';
import { checkRateLimit, getClientIp } from '../_lib/rateLimiter.js';
import { isValidEmail, isNonEmptyString, cleanString } from '../_lib/validate.js';

export default async function handler(req, res) {
  if (!applyCors(req, res)) return;

  const { resource } = req.query;

  switch (resource) {
    case 'videos':
      if (!methodGuard(req, res, ['GET'])) return;
      return handleVideos(req, res);
    case 'downloads':
      if (!methodGuard(req, res, ['GET'])) return;
      return handleDownloads(req, res);
    case 'subscribe':
      if (!methodGuard(req, res, ['POST'])) return;
      return handleSubscribe(req, res);
    case 'feedback':
      if (!methodGuard(req, res, ['POST'])) return;
      return handleFeedback(req, res);
    default:
      return res.status(404).json({ error: 'Unknown endpoint.' });
  }
}

async function handleVideos(req, res) {
  const limit = Math.min(parseInt(req.query.limit, 10) || 12, 50);
  const featuredOnly = req.query.featured === 'true';

  let query = supabaseAdmin
    .from('videos')
    .select('id, title, description, youtube_url, thumbnail_url, is_featured, published_at, click_count')
    .eq('published', true)
    .order('published_at', { ascending: false })
    .limit(limit);

  if (featuredOnly) query = query.eq('is_featured', true);

  const { data, error } = await query;

  if (error) {
    console.error('[public/videos:list]', error);
    return res.status(500).json({ error: 'Failed to load videos.' });
  }

  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.status(200).json({ videos: data || [] });
}

async function handleDownloads(req, res) {
  const { category = '' } = req.query;

  let query = supabaseAdmin
    .from('downloads')
    .select('id, title, description, category, file_url, download_count, created_at')
    .order('created_at', { ascending: false });

  if (isNonEmptyString(category, 100)) query = query.eq('category', cleanString(category, 100));

  const { data, error } = await query;

  if (error) {
    console.error('[public/downloads:list]', error);
    return res.status(500).json({ error: 'Failed to load downloads.' });
  }

  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.status(200).json({ downloads: data || [] });
}

async function handleSubscribe(req, res) {
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

async function handleFeedback(req, res) {
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
