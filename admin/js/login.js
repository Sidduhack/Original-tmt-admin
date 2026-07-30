// admin/js/login.js
//
// Drives login.html: submits credentials to /api/login, then sets the
// returned Supabase session on the client so subsequent apiFetch calls
// carry a valid token, then redirects to index.html (or ?next=).

import { supabase, API_BASE } from './config.js';

const form = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const toggleBtn = document.getElementById('toggle-password');
const errorBox = document.getElementById('login-error');
const submitBtn = document.getElementById('login-submit');

init();

async function init() {
  // If already logged in, skip straight to the dashboard.
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    redirectAfterLogin();
    return;
  }
  document.getElementById('page-loader')?.remove();
}

toggleBtn?.addEventListener('click', () => {
  const isPw = passwordInput.type === 'password';
  passwordInput.type = isPw ? 'text' : 'password';
  toggleBtn.innerHTML = isPw
    ? '<svg data-lucide="eye-off"></svg>'
    : '<svg data-lucide="eye"></svg>';
  window.lucide?.createIcons();
});

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showError('Please enter both your email and password.');
    return;
  }

  setLoading(true);

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json();

    if (!res.ok) {
      showError(body.error || 'Invalid email or password.');
      setLoading(false);
      return;
    }

    // Hydrate the Supabase client's local session from the tokens the
    // server just verified/issued, so supabase-js's auto-refresh keeps
    // working for the rest of the admin session.
    const { error } = await supabase.auth.setSession({
      access_token: body.session.access_token,
      refresh_token: body.session.refresh_token,
    });

    if (error) {
      showError('Signed in, but couldn\u2019t start a session locally. Please try again.');
      setLoading(false);
      return;
    }

    redirectAfterLogin();
  } catch (err) {
    showError('Network error — please check your connection and try again.');
    setLoading(false);
  }
});

function redirectAfterLogin() {
  const params = new URLSearchParams(location.search);
  const next = params.get('next');
  location.href = next && next.startsWith('/admin') ? next : '/admin/index.html';
}

function showError(msg) {
  errorBox.textContent = '';
  const icon = document.createElement('span');
  icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>';
  errorBox.appendChild(icon.firstChild);
  errorBox.append(msg);
  errorBox.classList.remove('hidden');
}

function hideError() {
  errorBox.classList.add('hidden');
  errorBox.textContent = '';
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitBtn.innerHTML = isLoading ? '<span class="spinner"></span> Signing in…' : 'Sign In';
}
