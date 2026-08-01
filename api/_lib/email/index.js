// api/_lib/email/index.js
//
// Provider-agnostic email entry point. Every caller in the codebase
// imports `sendEmail` from HERE, never from a specific provider file.
//
// Points at brevo.js. brevo.js was already added to this project (300
// free emails/day, no monthly expiry) but this file was still importing
// from resend.js — meaning every send was using whichever provider you
// *didn't* set an API key for, and failing silently. Make sure
// BREVO_API_KEY and EMAIL_FROM are set in Vercel.
//
// To switch providers again later, write a new file (e.g. `gmail.js`)
// exporting an async `sendEmail({ to, subject, html })` with the same
// return shape, then change the single import line below.

export { sendEmail } from './brevo.js';
