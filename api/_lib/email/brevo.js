// api/_lib/email/brevo.js
//
// Brevo (formerly Sendinblue) implementation of the sendEmail() contract.
// See email/index.js for the provider-agnostic entry point.
//
// Free tier: 300 emails/day, no monthly expiry — the most generous
// permanent free option available as of mid-2026, which is why it's
// the default provider (see index.js).
//
// Get an API key at: https://app.brevo.com/settings/keys/api

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

/**
 * Parses a "Name <email@domain.com>" or plain "email@domain.com" string
 * into Brevo's { name, email } sender/recipient shape.
 */
function parseAddress(input) {
  const match = /^(.*?)<(.+)>$/.exec(input || '');
  if (match) {
    return { name: match[1].trim().replace(/^"|"$/g, '') || undefined, email: match[2].trim() };
  }
  return { email: (input || '').trim() };
}

/**
 * @param {{ to: string, subject: string, html: string }} args
 * @returns {Promise<{ success: boolean, id?: string, error?: string }>}
 */
export async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'BREVO_API_KEY is not set.' };
  }

  const sender = parseAddress(process.env.EMAIL_FROM || 'TMT OFFICIAL <onboarding@brevo.com>');

  try {
    const res = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender,
        to: [parseAddress(to)],
        subject,
        htmlContent: html,
      }),
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      return { success: false, error: body?.message || `Brevo request failed (${res.status}).` };
    }

    return { success: true, id: body?.messageId };
  } catch (err) {
    return { success: false, error: err.message || 'Unknown email error.' };
  }
}
