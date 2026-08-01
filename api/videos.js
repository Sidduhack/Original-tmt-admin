// api/videos.js
//
// GET    /api/videos?search=&page=&pageSize=   → paginated list
// POST   /api/videos                            → create a new (unpublished) video
// PATCH  /api/videos?id=<uuid>                  → update a video's fields
//
// Publishing (with optional subscriber email blast) is handled by
// /api/publish-video.js. Deletion is handled by /api/delete-video.js.

import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { methodGuard } from './_lib/http.js';
import { requireAuth } from './_lib/auth.js';
import {
  isNonEmptyString,
  isValidYoutubeUrl,
  isValidUrl,
  isUuid,
  cleanString,
  parsePagination,
} from './_lib/validate.js';

export default async function handler(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  if (req.method === 'PATCH') return handleUpdate(req, res);

  return methodGuard(req, res, ['GET', 'POST', 'PATCH']);
}

async function handleList(req, res) {
  const { search = '' } = req.query;
  const { page, pageSize, from, to } = parsePagination(req.query);

  let query = supabaseAdmin
    .from('videos')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (isNonEmptyString(search, 200)) {
    query = query.ilike('title', `%${cleanString(search, 200)}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[videos:list]', error);
    return res.status(500).json({ error: 'Failed to load videos.' });
  }

  res.status(200).json({ videos: data, total: count, page, pageSize });
}

async function handleCreate(req, res) {
  const { title, description, youtube_url, thumbnail_url, is_featured } = req.body || {};

  if (!isNonEmptyString(title, 200)) {
    return res.status(400).json({ error: 'Title is required.' });
  }
  if (!isValidYoutubeUrl(youtube_url)) {
    return res.status(400).json({ error: 'A valid YouTube URL is required.' });
  }
  if (thumbnail_url && !isValidUrl(thumbnail_url)) {
    return res.status(400).json({ error: 'Thumbnail URL is invalid.' });
  }

  const { data, error } = await supabaseAdmin
    .from('videos')
    .insert({
      title: cleanString(title, 200),
      description: cleanString(description || '', 5000),
      youtube_url: cleanString(youtube_url, 2048),
      thumbnail_url: thumbnail_url ? cleanString(thumbnail_url, 2048) : null,
      is_featured: !!is_featured,
      published: false,
    })
    .select()
    .single();

  if (error) {
    console.error('[videos:create]', error);
    return res.status(500).json({ error: 'Failed to create video.' });
  }

  res.status(201).json({ video: data });
}

async function handleUpdate(req, res) {
  const { id } = req.query;
  if (!isUuid(id)) return res.status(400).json({ error: 'A valid video id is required.' });

  const { title, description, youtube_url, thumbnail_url, is_featured } = req.body || {};
  const updates = { updated_at: new Date().toISOString() };

  if (title !== undefined) {
    if (!isNonEmptyString(title, 200)) return res.status(400).json({ error: 'Title cannot be empty.' });
    updates.title = cleanString(title, 200);
  }
  if (description !== undefined) updates.description = cleanString(description, 5000);
  if (youtube_url !== undefined) {
    if (!isValidYoutubeUrl(youtube_url)) return res.status(400).json({ error: 'A valid YouTube URL is required.' });
    updates.youtube_url = cleanString(youtube_url, 2048);
  }
  if (thumbnail_url !== undefined) {
    if (thumbnail_url && !isValidUrl(thumbnail_url)) return res.status(400).json({ error: 'Thumbnail URL is invalid.' });
    updates.thumbnail_url = thumbnail_url ? cleanString(thumbnail_url, 2048) : null;
  }
  if (is_featured !== undefined) updates.is_featured = !!is_featured;

  const { data, error } = await supabaseAdmin
    .from('videos')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[videos:update]', error);
    return res.status(500).json({ error: 'Failed to update video.' });
  }

  res.status(200).json({ video: data });
}
