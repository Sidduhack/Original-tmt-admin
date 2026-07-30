// api/_lib/validate.js
//
// Shared server-side input validation/sanitization helpers.
// The Supabase JS client already parameterizes queries (no SQL injection
// surface), but we still validate shape/type/length here to keep bad data
// out of the database and out of generated HTML emails.

export function isNonEmptyString(v, maxLen = 5000) {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= maxLen;
}

export function isValidEmail(v) {
  if (typeof v !== 'string' || v.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function isValidUrl(v) {
  if (typeof v !== 'string' || v.length > 2048) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isValidYoutubeUrl(v) {
  if (!isValidUrl(v)) return false;
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//.test(v);
}

/** Escapes HTML-significant characters — used before interpolating any
 *  user-supplied string into an email template or server-rendered HTML. */
export function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Strips a value down to a safe, bounded plain string (defense in depth
 *  against unexpectedly large or non-string payloads reaching the DB). */
export function cleanString(v, maxLen = 2000) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, maxLen);
}

export function isUuid(v) {
  return typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export function parsePagination(query) {
  let page = parseInt(query.page, 10);
  let pageSize = parseInt(query.pageSize, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = 10;
  pageSize = Math.min(pageSize, 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return { page, pageSize, from, to };
}
