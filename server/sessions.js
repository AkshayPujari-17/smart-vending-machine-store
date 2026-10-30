/**
 * In-memory vending machine sessions.
 *
 * A session represents one customer standing at the machine:
 *   - how much money they have inserted (integer paise)
 *   - which products are waiting in the collection tray
 *   - a lock so the same purchase can never be triggered twice while the
 *     dispensing animation is running
 *
 * The balance is validated and deducted on the server – the browser is never
 * trusted with money values.
 */
import crypto from 'node:crypto';

export const SESSION_COOKIE = 'vm_session';
export const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS) || 60 * 60 * 1000; // 1 hour
/** How long the machine refuses new purchases after dispensing (duplicate-click guard). */
export const DISPENSE_LOCK_MS = Number(process.env.DISPENSE_LOCK_MS) || 1200;

const sessions = new Map();

export function createSession() {
  const token = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  const session = {
    token,
    balancePaise: 0,
    tray: [], // products already paid for, waiting to be collected
    lock: false, // true while a request is being processed
    lockUntil: 0, // timestamp until which purchases are refused (dispensing)
    createdAt: now,
    lastSeen: now,
  };
  sessions.set(token, session);
  return session;
}

export function getSession(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() - session.lastSeen > SESSION_TTL_MS) {
    sessions.delete(token);
    return null;
  }
  session.lastSeen = Date.now();
  return session;
}

/** Get or create a session for a request token. */
export function ensureSession(token) {
  return getSession(token) || createSession();
}

export function destroySession(token) {
  return sessions.delete(token);
}

/** True when the machine is busy (request in flight or dispensing lock active). */
export function isBusy(session) {
  return Boolean(session) && (session.lock || Date.now() < session.lockUntil);
}

/** Housekeeping – removes sessions that have been idle for a long time. */
function cleanup() {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (now - session.lastSeen > SESSION_TTL_MS) sessions.delete(token);
  }
}

const timer = setInterval(cleanup, 5 * 60 * 1000);
if (typeof timer.unref === 'function') timer.unref();

export function sessionCount() {
  return sessions.size;
}
