/**
 * Small Express 4 helper.
 *
 * Express 4 does NOT forward rejected promises from async route handlers to the
 * error middleware (Express 5 does). Without this wrapper an `await` that
 * throws would leave the request hanging and emit an unhandled rejection.
 */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
