// api/feedback.js
//
// GET    /api/feedback?search=&filter=all|read|unread&page=&pageSize=
// PATCH  /api/feedback?id=<uuid>     Body: { is_read: boolean }
// DELETE /api/feedback?id=<uuid>
// POST   /api/feedback?action=reply Body: { id, message }  → emails the sender back

import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { methodGuard } from './_lib/http.js';
import { requireAuth } from './_lib/auth.js';
import { sendEmail } from './_lib/email/index.js';
import { feedbackReplyTemplate } from './_lib/email/templates.js';
import { checkRateLimit } from './_lib/rateLimiter.js';
import { isNonEmptyString, isUuid, cleanString, parsePagination } from './_lib/validate.js';

export default async function handler(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'PATCH') return handlePatch(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);
  if (req.method === 'POST' && req.query.action === 'reply') return handleReply(req, res, auth);

  return methodGuard(req, res, ['GET', 'PATCH', 'DELETE', 'POST']);
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

async function handleReply(req, res, auth) {
  const rl = checkRateLimit(`feedback-reply:${auth.user.id}`, 20, 5 * 60_000);
  if (!rl.allowed) {
    return res.status(429).json({ error: 'Too many replies sent recently. Please wait a few minutes.' });
  }

  const { id, message } = req.body || {};
  if (!isUuid(id)) return res.status(400).json({ error: 'A valid feedback id is required.' });
  if (!isNonEmptyString(message, 5000)) {
    return res.status(400).json({ error: 'A reply message is required.' });
  }

  const { data: item, error: fetchErr } = await supabaseAdmin
    .from('feedback')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr || !item) {
    return res.status(404).json({ error: 'Feedback message not found.' });
  }
  if (!item.email) {
    return res.status(400).json({ error: 'This message has no email address to reply to.' });
  }

  const { data: settings } = await supabaseAdmin.from('settings').select('*').limit(1).single();

  const replyText = cleanString(message, 5000);
  const html = feedbackReplyTemplate({
    originalMessage: item.message,
    replyMessage: replyText,
    recipientName: item.name,
    settings,
  });

  const result = await sendEmail({
    to: item.email,
    subject: `Re: your message to ${settings?.website_name || 'TMT OFFICIAL'}`,
    html,
  });

  if (!result.success) {
    console.error('[feedback:reply] send failed', result.error);
    return res.status(502).json({ error: result.error || 'Failed to send reply email.' });
  }

  // Best-effort: record the reply and mark as read. If the reply_message /
  // replied_at columns haven't been migrated in yet, don't fail the
  // request — the email already sent successfully.
  const { error: updateErr } = await supabaseAdmin
    .from('feedback')
    .update({ is_read: true, reply_message: replyText, replied_at: new Date().toISOString() })
    .eq('id', id);

  if (updateErr) {
    console.warn('[feedback:reply] email sent but failed to record reply:', updateErr.message);
  }

  res.status(200).json({ success: true });
}
