// api/downloads.js
//
// GET    /api/downloads?search=&category=&page=&pageSize=
// POST   /api/downloads?action=sign-upload   Body: { fileName }         → returns a signed Supabase Storage upload URL
// POST   /api/downloads                      Body: { title, ... }       → create the DB record after upload completes
// PATCH  /api/downloads?id=<uuid>                                       → edit metadata, or { increment: true } to bump download_count
// DELETE /api/downloads?id=<uuid>                                       → removes DB row + storage object
//
// Upload flow (large files never pass through the serverless function body):
//   1. Client calls POST ?action=sign-upload with the file name.
//   2. Server returns a short-lived signed upload URL/token from Supabase Storage.
//   3. Client uploads the file bytes directly to Supabase Storage using that token.
//   4. Client calls POST /api/downloads with the resulting metadata to create the DB row.

import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { methodGuard } from './_lib/http.js';
import { requireAuth } from './_lib/auth.js';
import { isNonEmptyString, isUuid, cleanString, parsePagination } from './_lib/validate.js';

const BUCKET = 'downloads';

export default async function handler(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST' && req.query.action === 'sign-upload') return handleSignUpload(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  if (req.method === 'PATCH') return handleUpdate(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);

  return methodGuard(req, res, ['GET', 'POST', 'PATCH', 'DELETE']);
}

async function handleList(req, res) {
  const { search = '', category = '' } = req.query;
  const { page, pageSize, from, to } = parsePagination(req.query);

  let query = supabaseAdmin
    .from('downloads')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (isNonEmptyString(search, 200)) query = query.ilike('title', `%${cleanString(search, 200)}%`);
  if (isNonEmptyString(category, 100)) query = query.eq('category', cleanString(category, 100));

  const { data, error, count } = await query;

  if (error) {
    console.error('[downloads:list]', error);
    return res.status(500).json({ error: 'Failed to load downloads.' });
  }

  res.status(200).json({ downloads: data, total: count, page, pageSize });
}

async function handleSignUpload(req, res) {
  const { fileName } = req.body || {};
  if (!isNonEmptyString(fileName, 255)) {
    return res.status(400).json({ error: 'fileName is required.' });
  }

  const safeName = cleanString(fileName, 255).replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${Date.now()}-${safeName}`;

  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(path);

  if (error) {
    console.error('[downloads:sign-upload]', error);
    return res.status(500).json({ error: 'Failed to create upload URL.' });
  }

  const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);

  res.status(200).json({
    signedUrl: data.signedUrl,
    token: data.token,
    path,
    publicUrl: pub.publicUrl,
  });
}

async function handleCreate(req, res) {
  const { title, description, category, file_url, file_path, file_size } = req.body || {};

  if (!isNonEmptyString(title, 200)) return res.status(400).json({ error: 'Title is required.' });
  if (!isNonEmptyString(file_url, 2048) || !isNonEmptyString(file_path, 500)) {
    return res.status(400).json({ error: 'A completed upload (file_url/file_path) is required.' });
  }

  const { data, error } = await supabaseAdmin
    .from('downloads')
    .insert({
      title: cleanString(title, 200),
      description: cleanString(description || '', 2000),
      category: cleanString(category || 'general', 100),
      file_url: cleanString(file_url, 2048),
      file_path: cleanString(file_path, 500),
      file_size: Number.isFinite(Number(file_size)) ? Number(file_size) : null,
    })
    .select()
    .single();

  if (error) {
    console.error('[downloads:create]', error);
    return res.status(500).json({ error: 'Failed to save download.' });
  }

  res.status(201).json({ download: data });
}

async function handleUpdate(req, res) {
  const { id } = req.query;
  if (!isUuid(id)) return res.status(400).json({ error: 'A valid download id is required.' });

  const { title, description, category, increment } = req.body || {};

  if (increment === true) {
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('downloads')
      .select('download_count')
      .eq('id', id)
      .single();
    if (fetchErr || !existing) return res.status(404).json({ error: 'Download not found.' });

    const { data, error } = await supabaseAdmin
      .from('downloads')
      .update({ download_count: (existing.download_count || 0) + 1 })
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: 'Failed to update download count.' });
    return res.status(200).json({ download: data });
  }

  const updates = { updated_at: new Date().toISOString() };
  if (title !== undefined) {
    if (!isNonEmptyString(title, 200)) return res.status(400).json({ error: 'Title cannot be empty.' });
    updates.title = cleanString(title, 200);
  }
  if (description !== undefined) updates.description = cleanString(description, 2000);
  if (category !== undefined) updates.category = cleanString(category, 100);

  const { data, error } = await supabaseAdmin
    .from('downloads')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[downloads:update]', error);
    return res.status(500).json({ error: 'Failed to update download.' });
  }

  res.status(200).json({ download: data });
}

async function handleDelete(req, res) {
  const { id } = req.query;
  if (!isUuid(id)) return res.status(400).json({ error: 'A valid download id is required.' });

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('downloads')
    .select('file_path')
    .eq('id', id)
    .single();

  if (fetchErr || !existing) return res.status(404).json({ error: 'Download not found.' });

  const { error: dbError } = await supabaseAdmin.from('downloads').delete().eq('id', id);
  if (dbError) {
    console.error('[downloads:delete]', dbError);
    return res.status(500).json({ error: 'Failed to delete download record.' });
  }

  if (existing.file_path) {
    await supabaseAdmin.storage.from(BUCKET).remove([existing.file_path]).catch((e) => {
      console.error('[downloads:delete:storage]', e);
    });
  }

  res.status(200).json({ success: true });
}
