// admin/js/analytics.js
//
// Analytics module: a dedicated page with the full chart set (visitors,
// page views, subscriber growth, video clicks, downloads, countries,
// devices), independent of the dashboard's summary charts.

import { apiFetch } from './auth.js';
import { toast } from './notifications.js';

let chartInstances = [];
let rangeHandler = null;

export async function render(content) {
  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Analytics</h2>
        <p>Traffic and engagement across the TMT OFFICIAL site.</p>
      </div>
      <div class="page-header-actions">
        <div class="tabs" id="analytics-range-tabs">
          <button class="panel-tab" data-range="7d">7D</button>
          <button class="panel-tab active" data-range="30d">30D</button>
          <button class="panel-tab" data-range="90d">90D</button>
        </div>
      </div>
    </div>

    <div class="glass-card panel" style="margin-bottom:18px;">
      <div class="panel-header"><h3>Visitors &amp; Page Views</h3></div>
      <div class="chart-wrap"><canvas id="a-chart-visitors"></canvas></div>
    </div>

    <div class="dash-grid">
      <div class="glass-card panel">
        <div class="panel-header"><h3>Video Clicks &amp; Downloads</h3></div>
        <div class="chart-wrap"><canvas id="a-chart-engagement"></canvas></div>
      </div>
      <div class="glass-card panel">
        <div class="panel-header"><h3>Devices</h3></div>
        <div class="chart-wrap"><canvas id="a-chart-devices"></canvas></div>
      </div>
    </div>

    <div class="glass-card panel">
      <div class="panel-header"><h3>Top Countries</h3></div>
      <div class="chart-wrap" style="height:300px;"><canvas id="a-chart-countries"></canvas></div>
    </div>
  `;

  document.getElementById('analytics-range-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-range]');
    if (!btn) return;
    document.querySelectorAll('#analytics-range-tabs .panel-tab').forEach((t) => t.classList.remove('active'));
    btn.classList.add('active');
    load(btn.dataset.range);
  });

  await load('30d');

  return () => destroyCharts();
}

function destroyCharts() {
  chartInstances.forEach((c) => c.destroy());
  chartInstances = [];
}

async function load(range) {
  let data;
  try {
    data = await apiFetch(`/analytics?range=${range}`);
  } catch (err) {
    toast.error('Failed to load analytics', err.message);
    return;
  }
  destroyCharts();

  const labels = data.timeseries.map((t) => new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

  chartInstances.push(new Chart(document.getElementById('a-chart-visitors'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Visitors', data: data.timeseries.map((t) => t.visitors), borderColor: '#7B5CFF', backgroundColor: 'rgba(123,92,255,0.15)', fill: true, tension: 0.35, pointRadius: 0 },
        { label: 'Page Views', data: data.timeseries.map((t) => t.page_views), borderColor: '#00E5C7', backgroundColor: 'rgba(0,229,199,0.1)', fill: true, tension: 0.35, pointRadius: 0 },
      ],
    },
    options: baseOptions(),
  }));

  chartInstances.push(new Chart(document.getElementById('a-chart-engagement'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Video Clicks', data: data.timeseries.map((t) => t.video_clicks), backgroundColor: '#7B5CFF', borderRadius: 4, maxBarThickness: 18 },
        { label: 'Downloads', data: data.timeseries.map((t) => t.downloads), backgroundColor: '#00E5C7', borderRadius: 4, maxBarThickness: 18 },
      ],
    },
    options: baseOptions(),
  }));

  chartInstances.push(new Chart(document.getElementById('a-chart-devices'), {
    type: 'doughnut',
    data: {
      labels: data.devices.length ? data.devices.map((d) => d.device) : ['No data'],
      datasets: [{ data: data.devices.length ? data.devices.map((d) => d.visitors) : [1], backgroundColor: ['#7B5CFF', '#00E5C7', '#FFB020', '#FF4D6D'], borderWidth: 0 }],
    },
    options: { plugins: { legend: { position: 'bottom', labels: { color: '#9297AC', boxWidth: 10, font: { size: 11 } } } }, cutout: '65%' },
  }));

  const topCountries = [...data.countries].sort((a, b) => b.visitors - a.visitors).slice(0, 10);
  chartInstances.push(new Chart(document.getElementById('a-chart-countries'), {
    type: 'bar',
    data: {
      labels: topCountries.length ? topCountries.map((c) => c.country) : ['No data'],
      datasets: [{ data: topCountries.length ? topCountries.map((c) => c.visitors) : [0], backgroundColor: '#00E5C7', borderRadius: 6, maxBarThickness: 24 }],
    },
    options: { ...baseOptions(), indexAxis: 'y', plugins: { legend: { display: false } } },
  }));
}

function baseOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { labels: { color: '#9297AC', boxWidth: 10, font: { size: 11 } } } },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#5b5f74', font: { size: 11 } } },
      y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#5b5f74', font: { size: 11 } } },
    },
  };
}
