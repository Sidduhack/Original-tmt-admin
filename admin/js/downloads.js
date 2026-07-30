// admin/js/downloads.js
//
// Downloads module: upload a file to Supabase Storage (via a
// server-issued signed upload URL — see api/downloads.js), then save
// its metadata (title/description/category) to the database. Also
// supports edit, delete, and displays download counts.

import { apiFetch } from './auth.js';
import { supabase } from './config.js';
import { escapeHTML, formatDate, formatBytes, formatNumber, debounce, truncate } from './utils.js';
import { openModal, closeModal, confirmDialog, skeletonRows, emptyStateRow, refreshIcons } from './ui.js';
import { toast } from './notifications.js';

const PAGE_SIZE = 8;
const BUCKET = 'downloads';
let state = { page: 1, search: '', category: '', total: 0 };
let searchHandler = null;

export async function render(content) {
  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Downloads</h2>
        <p>Files available for visitors to download from the public site.</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="add-download-btn"><svg data-lucide="upload"></svg> Upload File</button>
      </div>
    </div>

    <div class="glass-card panel">
      <div class="table-toolbar">
        <div class="table-search">
          <svg data-lucide="search"></svg>
          <input type="text" id="download-search" placeholder="Search downloads…" />
        </div>
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr><th>File</th><th>Category</th><th>Size</th><th>Downloads</th><th>Added</th><th style="text-align:right;">Actions</th></tr>
          </thead>
          <tbody id="downloads-tbody">${skeletonRows(6, 6)}</tbody>
        </table>
      </div>
      <div class="table-pagination" id="downloads-pagination"></div>
    </div>
  `;

  document.getElementById('add-download-btn').addEventListener('click', openUploadModal);

  const searchInput = document.getElementById('download-search');
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
  const tbody = document.getElementById('downloads-tbody');
  tbody.innerHTML = skeletonRows(6, 6);

  let data;
  try {
    data = await apiFetch(`/downloads?search=${encodeURIComponent(state.search)}&category=${encodeURIComponent(state.category)}&page=${state.page}&pageSize=${PAGE_SIZE}`);
  } catch (err) {
    toast.error('Failed to load downloads', err.message);
    tbody.innerHTML = emptyStateRow(6, { title: 'Couldn\u2019t load downloads', message: err.message });
    return;
  }

  state.total = data.total || 0;
  renderRows(data.downloads || []);
  renderPagination();
}

function renderRows(items) {
  const tbody = document.getElementById('downloads-tbody');
  if (items.length === 0) {
    tbody.innerHTML = emptyStateRow(6, {
      title: state.search ? 'No downloads match your search' : 'No files uploaded yet',
      message: state.search ? 'Try a different search term.' : 'Upload your first file to get started.',
    });
    return;
  }

  tbody.innerHTML = items.map((d) => `
    <tr data-id="${d.id}">
      <td>
        <div class="cell-primary">${escapeHTML(d.title)}</div>
        <div class="cell-sub">${escapeHTML(truncate(d.description || '', 50))}</div>
      </td>
      <td><span class="badge badge-neutral">${escapeHTML(d.category || 'general')}</span></td>
      <td class="text-muted">${formatBytes(d.file_size)}</td>
      <td class="text-muted">${formatNumber(d.download_count || 0)}</td>
      <td class="text-muted">${formatDate(d.created_at)}</td>
      <td>
        <div class="row-actions">
          <a class="btn-icon" href="${escapeHTML(d.file_url)}" target="_blank" rel="noopener" title="Open file"><svg data-lucide="external-link"></svg></a>
          <button class="btn-icon" data-action="edit" title="Edit"><svg data-lucide="pencil"></svg></button>
          <button class="btn-icon" data-action="delete" title="Delete"><svg data-lucide="trash-2"></svg></button>
        </div>
      </td>
    </tr>
  `).join('');

  refreshIcons();
  tbody.querySelectorAll('tr').forEach((row) => {
    const id = row.dataset.id;
    const item = items.find((i) => i.id === id);
    row.querySelector('[data-action="edit"]')?.addEventListener('click', () => openEditModal(item));
    row.querySelector('[data-action="delete"]')?.addEventListener('click', () => handleDelete(id));
  });
}

function renderPagination() {
  const totalPages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
  const el = document.getElementById('downloads-pagination');
  el.innerHTML = `
    <div class="pagination-info">${state.total} file${state.total === 1 ? '' : 's'} total</div>
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
// Upload modal
// -----------------------------------------------------------------------

function openUploadModal() {
  const modal = openModal(`
    <div class="modal-header">
      <h3>Upload File</h3>
      <button class="modal-close" data-modal-close><svg data-lucide="x"></svg></button>
    </div>
    <div class="modal-body">
      <form id="upload-form">
        <div class="field">
          <label>File</label>
          <label class="dropzone" id="dropzone">
            <svg data-lucide="upload-cloud"></svg>
            <div><strong>Click to choose a file</strong> or drag it here</div>
            <input type="file" id="f-file" />
            <div class="file-preview hidden" id="file-preview"></div>
          </label>
          <div class="upload-progress hidden" id="upload-progress"><div class="upload-progress-bar" id="upload-progress-bar"></div></div>
        </div>
        <div class="field">
          <label for="f-title">Title</label>
          <input class="input" id="f-title" placeholder="e.g. TMT Wallpaper Pack Vol. 1" required />
        </div>
        <div class="field">
          <label for="f-description">Description</label>
          <textarea class="input" id="f-description" placeholder="What's in this file?"></textarea>
        </div>
        <div class="field">
          <label for="f-category">Category</label>
          <select class="input" id="f-category">
            <option value="general">General</option>
            <option value="wallpapers">Wallpapers</option>
            <option value="overlays">Overlays</option>
            <option value="presets">Presets</option>
            <option value="assets">Assets</option>
          </select>
        </div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-modal-close>Cancel</button>
      <button class="btn btn-primary" id="upload-submit-btn"><svg data-lucide="upload"></svg> Upload</button>
    </div>
  `, { size: 'lg' });
  refreshIcons();

  let selectedFile = null;
  const fileInput = modal.querySelector('#f-file');
  const dropzone = modal.querySelector('#dropzone');
  const preview = modal.querySelector('#file-preview');

  fileInput.addEventListener('change', () => {
    selectedFile = fileInput.files[0] || null;
    if (selectedFile) {
      preview.textContent = `${selectedFile.name} (${formatBytes(selectedFile.size)})`;
      preview.classList.remove('hidden');
      if (!modal.querySelector('#f-title').value) {
        modal.querySelector('#f-title').value = selectedFile.name.replace(/\.[^/.]+$/, '');
      }
    }
  });

  ['dragover', 'dragleave', 'drop'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.toggle('dragover', evt === 'dragover');
      if (evt === 'drop' && e.dataTransfer.files[0]) {
        fileInput.files = e.dataTransfer.files;
        fileInput.dispatchEvent(new Event('change'));
      }
    });
  });

  modal.querySelector('#upload-submit-btn').addEventListener('click', async () => {
    const title = modal.querySelector('#f-title').value.trim();
    const description = modal.querySelector('#f-description').value.trim();
    const category = modal.querySelector('#f-category').value;

    if (!selectedFile) return toast.error('Please choose a file.');
    if (!title) return toast.error('Title is required.');

    const btn = modal.querySelector('#upload-submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Uploading…';
    const progressWrap = modal.querySelector('#upload-progress');
    const progressBar = modal.querySelector('#upload-progress-bar');
    progressWrap.classList.remove('hidden');
    progressBar.style.width = '15%';

    try {
      const signed = await apiFetch('/downloads?action=sign-upload', {
        method: 'POST',
        body: { fileName: selectedFile.name },
      });
      progressBar.style.width = '45%';

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .uploadToSignedUrl(signed.path, signed.token, selectedFile);

      if (uploadError) throw new Error(uploadError.message || 'Upload failed.');
      progressBar.style.width = '80%';

      await apiFetch('/downloads', {
        method: 'POST',
        body: {
          title,
          description,
          category,
          file_url: signed.publicUrl,
          file_path: signed.path,
          file_size: selectedFile.size,
        },
      });

      progressBar.style.width = '100%';
      toast.success('File uploaded');
      closeModal();
      await load();
    } catch (err) {
      toast.error('Upload failed', err.message);
      btn.disabled = false;
      btn.innerHTML = '<svg data-lucide="upload"></svg> Upload';
      refreshIcons();
    }
  });
}

// -----------------------------------------------------------------------
// Edit modal
// -----------------------------------------------------------------------

function openEditModal(item) {
  const modal = openModal(`
    <div class="modal-header">
      <h3>Edit Download</h3>
      <button class="modal-close" data-modal-close><svg data-lucide="x"></svg></button>
    </div>
    <div class="modal-body">
      <div class="field">
        <label for="e-title">Title</label>
        <input class="input" id="e-title" value="${escapeHTML(item.title)}" />
      </div>
      <div class="field">
        <label for="e-description">Description</label>
        <textarea class="input" id="e-description">${escapeHTML(item.description || '')}</textarea>
      </div>
      <div class="field">
        <label for="e-category">Category</label>
        <select class="input" id="e-category">
          ${['general', 'wallpapers', 'overlays', 'presets', 'assets'].map((c) => `<option value="${c}" ${item.category === c ? 'selected' : ''}>${c[0].toUpperCase() + c.slice(1)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-modal-close>Cancel</button>
      <button class="btn btn-primary" id="edit-submit-btn">Save Changes</button>
    </div>
  `, { size: 'lg' });
  refreshIcons();

  modal.querySelector('#edit-submit-btn').addEventListener('click', async () => {
    const btn = modal.querySelector('#edit-submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Saving…';
    try {
      await apiFetch(`/downloads?id=${item.id}`, {
        method: 'PATCH',
        body: {
          title: modal.querySelector('#e-title').value.trim(),
          description: modal.querySelector('#e-description').value.trim(),
          category: modal.querySelector('#e-category').value,
        },
      });
      toast.success('Download updated');
      closeModal();
      await load();
    } catch (err) {
      toast.error('Failed to update', err.message);
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    }
  });
}

async function handleDelete(id) {
  const ok = await confirmDialog({
    title: 'Delete this file?',
    message: 'This removes the file from storage and the public site permanently.',
  });
  if (!ok) return;

  try {
    await apiFetch(`/downloads?id=${id}`, { method: 'DELETE' });
    toast.success('Download deleted');
    await load();
  } catch (err) {
    toast.error('Failed to delete download', err.message);
  }
}
