// admin/js/dashboard.js
//
// Acts as both: (1) the client-side router mounting each module into
// #content based on location.hash, and (2) the Dashboard module itself
// (stat cards, charts, recent activity, latest-item mini cards).

import { apiFetch } from './auth.js';
import { formatNumber, timeAgo, escapeHTML } from './utils.js';
import { refreshIcons } from './ui.js';
import { toast } from './notifications.js';
import { setFeedbackBadge, setPageSearchPlaceholder } from './sidebar.js';

import * as VideosModule from './videos.js';
import * as SubscribersModule from './subscribers.js';
import * as FeedbackModule from './feedback.js';
import * as DownloadsModule from './downloads.js';
import * as SettingsModule from './settings.js';
import * as AnalyticsModule from './analytics.js';

const routes = {
  dashboard: { render: renderDashboard, searchPlaceholder: 'Search this page…' },
  videos: { render: VideosModule.render, searchPlaceholder: 'Search videos…' },
  subscribers: { render: SubscribersModule.render, searchPlaceholder: 'Search subscribers…' },
  feedback: { render: FeedbackModule.render, searchPlaceholder: 'Search feedback…' },
  downloads: { render: DownloadsModule.render, searchPlaceholder: 'Search downloads…' },
  settings: { render: SettingsModule.render, searchPlaceholder: 'Search this page…' },
  analytics: { render: AnalyticsModule.render, searchPlaceholder: 'Search this page…' },
};

let currentCleanup = null;

export function startRouter() {
  window.addEventListener('hashchange', route);
  route();
  refreshFeedbackBadge();
}

async function route() {
  const hash = (location.hash || '#/dashboard').replace('#/', '').split('?')[0] || 'dashboard';
  const match = routes[hash] ? hash : 'dashboard';
  const content = document.getElementById('content');

  if (typeof currentCleanup === 'function') {
    try { currentCleanup(); } catch { /* noop */ }
    currentCleanup = null;
  }

  setPageSearchPlaceholder(routes[match].searchPlaceholder);
  content.innerHTML = `<div class="skeleton" style="height:200px;border-radius:18px;"></div>`;

  try {
    currentCleanup = await routes[match].render(content);
  } catch (err) {
    console.error(err);
    content.innerHTML = `
      <div class="empty-state glass-card" style="padding:64px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-1.5a9 9 0 11-18 0 9 9 0 0118 0zM12 15.75h.007v.008H12v-.008z"/></svg>
        <h3>Couldn't load this page</h3>
        <p>${escapeHTML(err.message || 'Please try refreshing.')}</p>
      </div>`;
  }
  refreshIcons();
}

async function refreshFeedbackBadge() {
  try {
    const data = await apiFetch('/feedback?filter=unread&pageSize=1');
    setFeedbackBadge(data.unreadCount || 0);
  } catch { /* non-fatal */ }
}

// -----------------------------------------------------------------------
// Dashboard view
// -----------------------------------------------------------------------

let chartInstances = [];

async function renderDashboard(content) {
  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Dashboard</h2>
        <p>Overview of TMT OFFICIAL's growth and activity.</p>
      </div>
    </div>

    <div class="stats-grid" id="stats-grid">
      ${Array.from({ length: 4 }).map(() => `<div class="glass-card skeleton" style="height:120px;"></div>`).join('')}
    </div>

    <div class="mini-cards-grid" id="mini-cards-grid">
      ${Array.from({ length: 3 }).map(() => `<div class="glass-card skeleton" style="height:88px;"></div>`).join('')}
    </div>

    <div class="dash-grid">
      <div class="glass-card panel">
        <div class="panel-header">
          <h3>Visitors &amp; Page Views</h3>
          <div class="tabs" id="range-tabs">
            <button class="panel-tab" data-range="7d">7D</button>
            <button class="panel-tab active" data-range="30d">30D</button>
            <button class="panel-tab" data-range="90d">90D</button>
          </div>
        </div>
        <div class="chart-wrap"><canvas id="chart-traffic"></canvas></div>
      </div>

      <div class="glass-card panel">
        <div class="panel-header"><h3>Recent Activity</h3></div>
        <div class="activity-list" id="activity-list">
          ${Array.from({ length: 4 }).map(() => `<div class="skeleton" style="height:44px;margin-bottom:8px;"></div>`).join('')}
        </div>
      </div>
    </div>

    <div class="dash-grid">
      <div class="glass-card panel">
        <div class="panel-header"><h3>Devices</h3></div>
        <div class="chart-wrap" style="height:220px;"><canvas id="chart-devices"></canvas></div>
      </div>
      <div class="glass-card panel">
        <div class="panel-header"><h3>Top Countries</h3></div>
        <div class="chart-wrap" style="height:220px;"><canvas id="chart-countries"></canvas></div>
      </div>
    </div>
  `;

  destroyCharts();
  await loadDashboardData('30d');

  document.getElementById('range-tabs').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-range]');
    if (!btn) return;
    document.querySelectorAll('#range-tabs .panel-tab').forEach((t) => t.classList.remove('active'));
    btn.classList.add('active');
    await loadDashboardData(btn.dataset.range);
  });

  return () => destroyCharts();
}

function destroyCharts() {
  chartInstances.forEach((c) => c.destroy());
  chartInstances = [];
}

async function loadDashboardData(range) {
  let data;
  try {
    data = await apiFetch(`/analytics?range=${range}`);
  } catch (err) {
    toast.error('Failed to load analytics', err.message);
    return;
  }

  paintStatCards(data.totals, data.latest);
  paintMiniCards(data.latest);
  paintActivity(data.latest);
  paintTrafficChart(data.timeseries);
  paintDeviceChart(data.devices);
  paintCountryChart(data.countries);
}

function paintStatCards(totals, latest) {
  const cards = [
    { label: 'Subscribers', value: totals.subscribers, icon: 'users', color: 'violet' },
    { label: 'Videos', value: totals.videos, icon: 'clapperboard', color: 'teal' },
    { label: 'Feedback', value: totals.feedback, icon: 'message-square', color: 'warn' },
    { label: 'Downloads', value: totals.downloads, icon: 'download', color: 'pink' },
  ];
  document.getElementById('stats-grid').innerHTML = cards.map((c) => `
    <div class="glass-card stat-card">
      <div class="stat-card-top">
        <div class="stat-icon ${c.color}"><svg data-lucide="${c.icon}"></svg></div>
      </div>
      <div class="stat-value">${formatNumber(c.value)}</div>
      <div class="stat-label">${c.label}</div>
    </div>
  `).join('');
  refreshIcons();
}

function paintMiniCards(latest) {
  const items = [
    {
      label: 'Latest Subscriber',
      icon: 'user-plus',
      title: latest.subscriber?.email || 'No subscribers yet',
      sub: latest.subscriber ? timeAgo(latest.subscriber.subscribed_at) : '—',
    },
    {
      label: 'Latest Feedback',
      icon: 'message-circle',
      title: latest.feedback ? `${escapeHTML(latest.feedback.name)}` : 'No feedback yet',
      sub: latest.feedback ? timeAgo(latest.feedback.created_at) : '—',
    },
    {
      label: 'Latest Video',
      icon: 'play',
      title: latest.video?.title || 'No videos yet',
      sub: latest.video ? timeAgo(latest.video.created_at) : '—',
    },
  ];
  document.getElementById('mini-cards-grid').innerHTML = items.map((i) => `
    <div class="glass-card mini-card">
      <div class="mini-card-icon"><svg data-lucide="${i.icon}"></svg></div>
      <div>
        <div class="mini-card-label">${i.label}</div>
        <div class="mini-card-title">${escapeHTML(i.title)}</div>
        <div class="mini-card-sub">${i.sub}</div>
      </div>
    </div>
  `).join('');
  refreshIcons();
}

function paintActivity(latest) {
  const events = [];
  if (latest.video) events.push({ icon: 'clapperboard', text: `New video <strong>${escapeHTML(latest.video.title)}</strong> added`, time: latest.video.created_at });
  if (latest.subscriber) events.push({ icon: 'user-plus', text: `<strong>${escapeHTML(latest.subscriber.email)}</strong> subscribed`, time: latest.subscriber.subscribed_at });
  if (latest.feedback) events.push({ icon: 'message-square', text: `Feedback received from <strong>${escapeHTML(latest.feedback.name)}</strong>`, time: latest.feedback.created_at });

  const list = document.getElementById('activity-list');
  if (events.length === 0) {
    list.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg><h3>No activity yet</h3></div>`;
    return;
  }

  events.sort((a, b) => new Date(b.time) - new Date(a.time));
  list.innerHTML = events.map((e) => `
    <div class="activity-item">
      <div class="activity-dot"><svg data-lucide="${e.icon}"></svg></div>
      <div class="activity-body">
        <div class="activity-title">${e.text}</div>
        <div class="activity-meta">${timeAgo(e.time)}</div>
      </div>
    </div>
  `).join('');
  refreshIcons();
}

function paintTrafficChart(timeseries) {
  const ctx = document.getElementById('chart-traffic');
  const labels = timeseries.map((t) => new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  chartInstances.push(new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Visitors',
          data: timeseries.map((t) => t.visitors),
          borderColor: '#7B5CFF',
          backgroundColor: 'rgba(123,92,255,0.15)',
          fill: true,
          tension: 0.35,
          pointRadius: 0,
        },
        {
          label: 'Page Views',
          data: timeseries.map((t) => t.page_views),
          borderColor: '#00E5C7',
          backgroundColor: 'rgba(0,229,199,0.1)',
          fill: true,
          tension: 0.35,
          pointRadius: 0,
        },
      ],
    },
    options: chartBaseOptions(),
  }));
}

function paintDeviceChart(devices) {
  const ctx = document.getElementById('chart-devices');
  chartInstances.push(new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: devices.length ? devices.map((d) => d.device) : ['No data'],
      datasets: [{
        data: devices.length ? devices.map((d) => d.visitors) : [1],
        backgroundColor: ['#7B5CFF', '#00E5C7', '#FFB020', '#FF4D6D'],
        borderWidth: 0,
      }],
    },
    options: { plugins: { legend: { position: 'bottom', labels: { color: '#9297AC', boxWidth: 10, font: { size: 11 } } } }, cutout: '65%' },
  }));
}

function paintCountryChart(countries) {
  const ctx = document.getElementById('chart-countries');
  const top = [...countries].sort((a, b) => b.visitors - a.visitors).slice(0, 6);
  chartInstances.push(new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top.length ? top.map((c) => c.country) : ['No data'],
      datasets: [{
        data: top.length ? top.map((c) => c.visitors) : [0],
        backgroundColor: '#7B5CFF',
        borderRadius: 6,
        maxBarThickness: 28,
      }],
    },
    options: { ...chartBaseOptions(), indexAxis: 'y', plugins: { legend: { display: false } } },
  }));
}

function chartBaseOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: '#9297AC', boxWidth: 10, font: { size: 11 } } },
    },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#5b5f74', font: { size: 11 } } },
      y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#5b5f74', font: { size: 11 } } },
    },
  };
}
