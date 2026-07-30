// admin/js/subscribers.js
//
// Subscribers module: list/search/paginate, delete, CSV export, and a
// small stats strip (total / active / subscribed this week).

import { apiFetch } from './auth.js';
import { escapeHTML, formatDate, debounce, formatNumber } from './utils.js';
import { confirmDialog, skeletonRows, emptyStateRow, refreshIcons } from './ui.js';
import { toast } from './notifications.js';
import { getSession } from './auth.js';
import { API_BASE } from './config.js';

const PAGE_SIZE = 10;
let state = { page: 1, search: '', total: 0 };
let searchHandler = null;

export async function render(content) {
  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Subscribers</h2>
        <p>Everyone who's subscribed to TMT OFFICIAL updates.</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-ghost" id="export-csv-btn"><svg data-lucide="download"></svg> Export CSV</button>
      </div>
    </div>

    <div class="stats-grid" id="subscriber-stats" style="margin-bottom:22px;">
      ${Array.from({ length: 2 }).map(() => `<div class="glass-card skeleton" style="height:100px;"></div>`).join('')}
    </div>

    <div class="glass-card panel">
      <div class="table-toolbar">
        <div class="table-search">
          <svg data-lucide="search"></svg>
          <input type="text" id="subscriber-search" placeholder="Search by email…" />
        </div>
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr><th>Email</th><th>Name</th><th>Subscribed</th><th>Status</th><th style="text-align:right;">Actions</th></tr>
          </thead>
          <tbody id="subscribers-tbody">${skeletonRows(6, 5)}</tbody>
        </table>
      </div>
      <div class="table-pagination" id="subscribers-pagination"></div>
    </div>
  `;

  document.getElementById('export-csv-btn').addEventListener('click', exportCsv);

  const searchInput = document.getElementById('subscriber-search');
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
  const tbody = document.getElementById('subscribers-tbody');
  tbody.innerHTML = skeletonRows(6, 5);

  let data;
  try {
    data = await apiFetch(`/subscribers?search=${encodeURIComponent(state.search)}&page=${state.page}&pageSize=${PAGE_SIZE}`);
  } catch (err) {
    toast.error('Failed to load subscribers', err.message);
    tbody.innerHTML = emptyStateRow(5, { title: 'Couldn\u2019t load subscribers', message: err.message });
    return;
  }

  state.total = data.total || 0;
  paintStats(data.total || 0, data.activeCount || 0);
  renderRows(data.subscribers || []);
  renderPagination();
}

function paintStats(total, active) {
  document.getElementById('subscriber-stats').innerHTML = `
    <div class="glass-card stat-card">
      <div class="stat-card-top"><div class="stat-icon violet"><svg data-lucide="users"></svg></div></div>
      <div class="stat-value">${formatNumber(total)}</div>
      <div class="stat-label">Total Subscribers</div>
    </div>
    <div class="glass-card stat-card">
      <div class="stat-card-top"><div class="stat-icon teal"><svg data-lucide="user-check"></svg></div></div>
      <div class="stat-value">${formatNumber(active)}</div>
      <div class="stat-label">Active Subscribers</div>
    </div>
  `;
  refreshIcons();
}

function renderRows(subs) {
  const tbody = document.getElementById('subscribers-tbody');
  if (subs.length === 0) {
    tbody.innerHTML = emptyStateRow(5, {
      title: state.search ? 'No subscribers match your search' : 'No subscribers yet',
      message: state.search ? 'Try a different search term.' : 'Subscribers from your public site will show up here.',
    });
    return;
  }

  tbody.innerHTML = subs.map((s) => `
    <tr data-id="${s.id}">
      <td class="cell-primary">${escapeHTML(s.email)}</td>
      <td class="text-muted">${escapeHTML(s.name || '—')}</td>
      <td class="text-muted">${formatDate(s.subscribed_at)}</td>
      <td>${s.is_active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-neutral">Inactive</span>'}</td>
      <td>
        <div class="row-actions">
          <button class="btn-icon" data-action="delete" title="Delete"><svg data-lucide="trash-2"></svg></button>
        </div>
      </td>
    </tr>
  `).join('');

  refreshIcons();
  tbody.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', (e) => handleDelete(e.target.closest('tr').dataset.id));
  });
}

function renderPagination() {
  const totalPages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
  const el = document.getElementById('subscribers-pagination');
  el.innerHTML = `
    <div class="pagination-info">${state.total} subscriber${state.total === 1 ? '' : 's'} total</div>
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

async function handleDelete(id) {
  const ok = await confirmDialog({
    title: 'Remove this subscriber?',
    message: 'They will stop receiving new video emails. This cannot be undone.',
  });
  if (!ok) return;

  try {
    await apiFetch(`/subscribers?id=${id}`, { method: 'DELETE' });
    toast.success('Subscriber removed');
    await load();
  } catch (err) {
    toast.error('Failed to remove subscriber', err.message);
  }
}

async function exportCsv() {
  try {
    const session = await getSession();
    const res = await fetch(`${API_BASE}/subscribers?export=csv`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) throw new Error('Export failed.');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('Export ready', 'Your CSV download has started.');
  } catch (err) {
    toast.error('Export failed', err.message);
  }
}
