// api/publish-video.js
//
// POST /api/publish-video
// Body: { id: <uuid>, sendEmail: boolean }
//
// Marks a video as published (published_at = now) and, if sendEmail is
// true, triggers the subscriber broadcast via /api/send-update logic
// (called directly as a function, not over HTTP, to share one request's
// auth context and avoid an extra network hop).

import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { methodGuard } from './_lib/http.js';
import { requireAuth } from './_lib/auth.js';
import { isUuid } from './_lib/validate.js';
import { broadcastNewVideo } from './_lib/broadcast.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, ['POST'])) return;

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { id, sendEmail } = req.body || {};
  if (!isUuid(id)) return res.status(400).json({ error: 'A valid video id is required.' });

  const { data: video, error: fetchErr } = await supabaseAdmin
    .from('videos')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr || !video) {
    return res.status(404).json({ error: 'Video not found.' });
  }

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('videos')
    .update({
      published: true,
      published_at: video.published_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (updateErr) {
    console.error('[publish-video]', updateErr);
    return res.status(500).json({ error: 'Failed to publish video.' });
  }

  let emailResult = null;
  if (sendEmail === true) {
    emailResult = await broadcastNewVideo(updated);
  }

  res.status(200).json({ video: updated, emailResult });
}
