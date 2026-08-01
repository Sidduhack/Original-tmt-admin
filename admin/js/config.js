// admin/js/config.js
//
// Public, client-safe configuration. Only the Supabase URL and ANON key
// live here — both are meant to be public per Supabase's security model
// (Row Level Security enforces the real access control). The service
// role key is never referenced anywhere under /admin.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

// TODO(deploy): replace with your project's values, or better, render
// these two lines server-side from env vars if you add a templating
// step to your build. Hardcoding here is safe because both are public.
export const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'tmt-admin-auth',
  },
});

export const API_BASE = '/api';

export const APP_NAME = 'TMT OFFICIAL';
