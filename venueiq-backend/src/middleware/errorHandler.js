/**
 * @fileoverview Global error handler middleware for VenueIQ API.
 * Catches all unhandled errors from route handlers and returns
 * structured JSON error responses with appropriate HTTP status codes.
 * @module errorHandler
 */

/**
 * Global error handler middleware.
 * Catches all unhandled errors from route handlers.
 * In development: includes stack trace. In production: error message only.
 * Handles special cases: JSON parse errors, payload too large.
 *
 * @param {Error} err - the error object
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} _next - Express next function (unused but required by Express)
 */
function errorHandler(err, req, res, _next) {
  // Handle malformed JSON body
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }

  // Handle payload too large
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large (max 5mb)' });
  }

  const status = err.status || err.statusCode || 500;
  console.error(`[Error] ${req.method} ${req.path}:`, err.message);

  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  res.status(status).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
}

module.exports = { errorHandler };
