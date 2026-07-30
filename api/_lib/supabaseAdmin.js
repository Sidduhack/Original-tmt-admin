// api/_lib/supabaseAdmin.js
//
// Server-only Supabase client using the SERVICE ROLE key.
// This file must never be imported from anything served to the browser.
// It bypasses Row Level Security, so every function that uses it is
// responsible for its own authorization checks (see auth.js -> requireAuth).

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  // Fail loudly at cold start rather than silently at request time.
  console.error('[supabaseAdmin] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.');
}

export const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
