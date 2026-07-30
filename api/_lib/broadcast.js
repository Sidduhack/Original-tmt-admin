// api/_lib/broadcast.js
//
// Shared logic to email every active subscriber about a newly published
// video. Used by both /api/publish-video.js (send-on-publish checkbox)
// and /api/send-update.js (manual re-send / resend button).

import { supabaseAdmin } from './supabaseAdmin.js';
import { sendEmail } from './email/index.js';
import { newVideoEmailTemplate } from './email/templates.js';

const BATCH_SIZE = 25; // keep well under typical provider per-request limits

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Sends the "new video" email to every active subscriber and logs the
 * result in `sent_videos`.
 * @param {object} video row from `videos`
 * @returns {Promise<{ success: boolean, recipients: number, failed: number }>}
 */
export async function broadcastNewVideo(video) {
  const siteUrl = process.env.PUBLIC_SITE_URL || 'https://tmtofficial.com';

  const [{ data: subscribers, error: subErr }, { data: settings }] = await Promise.all([
    supabaseAdmin.from('subscribers').select('email').eq('is_active', true),
    supabaseAdmin.from('settings').select('*').limit(1).single(),
  ]);

  if (subErr) {
    await logSentVideo(video.id, 0, 'failed', subErr.message);
    return { success: false, recipients: 0, failed: 0, error: subErr.message };
  }

  const emails = (subscribers || []).map((s) => s.email).filter(Boolean);
  if (emails.length === 0) {
    await logSentVideo(video.id, 0, 'sent', null);
    return { success: true, recipients: 0, failed: 0 };
  }

  let failed = 0;
  const batches = chunk(emails, BATCH_SIZE);

  for (const batch of batches) {
    const results = await Promise.all(
      batch.map((email) => {
        const unsubscribeUrl = `${siteUrl}/unsubscribe?email=${encodeURIComponent(email)}`;
        const html = newVideoEmailTemplate({ video, settings, unsubscribeUrl });
        return sendEmail({
          to: email,
          subject: '🔥 New TMT OFFICIAL Video',
          html,
        });
      })
    );
    failed += results.filter((r) => !r.success).length;
  }

  const status = failed === 0 ? 'sent' : failed === emails.length ? 'failed' : 'partial';
  await logSentVideo(video.id, emails.length - failed, status, null);

  return { success: failed < emails.length, recipients: emails.length - failed, failed };
}

async function logSentVideo(videoId, recipientsCount, status, errorMessage) {
  await supabaseAdmin.from('sent_videos').insert({
    video_id: videoId,
    recipients_count: recipientsCount,
    status,
    error_message: errorMessage,
  });
}
