// admin/js/settings.js
//
// Settings module: website name/logo/favicon/footer/hero banner,
// social links, contact email, SEO fields, and theme — all stored in
// the single-row `settings` table.

import { apiFetch } from './auth.js';
import { supabase } from './config.js';
import { escapeHTML, formatBytes } from './utils.js';
import { refreshIcons } from './ui.js';
import { toast } from './notifications.js';

const BUCKET = 'media';
let currentSettings = null;

export async function render(content) {
  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Settings</h2>
        <p>Site-wide branding, links, and SEO for TMT OFFICIAL.</p>
      </div>
    </div>
    <div class="glass-card panel" id="settings-panel">
      <div class="skeleton" style="height:320px;"></div>
    </div>
  `;

  try {
    const data = await apiFetch('/settings');
    currentSettings = data.settings;
  } catch (err) {
    toast.error('Failed to load settings', err.message);
    document.getElementById('settings-panel').innerHTML = `<div class="empty-state"><h3>Couldn\u2019t load settings</h3><p>${escapeHTML(err.message)}</p></div>`;
    return;
  }

  paintForm(currentSettings);
  return () => {};
}

function paintForm(s) {
  const panel = document.getElementById('settings-panel');
  panel.innerHTML = `
    <form id="settings-form">
      <div class="settings-section">
        <h3>Branding</h3>
        <div class="form-grid">
          <div class="field span-2">
            <label for="s-website-name">Website Name</label>
            <input class="input" id="s-website-name" value="${escapeHTML(s.website_name || '')}" />
          </div>

          <div class="field">
            <label>Logo</label>
            ${imageUploadRow('logo_url', s.logo_url)}
          </div>
          <div class="field">
            <label>Favicon</label>
            ${imageUploadRow('favicon_url', s.favicon_url)}
          </div>

          <div class="field span-2">
            <label>Hero Banner</label>
            ${imageUploadRow('hero_banner_url', s.hero_banner_url, true)}
          </div>

          <div class="field span-2">
            <label for="s-footer-text">Footer Text</label>
            <input class="input" id="s-footer-text" value="${escapeHTML(s.footer_text || '')}" />
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h3>Social &amp; Contact</h3>
        <div class="form-grid">
          <div class="field"><label for="s-youtube">YouTube URL</label><input class="input" id="s-youtube" value="${escapeHTML(s.youtube_url || '')}" placeholder="https://youtube.com/@tmtofficial" /></div>
          <div class="field"><label for="s-instagram">Instagram URL</label><input class="input" id="s-instagram" value="${escapeHTML(s.instagram_url || '')}" placeholder="https://instagram.com/tmtofficial" /></div>
          <div class="field"><label for="s-discord">Discord URL</label><input class="input" id="s-discord" value="${escapeHTML(s.discord_url || '')}" placeholder="https://discord.gg/tmtofficial" /></div>
          <div class="field"><label for="s-contact-email">Contact Email</label><input class="input" id="s-contact-email" type="email" value="${escapeHTML(s.contact_email || '')}" placeholder="hello@tmtofficial.com" /></div>
        </div>
      </div>

      <div class="settings-section">
        <h3>SEO</h3>
        <div class="form-grid">
          <div class="field span-2"><label for="s-seo-title">SEO Title</label><input class="input" id="s-seo-title" value="${escapeHTML(s.seo_title || '')}" /></div>
          <div class="field span-2"><label for="s-seo-description">SEO Description</label><textarea class="input" id="s-seo-description">${escapeHTML(s.seo_description || '')}</textarea></div>
        </div>
      </div>

      <div class="settings-section" style="border-bottom:none;margin-bottom:0;">
        <h3>Theme</h3>
        <div class="flex items-center gap-12">
          <label class="switch">
            <input type="checkbox" id="s-theme" ${s.theme === 'light' ? 'checked' : ''} />
            <span class="switch-track"></span>
          </label>
          <span class="checkbox-label">Default site theme: <strong id="s-theme-label">${s.theme === 'light' ? 'Light' : 'Dark'}</strong></span>
        </div>
      </div>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary" id="settings-save-btn"><svg data-lucide="save"></svg> Save Settings</button>
      </div>
    </form>
  `;
  refreshIcons();
  wireUploads(panel);

  panel.querySelector('#s-theme').addEventListener('change', (e) => {
    panel.querySelector('#s-theme-label').textContent = e.target.checked ? 'Light' : 'Dark';
  });

  panel.querySelector('#settings-form').addEventListener('submit', handleSave);
}

function imageUploadRow(field, url, wide = false) {
  return `
    <div class="image-preview-row" data-field="${field}">
      <div class="image-preview-box">
        ${url ? `<img src="${escapeHTML(url)}" alt="" />` : `<svg data-lucide="image"></svg>`}
      </div>
      <div style="flex:1;">
        <label class="btn btn-ghost btn-sm" style="cursor:pointer;">
          <svg data-lucide="upload"></svg> Upload
          <input type="file" accept="image/*" class="hidden" data-upload-input="${field}" />
        </label>
        <input type="hidden" data-upload-value="${field}" value="${escapeHTML(url || '')}" />
        <div class="upload-progress hidden" data-progress="${field}"><div class="upload-progress-bar"></div></div>
      </div>
    </div>
  `;
}

function wireUploads(panel) {
  panel.querySelectorAll('[data-upload-input]').forEach((input) => {
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      const field = input.dataset.uploadInput;
      const row = panel.querySelector(`.image-preview-row[data-field="${field}"]`);
      const progressWrap = row.querySelector(`[data-progress="${field}"]`);
      const progressBar = progressWrap.querySelector('.upload-progress-bar');
      progressWrap.classList.remove('hidden');
      progressBar.style.width = '20%';

      try {
        const signed = await apiFetch('/settings?action=sign-upload', {
          method: 'POST',
          body: { fileName: file.name },
        });
        progressBar.style.width = '55%';

        const { error } = await supabase.storage.from(BUCKET).uploadToSignedUrl(signed.path, signed.token, file);
        if (error) throw new Error(error.message || 'Upload failed.');
        progressBar.style.width = '100%';

        row.querySelector('.image-preview-box').innerHTML = `<img src="${escapeHTML(signed.publicUrl)}" alt="" />`;
        row.querySelector(`[data-upload-value="${field}"]`).value = signed.publicUrl;
        toast.success('Image uploaded', 'Click "Save Settings" to apply.');
      } catch (err) {
        toast.error('Upload failed', err.message);
      } finally {
        setTimeout(() => progressWrap.classList.add('hidden'), 600);
      }
    });
  });
}

async function handleSave(e) {
  e.preventDefault();
  const panel = document.getElementById('settings-panel');
  const btn = panel.querySelector('#settings-save-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';

  const payload = {
    website_name: panel.querySelector('#s-website-name').value.trim(),
    logo_url: panel.querySelector('[data-upload-value="logo_url"]').value || null,
    favicon_url: panel.querySelector('[data-upload-value="favicon_url"]').value || null,
    hero_banner_url: panel.querySelector('[data-upload-value="hero_banner_url"]').value || null,
    footer_text: panel.querySelector('#s-footer-text').value.trim(),
    youtube_url: panel.querySelector('#s-youtube').value.trim() || null,
    instagram_url: panel.querySelector('#s-instagram').value.trim() || null,
    discord_url: panel.querySelector('#s-discord').value.trim() || null,
    contact_email: panel.querySelector('#s-contact-email').value.trim() || null,
    seo_title: panel.querySelector('#s-seo-title').value.trim(),
    seo_description: panel.querySelector('#s-seo-description').value.trim(),
    theme: panel.querySelector('#s-theme').checked ? 'light' : 'dark',
  };

  try {
    const data = await apiFetch('/settings', { method: 'PUT', body: payload });
    currentSettings = data.settings;
    toast.success('Settings saved');
  } catch (err) {
    toast.error('Failed to save settings', err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg data-lucide="save"></svg> Save Settings';
    refreshIcons();
  }
}
