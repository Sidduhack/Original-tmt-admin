// api/_lib/email/index.js
//
// Provider-agnostic email entry point. Every caller in the codebase
// imports `sendEmail` from HERE, never from a specific provider file.
//
// Which provider actually sends is chosen at runtime via the
// EMAIL_PROVIDER env var ("brevo" | "resend"), so you can switch
// providers — or bump to a paid plan on either — without touching code.
// Defaults to Brevo since its free tier (300/day, no expiry) is the
// most generous permanent option as of mid-2026.
//
// To add a new provider: write a file (e.g. `mailgun.js`) that exports
// an async `sendEmail({ to, subject, html })` with the same return
// shape ({ success, id?, error? }), then add a case below.

import { sendEmail as sendViaBrevo } from './brevo.js';
import { sendEmail as sendViaResend } from './resend.js';

export async function sendEmail(args) {
  const provider = (process.env.EMAIL_PROVIDER || 'brevo').toLowerCase();

  switch (provider) {
    case 'resend':
      return sendViaResend(args);
    case 'brevo':
      return sendViaBrevo(args);
    default:
      return { success: false, error: `Unknown EMAIL_PROVIDER "${provider}". Use "brevo" or "resend".` };
  }
}
