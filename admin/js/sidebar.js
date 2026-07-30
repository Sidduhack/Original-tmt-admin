// admin/js/sidebar.js
//
// Loads the sidebar + navbar component partials into the shell, and
// wires up: active-route highlighting, collapse (desktop), mobile
// open/close, logout, avatar initials, and the global search input
// (which dashboard.js listens to via a custom event).

import { logout, getCurrentUser } from './auth.js';
import { initials } from './utils.js';
import { refreshIcons } from './ui.js';

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  videos: 'Videos',
  subscribers: 'Subscribers',
  feedback: 'Feedback',
  downloads: 'Downloads',
  settings: 'Settings',
  analytics: 'Analytics',
};

export async function initShell() {
  const [sidebarHtml, navbarHtml] = await Promise.all([
    fetch('/admin/components/sidebar.html').then((r) => r.text()),
    fetch('/admin/components/navbar.html').then((r) => r.text()),
  ]);

  document.getElementById('sidebar-slot').innerHTML = sidebarHtml;
  document.getElementById('navbar-slot').innerHTML = navbarHtml;

  refreshIcons();
  wireSidebar();
  wireNavbar();
  await paintUser();
}

function wireSidebar() {
  const collapseBtn = document.getElementById('sidebar-collapse-btn');
  const sidebar = document.getElementById('sidebar');
  const mainArea = document.getElementById('main-area');
  const overlay = document.getElementById('sidebar-overlay');
  const menuBtn = document.getElementById('navbar-menu-btn');

  const collapsed = localStorage.getItem('tmt-sidebar-collapsed') === '1';
  if (collapsed) {
    sidebar.classList.add('collapsed');
    mainArea.classList.add('sidebar-collapsed');
  }

  collapseBtn?.addEventListener('click', () => {
    const isCollapsed = sidebar.classList.toggle('collapsed');
    mainArea.classList.toggle('sidebar-collapsed', isCollapsed);
    localStorage.setItem('tmt-sidebar-collapsed', isCollapsed ? '1' : '0');
  });

  menuBtn?.addEventListener('click', () => {
    sidebar.classList.add('mobile-open');
    overlay.classList.add('show');
  });
  overlay?.addEventListener('click', () => {
    sidebar.classList.remove('mobile-open');
    overlay.classList.remove('show');
  });

  document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await logout();
  });

  window.addEventListener('hashchange', updateActiveNav);
  updateActiveNav();
}

function updateActiveNav() {
  const route = (location.hash || '#/dashboard').replace('#/', '').split('?')[0] || 'dashboard';
  document.querySelectorAll('.nav-item[data-route]').forEach((el) => {
    el.classList.toggle('active', el.dataset.route === route);
  });
  const titleEl = document.getElementById('page-title-mobile');
  if (titleEl) titleEl.textContent = PAGE_TITLES[route] || 'Dashboard';

  // Close mobile sidebar on navigation
  document.getElementById('sidebar')?.classList.remove('mobile-open');
  document.getElementById('sidebar-overlay')?.classList.remove('show');
}

function wireNavbar() {
  const themeBtn = document.getElementById('theme-toggle-btn');
  const savedTheme = localStorage.getItem('tmt-theme') || 'dark';
  applyTheme(savedTheme);

  themeBtn?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    applyTheme(next);
    localStorage.setItem('tmt-theme', next);
  });

  const searchInput = document.getElementById('global-search');
  searchInput?.addEventListener('input', (e) => {
    window.dispatchEvent(new CustomEvent('tmt:search', { detail: e.target.value }));
  });

  document.getElementById('notif-btn')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('tmt:toast-info', {
      detail: { title: 'No new notifications', message: 'You\u2019re all caught up.' },
    }));
  });
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const icon = document.querySelector('#theme-toggle-btn svg');
  if (icon) icon.setAttribute('data-lucide', theme === 'light' ? 'sun' : 'moon-star');
  refreshIcons();
}

async function paintUser() {
  const user = await getCurrentUser();
  const avatar = document.getElementById('navbar-avatar');
  if (avatar && user?.email) {
    avatar.textContent = initials(user.email);
    avatar.title = user.email;
  }
}

export function setFeedbackBadge(count) {
  const badge = document.getElementById('feedback-nav-badge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

export function setPageSearchPlaceholder(text) {
  const input = document.getElementById('global-search');
  if (input) input.placeholder = text;
}
