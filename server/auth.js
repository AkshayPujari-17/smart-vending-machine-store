/**
 * Admin authentication utilities.
 *
 * - Passwords are hashed with scrypt + a per-user random salt (never stored in
 *   clear text and never sent to the frontend).
 * - Access tokens are HMAC-SHA256 signed JWT-style tokens with an expiry.
 *   The signing secret comes from the SESSION_SECRET environment variable and
 *   falls back to a random per-process secret (tokens then expire on restart).
 */
import crypto from 'node:crypto';

const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = Number(process.env.ADMIN_TOKEN_TTL_MS) || 8 * 60 * 60 * 1000; // 8 hours

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/** Hash a password with scrypt. Returns { hash, salt } (hex strings). */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { hash, salt };
}

/** Constant-time password verification. */
export function verifyPassword(password, salt, expectedHash) {
  try {
    const actual = crypto.scryptSync(String(password), salt, 64);
    const expected = Buffer.from(expectedHash, 'hex');
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Create a signed, expiring token for the given payload. */
export function signToken(payload = {}) {
  const body = b64url(
    JSON.stringify({ ...payload, iat: Date.now(), exp: Date.now() + TOKEN_TTL_MS })
  );
  const signature = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${signature}`;
}

/** Verify a token. Returns the payload or null when invalid/expired. */
export function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Extract a bearer token from the Authorization header. */
export function bearerFrom(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}
