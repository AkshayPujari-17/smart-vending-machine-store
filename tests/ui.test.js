/**
 * Browser UI tests (real Chromium/Chrome, no browser download required).
 *
 * Run with:  npm run test:ui
 *
 * Verifies the complete purchase flow inside an actual browser:
 *   - the machine renders all 12 products
 *   - inserting coins updates the LED balance display
 *   - pressing a product button dispenses into the collection tray
 *   - insufficient balance shows the required amount
 *   - RETURN COINS / CANCEL refunds the balance
 *   - rapid repeated clicks create exactly one purchase
 *   - the layout is usable at a 390×844 mobile viewport
 *   - the admin dashboard logs in and shows all products
 *   - no uncaught JavaScript errors on either page
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createApp } from '../server/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DB_PATH = path.join(ROOT, 'data', 'test-ui.db');

const BROWSER_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function deleteDbFiles() {
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${DB_PATH}${suffix}`;
    try {
      if (fs.existsSync(file)) fs.rmSync(file);
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  const executablePath = BROWSER_CANDIDATES.find((p) => fs.existsSync(p));
  if (!executablePath) {
    console.log('  ⚠ No Chrome/Edge installation found — skipping browser UI tests.');
    process.exit(0);
  }

  console.log('  Smart Vending Machine Store — browser UI tests');
  console.log(`  Browser: ${executablePath}`);

  deleteDbFiles();

  const { app, db } = await createApp({ dbPath: DB_PATH });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });

  const pageErrors = [];
  const watch = (page, name) => {
    page.on('pageerror', (err) => pageErrors.push(`${name}: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      // U2 deliberately requests an invalid denomination → the server answers
      // 400 on purpose, which Chrome logs as a resource error. Ignore that one.
      if (/status of 400 \(Bad Request\)/.test(text)) return;
      pageErrors.push(`${name} console: ${text}`);
    });
  };

  try {
    const page = await context.newPage();
    watch(page, 'machine');

    /* ================================================================== */
    section('U1. Machine renders the product grid');
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('.product').length === 12, null, { timeout: 15000 });

    check('12 product cells are rendered', (await page.locator('.product').count()) === 12);
    check('every product has a dedicated selection button', (await page.locator('.select-btn').count()) === 12);

    const imagesLoaded = await page.evaluate(async () => {
      const imgs = [...document.querySelectorAll('.product__img')];
      imgs.forEach((img) => {
        img.loading = 'eager';
      });
      await Promise.all(
        imgs.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                img.addEventListener('load', resolve, { once: true });
                img.addEventListener('error', resolve, { once: true });
                setTimeout(resolve, 4000);
              })
        )
      );
      return imgs.filter((img) => img.complete && img.naturalWidth > 0).length;
    });
    check('all 12 product images load', imagesLoaded === 12, `${imagesLoaded}/12 loaded`);
    check('balance display starts at ₹0', (await page.locator('#balanceValue').textContent())?.trim() === '₹0');
    check('instructions are shown on the status screen', /Insert coins/.test(await page.locator('#statusText').textContent()));

    /* ================================================================== */
    section('U2. Inserting coins updates the LED display');
    await page.click('.coin-btn[data-value="2000"]');
    await page.click('.coin-btn[data-value="2000"]');
    await sleep(250);
    check('₹20 + ₹20 → INSERTED AMOUNT ₹40', (await page.locator('#balanceValue').textContent())?.trim() === '₹40',
      await page.locator('#balanceValue').textContent());

    const badCoin = await page.evaluate(() =>
      fetch('/api/machine/insert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 1234 }),
      }).then((r) => r.status)
    );
    check('invalid denomination is rejected by the server', badCoin === 400);

    /* ================================================================== */
    section('U3. Pressing a product button dispenses the drink');
    await page.click('.select-btn[data-code="A1"]');
    await page.waitForSelector('.tray-item', { timeout: 15000 });
    check('the product lands in the collection tray', (await page.locator('.tray-item').count()) === 1);
    check('the tray shows the correct product name', /Coca-Cola/.test(await page.locator('.tray-item').first().textContent()));
    check('balance drops to ₹0', (await page.locator('#balanceValue').textContent())?.trim() === '₹0');
    check('success message is displayed', /ENJOY/.test(await page.locator('#statusTitle').textContent()));
    check('the flap opens and closes again after dispensing', await page.evaluate(() => !document.getElementById('flap').classList.contains('is-open')));
    check('the dispensing lock released again', await page.evaluate(() => !document.querySelector('.select-btn[data-code="A1"]').disabled));

    await page.click('#collectBtn');
    await sleep(300);
    check('COLLECT & FINISH empties the tray', (await page.locator('.tray-item').count()) === 0);
    check('thank-you message is displayed', /THANK YOU/.test(await page.locator('#statusTitle').textContent()));

    /* ================================================================== */
    section('U4. Insufficient balance shows the missing amount');
    await page.click('.coin-btn[data-value="1000"]'); // ₹10
    await page.click('.select-btn[data-code="B3"]'); // Red Bull ₹125
    await page.waitForFunction(() => /INSERT MORE COINS/.test(document.getElementById('statusTitle').textContent), null, { timeout: 8000 });
    const statusText = await page.locator('#statusText').textContent();
    check('missing amount is announced (₹115)', /115/.test(statusText), statusText);
    check('balance is untouched after the failed attempt', (await page.locator('#balanceValue').textContent())?.trim() === '₹10');
    check('no product was dispensed', (await page.locator('.tray-item').count()) === 0);

    /* ================================================================== */
    section('U5. RETURN COINS / CANCEL refunds the balance');
    await page.click('#cancelBtn');
    await page.waitForFunction(() => /REFUND/.test(document.getElementById('statusTitle').textContent), null, { timeout: 8000 });
    check('refund resets the balance to ₹0', (await page.locator('#balanceValue').textContent())?.trim() === '₹0');
    check('refund message shows the amount', /₹10/.test(await page.locator('#statusText').textContent()),
      await page.locator('#statusText').textContent());

    /* ================================================================== */
    section('U6. Rapid repeated clicks create exactly one purchase');
    await page.click('.coin-btn[data-value="2000"]');
    await page.click('.coin-btn[data-value="2000"]');
    for (let i = 0; i < 6; i += 1) {
      await page.click('.select-btn[data-code="A2"]', { force: true, timeout: 5000 }).catch(() => {});
    }
    await page.waitForSelector('.tray-item', { timeout: 15000 });
    await sleep(1500); // give slower clicks a chance to (incorrectly) add more
    check('exactly one drink was dispensed', (await page.locator('.tray-item').count()) === 1,
      `tray items: ${await page.locator('.tray-item').count()}`);
    check('the balance was spent exactly once', (await page.locator('#balanceValue').textContent())?.trim() === '₹0');
    await page.click('#collectBtn');
    await sleep(200);

    /* ================================================================== */
    section('U7. Mobile layout (390 × 844)');
    const mobile = await context.newPage();
    watch(mobile, 'mobile');
    await mobile.setViewportSize({ width: 390, height: 844 });
    await mobile.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await mobile.waitForFunction(() => document.querySelectorAll('.product').length === 12, null, { timeout: 15000 });

    const layout = await mobile.evaluate(() => {
      const grid = document.querySelector('.window__grid');
      const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
      return {
        cols,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        buttonsVisible: [...document.querySelectorAll('.select-btn')].every(
          (b) => b.getBoundingClientRect().width > 0
        ),
        machineWidth: document.querySelector('.machine').getBoundingClientRect().width,
      };
    });
    check('product grid is multi-column on mobile', layout.cols >= 2, `cols=${layout.cols}`);
    check('no horizontal page overflow', layout.overflow <= 1, `overflow=${layout.overflow}px`);
    check('all selection buttons remain visible', layout.buttonsVisible);
    check('the cabinet fits the screen width', layout.machineWidth <= 391, `width=${layout.machineWidth}`);
    await mobile.close();

    /* ================================================================== */
    section('U8. Admin dashboard');
    const admin = await context.newPage();
    watch(admin, 'admin');
    await admin.goto(base + '/admin', { waitUntil: 'domcontentloaded' });
    check('login form is displayed', await admin.locator('#loginForm').isVisible());

    await admin.fill('#username', process.env.ADMIN_USERNAME || 'admin');
    await admin.fill('#password', process.env.ADMIN_PASSWORD || 'admin123');
    await admin.click('#loginBtn');
    await admin.waitForFunction(() => document.querySelectorAll('#productsBody tr').length === 12, null, { timeout: 15000 });
    check('dashboard lists all 12 products', (await admin.locator('#productsBody tr').count()) === 12);

    // Edit a price through the UI and verify it reaches the machine.
    const c4Row = admin.locator('#productsBody tr[data-code="C4"]');
    await c4Row.locator('[data-field="price"]').fill('25');
    await c4Row.locator('[data-action="save"]').click();
    await admin.waitForTimeout(600);

    const updatedPrice = await page.evaluate(() =>
      fetch('/api/machine/products')
        .then((r) => r.json())
        .then((d) => d.products.find((p) => p.code === 'C4').pricePaise)
    );
    check('price edited in the admin panel reaches the machine (₹25)', updatedPrice === 2500, `got ${updatedPrice}`);

    await admin.click('.tab[data-tab="sales"]');
    await admin.waitForTimeout(400);
    check('sales statistics are rendered', (await admin.locator('.stat').count()) >= 6, `${await admin.locator('.stat').count()} stat cards`);

    await admin.click('.tab[data-tab="history"]');
    await admin.waitForTimeout(400);
    check('transaction history shows rows', (await admin.locator('#txnBody tr').count()) >= 3,
      `${await admin.locator('#txnBody tr').count()} rows`);

    await admin.close();

    /* ================================================================== */
    section('U9. No uncaught JavaScript errors');
    check('no page errors or console errors', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  } finally {
    await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
    try {
      await db.close();
    } catch {
      /* ignore */
    }
  }

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

main().catch((err) => {
  console.error('\n  UI test suite crashed:', err);
  deleteDbFiles();
  process.exit(1);
});
