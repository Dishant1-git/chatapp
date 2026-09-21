import { clearDeviceKeys } from './e2ee';

// Small fetch wrapper for the browser. Throws an Error with the server's
// friendly message so components can just show err.message.
// Pass `file` to send raw bytes (used for encrypted images).
export async function api(url, { method = 'GET', body, formData, file } = {}) {
  let response;
  try {
    response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body
        ? { 'Content-Type': 'application/json' }
        : file
          ? { 'Content-Type': 'application/octet-stream' }
          : undefined,
      body: formData || file || (body ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new Error('Cannot reach the server. Check your internet connection.');
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong. Please try again.');
    error.status = response.status;
    error.code = data.code;
    throw error;
  }

  return data;
}

// Clears the login cookie (via the backend) and goes to the login page.
// Used when the session has expired, so the login page doesn't bounce us back.
export async function logoutAndRedirect() {
  try {
    await clearDeviceKeys();
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } finally {
    window.location.href = '/login';
  }
}
