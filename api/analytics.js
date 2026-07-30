// api/analytics.js
//
// GET /api/analytics?range=7d|30d|90d
//
// Returns aggregated time-series + breakdowns for the dashboard/analytics
// charts, computed from the `analytics` rollup table. Also returns
// current totals for subscribers/videos/feedback/downloads used by the
// dashboard summary cards.

import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { methodGuard } from './_lib/http.js';
import { requireAuth } from './_lib/auth.js';

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 };

export default async function handler(req, res) {
  if (!methodGuard(req, res, ['GET'])) return;

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const range = RANGE_DAYS[req.query.range] ? req.query.range : '30d';
  const days = RANGE_DAYS[range];
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data: rows, error } = await supabaseAdmin
    .from('analytics')
    .select('*')
    .gte('date', since.toISOString().slice(0, 10))
    .order('date', { ascending: true });

  if (error) {
    console.error('[analytics:get]', error);
    return res.status(500).json({ error: 'Failed to load analytics.' });
  }

  const byDate = new Map();
  const byCountry = new Map();
  const byDevice = new Map();

  for (const row of rows || []) {
    const d = row.date;
    if (!byDate.has(d)) byDate.set(d, { date: d, visitors: 0, page_views: 0, video_clicks: 0, downloads: 0 });
    const bucket = byDate.get(d);
    bucket.visitors += row.visitors || 0;
    bucket.page_views += row.page_views || 0;
    bucket.video_clicks += row.video_clicks || 0;
    bucket.downloads += row.downloads || 0;

    if (row.country) byCountry.set(row.country, (byCountry.get(row.country) || 0) + (row.visitors || 0));
    if (row.device) byDevice.set(row.device, (byDevice.get(row.device) || 0) + (row.visitors || 0));
  }

  const [subs, videos, feedback, downloads, latestSub, latestFeedback, latestVideo] = await Promise.all([
    supabaseAdmin.from('subscribers').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('videos').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('feedback').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('downloads').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('subscribers').select('email, subscribed_at').order('subscribed_at', { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from('feedback').select('name, message, created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from('videos').select('title, created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  res.status(200).json({
    range,
    timeseries: Array.from(byDate.values()),
    countries: Array.from(byCountry.entries()).map(([country, visitors]) => ({ country, visitors })),
    devices: Array.from(byDevice.entries()).map(([device, visitors]) => ({ device, visitors })),
    totals: {
      subscribers: subs.count || 0,
      videos: videos.count || 0,
      feedback: feedback.count || 0,
      downloads: downloads.count || 0,
    },
    latest: {
      subscriber: latestSub.data || null,
      feedback: latestFeedback.data || null,
      video: latestVideo.data || null,
    },
  });
}
