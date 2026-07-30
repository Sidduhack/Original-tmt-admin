// api/_lib/email/resend.js
//
// Resend implementation of the sendEmail() contract.
// See email/index.js for the provider-agnostic entry point.

import { Resend } from 'resend';

let client = null;
function getClient() {
  if (!client) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not set.');
    }
    client = new Resend(process.env.RESEND_API_KEY);
  }
  return client;
}

/**
 * @param {{ to: string, subject: string, html: string }} args
 * @returns {Promise<{ success: boolean, id?: string, error?: string }>}
 */
export async function sendEmail({ to, subject, html }) {
  try {
    const resend = getClient();
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'TMT OFFICIAL <onboarding@resend.dev>',
      to,
      subject,
      html,
    });

    if (error) {
      return { success: false, error: error.message || 'Resend send failed.' };
    }
    return { success: true, id: data?.id };
  } catch (err) {
    return { success: false, error: err.message || 'Unknown email error.' };
  }
}
