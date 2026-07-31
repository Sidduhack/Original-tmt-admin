// api/public/videos.js
//
// GET /api/public/videos?limit=12&featured=true
//
// Public, unauthenticated endpoint for tmtofficial.in to fetch published
// videos. Only rows with published = true are ever returned here — the
// full unpublished catalog stays behind admin auth in /api/videos.js.

import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { methodGuard } from '../_lib/http.js';
import { applyCors } from '../_lib/cors.js';

export default async function handler(req, res) {
  if (!applyCors(req, res)) return;
  if (!methodGuard(req, res, ['GET'])) return;

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
