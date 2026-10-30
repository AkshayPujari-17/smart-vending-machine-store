/**
 * Admin dashboard API – protected by signed bearer tokens.
 *
 *   POST   /api/admin/login             { username, password }
 *   GET    /api/admin/me
 *   GET    /api/admin/products
 *   POST   /api/admin/products          add a product
 *   PUT    /api/admin/products/:id      edit name / price / stock / availability
 *   PUT    /api/admin/products/:id/image  upload an image (base64 data URL)
 *   DELETE /api/admin/products/:id
 *   GET    /api/admin/stats
 *   GET    /api/admin/transactions
 *   POST   /api/admin/password          change own password
 *
 * All SQL lives in ../db.js – this file only validates input and formats
 * responses, so it works identically on SQLite and PostgreSQL.
 */
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as store from '../db.js';
import { ROOT_DIR } from '../db.js';
import { asyncHandler } from '../http.js';
import { hashPassword, verifyPassword, signToken, verifyToken, bearerFrom } from '../auth.js';

const PRODUCT_IMG_DIR = path.join(ROOT_DIR, 'public', 'img', 'products');
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB decoded
const MAX_PRICE_PAISE = 100000; // ₹1000
const MAX_STOCK = 9999;

const MIME_TO_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

/* ------------------------- validation helpers ------------------------- */

function badRequest(res, message, extra = {}) {
  return res.status(400).json({ error: 'VALIDATION', message, ...extra });
}

function normaliseCode(value) {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9]{1,6}$/.test(code) ? code : null;
}

function normalisePrice(body) {
  // Accept either `pricePaise` (integer) or `price` (rupees, number/string).
  if (body.pricePaise !== undefined) {
    const paise = Number(body.pricePaise);
    if (!Number.isSafeInteger(paise) || paise < 0 || paise > MAX_PRICE_PAISE) return null;
    return paise;
  }
  if (body.price !== undefined) {
    const rupees = Number(body.price);
    if (!Number.isFinite(rupees) || rupees < 0) return null;
    const paise = Math.round(rupees * 100);
    if (paise > MAX_PRICE_PAISE) return null;
    return paise;
  }
  return undefined; // not provided
}

function normaliseStock(value) {
  const stock = Number(value);
  if (!Number.isSafeInteger(stock) || stock < 0 || stock > MAX_STOCK) return null;
  return stock;
}

function normaliseImage(image) {
  if (typeof image !== 'string') return null;
  const trimmed = image.trim();
  if (trimmed.startsWith('/img/') || trimmed.startsWith('img/')) return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('data:image/')) return trimmed;
  return null;
}

/* --------------------------- auth helpers ----------------------------- */

const loginAttempts = new Map(); // ip -> { count, resetAt }
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 10;

function tooManyAttempts(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry || Date.now() > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: Date.now() + LOGIN_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_LOGIN_ATTEMPTS;
}

/** Create the admin account on first boot (or re-apply ADMIN_PASSWORD). */
async function ensureAdminUser(db) {
  const username = (process.env.ADMIN_USERNAME || 'admin').trim();
  const explicitPassword = process.env.ADMIN_PASSWORD; // undefined unless set in .env / environment

  const existing = await store.findAdminUser(db, username);

  if (!existing) {
    const password = explicitPassword || 'admin123';
    const { hash, salt } = hashPassword(password);
    await store.createAdminUser(db, { username, passwordHash: hash, salt });
    return { username, created: true, password };
  }

  // When ADMIN_PASSWORD is explicitly configured, it is the source of truth:
  // keep the stored hash in sync so changing the .env file actually works.
  if (explicitPassword && !verifyPassword(explicitPassword, existing.salt, existing.password_hash)) {
    const { hash, salt } = hashPassword(explicitPassword);
    await store.updateAdminPassword(db, existing.id, hash, salt);
    return { username, passwordReset: true, password: explicitPassword };
  }

  return { username, created: false };
}

/* ------------------------------ router -------------------------------- */

export async function createAdminRouter(db) {
  const router = Router();
  const admin = await ensureAdminUser(db);
  if (admin.created) {
    console.log(`  Created admin user "${admin.username}" with password "${admin.password}".`);
    console.log('  (Set ADMIN_USERNAME / ADMIN_PASSWORD in the .env file to change it.)');
  } else if (admin.passwordReset) {
    console.log(`  Admin password for "${admin.username}" was updated from the configured ADMIN_PASSWORD.`);
  }

  router.post('/login', asyncHandler(async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (tooManyAttempts(ip)) {
      return res.status(429).json({
        error: 'RATE_LIMITED',
        message: 'Too many login attempts. Please try again in 15 minutes.',
      });
    }

    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    if (!username || !password) {
      return badRequest(res, 'Username and password are required.');
    }

    const row = await store.findAdminUser(db, username);
    if (!row || !verifyPassword(password, row.salt, row.password_hash)) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' });
    }

    const token = signToken({ sub: row.id, username: row.username });
    return res.json({ ok: true, token, username: row.username });
  }));

  // ---- everything below requires a valid token ----
  router.use((req, res, next) => {
    const token = bearerFrom(req);
    const payload = token ? verifyToken(token) : null;
    if (!payload) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Please log in to continue.' });
    }
    req.admin = payload;
    next();
  });

  router.get('/me', (req, res) => res.json({ username: req.admin.username }));

  /* ---------------------------- products ----------------------------- */

  router.get('/products', asyncHandler(async (req, res) => {
    res.json({ products: await store.listProducts(db) });
  }));

  router.post('/products', asyncHandler(async (req, res) => {
    const body = req.body || {};

    const code = normaliseCode(body.code);
    if (!code) return badRequest(res, 'Product code must be 1-6 letters/digits (e.g. A1 or D2).');

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 2 || name.length > 80) return badRequest(res, 'Product name must be 2-80 characters.');

    const pricePaise = normalisePrice(body);
    if (pricePaise === null || pricePaise === undefined)
      return badRequest(res, 'Price must be between ₹0 and ₹1000.');

    const stock = normaliseStock(body.stock ?? 0);
    if (stock === null) return badRequest(res, 'Stock must be a whole number between 0 and 9999.');

    const threshold =
      body.lowStockThreshold === undefined ? store.LOW_STOCK_THRESHOLD_DEFAULT : normaliseStock(body.lowStockThreshold);
    if (threshold === null) return badRequest(res, 'Low-stock threshold must be between 0 and 9999.');

    const image = body.image ? normaliseImage(body.image) : `/img/products/${code.toLowerCase()}.svg`;
    if (body.image && !image) return badRequest(res, 'Image must be a /img/... path, an http(s) URL or a data URL.');

    if (await store.getProductByCode(db, code)) {
      return res.status(409).json({ error: 'DUPLICATE_CODE', message: `Product code ${code} already exists.` });
    }

    const available = body.available === undefined ? true : Boolean(body.available);

    try {
      await store.insertProduct(db, {
        code,
        name,
        pricePaise,
        stock,
        available,
        image,
        lowStockThreshold: threshold,
      });
    } catch (err) {
      console.error('[admin/products]', err);
      return res.status(500).json({ error: 'DB_ERROR', message: 'Could not save the product.' });
    }

    const created = await store.getProductByCode(db, code);
    return res.status(201).json({ ok: true, product: store.toPublicProduct(created) });
  }));

  router.put('/products/:id', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await store.getProductById(db, id);
    if (!existing) return res.status(404).json({ error: 'NOT_FOUND', message: 'Product not found.' });

    const body = req.body || {};
    const fields = {};

    if (body.code !== undefined) {
      const code = normaliseCode(body.code);
      if (!code) return badRequest(res, 'Product code must be 1-6 letters/digits.');
      const clash = await store.getProductByCode(db, code);
      if (clash && clash.id !== id)
        return res.status(409).json({ error: 'DUPLICATE_CODE', message: `Product code ${code} already exists.` });
      fields.code = code;
    }

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (name.length < 2 || name.length > 80) return badRequest(res, 'Product name must be 2-80 characters.');
      fields.name = name;
    }

    if (body.pricePaise !== undefined || body.price !== undefined) {
      const pricePaise = normalisePrice(body);
      if (pricePaise === null || pricePaise === undefined)
        return badRequest(res, 'Price must be between ₹0 and ₹1000.');
      fields.pricePaise = pricePaise;
    }

    if (body.stock !== undefined) {
      const stock = normaliseStock(body.stock);
      if (stock === null) return badRequest(res, 'Stock must be a whole number between 0 and 9999.');
      fields.stock = stock;
    }

    if (body.lowStockThreshold !== undefined) {
      const threshold = normaliseStock(body.lowStockThreshold);
      if (threshold === null) return badRequest(res, 'Low-stock threshold must be between 0 and 9999.');
      fields.lowStockThreshold = threshold;
    }

    if (body.available !== undefined) {
      fields.available = Boolean(body.available);
    }

    if (body.image !== undefined) {
      const image = normaliseImage(body.image);
      if (!image) return badRequest(res, 'Image must be a /img/... path, an http(s) URL or a data URL.');
      fields.image = image;
    }

    if (!Object.keys(fields).length) return badRequest(res, 'Nothing to update.');

    try {
      await store.updateProduct(db, id, fields);
    } catch (err) {
      console.error('[admin/products/put]', err);
      return res.status(500).json({ error: 'DB_ERROR', message: 'Could not update the product.' });
    }

    const updated = await store.getProductById(db, id);
    return res.json({ ok: true, product: store.toPublicProduct(updated) });
  }));

  /** Upload / update a product image (base64 data URL from the browser). */
  router.put('/products/:id/image', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await store.getProductById(db, id);
    if (!existing) return res.status(404).json({ error: 'NOT_FOUND', message: 'Product not found.' });

    const { dataUrl, image } = req.body || {};

    // Allow simply pointing at an existing path/URL as well.
    if (!dataUrl && image) {
      const normalised = normaliseImage(image);
      if (!normalised) return badRequest(res, 'Invalid image path or URL.');
      await store.updateProduct(db, id, { image: normalised });
      return res.json({ ok: true, image: normalised });
    }

    if (typeof dataUrl !== 'string') {
      return badRequest(res, 'Provide "dataUrl" (base64 image) or "image" (path/URL).');
    }

    const match = dataUrl.match(/^data:([a-z0-9/+.-]+);base64,(.+)$/i);
    if (!match) return badRequest(res, 'Invalid base64 data URL.');
    const mime = match[1].toLowerCase();
    const ext = MIME_TO_EXT[mime];
    if (!ext) return badRequest(res, 'Unsupported image type. Use PNG, JPEG, WEBP, GIF or SVG.');

    let buffer;
    try {
      buffer = Buffer.from(match[2], 'base64');
    } catch {
      return badRequest(res, 'Invalid base64 image data.');
    }
    if (!buffer.length) return badRequest(res, 'Empty image.');
    if (buffer.length > MAX_IMAGE_BYTES) return badRequest(res, 'Image too large (max 2 MB).');

    try {
      fs.mkdirSync(PRODUCT_IMG_DIR, { recursive: true });
      const filename = `${existing.code.toLowerCase()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
      fs.writeFileSync(path.join(PRODUCT_IMG_DIR, filename), buffer);
      const imageUrl = `/img/products/${filename}`;
      await store.updateProduct(db, id, { image: imageUrl });
      return res.json({ ok: true, image: imageUrl });
    } catch (err) {
      console.error('[admin/image]', err);
      return res.status(500).json({ error: 'UPLOAD_FAILED', message: 'Could not store the image.' });
    }
  }));

  router.delete('/products/:id', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await store.getProductById(db, id);
    if (!existing) return res.status(404).json({ error: 'NOT_FOUND', message: 'Product not found.' });

    try {
      await store.deleteProduct(db, id);
      // Clean up a locally generated image file (never delete remote URLs).
      if (existing.image && existing.image.startsWith('/img/products/')) {
        const file = path.join(PRODUCT_IMG_DIR, path.basename(existing.image));
        if (file.startsWith(PRODUCT_IMG_DIR) && fs.existsSync(file)) fs.unlinkSync(file);
      }
    } catch (err) {
      console.error('[admin/products/delete]', err);
      return res.status(500).json({ error: 'DB_ERROR', message: 'Could not delete the product.' });
    }
    return res.json({ ok: true, message: `Product ${existing.code} deleted.` });
  }));

  /* ------------------------ stats & history -------------------------- */

  router.get('/stats', asyncHandler(async (req, res) => {
    res.json(await store.getStats(db));
  }));

  router.get('/transactions', asyncHandler(async (req, res) => {
    res.json(await store.listTransactions(db, { limit: req.query.limit, offset: req.query.offset }));
  }));

  /* -------------------------- password ------------------------------- */

  router.post('/password', asyncHandler(async (req, res) => {
    const current = String(req.body?.currentPassword || '');
    const next = String(req.body?.newPassword || '');
    if (next.length < 6) return badRequest(res, 'New password must be at least 6 characters.');

    const row = await store.findAdminUser(db, req.admin.username);
    if (!row || !verifyPassword(current, row.salt, row.password_hash)) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Current password is incorrect.' });
    }

    const { hash, salt } = hashPassword(next);
    await store.updateAdminPassword(db, row.id, hash, salt);
    return res.json({ ok: true, message: 'Password updated.' });
  }));

  return router;
}
