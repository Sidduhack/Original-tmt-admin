// api/feedback.js
//
// GET    /api/feedback?search=&filter=all|read|unread&page=&pageSize=
// PATCH  /api/feedback?id=<uuid>     Body: { is_read: boolean }
// DELETE /api/feedback?id=<uuid>

import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { methodGuard } from './_lib/http.js';
import { requireAuth } from './_lib/auth.js';
import { isNonEmptyString, isUuid, cleanString, parsePagination } from './_lib/validate.js';

export default async function handler(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'PATCH') return handlePatch(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);

  return methodGuard(req, res, ['GET', 'PATCH', 'DELETE']);
}

async function handleGet(req, res) {
  const { search = '', filter = 'all' } = req.query;
  const { page, pageSize, from, to } = parsePagination(req.query);

  let query = supabaseAdmin
    .from('feedback')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (filter === 'read') query = query.eq('is_read', true);
  if (filter === 'unread') query = query.eq('is_read', false);

  if (isNonEmptyString(search, 200)) {
    const term = cleanString(search, 200);
    query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%,message.ilike.%${term}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[feedback:list]', error);
    return res.status(500).json({ error: 'Failed to load feedback.' });
  }

  const { count: unreadCount } = await supabaseAdmin
    .from('feedback')
    .select('*', { count: 'exact', head: true })
    .eq('is_read', false);

  res.status(200).json({ feedback: data, total: count, unreadCount: unreadCount || 0, page, pageSize });
}

async function handlePatch(req, res) {
  const { id } = req.query;
  if (!isUuid(id)) return res.status(400).json({ error: 'A valid feedback id is required.' });

  const { is_read } = req.body || {};
  if (typeof is_read !== 'boolean') {
    return res.status(400).json({ error: 'is_read (boolean) is required.' });
  }

  const { data, error } = await supabaseAdmin
    .from('feedback')
    .update({ is_read })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[feedback:update]', error);
    return res.status(500).json({ error: 'Failed to update feedback.' });
  }

  res.status(200).json({ feedback: data });
}

async function handleDelete(req, res) {
  const { id } = req.query;
  if (!isUuid(id)) return res.status(400).json({ error: 'A valid feedback id is required.' });

  const { error } = await supabaseAdmin.from('feedback').delete().eq('id', id);

  if (error) {
    console.error('[feedback:delete]', error);
    return res.status(500).json({ error: 'Failed to delete feedback.' });
  }

  res.status(200).json({ success: true });
}
