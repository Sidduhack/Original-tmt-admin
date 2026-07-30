// api/subscribers.js
//
// GET    /api/subscribers?search=&page=&pageSize=&export=csv  → list or CSV export
// DELETE /api/subscribers?id=<uuid>                            → remove a subscriber

import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { methodGuard } from './_lib/http.js';
import { requireAuth } from './_lib/auth.js';
import { isNonEmptyString, isUuid, cleanString, parsePagination } from './_lib/validate.js';

export default async function handler(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);

  return methodGuard(req, res, ['GET', 'DELETE']);
}

async function handleGet(req, res) {
  const { search = '', export: exportType } = req.query;

  let query = supabaseAdmin
    .from('subscribers')
    .select('*', { count: 'exact' })
    .order('subscribed_at', { ascending: false });

  if (isNonEmptyString(search, 200)) {
    query = query.ilike('email', `%${cleanString(search, 200)}%`);
  }

  if (exportType === 'csv') {
    const { data, error } = await query;
    if (error) {
      console.error('[subscribers:export]', error);
      return res.status(500).json({ error: 'Failed to export subscribers.' });
    }
    const csv = toCsv(data || []);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="subscribers.csv"');
    return res.status(200).send(csv);
  }

  const { page, pageSize, from, to } = parsePagination(req.query);
  const { data, error, count } = await query.range(from, to);

  if (error) {
    console.error('[subscribers:list]', error);
    return res.status(500).json({ error: 'Failed to load subscribers.' });
  }

  const { count: activeCount } = await supabaseAdmin
    .from('subscribers')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  res.status(200).json({
    subscribers: data,
    total: count,
    activeCount: activeCount || 0,
    page,
    pageSize,
  });
}

async function handleDelete(req, res) {
  const { id } = req.query;
  if (!isUuid(id)) return res.status(400).json({ error: 'A valid subscriber id is required.' });

  const { error } = await supabaseAdmin.from('subscribers').delete().eq('id', id);

  if (error) {
    console.error('[subscribers:delete]', error);
    return res.status(500).json({ error: 'Failed to delete subscriber.' });
  }

  res.status(200).json({ success: true });
}

function toCsv(rows) {
  const headers = ['email', 'name', 'subscribed_at', 'is_active', 'source'];
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  }
  return lines.join('\n');
}
