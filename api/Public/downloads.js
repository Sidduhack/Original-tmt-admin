// api/public/downloads.js
//
// GET /api/public/downloads?category=
//
// Public, unauthenticated endpoint for tmtofficial.in's Downloads section.

import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { methodGuard } from '../_lib/http.js';
import { applyCors } from '../_lib/cors.js';
import { isNonEmptyString, cleanString } from '../_lib/validate.js';

export default async function handler(req, res) {
  if (!applyCors(req, res)) return;
  if (!methodGuard(req, res, ['GET'])) return;

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
