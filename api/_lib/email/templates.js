// api/_lib/email/templates.js
//
// Generates the HTML body for the "new video" subscriber broadcast.
// Kept table-based / inline-styled for maximum email-client compatibility.

import { escapeHtml } from '../validate.js';

/**
 * @param {object} args
 * @param {object} args.video     Row from the `videos` table
 * @param {object} args.settings  Row from the `settings` table
 * @param {string} args.unsubscribeUrl
 * @returns {string} full HTML document
 */
export function newVideoEmailTemplate({ video, settings, unsubscribeUrl }) {
  const siteUrl = process.env.PUBLIC_SITE_URL || 'https://tmtofficial.com';
  const websiteName = escapeHtml(settings?.website_name || 'TMT OFFICIAL');
  const logo = settings?.logo_url || `${siteUrl}/assets/logo.png`;
  const banner = settings?.hero_banner_url;
  const title = escapeHtml(video?.title || 'New Video');
  const description = escapeHtml(video?.description || '');
  const thumbnail = video?.thumbnail_url || `${siteUrl}/assets/default-thumb.jpg`;
  const watchUrl = video?.youtube_url || siteUrl;
  const footerText = escapeHtml(settings?.footer_text || `© ${websiteName}. All rights reserved.`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#0A0B0F;font-family:'Poppins',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0A0B0F;padding:32px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:600px;background-color:#12141C;border-radius:16px;overflow:hidden;border:1px solid #24263a;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding:28px 24px 8px;">
              <img src="${logo}" alt="${websiteName}" height="40" style="height:40px;object-fit:contain;" />
            </td>
          </tr>

          ${banner ? `
          <!-- Hero Banner -->
          <tr>
            <td style="padding:16px 24px 0;">
              <img src="${banner}" alt="" width="552" style="width:100%;border-radius:12px;display:block;" />
            </td>
          </tr>` : ''}

          <!-- Eyebrow -->
          <tr>
            <td align="center" style="padding:24px 24px 0;">
              <span style="display:inline-block;background:linear-gradient(90deg,#7B5CFF,#00E5C7);color:#0A0B0F;font-weight:700;font-size:12px;letter-spacing:1px;text-transform:uppercase;padding:6px 14px;border-radius:999px;">
                🔥 New Upload
              </span>
            </td>
          </tr>

          <!-- Thumbnail -->
          <tr>
            <td style="padding:16px 24px 0;">
              <a href="${watchUrl}" style="text-decoration:none;">
                <img src="${thumbnail}" alt="${title}" width="552" style="width:100%;border-radius:12px;display:block;border:1px solid #24263a;" />
              </a>
            </td>
          </tr>

          <!-- Title / Description -->
          <tr>
            <td style="padding:20px 28px 0;">
              <h1 style="margin:0 0 12px;color:#EDEEF3;font-size:22px;line-height:1.3;font-family:'Poppins',Arial,sans-serif;">
                ${title}
              </h1>
              <p style="margin:0;color:#8B8FA3;font-size:15px;line-height:1.6;font-family:'Inter',Arial,sans-serif;">
                ${description}
              </p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td align="center" style="padding:28px 24px 8px;">
              <a href="${watchUrl}" style="display:inline-block;background:linear-gradient(90deg,#7B5CFF,#00E5C7);color:#0A0B0F;font-weight:700;font-size:15px;text-decoration:none;padding:14px 32px;border-radius:10px;font-family:'Poppins',Arial,sans-serif;">
                ▶ Watch Now
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:32px 24px 24px;border-top:1px solid #24263a;margin-top:24px;">
              <p style="margin:0 0 8px;color:#5b5f74;font-size:12px;text-align:center;font-family:'Inter',Arial,sans-serif;">
                ${footerText}
              </p>
              <p style="margin:0;color:#5b5f74;font-size:12px;text-align:center;font-family:'Inter',Arial,sans-serif;">
                <a href="${unsubscribeUrl}" style="color:#5b5f74;text-decoration:underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Simple, brand-light transactional template for replying to a contact-form
 * message. Kept plainer than the video broadcast — this is a 1:1 reply,
 * not a marketing email.
 * @param {object} args
 * @param {string} args.originalMessage
 * @param {string} args.replyMessage
 * @param {string} args.recipientName
 * @param {object} args.settings
 */
export function feedbackReplyTemplate({ originalMessage, replyMessage, recipientName, settings }) {
  const siteUrl = process.env.PUBLIC_SITE_URL || 'https://tmtofficial.com';
  const websiteName = escapeHtml(settings?.website_name || 'TMT OFFICIAL');
  const logo = settings?.logo_url || `${siteUrl}/assets/logo.png`;
  const name = escapeHtml(recipientName || 'there');
  const reply = escapeHtml(replyMessage || '').replace(/\n/g, '<br>');
  const original = escapeHtml(originalMessage || '').replace(/\n/g, '<br>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Reply from ${websiteName}</title>
</head>
<body style="margin:0;padding:0;background-color:#0A0B0F;font-family:'Inter',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0A0B0F;padding:32px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background-color:#12141C;border-radius:16px;overflow:hidden;border:1px solid #24263a;">

          <tr>
            <td align="center" style="padding:28px 24px 8px;">
              <img src="${logo}" alt="${websiteName}" height="36" style="height:36px;object-fit:contain;" />
            </td>
          </tr>

          <tr>
            <td style="padding:24px 28px 0;">
              <p style="margin:0 0 4px;color:#8B8FA3;font-size:13px;">Hi ${name},</p>
              <p style="margin:0 0 20px;color:#EDEEF3;font-size:15px;line-height:1.7;">${reply}</p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 28px 24px;">
              <div style="border-left:3px solid #24263a;padding:4px 16px;color:#5b5f74;font-size:13px;line-height:1.6;">
                <p style="margin:0 0 4px;font-weight:600;color:#8B8FA3;">Your original message:</p>
                ${original}
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 24px 24px;border-top:1px solid #24263a;">
              <p style="margin:0;color:#5b5f74;font-size:12px;text-align:center;">
                ${websiteName} · <a href="${siteUrl}" style="color:#5b5f74;text-decoration:underline;">${siteUrl.replace(/^https?:\/\//, '')}</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
