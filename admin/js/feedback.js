// admin/js/feedback.js
//
// Feedback module: list/search/paginate, filter by read/unread, mark
// read/unread, delete, and a Reply placeholder (per spec — opens a
// compose surface but does not send, since no reply channel is wired
// up yet).

import { apiFetch } from './auth.js';
import { escapeHTML, formatDateTime, debounce, truncate } from './utils.js';
import { confirmDialog, skeletonRows, emptyStateRow, refreshIcons, openModal, closeModal } from './ui.js';
import { toast } from './notifications.js';
import { setFeedbackBadge } from './sidebar.js';

const PAGE_SIZE = 10;
let state = { page: 1, search: '', filter: 'all', total: 0 };
let searchHandler = null;

export async function render(content) {
  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Feedback</h2>
        <p>Messages submitted through the public site's contact form.</p>
      </div>
    </div>

    <div class="glass-card panel">
      <div class="table-toolbar">
        <div class="table-search">
          <svg data-lucide="search"></svg>
          <input type="text" id="feedback-search" placeholder="Search name, email, or message…" />
        </div>
        <div class="filter-chips">
          <button class="filter-chip active" data-filter="all">All</button>
          <button class="filter-chip" data-filter="unread">Unread</button>
          <button class="filter-chip" data-filter="read">Read</button>
        </div>
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr><th>From</th><th>Message</th><th>Received</th><th>Status</th><th style="text-align:right;">Actions</th></tr>
          </thead>
          <tbody id="feedback-tbody">${skeletonRows(6, 5)}</tbody>
        </table>
      </div>
      <div class="table-pagination" id="feedback-pagination"></div>
    </div>
  `;

  document.querySelectorAll('.filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      state.filter = chip.dataset.filter;
      state.page = 1;
      load();
    });
  });

  const searchInput = document.getElementById('feedback-search');
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
  const tbody = document.getElementById('feedback-tbody');
  tbody.innerHTML = skeletonRows(6, 5);

  let data;
  try {
    data = await apiFetch(`/feedback?search=${encodeURIComponent(state.search)}&filter=${state.filter}&page=${state.page}&pageSize=${PAGE_SIZE}`);
  } catch (err) {
    toast.error('Failed to load feedback', err.message);
    tbody.innerHTML = emptyStateRow(5, { title: 'Couldn\u2019t load feedback', message: err.message });
    return;
  }

  state.total = data.total || 0;
  setFeedbackBadge(data.unreadCount || 0);
  renderRows(data.feedback || []);
  renderPagination();
}

function renderRows(items) {
  const tbody = document.getElementById('feedback-tbody');
  if (items.length === 0) {
    tbody.innerHTML = emptyStateRow(5, {
      title: 'No feedback found',
      message: state.search || state.filter !== 'all' ? 'Try adjusting your filters.' : 'Feedback from your site visitors will appear here.',
    });
    return;
  }

  tbody.innerHTML = items.map((f) => `
    <tr data-id="${f.id}" style="${f.is_read ? '' : 'background:rgba(123,92,255,0.03);'}">
      <td>
        <div class="cell-primary">${escapeHTML(f.name)}</div>
        <div class="cell-sub">${escapeHTML(f.email || 'no email provided')}</div>
      </td>
      <td class="text-muted">${escapeHTML(truncate(f.message, 60))}</td>
      <td class="text-muted">${formatDateTime(f.created_at)}</td>
      <td>${f.is_read ? '<span class="badge badge-neutral">Read</span>' : '<span class="badge badge-accent">Unread</span>'}</td>
      <td>
        <div class="row-actions">
          <button class="btn-icon" data-action="view" title="View / Reply"><svg data-lucide="mail"></svg></button>
          <button class="btn-icon" data-action="toggle-read" title="${f.is_read ? 'Mark unread' : 'Mark read'}"><svg data-lucide="${f.is_read ? 'mail-open' : 'mail-check'}"></svg></button>
          <button class="btn-icon" data-action="delete" title="Delete"><svg data-lucide="trash-2"></svg></button>
        </div>
      </td>
    </tr>
  `).join('');

  refreshIcons();

  tbody.querySelectorAll('tr').forEach((row) => {
    const id = row.dataset.id;
    const item = items.find((i) => i.id === id);
    row.querySelector('[data-action="view"]')?.addEventListener('click', () => openViewModal(item));
    row.querySelector('[data-action="toggle-read"]')?.addEventListener('click', () => toggleRead(id, !item.is_read));
    row.querySelector('[data-action="delete"]')?.addEventListener('click', () => handleDelete(id));
  });
}

function renderPagination() {
  const totalPages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
  const el = document.getElementById('feedback-pagination');
  el.innerHTML = `
    <div class="pagination-info">${state.total} message${state.total === 1 ? '' : 's'} total</div>
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

function openViewModal(item) {
  const modal = openModal(`
    <div class="modal-header">
      <h3>${escapeHTML(item.name)}</h3>
      <button class="modal-close" data-modal-close><svg data-lucide="x"></svg></button>
    </div>
    <div class="modal-body">
      <p class="cell-sub" style="margin-bottom:14px;">${escapeHTML(item.email || 'No email provided')} · ${formatDateTime(item.created_at)}</p>
      <p style="font-size:14px;line-height:1.7;white-space:pre-wrap;">${escapeHTML(item.message)}</p>

      <div class="field" style="margin-top:22px;">
        <label for="reply-box">Reply</label>
        <textarea class="input" id="reply-box" placeholder="Reply sending isn't connected yet — draft your response here."></textarea>
        <p class="hint">Reply delivery isn't wired to an outbound channel yet. Hook this button up to your support inbox or the email provider once ready.</p>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-modal-close>Close</button>
      <button class="btn btn-primary" id="reply-placeholder-btn"><svg data-lucide="send"></svg> Reply</button>
    </div>
  `, { size: 'lg' });
  refreshIcons();

  if (!item.is_read) {
    toggleRead(item.id, true, { silent: true });
  }

  modal.querySelector('#reply-placeholder-btn').addEventListener('click', () => {
    toast.info('Reply not connected', 'Wire this button up to your email provider to send replies.');
  });
}

async function toggleRead(id, isRead, { silent = false } = {}) {
  try {
    await apiFetch(`/feedback?id=${id}`, { method: 'PATCH', body: { is_read: isRead } });
    if (!silent) toast.success(isRead ? 'Marked as read' : 'Marked as unread');
    await load();
  } catch (err) {
    if (!silent) toast.error('Failed to update feedback', err.message);
  }
}

async function handleDelete(id) {
  const ok = await confirmDialog({
    title: 'Delete this feedback?',
    message: 'This message will be permanently removed.',
  });
  if (!ok) return;

  try {
    await apiFetch(`/feedback?id=${id}`, { method: 'DELETE' });
    toast.success('Feedback deleted');
    await load();
  } catch (err) {
    toast.error('Failed to delete feedback', err.message);
  }
}
