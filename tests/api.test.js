/**
 * End-to-end API tests for the Smart Vending Machine Store.
 *
 * Run with:  npm test
 *
 * The suite starts the real Express app on an ephemeral port with its own
 * temporary SQLite database and exercises every scenario from the project
 * specification:
 *
 *   1.  Buy a ₹20 drink with exactly ₹20
 *   2.  Buy a ₹40 drink with ₹50 and get ₹10 change
 *   3.  Try to buy a ₹125 drink with ₹50 (insufficient balance)
 *   4.  Try to purchase a sold-out / unavailable product
 *   5.  Cancel a transaction and refund the full balance
 *   6.  Buy multiple products in one transaction
 *   7.  Stock only decreases after successful purchases
 *   8.  Prices and stock persist after restarting the app
 *   9.  The UI is responsive (static checks) and works on mobile/desktop
 *   10. Rapid repeated clicks never create duplicate purchases
 *
 *   + admin authentication, invalid codes, invalid denominations.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DB_PATH = path.join(ROOT, 'data', 'test-vending.db');

/**
 * Storage backend under test.
 *
 *   npm test                  → SQLite (default, no setup needed)
 *   npm run test:pg           → PostgreSQL (script/test-pg.js boots a local PGlite server)
 *   TEST_DB_URL=postgres://…  → any other PostgreSQL server
 */
const TEST_DB_URL = process.env.TEST_DB_URL || null;
const APP_OPTIONS = TEST_DB_URL ? { databaseUrl: TEST_DB_URL } : { dbPath: DB_PATH };

const results = [];
let currentSection = '';

function section(name) {
  currentSection = name;
  console.log(`\n  ${name}`);
}

function check(label, condition, extra = '') {
  const ok = Boolean(condition);
  results.push({ label: `${currentSection} → ${label}`, ok });
  console.log(`    ${ok ? '✔ PASS' : '✘ FAIL'}  ${label}${!ok && extra ? `  [${extra}]` : ''}`);
  return ok;
}

/* ------------------------------ HTTP client ----------------------------- */

class Client {
  constructor(base) {
    this.base = base;
    this.cookie = null;
  }

  async request(pathname, { method = 'GET', body, headers = {} } = {}) {
    const res = await fetch(this.base + pathname, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const match = setCookie.match(/vm_session=([^;]+)/);
      if (match) this.cookie = `vm_session=${match[1]}`;
    }

    let data = null;
    try {
      data = await res.json();
    } catch {
      /* non JSON */
    }
    return { status: res.status, data, headers: res.headers };
  }
}

const listen = (app) =>
  new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });

/** The machine refuses new purchases for a moment after dispensing
 *  (duplicate-click guard) – tests wait for it just like the UI animation does. */
const DISPENSE_LOCK_MS = Number(process.env.DISPENSE_LOCK_MS) || 1200;
const waitForMachine = () => new Promise((resolve) => setTimeout(resolve, DISPENSE_LOCK_MS + 200));

let activeServer = null;
let activeDb = null;

const closeServer = (server) => new Promise((resolve) => server.close(resolve));

/** SQLite only – with PostgreSQL the runner (scripts/test-pg.js) resets the schema. */
function deleteDbFiles() {
  if (TEST_DB_URL) return;
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${DB_PATH}${suffix}`;
    try {
      if (fs.existsSync(file)) fs.rmSync(file);
    } catch (err) {
      console.warn(`    (could not delete ${path.basename(file)}: ${err.message})`);
    }
  }
}

/** Close everything first – Windows will not delete an open database file. */
async function shutdown(server, db) {
  try {
    if (server) await closeServer(server);
  } catch {
    /* ignore */
  }
  try {
    if (db) await db.close();
  } catch {
    /* ignore */
  }
}

/* --------------------------------- main --------------------------------- */

async function main() {
  console.log('  Smart Vending Machine Store — automated tests');

  deleteDbFiles();

  let { app, db } = await createApp(APP_OPTIONS);
  let server = await listen(app);
  activeServer = server;
  activeDb = db;
  let base = `http://127.0.0.1:${server.address().port}`;

  const machine = new Client(base);
  const other = new Client(base); // second customer

  const getProducts = async () => (await machine.request('/api/machine/products')).data.products;
  const stockOf = async (code, token) => {
    const res = await fetch(`${base}/api/admin/products`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    return data.products.find((p) => p.code === code).stock;
  };

  // Admin credentials (defaults created by the server on first boot)
  const loginRes = await fetch(`${base}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.ADMIN_USERNAME || 'admin', password: process.env.ADMIN_PASSWORD || 'admin123' }),
  });
  const loginData = await loginRes.json();
  const adminHeaders = { Authorization: `Bearer ${loginData.token}` };
  const adminJson = async (pathname, opts = {}) =>
    fetch(base + pathname, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...adminHeaders, ...(opts.headers || {}) },
    }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));

  const adminPut = (id, payload) =>
    adminJson(`/api/admin/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  const adminProducts = async () => (await adminJson('/api/admin/products')).data.products;

  /* ==================================================================== */
  section('T0. Admin authentication & seed data');
  check('admin login returns a token', Boolean(loginData.token));
  const noAuth = await fetch(`${base}/api/admin/stats`);
  check('admin API rejects requests without a token (401)', noAuth.status === 401);
  const badLogin = await fetch(`${base}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'wrong-password' }),
  });
  check('wrong password is rejected (401)', badLogin.status === 401);
  const seed = await adminProducts();
  check('12 sample products are seeded', seed.length === 12, `got ${seed.length}`);
  check(
    'sample prices match the specification (A1 = ₹40, B3 = ₹125, C3 = ₹20)',
    seed.find((p) => p.code === 'A1').pricePaise === 4000 &&
      seed.find((p) => p.code === 'B3').pricePaise === 12500 &&
      seed.find((p) => p.code === 'C3').pricePaise === 2000
  );

  /* ==================================================================== */
  section('T1. Buy a ₹20 drink with exactly ₹20');
  {
    await waitForMachine();
    const before = (await getProducts()).find((p) => p.code === 'C3').stock;
    const ins = await machine.request('/api/machine/insert', { method: 'POST', body: { value: 2000 } });
    check('insert ₹20 → balance ₹20', ins.data.balancePaise === 2000, `got ${ins.data.balancePaise}`);

    const buy = await machine.request('/api/machine/purchase', { method: 'POST', body: { code: 'C3' } });
    check('purchase succeeds', buy.status === 200 && buy.data.ok === true, JSON.stringify(buy.data));
    check('no change when the amount matches exactly', buy.data.changePaise === 0, `change ${buy.data.changePaise}`);
    check('server balance is now ₹0', buy.data.balancePaise === 0);

    const after = (await getProducts()).find((p) => p.code === 'C3').stock;
    check('stock decreased by exactly 1', after === before - 1, `${before} → ${after}`);
    check('product is waiting in the collection tray', buy.data.tray.length === 1);

    const collect = await machine.request('/api/machine/collect', { method: 'POST', body: {} });
    check('collect finishes the transaction', collect.status === 200 && collect.data.changePaise === 0);
    check('tray is emptied after collecting', collect.data.collected.length === 1);
  }

  /* ==================================================================== */
  section('T2. Buy a ₹40 drink with ₹50 → ₹10 change');
  {
    await waitForMachine();
    await machine.request('/api/machine/insert', { method: 'POST', body: { value: 2000 } });
    await machine.request('/api/machine/insert', { method: 'POST', body: { value: 2000 } });
    const ins = await machine.request('/api/machine/insert', { method: 'POST', body: { value: 1000 } });
    check('₹20 + ₹20 + ₹10 = ₹50 inserted', ins.data.balancePaise === 5000, `got ${ins.data.balancePaise}`);

    const buy = await machine.request('/api/machine/purchase', { method: 'POST', body: { code: 'A1' } });
    check('purchase of Coca-Cola succeeds', buy.status === 200, JSON.stringify(buy.data));
    check('change is exactly ₹10', buy.data.changePaise === 1000, `change ${buy.data.changePaise}`);
    check('change breakdown is a single ₹10 coin', buy.data.changeBreakdown?.length === 1 && buy.data.changeBreakdown[0].paise === 1000);

    const collect = await machine.request('/api/machine/collect', { method: 'POST', body: {} });
    check('₹10 is returned when collecting', collect.data.changePaise === 1000);
    check('balance resets to ₹0 after collecting', collect.data.balancePaise === 0);
  }

  /* ==================================================================== */
  section('T3. Try to buy a ₹125 drink with only ₹50');
  {
    await waitForMachine();
    await machine.request('/api/machine/insert', { method: 'POST', body: { value: 2000 } });
    await machine.request('/api/machine/insert', { method: 'POST', body: { value: 2000 } });
    await machine.request('/api/machine/insert', { method: 'POST', body: { value: 1000 } });

    const beforeStock = (await getProducts()).find((p) => p.code === 'B3').stock;
    const buy = await machine.request('/api/machine/purchase', { method: 'POST', body: { code: 'B3' } });

    check('purchase is rejected with 402', buy.status === 402, `status ${buy.status}`);
    check('error code is INSUFFICIENT_BALANCE', buy.data.error === 'INSUFFICIENT_BALANCE');
    check('message states the missing amount (₹75)', /75/.test(buy.data.message), buy.data.message);
    check('money is NOT deducted on failure', buy.data.balancePaise === undefined);
    const state = await machine.request('/api/machine/state');
    check('session balance still ₹50', state.data.balancePaise === 5000, `got ${state.data.balancePaise}`);
    const afterStock = (await getProducts()).find((p) => p.code === 'B3').stock;
    check('stock is NOT reduced on failure', afterStock === beforeStock, `${beforeStock} → ${afterStock}`);
    await machine.request('/api/machine/collect', { method: 'POST', body: {} });
  }

  /* ==================================================================== */
  section('T4. Sold-out and unavailable products');
  {
    await waitForMachine();
    const products = await adminProducts();
    const sting = products.find((p) => p.code === 'B4');
    await adminPut(sting.id, { stock: 0 });

    await other.request('/api/machine/insert', { method: 'POST', body: { value: 5000 } });
    const buy = await other.request('/api/machine/purchase', { method: 'POST', body: { code: 'B4' } });
    check('sold-out product is rejected with 409', buy.status === 409, `status ${buy.status}`);
    check('error code is SOLD_OUT', buy.data.error === 'SOLD_OUT');
    const state = await other.request('/api/machine/state');
    check('balance is untouched after a sold-out attempt', state.data.balancePaise === 5000);

    const pepsi = (await adminProducts()).find((p) => p.code === 'A2');
    await adminPut(pepsi.id, { available: false });
    const off = await other.request('/api/machine/purchase', { method: 'POST', body: { code: 'A2' } });
    check('unavailable product is rejected', off.status === 409 && off.data.error === 'UNAVAILABLE', JSON.stringify(off.data));
    const publicProducts = (await other.request('/api/machine/products')).data.products;
    check('unavailable product is flagged in the product list',
      publicProducts.find((p) => p.code === 'A2').available === false);

    // restore
    await adminPut(sting.id, { stock: 14 });
    await adminPut(pepsi.id, { available: true });
    await other.request('/api/machine/cancel', { method: 'POST', body: {} });
  }

  /* ==================================================================== */
  section('T5. Cancel a transaction and refund the full balance');
  {
    const beforeTxn = (await adminJson('/api/admin/transactions?limit=500')).data.total;
    await machine.request('/api/machine/insert', { method: 'POST', body: { value: 2000 } });
    await machine.request('/api/machine/insert', { method: 'POST', body: { value: 500 } });

    const cancel = await machine.request('/api/machine/cancel', { method: 'POST', body: {} });
    check('refund equals the full inserted balance (₹25)', cancel.data.refundPaise === 2500, `got ${cancel.data.refundPaise}`);
    check('refund breakdown uses ₹20 + ₹5', JSON.stringify(cancel.data.refundBreakdown.map((p) => p.paise)) === JSON.stringify([2000, 500]));
    check('balance resets after the refund', cancel.data.balancePaise === 0);

    const afterTxn = (await adminJson('/api/admin/transactions?limit=500')).data;
    check('cancellation is recorded in the history', afterTxn.total === beforeTxn + 1);
    check('latest entry has status "cancelled"', afterTxn.transactions[0].status === 'cancelled');
  }

  /* ==================================================================== */
  section('T6. Buy multiple products in one transaction');
  {
    await waitForMachine();
    await machine.request('/api/machine/insert', { method: 'POST', body: { value: 5000 } });
    await machine.request('/api/machine/insert', { method: 'POST', body: { value: 5000 } });

    const first = await machine.request('/api/machine/purchase', { method: 'POST', body: { code: 'A2' } });
    await waitForMachine();
    const second = await machine.request('/api/machine/purchase', { method: 'POST', body: { code: 'C4' } });
    check('first product (₹40) bought', first.status === 200 && first.data.balancePaise === 6000, `balance ${first.data.balancePaise}`);
    check('second product (₹20) bought in the same session', second.status === 200 && second.data.balancePaise === 4000, `balance ${second.data.balancePaise}`);
    check('both products are in the tray', (second.data.tray || []).length === 2, `tray ${(second.data.tray || []).length}`);

    const collect = await machine.request('/api/machine/collect', { method: 'POST', body: {} });
    check('change of ₹40 is returned at the end', collect.data.changePaise === 4000, `got ${collect.data.changePaise}`);
    check('change summary shows the denominations', collect.data.changeSummary.includes('₹20'), collect.data.changeSummary);
    check('tray cleared after collecting', (collect.data.collected || []).length === 2, JSON.stringify(collect.data));
  }

  /* ==================================================================== */
  section('T7. Stock only decreases after successful purchases');
  {
    await waitForMachine();
    const before = (await getProducts()).find((p) => p.code === 'A3').stock;

    // failed attempt: no money inserted
    const poor = await other.request('/api/machine/purchase', { method: 'POST', body: { code: 'A3' } });
    check('purchase without money fails', poor.status === 402);
    check('stock unchanged after the failed attempt', (await getProducts()).find((p) => p.code === 'A3').stock === before);

    // invalid code
    const invalid = await other.request('/api/machine/purchase', { method: 'POST', body: { code: 'ZZ' } });
    check('invalid product code returns 404', invalid.status === 404 && invalid.data.error === 'INVALID_CODE');

    // successful attempt (A3 costs ₹40 → two ₹20 coins)
    await other.request('/api/machine/insert', { method: 'POST', body: { value: 2000 } });
    await other.request('/api/machine/insert', { method: 'POST', body: { value: 2000 } });
    const ok = await other.request('/api/machine/purchase', { method: 'POST', body: { code: 'A3' } });
    check('stock decreases only after a successful purchase', (await getProducts()).find((p) => p.code === 'A3').stock === before - 1);
    check('successful purchase returns a transaction id', /^TXN-/.test(ok.data.txnId), ok.data.txnId);
    await other.request('/api/machine/cancel', { method: 'POST', body: {} });
  }

  /* ==================================================================== */
  section('T8. Invalid inputs & denomination validation');
  {
    await waitForMachine();
    const badCoin = await machine.request('/api/machine/insert', { method: 'POST', body: { value: 1234 } });
    check('non-whitelisted denomination is rejected (400)', badCoin.status === 400, `status ${badCoin.status}`);
    const floaty = await machine.request('/api/machine/insert', { method: 'POST', body: { value: 10.5 } });
    check('fractional / invalid values are rejected', floaty.status === 400);
    const empty = await machine.request('/api/machine/purchase', { method: 'POST', body: {} });
    check('missing product code is rejected', empty.status === 400 || empty.status === 404, `status ${empty.status}`);
    const state = await machine.request('/api/machine/state');
    check('balance stayed ₹0', state.data.balancePaise === 0, `got ${state.data.balancePaise}`);
  }

  /* ==================================================================== */
  section('T9. Admin edits (price & stock) apply to the machine');
  {
    const fanta = (await adminProducts()).find((p) => p.code === 'B1');
    await adminPut(fanta.id, { price: 45, stock: 3 });
    const after = (await getProducts()).find((p) => p.code === 'B1');
    check('price edited to ₹45 is visible on the machine', after.pricePaise === 4500, `got ${after.pricePaise}`);
    check('stock edited to 3 is visible on the machine', after.stock === 3);
    check('low-stock flag appears at the threshold', after.lowStock === true);
    const invalidPrice = await adminPut(fanta.id, { price: -5 });
    check('invalid price is rejected by the admin API', invalidPrice.status === 400);
    const invalidStock = await adminPut(fanta.id, { stock: -1 });
    check('negative stock is rejected by the admin API', invalidStock.status === 400);
    await adminPut(fanta.id, { price: 35, stock: 9 });
  }

  /* ==================================================================== */
  section('T10. Rapid repeated clicks never duplicate a purchase');
  {
    await waitForMachine();
    const client = new Client(base);
    await client.request('/api/machine/insert', { method: 'POST', body: { value: 2000 } });
    await client.request('/api/machine/insert', { method: 'POST', body: { value: 2000 } });
    const before = (await getProducts()).find((p) => p.code === 'A4').stock;

    const attempts = await Promise.all(
      Array.from({ length: 6 }, () => client.request('/api/machine/purchase', { method: 'POST', body: { code: 'A4' } }))
    );
    const successes = attempts.filter((a) => a.status === 200 && a.data && a.data.ok);
    const rejected = attempts.filter((a) => a.status !== 200);

    check('exactly one of six simultaneous clicks succeeds', successes.length === 1, `successes=${successes.length} [${attempts.map((a) => a.status).join(',')}]`);
    check('the others are refused (busy / insufficient)', rejected.length === 5, `rejected=${rejected.length}`);
    const after = (await getProducts()).find((p) => p.code === 'A4').stock;
    check('stock decreased exactly once', after === before - 1, `${before} → ${after}`);
    check('balance spent exactly once (₹40)', successes[0] && successes[0].data.balancePaise === 0, `balance ${successes[0] ? successes[0].data.balancePaise : 'n/a'}`);
    await client.request('/api/machine/collect', { method: 'POST', body: {} });
  }

  /* ==================================================================== */
  section('T11. Responsive / static UI checks');
  {
    const indexHtml = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
    check('machine page has a responsive viewport meta tag', /<meta[^>]+viewport[^>]+width=device-width/.test(indexHtml));
    const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'machine.css'), 'utf8');
    const breakpoints = (css.match(/@media\s*\([^)]*max-width[^)]*\)/g) || []).length;
    check('stylesheet contains responsive breakpoints', breakpoints >= 3, `${breakpoints} found`);
    check('reduced-motion support is present', /prefers-reduced-motion/.test(css));
    const adminHtml = fs.readFileSync(path.join(ROOT, 'public', 'admin', 'index.html'), 'utf8');
    check('admin dashboard has a responsive viewport meta tag', /viewport[^>]+width=device-width/.test(adminHtml));
    const files = [
      'public/js/app.js',
      'public/js/dispenser.js',
      'public/js/components/productGrid.js',
      'public/css/machine.css',
      'public/img/products/a1.svg',
      'public/img/products/c4.svg',
      'README.md',
    ];
    for (const file of files) {
      check(`required file exists: ${file}`, fs.existsSync(path.join(ROOT, file)));
    }
  }

  /* ==================================================================== */
  section('T12. Persistence across an application restart');
  {
    // snapshot current data
    const productsBefore = await getProducts();
    const statsBefore = (await adminJson('/api/admin/stats')).data;
    const countBefore = (await adminJson('/api/admin/transactions?limit=500')).data.total;

    // restart the app (same database file)
    await shutdown(server, db);
    await new Promise((resolve) => setTimeout(resolve, 150));

    ({ app, db } = await createApp(APP_OPTIONS));
    activeDb = db;
    server = await listen(app);
    activeServer = server;
    base = `http://127.0.0.1:${server.address().port}`;

    const login = await fetch(`${base}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: process.env.ADMIN_USERNAME || 'admin', password: process.env.ADMIN_PASSWORD || 'admin123' }),
    }).then((r) => r.json());
    const headers = { Authorization: `Bearer ${login.token}` };

    const productsAfter = await fetch(`${base}/api/machine/products`).then((r) => r.json());
    const statsAfter = await fetch(`${base}/api/admin/stats`, { headers }).then((r) => r.json());
    const countAfter = await fetch(`${base}/api/admin/transactions?limit=500`, { headers }).then((r) => r.json());

    check('stock values survive a restart',
      productsBefore.every((p) => productsAfter.products.find((q) => q.code === p.code).stock === p.stock));
    check('transaction history survives a restart', countAfter.total === countBefore, `${countBefore} → ${countAfter.total}`);
    check('revenue survives a restart', statsAfter.revenuePaise === statsBefore.revenuePaise);
    check('the catalogue is not re-seeded', productsAfter.products.length === 12);
  }

  /* ==================================================================== */
  section('T13. Balance is unlimited (no ₹1000 cap)');
  {
    const client = new Client(base);
    // 40 × ₹50 = ₹2000, double the old ₹1000 cap – every coin must be accepted.
    let accepted = 0;
    for (let i = 0; i < 40; i += 1) {
      const coin = await client.request('/api/machine/insert', { method: 'POST', body: { value: 5000 } });
      if (coin.status === 200 && coin.data && coin.data.ok) accepted += 1;
    }
    check('all 40 × ₹50 coins are accepted (no 409 BALANCE_LIMIT)', accepted === 40, `accepted ${accepted}/40`);

    const state = await client.request('/api/machine/state');
    check('balance reaches ₹2000, past the old ₹1000 cap', state.data.balancePaise === 200000, `got ${state.data.balancePaise}`);

    // Change must still be computed correctly on a large balance.
    const buy = await client.request('/api/machine/purchase', { method: 'POST', body: { code: 'B3' } }); // ₹125
    check('a ₹125 purchase succeeds on the large balance', buy.status === 200 && buy.data.ok, `status ${buy.status}`);
    check('change of ₹1875 is returned', buy.data && buy.data.changePaise === 187500, `got ${buy.data && buy.data.changePaise}`);

    // The refund of the remaining balance must also work at this scale.
    const cancel = await client.request('/api/machine/cancel', { method: 'POST', body: {} });
    check('cancelling refunds the whole ₹1875', cancel.data && cancel.data.refundPaise === 187500, `got ${cancel.data && cancel.data.refundPaise}`);
    check('balance resets to ₹0 after the refund', cancel.data && cancel.data.balancePaise === 0);
  }

  /* ------------------------------- summary ------------------------------ */

  await shutdown(server, db);

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log('\n  ─────────────────────────────────────────────');
  console.log(`  RESULT: ${passed} passed, ${failed} failed, ${results.length} total`);
  console.log('  ─────────────────────────────────────────────\n');

  deleteDbFiles();

  if (failed > 0) {
    results.filter((r) => !r.ok).forEach((r) => console.error(`  ✘ ${r.label}`));
    process.exit(1);
  }
  process.exit(0);
}

main().catch(async (err) => {
  console.error('\n  Test suite crashed:', err);
  await shutdown(activeServer, activeDb);
  deleteDbFiles();
  process.exit(1);
});
