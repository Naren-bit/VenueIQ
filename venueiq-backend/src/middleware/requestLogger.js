/**
 * @fileoverview Request logger middleware for VenueIQ API.
 * Logs method, path, status code, and response time with color coding.
 * Also sets the X-Response-Time header for performance monitoring.
 * @module requestLogger
 */

/**
 * Request logger middleware.
 * Logs every HTTP request with colored status codes and response time.
 * Green for success (< 400), red for errors (>= 400).
 * Sets X-Response-Time header on every response for client-side monitoring.
 *
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next function
 */
function requestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const ms = Date.now() - start;
    const isError = res.statusCode >= 400;
    const color = isError ? '\x1b[31m' : '\x1b[32m';
    const reset = '\x1b[0m';

    console.log(
      `${color}[${res.statusCode}]${reset} ${req.method} ${req.path} — ${ms}ms`
    );
  });

  // Set response time header before response is sent
  const originalEnd = res.end;
  res.end = function(...args) {
    const ms = Date.now() - start;
    if (!res.headersSent) {
      res.setHeader('X-Response-Time', `${ms}ms`);
    }
    originalEnd.apply(res, args);
  };

  next();
}

module.exports = { requestLogger };
