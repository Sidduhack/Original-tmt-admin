// admin/js/ui.js
//
// Generic UI helpers used across modules: opening/closing modals,
// confirmation dialogs, and building skeleton/empty-state markup so
// every table/module looks consistent.

let activeModalEl = null;

/**
 * Opens a modal built from the given inner HTML (header/body/footer already
 * included in `innerHtml`). Returns the modal root element so callers can
 * query inputs / attach listeners.
 */
export function openModal(innerHtml, { size = '' } = {}) {
  closeModal(); // only one at a time

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal ${size ? `modal-${size}` : ''}">${innerHtml}</div>`;

  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) closeModal();
  });

  document.addEventListener('keydown', escListener);
  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';
  activeModalEl = backdrop;

  backdrop.querySelectorAll('[data-modal-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal());
  });

  return backdrop;
}

function escListener(e) {
  if (e.key === 'Escape') closeModal();
}

export function closeModal() {
  if (!activeModalEl) return;
  activeModalEl.classList.add('closing');
  document.removeEventListener('keydown', escListener);
  const el = activeModalEl;
  activeModalEl = null;
  document.body.style.overflow = '';
  setTimeout(() => el.remove(), 180);
}

/**
 * Promise-based confirmation dialog. Resolves true/false.
 */
export function confirmDialog({ title, message, confirmLabel = 'Delete', danger = true }) {
  return new Promise((resolve) => {
    const modal = openModal(`
      <div class="modal-body" style="text-align:left;">
        <div class="confirm-icon-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-1.5a9 9 0 11-18 0 9 9 0 0118 0zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h3 style="font-size:16.5px;margin-bottom:8px;">${title}</h3>
        <p class="text-muted" style="font-size:13.5px;line-height:1.5;">${message}</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" data-action="cancel">Cancel</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="confirm">${confirmLabel}</button>
      </div>
    `, { size: 'sm' });

    modal.querySelector('[data-action="cancel"]').addEventListener('click', () => {
      closeModal();
      resolve(false);
    });
    modal.querySelector('[data-action="confirm"]').addEventListener('click', () => {
      closeModal();
      resolve(true);
    });
  });
}

/** Builds `count` skeleton `<tr>` rows with `cols` skeleton cells each. */
export function skeletonRows(count, cols) {
  return Array.from({ length: count }).map(() => `
    <tr class="skeleton-row">
      ${Array.from({ length: cols }).map(() => `
        <td><div class="skeleton skeleton-line" style="width:${60 + Math.random() * 30}%;"></div></td>
      `).join('')}
    </tr>
  `).join('');
}

export function emptyStateRow(cols, { icon = 'inbox', title = 'Nothing here yet', message = '' } = {}) {
  return `
    <tr>
      <td colspan="${cols}">
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 7l1.5-3h15L21 7m-18 0h18m-18 0v11a2 2 0 002 2h14a2 2 0 002-2V7M9 12h6" />
          </svg>
          <h3>${title}</h3>
          ${message ? `<p>${message}</p>` : ''}
        </div>
      </td>
    </tr>
  `;
}

/** Re-runs lucide.createIcons() if the library is present — call after any innerHTML swap that adds data-lucide icons. */
export function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}
