// api/settings.js
//
// GET  /api/settings                    → returns the single settings row
// PUT  /api/settings                    → updates the settings row
// POST /api/settings?action=sign-upload → signed upload URL for logo/favicon/banner (bucket: media)

import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { methodGuard } from './_lib/http.js';
import { requireAuth } from './_lib/auth.js';
import { isNonEmptyString, isValidEmail, isValidUrl, cleanString } from './_lib/validate.js';

const BUCKET = 'media';

export default async function handler(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'PUT') return handlePut(req, res);
  if (req.method === 'POST' && req.query.action === 'sign-upload') return handleSignUpload(req, res);

  return methodGuard(req, res, ['GET', 'PUT', 'POST']);
}

async function handleGet(req, res) {
  const { data, error } = await supabaseAdmin.from('settings').select('*').limit(1).single();

  if (error) {
    console.error('[settings:get]', error);
    return res.status(500).json({ error: 'Failed to load settings.' });
  }

  res.status(200).json({ settings: data });
}

async function handlePut(req, res) {
  const body = req.body || {};
  const fields = [
    'website_name', 'logo_url', 'favicon_url', 'footer_text', 'hero_banner_url',
    'youtube_url', 'instagram_url', 'discord_url', 'contact_email',
    'seo_title', 'seo_description', 'theme',
  ];

  const updates = { updated_at: new Date().toISOString() };

  for (const field of fields) {
    if (body[field] === undefined) continue;
    const value = body[field];

    if (field === 'contact_email' && value && !isValidEmail(value)) {
      return res.status(400).json({ error: 'Contact email is invalid.' });
    }
    if (field.endsWith('_url') && value && !isValidUrl(value)) {
      return res.status(400).json({ error: `${field.replace(/_/g, ' ')} must be a valid URL.` });
    }
    if (field === 'website_name' && value !== '' && !isNonEmptyString(value, 200)) {
      return res.status(400).json({ error: 'Website name is invalid.' });
    }

    updates[field] = typeof value === 'string' ? cleanString(value, 5000) : value;
  }

  const { data: existing } = await supabaseAdmin.from('settings').select('id').limit(1).single();

  const { data, error } = existing
    ? await supabaseAdmin.from('settings').update(updates).eq('id', existing.id).select().single()
    : await supabaseAdmin.from('settings').insert(updates).select().single();

  if (error) {
    console.error('[settings:put]', error);
    return res.status(500).json({ error: 'Failed to save settings.' });
  }

  res.status(200).json({ settings: data });
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
    console.error('[settings:sign-upload]', error);
    return res.status(500).json({ error: 'Failed to create upload URL.' });
  }

  const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);

  res.status(200).json({ signedUrl: data.signedUrl, token: data.token, path, publicUrl: pub.publicUrl });
}
