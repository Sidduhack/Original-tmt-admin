// admin/js/videos.js
//
// Videos module: list/search/paginate, add, edit, delete, feature toggle,
// publish (with optional "send email to subscribers"), and preview.

import { apiFetch } from './auth.js';
import { escapeHTML, formatDate, debounce, extractYoutubeId, youtubeThumbFromUrl, truncate } from './utils.js';
import { openModal, closeModal, confirmDialog, skeletonRows, emptyStateRow, refreshIcons } from './ui.js';
import { toast } from './notifications.js';

const PAGE_SIZE = 8;
let state = { page: 1, search: '', total: 0 };
let searchHandler = null;

export async function render(content) {
  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Videos</h2>
        <p>Manage uploads, featured picks, and publishing.</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="add-video-btn">
          <svg data-lucide="plus"></svg> Add Video
        </button>
      </div>
    </div>

    <div class="glass-card panel">
      <div class="table-toolbar">
        <div class="table-search">
          <svg data-lucide="search"></svg>
          <input type="text" id="video-search" placeholder="Search videos by title…" />
        </div>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Video</th>
              <th>Published</th>
              <th>Featured</th>
              <th>Date</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody id="videos-tbody">${skeletonRows(5, 5)}</tbody>
        </table>
      </div>

      <div class="table-pagination" id="videos-pagination"></div>
    </div>
  `;

  document.getElementById('add-video-btn').addEventListener('click', openAddModal);

  const searchInput = document.getElementById('video-search');
  searchInput.addEventListener('input', debounce((e) => {
    state.search = e.target.value;
    state.page = 1;
    load();
  }, 350));

  searchHandler = (e) => { searchInput.value = e.detail; searchInput.dispatchEvent(new Event('input')); };
  window.addEventListener('tmt:search', searchHandler);

  await load();

  return () => {
    if (searchHandler) window.removeEventListener('tmt:search', searchHandler);
  };
}

async function load() {
  const tbody = document.getElementById('videos-tbody');
  tbody.innerHTML = skeletonRows(5, 5);

  let data;
  try {
    data = await apiFetch(`/videos?search=${encodeURIComponent(state.search)}&page=${state.page}&pageSize=${PAGE_SIZE}`);
  } catch (err) {
    toast.error('Failed to load videos', err.message);
    tbody.innerHTML = emptyStateRow(5, { title: 'Couldn\u2019t load videos', message: err.message });
    return;
  }

  state.total = data.total || 0;
  renderRows(data.videos || []);
  renderPagination();
}

function renderRows(videos) {
  const tbody = document.getElementById('videos-tbody');
  if (videos.length === 0) {
    tbody.innerHTML = emptyStateRow(5, {
      title: state.search ? 'No videos match your search' : 'No videos yet',
      message: state.search ? 'Try a different search term.' : 'Add your first video to get started.',
    });
    return;
  }

  tbody.innerHTML = videos.map((v) => {
    const thumb = v.thumbnail_url || youtubeThumbFromUrl(v.youtube_url) || '';
    return `
    <tr data-id="${v.id}">
      <td>
        <div class="cell-with-thumb">
          ${thumb ? `<img class="cell-thumb" src="${escapeHTML(thumb)}" alt="" loading="lazy" />` : `<div class="cell-thumb"></div>`}
          <div>
            <div class="cell-primary">${escapeHTML(truncate(v.title, 46))}</div>
            <div class="cell-sub">${escapeHTML(truncate(v.description || '', 50))}</div>
          </div>
        </div>
      </td>
      <td>
        ${v.published
          ? `<span class="badge badge-success"><svg data-lucide="check" style="width:11px;height:11px;"></svg> Published</span>`
          : `<span class="badge badge-neutral">Draft</span>`}
      </td>
      <td>
        ${v.is_featured ? `<span class="badge badge-accent"><svg data-lucide="star" style="width:11px;height:11px;"></svg> Featured</span>` : `<span class="text-dim">—</span>`}
      </td>
      <td class="text-muted">${formatDate(v.published_at || v.created_at)}</td>
      <td>
        <div class="row-actions">
          <button class="btn-icon" data-action="preview" title="Preview"><svg data-lucide="eye"></svg></button>
          ${!v.published ? `<button class="btn-icon" data-action="publish" title="Publish"><svg data-lucide="upload-cloud"></svg></button>` : ''}
          <button class="btn-icon" data-action="edit" title="Edit"><svg data-lucide="pencil"></svg></button>
          <button class="btn-icon" data-action="delete" title="Delete"><svg data-lucide="trash-2"></svg></button>
        </div>
      </td>
    </tr>
  `;
  }).join('');

  refreshIcons();

  tbody.querySelectorAll('tr').forEach((row) => {
    const id = row.dataset.id;
    row.querySelector('[data-action="preview"]')?.addEventListener('click', () => openPreviewModal(id));
    row.querySelector('[data-action="edit"]')?.addEventListener('click', () => openEditModal(id));
    row.querySelector('[data-action="delete"]')?.addEventListener('click', () => handleDelete(id));
    row.querySelector('[data-action="publish"]')?.addEventListener('click', () => openPublishModal(id));
  });
}

function renderPagination() {
  const totalPages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
  const el = document.getElementById('videos-pagination');
  el.innerHTML = `
    <div class="pagination-info">${state.total} video${state.total === 1 ? '' : 's'} total</div>
    <div class="pagination-controls">
      <button class="page-btn" id="prev-page" ${state.page <= 1 ? 'disabled' : ''}><svg data-lucide="chevron-left"></svg></button>
      <span class="pagination-info">Page ${state.page} of ${totalPages}</span>
      <button class="page-btn" id="next-page" ${state.page >= totalPages ? 'disabled' : ''}><svg data-lucide="chevron-right"></svg></button>
    </div>
  `;
  refreshIcons();
  document.getElementById('prev-page')?.addEventListener('click', () => { state.page -= 1; load(); });
  document.getElementById('next-page')?.addEventListener('click', () => { state.page += 1; load(); });
}

// -----------------------------------------------------------------------
// Add / Edit modal
// -----------------------------------------------------------------------

function videoFormHtml(video = {}) {
  return `
    <div class="modal-header">
      <h3>${video.id ? 'Edit Video' : 'Add Video'}</h3>
      <button class="modal-close" data-modal-close><svg data-lucide="x"></svg></button>
    </div>
    <div class="modal-body">
      <form id="video-form">
        <div class="field">
          <label for="f-title">Title</label>
          <input class="input" id="f-title" name="title" value="${escapeHTML(video.title || '')}" placeholder="e.g. Ranked Grind Highlights #12" required />
        </div>
        <div class="field">
          <label for="f-description">Description</label>
          <textarea class="input" id="f-description" name="description" placeholder="What's this video about?">${escapeHTML(video.description || '')}</textarea>
        </div>
        <div class="field">
          <label for="f-youtube">YouTube URL</label>
          <input class="input" id="f-youtube" name="youtube_url" value="${escapeHTML(video.youtube_url || '')}" placeholder="https://youtube.com/watch?v=…" required />
        </div>
        <div class="field">
          <label for="f-thumbnail">Thumbnail URL</label>
          <input class="input" id="f-thumbnail" name="thumbnail_url" value="${escapeHTML(video.thumbnail_url || '')}" placeholder="Leave blank to auto-use the YouTube thumbnail" />
          <p class="hint">If left blank, the YouTube thumbnail is used automatically.</p>
        </div>
        <label class="checkbox-row">
          <input type="checkbox" id="f-featured" ${video.is_featured ? 'checked' : ''} />
          <span class="checkbox-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg></span>
          <span class="checkbox-label">Mark as featured video</span>
        </label>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-modal-close>Cancel</button>
      <button class="btn btn-primary" id="video-form-submit">${video.id ? 'Save Changes' : 'Add Video'}</button>
    </div>
  `;
}

function openAddModal() {
  const modal = openModal(videoFormHtml(), { size: 'lg' });
  refreshIcons();
  modal.querySelector('#video-form-submit').addEventListener('click', () => submitVideoForm(modal, null));
}

async function openEditModal(id) {
  let data;
  try {
    data = await apiFetch(`/videos?search=&page=1&pageSize=100`); // fetch then find — small admin dataset assumption acceptable; see note below
  } catch (err) {
    toast.error('Failed to load video', err.message);
    return;
  }
  const video = (data.videos || []).find((v) => v.id === id);
  if (!video) { toast.error('Video not found'); return; }

  const modal = openModal(videoFormHtml(video), { size: 'lg' });
  refreshIcons();
  modal.querySelector('#video-form-submit').addEventListener('click', () => submitVideoForm(modal, id));
}

function readVideoForm(modal) {
  return {
    title: modal.querySelector('#f-title').value.trim(),
    description: modal.querySelector('#f-description').value.trim(),
    youtube_url: modal.querySelector('#f-youtube').value.trim(),
    thumbnail_url: modal.querySelector('#f-thumbnail').value.trim() || null,
    is_featured: modal.querySelector('#f-featured').checked,
  };
}

async function submitVideoForm(modal, id) {
  const payload = readVideoForm(modal);
  if (!payload.title) return toast.error('Title is required.');
  if (!extractYoutubeId(payload.youtube_url)) return toast.error('Please enter a valid YouTube URL.');

  if (!payload.thumbnail_url) {
    payload.thumbnail_url = youtubeThumbFromUrl(payload.youtube_url);
  }

  const submitBtn = modal.querySelector('#video-form-submit');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span> Saving…';

  try {
    if (id) {
      await apiFetch(`/videos?id=${id}`, { method: 'PATCH', body: payload });
      toast.success('Video updated');
    } else {
      await apiFetch('/videos', { method: 'POST', body: payload });
      toast.success('Video added');
    }
    closeModal();
    await load();
  } catch (err) {
    toast.error('Failed to save video', err.message);
    submitBtn.disabled = false;
    submitBtn.textContent = id ? 'Save Changes' : 'Add Video';
  }
}

// -----------------------------------------------------------------------
// Preview
// -----------------------------------------------------------------------

async function openPreviewModal(id) {
  let data;
  try {
    data = await apiFetch(`/videos?search=&page=1&pageSize=100`);
  } catch (err) {
    toast.error('Failed to load video', err.message);
    return;
  }
  const video = (data.videos || []).find((v) => v.id === id);
  if (!video) return;

  const ytId = extractYoutubeId(video.youtube_url);
  const modal = openModal(`
    <div class="modal-header">
      <h3>${escapeHTML(video.title)}</h3>
      <button class="modal-close" data-modal-close><svg data-lucide="x"></svg></button>
    </div>
    <div class="modal-body">
      <div class="video-preview-frame">
        ${ytId
          ? `<iframe src="https://www.youtube.com/embed/${ytId}" title="${escapeHTML(video.title)}" allowfullscreen></iframe>`
          : `<div class="empty-state"><p>Invalid YouTube URL</p></div>`}
      </div>
      <p class="text-muted" style="font-size:13.5px;line-height:1.6;">${escapeHTML(video.description || 'No description.')}</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-modal-close>Close</button>
    </div>
  `, { size: 'lg' });
  refreshIcons();
}

// -----------------------------------------------------------------------
// Publish
// -----------------------------------------------------------------------

function openPublishModal(id) {
  const modal = openModal(`
    <div class="modal-header">
      <h3>Publish Video</h3>
      <button class="modal-close" data-modal-close><svg data-lucide="x"></svg></button>
    </div>
    <div class="modal-body">
      <p class="text-muted" style="font-size:13.5px;margin-bottom:16px;">
        Publishing makes this video visible on the public site.
      </p>
      <label class="checkbox-row">
        <input type="checkbox" id="f-send-email" checked />
        <span class="checkbox-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg></span>
        <span class="checkbox-label">Send email to subscribers
          <span>Notifies every active subscriber with a "New Video" email.</span>
        </span>
      </label>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-modal-close>Cancel</button>
      <button class="btn btn-primary" id="confirm-publish"><svg data-lucide="upload-cloud"></svg> Publish</button>
    </div>
  `, { size: 'sm' });
  refreshIcons();

  modal.querySelector('#confirm-publish').addEventListener('click', async () => {
    const sendEmail = modal.querySelector('#f-send-email').checked;
    const btn = modal.querySelector('#confirm-publish');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Publishing…';
    try {
      const res = await apiFetch('/publish-video', { method: 'POST', body: { id, sendEmail } });
      closeModal();
      if (sendEmail && res.emailResult) {
        const r = res.emailResult;
        if (r.failed > 0) {
          toast.error(
            `Sent to ${r.recipients}/${r.totalSubscribers} subscribers`,
            r.failureSamples?.length
              ? `${r.failureSamples[0]}${r.failed > 1 ? ` (+${r.failed - 1} more failed)` : ''}`
              : 'Some emails failed to send — check your email provider configuration.'
          );
        } else {
          toast.success('Video published', `Emailed ${r.recipients || 0} subscriber(s).`);
        }
      } else {
        toast.success('Video published');
      }
      await load();
    } catch (err) {
      toast.error('Failed to publish', err.message);
      btn.disabled = false;
      btn.innerHTML = '<svg data-lucide="upload-cloud"></svg> Publish';
      refreshIcons();
    }
  });
}

// -----------------------------------------------------------------------
// Delete
// -----------------------------------------------------------------------

async function handleDelete(id) {
  const ok = await confirmDialog({
    title: 'Delete this video?',
    message: 'This will permanently remove the video from the admin panel and public site. This cannot be undone.',
  });
  if (!ok) return;

  try {
    await apiFetch(`/delete-video?id=${id}`, { method: 'DELETE' });
    toast.success('Video deleted');
    await load();
  } catch (err) {
    toast.error('Failed to delete video', err.message);
  }
}
