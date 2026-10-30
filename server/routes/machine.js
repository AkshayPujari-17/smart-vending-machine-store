/**
 * Customer-facing machine API.
 *
 * The browser never decides money values: the inserted balance lives in the
 * server side session, prices are re-read from the database inside the same
 * transaction that decrements the stock.
 *
 *   GET    /api/machine/state     -> balance, tray, machine info
 *   GET    /api/machine/products  -> product grid
 *   POST   /api/machine/insert    -> { value: paise }
 *   POST   /api/machine/purchase  -> { code: "A1" }
 *   POST   /api/machine/collect   -> collect products + change, reset session
 *   POST   /api/machine/cancel    -> refund the unspent balance
 */
import { Router } from 'express';
import * as store from '../db.js';
import { asyncHandler } from '../http.js';
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  DISPENSE_LOCK_MS,
  createSession,
  getSession,
  isBusy,
} from '../sessions.js';
import {
  ACCEPTED_DENOMINATIONS_PAISE,
  changeBreakdown,
  describeBreakdown,
  formatRupees,
} from '../money.js';

const MACHINE_INFO = {
  name: 'Smart Vending Machine Store',
  currency: 'INR',
  instructions: [
    '1. Insert coins.',
    '2. Select your drink.',
    '3. Collect your product and change.',
  ],
  denominations: ACCEPTED_DENOMINATIONS_PAISE,
  note: 'This is a software simulation. No real coins or cash are accepted.',
};

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

function trayItem(product, txnId) {
  return {
    code: product.code,
    name: product.name,
    image: product.image,
    pricePaise: product.pricePaise,
    txnId,
    addedAt: new Date().toISOString(),
  };
}

export function createMachineRouter(db) {
  const router = Router();

  // Every machine request gets a session (cookie based).
  router.use((req, res, next) => {
    const token = readCookie(req, SESSION_COOKIE);
    let session = getSession(token);
    if (!session) {
      session = createSession();
      res.cookie(SESSION_COOKIE, session.token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_TTL_MS,
      });
    }
    req.session = session;
    next();
  });

  router.get('/info', (req, res) => {
    res.json(MACHINE_INFO);
  });

  router.get('/state', (req, res) => {
    const s = req.session;
    res.json({
      balancePaise: s.balancePaise,
      balance: formatRupees(s.balancePaise),
      tray: s.tray,
      trayTotalPaise: s.tray.reduce((sum, item) => sum + item.pricePaise, 0),
      busy: isBusy(s),
      instructions: MACHINE_INFO.instructions,
    });
  });

  router.get(
    '/products',
    asyncHandler(async (req, res) => {
      res.json({ products: await store.listProducts(db), denominations: ACCEPTED_DENOMINATIONS_PAISE });
    })
  );

  /* ---------------------------------------------------------------- */
  /*  Coin insertion                                                   */
  /* ---------------------------------------------------------------- */
  router.post('/insert', (req, res) => {
    const s = req.session;
    const value = Number(req.body?.value);

    if (!ACCEPTED_DENOMINATIONS_PAISE.includes(value)) {
      return res.status(400).json({
        error: 'INVALID_DENOMINATION',
        message: 'Please use one of the accepted denominations: ₹1, ₹2, ₹5, ₹10, ₹20 or ₹50.',
      });
    }

    s.balancePaise += value;
    return res.json({
      ok: true,
      insertedPaise: value,
      inserted: formatRupees(value),
      balancePaise: s.balancePaise,
      balance: formatRupees(s.balancePaise),
      message: `Coin accepted. Inserted amount: ${formatRupees(s.balancePaise)}`,
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Product selection & purchase                                     */
  /* ---------------------------------------------------------------- */
  router.post(
    '/purchase',
    asyncHandler(async (req, res) => {
      const s = req.session;

      if (isBusy(s)) {
        return res.status(423).json({
          error: 'BUSY',
          message: 'Machine is busy dispensing your drink. Please wait a moment.',
        });
      }

      const code = req.body?.code;
      s.lock = true;
      try {
        const result = await store.completePurchase(db, code, s.balancePaise);

        if (!result.ok) {
          return res.status(result.httpStatus).json({
            error: result.code,
            message: result.message,
            requiredPaise: result.requiredPaise,
            required: result.requiredPaise ? formatRupees(result.requiredPaise) : undefined,
            product: result.product,
          });
        }

        // Success: deduct the price from the server-side balance and park the
        // product in the virtual collection tray.
        s.balancePaise = result.balanceAfter;
        s.tray.push(trayItem(result.product, result.txnId));
        s.lockUntil = Date.now() + DISPENSE_LOCK_MS;

        return res.json({
          ok: true,
          txnId: result.txnId,
          product: result.product,
          pricePaise: result.pricePaise,
          price: formatRupees(result.pricePaise),
          balancePaise: s.balancePaise,
          balance: formatRupees(s.balancePaise),
          changePaise: result.changePaise,
          change: formatRupees(result.changePaise),
          changeBreakdown: result.breakdown,
          tray: s.tray,
          message: `Dispensing ${result.product.name}. Please collect your drink!`,
        });
      } catch (err) {
        console.error('[machine/purchase]', err);
        return res.status(500).json({
          error: 'SERVER_ERROR',
          message: 'The machine could not complete the purchase. Your balance was not changed.',
        });
      } finally {
        s.lock = false;
      }
    })
  );

  /* ---------------------------------------------------------------- */
  /*  Finish transaction – collect products and change                 */
  /* ---------------------------------------------------------------- */
  router.post('/collect', (req, res) => {
    const s = req.session;

    // Only block while a purchase request is literally being processed –
    // the short post-dispense lock applies to new purchases only.
    if (s.lock) {
      return res.status(423).json({
        error: 'BUSY',
        message: 'Machine is busy dispensing. Please wait a moment.',
      });
    }

    const changePaise = s.balancePaise;
    const collected = s.tray;
    const breakdown = changeBreakdown(changePaise);
    s.balancePaise = 0;
    s.tray = [];

    return res.json({
      ok: true,
      changePaise,
      change: formatRupees(changePaise),
      changeBreakdown: breakdown,
      changeSummary: describeBreakdown(breakdown),
      collected,
      balancePaise: 0,
      balance: formatRupees(0),
      message: collected.length
        ? `Thank you! ${collected.length} item(s) collected. Please take your change of ${formatRupees(changePaise)}.`
        : `Please take your change of ${formatRupees(changePaise)}.`,
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Cancel / refund                                                  */
  /* ---------------------------------------------------------------- */
  router.post(
    '/cancel',
    asyncHandler(async (req, res) => {
      const s = req.session;

      if (s.lock) {
        return res.status(423).json({
          error: 'BUSY',
          message: 'Machine is busy dispensing. Please wait a moment.',
        });
      }

      const refundPaise = s.balancePaise;
      const tray = s.tray;

      if (refundPaise > 0) {
        try {
          await store.recordRefund(db, refundPaise);
        } catch (err) {
          console.error('[machine/cancel] could not record refund:', err.message);
        }
        s.balancePaise = 0;
      }

      const breakdown = changeBreakdown(refundPaise);

      return res.json({
        ok: true,
        refundPaise,
        refund: formatRupees(refundPaise),
        refundBreakdown: breakdown,
        refundSummary: describeBreakdown(breakdown),
        balancePaise: s.balancePaise,
        balance: formatRupees(s.balancePaise),
        tray,
        message:
          refundPaise > 0
            ? `Transaction cancelled. Refund of ${formatRupees(refundPaise)} returned (${describeBreakdown(breakdown)}).`
            : 'Transaction cancelled. Nothing to refund.',
      });
    })
  );

  return router;
}
