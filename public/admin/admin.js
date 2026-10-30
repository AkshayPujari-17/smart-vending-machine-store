/**
 * Admin dashboard logic.
 *
 * Auth token is kept in sessionStorage (never in the page source / localStorage
 * shared with other tabs). Every request sends it as a Bearer token; the
 * server validates the signature and the expiry on every call.
 */

const TOKEN_KEY = 'smartVending.adminToken';

let token = sessionStorage.getItem(TOKEN_KEY) || '';
let txnOffset = 0;
const TXN_PAGE = 25;

/* ------------------------------ utilities ------------------------------ */

const $ = (sel) => document.querySelector(sel);

function toast(message, tone = 'info', timeout = 3500) {
  const host = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast toast--${tone}`;
  el.textContent = message;
  host.appendChild(el);
  const remove = () => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 300);
  };
  setTimeout(remove, timeout);
  el.addEventListener('click', remove);
}

async function call(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Could not reach the server. Is it running?');
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }

  if (res.status === 401 && path !== '/api/admin/login') {
    logout(false);
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) {
    const error = new Error(data?.message || `Request failed (${res.status})`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

const api = {
  login: (username, password) =>
    fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Login failed');
      return data;
    }),
  me: () => call('/api/admin/me'),
  products: () => call('/api/admin/products'),
  createProduct: (payload) => call('/api/admin/products', { method: 'POST', body: payload }),
  updateProduct: (id, payload) => call(`/api/admin/products/${id}`, { method: 'PUT', body: payload }),
  uploadImage: (id, dataUrl) => call(`/api/admin/products/${id}/image`, { method: 'PUT', body: { dataUrl } }),
  deleteProduct: (id) => call(`/api/admin/products/${id}`, { method: 'DELETE' }),
  stats: () => call('/api/admin/stats'),
  transactions: (limit, offset) => call(`/api/admin/transactions?limit=${limit}&offset=${offset}`),
  changePassword: (currentPassword, newPassword) =>
    call('/api/admin/password', { method: 'POST', body: { currentPassword, newPassword } }),
};

const rupees = (paise) =>
  `₹${((paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

/* -------------------------------- auth --------------------------------- */

function showLogin() {
  $('#loginView').hidden = false;
  $('#dashView').hidden = true;
}

function showDashboard(username) {
  $('#loginView').hidden = true;
  $('#dashView').hidden = false;
  $('#userChip').textContent = username || 'admin';
}

function logout(notify = true) {
  token = '';
  sessionStorage.removeItem(TOKEN_KEY);
  showLogin();
  if (notify) toast('Logged out.', 'info', 2000);
}

$('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const btn = $('#loginBtn');
  const errorEl = $('#loginError');
  errorEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Signing in…';

  try {
    const data = await api.login($('#username').value.trim(), $('#password').value);
    token = data.token;
    sessionStorage.setItem(TOKEN_KEY, token);
    await bootDashboard();
    toast(`Welcome back, ${data.username}.`, 'success');
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
});

$('#logoutBtn').addEventListener('click', () => logout(true));

/* ------------------------------- tabs ---------------------------------- */

document.getElementById('tabs').addEventListener('click', async (event) => {
  const tab = event.target.closest('.tab');
  if (!tab) return;

  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t === tab));
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.hidden = panel.id !== `tab-${tab.dataset.tab}`;
  });

  if (tab.dataset.tab === 'sales') await loadStats();
  if (tab.dataset.tab === 'history') await loadTransactions(true);
});

/* ----------------------------- products -------------------------------- */

function statusBadge(product) {
  if (!product.available) return '<span class="badge badge--off">Unavailable</span>';
  if (product.stock <= 0) return '<span class="badge badge--out">Sold out</span>';
  if (product.lowStock) return `<span class="badge badge--low">Low · ${product.stock}</span>`;
  return `<span class="badge badge--ok">In stock · ${product.stock}</span>`;
}

function productRow(product) {
  return `
    <tr data-id="${product.id}" data-code="${escapeHtml(product.code)}">
      <td>
        <img class="thumb" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}"
             onerror="this.style.opacity=.3" />
        <label class="btn btn--ghost btn--sm" style="display:inline-block;margin-top:4px;cursor:pointer;">
          Change
          <input type="file" accept="image/*" hidden data-role="image" />
        </label>
      </td>
      <td><input class="input--code" data-field="code" value="${escapeHtml(product.code)}" maxlength="6" /></td>
      <td><input data-field="name" value="${escapeHtml(product.name)}" maxlength="80" style="min-width:190px" /></td>
      <td><input class="input--price" data-field="price" type="number" min="0" max="1000" step="1" value="${product.price}" /></td>
      <td><input class="input--stock" data-field="stock" type="number" min="0" max="9999" value="${product.stock}" /></td>
      <td><input class="input--stock" data-field="lowStockThreshold" type="number" min="0" max="9999" value="${product.lowStockThreshold}" /></td>
      <td data-cell="status">${statusBadge(product)}</td>
      <td class="col-actions">
        <div class="actions">
          <label class="switch" title="Available / unavailable">
            <input type="checkbox" data-field="available" ${product.available ? 'checked' : ''} /><i></i>
          </label>
          <button class="btn btn--primary btn--sm" data-action="save">Save</button>
          <button class="btn btn--danger btn--sm" data-action="delete">Delete</button>
        </div>
      </td>
    </tr>`;
}

async function loadProducts() {
  const data = await api.products();
  const body = $('#productsBody');
  body.innerHTML = data.products.map(productRow).join('');
  $('#productsEmpty').hidden = data.products.length > 0;
}

$('#productsBody').addEventListener('change', async (event) => {
  const input = event.target;
  if (input.dataset.role === 'image') {
    const file = input.files && input.files[0];
    if (!file) return;
    const row = input.closest('tr');
    try {
      const dataUrl = await readFileAsDataUrl(file);
      await api.uploadImage(row.dataset.id, dataUrl);
      toast('Image updated.', 'success');
      await loadProducts();
    } catch (err) {
      toast(err.message, 'error');
    }
  }
});

$('#productsBody').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const row = button.closest('tr');
  const id = row.dataset.id;

  if (button.dataset.action === 'save') {
    const payload = {
      code: row.querySelector('[data-field="code"]').value,
      name: row.querySelector('[data-field="name"]').value,
      price: Number(row.querySelector('[data-field="price"]').value),
      stock: Number(row.querySelector('[data-field="stock"]').value),
      lowStockThreshold: Number(row.querySelector('[data-field="lowStockThreshold"]').value),
      available: row.querySelector('[data-field="available"]').checked,
    };
    button.disabled = true;
    try {
      const result = await api.updateProduct(id, payload);
      toast(`${result.product.code} updated.`, 'success');
      await loadProducts();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      button.disabled = false;
    }
  }

  if (button.dataset.action === 'delete') {
    const code = row.querySelector('[data-field="code"]').value;
    if (!window.confirm(`Delete product ${code}? This cannot be undone.`)) return;
    try {
      await api.deleteProduct(id);
      toast(`Product ${code} deleted.`, 'success');
      await loadProducts();
    } catch (err) {
      toast(err.message, 'error');
    }
  }
});

/* --------------------------- add new product --------------------------- */

$('#toggleAddBtn').addEventListener('click', () => {
  const form = $('#addForm');
  form.hidden = !form.hidden;
  if (!form.hidden) $('#f_code').focus();
});

$('#cancelAddBtn').addEventListener('click', () => {
  $('#addForm').hidden = true;
  $('#addError').textContent = '';
});

$('#addForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const errorEl = $('#addError');
  errorEl.textContent = '';

  const payload = {
    code: $('#f_code').value,
    name: $('#f_name').value,
    price: Number($('#f_price').value),
    stock: Number($('#f_stock').value),
    lowStockThreshold: Number($('#f_threshold').value),
    available: $('#f_available').checked,
  };

  try {
    const result = await api.createProduct(payload);
    toast(`Product ${result.product.code} added.`, 'success');
    $('#addForm').reset();
    $('#f_price').value = 30;
    $('#f_stock').value = 10;
    $('#f_threshold').value = 5;
    $('#addForm').hidden = true;
    await loadProducts();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

/* -------------------------------- stats -------------------------------- */

async function loadStats() {
  try {
    const [stats, products] = await Promise.all([api.stats(), api.products()]);

    $('#statsGrid').innerHTML = `
      <div class="stat"><div class="stat__label">Total sales</div><div class="stat__value">${stats.totalSales}</div></div>
      <div class="stat stat--green"><div class="stat__label">Revenue</div><div class="stat__value">${rupees(stats.revenuePaise)}</div></div>
      <div class="stat"><div class="stat__label">Products sold</div><div class="stat__value">${stats.productsSold}</div></div>
      <div class="stat"><div class="stat__label">Units in stock</div><div class="stat__value">${stats.unitsInStock}</div></div>
      <div class="stat stat--amber"><div class="stat__label">Low stock</div><div class="stat__value">${stats.lowStockCount}</div></div>
      <div class="stat stat--red"><div class="stat__label">Sold out</div><div class="stat__value">${stats.soldOutCount}</div></div>`;

    const top = stats.topSellers || [];
    $('#topSellers').innerHTML = top.length
      ? top
          .map(
            (t) =>
              `<li><span><b>${escapeHtml(t.code)}</b> · ${escapeHtml(t.name)}</span><span class="pill pill--low">${t.sold} sold</span></li>`
          )
          .join('')
      : '<li class="empty">No sales yet — make a purchase on the machine.</li>';

    const attention = products.products.filter((p) => p.stock <= 0 || p.lowStock || !p.available);
    $('#attentionList').innerHTML = attention.length
      ? attention
          .map((p) => {
            const cls = p.stock <= 0 ? 'out' : 'low';
            const label = !p.available ? 'Off' : p.stock <= 0 ? 'Sold out' : `Low · ${p.stock}`;
            return `<li><span><b>${escapeHtml(p.code)}</b> · ${escapeHtml(p.name)}</span><span class="pill pill--${cls}">${label}</span></li>`;
          })
          .join('')
      : '<li class="empty">All products are healthy 🎉</li>';
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ---------------------------- transactions ----------------------------- */

function txnRow(t) {
  const status =
    t.status === 'completed'
      ? '<span class="badge badge--ok">Completed</span>'
      : '<span class="badge badge--low">Refunded</span>';
  return `
    <tr>
      <td><code>${escapeHtml(t.txnId)}</code></td>
      <td>${escapeHtml(t.createdAt)} UTC</td>
      <td>${escapeHtml(t.productCode || '—')}</td>
      <td>${escapeHtml(t.productName || '—')}</td>
      <td>${rupees(t.pricePaise)}</td>
      <td>${rupees(t.insertedPaise)}</td>
      <td>${rupees(t.changePaise)}</td>
      <td>${status}</td>
    </tr>`;
}

async function loadTransactions(reset = false) {
  if (reset) {
    txnOffset = 0;
    $('#txnBody').innerHTML = '';
  }
  try {
    const data = await api.transactions(TXN_PAGE, txnOffset);
    $('#txnBody').insertAdjacentHTML(
      'beforeend',
      data.transactions.map(txnRow).join('')
    );
    txnOffset += data.transactions.length;
    $('#txnCount').textContent = `${txnOffset} of ${data.total} shown`;
    $('#loadMoreBtn').disabled = txnOffset >= data.total;
    if (!data.transactions.length && reset) {
      $('#txnBody').innerHTML =
        '<tr><td colspan="8" style="text-align:center;color:var(--muted)">No transactions yet.</td></tr>';
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

$('#loadMoreBtn').addEventListener('click', () => loadTransactions(false));
$('#refreshTxnBtn').addEventListener('click', () => loadTransactions(true));
$('#refreshStatsBtn').addEventListener('click', loadStats);

/* ------------------------------ password ------------------------------- */

$('#passwordForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const errEl = $('#passError');
  const okEl = $('#passOk');
  errEl.textContent = '';
  okEl.textContent = '';
  try {
    const result = await api.changePassword($('#curPass').value, $('#newPass').value);
    okEl.textContent = result.message;
    $('#passwordForm').reset();
    toast('Password updated.', 'success');
  } catch (err) {
    errEl.textContent = err.message;
  }
});

/* -------------------------------- boot --------------------------------- */

async function bootDashboard() {
  const me = await api.me();
  showDashboard(me.username);
  await loadProducts();
  await loadStats();
  await loadTransactions(true);
}

(async function init() {
  if (!token) {
    showLogin();
    return;
  }
  try {
    await bootDashboard();
  } catch (err) {
    if (err.status !== 401) toast(err.message, 'error');
    showLogin();
  }
})();
