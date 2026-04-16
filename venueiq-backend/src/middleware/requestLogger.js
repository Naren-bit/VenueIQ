/**
 * Request logger middleware.
 * Logs method, path, status code, and response time with color coding.
 * Green for success (< 400), red for errors (>= 400).
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

  next();
}

module.exports = { requestLogger };
