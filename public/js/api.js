/**
 * Tiny API client for the vending machine endpoints.
 * All requests are same-origin and always send the session cookie.
 */
async function request(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    const error = new Error('Could not reach the vending machine. Is the server running?');
    error.code = 'NETWORK';
    throw error;
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }

  if (!res.ok) {
    const error = new Error(data?.message || `Request failed (${res.status})`);
    error.status = res.status;
    error.code = data?.error || 'ERROR';
    error.data = data;
    throw error;
  }
  return data;
}

export const api = {
  info: () => request('/api/machine/info'),
  state: () => request('/api/machine/state'),
  products: () => request('/api/machine/products'),
  insert: (valuePaise) => request('/api/machine/insert', { method: 'POST', body: { value: valuePaise } }),
  purchase: (code) => request('/api/machine/purchase', { method: 'POST', body: { code } }),
  collect: () => request('/api/machine/collect', { method: 'POST', body: {} }),
  cancel: () => request('/api/machine/cancel', { method: 'POST', body: {} }),
};

/** Format an integer paise value as rupees for the UI. */
export function formatRupees(paise) {
  const rupees = (paise || 0) / 100;
  const text = Number.isInteger(rupees)
    ? rupees.toLocaleString('en-IN')
    : rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `₹${text}`;
}
