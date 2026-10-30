/**
 * Money utilities.
 *
 * ALL money inside the application is stored and calculated as INTEGER PAISE
 * (₹1 = 100 paise). This guarantees that no floating point rounding errors can
 * ever occur while adding balances, deducting prices or returning change.
 */

/** Coin/note denominations the machine can return as change (in paise). */
export const CHANGE_DENOMINATIONS_PAISE = [5000, 2000, 1000, 500, 200, 100];

/** Denominations the customer is allowed to insert (in paise): ₹1, ₹2, ₹5, ₹10, ₹20, ₹50 */
export const ACCEPTED_DENOMINATIONS_PAISE = [100, 200, 500, 1000, 2000, 5000];

/** Convert paise to rupees (number). */
export function toRupees(paise) {
  return paise / 100;
}

/** Format paise as an Indian rupee string, e.g. 12500 -> "₹125" */
export function formatRupees(paise) {
  const rupees = toRupees(paise);
  const isWhole = Number.isInteger(rupees);
  const value = isWhole
    ? rupees.toLocaleString('en-IN')
    : rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `₹${value}`;
}

/** True when the value is a safe, non-negative integer amount of paise. */
export function isValidPaise(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * Break an amount of paise into the available denominations (greedy algorithm).
 * Works because the Indian denomination set used here is canonical.
 *
 * @param {number} paise total amount
 * @returns {Array<{ paise: number, rupees: number, count: number }>}
 */
export function changeBreakdown(paise) {
  if (!isValidPaise(paise) || paise <= 0) return [];
  let remaining = paise;
  const parts = [];
  for (const denom of CHANGE_DENOMINATIONS_PAISE) {
    const count = Math.floor(remaining / denom);
    if (count > 0) {
      parts.push({ paise: denom, rupees: toRupees(denom), count });
      remaining -= count * denom;
    }
  }
  return parts;
}

/** Human readable change summary, e.g. "₹10 + ₹5" */
export function describeBreakdown(parts) {
  if (!parts.length) return '₹0';
  return parts.map((p) => `₹${p.rupees}${p.count > 1 ? ` × ${p.count}` : ''}`).join(' + ');
}
