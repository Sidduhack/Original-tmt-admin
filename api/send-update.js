// api/send-update.js
//
// POST /api/send-update
// Body: { video_id: <uuid> }
//
// Manually (re-)sends the "new video" email to all active subscribers.
// Distinct from the auto-send checkbox in publish-video.js so an admin
// can re-trigger a broadcast later without re-publishing.

import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { methodGuard } from './_lib/http.js';
import { requireAuth } from './_lib/auth.js';
import { isUuid } from './_lib/validate.js';
import { broadcastNewVideo } from './_lib/broadcast.js';
import { checkRateLimit } from './_lib/rateLimiter.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, ['POST'])) return;

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const rl = checkRateLimit(`send-update:${auth.user.id}`, 5, 5 * 60_000);
  if (!rl.allowed) {
    return res.status(429).json({ error: 'Please wait a few minutes before sending another broadcast.' });
  }

  const { video_id } = req.body || {};
  if (!isUuid(video_id)) return res.status(400).json({ error: 'A valid video_id is required.' });

  const { data: video, error } = await supabaseAdmin.from('videos').select('*').eq('id', video_id).single();
  if (error || !video) return res.status(404).json({ error: 'Video not found.' });

  const result = await broadcastNewVideo(video);
  res.status(200).json({ result });
}
