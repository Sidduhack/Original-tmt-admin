// api/delete-video.js
//
// DELETE /api/delete-video?id=<uuid>

import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { methodGuard } from './_lib/http.js';
import { requireAuth } from './_lib/auth.js';
import { isUuid } from './_lib/validate.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, ['DELETE'])) return;

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { id } = req.query;
  if (!isUuid(id)) return res.status(400).json({ error: 'A valid video id is required.' });

  const { error } = await supabaseAdmin.from('videos').delete().eq('id', id);

  if (error) {
    console.error('[delete-video]', error);
    return res.status(500).json({ error: 'Failed to delete video.' });
  }

  res.status(200).json({ success: true });
}
