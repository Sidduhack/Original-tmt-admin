// api/_lib/email/index.js
//
// Provider-agnostic email entry point. Every caller in the codebase
// imports `sendEmail` from HERE, never from a specific provider file.
// To switch providers (e.g. to Gmail via nodemailer), write a new file
// (e.g. `gmail.js`) that exports an async `sendEmail({ to, subject, html })`
// function with the same return shape, then change the single import
// line below. No other file needs to change.

export { sendEmail } from './resend.js';
