// api/_lib/auth.js
//
// requireAuth(req) verifies the Supabase session JWT sent by the admin
// frontend in the `Authorization: Bearer <access_token>` header, then
// checks the resulting email against the ADMIN_ALLOWED_EMAILS allowlist.
//
// Usage inside any /api/*.js handler:
//
//   import { requireAuth } from './_lib/auth.js';
//
//   export default async function handler(req, res) {
//     const auth = await requireAuth(req, res);
//     if (!auth) return; // requireAuth already sent the 401/403 response
//     // ... auth.user is the authenticated Supabase user
//   }

import { supabaseAdmin } from './supabaseAdmin.js';

function getAllowedEmails() {
  return (process.env.ADMIN_ALLOWED_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function getBearerToken(req) {
  const header = req.headers['authorization'] || req.headers['Authorization'];
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

/**
 * Verifies the request is from an authenticated, allow-listed admin.
 * On failure, writes the appropriate error response and returns null.
 * On success, returns { user, token }.
 */
export async function requireAuth(req, res) {
  const token = getBearerToken(req);

  if (!token) {
    res.status(401).json({ error: 'Missing Authorization header.' });
    return null;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data?.user) {
    res.status(401).json({ error: 'Invalid or expired session.' });
    return null;
  }

  const allowed = getAllowedEmails();
  const email = (data.user.email || '').toLowerCase();

  if (allowed.length > 0 && !allowed.includes(email)) {
    res.status(403).json({ error: 'This account is not authorized to access the admin panel.' });
    return null;
  }

  return { user: data.user, token };
}
