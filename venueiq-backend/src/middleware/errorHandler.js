/**
 * Global error handler middleware.
 * Catches all unhandled errors from route handlers.
 * In development: includes stack trace. In production: error message only.
 * Handles special cases: JSON parse errors, payload too large.
 */
function errorHandler(err, req, res, _next) {
  // Handle malformed JSON body
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }

  // Handle payload too large
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large (max 50kb)' });
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
