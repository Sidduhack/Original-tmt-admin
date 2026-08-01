// admin/js/auth.js
//
// Session management + a single `apiFetch()` used by every module to
// call the /api/* serverless functions with the current Supabase access
// token attached. Also guards every protected admin page.

import { supabase, API_BASE } from './config.js';

let cachedUser = null;

/** Returns the current Supabase session, refreshing if needed. */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session;
}

export async function getCurrentUser() {
  if (cachedUser) return cachedUser;
  const session = await getSession();
  cachedUser = session?.user || null;
  return cachedUser;
}

/**
 * Call this at the top of every protected page (index.html and friends).
 * Redirects to login.html if there is no valid session, or if the
 * server rejects the token (e.g. the account was removed from the
 * allowlist after the token was issued).
 */
export async function guardPage() {
  const session = await getSession();
  if (!session) {
    redirectToLogin();
    return null;
  }

  try {
    const res = await fetch(`${API_BASE}/verify-session`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      // Critical: clear the locally cached session before redirecting.
      // Otherwise login.html sees a "session" still sitting in
      // localStorage, immediately bounces back to index.html, which
      // rejects it again — an infinite redirect loop.
      await supabase.auth.signOut().catch(() => {});
      redirectToLogin(body.error);
      return null;
    }
    const body = await res.json();
    cachedUser = body.user;
    return body.user;
  } catch {
    await supabase.auth.signOut().catch(() => {});
    redirectToLogin();
    return null;
  }
}

function redirectToLogin(reason) {
  const next = encodeURIComponent(location.pathname + location.search);
  const reasonParam = reason ? `&reason=${encodeURIComponent(reason)}` : '';
  location.href = `/admin/login.html?next=${next}${reasonParam}`;
}

export async function logout() {
  const session = await getSession();
  try {
    if (session) {
      await fetch(`${API_BASE}/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
    }
  } finally {
    await supabase.auth.signOut();
    cachedUser = null;
    location.href = '/admin/login.html';
  }
}

/**
 * Authenticated fetch wrapper for all /api/* calls.
 * Automatically attaches the Bearer token and parses JSON.
 * Throws an Error with a user-friendly `.message` on failure.
 */
export async function apiFetch(path, options = {}) {
  const session = await getSession();
  if (!session) {
    redirectToLogin();
    throw new Error('Not authenticated.');
  }

  const isFormData = options.body instanceof FormData;
  const headers = {
    Authorization: `Bearer ${session.access_token}`,
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body: options.body && !isFormData && typeof options.body !== 'string'
      ? JSON.stringify(options.body)
      : options.body,
  });

  if (res.status === 401 || res.status === 403) {
    if (res.status === 401) {
      await supabase.auth.signOut().catch(() => {});
      redirectToLogin();
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Not authorized.');
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (!res.ok) throw new Error('Request failed.');
    return res; // e.g. CSV download — caller handles the raw response
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || 'Something went wrong. Please try again.');
  }
  return body;
}
