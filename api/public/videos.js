// api/public/videos.js
//
// GET /api/public/videos?limit=24
//
// No-auth, CORS-enabled endpoint for the public marketing site (see
// api/_lib/cors.js for the allowed-origins list). Returns only
// published videos — matches the existing RLS policy on `videos` that
// already scopes anonymous reads to `published = true`.

import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { applyCors } from '../_lib/cors.js';
import { methodGuard } from '../_lib/http.js';

export default async function handler(req, res) {
  const shouldContinue = applyCors(req, res);
  if (!shouldContinue) return; // preflight already handled

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
